import type { PermissionCode } from './codes.js';
import type { DepartmentId, UserId } from './identifiers.js';
import type { DepartmentState, PermissionState, RoleState, UserAccessState } from './states.js';

/**
 * The current actor as other modules see it (spec Section 17; IAM-R04 D-05): coarse capability
 * and organizational context, never a role identity, an email or a persistence type. Only an
 * ACTIVE user has one.
 */
export interface AuthorizationContext {
  readonly userId: UserId;
  readonly accessState: 'ACTIVE';
  /** Absent when the user has no primary membership in an ACTIVE department. */
  readonly primaryDepartmentId?: DepartmentId;
  /** The ACTIVE departments the user belongs to, sorted. */
  readonly departmentIds: readonly DepartmentId[];
  /** The effective permission codes, sorted. */
  readonly permissionCodes: readonly PermissionCode[];
}

/** Committed IAM facts about one user, as the authorization reader returns them. */
export interface AuthorizationFacts {
  readonly accessState: UserAccessState;
  readonly memberships: readonly {
    readonly departmentId: DepartmentId;
    readonly isPrimary: boolean;
    readonly departmentState: DepartmentState;
  }[];
  /** One entry per role-permission mapping reachable through the user's role assignments. */
  readonly grants: readonly {
    readonly roleState: RoleState;
    readonly permissionCode: PermissionCode;
    readonly permissionState: PermissionState;
  }[];
}

/**
 * Applies the effectiveness rules (IAM-R04 D-06; spec Sections 9.3, 9.6, 9.7, 16.4). A permission
 * is effective only through an ACTIVE role and only while the permission itself is ACTIVE:
 * DEPRECATED and RETIRED codes never are. Only ACTIVE departments contribute organizational
 * context, and an INACTIVE primary department leaves the primary absent rather than replaced.
 * A user who is not ACTIVE has no context.
 */
export function projectAuthorizationContext(
  userId: UserId,
  facts: AuthorizationFacts,
): AuthorizationContext | undefined {
  if (facts.accessState !== 'ACTIVE') return undefined;

  const active = facts.memberships.filter((membership) => membership.departmentState === 'ACTIVE');
  const primary = active.find((membership) => membership.isPrimary)?.departmentId;
  const departmentIds = sortedUnique(active.map((membership) => membership.departmentId));
  const permissionCodes = sortedUnique(
    facts.grants
      .filter((grant) => grant.roleState === 'ACTIVE' && grant.permissionState === 'ACTIVE')
      .map((grant) => grant.permissionCode),
  );

  return Object.freeze({
    userId,
    accessState: 'ACTIVE',
    ...(primary === undefined ? {} : { primaryDepartmentId: primary }),
    departmentIds: Object.freeze(departmentIds),
    permissionCodes: Object.freeze(permissionCodes),
  });
}

/** Whether the actor currently holds the coarse capability (spec Section 16.1). */
export function hasPermission(context: AuthorizationContext, code: PermissionCode): boolean {
  return context.accessState === 'ACTIVE' && context.permissionCodes.includes(code);
}

function sortedUnique<T extends string>(values: readonly T[]): T[] {
  return [...new Set(values)].sort();
}
