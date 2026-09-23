import { randomUUID } from 'node:crypto';
import { createAuditEntry, type AuditAttribution, type AuditRecorder } from '@vertex-os/audit';
import type { DatabaseClient, DatabaseTransaction } from '@vertex-os/database';
import {
  authPersistenceOf,
  AuthSessionRevocationReason,
  runInTransaction,
  type AuthPersistenceClient,
} from '@vertex-os/database/auth';

/** Why a session ended early. Later stages add reasons (suspension, administrator action). */
export type RevocationReason = keyof typeof AuthSessionRevocationReason;

/** An identity-provider token encrypted for one session row (IAM-R03 D-17, IAM-R03F D-06). */
export interface SealedToken {
  readonly ciphertext: string;
  readonly keyVersion: number;
}

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
  readonly idToken: SealedToken | undefined;
  readonly refreshToken: SealedToken | undefined;
}

/** The tokens a session keeps, sealed for its row ID; an absent token is not stored. */
export interface SealedTokens {
  readonly idToken?: SealedToken | undefined;
  readonly refreshToken?: SealedToken | undefined;
}

export interface LoginAttemptSecrets {
  readonly state: string;
  readonly nonce: string;
  readonly codeVerifier: string;
}

export type ConsumedLoginAttempt =
  | ({ readonly outcome: 'found' } & LoginAttemptSecrets)
  | { readonly outcome: 'expired' }
  | { readonly outcome: 'missing' };

export interface NewSession {
  readonly tokenHash: string;
  readonly csrfTokenHash: string;
  readonly userId: string;
  readonly idpSessionId: string | undefined;
  readonly createdAt: Date;
  readonly idleExpiresAt: Date;
  readonly absoluteExpiresAt: Date;
  /** Encrypts the session's tokens for the new row's ID (IAM-R03 D-17, IAM-R03F D-06). */
  readonly sealTokens: (sessionId: string) => SealedTokens;
  readonly attribution: AuditAttribution;
}

/**
 * Persistence of application sessions and login attempts (IAM-R03 Section 5). Every revocation
 * and every session creation appends its Audit evidence in the same transaction (D-14).
 */
export interface SessionStore {
  createLoginAttempt(
    attempt: LoginAttemptSecrets & {
      readonly handleHash: string;
      readonly createdAt: Date;
      readonly expiresAt: Date;
    },
  ): Promise<void>;
  /** Removes the attempt whatever its state, so it can be used at most once. */
  consumeLoginAttempt(handleHash: string, now: Date): Promise<ConsumedLoginAttempt>;
  createSession(session: NewSession): Promise<StoredSession>;
  findByTokenHash(tokenHash: string): Promise<StoredSession | undefined>;
  /**
   * Claims the re-validation of a session that is still valid at `now` and was last seen at or
   * before `seenBefore` (IAM-R03F D-04): moves `last_seen_at` only, so of concurrent requests
   * exactly one wins. Never touches a revoked or expired session. `true` for the winner.
   */
  claimRevalidation(change: {
    readonly id: string;
    readonly now: Date;
    readonly seenBefore: Date;
  }): Promise<boolean>;
  /**
   * Applies a successful re-validation: the slid idle deadline and the rotated tokens, only while
   * the session is still valid at `now`. Never revives a revoked or expired session or writes token
   * material into it. An absent ID token keeps the stored one. `true` when it wrote.
   */
  applyRevalidation(change: {
    readonly id: string;
    readonly now: Date;
    readonly idleExpiresAt: Date;
    readonly tokens: SealedTokens & { readonly refreshToken: SealedToken };
  }): Promise<boolean>;
  /** Discards the tokens of a session that has expired (SECURITY Section 11). */
  discardExpiredTokens(change: { readonly id: string; readonly now: Date }): Promise<void>;
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
  /** Revokes every live session bound to an identity-provider session; returns how many. */
  revokeIdpSession(change: {
    readonly idpSessionId: string;
    readonly reason: RevocationReason;
    readonly now: Date;
    readonly attribution: AuditAttribution;
  }): Promise<number>;
}

export interface SessionStoreOptions {
  /**
   * Binds MOD-AUDIT's append capability to a database handle. The area's composition root
   * (`auth-runtime.ts`) supplies the Audit adapter's `createAuditRecorder`; the store never imports
   * an adapter.
   */
  readonly auditRecorderFor: (handle: DatabaseClient | DatabaseTransaction) => AuditRecorder;
}

/** Rows each sweep handles, so one statement stays well inside the statement timeout. */
const SWEEP_BATCH = 200;

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

