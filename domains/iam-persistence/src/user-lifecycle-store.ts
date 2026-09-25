import type { IamApplicationUser, IamPersistenceClient } from '@vertex-os/database/iam';
import {
  SYSTEM_ADMINISTRATOR_ROLE_CODE,
  type RoleId,
  type UserId,
  type UserLifecycleStore,
} from '@vertex-os/iam/persistence';
import { mapUser, userSelect } from './application-user-repository.js';
import { accessToDatabase, identitySyncToDatabase, invitationToDatabase } from './enum-mapping.js';

/**
 * The user writes that decide access, on one IAM transaction client (IAM-R06 D-03 to D-08,
 * D-11). IAM decides under the locks this store takes; writes under a lock throw when a row count
 * differs, which only a broken lock assumption can cause.
 */
export function createUserLifecycleStore(client: IamPersistenceClient): UserLifecycleStore {
  function single(rows: readonly Omit<IamApplicationUser, 'passwordHash'>[], what: string) {
    const row = rows[0];
    if (rows.length !== 1 || row === undefined) {
      throw new Error(`A locked user changed before ${what}.`);
    }
    return mapUser(row);
  }

  return {
    async lockSystemAdministratorRole() {
      const rows = await client.$queryRaw<{ id: string }[]>`
        SELECT id::text FROM iam_role
        WHERE code = ${SYSTEM_ADMINISTRATOR_ROLE_CODE} AND is_system
        FOR UPDATE`;
      const row = rows[0];
      return row === undefined ? undefined : (row.id as RoleId);
    },

    async lockUser(id) {
      const locked = await client.$queryRaw<{ id: string }[]>`
        SELECT id::text FROM iam_application_user WHERE id = ${id}::uuid FOR UPDATE`;
      if (locked.length === 0) return undefined;
      const row = await client.iamApplicationUser.findUnique({ where: { id }, select: userSelect });
      if (row === null) throw new Error('A locked user disappeared.');
      return mapUser(row);
    },

    async emailInUse(email) {
      const row = await client.iamApplicationUser.findUnique({
        where: { email },
        select: { id: true },
      });
      return row !== null;
    },

    async insertUser({ email, displayName, passwordHash }) {
      const now = new Date();
      // ON CONFLICT DO NOTHING turns an existing or concurrently inserted email into
      // `email-taken` without aborting the transaction and its Audit append.
      const rows = await client.iamApplicationUser.createManyAndReturn({
        data: [
          {
            email,
            displayName,
            passwordHash: passwordHash ?? null,
            accessState: accessToDatabase.INVITED,
            identitySyncState: identitySyncToDatabase.PENDING,
            invitationDeliveryState: invitationToDatabase.NOT_SENT,
            lastAccessStateChangedAt: now,
            createdAt: now,
            updatedAt: now,
          },
        ],
        skipDuplicates: true,
        select: userSelect,
      });
      const row = rows[0];
      return row === undefined
        ? { outcome: 'email-taken' }
        : { outcome: 'created', user: mapUser(row) };
    },

    async writeAccessRestriction({ id, expectedVersion, accessState }) {
      const now = new Date();
      const rows = await client.iamApplicationUser.updateManyAndReturn({
        where: { id, version: expectedVersion },
        data: {
          accessState: accessToDatabase[accessState],
          identitySyncState: identitySyncToDatabase.PENDING,
          lastAccessStateChangedAt: now,
          version: { increment: 1 },
          updatedAt: now,
        },
        select: userSelect,
      });
      return single(rows, 'its access change');
    },

    async completeReactivation({ id, expectedVersion, accessState }) {
      const now = new Date();
      const rows = await client.iamApplicationUser.updateManyAndReturn({
        where: {
          id,
          version: expectedVersion,
          accessState: { in: [accessToDatabase.SUSPENDED, accessToDatabase.DISABLED] },
        },
        data: {
          accessState: accessToDatabase[accessState],
          identitySyncState: identitySyncToDatabase.SYNCED,
          lastAccessStateChangedAt: now,
          version: { increment: 1 },
          updatedAt: now,
        },
        select: userSelect,
      });
      const row = rows[0];
      if (row) return { outcome: 'updated', user: mapUser(row) };
      const existing = await client.iamApplicationUser.findUnique({
        where: { id },
        select: { id: true },
      });
      return existing === null ? { outcome: 'not-found' } : { outcome: 'version-conflict' };
    },

    async writeDisplayName({ id, expectedVersion, displayName }) {
      const rows = await client.iamApplicationUser.updateManyAndReturn({
        where: { id, version: expectedVersion },
        data: { displayName, version: { increment: 1 }, updatedAt: new Date() },
        select: userSelect,
      });
      return single(rows, 'its display-name change');
    },

    async initializePasswordHash({ id, expectedVersion, passwordHash }) {
      const rows = await client.iamApplicationUser.updateManyAndReturn({
        where: { id, version: expectedVersion, passwordHash: null },
        data: { passwordHash, version: { increment: 1 }, updatedAt: new Date() },
        select: userSelect,
      });
      const row = rows[0];
      return row === undefined ? undefined : mapUser(row);
    },

    async readRoleHolders(roleId: RoleId) {
      const rows = await client.iamUserRoleAssignment.findMany({
        where: { roleId, user: { accessState: { not: accessToDatabase.TERMINATED } } },
        select: { userId: true },
        orderBy: { userId: 'asc' },
      });
      return rows.map((row) => row.userId as UserId);
    },
  };
}
