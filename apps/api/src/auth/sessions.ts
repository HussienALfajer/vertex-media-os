import { parseSystemProcess, type AuditAttribution } from '@vertex-os/audit';
import type { AuthConfig } from '../config/auth-config.js';
import type { OidcClient } from './oidc.js';
import { csrfTokenFor, hashSecret, isSecretShaped, matchesHash, newSecret } from './secrets.js';
import type {
  BackchannelLogoutEvent,
  HousekeepingResult,
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

const backchannelProcess = parseSystemProcess('iam.backchannel-logout');
if (!backchannelProcess.ok) throw new Error('Invalid system process code.');
/** The actor of revocations that a back-channel logout causes. */
const BACKCHANNEL_LOGOUT_PROCESS = { type: 'SYSTEM', process: backchannelProcess.value } as const;

const DAY_MS = 86_400_000;

/** Identity-provider sessions a back-channel logout ended that are remembered at most (IAM-R09 D-08). */
export const RECENT_LOGOUTS_MAX = 10_000;

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
  }): Promise<{
    readonly secret: string;
    readonly session: StoredSession;
    /**
     * A back-channel logout ended the identity-provider session while this sign-in completed; the
     * new session is already revoked and its secret must not reach the browser (IAM-R09 D-08).
     */
    readonly endedByProvider: boolean;
  }>;
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
  /**
   * Revokes every live session bound to an identity-provider session that a back-channel logout
   * ended, and remembers that session for the login-attempt timeout, so a sign-in that completes
   * after this revocation cannot leave a live session behind (IAM-R09 D-08).
   */
  revokeIdpSession(
    idpSessionId: string,
    reason: RevocationReason,
    attribution: AuditAttribution,
  ): Promise<number>;
  /** Records a back-channel logout that revoked nothing, for the `vertex-web` client (IAM-R09 D-05). */
  recordBackchannelLogout(event: Omit<BackchannelLogoutEvent, 'clientId'>): Promise<void>;
  /**
   * One housekeeping run at the current time (IAM-R09 D-07): expired login attempts, the tokens of
   * expired sessions, and session rows past the retention period.
   */
  housekeep(): Promise<HousekeepingResult>;
}

export interface SessionServiceOptions {
  readonly store: SessionStore;
  readonly ciphers: TokenCiphers;
  /** Refreshes the identity provider's session (IAM-R03F D-01). */
  readonly provider: Pick<OidcClient, 'refreshSession'>;
  readonly limits: AuthConfig['session'];
  /** The `vertex-web` client the back-channel logout evidence names. */
  readonly clientId: string;
  /** The current time; tests move it to cross deadlines. */
  readonly now?: () => Date;
}

export function createSessionService(options: SessionServiceOptions): SessionService {
  const { store, ciphers, provider, limits } = options;
  const now = options.now ?? (() => new Date());
  const idleMs = limits.idleTimeoutSeconds * 1000;
  const absoluteMs = limits.absoluteTimeoutSeconds * 1000;
  const attemptMs = limits.loginAttemptTimeoutSeconds * 1000;
  const recentLogouts = createRecentLogouts(attemptMs, () => now().getTime());

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
      // Checked only after the insert committed. A back-channel logout remembers its session
      // before it revokes, so either its revocation saw this row or this check sees the memory.
      if (idpSessionId === undefined || !recentLogouts.has(idpSessionId)) {
        return { secret, session, endedByProvider: false };
      }
      await store.revoke({
        id: session.id,
        reason: 'BACKCHANNEL_LOGOUT',
        now: now(),
        attribution: { actor: BACKCHANNEL_LOGOUT_PROCESS, traceId: attribution.traceId },
      });
      return { secret, session, endedByProvider: true };
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
      recentLogouts.remember(idpSessionId);
      return store.revokeIdpSession({ idpSessionId, reason, now: now(), attribution });
    },

    recordBackchannelLogout(event) {
      return store.recordBackchannelLogout({ ...event, clientId: options.clientId });
    },

    housekeep() {
      const at = now();
      return store.housekeep({
        now: at,
        purgeBefore: new Date(at.getTime() - limits.retentionDays * DAY_MS),
      });
    },
  };
  return Object.freeze(service);
}

/**
 * Identity-provider sessions ended by a back-channel logout, kept for `ttlMs` in this process (one
 * API process in V1, Master Plan Section 15). A Keycloak session identifier is never reused, so
 * remembering one cannot refuse a later, different sign-in. Bounded: the oldest entry goes first.
 */
function createRecentLogouts(ttlMs: number, now: () => number) {
  const ended = new Map<string, number>();
  return {
    remember(idpSessionId: string): void {
      ended.delete(idpSessionId);
      ended.set(idpSessionId, now() + ttlMs);
      for (const [key, expiresAt] of ended) {
        if (ended.size <= RECENT_LOGOUTS_MAX && expiresAt > now()) break;
        ended.delete(key);
      }
    },
    has(idpSessionId: string): boolean {
      const expiresAt = ended.get(idpSessionId);
      return expiresAt !== undefined && expiresAt > now();
    },
  };
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
