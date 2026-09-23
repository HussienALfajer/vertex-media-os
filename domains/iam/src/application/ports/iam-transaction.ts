import type { AuditRecorder } from '@vertex-os/audit';
import type { ReferenceDataStore } from './reference-data-store.js';
import type { UserIdentityStore } from './user-identity-store.js';

/**
 * The IAM stores and the MOD-AUDIT append capability, all bound to one database transaction.
 * IAM code sees only these capability interfaces, never a transaction handle (IAM-02 D-04).
 * Later stages add their own IAM ports here.
 */
export interface IamTransactionScope {
  readonly referenceData: ReferenceDataStore;
  readonly users: UserIdentityStore;
  readonly audit: AuditRecorder;
}

/**
 * Runs IAM work atomically: every change and its Audit evidence commit together, or nothing does.
 * An IAM-specific port, not a generic unit of work.
 */
export interface IamTransactionRunner {
  run<T>(work: (scope: IamTransactionScope) => Promise<T>): Promise<T>;
}
