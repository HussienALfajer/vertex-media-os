import {
  parseModuleCode,
  parsePermissionCode,
  type PermissionCode,
  type RoleCode,
} from './codes.js';
import type { RoleId } from './identifiers.js';
import type { PermissionState, RoleState, UserAccessState } from './states.js';
import type { Description, EntityName } from './text.js';
import {
  decideVersionedChange,
  type RequestedFields,
  type VersionedChangeDecision,
} from './versioned-change.js';

/** A role as administration returns it (spec Section 9.4). */
export interface RoleView {
  readonly id: RoleId;
  readonly code: RoleCode;
  readonly name: EntityName;
  readonly description: Description | undefined;
  readonly state: RoleState;
  readonly isSystem: boolean;
  readonly version: number;
}

/**
 * A change of a role's name, description or state (spec Sections 20, 23; IAM-R05 D-13, D-14). The
 * system role refuses every such change before its version is even compared.
 */
export function decideRoleChange(
  role: RoleView,
  expectedVersion: number,
  requested: RequestedFields<RoleState>,
): VersionedChangeDecision<RoleState> | { readonly kind: 'system-role-protected' } {
  if (role.isSystem) return { kind: 'system-role-protected' };
  return decideVersionedChange(role, expectedVersion, requested);
}

/** A well-formed permission code of any module; registration is checked against the catalog. */
export function parseAnyPermissionCode(value: string): PermissionCode | undefined {
  const module = parseModuleCode(value.split('.', 1)[0] ?? '');
  if (!module.ok) return undefined;
  const code = parsePermissionCode(value, module.value);
  return code.ok ? code.value : undefined;
}

export type MappingReplacementPlan =
  | { readonly kind: 'system-role-protected' }
  | { readonly kind: 'version-conflict' }
  | { readonly kind: 'unknown-permission'; readonly codes: readonly PermissionCode[] }
  | { readonly kind: 'permission-not-assignable'; readonly codes: readonly PermissionCode[] }
  | { readonly kind: 'unchanged' }
  | {
      readonly kind: 'replace';
      readonly add: readonly PermissionCode[];
      readonly remove: readonly PermissionCode[];
      readonly before: readonly PermissionCode[];
      readonly after: readonly PermissionCode[];
    };

function sorted(codes: Iterable<PermissionCode>): PermissionCode[] {
  return [...codes].sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
}

/**
 * Replaces a custom role's mapping set with the requested one (spec Sections 9.6, 18, 20; IAM-R05
 * D-15). The system role's mappings are code-controlled; every requested code must be registered
 * and ACTIVE (`catalog` holds the states read under their row locks). Existing mappings to codes
 * that are no longer ACTIVE may be dropped, never kept or added.
 */
export function planMappingReplacement(
  role: RoleView,
  expectedVersion: number,
  current: readonly PermissionCode[],
  requested: readonly PermissionCode[],
  catalog: ReadonlyMap<PermissionCode, PermissionState>,
): MappingReplacementPlan {
  if (role.isSystem) return { kind: 'system-role-protected' };
  if (role.version !== expectedVersion) return { kind: 'version-conflict' };
  const unknown = requested.filter((code) => !catalog.has(code));
  if (unknown.length > 0) return { kind: 'unknown-permission', codes: sorted(unknown) };
  const inactive = requested.filter((code) => catalog.get(code) !== 'ACTIVE');
  if (inactive.length > 0) return { kind: 'permission-not-assignable', codes: sorted(inactive) };
  const wanted = new Set(requested);
  const existing = new Set(current);
  const add = sorted(requested.filter((code) => !existing.has(code)));
  const remove = sorted(current.filter((code) => !wanted.has(code)));
  if (add.length === 0 && remove.length === 0) return { kind: 'unchanged' };
  return { kind: 'replace', add, remove, before: sorted(existing), after: sorted(wanted) };
}

export type RoleAssignmentDecision =
  | { readonly kind: 'refuse'; readonly reason: 'role-inactive' | 'duplicate-assignment' }
  | { readonly kind: 'assign' };

/** Assigning a role directly to a user (spec Sections 9.7, 23): only an ACTIVE role, only once. */
export function decideRoleAssignment(
  role: RoleView,
  alreadyAssigned: boolean,
): RoleAssignmentDecision {
  if (alreadyAssigned) return { kind: 'refuse', reason: 'duplicate-assignment' };
  if (role.state !== 'ACTIVE') return { kind: 'refuse', reason: 'role-inactive' };
  return { kind: 'assign' };
}

export type RoleRemovalDecision =
  | { readonly kind: 'refuse'; readonly reason: 'assignment-not-found' | 'last-system-admin' }
  | { readonly kind: 'remove' };

/**
 * Removing a role from a user (spec Sections 20, 23). Removing the System Administrator role from
 * an ACTIVE user must leave at least one ACTIVE holder; `activeAdministrators` is counted under
 * the System Administrator lock and includes the target. Holders that are not ACTIVE do not count
 * and are not blocked.
 */
export function decideRoleRemoval(input: {
  readonly assigned: boolean;
  readonly isSystemAdministratorRole: boolean;
  readonly targetAccessState: UserAccessState;
  readonly activeAdministrators: number;
}): RoleRemovalDecision {
  if (!input.assigned) return { kind: 'refuse', reason: 'assignment-not-found' };
  if (
    input.isSystemAdministratorRole &&
    input.targetAccessState === 'ACTIVE' &&
    input.activeAdministrators <= 1
  ) {
    return { kind: 'refuse', reason: 'last-system-admin' };
  }
  return { kind: 'remove' };
}
