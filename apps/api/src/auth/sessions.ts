import type { AuditAttribution } from '@vertex-os/audit';
import type { AuthConfig } from '../config/auth-config.js';
import { csrfTokenFor, hashSecret, isSecretShaped, matchesHash, newSecret } from './secrets.js';
import type {
  HousekeepingResult,
  RevocationReason,
  SessionStore,
  StoredSession,
} from './session-store.js';

/** A live application session. Raw cookie secrets never leave the request. */
export interface ValidSession {
  readonly id: string;
  readonly userId: string;
  readonly csrfTokenHash: string;
  readonly idleExpiresAt: Date;
  readonly absoluteExpiresAt: Date;
}

export type SessionLookup =
  | {
      readonly outcome: 'valid';
      readonly session: ValidSession;
      readonly revalidation: 'not-due' | 'refreshed';
    }
  | { readonly outcome: 'invalid' }
  | { readonly outcome: 'expired' };

/** At most one database write per local session and minute of ordinary traffic. */
export const TOUCH_INTERVAL_MS = 60_000;
const DAY_MS = 86_400_000;
const SWEEP_MARGIN_MS = 3_600_000;

export interface SessionService {
  establish(input: { readonly userId: string; readonly attribution: AuditAttribution }): Promise<{
    readonly secret: string;
    readonly session: StoredSession;
  }>;
  authenticate(secret: string | undefined, attribution: AuditAttribution): Promise<SessionLookup>;
  csrfToken(secret: string): string;
  verifyCsrf(session: ValidSession, presented: string | undefined): boolean;
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
  housekeep(): Promise<HousekeepingResult>;
}

export interface SessionServiceOptions {
  readonly store: SessionStore;
  readonly limits: AuthConfig['session'];
  readonly now?: () => Date;
}

export function createSessionService(options: SessionServiceOptions): SessionService {
  const { store, limits } = options;
  const now = options.now ?? (() => new Date());
  const idleMs = limits.idleTimeoutSeconds * 1000;
  const absoluteMs = limits.absoluteTimeoutSeconds * 1000;
  let tokensSweptUntil: Date | undefined;
  const idleDeadline = (at: Date, absolute: Date) =>
    new Date(Math.min(at.getTime() + idleMs, absolute.getTime()));

  return Object.freeze({
    async establish({ userId, attribution }) {
      const secret = newSecret();
      const createdAt = now();
      const absoluteExpiresAt = new Date(createdAt.getTime() + absoluteMs);
      const session = await store.createSession({
        tokenHash: hashSecret(secret),
        csrfTokenHash: hashSecret(csrfTokenFor(secret)),
        userId,
        createdAt,
        idleExpiresAt: idleDeadline(createdAt, absoluteExpiresAt),
        absoluteExpiresAt,
        attribution,
      });
      return { secret, session };
    },

    async authenticate(secret, _attribution) {
      if (!isSecretShaped(secret)) return { outcome: 'invalid' };
      const stored = await store.findByTokenHash(hashSecret(secret));
      if (stored === undefined || stored.revokedAt !== undefined) return { outcome: 'invalid' };
      // Historical provider-backed cookies cannot become local sessions after the migration.
      if (stored.idpSessionId !== undefined || stored.hasLegacyTokens)
        return { outcome: 'invalid' };
      const at = now();
      if (
        stored.idleExpiresAt.getTime() <= at.getTime() ||
        stored.absoluteExpiresAt.getTime() <= at.getTime()
      )
        return { outcome: 'expired' };

      const valid = (
        idleExpiresAt: Date,
        revalidation: 'not-due' | 'refreshed',
      ): SessionLookup => ({
        outcome: 'valid',
        revalidation,
        session: {
          id: stored.id,
          userId: stored.userId,
          csrfTokenHash: stored.csrfTokenHash,
          idleExpiresAt,
          absoluteExpiresAt: stored.absoluteExpiresAt,
        },
      });
      if (at.getTime() - stored.lastSeenAt.getTime() < TOUCH_INTERVAL_MS)
        return valid(stored.idleExpiresAt, 'not-due');

      const idleExpiresAt = idleDeadline(at, stored.absoluteExpiresAt);
      const touched = await store.touchLocal({
        id: stored.id,
        now: at,
        seenBefore: new Date(at.getTime() - TOUCH_INTERVAL_MS),
        idleExpiresAt,
      });
      if (touched) return valid(idleExpiresAt, 'refreshed');
      // A competing request may have touched, expired or revoked the row. Re-read before accepting.
      const current = await store.findByTokenHash(hashSecret(secret));
      if (
        current === undefined ||
        current.revokedAt !== undefined ||
        current.idpSessionId !== undefined ||
        current.hasLegacyTokens
      )
        return { outcome: 'invalid' };
      if (
        current.idleExpiresAt.getTime() <= at.getTime() ||
        current.absoluteExpiresAt.getTime() <= at.getTime()
      )
        return { outcome: 'expired' };
      return valid(current.idleExpiresAt, 'not-due');
    },

    csrfToken: csrfTokenFor,
    verifyCsrf(session, presented) {
      return matchesHash(presented, session.csrfTokenHash);
    },
    revoke(session, reason, attribution) {
      return store.revoke({ id: session.id, reason, now: now(), attribution });
    },
    revokeUserSessions(userId, reason, attribution) {
      return store.revokeUserSessions({ userId, reason, now: now(), attribution });
    },
    async housekeep() {
      const at = now();
      const purgeBefore = new Date(at.getTime() - limits.retentionDays * DAY_MS);
      const tokensExpiredAfter =
        tokensSweptUntil === undefined
          ? purgeBefore
          : new Date(Math.max(purgeBefore.getTime(), tokensSweptUntil.getTime() - SWEEP_MARGIN_MS));
      const { expiredTokensRemain, ...result } = await store.housekeep({
        now: at,
        tokensExpiredAfter,
        purgeBefore,
      });
      if (!expiredTokensRemain) tokensSweptUntil = at;
      return result;
    },
  } satisfies SessionService);
}
