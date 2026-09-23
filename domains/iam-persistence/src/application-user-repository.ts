import type { DatabaseClient } from '@vertex-os/database';
import {
  iamPersistenceOf,
  runInTransaction,
  type IamApplicationUser,
} from '@vertex-os/database/iam';
import type {
  ApplicationUser,
  ApplicationUserRepository,
  DepartmentId,
  DisplayName,
  NewApplicationUser,
  NormalizedEmail,
  RoleId,
  UserId,
} from '@vertex-os/iam/persistence';
import {
  accessFromDatabase,
  accessToDatabase,
  identitySyncFromDatabase,
  identitySyncToDatabase,
  invitationFromDatabase,
  invitationToDatabase,
} from './enum-mapping.js';

const userSelect = {
  id: true,
  email: true,
  displayName: true,
  accessState: true,
  identityIssuer: true,
  identitySubject: true,
  identitySyncState: true,
  invitationDeliveryState: true,
  invitationSentAt: true,
  firstActivatedAt: true,
  lastAccessStateChangedAt: true,
  createdAt: true,
  updatedAt: true,
  version: true,
} as const;

function mapUser(row: IamApplicationUser): ApplicationUser {
  return {
    id: row.id as UserId,
    email: row.email as NormalizedEmail,
    displayName: row.displayName as DisplayName,
    accessState: accessFromDatabase[row.accessState],
    identity:
      row.identityIssuer === null || row.identitySubject === null
        ? undefined
        : { issuer: row.identityIssuer, subject: row.identitySubject },
    identitySyncState: identitySyncFromDatabase[row.identitySyncState],
    invitationDeliveryState: invitationFromDatabase[row.invitationDeliveryState],
    invitationSentAt: row.invitationSentAt === null ? undefined : new Date(row.invitationSentAt),
    firstActivatedAt: row.firstActivatedAt === null ? undefined : new Date(row.firstActivatedAt),
    lastAccessStateChangedAt: new Date(row.lastAccessStateChangedAt),
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
    version: row.version,
  };
}

function field(value: unknown, key: string): unknown {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)[key]
    : undefined;
}

function driverViolation(
  error: unknown,
): { readonly kind: string; readonly state: string; readonly index: string } | undefined {
  const cause = field(field(field(error, 'meta'), 'driverAdapterError'), 'cause');
  const kind = field(cause, 'kind');
  const state = field(cause, 'originalCode');
  const index = field(field(cause, 'constraint'), 'index');
  return typeof kind === 'string' && typeof state === 'string' && typeof index === 'string'
    ? { kind, state, index }
    : undefined;
}

/** The adapter shares the caller's pool. Its public declaration contains only IAM types. */
export function createApplicationUserRepository(
  database: DatabaseClient,
): ApplicationUserRepository {
  const client = iamPersistenceOf(database);

  return {
    async create(draft: NewApplicationUser) {
      const now = new Date();
      try {
        const row = await runInTransaction(database, async (handle) => {
          const transaction = iamPersistenceOf(handle);
          const user = await transaction.iamApplicationUser.create({
            data: {
              email: draft.email,
              displayName: draft.displayName,
              accessState: accessToDatabase[draft.accessState],
              identitySyncState: identitySyncToDatabase[draft.identitySyncState],
              invitationDeliveryState: invitationToDatabase[draft.invitationDeliveryState],
              lastAccessStateChangedAt: now,
              createdAt: now,
              updatedAt: now,
            },
            select: userSelect,
          });
          if (draft.memberships.length > 0) {
            await transaction.iamDepartmentMembership.createMany({
              data: draft.memberships.map((membership) => ({
                userId: user.id,
                departmentId: membership.departmentId as DepartmentId,
                isPrimary: membership.isPrimary,
              })),
            });
          }
          if (draft.roleIds.length > 0) {
            await transaction.iamUserRoleAssignment.createMany({
              data: draft.roleIds.map((roleId) => ({ userId: user.id, roleId: roleId as RoleId })),
            });
          }
          return user;
        });
        return { outcome: 'created', user: mapUser(row) };
      } catch (error) {
        const violation = driverViolation(error);
        if (
          violation?.kind === 'UniqueConstraintViolation' &&
          violation.state === '23505' &&
          violation.index === 'iam_application_user_email_key'
        ) {
          return { outcome: 'email-conflict' };
        }
        if (
          violation?.kind === 'ForeignKeyConstraintViolation' &&
          violation.state === '23503' &&
          (violation.index === 'iam_department_membership_department_id_fkey' ||
            violation.index === 'iam_user_role_assignment_role_id_fkey')
        ) {
          return { outcome: 'unknown-reference' };
        }
        throw error;
      }
    },

    async findById(id: UserId) {
      const row = await client.iamApplicationUser.findUnique({ where: { id }, select: userSelect });
      return row === null ? undefined : mapUser(row);
    },

    async updateDisplayName(change) {
      const rows = await client.iamApplicationUser.updateManyAndReturn({
        where: { id: change.id, version: change.expectedVersion },
        data: { displayName: change.displayName, version: { increment: 1 }, updatedAt: new Date() },
        select: userSelect,
      });
      const row = rows[0];
      if (row) return { outcome: 'updated', user: mapUser(row) };
      const existing = await client.iamApplicationUser.findUnique({
        where: { id: change.id },
        select: { id: true },
      });
      return existing === null ? { outcome: 'not-found' } : { outcome: 'version-conflict' };
    },
  };
}
