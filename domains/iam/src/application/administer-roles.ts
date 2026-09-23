import type { AuditAttribution } from '@vertex-os/audit';
import { parseRoleCode, type PermissionCode } from '../domain/codes.js';
import { parseRoleId, parseUserId } from '../domain/identifiers.js';
import { SYSTEM_ADMINISTRATOR_ROLE_CODE } from '../domain/permission-catalog.js';
import {
  decideRoleAssignment,
  decideRoleChange,
  decideRoleRemoval,
  parseAnyPermissionCode,
  planMappingReplacement,
  type RoleView,
} from '../domain/roles.js';
import type { RoleState } from '../domain/states.js';
import {
  parseDescription,
  parseEntityName,
  type Description,
  type EntityName,
} from '../domain/text.js';
import type { RequestedFields } from '../domain/versioned-change.js';
import {
  buildIamEvidence,
  parseExpectedVersion,
  requireIamEvidence,
} from './administration-evidence.js';
import type { IamTransactionRunner } from './ports/iam-transaction.js';

/** What role administration needs; composition supplies it. */
export interface RoleAdministrationDependencies {
  readonly runner: IamTransactionRunner;
}

type Invalid<Field extends string> = { readonly outcome: 'invalid'; readonly field: Field };

/** Upper bound of one mapping set, far above the catalog; the change must also fit Audit's limits. */
const MAX_MAPPED_PERMISSIONS = 500;

export interface CreateRoleRequest {
  readonly code: string;
  readonly name: string;
  readonly description?: string;
}

export type CreateRoleResult =
  | { readonly outcome: 'created'; readonly role: RoleView }
  | { readonly outcome: 'code-taken' }
  | Invalid<'code' | 'name' | 'description'>;

export interface UpdateRoleRequest {
  readonly roleId: string;
  readonly expectedVersion: number;
  readonly name?: string;
  /** `null` clears the description. */
  readonly description?: string | null;
}

export interface RoleStateRequest {
  readonly roleId: string;
  readonly expectedVersion: number;
}

export type RoleChangeResult =
  | { readonly outcome: 'updated' | 'unchanged'; readonly role: RoleView }
  | { readonly outcome: 'role-not-found' | 'version-conflict' | 'system-role-protected' }
  | Invalid<'roleId' | 'expectedVersion' | 'name' | 'description'>;

export interface ReplaceRolePermissionsRequest {
  readonly roleId: string;
  readonly expectedVersion: number;
  readonly permissionCodes: readonly string[];
}

export type ReplaceRolePermissionsResult =
  | {
      readonly outcome: 'updated' | 'unchanged';
      readonly role: RoleView;
      readonly permissionCodes: readonly PermissionCode[];
    }
  | { readonly outcome: 'role-not-found' | 'version-conflict' | 'system-role-protected' }
  | {
      readonly outcome: 'unknown-permission' | 'permission-not-assignable';
      readonly permissionCodes: readonly PermissionCode[];
    }
  | Invalid<'roleId' | 'expectedVersion' | 'permissionCodes'>;

export interface RoleAssignmentRequest {
  readonly userId: string;
  readonly roleId: string;
}

export type AssignRoleResult =
  | { readonly outcome: 'assigned' }
  | {
      readonly outcome:
        'user-not-found' | 'role-not-found' | 'role-inactive' | 'duplicate-assignment';
    }
  | Invalid<'userId' | 'roleId'>;

export type RemoveRoleResult =
  | { readonly outcome: 'removed' }
  | {
      readonly outcome:
        'user-not-found' | 'role-not-found' | 'assignment-not-found' | 'last-system-admin';
    }
  | Invalid<'userId' | 'roleId'>;

function roleEvidence(role: RoleView) {
  return {
    code: role.code,
    name: role.name,
    description: role.description ?? null,
    state: role.state,
    isSystem: role.isSystem,
  };
}

/**
 * Creates an ACTIVE custom role without mappings (spec Sections 9.4, 23). The reserved system-role
 * code is never available (IAM-R05 D-13).
 */
