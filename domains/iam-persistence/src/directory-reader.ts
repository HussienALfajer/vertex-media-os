import type { DatabaseClient } from '@vertex-os/database';
import { iamPersistenceOf, type IamPersistenceClient } from '@vertex-os/database/iam';
import type {
  DepartmentCode,
  DepartmentId,
  DepartmentState,
  DirectoryWindow,
  EntityName,
  IamDirectoryReader,
  ModuleCode,
  PermissionCode,
  PermissionView,
  RoleCode,
  RoleId,
  RoleState,
  SearchText,
  UserDepartmentView,
  UserRoleView,
  UserSummary,
} from '@vertex-os/iam/persistence';
import { mapUser, userSelect } from './application-user-repository.js';
import {
  accessFromDatabase,
  accessToDatabase,
  departmentStateFromDatabase,
  departmentStateToDatabase,
  identitySyncFromDatabase,
  invitationFromDatabase,
  knownLabel,
  permissionStateFromDatabase,
  permissionStateToDatabase,
  roleStateFromDatabase,
  roleStateToDatabase,
  sensitivityFromDatabase,
} from './enum-mapping.js';
import { departmentSelect, mapDepartment } from './organization-store.js';
import { mapRole, roleSelect } from './role-store.js';

/** A user's memberships and roles, as the directory reads them with the user. */
const grantsSelect = {
  memberships: {
    select: {
      isPrimary: true,
      department: { select: { id: true, code: true, name: true, state: true } },
    },
  },
  roleAssignments: {
    select: { role: { select: { id: true, code: true, name: true, state: true, isSystem: true } } },
  },
} as const;

interface GrantRows {
  readonly memberships: readonly {
    readonly isPrimary: boolean;
    readonly department: { id: string; code: string; name: string; state: string };
  }[];
  readonly roleAssignments: readonly {
    readonly role: { id: string; code: string; name: string; state: string; isSystem: boolean };
  }[];
}

const byCode = (left: { code: string }, right: { code: string }): number =>
  left.code < right.code ? -1 : left.code > right.code ? 1 : 0;

function departmentsOf(rows: GrantRows): readonly UserDepartmentView[] {
  return Object.freeze(
    rows.memberships
      .map(({ isPrimary, department }) =>
        Object.freeze({
          id: department.id as DepartmentId,
          code: department.code as DepartmentCode,
          name: department.name as EntityName,
          state: knownLabel<DepartmentState>(departmentStateFromDatabase, department.state),
          isPrimary,
        }),
      )
      .sort(byCode),
  );
}

function rolesOf(rows: GrantRows): readonly UserRoleView[] {
  return Object.freeze(
    rows.roleAssignments
      .map(({ role }) =>
        Object.freeze({
          id: role.id as RoleId,
          code: role.code as RoleCode,
          name: role.name as EntityName,
          state: knownLabel<RoleState>(roleStateFromDatabase, role.state),
          isSystem: role.isSystem,
        }),
      )
      .sort(byCode),
  );
}

/**
 * A literal, case-insensitive substring filter. Prisma binds the text as a parameter but passes
 * LIKE wildcards through, so `%`, `_` and the escape character itself are escaped here (the
 * PostgreSQL default escape is the backslash); the integration test pins that behavior.
 */
function containing(search: SearchText) {
  return { contains: search.replace(/[\\%_]/g, '\\$&'), mode: 'insensitive' as const };
}

function window({ offset, limit }: DirectoryWindow) {
  return { skip: offset, take: limit };
}

/**
 * The directory reader (IAM-R07 D-02, D-03): read-only Prisma queries on the pool, outside any
 * transaction. Each list is one count and one page query with the same filter and a total order;
 * a value outside the known enums throws rather than being shown as something else.
 */
