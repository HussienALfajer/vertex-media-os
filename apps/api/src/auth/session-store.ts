import { randomUUID } from 'node:crypto';
import { createAuditEntry, type AuditAttribution, type AuditRecorder } from '@vertex-os/audit';
import type { DatabaseClient, DatabaseTransaction } from '@vertex-os/database';
import {
  authPersistenceOf,
  AuthSessionRevocationReason,
  runInTransaction,
  type AuthPersistenceClient,
} from '@vertex-os/database/auth';

/** Why a session ended early, including IAM's access changes and the administrator action (IAM-R06 D-09). */
export type RevocationReason = keyof typeof AuthSessionRevocationReason;

/** A stored session as the authentication area sees it. It never holds the raw secret. */
export interface StoredSession {
  readonly id: string;
  readonly userId: string;
  readonly csrfTokenHash: string;
  readonly idpSessionId: string | undefined;
  readonly createdAt: Date;
  readonly lastSeenAt: Date;
  readonly idleExpiresAt: Date;
  readonly absoluteExpiresAt: Date;
  readonly revokedAt: Date | undefined;
  /** Legacy ciphertext/key markers; never decrypted or accepted for local authentication. */
  readonly hasLegacyTokens: boolean;
}

export interface NewSession {
  readonly tokenHash: string;
  readonly csrfTokenHash: string;
  readonly userId: string;
  readonly createdAt: Date;
  readonly idleExpiresAt: Date;
  readonly absoluteExpiresAt: Date;
  readonly attribution: AuditAttribution;
}

/**
 * Persistence of application sessions. Every revocation
 * and every session creation appends its Audit evidence in the same transaction (D-14).
 */
export interface SessionStore {
  createSession(session: NewSession): Promise<StoredSession>;
  findByTokenHash(tokenHash: string): Promise<StoredSession | undefined>;
  /** Slides an authenticated local session without external tokens or an identity-provider call. */
  touchLocal(change: {
    readonly id: string;
    readonly now: Date;
    readonly seenBefore: Date;
    readonly idleExpiresAt: Date;
  }): Promise<boolean>;
  /** Revokes one live session; `false` when it was already revoked or expired. */
  revoke(change: {
    readonly id: string;
    readonly reason: RevocationReason;
    readonly now: Date;
    readonly attribution: AuditAttribution;
  }): Promise<boolean>;
  /** Revokes every live session of a user; returns how many. */
  revokeUserSessions(change: {
    readonly userId: string;
    readonly reason: RevocationReason;
    readonly now: Date;
    readonly attribution: AuditAttribution;
  }): Promise<number>;
  /**
   * Bounded housekeeping (IAM-R09 D-06, D-07): deletes expired login attempts, discards the tokens
   * of sessions whose idle deadline lies after `tokensExpiredAfter` and at or before `now`
   * (SECURITY Section 11), and deletes session rows whose idle deadline is at or before
   * `purgeBefore`. Each statement repeats its predicate outside the batch subquery, so a row that a
   * concurrent statement changed is re-checked after the lock wait (CP1-22). `expiredTokensRemain`
   * says whether that window still holds expired sessions with tokens when the run ends.
   */
  housekeep(change: {
    readonly now: Date;
    readonly tokensExpiredAfter: Date;
    readonly purgeBefore: Date;
  }): Promise<HousekeepingResult & { readonly expiredTokensRemain: boolean }>;
}

/** What one housekeeping run removed. */
export interface HousekeepingResult {
  readonly loginAttemptsDeleted: number;
  readonly sessionTokensDiscarded: number;
  readonly sessionsPurged: number;
}

export interface SessionStoreOptions {
  /**
   * Binds MOD-AUDIT's append capability to a database handle. The area's composition root
   * (`auth-runtime.ts`) supplies the Audit adapter's `createAuditRecorder`; the store never imports
   * an adapter.
   */
  readonly auditRecorderFor: (handle: DatabaseClient | DatabaseTransaction) => AuditRecorder;
}

/** Rows each housekeeping statement handles, so one statement stays well inside the statement timeout. */
export const HOUSEKEEPING_BATCH = 200;
/** Batches of each kind one housekeeping run handles at most; the next run continues. */
export const HOUSEKEEPING_MAX_BATCHES = 10;

const sessionSelect = {
  id: true,
  userId: true,
  csrfTokenHash: true,
  idpSessionId: true,
  createdAt: true,
  lastSeenAt: true,
  idleExpiresAt: true,
  absoluteExpiresAt: true,
  revokedAt: true,
  idTokenCiphertext: true,
  idTokenKeyVersion: true,
  refreshTokenCiphertext: true,
  refreshTokenKeyVersion: true,
} as const;

