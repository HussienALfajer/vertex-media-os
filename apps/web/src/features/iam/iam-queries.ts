import type { QueryClient } from '@tanstack/react-query';
import { protectedQuery } from '../../lib/protected-query';
import {
  getUser,
  listActiveDepartments,
  listActiveRoles,
  listUsers,
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
  rolesRead: 'iam.roles.read',
} as const;

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
