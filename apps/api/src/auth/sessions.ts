import type { AuditAttribution } from '@vertex-os/audit';
import type { AuthConfig } from '../config/auth-config.js';
import type { OidcClient } from './oidc.js';
import { csrfTokenFor, hashSecret, isSecretShaped, matchesHash, newSecret } from './secrets.js';
import type {
  LoginAttemptSecrets,
  RevocationReason,
  SessionStore,
  StoredSession,
} from './session-store.js';
import type { TokenCiphers } from './token-cipher.js';

/** A request's session after validation: live and not revoked. Never carries the raw secret. */
export interface ValidSession {
  readonly id: string;
  readonly userId: string;
  readonly csrfTokenHash: string;
  readonly idleExpiresAt: Date;
  readonly absoluteExpiresAt: Date;
  readonly idToken: StoredSession['idToken'];
}

/**
 * What happened to the identity-provider session on this request (IAM-R03F D-05): `not-due` (within
 * the interval, or another request re-validates), `refreshed`, `unavailable` (Keycloak could not be
 * reached; the idle deadline stays), or `unsupported` (no usable refresh token; it never slides).
 */
export type Revalidation = 'not-due' | 'refreshed' | 'unavailable' | 'unsupported';

export type SessionLookup =
  | {
      readonly outcome: 'valid';
      readonly session: ValidSession;
      readonly revalidation: Revalidation;
    }
  /** No such session, a malformed value, or a revoked session. */
  | { readonly outcome: 'invalid' }
  | { readonly outcome: 'expired' }
  /** The identity provider refused to refresh its session; this session is now revoked. */
  | { readonly outcome: 'ended' };

/**
 * A session is re-validated against the identity provider, and its idle deadline slides, at most
 * once a minute (IAM-R03F D-03), so ordinary traffic neither writes nor calls Keycloak on every
 * request.
 */
export const TOUCH_INTERVAL_MS = 60_000;

/**
 * The application-session policy of IAM-R03 D-03, D-04, D-17 and D-18 and IAM-R03F D-02 to D-05 on
 * top of the store: secret generation, idle and absolute expiry, re-validation against the identity
 * provider with sliding refresh, CSRF proof and token sealing.
 */
export interface SessionService {
  /** Stores a login attempt and returns the handle for the browser's login cookie. */
  startLogin(secrets: LoginAttemptSecrets): Promise<string>;
  finishLogin(handle: string | undefined): ReturnType<SessionStore['consumeLoginAttempt']>;
  /** Creates a session; returns the secret for the session cookie, which nothing else keeps. */
  establish(input: {
    readonly userId: string;
    readonly idpSessionId: string | undefined;
    readonly idToken: string | undefined;
    readonly refreshToken: string | undefined;
    readonly attribution: AuditAttribution;
  }): Promise<{ readonly secret: string; readonly session: StoredSession }>;
  /**
   * Resolves a cookie value to a session. When the interval has passed, re-validates it against
   * the identity provider and slides its idle deadline only if the provider refreshed its session;
   * a refusal revokes the session with `attribution` (IAM-R03F D-02 to D-05).
   */
  authenticate(secret: string | undefined, attribution: AuditAttribution): Promise<SessionLookup>;
  /** The CSRF synchronizer token of the session whose secret is `secret`. */
  csrfToken(secret: string): string;
  verifyCsrf(session: ValidSession, presented: string | undefined): boolean;
  /** The decrypted ID token, when one is stored and still decrypts (D-17). */
  idTokenOf(session: ValidSession): string | undefined;
  revoke(
    session: { readonly id: string },
    reason: RevocationReason,
    attribution: AuditAttribution,
  ): Promise<boolean>;
  revokeUserSessions(
    userId: string,
    reason: RevocationReason,
    attribution: AuditAttribution,
  ): Promise<number>;
  revokeIdpSession(
    idpSessionId: string,
    reason: RevocationReason,
    attribution: AuditAttribution,
  ): Promise<number>;
}

export interface SessionServiceOptions {
  readonly store: SessionStore;
  readonly ciphers: TokenCiphers;
  /** Refreshes the identity provider's session (IAM-R03F D-01). */
  readonly provider: Pick<OidcClient, 'refreshSession'>;
  readonly limits: AuthConfig['session'];
  /** The current time; tests move it to cross deadlines. */
  readonly now?: () => Date;
}

