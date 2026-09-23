import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createAuditEntry, type AuditEntry, type AuditEntryInput } from '@vertex-os/audit';
import type { DatabaseClient, DatabaseTransaction } from '@vertex-os/database';
import { auditPersistenceOf, runInTransaction } from '@vertex-os/database/audit';
import { createAuditRecorder } from './index.js';
import { startMigratedPostgres, type MigratedPostgres } from '../test-support/postgres.js';

const USER_ID = '0f8fad5b-d9cb-469f-a165-70867728950e';
const ROLE_ID = '6f1e0c64-2f4b-4f6e-9b76-2b8a2d1f6a10';

function auditEntry(overrides: Partial<AuditEntryInput> = {}): AuditEntry {
  const result = createAuditEntry({
    sourceModule: 'iam',
    action: 'iam.role.created',
    actor: { type: 'SYSTEM', process: 'iam.reference-sync' },
    target: { type: 'iam.role', id: ROLE_ID },
    result: 'SUCCEEDED',
    traceId: 'trace-audit-1',
    ...overrides,
  });
  if (!result.ok) throw new Error(`Invalid test entry: ${result.reason}`);
  return result.value;
}

describe('createAuditRecorder against real PostgreSQL', () => {
  let postgres: MigratedPostgres;

  beforeAll(async () => {
    postgres = await startMigratedPostgres();
  }, 180_000);
  afterAll(async () => {
    await postgres?.stop();
  });
  beforeEach(async () => {
    await postgres.client.$executeRaw`TRUNCATE audit_record`;
  });

  async function count(handle: DatabaseClient | DatabaseTransaction): Promise<number> {
    const [row] = await auditPersistenceOf(handle).$queryRaw<
      Array<{ count: number }>
    >`SELECT count(*)::int AS count FROM audit_record`;
    return row?.count ?? -1;
  }

  it('persists every field of a USER entry with reason and change evidence', async () => {
    const entry = auditEntry({
      action: 'iam.role.permissions-granted',
      actor: { type: 'USER', userId: USER_ID },
      result: 'REFUSED',
      reason: 'سبب إداري',
      change: {
        before: { name: 'Old', description: null },
        after: {
          permissionCodes: ['iam.users.read', 'iam.roles.read'],
          version: 2,
          isSystem: false,
        },
      },
    });
    await createAuditRecorder(postgres.database).append(entry);
    const rows = await postgres.client.auditRecord.findMany();
    expect(rows).toHaveLength(1);
    const [row] = rows;
    expect(row).toMatchObject({
      sourceModule: 'iam',
      action: 'iam.role.permissions-granted',
      actorType: 'USER',
      actorUserId: USER_ID,
      actorProcess: null,
      targetType: 'iam.role',
      targetId: ROLE_ID,
      result: 'REFUSED',
      traceId: 'trace-audit-1',
      reason: 'سبب إداري',
      change: {
        before: { name: 'Old', description: null },
        after: {
          permissionCodes: ['iam.users.read', 'iam.roles.read'],
          version: 2,
          isSystem: false,
        },
      },
    });
    expect(row?.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(row?.occurredAt).toBeInstanceOf(Date);
  });

  it('persists a SYSTEM entry and stores an absent change and reason as SQL NULL', async () => {
    await createAuditRecorder(postgres.database).append(auditEntry({ result: 'FAILED' }));
    const rows = await postgres.client.$queryRaw<
      Array<{
        actor_type: string;
        actor_user_id: string | null;
        actor_process: string;
        result: string;
        reason_is_null: boolean;
        change_is_sql_null: boolean;
      }>
    >`SELECT actor_type::text, actor_user_id::text, actor_process, result::text,
        reason IS NULL AS reason_is_null, change IS NULL AS change_is_sql_null FROM audit_record`;
    expect(rows).toEqual([
      {
        actor_type: 'SYSTEM',
        actor_user_id: null,
        actor_process: 'iam.reference-sync',
        result: 'FAILED',
        reason_is_null: true,
        change_is_sql_null: true,
      },
    ]);
  });

  it('lets the database assign occurred_at: the start of the appending transaction, shared by its appends', async () => {
    await runInTransaction(postgres.database, async (transaction) => {
      const recorder = createAuditRecorder(transaction);
      await recorder.append(auditEntry({ traceId: 'first' }));
      // A server-side pause separates the two appends by 20 ms; a caller-supplied clock value
      // would differ between them, the transaction-start default cannot.
      await auditPersistenceOf(transaction).$executeRaw`SELECT pg_sleep(0.02)`;
      await recorder.append(auditEntry({ traceId: 'second' }));
      const rows = await auditPersistenceOf(transaction).$queryRaw<
        Array<{ trace_id: string; at_transaction_start: boolean; not_in_future: boolean }>
      >`SELECT trace_id, occurred_at = CURRENT_TIMESTAMP::timestamptz(3) AS at_transaction_start,
          occurred_at <= clock_timestamp() AS not_in_future
        FROM audit_record ORDER BY trace_id`;
      expect(rows).toEqual([
        { trace_id: 'first', at_transaction_start: true, not_in_future: true },
        { trace_id: 'second', at_transaction_start: true, not_in_future: true },
      ]);
    });
    const [distinct] = await postgres.client.$queryRaw<
      Array<{ instants: number }>
    >`SELECT count(DISTINCT occurred_at)::int AS instants FROM audit_record`;
    expect(distinct?.instants).toBe(1);
  });

  it('keeps an append only when the caller transaction commits', async () => {
    const failure = new Error('caller failed after appending');
    await expect(
      runInTransaction(postgres.database, async (transaction) => {
        await createAuditRecorder(transaction).append(auditEntry());
        expect(await count(transaction)).toBe(1);
        throw failure;
      }),
    ).rejects.toBe(failure);
    expect(await count(postgres.database)).toBe(0);

    await runInTransaction(postgres.database, async (transaction) => {
      await createAuditRecorder(transaction).append(auditEntry());
      expect(await count(postgres.database)).toBe(0);
    });
    expect(await count(postgres.database)).toBe(1);
  });

  it('propagates a database rejection unchanged and fails the caller transaction', async () => {
    // A forged entry that bypasses createAuditEntry is still stopped by the database backstop.
    const forged = { ...auditEntry(), traceId: 'has spaces' } as AuditEntry;
    const failure = await runInTransaction(postgres.database, async (transaction) => {
      await createAuditRecorder(transaction).append(auditEntry());
      await createAuditRecorder(transaction).append(forged);
    }).catch((error: unknown) => error);
    expect(failure).toMatchObject({
      code: 'P2039',
      meta: { driverAdapterError: { cause: { originalCode: '23514' } } },
    });
    expect(await count(postgres.database)).toBe(0);
  });

  it('exposes exactly one operation, append, on a frozen object', () => {
    const recorder = createAuditRecorder(postgres.database);
    expect(Object.keys(recorder)).toEqual(['append']);
    expect(Object.isFrozen(recorder)).toBe(true);
    expect(typeof recorder.append).toBe('function');
  });

  it('rejects a handle it did not create and a transaction that has ended', async () => {
    expect(() => createAuditRecorder({} as DatabaseClient)).toThrow(TypeError);
    let escaped: DatabaseTransaction | undefined;
    let recorderOfEndedTransaction: ReturnType<typeof createAuditRecorder> | undefined;
    await runInTransaction(postgres.database, async (transaction) => {
      escaped = transaction;
      recorderOfEndedTransaction = createAuditRecorder(transaction);
    });
    if (!escaped || !recorderOfEndedTransaction) throw new Error('Expected a transaction handle');
    const ended = escaped;
    expect(() => createAuditRecorder(ended)).toThrow(TypeError);
    await expect(recorderOfEndedTransaction.append(auditEntry())).rejects.toBeInstanceOf(TypeError);
    expect(await count(postgres.database)).toBe(0);
  });
});
