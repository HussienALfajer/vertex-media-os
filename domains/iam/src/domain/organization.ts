import type { DepartmentCode } from './codes.js';
import type { DepartmentId } from './identifiers.js';
import type { DepartmentState } from './states.js';
import type { Description, EntityName } from './text.js';

/** A department as administration returns it (spec Section 9.2). */
export interface DepartmentView {
  readonly id: DepartmentId;
  readonly code: DepartmentCode;
  readonly name: EntityName;
  readonly description: Description | undefined;
  readonly state: DepartmentState;
  readonly version: number;
}

/** One current membership of the locked user, with its department's committed state. */
export interface MembershipFact {
  readonly departmentId: DepartmentId;
  readonly isPrimary: boolean;
  readonly departmentState: DepartmentState;
}

function primaryOf(memberships: readonly MembershipFact[]): DepartmentId | undefined {
  return memberships.find((membership) => membership.isPrimary)?.departmentId;
}

export type MembershipAdditionDecision =
  | { readonly kind: 'refuse'; readonly reason: 'department-inactive' | 'duplicate-membership' }
  /** `demote`: the current primary, cleared before the new primary is set (IAM-R05 D-09). */
  | { readonly kind: 'add'; readonly demote: DepartmentId | undefined };

/**
 * Adding a membership (spec Section 22): never to an INACTIVE department, never twice. Asking for
 * the primary is the caller's explicit choice and demotes the current primary.
 */
export function decideMembershipAddition(
  memberships: readonly MembershipFact[],
  department: { readonly id: DepartmentId; readonly state: DepartmentState },
  isPrimary: boolean,
): MembershipAdditionDecision {
  if (memberships.some((membership) => membership.departmentId === department.id)) {
    return { kind: 'refuse', reason: 'duplicate-membership' };
  }
  if (department.state !== 'ACTIVE') return { kind: 'refuse', reason: 'department-inactive' };
  return { kind: 'add', demote: isPrimary ? primaryOf(memberships) : undefined };
}

export type PrimaryChangeDecision =
  | { readonly kind: 'refuse'; readonly reason: 'membership-not-found' | 'department-inactive' }
  | { readonly kind: 'unchanged' }
  | {
      readonly kind: 'change';
      readonly demote: DepartmentId | undefined;
      readonly promote: DepartmentId | undefined;
    };

/**
 * Sets or clears the primary flag of one existing membership (IAM-R05 D-09, D-10). Making a
 * membership primary demotes the current primary; clearing it leaves the user without one. Only a
 * membership in an ACTIVE department can become primary; `departmentState` is the state read under
 * the department lock.
 */
export function decidePrimaryChange(
  memberships: readonly MembershipFact[],
  departmentId: DepartmentId,
  isPrimary: boolean,
  departmentState: DepartmentState,
): PrimaryChangeDecision {
  const target = memberships.find((membership) => membership.departmentId === departmentId);
  if (target === undefined) return { kind: 'refuse', reason: 'membership-not-found' };
  if (target.isPrimary === isPrimary) return { kind: 'unchanged' };
  if (!isPrimary) return { kind: 'change', demote: departmentId, promote: undefined };
  if (departmentState !== 'ACTIVE') return { kind: 'refuse', reason: 'department-inactive' };
  return { kind: 'change', demote: primaryOf(memberships), promote: departmentId };
}

export type MembershipRemovalDecision =
  | {
      readonly kind: 'refuse';
      readonly reason: 'membership-not-found' | 'primary-conflict' | 'department-inactive';
    }
  | {
      readonly kind: 'remove';
      readonly wasPrimary: boolean;
      /** The replacement primary the request named; never chosen by the backend. */
      readonly promote: DepartmentId | undefined;
    };

/**
 * Removes one membership (spec Section 22). Removing the primary leaves the user without one
 * unless the request names a replacement, which must be another membership of the user in an
 * ACTIVE department (`replacementState` read under its department lock).
 */
export function decideMembershipRemoval(
  memberships: readonly MembershipFact[],
  departmentId: DepartmentId,
  replacement: { readonly id: DepartmentId; readonly state: DepartmentState } | undefined,
): MembershipRemovalDecision {
  const target = memberships.find((membership) => membership.departmentId === departmentId);
  if (target === undefined) return { kind: 'refuse', reason: 'membership-not-found' };
  if (replacement === undefined) {
    return { kind: 'remove', wasPrimary: target.isPrimary, promote: undefined };
  }
  if (
    !target.isPrimary ||
    replacement.id === departmentId ||
    !memberships.some((membership) => membership.departmentId === replacement.id)
  ) {
    return { kind: 'refuse', reason: 'primary-conflict' };
  }
  if (replacement.state !== 'ACTIVE') return { kind: 'refuse', reason: 'department-inactive' };
  return { kind: 'remove', wasPrimary: true, promote: replacement.id };
}
