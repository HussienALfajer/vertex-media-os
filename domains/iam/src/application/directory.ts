import {
  parsePage,
  parseSearchText,
  type Page,
  type PermissionView,
  type RoleDetail,
  type SearchText,
  type UserDetail,
  type UserSummary,
} from '../domain/directory.js';
import {
  parseDepartmentId,
  parseRoleId,
  parseUserId,
  type DepartmentId,
  type RoleId,
} from '../domain/identifiers.js';
import type { DepartmentView } from '../domain/organization.js';
import type { RoleView } from '../domain/roles.js';
import {
  departmentStates,
  permissionStates,
  roleStates,
  userAccessStates,
  type UserAccessState,
} from '../domain/states.js';
import type {
  DirectorySlice,
  DirectoryWindow,
  IamDirectoryReader,
} from './ports/directory-reader.js';

/** What the directory queries need; composition supplies it. */
export interface DirectoryDependencies {
  readonly directory: IamDirectoryReader;
}

type Invalid<Field extends string> = { readonly outcome: 'invalid'; readonly field: Field };

/** A page request of D-03: `page` from 1, `pageSize` up to 100, optional search text. */
export interface ListRequest {
  readonly page?: number;
  readonly pageSize?: number;
  readonly search?: string;
}

export interface UserListRequest extends ListRequest {
  readonly accessState?: string;
  readonly departmentId?: string;
  readonly roleId?: string;
}

export interface StateListRequest extends ListRequest {
  readonly state?: string;
}

type WindowField = 'page' | 'pageSize' | 'search';

export type ListResult<T, Field extends string = never> =
  { readonly outcome: 'listed'; readonly page: Page<T> } | Invalid<WindowField | Field>;

export type GetUserResult =
  | { readonly outcome: 'found'; readonly user: UserDetail }
  | { readonly outcome: 'user-not-found' }
  | Invalid<'userId'>;

export type GetDepartmentResult =
  | { readonly outcome: 'found'; readonly department: DepartmentView }
  | { readonly outcome: 'department-not-found' }
  | Invalid<'departmentId'>;

export type GetRoleResult =
  | { readonly outcome: 'found'; readonly role: RoleDetail }
  | { readonly outcome: 'role-not-found' }
  | Invalid<'roleId'>;

function windowOf(
  request: ListRequest,
):
  | { readonly window: DirectoryWindow; readonly page: number; readonly pageSize: number }
  | Invalid<WindowField> {
  const bounds = parsePage(request.page, request.pageSize);
  if (typeof bounds === 'string') return { outcome: 'invalid', field: bounds };
  let search: SearchText | undefined;
  if (request.search !== undefined) {
    search = parseSearchText(request.search);
    if (search === undefined) return { outcome: 'invalid', field: 'search' };
  }
  return {
    window: { offset: (bounds.page - 1) * bounds.pageSize, limit: bounds.pageSize, search },
    page: bounds.page,
    pageSize: bounds.pageSize,
  };
}

function pageOf<T>(
  slice: DirectorySlice<T>,
  window: { readonly page: number; readonly pageSize: number },
): Page<T> {
  return Object.freeze({
    items: Object.freeze([...slice.items]),
    page: window.page,
    pageSize: window.pageSize,
    total: slice.total,
  });
}

function oneOf<T extends string>(values: readonly T[], value: unknown): T | undefined {
  return typeof value === 'string' && (values as readonly string[]).includes(value)
    ? (value as T)
    : undefined;
}

