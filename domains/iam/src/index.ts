/**
 * Public IAM package entry point (spec Section 44): identifiers, codes, the authorization context
 * and its permission check, the permission manifest, and the request and result types of the IAM
 * capabilities. It exposes no repository, store, transaction runner, dependency type or mutable
 * entity. The use cases that take those as dependencies are behind the private composition entry
 * `@vertex-os/iam/composition`, which only the API's composition roots import (IAM-R04 D-12);
 * adapter contracts stay behind `@vertex-os/iam/persistence` and `@vertex-os/iam/identity-provider`.
 */
export type { ReferenceSyncResult } from './application/synchronize-reference-data.js';
export {
  iamPermissionManifest,
  type PermissionDefinition,
  type PermissionManifest,
} from './domain/permission-catalog.js';
export type { PermissionCode } from './domain/codes.js';
export type { ReferenceSyncRefusalReason } from './domain/reference-sync-plan.js';
export type {
  IdentityFailure,
  IdentityProvisioningRequest,
} from './application/identity-provisioning-dependencies.js';
export type {
  ResolveSessionUserResult,
  SessionUser,
  SignInRequest,
  SignInResult,
} from './application/sign-in.js';
export { hasPermission, type AuthorizationContext } from './domain/authorization-context.js';
export type {
  AuthorizationDenial,
  ResolveAuthorizationContextResult,
} from './application/authorization.js';
export type { DepartmentId, UserId } from './domain/identifiers.js';
