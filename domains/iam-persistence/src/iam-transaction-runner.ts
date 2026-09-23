import type { AuditRecorder } from '@vertex-os/audit';
import type { DatabaseClient, DatabaseTransaction } from '@vertex-os/database';
import { iamPersistenceOf, runInTransaction } from '@vertex-os/database/iam';
import type { IamTransactionRunner, IamTransactionScope } from '@vertex-os/iam/persistence';
import { createOrganizationStore } from './organization-store.js';
import { createReferenceDataStore } from './reference-data-store.js';
import { createRoleStore } from './role-store.js';
import { createUserIdentityStore } from './user-identity-store.js';
import { createUserLifecycleStore } from './user-lifecycle-store.js';

export interface IamTransactionRunnerOptions {
  /**
   * Binds MOD-AUDIT's append capability to a database handle. The composition root supplies it
   * (the Audit adapter's `createAuditRecorder`); the IAM adapter never imports the Audit adapter.
   */
  readonly auditRecorderFor: (handle: DatabaseClient | DatabaseTransaction) => AuditRecorder;
}

/**
 * IAM's transaction runner (IAM-02 D-04): each `run` is one `ReadCommitted` database transaction
 * in which the IAM stores and the Audit recorder are bound to the same transaction, so IAM changes
 * and their Audit evidence commit together or not at all. The work sees only capability
 * interfaces, never the transaction handle.
 */
export function createIamTransactionRunner(
  database: DatabaseClient,
  options: IamTransactionRunnerOptions,
): IamTransactionRunner {
  return Object.freeze({
    run<T>(work: (scope: IamTransactionScope) => Promise<T>): Promise<T> {
      return runInTransaction(
        database,
        (transaction) => {
          const client = iamPersistenceOf(transaction);
          return work(
            Object.freeze({
              referenceData: createReferenceDataStore(client),
              users: createUserIdentityStore(client),
              organization: createOrganizationStore(client),
              roles: createRoleStore(client),
              lifecycle: createUserLifecycleStore(client),
              audit: options.auditRecorderFor(transaction),
            }),
          );
        },
        { isolationLevel: 'ReadCommitted' },
      );
    },
  });
}
