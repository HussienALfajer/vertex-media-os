/**
 * MOD-AUDIT's private persistence entry. Only the Audit adapter (`domains/audit-persistence`) may
 * import it (lint-enforced). The client it returns reaches the `audit*` models and raw SQL only.
 */
import {
  prismaClientOf,
  runInTransaction,
  type DatabaseClient,
  type DatabaseTransaction,
  type DomainScopedClient,
} from './database-client.js';

export type AuditPersistenceClient = DomainScopedClient<'audit'>;

/** The Audit-scoped client for a pooled client or an open transaction. */
export function auditPersistenceOf(
  handle: DatabaseClient | DatabaseTransaction,
): AuditPersistenceClient {
  return prismaClientOf(handle);
}

export { runInTransaction };
export type { TransactionOptions } from './database-client.js';
export type { AuditRecord } from './generated/prisma/client.js';
export { AuditActorType, AuditResult } from './generated/prisma/enums.js';