export function createIamDirectoryReader(database: DatabaseClient): IamDirectoryReader {
  const client: IamPersistenceClient = iamPersistenceOf(database);
  const reader: IamDirectoryReader = {
    async listUsers(query) {
      const where = {
        ...(query.accessState === undefined
          ? {}
          : { accessState: accessToDatabase[query.accessState] }),
        ...(query.departmentId === undefined
          ? {}
          : { memberships: { some: { departmentId: query.departmentId } } }),
        ...(query.roleId === undefined
          ? {}
          : { roleAssignments: { some: { roleId: query.roleId } } }),
        ...(query.search === undefined
          ? {}
          : {
              OR: [{ displayName: containing(query.search) }, { email: containing(query.search) }],
            }),
      };
      const [total, rows] = [
        await client.iamApplicationUser.count({ where }),
        await client.iamApplicationUser.findMany({
          where,
          orderBy: [{ displayName: 'asc' }, { id: 'asc' }],
          ...window(query),
          select: { ...userSelect, ...grantsSelect },
        }),
      ];
      const items = rows.map((row): UserSummary =>
        Object.freeze({
          id: row.id as UserSummary['id'],
          email: row.email as UserSummary['email'],
          displayName: row.displayName as UserSummary['displayName'],
          accessState: accessFromDatabase[row.accessState],
          identitySyncState: identitySyncFromDatabase[row.identitySyncState],
          invitationDeliveryState: invitationFromDatabase[row.invitationDeliveryState],
          departments: departmentsOf(row),
          roles: rolesOf(row),
        }),
      );
      return { items, total };
    },

    async findUser(id) {
      const row = await client.iamApplicationUser.findUnique({
        where: { id },
        select: { ...userSelect, ...grantsSelect },
      });
      if (row === null) return undefined;
      const user = mapUser(row);
      return Object.freeze({
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        accessState: user.accessState,
        identitySyncState: user.identitySyncState,
        invitationDeliveryState: user.invitationDeliveryState,
        invitationSentAt: user.invitationSentAt,
        firstActivatedAt: user.firstActivatedAt,
        lastAccessStateChangedAt: user.lastAccessStateChangedAt,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        version: user.version,
        departments: departmentsOf(row),
        roles: rolesOf(row),
      });
    },

    async listDepartments(query) {
      const where = {
        ...(query.state === undefined ? {} : { state: departmentStateToDatabase[query.state] }),
        ...(query.search === undefined
          ? {}
          : { OR: [{ code: containing(query.search) }, { name: containing(query.search) }] }),
      };
      const [total, rows] = [
        await client.iamDepartment.count({ where }),
        await client.iamDepartment.findMany({
          where,
          orderBy: [{ code: 'asc' }, { id: 'asc' }],
          ...window(query),
          select: departmentSelect,
        }),
      ];
      return { items: rows.map(mapDepartment), total };
    },

    async findDepartment(id) {
      const row = await client.iamDepartment.findUnique({
        where: { id },
        select: departmentSelect,
      });
      return row === null ? undefined : mapDepartment(row);
    },

    async listRoles(query) {
      const where = {
        ...(query.state === undefined ? {} : { state: roleStateToDatabase[query.state] }),
        ...(query.search === undefined
          ? {}
          : { OR: [{ code: containing(query.search) }, { name: containing(query.search) }] }),
      };
      const [total, rows] = [
        await client.iamRole.count({ where }),
        await client.iamRole.findMany({
          where,
          orderBy: [{ code: 'asc' }, { id: 'asc' }],
          ...window(query),
          select: roleSelect,
        }),
      ];
      return { items: rows.map(mapRole), total };
    },

    async findRole(id) {
      const row = await client.iamRole.findUnique({
        where: { id },
        select: { ...roleSelect, permissions: { select: { permissionCode: true } } },
      });
      if (row === null) return undefined;
      const permissionCodes = row.permissions
        .map((mapping) => mapping.permissionCode as PermissionCode)
        .sort();
      return Object.freeze({ ...mapRole(row), permissionCodes: Object.freeze(permissionCodes) });
    },

    async listPermissions(query) {
      const where = {
        ...(query.state === undefined ? {} : { state: permissionStateToDatabase[query.state] }),
        ...(query.search === undefined
          ? {}
          : { OR: [{ code: containing(query.search) }, { name: containing(query.search) }] }),
      };
      const [total, rows] = [
        await client.iamPermission.count({ where }),
        await client.iamPermission.findMany({
          where,
          orderBy: { code: 'asc' },
          ...window(query),
          select: {
            code: true,
            owningModule: true,
            name: true,
            description: true,
            state: true,
            sensitivity: true,
          },
        }),
      ];
      const items = rows.map((row): PermissionView =>
        Object.freeze({
          code: row.code as PermissionCode,
          owningModule: row.owningModule as ModuleCode,
          name: row.name,
          description: row.description,
          state: permissionStateFromDatabase[row.state],
          sensitivity: sensitivityFromDatabase[row.sensitivity],
        }),
      );
      return { items, total };
    },
  };
  return Object.freeze(reader);
}
