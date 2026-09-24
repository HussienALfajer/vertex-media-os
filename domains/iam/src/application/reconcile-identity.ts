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
import { provesOwnership, requiredIdentityState } from './identity-rules.js';
import { factorActions, type ExternalIdentity } from './ports/identity-provider.js';

/** What reconciliation did in Keycloak, in order; recorded as Audit evidence. */
export type ReconciliationStep =
  'created' | 'bound' | 'enabled' | 'disabled' | 'sessions-terminated';

export type ReconcileIdentityResult =
  | { readonly outcome: 'synced'; readonly user: ApplicationUser }
  | {
      readonly outcome: 'failed';
      readonly failure: SyncFailure;
      readonly user: ApplicationUser;
    }
  | { readonly outcome: 'not-found' }
  /**
   * Competing changes kept winning before this reconciliation changed Keycloak; the committed state
   * was left to the operations that made them.
   */
  | { readonly outcome: 'superseded' };

type Attempt = ReconcileIdentityResult | typeof RETRY;
type SyncFailure = IdentityFailure;
type SyncOutcome =
  { readonly state: 'SYNCED' } | { readonly state: 'FAILED'; readonly failure: SyncFailure };

/**
 * Identity reconciliation (spec Section 11.2): the single IAM capability that creates, links,
 * enables or disables Keycloak identities. It reads the committed user, derives what Keycloak must
 * look like from its access state, makes Keycloak match, and records `SYNCED`, or `FAILED` with a
 * stable category, without ever changing `accessState`. Idempotent and safe to repeat in any
 * `identitySyncState`. Keycloak calls happen only between transactions (spec Section 31); every
 * write is conditional on the version its decision was computed from, and a lost race re-runs the
 * whole reconciliation against the new committed state.
 */
export async function reconcileIdentity(
  dependencies: IdentityProvisioningDependencies,
  request: IdentityProvisioningRequest,
): Promise<ReconcileIdentityResult> {
  // Keycloak changes made by attempts whose outcome lost a race.
  const applied: ReconciliationStep[] = [];
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const result = await reconcileOnce(dependencies, request, applied);
    if (result !== RETRY) return result;
  }
  if (applied.length === 0) return { outcome: 'superseded' };
  // A stale attempt may have changed Keycloak after a competing reconciliation recorded SYNCED
  // (for example created or enabled an identity for a user who was terminated meanwhile). Keycloak
  // may therefore no longer match: record FAILED on the latest version so sync-identity repairs it,
  // as spec Section 31.2 step 6 does for reactivation.
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const user = await dependencies.users.findById(request.userId);
    if (!user) return { outcome: 'not-found' };
    const result = await recordOutcome(
      dependencies,
      request,
      user,
      { state: 'FAILED', failure: 'identity-out-of-sync' },
      applied,
    );
    if (result !== RETRY) return result;
  }
  return { outcome: 'superseded' };
}

async function reconcileOnce(
  dependencies: IdentityProvisioningDependencies,
  request: IdentityProvisioningRequest,
  applied: ReconciliationStep[],
): Promise<Attempt> {
  const committed = await dependencies.users.findById(request.userId);
  if (!committed) return { outcome: 'not-found' };
  const steps: ReconciliationStep[] = [];
  const result = await bringIdentityTo(
    dependencies,
    request,
    committed,
    requiredIdentityState(committed.accessState),
    steps,
    applied,
  );
  if (result === RETRY) return RETRY;
  if (result.kind === 'failed') {
    return recordOutcome(
      dependencies,
      request,
      result.user,
      { state: 'FAILED', failure: result.failure },
      steps,
    );
  }
  // A converged run writes nothing; ending sessions of a denied identity is not a state change.
  const changed = steps.some((step) => step !== 'sessions-terminated');
  if (result.user.identitySyncState === 'SYNCED' && !changed) {
    return { outcome: 'synced', user: result.user };
  }
  return recordOutcome(dependencies, request, result.user, { state: 'SYNCED' }, steps);
}