export function createSessionService(options: SessionServiceOptions): SessionService {
  const { store, ciphers, provider, limits } = options;
  const now = options.now ?? (() => new Date());
  const idleMs = limits.idleTimeoutSeconds * 1000;
  const absoluteMs = limits.absoluteTimeoutSeconds * 1000;
  const attemptMs = limits.loginAttemptTimeoutSeconds * 1000;

  const idleDeadline = (at: Date, absolute: Date) =>
    new Date(Math.min(at.getTime() + idleMs, absolute.getTime()));

  const service: SessionService = {
    async startLogin(secrets: LoginAttemptSecrets) {
      const handle = newSecret();
      const createdAt = now();
      await store.createLoginAttempt({
        ...secrets,
        handleHash: hashSecret(handle),
        createdAt,
        expiresAt: new Date(createdAt.getTime() + attemptMs),
      });
      return handle;
    },

    async finishLogin(handle: string | undefined) {
      if (!isSecretShaped(handle)) return { outcome: 'missing' as const };
      return store.consumeLoginAttempt(hashSecret(handle), now());
    },

    async establish({ userId, idpSessionId, idToken, refreshToken, attribution }) {
      const secret = newSecret();
      const createdAt = now();
      const absoluteExpiresAt = new Date(createdAt.getTime() + absoluteMs);
      const session = await store.createSession({
        tokenHash: hashSecret(secret),
        csrfTokenHash: hashSecret(csrfTokenFor(secret)),
        userId,
        idpSessionId,
        createdAt,
        idleExpiresAt: idleDeadline(createdAt, absoluteExpiresAt),
        absoluteExpiresAt,
        sealTokens: (sessionId) => ({
          idToken: seal(ciphers.idToken, idToken, sessionId),
          refreshToken: seal(ciphers.refreshToken, refreshToken, sessionId),
        }),
        attribution,
      });
      return { secret, session };
    },

    async authenticate(secret: string | undefined, attribution: AuditAttribution) {
      if (!isSecretShaped(secret)) return { outcome: 'invalid' };
      const stored = await store.findByTokenHash(hashSecret(secret));
      if (stored === undefined || stored.revokedAt !== undefined) return { outcome: 'invalid' };
      const at = now();
      if (
        stored.idleExpiresAt.getTime() <= at.getTime() ||
        stored.absoluteExpiresAt.getTime() <= at.getTime()
      ) {
        if (stored.idToken !== undefined || stored.refreshToken !== undefined)
          await store.discardExpiredTokens({ id: stored.id, now: at });
        return { outcome: 'expired' };
      }
      const valid = (
        revalidation: Revalidation,
        idleExpiresAt = stored.idleExpiresAt,
        idToken = stored.idToken,
      ): SessionLookup => ({
        outcome: 'valid',
        revalidation,
        session: {
          id: stored.id,
          userId: stored.userId,
          csrfTokenHash: stored.csrfTokenHash,
          idleExpiresAt,
          absoluteExpiresAt: stored.absoluteExpiresAt,
          idToken,
        },
      });
      if (at.getTime() - stored.lastSeenAt.getTime() < TOUCH_INTERVAL_MS) return valid('not-due');

      // Claim, refresh, apply (IAM-R03F D-04, D-07): only the request that claims the interval
      // calls Keycloak, and no transaction is open while it does.
      const claimed = await store.claimRevalidation({
        id: stored.id,
        now: at,
        seenBefore: new Date(at.getTime() - TOUCH_INTERVAL_MS),
      });
      if (!claimed) return valid('not-due');
      const sealed = stored.refreshToken;
      const refreshToken =
        sealed === undefined
          ? undefined
          : ciphers.refreshToken.decrypt(sealed.ciphertext, sealed.keyVersion, stored.id);
      // Without a usable refresh token the session cannot be re-validated, so it never slides.
      if (sealed === undefined || refreshToken === undefined) return valid('unsupported');

      const refreshed = await provider.refreshSession({
        refreshToken,
        idpSessionId: stored.idpSessionId,
        idToken:
          stored.idToken === undefined
            ? undefined
            : ciphers.idToken.decrypt(
                stored.idToken.ciphertext,
                stored.idToken.keyVersion,
                stored.id,
              ),
      });
      if (!refreshed.ok) {
        // An outage keeps the current deadline without sliding it; the next interval retries.
        if (refreshed.failure === 'unavailable') return valid('unavailable');
        await store.revoke({
          id: stored.id,
          reason: 'PROVIDER_SESSION_ENDED',
          now: now(),
          attribution,
        });
        return { outcome: 'ended' };
      }

      const idleExpiresAt = idleDeadline(at, stored.absoluteExpiresAt);
      const idToken = seal(ciphers.idToken, refreshed.value.idToken, stored.id);
      const applied = await store.applyRevalidation({
        id: stored.id,
        now: now(),
        claimedAt: at,
        replaces: sealed.ciphertext,
        idleExpiresAt,
        tokens: {
          refreshToken: {
            ciphertext: ciphers.refreshToken.encrypt(refreshed.value.refreshToken, stored.id),
            keyVersion: ciphers.refreshToken.keyVersion,
          },
          idToken,
        },
      });
      // The session was revoked, expired or had its tokens discarded while Keycloak answered: it
      // stays ended.
      if (!applied) return { outcome: 'invalid' };
      return valid('refreshed', idleExpiresAt, idToken ?? stored.idToken);
    },

    csrfToken: csrfTokenFor,

    verifyCsrf(session: ValidSession, presented: string | undefined) {
      return matchesHash(presented, session.csrfTokenHash);
    },

    idTokenOf(session: ValidSession) {
      return session.idToken === undefined
        ? undefined
        : ciphers.idToken.decrypt(
            session.idToken.ciphertext,
            session.idToken.keyVersion,
            session.id,
          );
    },

    revoke(session, reason, attribution) {
      return store.revoke({ id: session.id, reason, now: now(), attribution });
    },

    revokeUserSessions(userId, reason, attribution) {
      return store.revokeUserSessions({ userId, reason, now: now(), attribution });
    },

    revokeIdpSession(idpSessionId, reason, attribution) {
      return store.revokeIdpSession({ idpSessionId, reason, now: now(), attribution });
    },
  };
  return Object.freeze(service);
}

function seal(
  cipher: TokenCiphers['idToken'],
  token: string | undefined,
  sessionId: string,
): StoredSession['idToken'] {
  return token === undefined
    ? undefined
    : { ciphertext: cipher.encrypt(token, sessionId), keyVersion: cipher.keyVersion };
}
