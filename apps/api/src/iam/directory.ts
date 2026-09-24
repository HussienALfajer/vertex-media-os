import type { DatabaseClient } from '@vertex-os/database';
import type {
  DepartmentView,
  GetDepartmentResult,
  GetRoleResult,
  GetUserResult,
  ListResult,
  PermissionView,
  RoleView,
  StateListRequest,
  UserListRequest,
  UserSummary,
} from '@vertex-os/iam';
import {
  getDepartment,
  getRole,
  getUser,
  listDepartments,
  listPermissions,
  listRoles,
  listUsers,
} from '@vertex-os/iam/composition';
import { createIamDirectoryReader } from '@vertex-os/iam-persistence';

/**
 * IAM's read-only directory bound to PostgreSQL (IAM-R07 D-02): the user directory and detail,
 * departments, roles with their mappings and the permission catalog. The coarse permission check
 * is the HTTP route's.
 */
export interface IamDirectory {
  listUsers(
    r: UserListRequest,
  ): Promise<ListResult<UserSummary, 'accessState' | 'departmentId' | 'roleId'>>;
  getUser(r: { readonly userId: string }): Promise<GetUserResult>;
  listDepartments(r: StateListRequest): Promise<ListResult<DepartmentView, 'state'>>;
  getDepartment(r: { readonly departmentId: string }): Promise<GetDepartmentResult>;
  listRoles(r: StateListRequest): Promise<ListResult<RoleView, 'state'>>;
  getRole(r: { readonly roleId: string }): Promise<GetRoleResult>;
  listPermissions(r: StateListRequest): Promise<ListResult<PermissionView, 'state'>>;
}

/** Composition root of the IAM directory. */
export function createIamDirectory(database: DatabaseClient): IamDirectory {
  const dependencies = { directory: createIamDirectoryReader(database) };
  return Object.freeze({
    listUsers: (r) => listUsers(dependencies, r),
    getUser: (r) => getUser(dependencies, r),
    listDepartments: (r) => listDepartments(dependencies, r),
    getDepartment: (r) => getDepartment(dependencies, r),
    listRoles: (r) => listRoles(dependencies, r),
    getRole: (r) => getRole(dependencies, r),
    listPermissions: (r) => listPermissions(dependencies, r),
  } satisfies IamDirectory);
}
