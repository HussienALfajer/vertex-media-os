import type { AuditAttribution } from '@vertex-os/audit';
import { parseDepartmentCode } from '../domain/codes.js';
import { parseDepartmentId, parseUserId, type DepartmentId } from '../domain/identifiers.js';
import {
  decideMembershipAddition,
  decideMembershipRemoval,
  decidePrimaryChange,
  type DepartmentView,
} from '../domain/organization.js';
import type { DepartmentState } from '../domain/states.js';
import {
  parseDescription,
  parseEntityName,
  type Description,
  type EntityName,
} from '../domain/text.js';
import { decideVersionedChange, type RequestedFields } from '../domain/versioned-change.js';
import {
  buildIamEvidence,
  parseExpectedVersion,
  requireIamEvidence,
} from './administration-evidence.js';
import type { IamTransactionRunner } from './ports/iam-transaction.js';

/** What organization administration needs; composition supplies it. */
export interface OrganizationAdministrationDependencies {
  readonly runner: IamTransactionRunner;
}

type Invalid<Field extends string> = { readonly outcome: 'invalid'; readonly field: Field };

export interface CreateDepartmentRequest {
  readonly code: string;
  readonly name: string;
  readonly description?: string;
}

export type CreateDepartmentResult =
  | { readonly outcome: 'created'; readonly department: DepartmentView }
  | { readonly outcome: 'code-taken' }
  | Invalid<'code' | 'name' | 'description'>;

export interface UpdateDepartmentRequest {
  readonly departmentId: string;
  readonly expectedVersion: number;
  readonly name?: string;
  /** `null` clears the description. */
  readonly description?: string | null;
}

export interface DepartmentStateRequest {
  readonly departmentId: string;
  readonly expectedVersion: number;
}

export type DepartmentChangeResult =
  | { readonly outcome: 'updated' | 'unchanged'; readonly department: DepartmentView }
  | { readonly outcome: 'department-not-found' | 'version-conflict' }
  | Invalid<'departmentId' | 'expectedVersion' | 'name' | 'description'>;

export interface AddMembershipRequest {
  readonly userId: string;
  readonly departmentId: string;
  readonly isPrimary: boolean;
}

export type AddMembershipResult =
  | {
      readonly outcome: 'added';
      /** The primary membership this addition replaced, when it was explicitly primary. */
      readonly demotedPrimaryDepartmentId: DepartmentId | undefined;
    }
  | {
      readonly outcome:
        'user-not-found' | 'department-not-found' | 'department-inactive' | 'duplicate-membership';
    }
  | Invalid<'userId' | 'departmentId' | 'isPrimary'>;

export interface SetPrimaryMembershipRequest {
  readonly userId: string;
  readonly departmentId: string;
  readonly isPrimary: boolean;
}

export type SetPrimaryMembershipResult =
  | {
      readonly outcome: 'updated' | 'unchanged';
      readonly primaryDepartmentId: DepartmentId | undefined;
    }
  | { readonly outcome: 'user-not-found' | 'membership-not-found' | 'department-inactive' }
  | Invalid<'userId' | 'departmentId' | 'isPrimary'>;

export interface RemoveMembershipRequest {
  readonly userId: string;
  readonly departmentId: string;
  /** Names the new primary when the removed membership is the primary; never guessed. */
  readonly replacementPrimaryDepartmentId?: string;
}

export type RemoveMembershipResult =
  | { readonly outcome: 'removed'; readonly primaryDepartmentId: DepartmentId | undefined }
  | {
      readonly outcome:
        'user-not-found' | 'membership-not-found' | 'primary-conflict' | 'department-inactive';
    }
  | Invalid<'userId' | 'departmentId' | 'replacementPrimaryDepartmentId'>;

function departmentEvidence(department: DepartmentView) {
  return {
    code: department.code,
    name: department.name,
    description: department.description ?? null,
    state: department.state,
  };
}

