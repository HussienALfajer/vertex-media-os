import type { DepartmentCode, ModuleCode, PermissionCode, RoleCode } from './codes.js';
import type { DepartmentId, RoleId, UserId } from './identifiers.js';
import type { NormalizedEmail } from './email.js';
import type { RoleView } from './roles.js';
import type {
  DepartmentState,
  IdentitySyncState,
  InvitationDeliveryState,
  PermissionSensitivity,
  PermissionState,
  RoleState,
  UserAccessState,
} from './states.js';
import type { DisplayName, EntityName } from './text.js';
import type { UserView } from './user-lifecycle.js';

/** One of a user's memberships, with its department, as the directory shows it. */
export interface UserDepartmentView {
  readonly id: DepartmentId;
  readonly code: DepartmentCode;
  readonly name: EntityName;
  readonly state: DepartmentState;
  readonly isPrimary: boolean;
}

/** One of a user's role assignments, as administrative display information (spec Section 42). */
export interface UserRoleView {
  readonly id: RoleId;
  readonly code: RoleCode;
  readonly name: EntityName;
  readonly state: RoleState;
  readonly isSystem: boolean;
}

/**
 * A user in the directory list (spec Section 42): operational fields only. Security metadata
 * (activation and state-change instants, the invitation instant, the version) stays on the detail;
 * the identity mapping is never shown (IAM-R07 D-06).
 */
export interface UserSummary {
  readonly id: UserId;
  readonly email: NormalizedEmail;
  readonly displayName: DisplayName;
  readonly accessState: UserAccessState;
  readonly identitySyncState: IdentitySyncState;
  readonly invitationDeliveryState: InvitationDeliveryState;
  /** Sorted by department code. */
  readonly departments: readonly UserDepartmentView[];
  /** Sorted by role code. */
  readonly roles: readonly UserRoleView[];
}

/** A user's detail: the administration view with memberships and roles. */
export interface UserDetail extends UserView {
  readonly departments: readonly UserDepartmentView[];
  readonly roles: readonly UserRoleView[];
}

/** A role with its mapped permission codes, sorted (spec Section 25.7). */
export interface RoleDetail extends RoleView {
  readonly permissionCodes: readonly PermissionCode[];
}

/** A registered permission of the catalog (spec Sections 9.5, 25.8); read-only over HTTP. */
export interface PermissionView {
  readonly code: PermissionCode;
  readonly owningModule: ModuleCode;
  readonly name: string;
  readonly description: string;
  readonly state: PermissionState;
  readonly sensitivity: PermissionSensitivity;
}

/** One bounded page of a collection with a total order (IAM-R07 D-03). */
export interface Page<T> {
  readonly items: readonly T[];
  readonly page: number;
  readonly pageSize: number;
  /** The number of matching items across all pages. */
  readonly total: number;
}

/** Search text: trimmed, 1–100 characters, matched as a literal case-insensitive substring. */
declare const searchBrand: unique symbol;
export type SearchText = string & { readonly [searchBrand]: 'SearchText' };

const LONE_SURROGATE = /\p{Cs}/u;

export function parseSearchText(input: unknown): SearchText | undefined {
  if (typeof input !== 'string' || LONE_SURROGATE.test(input)) return undefined;
  const value = input.trim();
  const length = [...value].length;
  if (length < 1 || length > 100) return undefined;
  // No control characters, as in every other IAM text; SQL receives it only as a bound parameter.
  if ([...value].some((character) => /\p{Cc}/u.test(character))) return undefined;
  return value as SearchText;
}

export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 100;
export const MAX_PAGE = 10_000;

/** A page number and size within the bounds of D-03, or the name of the field out of bounds. */
export function parsePage(
  page: unknown,
  pageSize: unknown,
): { readonly page: number; readonly pageSize: number } | 'page' | 'pageSize' {
  const number = page === undefined ? 1 : page;
  const size = pageSize === undefined ? DEFAULT_PAGE_SIZE : pageSize;
  if (!Number.isSafeInteger(number) || (number as number) < 1 || (number as number) > MAX_PAGE) {
    return 'page';
  }
  if (!Number.isSafeInteger(size) || (size as number) < 1 || (size as number) > MAX_PAGE_SIZE) {
    return 'pageSize';
  }
  return { page: number as number, pageSize: size as number };
}
