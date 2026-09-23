import type { AuditAttribution, AuditRecorder } from '@vertex-os/audit';
import type { DatabaseClient, DatabaseTransaction } from '@vertex-os/database';
import type {
  AddMembershipRequest,
  AddMembershipResult,
  AssignRoleResult,
  CreateDepartmentRequest,
  CreateDepartmentResult,
  CreateRoleRequest,
  CreateRoleResult,
  DepartmentChangeResult,
  DepartmentStateRequest,
  RemoveMembershipRequest,
  RemoveMembershipResult,
  RemoveRoleResult,
  ReplaceRolePermissionsRequest,
  ReplaceRolePermissionsResult,
  RoleAssignmentRequest,
  RoleChangeResult,
  RoleStateRequest,
  SetPrimaryMembershipRequest,
  SetPrimaryMembershipResult,
  UpdateDepartmentRequest,
  UpdateRoleRequest,
} from '@vertex-os/iam';
import {
  activateDepartment,
  activateRole,
  addMembership,
  assignRole,
  createDepartment,
  createRole,
  deactivateDepartment,
  deactivateRole,
  removeMembership,
  removeRole,
  replaceRolePermissions,
  setPrimaryMembership,
  updateDepartment,
  updateRole,
} from '@vertex-os/iam/composition';
import { createIamTransactionRunner } from '@vertex-os/iam-persistence';

/**
 * IAM department, membership, role and permission administration bound to its adapters
 * (IAM-R05 D-01, D-03). Every operation takes the caller's attribution; the coarse permission
 * check is the HTTP route's (IAM-MP-11), the resource and state rules are IAM's.
 */
export interface IamAdministration {
  createDepartment(
    r: CreateDepartmentRequest,
    a: AuditAttribution,
  ): Promise<CreateDepartmentResult>;
  updateDepartment(
    r: UpdateDepartmentRequest,
    a: AuditAttribution,
  ): Promise<DepartmentChangeResult>;
  activateDepartment(
    r: DepartmentStateRequest,
    a: AuditAttribution,
  ): Promise<DepartmentChangeResult>;
  deactivateDepartment(
    r: DepartmentStateRequest,
    a: AuditAttribution,
  ): Promise<DepartmentChangeResult>;
  addMembership(r: AddMembershipRequest, a: AuditAttribution): Promise<AddMembershipResult>;
  setPrimaryMembership(
    r: SetPrimaryMembershipRequest,
    a: AuditAttribution,
  ): Promise<SetPrimaryMembershipResult>;
  removeMembership(
    r: RemoveMembershipRequest,
    a: AuditAttribution,
  ): Promise<RemoveMembershipResult>;
  createRole(r: CreateRoleRequest, a: AuditAttribution): Promise<CreateRoleResult>;
  updateRole(r: UpdateRoleRequest, a: AuditAttribution): Promise<RoleChangeResult>;
  activateRole(r: RoleStateRequest, a: AuditAttribution): Promise<RoleChangeResult>;
  deactivateRole(r: RoleStateRequest, a: AuditAttribution): Promise<RoleChangeResult>;
  replaceRolePermissions(
    r: ReplaceRolePermissionsRequest,
    a: AuditAttribution,
  ): Promise<ReplaceRolePermissionsResult>;
  assignRole(r: RoleAssignmentRequest, a: AuditAttribution): Promise<AssignRoleResult>;
  removeRole(r: RoleAssignmentRequest, a: AuditAttribution): Promise<RemoveRoleResult>;
}

export interface IamAdministrationOptions {
  /** Binds MOD-AUDIT's append capability to a transaction (the Audit adapter in the runtime). */
  readonly auditRecorderFor: (handle: DatabaseClient | DatabaseTransaction) => AuditRecorder;
}

/** Composition root of IAM administration. Not mounted in HTTP; IAM-MP-11 consumes it. */
export function createIamAdministration(
  database: DatabaseClient,
  options: IamAdministrationOptions,
): IamAdministration {
  const dependencies = {
    runner: createIamTransactionRunner(database, { auditRecorderFor: options.auditRecorderFor }),
  };
  return Object.freeze({
    createDepartment: (r, a) => createDepartment(dependencies, r, a),
    updateDepartment: (r, a) => updateDepartment(dependencies, r, a),
    activateDepartment: (r, a) => activateDepartment(dependencies, r, a),
    deactivateDepartment: (r, a) => deactivateDepartment(dependencies, r, a),
    addMembership: (r, a) => addMembership(dependencies, r, a),
    setPrimaryMembership: (r, a) => setPrimaryMembership(dependencies, r, a),
    removeMembership: (r, a) => removeMembership(dependencies, r, a),
    createRole: (r, a) => createRole(dependencies, r, a),
    updateRole: (r, a) => updateRole(dependencies, r, a),
    activateRole: (r, a) => activateRole(dependencies, r, a),
    deactivateRole: (r, a) => deactivateRole(dependencies, r, a),
    replaceRolePermissions: (r, a) => replaceRolePermissions(dependencies, r, a),
    assignRole: (r, a) => assignRole(dependencies, r, a),
    removeRole: (r, a) => removeRole(dependencies, r, a),
  } satisfies IamAdministration);
}
