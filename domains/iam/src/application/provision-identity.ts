import {
  type IdentityProvisioningDependencies,
  type IdentityProvisioningRequest,
} from './identity-provisioning-dependencies.js';
import { dispatchInvitation, type InvitationDispatchResult } from './invitation-dispatch.js';
import { reconcileIdentity, type ReconcileIdentityResult } from './reconcile-identity.js';

export interface ProvisionIdentityResult {
  readonly identity: ReconcileIdentityResult;
  /** `not-applicable`: the reconciled user is not INVITED, not `SYNCED`, or was already invited. */
  readonly invitation: InvitationDispatchResult | { readonly outcome: 'not-applicable' };
}

/**
 * Provisioning after a committed local change (spec Sections 11–12): identity reconciliation, then
 * the first invitation dispatch whenever reconciliation leaves an INVITED user `SYNCED` with no
 * dispatch attempted yet. Used by user creation, sync-identity, reactivation to INVITED and
 * bootstrap (IAM-MP-10).
 */
export async function provisionIdentity(
  dependencies: IdentityProvisioningDependencies,
  request: IdentityProvisioningRequest,
): Promise<ProvisionIdentityResult> {
  const identity = await reconcileIdentity(dependencies, request);
  if (
    identity.outcome !== 'synced' ||
    identity.user.accessState !== 'INVITED' ||
    identity.user.invitationDeliveryState !== 'NOT_SENT'
  ) {
    return { identity, invitation: { outcome: 'not-applicable' } };
  }
  const invitation = await dispatchInvitation(dependencies, { ...request, kind: 'first' });
  return { identity, invitation };
}
