import type { AuditRecorder } from '@vertex-os/audit';
import type { DatabaseClient, DatabaseTransaction } from '@vertex-os/database';
import {
  resolveIdentityUser,
  resolveSessionUser,
  signIn,
  type ResolveSessionUserResult,
  type SignInDependencies,
  type SignInRequest,
  type SignInResult,
  type UserId,
} from '@vertex-os/iam';
import {
  createApplicationUserRepository,
  createIamTransactionRunner,
} from '@vertex-os/iam-persistence';

/**
 * IAM sign-in bound to its adapters (IAM-R03 D-09). Browser authentication receives only these
 * functions, never IAM's repositories or transaction runner, so it cannot change IAM state other
 * than through the capabilities.
 */
export interface IamSignIn {
  signIn(request: SignInRequest): Promise<SignInResult>;
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
  const dependencies: SignInDependencies = {
    users: createApplicationUserRepository(database),
    runner: createIamTransactionRunner(database, { auditRecorderFor: options.auditRecorderFor }),
  };
  return Object.freeze({
    signIn: (request: SignInRequest) => signIn(dependencies, request),
    resolveSessionUser: (userId: string) => resolveSessionUser(dependencies, userId),
    resolveIdentityUser: (identity: { readonly issuer: string; readonly subject: string }) =>
      resolveIdentityUser(dependencies, identity),
  });
}