export async function createRole(
  dependencies: RoleAdministrationDependencies,
  request: CreateRoleRequest,
  attribution: AuditAttribution,
): Promise<CreateRoleResult> {
  const code = parseRoleCode(request.code);
  if (!code.ok) return { outcome: 'invalid', field: 'code' };
  const name = parseEntityName(request.name);
  if (!name.ok) return { outcome: 'invalid', field: 'name' };
  let description: Description | undefined;
  if (request.description !== undefined) {
    const parsed = parseDescription(request.description);
    if (!parsed.ok) return { outcome: 'invalid', field: 'description' };
    description = parsed.value;
  }
  if (code.value === SYSTEM_ADMINISTRATOR_ROLE_CODE) return { outcome: 'code-taken' };
  return dependencies.runner.run(async ({ roles, audit }) => {
    const created = await roles.createRole({ code: code.value, name: name.value, description });
    if (created.outcome === 'code-taken') return created;
    await audit.append(
      requireIamEvidence(attribution, {
        action: 'iam.role.created',
        target: { type: 'iam.role', id: created.role.id },
        after: roleEvidence(created.role),
      }),
    );
    return created;
  });
}

async function changeRole(
  dependencies: RoleAdministrationDependencies,
  request: RoleStateRequest,
  requested: RequestedFields<RoleState>,
  action: string,
  attribution: AuditAttribution,
): Promise<RoleChangeResult> {
  const id = parseRoleId(request.roleId);
  if (!id.ok) return { outcome: 'invalid', field: 'roleId' };
  const expectedVersion = parseExpectedVersion(request.expectedVersion);
  if (expectedVersion === undefined) return { outcome: 'invalid', field: 'expectedVersion' };
  return dependencies.runner.run(async ({ roles, audit }) => {
    const role = await roles.lockRole(id.value);
    if (role === undefined) return { outcome: 'role-not-found' };
    const decision = decideRoleChange(role, expectedVersion, requested);
    if (decision.kind === 'system-role-protected') {
      await audit.append(
        requireIamEvidence(attribution, {
          action,
          target: { type: 'iam.role', id: id.value },
          result: 'REFUSED',
        }),
      );
      return { outcome: 'system-role-protected' };
    }
    if (decision.kind === 'version-conflict') return { outcome: 'version-conflict' };
    if (decision.kind === 'unchanged') return { outcome: 'unchanged', role };
    // Built before the write: only a long description in 4-byte characters on both sides can
    // exceed Audit's size limit, and that is refused instead of failing after the write.
    const evidence = buildIamEvidence(attribution, {
      action,
      target: { type: 'iam.role', id: id.value },
      before: decision.before,
      after: decision.after,
    });
    if (evidence === 'too-large') return { outcome: 'invalid', field: 'description' };
    const updated = await roles.writeRole({
      id: id.value,
      expectedVersion,
      changes: decision.changes,
    });
    await audit.append(evidence);
    return { outcome: 'updated', role: updated };
  });
}

/** Renames or re-describes a custom role; role names never authorize anything (spec Section 23). */
export async function updateRole(
  dependencies: RoleAdministrationDependencies,
  request: UpdateRoleRequest,
  attribution: AuditAttribution,
): Promise<RoleChangeResult> {
  const requested: { name?: EntityName; description?: Description | null } = {};
  if (request.name !== undefined) {
    const name = parseEntityName(request.name);
    if (!name.ok) return { outcome: 'invalid', field: 'name' };
    requested.name = name.value;
  }
  if (request.description === null) {
    requested.description = null;
  } else if (request.description !== undefined) {
    const description = parseDescription(request.description);
    if (!description.ok) return { outcome: 'invalid', field: 'description' };
    requested.description = description.value;
  }
  return changeRole(dependencies, request, requested, 'iam.role.updated', attribution);
}

/** Makes a custom role ACTIVE; its mappings count again on the next authorization evaluation. */
export function activateRole(
  dependencies: RoleAdministrationDependencies,
  request: RoleStateRequest,
  attribution: AuditAttribution,
): Promise<RoleChangeResult> {
  return changeRole(dependencies, request, { state: 'ACTIVE' }, 'iam.role.activated', attribution);
}