type SessionRow = {
  readonly id: string;
  readonly userId: string;
  readonly csrfTokenHash: string;
  readonly idpSessionId: string | null;
  readonly createdAt: Date;
  readonly lastSeenAt: Date;
  readonly idleExpiresAt: Date;
  readonly absoluteExpiresAt: Date;
  readonly revokedAt: Date | null;
  readonly idTokenCiphertext: string | null;
  readonly idTokenKeyVersion: number | null;
  readonly refreshTokenCiphertext: string | null;
  readonly refreshTokenKeyVersion: number | null;
};

/** Column values that discard every stored token (SECURITY Section 11). */
const NO_TOKENS = {
  idTokenCiphertext: null,
  idTokenKeyVersion: null,
  refreshTokenCiphertext: null,
  refreshTokenKeyVersion: null,
} as const;

function mapSession(row: SessionRow): StoredSession {
  return {
    id: row.id,
    userId: row.userId,
    csrfTokenHash: row.csrfTokenHash,
    idpSessionId: row.idpSessionId ?? undefined,
    createdAt: row.createdAt,
    lastSeenAt: row.lastSeenAt,
    idleExpiresAt: row.idleExpiresAt,
    absoluteExpiresAt: row.absoluteExpiresAt,
    revokedAt: row.revokedAt ?? undefined,
    hasLegacyTokens:
      row.idTokenCiphertext !== null ||
      row.idTokenKeyVersion !== null ||
      row.refreshTokenCiphertext !== null ||
      row.refreshTokenKeyVersion !== null,
  };
}

async function appendSessionAudit(
  audit: AuditRecorder,
  action: 'iam.session.established' | 'iam.session.revoked',
  userId: string,
  attribution: AuditAttribution,
  after: Readonly<Record<string, string>> | undefined,
): Promise<void> {
  const entry = createAuditEntry({
    sourceModule: 'iam',
    action,
    actor: attribution.actor,
    // The user, never the session: session identifiers stay out of Audit evidence (spec Section 35).
    target: { type: 'iam.user', id: userId },
    result: 'SUCCEEDED',
    traceId: attribution.traceId,
    ...(attribution.reason === undefined ? {} : { reason: attribution.reason }),
    ...(after === undefined ? {} : { change: { after } }),
  });
  // An invalid entry is a programming error: throwing rolls the session change back.
  if (!entry.ok) throw new Error(`Session store built an invalid audit entry (${entry.reason}).`);
  await audit.append(entry.value);
}

