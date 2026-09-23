/**
 * MOD-IAM's private composition entry (IAM-R04 D-12). The use cases here take their dependencies
 * (repositories, stores, transaction runner, identity provider) as arguments, so only the API's
 * composition roots (`apps/api/src/iam`, `apps/api/src/commands`) and tests may import it
 * (lint-enforced). They bind the use cases to adapters and hand out the bound capabilities; the
 * public root `@vertex-os/iam` exposes no repository or dependency type (spec Section 44).
 */
export { synchronizeIamReferenceData } from './application/synchronize-reference-data.js';
export { reconcileIdentity } from './application/reconcile-identity.js';
export { resendInvitation } from './application/invitation-dispatch.js';
export { provisionIdentity } from './application/provision-identity.js';
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