/** Creates an ACTIVE department (spec Sections 9.2, 22; IAM-R05 D-16, D-17). */
export async function createDepartment(
  dependencies: OrganizationAdministrationDependencies,
  request: CreateDepartmentRequest,
  attribution: AuditAttribution,
): Promise<CreateDepartmentResult> {
  const code = parseDepartmentCode(request.code);
  if (!code.ok) return { outcome: 'invalid', field: 'code' };
  const name = parseEntityName(request.name);
  if (!name.ok) return { outcome: 'invalid', field: 'name' };
  let description: Description | undefined;
  if (request.description !== undefined) {
    const parsed = parseDescription(request.description);
    if (!parsed.ok) return { outcome: 'invalid', field: 'description' };
    description = parsed.value;
  }
  return dependencies.runner.run(async ({ organization, audit }) => {
    const created = await organization.createDepartment({
      code: code.value,
      name: name.value,
      description,
    });
    if (created.outcome === 'code-taken') return created;
    await audit.append(
      requireIamEvidence(attribution, {
        action: 'iam.department.created',
        target: { type: 'iam.department', id: created.department.id },
        after: departmentEvidence(created.department),
      }),
    );
    return created;
  });
}

async function changeDepartment(
  dependencies: OrganizationAdministrationDependencies,
  request: DepartmentStateRequest,
  requested: RequestedFields<DepartmentState>,
  action: string,
  attribution: AuditAttribution,
): Promise<DepartmentChangeResult> {
  const id = parseDepartmentId(request.departmentId);
  if (!id.ok) return { outcome: 'invalid', field: 'departmentId' };
  const expectedVersion = parseExpectedVersion(request.expectedVersion);
  if (expectedVersion === undefined) return { outcome: 'invalid', field: 'expectedVersion' };
  return dependencies.runner.run(async ({ organization, audit }) => {
    const department = await organization.lockDepartment(id.value, 'update');
    if (department === undefined) return { outcome: 'department-not-found' };
    const decision = decideVersionedChange(department, expectedVersion, requested);
    if (decision.kind === 'version-conflict') return { outcome: 'version-conflict' };
    if (decision.kind === 'unchanged') return { outcome: 'unchanged', department };
    // Built before the write: only a long description in 4-byte characters on both sides can
    // exceed Audit's size limit, and that is refused instead of failing after the write.
    const evidence = buildIamEvidence(attribution, {
      action,
      target: { type: 'iam.department', id: id.value },
      before: decision.before,
      after: decision.after,
    });
    if (evidence === 'too-large') return { outcome: 'invalid', field: 'description' };
    const updated = await organization.writeDepartment({
      id: id.value,
      expectedVersion,
      changes: decision.changes,
    });
    await audit.append(evidence);
    return { outcome: 'updated', department: updated };
  });
}

/** Renames or re-describes a department; its code never changes (spec Section 9.2). */
export async function updateDepartment(
  dependencies: OrganizationAdministrationDependencies,
  request: UpdateDepartmentRequest,
  attribution: AuditAttribution,
): Promise<DepartmentChangeResult> {
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
  return changeDepartment(dependencies, request, requested, 'iam.department.updated', attribution);
}

/** Makes a department ACTIVE again; its memberships contribute to authorization context again. */
export function activateDepartment(
  dependencies: OrganizationAdministrationDependencies,
  request: DepartmentStateRequest,
  attribution: AuditAttribution,
): Promise<DepartmentChangeResult> {
  return changeDepartment(
    dependencies,
    request,
    { state: 'ACTIVE' },
    'iam.department.activated',
    attribution,
  );
}

/**
 * Makes a department INACTIVE (spec Section 22): it leaves every member's authorization context,
 * including as primary, on the next resolution. Memberships are kept; nothing is deleted.
 */