export function createSessionStore(
  database: DatabaseClient,
  options: SessionStoreOptions,
): SessionStore {
  const client = authPersistenceOf(database);

  /** Runs `statement` until it affects less than a batch, at most `HOUSEKEEPING_MAX_BATCHES` times. */
  async function inBatches(statement: () => Promise<number>): Promise<number> {
    let total = 0;
    for (let batch = 0; batch < HOUSEKEEPING_MAX_BATCHES; batch += 1) {
      const affected = await statement();
      total += affected;
      if (affected < HOUSEKEEPING_BATCH) break;
    }
    return total;
  }

  /** Revokes the live sessions `where` selects and records one Audit entry per session. */
  async function revokeWhere(
    where: Record<string, unknown>,
    reason: RevocationReason,
    now: Date,
    attribution: AuditAttribution,
  ): Promise<number> {
    return runInTransaction(database, async (transaction) => {
      const scoped: AuthPersistenceClient = authPersistenceOf(transaction);
      const revoked = await scoped.authSession.updateManyAndReturn({
        where: {
          ...where,
          revokedAt: null,
          idleExpiresAt: { gt: now },
          absoluteExpiresAt: { gt: now },
        },
        data: {
          revokedAt: now,
          revocationReason: AuthSessionRevocationReason[reason],
          // Old ciphertext is discarded when a retained session ends.
          ...NO_TOKENS,
        },
        select: { userId: true },
      });
      const audit = options.auditRecorderFor(transaction);
      for (const session of revoked) {
        await appendSessionAudit(audit, 'iam.session.revoked', session.userId, attribution, {
          reason,
        });
      }
      return revoked.length;
    });
  }

  const store: SessionStore = {
    async createSession(session) {
      const id = randomUUID();
      return runInTransaction(database, async (transaction) => {
        const row = await authPersistenceOf(transaction).authSession.create({
          data: {
            id,
            tokenHash: session.tokenHash,
            csrfTokenHash: session.csrfTokenHash,
            userId: session.userId,
            idpSessionId: null,
            createdAt: session.createdAt,
            lastSeenAt: session.createdAt,
            idleExpiresAt: session.idleExpiresAt,
            absoluteExpiresAt: session.absoluteExpiresAt,
            ...NO_TOKENS,
          },
          select: sessionSelect,
        });
        await appendSessionAudit(
          options.auditRecorderFor(transaction),
          'iam.session.established',
          session.userId,
          session.attribution,
          undefined,
        );
        return mapSession(row);
      });
    },

    async findByTokenHash(tokenHash) {
      const row = await client.authSession.findUnique({
        where: { tokenHash },
        select: sessionSelect,
      });
      return row === null ? undefined : mapSession(row);
    },

    async touchLocal({ id, now, seenBefore, idleExpiresAt }) {
      const { count } = await client.authSession.updateMany({
        where: {
          id,
          revokedAt: null,
          idleExpiresAt: { gt: now },
          absoluteExpiresAt: { gt: now },
          lastSeenAt: { lte: seenBefore },
          idpSessionId: null,
          idTokenCiphertext: null,
          idTokenKeyVersion: null,
          refreshTokenCiphertext: null,
          refreshTokenKeyVersion: null,
        },
        data: { lastSeenAt: now, idleExpiresAt },
      });
      return count === 1;
    },

    async revoke({ id, reason, now, attribution }) {
      return (await revokeWhere({ id }, reason, now, attribution)) === 1;
    },

    revokeUserSessions({ userId, reason, now, attribution }) {
      return revokeWhere({ userId }, reason, now, attribution);
    },

    async housekeep({ now, tokensExpiredAfter, purgeBefore }) {
      // Each statement is small and outside any transaction. The outer predicates repeat the inner
      // ones: after a lock wait PostgreSQL re-checks only the outer WHERE (CP1-22). A session has
      // expired exactly when its idle deadline passed (auth_session_expiry_ck: idle <= absolute).
      const loginAttemptsDeleted = await inBatches(
        () => client.$executeRaw`DELETE FROM auth_login_attempt
          WHERE id IN (SELECT id FROM auth_login_attempt WHERE expires_at <= ${now}
            LIMIT ${HOUSEKEEPING_BATCH})
          AND expires_at <= ${now}`,
      );
      const sessionTokensDiscarded = await inBatches(
        () => client.$executeRaw`UPDATE auth_session
          SET id_token_ciphertext = NULL, id_token_key_version = NULL,
            refresh_token_ciphertext = NULL, refresh_token_key_version = NULL
          WHERE id IN (SELECT id FROM auth_session
              WHERE idle_expires_at > ${tokensExpiredAfter} AND idle_expires_at <= ${now}
              AND (id_token_ciphertext IS NOT NULL OR refresh_token_ciphertext IS NOT NULL)
            LIMIT ${HOUSEKEEPING_BATCH})
          AND idle_expires_at > ${tokensExpiredAfter} AND idle_expires_at <= ${now}
          AND (id_token_ciphertext IS NOT NULL OR refresh_token_ciphertext IS NOT NULL)`,
      );
      // A batch that lost rows to a concurrent discard stops the loop early, so the window is
      // re-read rather than inferred from the count (IAM-R09 review DC-1).
      const [remaining] = await client.$queryRaw<Array<{ remain: boolean }>>`SELECT EXISTS (
          SELECT 1 FROM auth_session
          WHERE idle_expires_at > ${tokensExpiredAfter} AND idle_expires_at <= ${now}
            AND (id_token_ciphertext IS NOT NULL OR refresh_token_ciphertext IS NOT NULL)
        ) AS remain`;
      // Sessions are authentication state, not IAM entities; their establishment and revocation
      // stay in the Audit records (IAM-R09 D-07).
      const sessionsPurged = await inBatches(
        () => client.$executeRaw`DELETE FROM auth_session
          WHERE id IN (SELECT id FROM auth_session WHERE idle_expires_at <= ${purgeBefore}
            LIMIT ${HOUSEKEEPING_BATCH})
          AND idle_expires_at <= ${purgeBefore}`,
      );
      return {
        loginAttemptsDeleted,
        sessionTokensDiscarded,
        sessionsPurged,
        expiredTokensRemain: remaining?.remain ?? true,
      };
    },
  };
  return Object.freeze(store);
}