/**
 * Makes a custom role INACTIVE (spec Section 23): its permissions leave every holder's context on
 * the next evaluation; assignments and mappings are kept.
 */
export function deactivateRole(
  dependencies: RoleAdministrationDependencies,
  request: RoleStateRequest,
  attribution: AuditAttribution,
): Promise<RoleChangeResult> {
  return changeRole(
    dependencies,
    request,
    { state: 'INACTIVE' },
    'iam.role.deactivated',
    attribution,
  );
}

/**
 * Replaces a custom role's permission mappings with the requested set (spec Sections 9.6, 18,
 * 25.7; IAM-R05 D-14, D-15). Only registered ACTIVE codes can be mapped; the system role's
 * mappings are code-controlled. A changed set raises the role's version once.
 */
export async function replaceRolePermissions(
  dependencies: RoleAdministrationDependencies,
  request: ReplaceRolePermissionsRequest,
  attribution: AuditAttribution,
): Promise<ReplaceRolePermissionsResult> {
  const id = parseRoleId(request.roleId);
  if (!id.ok) return { outcome: 'invalid', field: 'roleId' };
  const expectedVersion = parseExpectedVersion(request.expectedVersion);
  if (expectedVersion === undefined) return { outcome: 'invalid', field: 'expectedVersion' };
  if (
    !Array.isArray(request.permissionCodes) ||
    request.permissionCodes.length > MAX_MAPPED_PERMISSIONS
  ) {
    return { outcome: 'invalid', field: 'permissionCodes' };
  }
  const requested: PermissionCode[] = [];
  for (const value of request.permissionCodes) {
    const code = typeof value === 'string' ? parseAnyPermissionCode(value) : undefined;
    if (code === undefined) return { outcome: 'invalid', field: 'permissionCodes' };
    requested.push(code);
  }
  if (new Set(requested).size !== requested.length) {
    return { outcome: 'invalid', field: 'permissionCodes' };
  }
  return dependencies.runner.run(async ({ roles, audit }) => {
    const role = await roles.lockRole(id.value);
    if (role === undefined) return { outcome: 'role-not-found' };
    const current = await roles.readRolePermissionCodes(id.value);
    // The system role's permission rows are never locked here: reference synchronization updates
    // permissions before the system role, so locking both in the opposite order could deadlock.
    const catalog = role.isSystem ? new Map() : await roles.lockPermissions(requested);
    const plan = planMappingReplacement(role, expectedVersion, current, requested, catalog);
    switch (plan.kind) {
      case 'system-role-protected':
        await audit.append(
          requireIamEvidence(attribution, {
            action: 'iam.role.permissions-replaced',
            target: { type: 'iam.role', id: id.value },
            result: 'REFUSED',
          }),
        );
        return { outcome: 'system-role-protected' };
      case 'version-conflict':
        return { outcome: 'version-conflict' };
      case 'unknown-permission':
      case 'permission-not-assignable':
        return { outcome: plan.kind, permissionCodes: plan.codes };
      case 'unchanged':
        return { outcome: 'unchanged', role, permissionCodes: current };
      case 'replace': {
        // The evidence is the change, as reference synchronization records it: removed codes
        // before, added codes after. It is built before the write, so a change too large for
        // Audit is refused instead of failing after the write (IAM-R05 D-16).
        const evidence = buildIamEvidence(attribution, {
          action: 'iam.role.permissions-replaced',
          target: { type: 'iam.role', id: id.value },
          ...(plan.remove.length > 0 ? { before: { permissionCodes: plan.remove } } : {}),
          ...(plan.add.length > 0 ? { after: { permissionCodes: plan.add } } : {}),
        });
        if (evidence === 'too-large') return { outcome: 'invalid', field: 'permissionCodes' };
        const updated = await roles.replaceRolePermissions({
          roleId: id.value,
          expectedVersion,
          add: plan.add,
          remove: plan.remove,
        });
        await audit.append(evidence);
        return { outcome: 'updated', role: updated, permissionCodes: plan.after };
      }
    }
  });
}

