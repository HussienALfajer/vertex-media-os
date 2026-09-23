import type { AuditRecorder } from '@vertex-os/audit';
import { createAuditRecorder } from '@vertex-os/audit-persistence';
import type { DatabaseClient, DatabaseTransaction } from '@vertex-os/database';
import type { AuthConfig } from '../config/auth-config.js';
import { createIamAuthorization, type IamAuthorization } from '../iam/authorization.js';
import { createIamSignIn, type IamSignIn } from '../iam/sign-in.js';
import { createOidcClient, type OidcClient } from './oidc.js';
import { createSessionStore } from './session-store.js';
import { createSessionService, type SessionService } from './sessions.js';
import { createTokenCiphers } from './token-cipher.js';

/** Everything the authentication endpoints and the access guard use, bound to its adapters. */
export interface AuthRuntime {
  readonly config: AuthConfig;
  readonly sessions: SessionService;
  readonly oidc: OidcClient;
  /** IAM's sign-in capabilities, bound; never IAM's repositories or transaction runner. */
  readonly iam: IamSignIn;
  /** IAM's authorization-context capabilities, bound (IAM-R04 D-11). */
  readonly authorization: IamAuthorization;
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
 * the OIDC client, IAM sign-in and IAM authorization, sharing the process's database client. The only file of the
 * area that may import an adapter (the Audit adapter here; lint-enforced).
 */
export function createAuthRuntime(
  config: AuthConfig,
  database: DatabaseClient,
  options: AuthRuntimeOptions = {},
): AuthRuntime {
  const auditRecorderFor = options.auditRecorderFor ?? createAuditRecorder;
  const oidc = createOidcClient(
    config.oidc,
    options.oidcFetch === undefined ? {} : { fetch: options.oidcFetch },
  );
  return Object.freeze({
    config,
    sessions: createSessionService({
      store: createSessionStore(database, { auditRecorderFor }),
      ciphers: createTokenCiphers(config.tokenEncryptionSecret),
      provider: oidc,
      limits: config.session,
      ...(options.now === undefined ? {} : { now: options.now }),
    }),
    oidc,
    iam: createIamSignIn(database, { auditRecorderFor }),
    authorization: createIamAuthorization(database, { auditRecorderFor }),
  });
}