export type IdentityForReactivation =
  | {
      readonly outcome: 'ready';
      readonly user: ApplicationUser;
      readonly steps: readonly ReconciliationStep[];
    }
  | { readonly outcome: 'failed'; readonly failure: SyncFailure }
  /** A competing change won; Keycloak may have been changed and must be reconciled again. */
  | { readonly outcome: 'superseded' };

/**
 * Reactivation's identity step (spec Section 31.2 step 3; IAM-R06 D-08): the reconciliation steps
 * with the target's requirement (`enabled`) substituted for the committed state's, against exactly
 * the version reactivation wrote in step 2, without re-reading. It never records `SYNCED`: only
 * the final commit, together with the target state, does. A failure records `FAILED` on that
 * version.
 */
export async function enableIdentityForReactivation(
  dependencies: IdentityProvisioningDependencies,
  request: IdentityProvisioningRequest,
  user: ApplicationUser,
): Promise<IdentityForReactivation> {
  const steps: ReconciliationStep[] = [];
  const result = await bringIdentityTo(dependencies, request, user, 'enabled', steps, []);
  if (result === RETRY) return { outcome: 'superseded' };
  if (result.kind === 'ready') return { outcome: 'ready', user: result.user, steps };
  const recorded = await recordOutcome(
    dependencies,
    request,
    result.user,
    { state: 'FAILED', failure: result.failure },
    steps,
  );
  return recorded === RETRY
    ? { outcome: 'superseded' }
    : { outcome: 'failed', failure: result.failure };
}

type IdentityStepResult =
  | { readonly kind: 'ready'; readonly user: ApplicationUser }
  | { readonly kind: 'failed'; readonly failure: SyncFailure; readonly user: ApplicationUser }
  | typeof RETRY;

/**
 * Brings Keycloak to `required` for `committed` as it stands at its version (spec Section 11.2
 * steps 1 to 6). Binding raises the version; the returned user is the latest one this attempt
 * wrote. A lost binding race is `RETRY`. The caller records the outcome.
 */
