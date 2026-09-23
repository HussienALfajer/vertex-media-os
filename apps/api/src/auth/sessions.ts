import type { AuditAttribution } from '@vertex-os/audit';
import type { AuthConfig } from '../config/auth-config.js';
import { csrfTokenFor, hashSecret, isSecretShaped, matchesHash, newSecret } from './secrets.js';
import type {
  LoginAttemptSecrets,
  RevocationReason,
  SessionStore,
  StoredSession,
} from './session-store.js';
import type { TokenCipher } from './token-cipher.js';

/** A request's session after validation: live and not revoked. Never carries the raw secret. */
export interface ValidSession {
  readonly id: string;
  readonly userId: string;
  readonly csrfTokenHash: string;
  readonly idleExpiresAt: Date;
  readonly absoluteExpiresAt: Date;
  readonly idToken: StoredSession['idToken'];
}

export type SessionLookup =
  | { readonly outcome: 'valid'; readonly session: ValidSession }
  /** No such session, a malformed value, or a revoked session. */
  | { readonly outcome: 'invalid' }
  | { readonly outcome: 'expired' };

/** Idle deadlines slide at most once a minute, so ordinary traffic does not write on every request. */
export const TOUCH_INTERVAL_MS = 60_000;

/**
 * The application-session policy of IAM-R03 D-03, D-04, D-17 and D-18 on top of the store: secret
 * generation, idle and absolute expiry, sliding refresh, CSRF proof and ID-token sealing.
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
    readonly attribution: AuditAttribution;
  }): Promise<{ readonly secret: string; readonly session: StoredSession }>;
  /** Resolves a cookie value to a session and slides its idle deadline while it is valid. */
  authenticate(secret: string | undefined): Promise<SessionLookup>;
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
  readonly cipher: TokenCipher;
  readonly limits: AuthConfig['session'];
  /** The current time; tests move it to cross deadlines. */
  readonly now?: () => Date;
}

export function createSessionService(options: SessionServiceOptions): SessionService {
  const { store, cipher, limits } = options;
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

    async establish({ userId, idpSessionId, idToken, attribution }) {
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
        sealIdToken: (sessionId) =>
          idToken === undefined
            ? undefined
            : { ciphertext: cipher.encrypt(idToken, sessionId), keyVersion: cipher.keyVersion },
        attribution,
      });
      return { secret, session };
    },

    async authenticate(secret: string | undefined): Promise<SessionLookup> {
      if (!isSecretShaped(secret)) return { outcome: 'invalid' };
      const stored = await store.findByTokenHash(hashSecret(secret));
      if (stored === undefined || stored.revokedAt !== undefined) return { outcome: 'invalid' };
      const at = now();
      if (
        stored.idleExpiresAt.getTime() <= at.getTime() ||
        stored.absoluteExpiresAt.getTime() <= at.getTime()
      ) {
        if (stored.idToken !== undefined)
          await store.discardExpiredIdToken({ id: stored.id, now: at });
        return { outcome: 'expired' };
      }
      let idleExpiresAt = stored.idleExpiresAt;
      if (at.getTime() - stored.lastSeenAt.getTime() >= TOUCH_INTERVAL_MS) {
        const slid = idleDeadline(at, stored.absoluteExpiresAt);
        const written = await store.touch({
          id: stored.id,
          now: at,
          seenBefore: new Date(at.getTime() - TOUCH_INTERVAL_MS),
          idleExpiresAt: slid,
        });
        // A concurrent touch or revocation won: report only what is stored (review D-7).
        if (written) idleExpiresAt = slid;
      }
      return {
        outcome: 'valid',
        session: {
          id: stored.id,
          userId: stored.userId,
          csrfTokenHash: stored.csrfTokenHash,
          idleExpiresAt,
          absoluteExpiresAt: stored.absoluteExpiresAt,
          idToken: stored.idToken,
        },
      };
    },

    csrfToken: csrfTokenFor,

    verifyCsrf(session: ValidSession, presented: string | undefined) {
      return matchesHash(presented, session.csrfTokenHash);
    },

    idTokenOf(session: ValidSession) {
      return session.idToken === undefined
        ? undefined
        : cipher.decrypt(session.idToken.ciphertext, session.idToken.keyVersion, session.id);
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
