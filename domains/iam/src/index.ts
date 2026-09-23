/**
 * Public IAM package entry point (spec Section 44). It exposes only what composition roots need:
 * the reference-data synchronization command, the IAM permission manifest, and the identity
 * provisioning capabilities with the dependency types composition supplies. Stores and adapter
 * contracts stay behind the private `@vertex-os/iam/persistence` and
 * `@vertex-os/iam/identity-provider` entries.
 */
export {
  synchronizeIamReferenceData,
  type ReferenceSyncResult,
} from './application/synchronize-reference-data.js';
export {
  iamPermissionManifest,
  type PermissionDefinition,
  type PermissionManifest,
} from './domain/permission-catalog.js';
export type { PermissionCode } from './domain/codes.js';
export type { ReferenceSyncRefusalReason } from './domain/reference-sync-plan.js';
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
export type {
  IdentityFailure,
  IdentityProvisioningDependencies,
  IdentityProvisioningRequest,
} from './application/identity-provisioning-dependencies.js';
export type { ApplicationUser } from './domain/application-user.js';
export type { UserId } from './domain/identifiers.js';
