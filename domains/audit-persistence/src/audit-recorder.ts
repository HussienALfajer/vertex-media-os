import type {
  AuditActorType as ContractActorType,
  AuditEntry,
  AuditRecorder,
  AuditResult as ContractResult,
} from '@vertex-os/audit';
import type { DatabaseClient, DatabaseTransaction } from '@vertex-os/database';
import { AuditActorType, AuditResult, auditPersistenceOf } from '@vertex-os/database/audit';

const actorTypeToDatabase = {
  USER: AuditActorType.USER,
  SYSTEM: AuditActorType.SYSTEM,
} satisfies Record<ContractActorType, AuditActorType>;

const resultToDatabase = {
  SUCCEEDED: AuditResult.SUCCEEDED,
  REFUSED: AuditResult.REFUSED,
  FAILED: AuditResult.FAILED,
} satisfies Record<ContractResult, AuditResult>;

/**
 * MOD-AUDIT's append capability on PostgreSQL. Bound to a pooled client, each append is its own
 * statement; bound to an open transaction, each append joins that transaction, so the evidence
 * commits or rolls back with the caller's change. It never writes `occurred_at` (the database
 * assigns it), never logs, and lets every database error propagate unchanged. A handle this
 * package did not create, or a transaction that has ended, is rejected with `TypeError`.
 */
export function createAuditRecorder(handle: DatabaseClient | DatabaseTransaction): AuditRecorder {
  auditPersistenceOf(handle);
  return Object.freeze({
    async append(entry: AuditEntry): Promise<void> {
      await auditPersistenceOf(handle).auditRecord.create({
        data: {
          sourceModule: entry.sourceModule,
          action: entry.action,
          actorType: actorTypeToDatabase[entry.actor.type],
          actorUserId: entry.actor.type === 'USER' ? entry.actor.userId : null,
          actorProcess: entry.actor.type === 'SYSTEM' ? entry.actor.process : null,
          targetType: entry.target.type,
          targetId: entry.target.id,
          result: resultToDatabase[entry.result],
          traceId: entry.traceId,
          ...(entry.reason === undefined ? {} : { reason: entry.reason }),
          ...(entry.change === undefined ? {} : { change: entry.change }),
        },
        select: { id: true },
      });
    },
  });
}
