import type { IamPersistenceClient } from '@vertex-os/database/iam';
import {
  SYSTEM_ADMINISTRATOR_ROLE_CODE,
  type Description,
  type EntityName,
  type PermissionCode,
  type PermissionState,
  type RoleCode,
  type RoleId,
  type RoleState,
  type RoleStore,
  type RoleView,
} from '@vertex-os/iam/persistence';
import {
  accessToDatabase,
  knownLabel,
  permissionStateToDatabase,
  permissionStateFromDatabase,
  roleStateFromDatabase,
  roleStateToDatabase,
} from './enum-mapping.js';
import { readActorFacts } from './authorization-reader.js';
import { lockUserRow } from './user-lock.js';

interface RoleRow {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly description: string | null;
  readonly state: string;
  readonly isSystem: boolean;
  readonly version: number;
}

export const roleSelect = {
  id: true,
  code: true,
  name: true,
  description: true,
  state: true,
  isSystem: true,
  version: true,
} as const;

export function mapRole(row: RoleRow): RoleView {
  return Object.freeze({
    id: row.id as RoleId,
    code: row.code as RoleCode,
    name: row.name as EntityName,
    description: row.description === null ? undefined : (row.description as Description),
    state: knownLabel<RoleState>(roleStateFromDatabase, row.state),
    isSystem: row.isSystem,
    version: row.version,
  });
}

/**
 * Roles, mappings and assignments on one IAM transaction client (IAM-R05 D-05, D-06, D-13 to
 * D-15, D-17). Every decision is taken by IAM under the locks this store takes; its writes
 * execute that decision and throw when a row count differs, which only a broken lock assumption
 * can cause. Custom-role writes exclude the system role in their own conditions as well.
 */
export function createRoleStore(client: IamPersistenceClient): RoleStore {
  return {
    async createRole({ code, name, description }) {
      // The reserved code is refused by IAM before this call; `iam_role_system_code_ck` backs it.
      // ON CONFLICT DO NOTHING turns a concurrent creation of the same code into `code-taken`.
      const rows = await client.iamRole.createManyAndReturn({
        data: [
          {
            code,
            name,
            description: description ?? null,
            state: roleStateToDatabase.ACTIVE,
            isSystem: false,
            version: 1,
          },
        ],
        skipDuplicates: true,
        select: roleSelect,
      });
      const row = rows[0];
      return row === undefined
        ? { outcome: 'code-taken' }
        : { outcome: 'created', role: mapRole(row) };
    },

    async lockRole(id) {
      const rows = await client.$queryRaw<RoleRow[]>`
        SELECT id::text, code, name, description, state::text, is_system AS "isSystem", version
        FROM iam_role WHERE id = ${id}::uuid FOR UPDATE`;
      const row = rows[0];
      return row === undefined ? undefined : mapRole(row);
    },

    async writeRole({ id, expectedVersion, changes }) {
      const rows = await client.iamRole.updateManyAndReturn({
        where: { id, version: expectedVersion, isSystem: false },
        data: {
          ...(changes.name === undefined ? {} : { name: changes.name }),
          ...(changes.description === undefined ? {} : { description: changes.description }),
          ...(changes.state === undefined ? {} : { state: roleStateToDatabase[changes.state] }),
          version: { increment: 1 },
          updatedAt: new Date(),
        },
        select: roleSelect,
      });
      const row = rows[0];
      if (rows.length !== 1 || row === undefined) {
        throw new Error('A locked custom role changed its version.');
      }
      return mapRole(row);
    },

    async readRolePermissionCodes(roleId) {
      const rows = await client.iamRolePermission.findMany({
        where: { roleId },
        select: { permissionCode: true },
        orderBy: { permissionCode: 'asc' },
      });
      return rows.map((row) => row.permissionCode as PermissionCode);
    },

    async lockPermissions(codes) {
      if (codes.length === 0) return new Map();
      // Locked in code-point order (`COLLATE "C"`, whatever the database collation), the order in
      // which reference synchronization updates permissions, so the two cannot deadlock on
      // permission rows.
      const rows = await client.$queryRaw<{ code: string; state: string }[]>`
        SELECT code, state::text
        FROM iam_permission
        WHERE code = ANY(${[...codes]}::text[])
        ORDER BY code COLLATE "C"
        FOR SHARE`;
      return new Map(
        rows.map((row) => [
          row.code as PermissionCode,
          knownLabel<PermissionState>(permissionStateFromDatabase, row.state),
        ]),
      );
    },

    async replaceRolePermissions({ roleId, expectedVersion, add, remove }) {
      if (remove.length > 0) {
        const { count } = await client.iamRolePermission.deleteMany({
          where: { roleId, permissionCode: { in: [...remove] } },
        });
        if (count !== remove.length) throw new Error('A locked role changed its mappings.');
      }
      if (add.length > 0) {
        await client.iamRolePermission.createMany({
          data: add.map((permissionCode) => ({ roleId, permissionCode })),
        });
      }
      const rows = await client.iamRole.updateManyAndReturn({
        where: { id: roleId, version: expectedVersion, isSystem: false },
        data: { version: { increment: 1 }, updatedAt: new Date() },
        select: roleSelect,
      });
      const row = rows[0];
      if (rows.length !== 1 || row === undefined) {
        throw new Error('A locked custom role changed its version.');
      }
      return mapRole(row);
    },

    lockUser: (id) => lockUserRow(client, id),

    async hasAssignment({ userId, roleId }) {
      const row = await client.iamUserRoleAssignment.findUnique({
        where: { userId_roleId: { userId, roleId } },
        select: { userId: true },
      });
      return row !== null;
    },

    async insertAssignment({ userId, roleId }) {
      await client.iamUserRoleAssignment.create({
        data: { userId, roleId },
        select: { userId: true },
      });
    },

    async deleteAssignment({ userId, roleId }) {
      const { count } = await client.iamUserRoleAssignment.deleteMany({
        where: { userId, roleId },
      });
      if (count !== 1) throw new Error('An assignment changed under the role lock.');
    },

    countActiveSystemAdministrators() {
      return client.iamUserRoleAssignment.count({
        where: {
          role: { code: SYSTEM_ADMINISTRATOR_ROLE_CODE },
          user: { accessState: accessToDatabase.ACTIVE },
        },
      });
    },

    async readActivePermissionCodes(roleId) {
      const rows = await client.iamRolePermission.findMany({
        where: { roleId, permission: { state: permissionStateToDatabase.ACTIVE } },
        select: { permissionCode: true },
        orderBy: { permissionCode: 'asc' },
      });
      return rows.map((row) => row.permissionCode as PermissionCode);
    },

    readActorAuthority(userId) {
      // One statement, so the facts and the holding are one snapshot (IAM-R09 D-11).
      return readActorFacts(client, userId);
    },

    async readUserGrant(userId) {
      const holding = await client.iamUserRoleAssignment.count({
        where: { userId, role: { code: SYSTEM_ADMINISTRATOR_ROLE_CODE } },
      });
      const rows = await client.iamRolePermission.findMany({
        where: {
          role: {
            state: roleStateToDatabase.ACTIVE,
            userAssignments: { some: { userId } },
          },
          permission: { state: permissionStateToDatabase.ACTIVE },
        },
        select: { permissionCode: true },
        distinct: ['permissionCode'],
        orderBy: { permissionCode: 'asc' },
      });
      return {
        holdsSystemAdministratorRole: holding > 0,
        activePermissionCodes: rows.map((row) => row.permissionCode as PermissionCode),
      };
    },
  };
}