function sealed(ciphertext: string | null, keyVersion: number | null): SealedToken | undefined {
  return ciphertext === null || keyVersion === null ? undefined : { ciphertext, keyVersion };
}

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
    idToken: sealed(row.idTokenCiphertext, row.idTokenKeyVersion),
    refreshToken: sealed(row.refreshTokenCiphertext, row.refreshTokenKeyVersion),
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

  /**
   * Bounded housekeeping on each new sign-in (IAM-R03 review D-1, D-2): removes a batch of expired
   * login attempts and discards the tokens of a batch of expired sessions (SECURITY Section 11).
   * Each is one small statement outside any transaction, so a backlog can slow the sweep down but
   * never blocks a sign-in; a failed sweep is left to the next one.
   */
  async function sweep(now: Date): Promise<void> {
    try {
      await client.$executeRaw`DELETE FROM auth_login_attempt WHERE id IN (
        SELECT id FROM auth_login_attempt WHERE expires_at <= ${now} LIMIT ${SWEEP_BATCH})`;
      await client.$executeRaw`UPDATE auth_session
        SET id_token_ciphertext = NULL, id_token_key_version = NULL,
          refresh_token_ciphertext = NULL, refresh_token_key_version = NULL
        WHERE id IN (SELECT id FROM auth_session
          WHERE (id_token_ciphertext IS NOT NULL OR refresh_token_ciphertext IS NOT NULL)
          AND (idle_expires_at <= ${now} OR absolute_expires_at <= ${now}) LIMIT ${SWEEP_BATCH})`;
    } catch {
      // Housekeeping only: the attempt is already stored.
    }
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
          // Identity-provider tokens are discarded when the session ends (SECURITY Section 11).
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
    async createLoginAttempt(attempt) {
      await client.authLoginAttempt.create({
        data: {
          handleHash: attempt.handleHash,
          state: attempt.state,
          nonce: attempt.nonce,
          codeVerifier: attempt.codeVerifier,
          createdAt: attempt.createdAt,
          expiresAt: attempt.expiresAt,
        },
      });
      await sweep(attempt.createdAt);
    },

    async consumeLoginAttempt(handleHash, now) {
      // One statement: of concurrent callbacks with the same handle, exactly one receives the row.
      // Prisma has no delete-and-return, so this is the one tagged raw statement of the store.
      const [row] = await client.$queryRaw<
        Array<{ state: string; nonce: string; codeVerifier: string; expiresAt: Date }>
      >`DELETE FROM auth_login_attempt WHERE handle_hash = ${handleHash}
        RETURNING state, nonce, code_verifier AS "codeVerifier", expires_at AS "expiresAt"`;
      if (row === undefined) return { outcome: 'missing' };
      if (row.expiresAt.getTime() <= now.getTime()) return { outcome: 'expired' };
      return {
        outcome: 'found',
        state: row.state,
        nonce: row.nonce,
        codeVerifier: row.codeVerifier,
      };
    },

    async createSession(session) {
      const id = randomUUID();
      const { idToken, refreshToken } = session.sealTokens(id);
      return runInTransaction(database, async (transaction) => {
        const row = await authPersistenceOf(transaction).authSession.create({
          data: {
            id,
            tokenHash: session.tokenHash,
            csrfTokenHash: session.csrfTokenHash,
            userId: session.userId,
            idpSessionId: session.idpSessionId ?? null,
            createdAt: session.createdAt,
            lastSeenAt: session.createdAt,
            idleExpiresAt: session.idleExpiresAt,
            absoluteExpiresAt: session.absoluteExpiresAt,
            idTokenCiphertext: idToken?.ciphertext ?? null,
            idTokenKeyVersion: idToken?.keyVersion ?? null,
            refreshTokenCiphertext: refreshToken?.ciphertext ?? null,
            refreshTokenKeyVersion: refreshToken?.keyVersion ?? null,
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

    async claimRevalidation({ id, now, seenBefore }) {
      const { count } = await client.authSession.updateMany({
        where: {
          id,
          revokedAt: null,
          idleExpiresAt: { gt: now },
          absoluteExpiresAt: { gt: now },
          lastSeenAt: { lte: seenBefore },
        },
        data: { lastSeenAt: now },
      });
      return count === 1;
    },

    async applyRevalidation({ id, now, idleExpiresAt, tokens }) {
      const { count } = await client.authSession.updateMany({
        where: { id, revokedAt: null, idleExpiresAt: { gt: now }, absoluteExpiresAt: { gt: now } },
        data: {
          idleExpiresAt,
          refreshTokenCiphertext: tokens.refreshToken.ciphertext,
          refreshTokenKeyVersion: tokens.refreshToken.keyVersion,
          ...(tokens.idToken === undefined
            ? {}
            : {
                idTokenCiphertext: tokens.idToken.ciphertext,
                idTokenKeyVersion: tokens.idToken.keyVersion,
              }),
        },
      });
      return count === 1;
    },

    async discardExpiredTokens({ id, now }) {
      await client.authSession.updateMany({
        where: {
          id,
          AND: [
            {
              OR: [{ idTokenCiphertext: { not: null } }, { refreshTokenCiphertext: { not: null } }],
            },
            { OR: [{ idleExpiresAt: { lte: now } }, { absoluteExpiresAt: { lte: now } }] },
          ],
        },
        data: NO_TOKENS,
      });
    },

    async revoke({ id, reason, now, attribution }) {
      return (await revokeWhere({ id }, reason, now, attribution)) === 1;
    },

    revokeUserSessions({ userId, reason, now, attribution }) {
      return revokeWhere({ userId }, reason, now, attribution);
    },

    revokeIdpSession({ idpSessionId, reason, now, attribution }) {
      return revokeWhere({ idpSessionId }, reason, now, attribution);
    },
  };
  return Object.freeze(store);
}
