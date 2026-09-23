import type { AuditRecorder } from '@vertex-os/audit';
import type { DatabaseClient, DatabaseTransaction } from '@vertex-os/database';
import type { AuthorizationDenial, ResolveAuthorizationContextResult } from '@vertex-os/iam';
import {
  recordAuthorizationDenial,
  resolveAuthorizationContext,
  type AuthorizationDependencies,
} from '@vertex-os/iam/composition';
import { createAuthorizationReader, createIamTransactionRunner } from '@vertex-os/iam-persistence';

/**
 * IAM's authorization capabilities bound to their adapters (IAM-R04 D-11). The API's access guard
 * and handlers receive only these functions, never the reader or the transaction runner.
 */
export interface IamAuthorization {
  resolveAuthorizationContext(userId: string): Promise<ResolveAuthorizationContextResult>;
  recordAuthorizationDenial(denial: AuthorizationDenial): Promise<void>;
}

export interface IamAuthorizationOptions {
  /** Binds MOD-AUDIT's append capability to a transaction (the Audit adapter in the runtime). */
  readonly auditRecorderFor: (handle: DatabaseClient | DatabaseTransaction) => AuditRecorder;
}

export function createIamAuthorization(
  database: DatabaseClient,
  options: IamAuthorizationOptions,
): IamAuthorization {
  const dependencies: AuthorizationDependencies = {
    reader: createAuthorizationReader(database),
    runner: createIamTransactionRunner(database, { auditRecorderFor: options.auditRecorderFor }),
  };
  return Object.freeze({
    resolveAuthorizationContext: (userId: string) =>
      resolveAuthorizationContext(dependencies, userId),
    recordAuthorizationDenial: (denial: AuthorizationDenial) =>
      recordAuthorizationDenial(dependencies, denial),
  });
}
