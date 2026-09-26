import type { AuditRecorder } from '@vertex-os/audit';
import { createAuditRecorder } from '@vertex-os/audit-persistence';
import type { DatabaseClient, DatabaseTransaction } from '@vertex-os/database';
import type { AuthConfig } from '../config/auth-config.js';
import { createIamAuthorization, type IamAuthorization } from '../iam/authorization.js';
import { createIamSignIn, type IamSignIn } from '../iam/sign-in.js';
import { createRateLimiter, type RateLimiter } from './rate-limit.js';
import { createSessionStore } from './session-store.js';
import { createSessionService, type SessionService } from './sessions.js';
import { createTokenCiphers } from './token-cipher.js';

/** Everything the authentication endpoints and the access guard use, bound to its adapters. */
export interface AuthRuntime {
  readonly config: AuthConfig;
  readonly sessions: SessionService;
  /** IAM's sign-in capabilities, bound; never IAM's repositories or transaction runner. */
  readonly iam: IamSignIn;
  /** IAM's authorization-context capabilities, bound (IAM-R04 D-11). */
  readonly authorization: IamAuthorization;
  /** The per-window limits of IAM-R09 D-03 and D-04, one limiter per bucket. */
  readonly limits: {
    readonly signIn: RateLimiter;
    readonly logout: RateLimiter;
    readonly evidence: RateLimiter;
  };
}

export interface AuthRuntimeOptions {
  /** The current time for session deadlines; tests move it. */
  readonly now?: () => Date;
  /** Binds MOD-AUDIT's append capability to a transaction; the Audit adapter by default. */
  readonly auditRecorderFor?: (handle: DatabaseClient | DatabaseTransaction) => AuditRecorder;
}

/**
 * Composition root of local browser authentication: the PostgreSQL session service, IAM sign-in
 * and IAM authorization share the process's database client. Adapter imports in this area are
 * restricted to this file.
 */
export function createAuthRuntime(
  config: AuthConfig,
  database: DatabaseClient,
  options: AuthRuntimeOptions = {},
): AuthRuntime {
  const auditRecorderFor = options.auditRecorderFor ?? createAuditRecorder;
  const clock = options.now;
  const limiter = (limit: number) =>
    createRateLimiter({
      limit,
      windowSeconds: config.rateLimits.windowSeconds,
      ...(clock === undefined ? {} : { now: () => clock().getTime() }),
    });
  return Object.freeze({
    config,
    sessions: createSessionService({
      store: createSessionStore(database, { auditRecorderFor }),
      ciphers: createTokenCiphers(config.tokenEncryptionSecret),
      local: true,
      limits: config.session,
      clientId: 'vertex-local',
      ...(options.now === undefined ? {} : { now: options.now }),
    }),
    iam: createIamSignIn(database, { auditRecorderFor }),
    authorization: createIamAuthorization(database, { auditRecorderFor }),
    limits: Object.freeze({
      signIn: limiter(config.rateLimits.signIn),
      logout: limiter(config.rateLimits.logout),
      evidence: limiter(config.rateLimits.evidence),
    }),
  });
}
