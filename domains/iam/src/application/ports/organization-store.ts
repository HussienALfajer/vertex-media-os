import type { DepartmentCode } from '../../domain/codes.js';
import type { DepartmentId, UserId } from '../../domain/identifiers.js';
import type { DepartmentView, MembershipFact } from '../../domain/organization.js';
import type { DepartmentState, UserAccessState } from '../../domain/states.js';
import type { Description, EntityName } from '../../domain/text.js';
import type { FieldChanges } from '../../domain/versioned-change.js';

/**
 * Departments and memberships inside one IAM transaction (IAM-R05 D-05 to D-10). Lock operations
 * hold their row lock until the transaction ends; the lock order is role, user, then department.
 * Writes execute decisions already taken under those locks and throw when they do not affect
 * exactly the expected rows.
 */
export interface OrganizationStore {
  /** Inserts an ACTIVE department at version 1; a concurrent or existing code is `code-taken`. */
  createDepartment(values: {
    readonly code: DepartmentCode;
    readonly name: EntityName;
    readonly description: Description | undefined;
  }): Promise<
    | { readonly outcome: 'created'; readonly department: DepartmentView }
    | { readonly outcome: 'code-taken' }
  >;
  /** `update` for a department mutation, `share` to depend on its state (D-08). */
  lockDepartment(id: DepartmentId, mode: 'update' | 'share'): Promise<DepartmentView | undefined>;
  /** Writes the changes and raises the version by one, conditional on `expectedVersion`. */
  writeDepartment(change: {
    readonly id: DepartmentId;
    readonly expectedVersion: number;
    readonly changes: FieldChanges<DepartmentState>;
  }): Promise<DepartmentView>;
  /** Locks the user row (D-07); `undefined` when the user does not exist. */
  lockUser(id: UserId): Promise<{ readonly accessState: UserAccessState } | undefined>;
  /** The user's memberships, read after `lockUser`. */
  readMemberships(userId: UserId): Promise<readonly MembershipFact[]>;
  insertMembership(membership: {
    readonly userId: UserId;
    readonly departmentId: DepartmentId;
    readonly isPrimary: boolean;
  }): Promise<void>;
  setMembershipPrimary(change: {
    readonly userId: UserId;
    readonly departmentId: DepartmentId;
    readonly isPrimary: boolean;
  }): Promise<void>;
  deleteMembership(membership: {
    readonly userId: UserId;
    readonly departmentId: DepartmentId;
  }): Promise<void>;
}
