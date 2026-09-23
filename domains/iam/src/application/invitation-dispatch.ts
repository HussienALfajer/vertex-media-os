import type { ApplicationUser } from '../domain/application-user.js';
import {
  appendUserAudit,
  MAX_ATTEMPTS,
  providerFailure,
  RETRY,
  type IdentityFailure,
  type IdentityProvisioningDependencies,
  type IdentityProvisioningRequest,
} from './identity-provisioning-dependencies.js';
import { outstandingInvitationActions, provesOwnership } from './identity-rules.js';
import { factorActions, type InvitationAction } from './ports/identity-provider.js';
import type { IamTransactionScope } from './ports/iam-transaction.js';

/** `first`: the dispatch provisioning performs once; `resend`: an explicit repeat (spec Section 11.3). */
export type InvitationDispatchKind = 'first' | 'resend';

export type InvitationDispatchResult =
  | {
      readonly outcome: 'sent';
      readonly actions: readonly InvitationAction[];
      readonly user: ApplicationUser;
    }
  | {
      readonly outcome: 'failed';
      readonly failure: IdentityFailure;
      readonly user: ApplicationUser;
    }
  /** The identity has verified its email and enrolled a password and OTP; nothing is sent. */
  | { readonly outcome: 'no-action-required'; readonly user: ApplicationUser }
  /** A first dispatch found an earlier attempt; only an explicit resend dispatches again. */
  | { readonly outcome: 'already-attempted'; readonly user: ApplicationUser }
  | { readonly outcome: 'not-invited' }
  | { readonly outcome: 'sync-incomplete' }
  | { readonly outcome: 'not-found' }
  | { readonly outcome: 'superseded' };

type Attempt = InvitationDispatchResult | typeof RETRY;

/**
 * Invitation delivery (spec Section 11.3), separate from identity reconciliation. It requires an
 * INVITED user whose identity is bound and `SYNCED`, reads the identity to ask only for the
 * factors it still lacks, records the attempt before calling Keycloak (so concurrent first
 * dispatches send at most one email and an interrupted one reads as `FAILED`), and records the
 * outcome. A failure never rolls back the identity or changes `accessState`; it changes
 * `identitySyncState` only when Keycloak shows the identity missing or disabled.
 */
export async function dispatchInvitation(
  dependencies: IdentityProvisioningDependencies,
  request: IdentityProvisioningRequest & { readonly kind: InvitationDispatchKind },
): Promise<InvitationDispatchResult> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const result = await dispatchOnce(dependencies, request);
    if (result !== RETRY) return result;
  }
  return { outcome: 'superseded' };
}

/** Explicit resend: safe to repeat, never alters credentials or required actions. */
export function resendInvitation(
  dependencies: IdentityProvisioningDependencies,
  request: IdentityProvisioningRequest,
): Promise<InvitationDispatchResult> {
  return dispatchInvitation(dependencies, { ...request, kind: 'resend' });
}

async function dispatchOnce(
  dependencies: IdentityProvisioningDependencies,
  request: IdentityProvisioningRequest & { readonly kind: InvitationDispatchKind },
): Promise<Attempt> {
  const user = await dependencies.users.findById(request.userId);
  if (!user) return { outcome: 'not-found' };
  if (user.accessState !== 'INVITED') return { outcome: 'not-invited' };
  if (!user.identity || user.identitySyncState !== 'SYNCED') return { outcome: 'sync-incomplete' };
  if (request.kind === 'first' && user.invitationDeliveryState !== 'NOT_SENT') {
    return { outcome: 'already-attempted', user };
  }

  const provider = dependencies.identityProvider;
  const subject = user.identity.subject;
  const identity = await provider.findBySubject(subject);
  if (!identity.ok) return { outcome: 'failed', failure: providerFailure(identity.failure), user };
  if (!identity.value) return recordMismatch(dependencies, request, user, 'identity-conflict');
  // Defence in depth: the link goes to the identity's email, so it must still be this user's.
  if (!provesOwnership(identity.value, user) || identity.value.email !== user.email) {
    return recordMismatch(dependencies, request, user, 'identity-conflict');
  }
  // Keycloak refuses email actions for a disabled identity; INVITED requires an enabled one.
  if (!identity.value.enabled)
    return recordMismatch(dependencies, request, user, 'identity-out-of-sync');
  const factors = await provider.enrolledFactors(subject);
  if (!factors.ok) return { outcome: 'failed', failure: providerFailure(factors.failure), user };
  if (factors.value === 'not-found') {
    return recordMismatch(dependencies, request, user, 'identity-conflict');
  }

  const actions = outstandingInvitationActions(identity.value, factors.value);
  if (actions.length === 0) return { outcome: 'no-action-required', user };
  // A missing factor is established only through the identity's own required action; without it
  // the link could not lead the user to it.
  const pending = new Set(identity.value.requiredActions);
  if (factorActions.some((action) => actions.includes(action) && !pending.has(action))) {
    return recordMismatch(dependencies, request, user, 'identity-out-of-sync');
  }

  // The claim: from here on the outcome is unknown until Keycloak confirms it.
  const claim = await dependencies.runner.run(async ({ users, audit }) => {
    const result = await users.recordInvitationDelivery({
      id: user.id,
      expectedVersion: user.version,
      state: 'FAILED',
    });
    if (result.outcome === 'updated') {
      await appendUserAudit(
        audit,
        request.attribution,
        result.user,
        'iam.user.invitation-dispatch-started',
        'SUCCEEDED',
        {
          before: { invitationDeliveryState: user.invitationDeliveryState },
          after: { invitationDeliveryState: 'FAILED', dispatch: request.kind, actions },
        },
      );
    }
    return result;
  });
  if (claim.outcome !== 'updated') return RETRY;

  const sent = await provider.sendInvitation(subject, {
    lifespanSeconds: dependencies.invitationLifespanSeconds,
  });
  let failure: IdentityFailure | undefined;
  let identityFailure: IdentityFailure | undefined;
  if (!sent.ok) failure = providerFailure(sent.failure);
  else if (sent.value === 'not-found') failure = identityFailure = 'identity-conflict';
  else if (sent.value === 'refused') failure = identityFailure = 'identity-out-of-sync';

  return recordDispatch(dependencies, request, claim.user, actions, failure, identityFailure);
}

