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
  /** The address Keycloak sends required-action email to. */
  readonly email: string | undefined;
  readonly enabled: boolean;
  readonly emailVerified: boolean;
  /** Every value of the `vertexUserId` attribute, as the provider returned them. */
  readonly vertexUserIds: readonly string[];
  /** The identity's own pending required actions, which Keycloak runs at its next authentication. */
  readonly requiredActions: readonly string[];
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

/**
 * What an invitation establishes (spec Section 11.3): email verification, a password and the TOTP
 * the realm requires. Only `VERIFY_EMAIL` ever travels inside an emailed link; the two factor
 * actions are the identity's own required actions (IAM-R02 D-10).
 */
export const invitationActions = ['VERIFY_EMAIL', 'UPDATE_PASSWORD', 'CONFIGURE_TOTP'] as const;
export type InvitationAction = (typeof invitationActions)[number];

/** The factor actions every created identity carries as its own required actions. */
export const factorActions = ['UPDATE_PASSWORD', 'CONFIGURE_TOTP'] as const;

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
   * Creates an enabled identity whose username and email are `username`, with the `vertexUserId`
   * attribute and the `factorActions` as required actions set in the same request. `duplicate`:
   * the provider already holds that username or email.
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
   * Emails the identity a link that verifies its address; Keycloak then runs the identity's own
   * required actions. The link carries no factor action, so a link left unused after enrolment can
   * replace nothing (R01 S-01, R02 S-01). `refused`: the provider declined to send, for example
   * for a disabled identity or one without an email address.
   */
  sendInvitation(
    subject: string,
    request: { readonly lifespanSeconds: number },
  ): Promise<ProviderResult<'sent' | 'not-found' | 'refused'>>;
}
