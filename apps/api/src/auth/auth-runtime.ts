import type { AuditRecorder } from '@vertex-os/audit';
import { createAuditRecorder } from '@vertex-os/audit-persistence';
import type { DatabaseClient, DatabaseTransaction } from '@vertex-os/database';
import type { SignInDependencies } from '@vertex-os/iam';
import {
  createApplicationUserRepository,
  createIamTransactionRunner,
} from '@vertex-os/iam-persistence';
import type { AuthConfig } from '../config/auth-config.js';
import { createOidcClient, type OidcClient } from './oidc.js';
import { createSessionStore } from './session-store.js';
import { createSessionService, type SessionService } from './sessions.js';
import { createTokenCipher } from './token-cipher.js';

/** Everything the authentication endpoints and the CSRF guard use, bound to its adapters. */
export interface AuthRuntime {
  readonly config: AuthConfig;
  readonly sessions: SessionService;
  readonly oidc: OidcClient;
  /** IAM's sign-in capabilities bound to the IAM adapters and the Audit adapter. */
  readonly iam: SignInDependencies;
}

export interface AuthRuntimeOptions {
  /** Replaces `fetch` for identity-provider requests (tests run a fake provider through it). */
  readonly oidcFetch?: typeof fetch;
  /** The current time for session deadlines; tests move it. */
  readonly now?: () => Date;
  /** Binds MOD-AUDIT's append capability to a transaction; the Audit adapter by default. */
  readonly auditRecorderFor?: (handle: DatabaseClient | DatabaseTransaction) => AuditRecorder;
}

/**
 * Composition root of browser authentication (IAM-R03 D-01): the session service over PostgreSQL,
 * the OIDC client, and IAM sign-in, sharing the process's database client.
 */
export function createAuthRuntime(
  config: AuthConfig,
  database: DatabaseClient,
  options: AuthRuntimeOptions = {},
): AuthRuntime {
  const auditRecorderFor = options.auditRecorderFor ?? createAuditRecorder;
  return Object.freeze({
    config,
    sessions: createSessionService({
      store: createSessionStore(database, { auditRecorderFor }),
      cipher: createTokenCipher(config.tokenEncryptionSecret),
      limits: config.session,
      ...(options.now === undefined ? {} : { now: options.now }),
    }),
    oidc: createOidcClient(
      config.oidc,
      options.oidcFetch === undefined ? {} : { fetch: options.oidcFetch },
    ),
    iam: {
      users: createApplicationUserRepository(database),
      runner: createIamTransactionRunner(database, { auditRecorderFor }),
    },
  });
}
