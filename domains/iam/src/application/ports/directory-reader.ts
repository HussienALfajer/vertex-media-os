import type {
  PermissionView,
  RoleDetail,
  SearchText,
  UserDetail,
  UserSummary,
} from '../../domain/directory.js';
import type { DepartmentId, RoleId, UserId } from '../../domain/identifiers.js';
import type { DepartmentView } from '../../domain/organization.js';
import type { RoleView } from '../../domain/roles.js';
import type {
  DepartmentState,
  PermissionState,
  RoleState,
  UserAccessState,
} from '../../domain/states.js';

/** A validated window of a collection: skip `offset` items of the total order, take `limit`. */
export interface DirectoryWindow {
  readonly offset: number;
  readonly limit: number;
  readonly search: SearchText | undefined;
}

export interface UserDirectoryQuery extends DirectoryWindow {
  readonly accessState: UserAccessState | undefined;
  readonly departmentId: DepartmentId | undefined;
  readonly roleId: RoleId | undefined;
}

export interface StateQuery<State extends string> extends DirectoryWindow {
  readonly state: State | undefined;
}

/** The matching items of one window and the number of matches across all windows. */
export interface DirectorySlice<T> {
  readonly items: readonly T[];
  readonly total: number;
}

/**
 * Read-only views of committed IAM state for administration and the current user (spec Sections
 * 25, 42; IAM-R07 D-02). Reads run outside transactions and never write. Each collection has a
 * fixed total order: users by display name then ID; departments, roles and permissions by code.
 * Search is a literal, case-insensitive substring match: wildcard characters match themselves.
 */
export interface IamDirectoryReader {
  /** Search covers the display name and the email. */
  listUsers(query: UserDirectoryQuery): Promise<DirectorySlice<UserSummary>>;
  findUser(id: UserId): Promise<UserDetail | undefined>;
  /** Search covers the code and the name. */
  listDepartments(query: StateQuery<DepartmentState>): Promise<DirectorySlice<DepartmentView>>;
  findDepartment(id: DepartmentId): Promise<DepartmentView | undefined>;
  /** Search covers the code and the name. */
  listRoles(query: StateQuery<RoleState>): Promise<DirectorySlice<RoleView>>;
  findRole(id: RoleId): Promise<RoleDetail | undefined>;
  /** Search covers the code and the name. */
  listPermissions(query: StateQuery<PermissionState>): Promise<DirectorySlice<PermissionView>>;
}
