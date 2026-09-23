import { IamRoleState, type IamPersistenceClient } from '@vertex-os/database/iam';
import {
  SYSTEM_ADMINISTRATOR_ROLE_CODE,
  type Description,
  type EntityName,
  type ModuleCode,
  type PermissionCode,
  type PermissionFieldValues,
  type ReferenceDataStore,
  type RoleCode,
  type RoleFieldValues,
  type RoleId,
} from '@vertex-os/iam/persistence';
import {
  permissionStateFromDatabase,
  permissionStateToDatabase,
  roleStateFromDatabase,
  sensitivityFromDatabase,
  sensitivityToDatabase,
} from './enum-mapping.js';

/**
 * Transaction-scoped advisory-lock key that serializes IAM reference synchronization runs
 * (IAM-02 D-11). The first eight bytes of SHA-256("vertex-os:iam.reference-sync") read as a signed
 * 64-bit integer, so it cannot collide by accident with another repository lock key derived the
 * same way from a different name. It is the only advisory lock in the repository.
 */
export const IAM_REFERENCE_SYNC_LOCK_KEY = -4098619809192145812n;

function permissionData(fields: PermissionFieldValues) {
  return {
    ...(fields.name === undefined ? {} : { name: fields.name }),
    ...(fields.description === undefined ? {} : { description: fields.description }),
    ...(fields.state === undefined ? {} : { state: permissionStateToDatabase[fields.state] }),
    ...(fields.sensitivity === undefined
      ? {}
      : { sensitivity: sensitivityToDatabase[fields.sensitivity] }),
  };
}

function roleData(fields: RoleFieldValues) {
  return {
    ...(fields.name === undefined ? {} : { name: fields.name }),
    ...(fields.description === undefined ? {} : { description: fields.description }),
  };
}

/**
 * IAM reference data on one IAM-scoped (transaction) client. Every write is exactly one planned
 * change; nothing is upserted, so a converged run never touches a row. Custom roles are outside
 * every query: reads and writes select the reserved code or `is_system` roles only, and mapping
 * writes always name the system role's ID.
 */
export function createReferenceDataStore(client: IamPersistenceClient): ReferenceDataStore {
  return {
    async acquireSynchronizationLock() {
      await client.$executeRaw`SELECT pg_advisory_xact_lock(${IAM_REFERENCE_SYNC_LOCK_KEY})`;
    },

    async readSnapshot() {
      const permissions = await client.iamPermission.findMany({
        select: {
          code: true,
          owningModule: true,
          name: true,
          description: true,
          state: true,
          sensitivity: true,
        },
        orderBy: { code: 'asc' },
      });
      const roles = await client.iamRole.findMany({
        where: { OR: [{ code: SYSTEM_ADMINISTRATOR_ROLE_CODE }, { isSystem: true }] },
        select: {
          id: true,
          code: true,
          name: true,
          description: true,
          state: true,
          isSystem: true,
          version: true,
          permissions: { select: { permissionCode: true }, orderBy: { permissionCode: 'asc' } },
        },
        orderBy: { code: 'asc' },
      });
      return {
        permissions: permissions.map((row) => ({
          code: row.code as PermissionCode,
          owningModule: row.owningModule as ModuleCode,
          name: row.name as EntityName,
          description: row.description as Description,
          state: permissionStateFromDatabase[row.state],
          sensitivity: sensitivityFromDatabase[row.sensitivity],
        })),
        systemRoles: roles.map((row) => ({
          id: row.id as RoleId,
          code: row.code as RoleCode,
          name: row.name as EntityName,
          description: row.description === null ? undefined : (row.description as Description),
          state: roleStateFromDatabase[row.state],
          isSystem: row.isSystem,
          version: row.version,
          permissionCodes: row.permissions.map(
            (mapping) => mapping.permissionCode as PermissionCode,
          ),
        })),
      };
    },

    async registerPermissions(permissions) {
      if (permissions.length === 0) return;
      await client.iamPermission.createMany({
        data: permissions.map((permission) => ({
          code: permission.code,
          owningModule: permission.owningModule,
          name: permission.name,
          description: permission.description,
          state: permissionStateToDatabase[permission.state],
          sensitivity: sensitivityToDatabase[permission.sensitivity],
        })),
      });
    },

    async updatePermission(change) {
      const { count } = await client.iamPermission.updateMany({
        where: { code: change.code },
        data: permissionData(change.fields),
      });
      if (count !== 1) throw new Error('Reference synchronization lost a planned permission.');
    },

    async createSystemRole(definition) {
      const row = await client.iamRole.create({
        data: {
          code: definition.code,
          name: definition.name,
          description: definition.description,
          state: IamRoleState.ACTIVE,
          isSystem: true,
          version: 1,
        },
        select: { id: true },
      });
      return { id: row.id as RoleId };
    },

    async updateSystemRole(change) {
      const { count } = await client.iamRole.updateMany({
        where: { id: change.id, isSystem: true },
        data: roleData(change.fields),
      });
      if (count !== 1) throw new Error('Reference synchronization lost the system role.');
    },

    async grantSystemRolePermissions(change) {
      if (change.codes.length === 0) return;
      await client.iamRolePermission.createMany({
        data: change.codes.map((permissionCode) => ({ roleId: change.roleId, permissionCode })),
      });
    },

    async revokeSystemRolePermissions(change) {
      if (change.codes.length === 0) return;
      const { count } = await client.iamRolePermission.deleteMany({
        where: { roleId: change.roleId, permissionCode: { in: [...change.codes] } },
      });
      if (count !== change.codes.length) {
        throw new Error('Reference synchronization found a different system-role mapping set.');
      }
    },

    async incrementSystemRoleVersion(change) {
      // Conditional on the version the plan read; under the synchronization lock a mismatch is
      // impossible, so it is an unexpected error, never ignored.
      const { count } = await client.iamRole.updateMany({
        where: { id: change.roleId, version: change.expectedVersion, isSystem: true },
        data: { version: { increment: 1 } },
      });
      if (count !== 1)
        throw new Error('Reference synchronization found a stale system-role version.');
    },
  };
}