export function deactivateDepartment(
  dependencies: OrganizationAdministrationDependencies,
  request: DepartmentStateRequest,
  attribution: AuditAttribution,
): Promise<DepartmentChangeResult> {
  return changeDepartment(
    dependencies,
    request,
    { state: 'INACTIVE' },
    'iam.department.deactivated',
    attribution,
  );
}

/**
 * Adds a user to an ACTIVE department (spec Sections 9.3, 22). Locks the user, then the department
 * `FOR SHARE`, so a concurrent deactivation is ordered with it (IAM-R05 D-07, D-08). An explicitly
 * primary addition demotes the current primary first (D-09).
 */
export async function addMembership(
  dependencies: OrganizationAdministrationDependencies,
  request: AddMembershipRequest,
  attribution: AuditAttribution,
): Promise<AddMembershipResult> {
  const userId = parseUserId(request.userId);
  if (!userId.ok) return { outcome: 'invalid', field: 'userId' };
  const departmentId = parseDepartmentId(request.departmentId);
  if (!departmentId.ok) return { outcome: 'invalid', field: 'departmentId' };
  if (typeof request.isPrimary !== 'boolean') return { outcome: 'invalid', field: 'isPrimary' };
  return dependencies.runner.run(async ({ organization, audit }) => {
    if ((await organization.lockUser(userId.value)) === undefined) {
      return { outcome: 'user-not-found' };
    }
    const department = await organization.lockDepartment(departmentId.value, 'share');
    if (department === undefined) return { outcome: 'department-not-found' };
    const memberships = await organization.readMemberships(userId.value);
    const decision = decideMembershipAddition(memberships, department, request.isPrimary);
    if (decision.kind === 'refuse') return { outcome: decision.reason };
    if (decision.demote !== undefined) {
      await organization.setMembershipPrimary({
        userId: userId.value,
        departmentId: decision.demote,
        isPrimary: false,
      });
    }
    await organization.insertMembership({
      userId: userId.value,
      departmentId: departmentId.value,
      isPrimary: request.isPrimary,
    });
    await audit.append(
      requireIamEvidence(attribution, {
        action: 'iam.user.department-added',
        target: { type: 'iam.user', id: userId.value },
        ...(request.isPrimary ? { before: { primaryDepartmentId: decision.demote ?? null } } : {}),
        after: {
          departmentId: departmentId.value,
          isPrimary: request.isPrimary,
          ...(request.isPrimary ? { primaryDepartmentId: departmentId.value } : {}),
        },
      }),
    );
    return { outcome: 'added', demotedPrimaryDepartmentId: decision.demote };
  });
}

/**
 * Sets or clears the primary flag of an existing membership (spec Section 22; IAM-R05 D-09). The
 * old primary is cleared before the new one is set, so the one-primary index never sees two.
 */
export async function setPrimaryMembership(
  dependencies: OrganizationAdministrationDependencies,
  request: SetPrimaryMembershipRequest,
  attribution: AuditAttribution,
): Promise<SetPrimaryMembershipResult> {
  const userId = parseUserId(request.userId);
  if (!userId.ok) return { outcome: 'invalid', field: 'userId' };
  const departmentId = parseDepartmentId(request.departmentId);
  if (!departmentId.ok) return { outcome: 'invalid', field: 'departmentId' };
  if (typeof request.isPrimary !== 'boolean') return { outcome: 'invalid', field: 'isPrimary' };
  return dependencies.runner.run(async ({ organization, audit }) => {
    if ((await organization.lockUser(userId.value)) === undefined) {
      return { outcome: 'user-not-found' };
    }
    const memberships = await organization.readMemberships(userId.value);
    const target = memberships.find((membership) => membership.departmentId === departmentId.value);
    if (target === undefined) return { outcome: 'membership-not-found' };
    // Only a promotion depends on the department's state, so only a promotion locks it (D-08).
    const departmentState = request.isPrimary
      ? (await organization.lockDepartment(departmentId.value, 'share'))?.state
      : target.departmentState;
    if (departmentState === undefined) throw new Error('A membership names a missing department.');
    const current = memberships.find((membership) => membership.isPrimary)?.departmentId;
    const decision = decidePrimaryChange(
      memberships,
      departmentId.value,
      request.isPrimary,
      departmentState,
    );
    if (decision.kind === 'refuse') return { outcome: decision.reason };
    if (decision.kind === 'unchanged')
      return { outcome: 'unchanged', primaryDepartmentId: current };
    if (decision.demote !== undefined) {
      await organization.setMembershipPrimary({
        userId: userId.value,
        departmentId: decision.demote,
        isPrimary: false,
      });
    }
    if (decision.promote !== undefined) {
      await organization.setMembershipPrimary({
        userId: userId.value,
        departmentId: decision.promote,
        isPrimary: true,
      });
    }
    await audit.append(
      requireIamEvidence(attribution, {
        action: 'iam.user.primary-department-changed',
        target: { type: 'iam.user', id: userId.value },
        before: { primaryDepartmentId: current ?? null },
        after: { primaryDepartmentId: decision.promote ?? null },
      }),
    );
    return { outcome: 'updated', primaryDepartmentId: decision.promote };
  });
}