/** The user directory (spec Sections 25.3, 42): bounded, ordered, operational fields only. */
export async function listUsers(
  dependencies: DirectoryDependencies,
  request: UserListRequest,
): Promise<ListResult<UserSummary, 'accessState' | 'departmentId' | 'roleId'>> {
  const window = windowOf(request);
  if ('outcome' in window) return window;
  let accessState: UserAccessState | undefined;
  if (request.accessState !== undefined) {
    accessState = oneOf(userAccessStates, request.accessState);
    if (accessState === undefined) return { outcome: 'invalid', field: 'accessState' };
  }
  let departmentId: DepartmentId | undefined;
  if (request.departmentId !== undefined) {
    const parsed =
      typeof request.departmentId === 'string'
        ? parseDepartmentId(request.departmentId)
        : undefined;
    if (!parsed?.ok) return { outcome: 'invalid', field: 'departmentId' };
    departmentId = parsed.value;
  }
  let roleId: RoleId | undefined;
  if (request.roleId !== undefined) {
    const parsed = typeof request.roleId === 'string' ? parseRoleId(request.roleId) : undefined;
    if (!parsed?.ok) return { outcome: 'invalid', field: 'roleId' };
    roleId = parsed.value;
  }
  const slice = await dependencies.directory.listUsers({
    ...window.window,
    accessState,
    departmentId,
    roleId,
  });
  return { outcome: 'listed', page: pageOf(slice, window) };
}

/** A user's detail with memberships and roles; never the identity mapping. */
export async function getUser(
  dependencies: DirectoryDependencies,
  request: { readonly userId: string },
): Promise<GetUserResult> {
  const userId = typeof request.userId === 'string' ? parseUserId(request.userId) : undefined;
  if (!userId?.ok) return { outcome: 'invalid', field: 'userId' };
  const user = await dependencies.directory.findUser(userId.value);
  return user === undefined ? { outcome: 'user-not-found' } : { outcome: 'found', user };
}

async function listByState<T, State extends string>(
  request: StateListRequest,
  states: readonly State[],
  read: (
    query: DirectoryWindow & { readonly state: State | undefined },
  ) => Promise<DirectorySlice<T>>,
): Promise<ListResult<T, 'state'>> {
  const window = windowOf(request);
  if ('outcome' in window) return window;
  let state: State | undefined;
  if (request.state !== undefined) {
    state = oneOf(states, request.state);
    if (state === undefined) return { outcome: 'invalid', field: 'state' };
  }
  return { outcome: 'listed', page: pageOf(await read({ ...window.window, state }), window) };
}

export function listDepartments(
  dependencies: DirectoryDependencies,
  request: StateListRequest,
): Promise<ListResult<DepartmentView, 'state'>> {
  return listByState(request, departmentStates, (query) =>
    dependencies.directory.listDepartments(query),
  );
}

export async function getDepartment(
  dependencies: DirectoryDependencies,
  request: { readonly departmentId: string },
): Promise<GetDepartmentResult> {
  const departmentId =
    typeof request.departmentId === 'string' ? parseDepartmentId(request.departmentId) : undefined;
  if (!departmentId?.ok) return { outcome: 'invalid', field: 'departmentId' };
  const department = await dependencies.directory.findDepartment(departmentId.value);
  return department === undefined
    ? { outcome: 'department-not-found' }
    : { outcome: 'found', department };
}

export function listRoles(
  dependencies: DirectoryDependencies,
  request: StateListRequest,
): Promise<ListResult<RoleView, 'state'>> {
  return listByState(request, roleStates, (query) => dependencies.directory.listRoles(query));
}

export async function getRole(
  dependencies: DirectoryDependencies,
  request: { readonly roleId: string },
): Promise<GetRoleResult> {
  const roleId = typeof request.roleId === 'string' ? parseRoleId(request.roleId) : undefined;
  if (!roleId?.ok) return { outcome: 'invalid', field: 'roleId' };
  const role = await dependencies.directory.findRole(roleId.value);
  return role === undefined ? { outcome: 'role-not-found' } : { outcome: 'found', role };
}

/** The permission catalog (spec Section 25.8); read-only over HTTP. */
export function listPermissions(
  dependencies: DirectoryDependencies,
  request: StateListRequest,
): Promise<ListResult<PermissionView, 'state'>> {
  return listByState(request, permissionStates, (query) =>
    dependencies.directory.listPermissions(query),
  );
}
