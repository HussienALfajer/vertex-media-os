import {
  createAuditEntry,
  type AuditAttribution,
  type AuditChangeSide,
  type AuditRecorder,
  type AuditResult,
} from '@vertex-os/audit';
import type { ApplicationUser } from '../domain/application-user.js';
import type { UserId } from '../domain/identifiers.js';
import type { ApplicationUserRepository } from './ports/application-user-repository.js';
import type { IamTransactionRunner } from './ports/iam-transaction.js';
import type { IdentityProvider, IdentityProviderFailure } from './ports/identity-provider.js';

/** What identity reconciliation and invitation delivery need; composition supplies it. */
export interface IdentityProvisioningDependencies {
  /** Reads the committed user outside any transaction. */
  readonly users: Pick<ApplicationUserRepository, 'findById'>;
  readonly runner: IamTransactionRunner;
  readonly identityProvider: IdentityProvider;
  /** Validity of an invitation link, in seconds. */
  readonly invitationLifespanSeconds: number;
}

/** Who asks for the operation, for which request, and why; recorded in every Audit entry. */
export interface IdentityProvisioningRequest {
  readonly userId: UserId;
  readonly attribution: AuditAttribution;
}

/** Why identity synchronization or a dispatch did not succeed. Stable, safe to log. */
export type IdentityFailure =
  'identity-conflict' | 'identity-out-of-sync' | 'provider-unavailable' | 'provider-rejected';

export function providerFailure(
  failure: IdentityProviderFailure,
): 'provider-unavailable' | 'provider-rejected' {
  return failure === 'unavailable' ? 'provider-unavailable' : 'provider-rejected';
}

/** Lost races re-run an operation against the newly committed state at most this often. */
export const MAX_ATTEMPTS = 3;

/** Signals a lost optimistic-concurrency race: re-read the committed user and start again. */
export const RETRY = Symbol('retry');

export async function appendUserAudit(
  audit: AuditRecorder,
  attribution: AuditAttribution,
  user: ApplicationUser,
  action: string,
  result: AuditResult,
  change: { readonly before?: AuditChangeSide; readonly after?: AuditChangeSide },
): Promise<void> {
  const entry = createAuditEntry({
    sourceModule: 'iam',
    action,
    actor: attribution.actor,
    target: { type: 'iam.user', id: user.id },
    result,
    traceId: attribution.traceId,
    ...(attribution.reason === undefined ? {} : { reason: attribution.reason }),
    change,
  });
  // An invalid entry is a programming error: throwing rolls the state write back (spec Section 50).
  if (!entry.ok)
    throw new Error(`Identity provisioning built an invalid audit entry (${entry.reason}).`);
  await audit.append(entry.value);
}
