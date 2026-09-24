import type { DatabaseClient } from '@vertex-os/database';
import { iamPersistenceOf, type IamPersistenceClient } from '@vertex-os/database/iam';
import {
  SYSTEM_ADMINISTRATOR_ROLE_CODE,
  type AuthorizationFacts,
  type AuthorizationReader,
  type DepartmentId,
  type DepartmentState,
  type PermissionCode,
  type PermissionState,
  type RoleState,
  type UserAccessState,
  type UserId,
} from '@vertex-os/iam/persistence';

/** The one row the statement returns; the enum columns arrive as their text labels. */
interface FactsRow {
  readonly accessState: string;
  readonly memberships: unknown;
  readonly grants: unknown;
  readonly holdsSystemAdministratorRole: boolean;
}

const accessStates: Record<string, UserAccessState> = {
  INVITED: 'INVITED',
  ACTIVE: 'ACTIVE',
  SUSPENDED: 'SUSPENDED',
  DISABLED: 'DISABLED',
  TERMINATED: 'TERMINATED',
};
const departmentStates: Record<string, DepartmentState> = {
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
};
const roleStates: Record<string, RoleState> = { ACTIVE: 'ACTIVE', INACTIVE: 'INACTIVE' };
const permissionStates: Record<string, PermissionState> = {
  ACTIVE: 'ACTIVE',
  DEPRECATED: 'DEPRECATED',
  RETIRED: 'RETIRED',
};

/**
 * The authorization reader (IAM-R04 D-07): one statement reads the user's access state, the
 * memberships with their department's state, and every role-permission mapping reachable through
 * the user's role assignments with the role's and the permission's state. One round trip and one
 * snapshot, whatever the number of roles and permissions (spec Section 51). It filters nothing:
 * the effectiveness rules are IAM's (`projectAuthorizationContext`). A value outside the known
 * enums or shapes throws, so an unexpected row can never widen access.
 */
export function createAuthorizationReader(database: DatabaseClient): AuthorizationReader {
  const client = iamPersistenceOf(database);
  return Object.freeze({
    readAuthorizationFacts: (userId: UserId) => readAuthorizationFacts(client, userId),
  });
}

/**
 * The reader's statement on any IAM client: the pool, or a transaction whose committed view the
 * grant ceiling evaluates (IAM-R06 D-12).
 */
export async function readAuthorizationFacts(
  client: IamPersistenceClient,
  userId: UserId,
): Promise<AuthorizationFacts | undefined> {
  return (await readActorFacts(client, userId)).facts;
}

/**
 * The same statement, with whether the user holds the System Administrator role in any state: the
 * grant ceiling's view of the actor, read as one snapshot (IAM-R06 DC-4; IAM-R09 D-11).
 */
export async function readActorFacts(
  client: IamPersistenceClient,
  userId: UserId,
): Promise<{
  readonly facts: AuthorizationFacts | undefined;
  readonly holdsSystemAdministratorRole: boolean;
}> {
  const rows = await client.$queryRaw<FactsRow[]>`
    SELECT
      u.access_state::text AS "accessState",
      COALESCE((
        SELECT json_agg(json_build_object(
          'departmentId', m.department_id,
          'isPrimary', m.is_primary,
          'departmentState', d.state))
        FROM iam_department_membership m
        JOIN iam_department d ON d.id = m.department_id
        WHERE m.user_id = u.id
      ), '[]'::json) AS "memberships",
      COALESCE((
        SELECT json_agg(json_build_object(
          'roleState', r.state,
          'permissionCode', p.code,
          'permissionState', p.state))
        FROM iam_user_role_assignment a
        JOIN iam_role r ON r.id = a.role_id
        JOIN iam_role_permission rp ON rp.role_id = r.id
        JOIN iam_permission p ON p.code = rp.permission_code
        WHERE a.user_id = u.id
      ), '[]'::json) AS "grants",
      EXISTS (
        SELECT 1
        FROM iam_user_role_assignment a
        JOIN iam_role r ON r.id = a.role_id
        WHERE a.user_id = u.id AND r.code = ${SYSTEM_ADMINISTRATOR_ROLE_CODE}
      ) AS "holdsSystemAdministratorRole"
    FROM iam_application_user u
    WHERE u.id = ${userId}::uuid`;
  const row = rows[0];
  if (row === undefined) return { facts: undefined, holdsSystemAdministratorRole: false };
  if (typeof row.holdsSystemAdministratorRole !== 'boolean') {
    throw new Error('The authorization facts hold a malformed entry.');
  }
  return { facts: factsOf(row), holdsSystemAdministratorRole: row.holdsSystemAdministratorRole };
}

function factsOf(row: FactsRow): AuthorizationFacts {
  return {
    accessState: known(accessStates, row.accessState),
    memberships: list(row.memberships).map((item) => ({
      departmentId: text(item, 'departmentId') as DepartmentId,
      isPrimary: flag(item, 'isPrimary'),
      departmentState: known(departmentStates, text(item, 'departmentState')),
    })),
    grants: list(row.grants).map((item) => ({
      roleState: known(roleStates, text(item, 'roleState')),
      permissionCode: text(item, 'permissionCode') as PermissionCode,
      permissionState: known(permissionStates, text(item, 'permissionState')),
    })),
  };
}

function known<T>(values: Record<string, T>, value: string): T {
  const mapped = Object.hasOwn(values, value) ? values[value] : undefined;
  if (mapped === undefined) throw new Error('The authorization facts hold an unknown state.');
  return mapped;
}

function list(value: unknown): readonly Record<string, unknown>[] {
  if (!Array.isArray(value)) throw new Error('The authorization facts are not a list.');
  return value.map((item: unknown) => {
    if (typeof item !== 'object' || item === null) {
      throw new Error('The authorization facts hold a malformed entry.');
    }
    return item as Record<string, unknown>;
  });
}

function text(item: Record<string, unknown>, key: string): string {
  const value = item[key];
  if (typeof value !== 'string') throw new Error('The authorization facts hold a malformed value.');
  return value;
}

function flag(item: Record<string, unknown>, key: string): boolean {
  const value = item[key];
  if (typeof value !== 'boolean') throw new Error('The authorization facts hold a malformed flag.');
  return value;
}
