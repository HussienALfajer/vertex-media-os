import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { AuditRecorder } from '@vertex-os/audit';
import type {
  DisplayName,
  IamTransactionRunner,
  NormalizedEmail,
  RoleId,
  UserId,
} from '@vertex-os/iam/persistence';
import { createApplicationUserRepository, createIamTransactionRunner } from './index.js';
import { startMigratedPostgres, type MigratedPostgres } from '../test-support/postgres.js';
import { seedInvitedUser } from '../test-support/users.js';

const missingId = '00000000-0000-4000-8000-000000000099' as UserId;
const email = (value: string) => value as NormalizedEmail;
const name = (value: string) => value as DisplayName;

/**
 * The user lifecycle store and the grant-ceiling reads of the role store against real PostgreSQL
 * (IAM-R06 D-03). The use cases' ordering and concurrency run in the API suites.
 */
describe('UserLifecycleStore against real PostgreSQL', () => {
  let postgres: MigratedPostgres;
  let runner: IamTransactionRunner;
  const recorder: AuditRecorder = { append: async () => undefined };

  beforeAll(async () => {
    postgres = await startMigratedPostgres();
    runner = createIamTransactionRunner(postgres.database, { auditRecorderFor: () => recorder });
  }, 180_000);
  afterAll(async () => {
    await postgres?.stop();
  });
  beforeEach(async () => {
    await postgres.client.$executeRawUnsafe(
      'TRUNCATE iam_application_user, iam_department, iam_role, iam_permission CASCADE',
    );
  });

  async function row(id: UserId) {
    return postgres.client.iamApplicationUser.findUniqueOrThrow({ where: { id } });
  }

  async function systemRole(): Promise<RoleId> {
    const role = await postgres.client.iamRole.create({
      data: {
        code: 'system-administrator',
        name: 'System Administrator',
        state: 'ACTIVE',
        isSystem: true,
      },
      select: { id: true },
    });
    return role.id as RoleId;
  }

  async function setState(id: UserId, state: string) {
    await postgres.client.$executeRawUnsafe(
      `UPDATE iam_application_user SET access_state = '${state}',
         first_activated_at = CASE WHEN '${state}' = 'INVITED' THEN NULL ELSE now() END,
         identity_issuer = 'http://127.0.0.1:1/realms/vertex', identity_subject = id::text,
         version = version + 1 WHERE id = '${id}'`,
    );
  }

  it('inserts an INVITED user with the initial states at version 1', async () => {
    const created = await runner.run(({ lifecycle }) =>
      lifecycle.insertUser({ email: email('new@example.invalid'), displayName: name('New User') }),
    );

    if (created.outcome !== 'created') throw new Error('expected created');
    expect(created.user).toMatchObject({
      email: 'new@example.invalid',
      displayName: 'New User',
      accessState: 'INVITED',
      identity: undefined,
      identitySyncState: 'PENDING',
      invitationDeliveryState: 'NOT_SENT',
      invitationSentAt: undefined,
      firstActivatedAt: undefined,
      version: 1,
    });
    expect(created.user.createdAt).toEqual(created.user.lastAccessStateChangedAt);
    expect(
      await createApplicationUserRepository(postgres.database).findById(created.user.id),
    ).toEqual(created.user);
  });

  it('answers an existing email as email-taken and keeps the transaction usable', async () => {
    await seedInvitedUser(postgres.client, 'taken@example.invalid');

    const result = await runner.run(async ({ lifecycle }) => {
      const inserted = await lifecycle.insertUser({
        email: email('taken@example.invalid'),
        displayName: name('Second'),
      });
      // A later statement in the same transaction still runs.
      return { inserted, inUse: await lifecycle.emailInUse(email('taken@example.invalid')) };
    });

    expect(result).toEqual({ inserted: { outcome: 'email-taken' }, inUse: true });
    expect(await postgres.client.iamApplicationUser.count()).toBe(1);
  });

  it('lets exactly one of several concurrent inserts of one email create a user', async () => {
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        runner.run(({ lifecycle }) =>
          lifecycle.insertUser({ email: email('race@example.invalid'), displayName: name('Race') }),
        ),
      ),
    );

    expect(results.filter((result) => result.outcome === 'created')).toHaveLength(1);
    expect(results.filter((result) => result.outcome === 'email-taken')).toHaveLength(4);
  });

  it('writes an access restriction with PENDING, the change time and the next version', async () => {
    const user = await seedInvitedUser(postgres.client, 'restrict@example.invalid');
    await postgres.client.$executeRaw`UPDATE iam_application_user
      SET last_access_state_changed_at = now() - interval '1 day',
          identity_sync_state = 'SYNCED' WHERE id = ${user.id}::uuid`;
    const before = await row(user.id);

    const restricted = await runner.run(async ({ lifecycle }) => {
      const locked = await lifecycle.lockUser(user.id);
      if (!locked) throw new Error('missing');
      return lifecycle.writeAccessRestriction({
        id: user.id,
        expectedVersion: locked.version,
        accessState: 'TERMINATED',
      });
    });

    expect(restricted).toMatchObject({
      accessState: 'TERMINATED',
      identitySyncState: 'PENDING',
      version: 2,
    });
    const after = await row(user.id);
    expect(after.lastAccessStateChangedAt.getTime()).toBeGreaterThan(
      before.lastAccessStateChangedAt.getTime(),
    );
    expect({ ...after, accessState: before.accessState }).toMatchObject({
      email: before.email,
      displayName: before.displayName,
      firstActivatedAt: before.firstActivatedAt,
      identitySubject: before.identitySubject,
      invitationDeliveryState: before.invitationDeliveryState,
    });
  });

  it('throws when a write under a lock misses its row', async () => {
    const user = await seedInvitedUser(postgres.client, 'miss@example.invalid');
    await expect(
      runner.run(({ lifecycle }) =>
        lifecycle.writeAccessRestriction({
          id: user.id,
          expectedVersion: 9,
          accessState: 'SUSPENDED',
        }),
      ),
    ).rejects.toThrow('A locked user changed before its access change.');
    await expect(
      runner.run(({ lifecycle }) =>
        lifecycle.writeDisplayName({ id: user.id, expectedVersion: 9, displayName: name('X') }),
      ),
    ).rejects.toThrow('A locked user changed before its display-name change.');
    expect((await row(user.id)).version).toBe(1);
  });

  it('completes a reactivation only from SUSPENDED or DISABLED at the expected version', async () => {
    const user = await seedInvitedUser(postgres.client, 'reactivate@example.invalid');
    await setState(user.id, 'SUSPENDED');

    const stale = await runner.run(({ lifecycle }) =>
      lifecycle.completeReactivation({ id: user.id, expectedVersion: 1, accessState: 'ACTIVE' }),
    );
    expect(stale).toEqual({ outcome: 'version-conflict' });
    expect(
      await runner.run(({ lifecycle }) =>
        lifecycle.completeReactivation({
          id: missingId,
          expectedVersion: 1,
          accessState: 'ACTIVE',
        }),
      ),
    ).toEqual({ outcome: 'not-found' });

    const done = await runner.run(({ lifecycle }) =>
      lifecycle.completeReactivation({ id: user.id, expectedVersion: 2, accessState: 'ACTIVE' }),
    );
    expect(done).toMatchObject({
      outcome: 'updated',
      user: { accessState: 'ACTIVE', identitySyncState: 'SYNCED', version: 3 },
    });
    // ACTIVE is not a reactivation source, whatever the version.
    expect(
      await runner.run(({ lifecycle }) =>
        lifecycle.completeReactivation({ id: user.id, expectedVersion: 3, accessState: 'ACTIVE' }),
      ),
    ).toEqual({ outcome: 'version-conflict' });
  });

  it('changes only the display name, the version and the update time', async () => {
    const user = await seedInvitedUser(postgres.client, 'rename@example.invalid');
    await postgres.client.$executeRaw`UPDATE iam_application_user
      SET updated_at = updated_at - interval '1 day' WHERE id = ${user.id}::uuid`;
    const before = await row(user.id);

    await runner.run(async ({ lifecycle }) => {
      await lifecycle.lockUser(user.id);
      return lifecycle.writeDisplayName({
        id: user.id,
        expectedVersion: 1,
        displayName: name('Renamed'),
      });
    });

    const after = await row(user.id);
    expect(after.displayName).toBe('Renamed');
    expect(after.version).toBe(2);
    expect(after.updatedAt.getTime()).toBeGreaterThan(before.updatedAt.getTime());
    expect({ ...after, displayName: 'x', version: 0, updatedAt: 0 }).toEqual({
      ...before,
      displayName: 'x',
      version: 0,
      updatedAt: 0,
    });
  });

  it('finds the System Administrator role row only once it exists, and its live holders', async () => {
    expect(await runner.run(({ lifecycle }) => lifecycle.lockSystemAdministratorRole())).toBe(
      undefined,
    );
    const roleId = await systemRole();
    const users = await Promise.all(
      ['a', 'b', 'c'].map((label) => seedInvitedUser(postgres.client, `${label}@example.invalid`)),
    );
    for (const user of users) {
      await postgres.client.iamUserRoleAssignment.create({ data: { userId: user.id, roleId } });
    }
    const [first, second, third] = users;
    if (!first || !second || !third) throw new Error('seed');
    await setState(third.id, 'TERMINATED');

    const result = await runner.run(async ({ lifecycle }) => ({
      locked: await lifecycle.lockSystemAdministratorRole(),
      holders: await lifecycle.readRoleHolders(roleId),
    }));

    expect(result).toEqual({
      locked: roleId,
      holders: [first.id, second.id].sort(),
    });
  });

  it('reads an actor authority and the ACTIVE codes a role maps', async () => {
    const roleId = await systemRole();
    const custom = await postgres.client.iamRole.create({
      data: { code: 'editor', name: 'Editor', state: 'ACTIVE', isSystem: false },
      select: { id: true },
    });
    for (const [code, state] of [
      ['iam.users.read', 'ACTIVE'],
      ['iam.users.create', 'DEPRECATED'],
    ] as const) {
      await postgres.client.iamPermission.create({
        data: {
          code,
          owningModule: 'iam',
          name: code,
          description: code,
          state,
          sensitivity: 'STANDARD',
        },
      });
      await postgres.client.iamRolePermission.create({
        data: { roleId: custom.id, permissionCode: code },
      });
    }
    const actor = await seedInvitedUser(postgres.client, 'actor@example.invalid');
    await postgres.client.iamUserRoleAssignment.create({
      data: { userId: actor.id, roleId: custom.id },
    });

    const read = await runner.run(async ({ roles }) => ({
      codes: await roles.readActivePermissionCodes(custom.id as RoleId),
      authority: await roles.readActorAuthority(actor.id),
      missing: await roles.readActorAuthority(missingId),
    }));

    expect(read.codes).toEqual(['iam.users.read']);
    expect(read.authority).toEqual({
      facts: {
        accessState: 'INVITED',
        memberships: [],
        grants: expect.arrayContaining([
          { roleState: 'ACTIVE', permissionCode: 'iam.users.read', permissionState: 'ACTIVE' },
          {
            roleState: 'ACTIVE',
            permissionCode: 'iam.users.create',
            permissionState: 'DEPRECATED',
          },
        ]),
      },
      holdsSystemAdministratorRole: false,
    });
    expect(read.missing).toEqual({ facts: undefined, holdsSystemAdministratorRole: false });

    await postgres.client.iamUserRoleAssignment.create({ data: { userId: actor.id, roleId } });
    expect(
      (await runner.run(({ roles }) => roles.readActorAuthority(actor.id)))
        .holdsSystemAdministratorRole,
    ).toBe(true);
  });

  it('reads the grant of a user: ACTIVE codes of ACTIVE roles only, and the system role', async () => {
    const systemRoleId = await systemRole();
    const permission = (code: string, state: 'ACTIVE' | 'DEPRECATED') =>
      postgres.client.iamPermission.create({
        data: {
          code,
          owningModule: 'iam',
          name: code,
          description: code,
          state,
          sensitivity: 'STANDARD',
        },
      });
    await permission('iam.users.read', 'ACTIVE');
    await permission('iam.users.create', 'DEPRECATED');
    await permission('iam.roles.read', 'ACTIVE');
    const role = async (code: string, state: 'ACTIVE' | 'INACTIVE', codes: string[]) => {
      const created = await postgres.client.iamRole.create({
        data: { code, name: code, state, isSystem: false },
        select: { id: true },
      });
      for (const permissionCode of codes) {
        await postgres.client.iamRolePermission.create({
          data: { roleId: created.id, permissionCode },
        });
      }
      return created.id;
    };
    const active = await role('active-role', 'ACTIVE', ['iam.users.read', 'iam.users.create']);
    const inactive = await role('inactive-role', 'INACTIVE', ['iam.roles.read']);
    const user = await seedInvitedUser(postgres.client, 'grant@example.invalid');
    const other = await seedInvitedUser(postgres.client, 'other@example.invalid');
    for (const roleId of [active, inactive]) {
      await postgres.client.iamUserRoleAssignment.create({ data: { userId: user.id, roleId } });
    }
    await postgres.client.iamUserRoleAssignment.create({
      data: { userId: other.id, roleId: systemRoleId },
    });

    const read = await runner.run(async ({ roles }) => ({
      user: await roles.readUserGrant(user.id),
      other: await roles.readUserGrant(other.id),
    }));

    // DEPRECATED codes and INACTIVE roles hand nothing back (spec Section 23.1).
    expect(read.user).toEqual({
      holdsSystemAdministratorRole: false,
      activePermissionCodes: ['iam.users.read'],
    });
    expect(read.other).toEqual({ holdsSystemAdministratorRole: true, activePermissionCodes: [] });
  });
});