/**
 * Assigns an ACTIVE role to a user (spec Sections 9.7, 23). Locks the role row, then the user row
 * (IAM-R05 D-05, D-07); for the System Administrator role the role lock is the D-06 lock.
 */
export async function assignRole(
  dependencies: RoleAdministrationDependencies,
  request: RoleAssignmentRequest,
  attribution: AuditAttribution,
): Promise<AssignRoleResult> {
  const userId = parseUserId(request.userId);
  if (!userId.ok) return { outcome: 'invalid', field: 'userId' };
  const roleId = parseRoleId(request.roleId);
  if (!roleId.ok) return { outcome: 'invalid', field: 'roleId' };
  return dependencies.runner.run(async ({ roles, audit }) => {
    const role = await roles.lockRole(roleId.value);
    if (role === undefined) return { outcome: 'role-not-found' };
    if ((await roles.lockUser(userId.value)) === undefined) return { outcome: 'user-not-found' };
    const assignment = { userId: userId.value, roleId: roleId.value };
    const decision = decideRoleAssignment(role, await roles.hasAssignment(assignment));
    if (decision.kind === 'refuse') return { outcome: decision.reason };
    await roles.insertAssignment(assignment);
    await audit.append(
      requireIamEvidence(attribution, {
        action: 'iam.user.role-assigned',
        target: { type: 'iam.user', id: userId.value },
        after: { roleId: role.id, roleCode: role.code },
      }),
    );
    return { outcome: 'assigned' };
  });
}

/**
 * Removes a role from a user (spec Sections 20, 23). Removing the System Administrator role from
 * an ACTIVE user counts the ACTIVE holders under the System Administrator role lock, so two
 * concurrent removals can never both see another administrator (IAM-R05 D-06, D-07).
 */
export async function removeRole(
  dependencies: RoleAdministrationDependencies,
  request: RoleAssignmentRequest,
  attribution: AuditAttribution,
): Promise<RemoveRoleResult> {
  const userId = parseUserId(request.userId);
  if (!userId.ok) return { outcome: 'invalid', field: 'userId' };
  const roleId = parseRoleId(request.roleId);
  if (!roleId.ok) return { outcome: 'invalid', field: 'roleId' };
  return dependencies.runner.run(async ({ roles, audit }) => {
    const role = await roles.lockRole(roleId.value);
    if (role === undefined) return { outcome: 'role-not-found' };
    const user = await roles.lockUser(userId.value);
    if (user === undefined) return { outcome: 'user-not-found' };
    const assignment = { userId: userId.value, roleId: roleId.value };
    const assigned = await roles.hasAssignment(assignment);
    const isSystemAdministratorRole = role.isSystem && role.code === SYSTEM_ADMINISTRATOR_ROLE_CODE;
    const activeAdministrators =
      assigned && isSystemAdministratorRole && user.accessState === 'ACTIVE'
        ? await roles.countActiveSystemAdministrators()
        : 0;
    const decision = decideRoleRemoval({
      assigned,
      isSystemAdministratorRole,
      targetAccessState: user.accessState,
      activeAdministrators,
    });
    if (decision.kind === 'refuse') {
      if (decision.reason === 'last-system-admin') {
        await audit.append(
          requireIamEvidence(attribution, {
            action: 'iam.user.role-removed',
            target: { type: 'iam.user', id: userId.value },
            result: 'REFUSED',
            before: { roleId: role.id, roleCode: role.code },
          }),
        );
      }
      return { outcome: decision.reason };
    }
    await roles.deleteAssignment(assignment);
    await audit.append(
      requireIamEvidence(attribution, {
        action: 'iam.user.role-removed',
        target: { type: 'iam.user', id: userId.value },
        before: { roleId: role.id, roleCode: role.code },
      }),
    );
    return { outcome: 'removed' };
  });
}