/**
 * Removes a membership (spec Sections 22, 29). The row is deleted as current state; the Audit
 * record keeps it. Removing the primary never selects a replacement unless the request names one.
 */
export async function removeMembership(
  dependencies: OrganizationAdministrationDependencies,
  request: RemoveMembershipRequest,
  attribution: AuditAttribution,
): Promise<RemoveMembershipResult> {
  const userId = parseUserId(request.userId);
  if (!userId.ok) return { outcome: 'invalid', field: 'userId' };
  const departmentId = parseDepartmentId(request.departmentId);
  if (!departmentId.ok) return { outcome: 'invalid', field: 'departmentId' };
  let replacementId: DepartmentId | undefined;
  if (request.replacementPrimaryDepartmentId !== undefined) {
    const parsed = parseDepartmentId(request.replacementPrimaryDepartmentId);
    if (!parsed.ok) return { outcome: 'invalid', field: 'replacementPrimaryDepartmentId' };
    replacementId = parsed.value;
  }
  return dependencies.runner.run(async ({ organization, audit }) => {
    if ((await organization.lockUser(userId.value)) === undefined) {
      return { outcome: 'user-not-found' };
    }
    const memberships = await organization.readMemberships(userId.value);
    const isMember = (id: DepartmentId) =>
      memberships.some((membership) => membership.departmentId === id);
    let replacement: { id: DepartmentId; state: DepartmentState } | undefined;
    if (replacementId !== undefined) {
      // Only an existing membership can become primary; its department is locked (D-08).
      const locked =
        isMember(replacementId) && replacementId !== departmentId.value
          ? await organization.lockDepartment(replacementId, 'share')
          : undefined;
      replacement = { id: replacementId, state: locked?.state ?? 'INACTIVE' };
    }
    const decision = decideMembershipRemoval(memberships, departmentId.value, replacement);
    if (decision.kind === 'refuse') return { outcome: decision.reason };
    await organization.deleteMembership({ userId: userId.value, departmentId: departmentId.value });
    if (decision.promote !== undefined) {
      await organization.setMembershipPrimary({
        userId: userId.value,
        departmentId: decision.promote,
        isPrimary: true,
      });
    }
    await audit.append(
      requireIamEvidence(attribution, {
        action: 'iam.user.department-removed',
        target: { type: 'iam.user', id: userId.value },
        before: { departmentId: departmentId.value, isPrimary: decision.wasPrimary },
        ...(decision.wasPrimary
          ? { after: { primaryDepartmentId: decision.promote ?? null } }
          : {}),
      }),
    );
    const primary = decision.wasPrimary
      ? decision.promote
      : memberships.find((membership) => membership.isPrimary)?.departmentId;
    return { outcome: 'removed', primaryDepartmentId: primary };
  });
}