/**
 * Records the dispatch outcome on the claimed attempt. A competing change after the claim moves
 * the version on; the outcome is then recorded on the newer version, unless another dispatch has
 * recorded its own outcome in the meantime. An identity mismatch is recorded only on the claimed
 * version.
 */
async function recordDispatch(
  dependencies: IdentityProvisioningDependencies,
  request: IdentityProvisioningRequest & { readonly kind: InvitationDispatchKind },
  claimed: ApplicationUser,
  actions: readonly InvitationAction[],
  failure: IdentityFailure | undefined,
  identityFailure: IdentityFailure | undefined,
): Promise<InvitationDispatchResult> {
  let user = claimed;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const current = user;
    const written = await dependencies.runner.run(async (scope) => {
      const delivery = await scope.users.recordInvitationDelivery({
        id: current.id,
        expectedVersion: current.version,
        state: failure === undefined ? 'SENT' : 'FAILED',
      });
      if (delivery.outcome !== 'updated') return delivery;
      await appendUserAudit(
        scope.audit,
        request.attribution,
        delivery.user,
        'iam.user.invitation-dispatched',
        failure === undefined ? 'SUCCEEDED' : 'FAILED',
        {
          before: { invitationDeliveryState: current.invitationDeliveryState },
          after: {
            invitationDeliveryState: delivery.user.invitationDeliveryState,
            dispatch: request.kind,
            actions: [...actions],
            ...(failure === undefined ? {} : { failure }),
          },
        },
      );
      // A mismatch Keycloak showed describes the state at the claim. After a competing change
      // (for example a suspension already reconciled), it may no longer hold: record only the
      // dispatch outcome and leave identitySyncState to that change's own reconciliation.
      if (identityFailure === undefined || current !== claimed) return delivery;
      const mismatch = await writeMismatch(scope, request, delivery.user, identityFailure);
      // The row is locked by the delivery write above; anything else is a programming error, and
      // throwing rolls both writes back.
      if (mismatch.outcome !== 'updated') {
        throw new Error('Recording an identity mismatch after a dispatch did not apply.');
      }
      return mismatch;
    });
    if (written.outcome === 'updated') {
      return failure === undefined
        ? { outcome: 'sent', actions, user: written.user }
        : { outcome: 'failed', failure, user: written.user };
    }
    const reread = await dependencies.users.findById(claimed.id);
    if (!reread || reread.invitationDeliveryState !== 'FAILED') return { outcome: 'superseded' };
    user = reread;
  }
  return { outcome: 'superseded' };
}

async function recordMismatch(
  dependencies: IdentityProvisioningDependencies,
  request: IdentityProvisioningRequest,
  user: ApplicationUser,
  failure: IdentityFailure,
): Promise<Attempt> {
  const written = await dependencies.runner.run((scope) =>
    writeMismatch(scope, request, user, failure),
  );
  return written.outcome === 'updated' ? { outcome: 'failed', failure, user: written.user } : RETRY;
}

/** Keycloak no longer matches what IAM requires: record `FAILED` so reconciliation repairs it. */
async function writeMismatch(
  scope: IamTransactionScope,
  request: IdentityProvisioningRequest,
  user: ApplicationUser,
  failure: IdentityFailure,
) {
  const result = await scope.users.recordIdentitySync({
    id: user.id,
    expectedVersion: user.version,
    state: 'FAILED',
  });
  if (result.outcome === 'updated') {
    await appendUserAudit(
      scope.audit,
      request.attribution,
      result.user,
      'iam.user.identity-mismatch-detected',
      'FAILED',
      {
        before: { identitySyncState: user.identitySyncState },
        after: { identitySyncState: 'FAILED', failure },
      },
    );
  }
  return result;
}
