import type { NormalizedEmail } from '../../domain/email.js';
import type { UserId } from '../../domain/identifiers.js';

/**
 * A Keycloak identity as IAM needs to see it: the fields ownership proof and the required state
 * depend on (spec Section 11.2). It never carries credential material.
 */
export interface ExternalIdentity {
  /** The identity provider's subject identifier (the Keycloak user ID). */
  readonly subject: string;
  readonly username: string;
  readonly enabled: boolean;
  readonly emailVerified: boolean;
  /** Every value of the `vertexUserId` attribute, as the provider returned them. */
  readonly vertexUserIds: readonly string[];
}

/**
 * Why a provider call did not produce an answer. `unavailable`: the outcome is unknown (network
 * error, timeout, 5xx, 429). `rejected`: the provider definitely refused the request for a reason
 * other than an expected outcome (any other 4xx, including a refused provisioner token). Neither
 * carries upstream detail, which may contain personal data (spec Section 36).
 */
export type IdentityProviderFailure = 'unavailable' | 'rejected';

export type ProviderResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly failure: IdentityProviderFailure };

/** Keycloak required actions an invitation may ask for (spec Section 11.3). */
export const invitationActions = ['VERIFY_EMAIL', 'UPDATE_PASSWORD', 'CONFIGURE_TOTP'] as const;
export type InvitationAction = (typeof invitationActions)[number];

/**
 * The Keycloak operations IAM uses, and only those (spec Section 7.2): find, create, read,
 * enable or disable users, end their sessions, and send them required-action email. Every call is
 * external I/O and MUST NOT run inside a database transaction (spec Section 31).
 */
export interface IdentityProvider {
  /** The issuer identifier bound to every identity of this provider. */
  readonly issuer: string;
  findBySubject(subject: string): Promise<ProviderResult<ExternalIdentity | undefined>>;
  /** Exact, case-sensitive username match. */
  findByUsername(username: NormalizedEmail): Promise<ProviderResult<ExternalIdentity | undefined>>;
  /**
   * Creates an enabled identity whose username and email are `username` and whose `vertexUserId`
   * attribute is set in the same request. `duplicate`: the provider already holds that username
   * or email.
   */
  create(identity: {
    readonly username: NormalizedEmail;
    readonly vertexUserId: UserId;
  }): Promise<
    ProviderResult<
      { readonly outcome: 'created'; readonly subject: string } | { readonly outcome: 'duplicate' }
    >
  >;
  /** Changes only the enabled flag; every other identity field is preserved. */
  setEnabled(subject: string, enabled: boolean): Promise<ProviderResult<'updated' | 'not-found'>>;
  /** Ends every provider session of the identity. */
  terminateSessions(subject: string): Promise<ProviderResult<'terminated' | 'not-found'>>;
  /** Which credential kinds the identity has enrolled; never the credentials themselves. */
  enrolledFactors(
    subject: string,
  ): Promise<ProviderResult<{ readonly password: boolean; readonly otp: boolean } | 'not-found'>>;
  /**
   * Asks the provider to email the identity a link that runs `actions`. `refused`: the provider
   * declined to send, for example for a disabled identity or one without an email address.
   */
  sendInvitation(
    subject: string,
    request: { readonly actions: readonly InvitationAction[]; readonly lifespanSeconds: number },
  ): Promise<ProviderResult<'sent' | 'not-found' | 'refused'>>;
}