async function bringIdentityTo(
  dependencies: IdentityProvisioningDependencies,
  request: IdentityProvisioningRequest,
  committed: ApplicationUser,
  required: 'enabled' | 'disabled',
  steps: ReconciliationStep[],
  applied: ReconciliationStep[],
): Promise<IdentityStepResult> {
  const provider = dependencies.identityProvider;
  let user = committed;
  const fail = (failure: SyncFailure): IdentityStepResult => ({ kind: 'failed', failure, user });

  let identity: ExternalIdentity;
  if (user.identity) {
    // A binding never changes (spec Section 9.1): a different issuer or a vanished identity is a
    // conflict an operator resolves, never a reason to re-link.
    if (user.identity.issuer !== provider.issuer) return fail('identity-conflict');
    const found = await provider.findBySubject(user.identity.subject);
    if (!found.ok) return fail(providerFailure(found.failure));
    if (!found.value) return fail('identity-conflict');
    identity = found.value;
    // Access-reducing steps apply to a bound identity without further proof (step 2).
    if (required === 'enabled' && !provesOwnership(identity, user))
      return fail('identity-conflict');
  } else {
    const found = await provider.findByUsername(user.email);
    if (!found.ok) return fail(providerFailure(found.failure));
    if (found.value) {
      if (!provesOwnership(found.value, user)) return fail('identity-conflict');
      identity = found.value;
    } else if (required === 'disabled') {
      // Nothing to disable, and nothing is ever created for a denied user.
      return { kind: 'ready', user };
    } else {
      const created = await provider.create({ username: user.email, vertexUserId: user.id });
      if (!created.ok) {
        // An unknown outcome may still have changed Keycloak (a lost response).
        if (created.failure === 'unavailable') applied.push('created');
        return fail(providerFailure(created.failure));
      }
      if (created.value.outcome === 'created') {
        steps.push('created');
        applied.push('created');
        identity = {
          subject: created.value.subject,
          username: user.email,
          email: user.email,
          enabled: true,
          emailVerified: false,
          vertexUserIds: [user.id],
          requiredActions: [...factorActions],
        };
      } else {
        // A concurrent or previously lost create: find it and link it instead of duplicating it
        // (step 4). Still nothing under the username means the email is held by another identity.
        const again = await provider.findByUsername(user.email);
        if (!again.ok) return fail(providerFailure(again.failure));
        if (!again.value || !provesOwnership(again.value, user)) return fail('identity-conflict');
        identity = again.value;
      }
    }

    const bound = identity;
    const binding = await dependencies.runner.run(async ({ users, audit }) => {
      const result = await users.bindIdentity({
        id: user.id,
        expectedVersion: user.version,
        issuer: provider.issuer,
        subject: bound.subject,
      });
      if (result.outcome === 'updated') {
        await appendUserAudit(
          audit,
          request.attribution,
          result.user,
          'iam.user.identity-bound',
          'SUCCEEDED',
          {
            after: { identityIssuer: provider.issuer, identitySubject: bound.subject },
          },
        );
      }
      return result;
    });
    if (binding.outcome === 'identity-taken') return fail('identity-conflict');
    if (binding.outcome !== 'updated') return RETRY;
    user = binding.user;
    steps.push('bound');
  }

  const subject = identity.subject;
  if (required === 'enabled') {
    if (!identity.enabled) {
      const enabled = await provider.setEnabled(subject, true);
      if (!enabled.ok) {
        // An unknown outcome may still have changed Keycloak (a lost response).
        if (enabled.failure === 'unavailable') applied.push('enabled');
        return fail(providerFailure(enabled.failure));
      }
      if (enabled.value === 'not-found') return fail('identity-conflict');
      steps.push('enabled');
      applied.push('enabled');
    }
  } else {
    if (identity.enabled) {
      const disabled = await provider.setEnabled(subject, false);
      if (!disabled.ok) {
        // An unknown outcome may still have changed Keycloak (a lost response).
        if (disabled.failure === 'unavailable') applied.push('disabled');
        return fail(providerFailure(disabled.failure));
      }
      if (disabled.value === 'not-found') return fail('identity-conflict');
      steps.push('disabled');
      applied.push('disabled');
    }
    // Always: a session may have started before the identity was disabled (spec Section 31.1).
    const terminated = await provider.terminateSessions(subject);
    if (!terminated.ok) return fail(providerFailure(terminated.failure));
    if (terminated.value === 'not-found') return fail('identity-conflict');
    steps.push('sessions-terminated');
  }
  return { kind: 'ready', user };
}

async function recordOutcome(
  dependencies: IdentityProvisioningDependencies,
  request: IdentityProvisioningRequest,
  user: ApplicationUser,
  outcome: SyncOutcome,
  steps: readonly ReconciliationStep[],
): Promise<Attempt> {
  const written = await dependencies.runner.run(async ({ users, audit }) => {
    const result = await users.recordIdentitySync({
      id: user.id,
      expectedVersion: user.version,
      state: outcome.state,
    });
    if (result.outcome === 'updated') {
      await appendUserAudit(
        audit,
        request.attribution,
        result.user,
        'iam.user.identity-reconciled',
        outcome.state === 'SYNCED' ? 'SUCCEEDED' : 'FAILED',
        {
          before: { identitySyncState: user.identitySyncState },
          after: {
            identitySyncState: outcome.state,
            steps: [...steps],
            ...(outcome.state === 'FAILED' ? { failure: outcome.failure } : {}),
          },
        },
      );
    }
    return result;
  });
  if (written.outcome !== 'updated') return RETRY;
  return outcome.state === 'SYNCED'
    ? { outcome: 'synced', user: written.user }
    : { outcome: 'failed', failure: outcome.failure, user: written.user };
}
