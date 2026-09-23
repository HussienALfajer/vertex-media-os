import type { PermissionCode, RoleCode } from '../../domain/codes.js';
import type { RoleId, UserId } from '../../domain/identifiers.js';
import type { RoleView } from '../../domain/roles.js';
import type { PermissionState, RoleState, UserAccessState } from '../../domain/states.js';
import type { Description, EntityName } from '../../domain/text.js';
import type { FieldChanges } from '../../domain/versioned-change.js';

/**
 * Roles, role-permission mappings and user-role assignments inside one IAM transaction (IAM-R05
 * D-05, D-06, D-13 to D-15). Lock operations hold their row lock until the transaction ends; the
 * lock order is role, user, then permissions. Writes execute decisions already taken under those
 * locks and throw when they do not affect exactly the expected rows.
 */
export interface RoleStore {
  /** Inserts an ACTIVE custom role at version 1; a concurrent or existing code is `code-taken`. */
  createRole(values: {
    readonly code: RoleCode;
    readonly name: EntityName;
    readonly description: Description | undefined;
  }): Promise<
    { readonly outcome: 'created'; readonly role: RoleView } | { readonly outcome: 'code-taken' }
  >;
  /**
   * Locks the role row `FOR UPDATE`; every role mutation and assignment change takes it first. For
   * the System Administrator role this row lock is the serialization point of every operation
   * that can lower the number of ACTIVE System Administrators, and of bootstrap (spec Sections 20,
   * 21.4; IAM-R05 D-06).
   */
  lockRole(id: RoleId): Promise<RoleView | undefined>;
  /** Writes the changes and raises the version by one, conditional on `expectedVersion`. */
  writeRole(change: {
    readonly id: RoleId;
    readonly expectedVersion: number;
    readonly changes: FieldChanges<RoleState>;
  }): Promise<RoleView>;
  readRolePermissionCodes(roleId: RoleId): Promise<readonly PermissionCode[]>;
  /** Locks the registered permissions among `codes` `FOR SHARE` and returns their states. */
  lockPermissions(
    codes: readonly PermissionCode[],
  ): Promise<ReadonlyMap<PermissionCode, PermissionState>>;
  /** Applies a planned mapping diff of a custom role and raises its version by one. */
  replaceRolePermissions(change: {
    readonly roleId: RoleId;
    readonly expectedVersion: number;
    readonly add: readonly PermissionCode[];
    readonly remove: readonly PermissionCode[];
  }): Promise<RoleView>;
  /** Locks the user row (D-07); `undefined` when the user does not exist. */
  lockUser(id: UserId): Promise<{ readonly accessState: UserAccessState } | undefined>;
  hasAssignment(assignment: { readonly userId: UserId; readonly roleId: RoleId }): Promise<boolean>;
  insertAssignment(assignment: { readonly userId: UserId; readonly roleId: RoleId }): Promise<void>;
  deleteAssignment(assignment: { readonly userId: UserId; readonly roleId: RoleId }): Promise<void>;
  /** ACTIVE users holding the System Administrator role; meaningful only under its lock. */
  countActiveSystemAdministrators(): Promise<number>;
}
