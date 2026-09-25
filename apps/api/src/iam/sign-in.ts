import type { AuditRecorder } from '@vertex-os/audit';
import type { TraceId } from '@vertex-os/audit';
import type { DatabaseClient, DatabaseTransaction } from '@vertex-os/database';
import {
  normalizeEmail,
  type ResolveSessionUserResult,
  type SignInRequest,
  type SignInResult,
  type UserId,
} from '@vertex-os/iam';
import {
  resolveIdentityUser,
  resolveSessionUser,
  signIn,
  type SignInDependencies,
} from '@vertex-os/iam/composition';
import {
  createApplicationUserRepository,
  createIamTransactionRunner,
  createLocalCredentials,
  LOCAL_IDENTITY_ISSUER,
} from '@vertex-os/iam-persistence';
import { verifyPassword } from '../auth/passwords.js';

/**
 * IAM sign-in bound to its adapters (IAM-R03 D-09). Browser authentication receives only these
 * functions, never IAM's repositories or transaction runner, so it cannot change IAM state other
 * than through the capabilities.
 */
export interface IamSignIn {
  signIn(request: SignInRequest): Promise<SignInResult>;
  localSignIn(
    email: string,
    password: string,
    traceId: TraceId,
  ): Promise<SignInResult | { readonly outcome: 'invalid-credentials' }>;
  resolveSessionUser(userId: string): Promise<ResolveSessionUserResult>;
  resolveIdentityUser(identity: {
    readonly issuer: string;
    readonly subject: string;
  }): Promise<UserId | undefined>;
}

export interface IamSignInOptions {
  /** Binds MOD-AUDIT's append capability to a transaction (the Audit adapter in the runtime). */
  readonly auditRecorderFor: (handle: DatabaseClient | DatabaseTransaction) => AuditRecorder;
}

export function createIamSignIn(database: DatabaseClient, options: IamSignInOptions): IamSignIn {
  const credentials = createLocalCredentials(database);
  const dependencies: SignInDependencies = {
    users: createApplicationUserRepository(database),
    runner: createIamTransactionRunner(database, { auditRecorderFor: options.auditRecorderFor }),
  };
  return Object.freeze({
    signIn: (request: SignInRequest) => signIn(dependencies, request),
    localSignIn: async (email: string, password: string, traceId: TraceId) => {
      const normalized = normalizeEmail(email);
      const credential = normalized.ok
        ? await credentials.findByEmail(normalized.value)
        : undefined;
      if (!(await verifyPassword(password, credential?.passwordHash))) {
        return { outcome: 'invalid-credentials' as const };
      }
      if (credential === undefined) return { outcome: 'invalid-credentials' as const };
      return signIn(dependencies, {
        issuer: LOCAL_IDENTITY_ISSUER,
        subject: credential.userId,
        traceId,
      });
    },
    resolveSessionUser: (userId: string) => resolveSessionUser(dependencies, userId),
    resolveIdentityUser: (identity: { readonly issuer: string; readonly subject: string }) =>
      resolveIdentityUser(dependencies, identity),
  });
}
