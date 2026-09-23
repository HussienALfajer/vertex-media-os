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
  readonly idToken: { readonly ciphertext: string; readonly keyVersion: number } | undefined;
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
  /** Encrypts the ID token for the new row's ID (D-17); `undefined` stores none. */
  readonly sealIdToken: (sessionId: string) => StoredSession['idToken'];
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
   * Slides the idle deadline of a session that is still valid at `now` and was last seen at or
   * before `seenBefore`. Never revives a revoked or expired session.
   */
  touch(change: {
    readonly id: string;
    readonly now: Date;
    readonly seenBefore: Date;
    readonly idleExpiresAt: Date;
  }): Promise<void>;
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
   * Binds MOD-AUDIT's append capability to a database handle. The composition root supplies the
   * Audit adapter's `createAuditRecorder`; this area never imports the Audit adapter itself.
   */
  readonly auditRecorderFor: (handle: DatabaseClient | DatabaseTransaction) => AuditRecorder;
}

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
};

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
    idToken:
      row.idTokenCiphertext === null || row.idTokenKeyVersion === null
        ? undefined
        : { ciphertext: row.idTokenCiphertext, keyVersion: row.idTokenKeyVersion },
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
          // The ID token is discarded when the session ends (SECURITY Section 11).
          idTokenCiphertext: null,
          idTokenKeyVersion: null,
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
      await runInTransaction(database, async (transaction) => {
        const scoped = authPersistenceOf(transaction);
        await scoped.authLoginAttempt.deleteMany({
          where: { expiresAt: { lte: attempt.createdAt } },
        });
        await scoped.authLoginAttempt.create({
          data: {
            handleHash: attempt.handleHash,
            state: attempt.state,
            nonce: attempt.nonce,
            codeVerifier: attempt.codeVerifier,
            createdAt: attempt.createdAt,
            expiresAt: attempt.expiresAt,
          },
        });
      });
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
      const idToken = session.sealIdToken(id);
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

    async touch({ id, now, seenBefore, idleExpiresAt }) {
      await client.authSession.updateMany({
        where: {
          id,
          revokedAt: null,
          idleExpiresAt: { gt: now },
          absoluteExpiresAt: { gt: now },
          lastSeenAt: { lte: seenBefore },
        },
        data: { lastSeenAt: now, idleExpiresAt },
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
