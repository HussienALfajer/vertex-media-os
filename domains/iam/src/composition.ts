/**
 * MOD-IAM's private composition entry (IAM-R04 D-12). The use cases here take their dependencies
 * (repositories, stores, transaction runner, identity provider) as arguments, and the provisioning
 * results carry the whole user entity, so only the API's
 * composition roots (`apps/api/src/iam`, `apps/api/src/commands`) and tests may import it
 * (lint-enforced). They bind the use cases to adapters and hand out the bound capabilities; the
 * public root `@vertex-os/iam` exposes no repository or dependency type (spec Section 44).
 */
export { synchronizeIamReferenceData } from './application/synchronize-reference-data.js';
export {
  reconcileIdentity,
  type ReconcileIdentityResult,
  type ReconciliationStep,
} from './application/reconcile-identity.js';
export {
  resendInvitation,
  type InvitationDispatchResult,
} from './application/invitation-dispatch.js';
export {
  provisionIdentity,
  type ProvisionIdentityResult,
} from './application/provision-identity.js';
export type { IdentityProvisioningDependencies } from './application/identity-provisioning-dependencies.js';
export {
  resolveIdentityUser,
  resolveSessionUser,
  signIn,
  type SignInDependencies,
} from './application/sign-in.js';
export {
  recordAuthorizationDenial,
  resolveAuthorizationContext,
  type AuthorizationDependencies,
} from './application/authorization.js';
export {
  activateDepartment,
  addMembership,
  createDepartment,
  deactivateDepartment,
  removeMembership,
  setPrimaryMembership,
  updateDepartment,
  type OrganizationAdministrationDependencies,
} from './application/administer-organization.js';
export {
  activateRole,
  assignRole,
  createRole,
  deactivateRole,
  removeRole,
  replaceRolePermissions,
  updateRole,
  type RoleAdministrationDependencies,
} from './application/administer-roles.js';
export {
  createUser,
  disableUser,
  initializePassword,
  reactivateUser,
  resendUserInvitation,
  revokeUserSessions,
  suspendUser,
  syncIdentity,
  terminateUser,
  updateDisplayName,
  type UserAdministrationDependencies,
} from './application/administer-users.js';
export {
  bootstrapSystemAdministrator,
  recoverMigratedAdministratorCredential,
} from './application/bootstrap.js';
export type {
  SessionRevocation,
  SessionRevocationReason,
} from './application/ports/session-revocation.js';
export {
  getDepartment,
  getRole,
  getUser,
  listDepartments,
  listPermissions,
  listRoles,
  listUsers,
  type DirectoryDependencies,
} from './application/directory.js';
