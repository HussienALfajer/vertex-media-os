import type { QueryClient } from '@tanstack/react-query';
import { protectedQuery } from '../../lib/protected-query';
import {
  countUsers,
  getDepartment,
  getRole,
  getUser,
  listActiveDepartments,
  listActiveRoles,
  listDepartments,
  listPermissions,
  listRoles,
  listUsers,
  type EntityState,
  type PermissionState,
  type StateListParams,
  type UserListParams,
} from './iam-api';

/**
 * The IAM administration reads. Each declares the permission its route requires (spec Section
 * 25; IAM-R08B D-04), so it is removed when that permission is lost.
 */
export const IAM_PERMISSIONS = {
  usersRead: 'iam.users.read',
  usersCreate: 'iam.users.create',
  usersUpdate: 'iam.users.update',
  usersManageAccess: 'iam.users.manage-access',
  usersManageDepartments: 'iam.users.manage-departments',
  usersManageRoles: 'iam.users.manage-roles',
  sessionsRevoke: 'iam.sessions.revoke',
  departmentsRead: 'iam.departments.read',
  departmentsManage: 'iam.departments.manage',
  rolesRead: 'iam.roles.read',
  rolesManage: 'iam.roles.manage',
  permissionsRead: 'iam.permissions.read',
} as const;

/** The bound of every list read as one page for choices or names (spec Section 42). */
export const LIST_BOUND = 100;

export const usersQuery = (params: UserListParams) =>
  protectedQuery({
    permission: IAM_PERMISSIONS.usersRead,
    queryKey: ['iam', 'users', 'list', params],
    queryFn: ({ signal }) => listUsers(params, signal),
  });

export const userQuery = (userId: string) =>
  protectedQuery({
    permission: IAM_PERMISSIONS.usersRead,
    queryKey: ['iam', 'users', 'detail', userId],
    queryFn: ({ signal }) => getUser(userId, signal),
  });

/** Members of a department or holders of a role, in every access state (IAM-R08C D-05, D-06). */
export const userCountQuery = (
  filter: { readonly departmentId: string } | { readonly roleId: string },
) =>
  protectedQuery({
    permission: IAM_PERMISSIONS.usersRead,
    queryKey: ['iam', 'users', 'count', filter],
    queryFn: ({ signal }) => countUsers(filter, signal),
  });

export const activeDepartmentsQuery = protectedQuery({
  permission: IAM_PERMISSIONS.departmentsRead,
  queryKey: ['iam', 'departments', 'active'],
  queryFn: ({ signal }) => listActiveDepartments(signal),
});

export const activeRolesQuery = protectedQuery({
  permission: IAM_PERMISSIONS.rolesRead,
  queryKey: ['iam', 'roles', 'active'],
  queryFn: ({ signal }) => listActiveRoles(signal),
});

export const departmentsQuery = (params: StateListParams<EntityState>) =>
  protectedQuery({
    permission: IAM_PERMISSIONS.departmentsRead,
    queryKey: ['iam', 'departments', 'list', params],
    queryFn: ({ signal }) => listDepartments(params, signal),
  });

export const departmentQuery = (departmentId: string) =>
  protectedQuery({
    permission: IAM_PERMISSIONS.departmentsRead,
    queryKey: ['iam', 'departments', 'detail', departmentId],
    queryFn: ({ signal }) => getDepartment(departmentId, signal),
  });

export const rolesQuery = (params: StateListParams<EntityState>) =>
  protectedQuery({
    permission: IAM_PERMISSIONS.rolesRead,
    queryKey: ['iam', 'roles', 'list', params],
    queryFn: ({ signal }) => listRoles(params, signal),
  });

export const roleQuery = (roleId: string) =>
  protectedQuery({
    permission: IAM_PERMISSIONS.rolesRead,
    queryKey: ['iam', 'roles', 'detail', roleId],
    queryFn: ({ signal }) => getRole(roleId, signal),
  });

export const permissionsQuery = (params: StateListParams<PermissionState>) =>
  protectedQuery({
    permission: IAM_PERMISSIONS.permissionsRead,
    queryKey: ['iam', 'permissions', 'list', params],
    queryFn: ({ signal }) => listPermissions(params, signal),
  });

/** The whole catalog in every state, one bounded page: names for mapped codes and the editor. */
export const catalogQuery = permissionsQuery({ page: 1, pageSize: LIST_BOUND });

/** After a user is created: the directory is read again. */
export function refreshDirectory(client: QueryClient): Promise<void> {
  return client.invalidateQueries({ queryKey: ['iam', 'users', 'list'] });
}

/** After any user mutation: the directory and that user's detail are read again (D-10). */
export function refreshUser(client: QueryClient, userId: string): Promise<void> {
  return Promise.all([
    client.invalidateQueries({ queryKey: ['iam', 'users', 'list'] }),
    client.invalidateQueries({ queryKey: ['iam', 'users', 'detail', userId] }),
  ]).then(() => undefined);
}

/**
 * After a department or role mutation: its lists, details and pickers, and every user read,
 * which embeds department and role names and states (IAM-R08C D-04).
 */
export function refreshOrganization(
  client: QueryClient,
  root: 'departments' | 'roles',
): Promise<void> {
  return Promise.all([
    client.invalidateQueries({ queryKey: ['iam', root] }),
    client.invalidateQueries({ queryKey: ['iam', 'users'] }),
  ]).then(() => undefined);
}
