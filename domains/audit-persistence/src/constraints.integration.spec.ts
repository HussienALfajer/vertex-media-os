import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { auditFixtures } from '../test-support/validation-fixtures.js';
import { startMigratedPostgres, type MigratedPostgres } from '../test-support/postgres.js';

const USER_ID = '0f8fad5b-d9cb-469f-a165-70867728950e';
const INSERT = `INSERT INTO audit_record
  (source_module, action, actor_type, actor_user_id, actor_process, target_type, target_id,
   result, trace_id, reason, change)
  VALUES ($1, $2, $3::audit_actor_type, $4::uuid, $5, $6, $7, $8::audit_result, $9, $10, $11::jsonb)`;

interface Row {
  readonly sourceModule: string;
  readonly action: string;
  readonly actorType: string;
  readonly actorUserId: string | null;
  readonly actorProcess: string | null;
  readonly targetType: string;
  readonly targetId: string;
  readonly result: string;
  readonly traceId: string;
  readonly reason: string | null;
  /** JSON text, or null for SQL NULL. */
  readonly change: string | null;
}

const VALID: Row = {
  sourceModule: 'iam',
  action: 'iam.role.created',
  actorType: 'SYSTEM',
  actorUserId: null,
  actorProcess: 'iam.reference-sync',
  targetType: 'iam.role',
  targetId: 'a',
  result: 'SUCCEEDED',
  traceId: 'trace-1',
  reason: null,
  change: null,
};

describe('named audit_record constraints', () => {
  let postgres: MigratedPostgres;

  beforeAll(async () => {
    postgres = await startMigratedPostgres();
  }, 180_000);
  afterAll(async () => {
    await postgres?.stop();
  });
  beforeEach(async () => {
    await postgres.client.$executeRawUnsafe('TRUNCATE audit_record');
  });

  function values(row: Row): unknown[] {
    return [
      row.sourceModule,
      row.action,
      row.actorType,
      row.actorUserId,
      row.actorProcess,
      row.targetType,
      row.targetId,
      row.result,
      row.traceId,
      row.reason,
      row.change,
    ];
  }

  async function insert(overrides: Partial<Row> = {}): Promise<void> {
    await postgres.client.$executeRawUnsafe(INSERT, ...values({ ...VALID, ...overrides }));
  }

  function causeOf(error: unknown): Record<string, unknown> | undefined {
    if (typeof error !== 'object' || error === null) return undefined;
    const meta = (error as { meta?: { driverAdapterError?: { cause?: Record<string, unknown> } } })
      .meta;
    return meta?.driverAdapterError?.cause;
  }

  /** Expects SQLSTATE 23514 from one of the named checks (the first one PostgreSQL evaluates). */
  async function expectCheck(overrides: Partial<Row>, ...constraints: string[]): Promise<void> {
    const error: unknown = await postgres.client
      .$executeRawUnsafe(INSERT, ...values({ ...VALID, ...overrides }))
      .catch((failure: unknown) => failure);
    expect(error).toBeInstanceOf(Error);
    expect(causeOf(error)).toMatchObject({ originalCode: '23514' });
    // Prisma 7.10's driver adapter drops the structured CHECK name; this test-only assertion
    // reads PostgreSQL's message. Production code never parses error text.
    const message = String(causeOf(error)?.['originalMessage']);
    expect(constraints.some((name) => message.includes(`"${name}"`))).toBe(true);
  }

  it('accepts the valid baseline row', async () => {
    await insert();
  });

  it.each(auditFixtures.validModuleCodes)('accepts source module fixture %s', async (module) => {
    await insert({ sourceModule: module, action: `${module}.role.created` });
  });

  it.each(auditFixtures.invalidModuleCodes)('rejects source module fixture %s', async (module) => {
    // PostgreSQL evaluates CHECK constraints in name order, so an action that repeats an invalid
    // module can trip the action grammar first; both reject the row.
    await expectCheck(
      { sourceModule: module, action: `${module}.role.created` },
      'audit_record_action_ck',
      'audit_record_source_module_ck',
    );
  });

  it('isolates the source-module length bounds with a matching, well-formed action', async () => {
    for (const module of ['i', 'a'.repeat(33)]) {
      await expectCheck(
        { sourceModule: module, action: `${module}.role.created` },
        'audit_record_source_module_ck',
      );
    }
  });

  it.each(auditFixtures.validActions)('accepts action fixture %s', async (action) => {
    await insert({ action });
  });

  it.each(auditFixtures.invalidActions)('rejects action fixture %s', async (action) => {
    await expectCheck({ action }, 'audit_record_action_ck');
  });

  it('requires the first action segment to equal the source module', async () => {
    await expectCheck({ action: 'crm.role.created' }, 'audit_record_action_module_ck');
  });

  it('requires exactly the actor columns of the actor type', async () => {
    await insert({ actorType: 'USER', actorUserId: USER_ID, actorProcess: null });
    for (const actor of [
      { actorType: 'USER', actorUserId: USER_ID, actorProcess: 'iam.reference-sync' },
      { actorType: 'USER', actorUserId: null, actorProcess: null },
      { actorType: 'SYSTEM', actorUserId: USER_ID, actorProcess: 'iam.reference-sync' },
      { actorType: 'SYSTEM', actorUserId: null, actorProcess: null },
      { actorType: 'USER', actorUserId: null, actorProcess: 'iam.reference-sync' },
    ]) {
      await expectCheck(actor, 'audit_record_actor_ck');
    }
  });

  it.each(auditFixtures.validProcesses)('accepts system process fixture %s', async (process) => {
    await insert({ actorProcess: process });
  });

  it.each(auditFixtures.invalidProcesses)('rejects system process fixture %s', async (process) => {
    await expectCheck({ actorProcess: process }, 'audit_record_actor_process_ck');
  });

  it.each(auditFixtures.validTargetTypes)('accepts target type fixture %s', async (targetType) => {
    await insert({ targetType });
  });

  it.each(auditFixtures.invalidTargetTypes)(
    'rejects target type fixture %s',
    async (targetType) => {
      await expectCheck({ targetType }, 'audit_record_target_type_ck');
    },
  );

  it.each(auditFixtures.validTargetIds)('accepts target id fixture %s', async (targetId) => {
    await insert({ targetId });
  });

  it.each(auditFixtures.invalidTargetIds)('rejects target id fixture %s', async (targetId) => {
    await expectCheck({ targetId }, 'audit_record_target_id_ck');
  });

  it.each(auditFixtures.validTraceIds)('accepts trace id fixture %s', async (traceId) => {
    await insert({ traceId });
  });

  it.each(auditFixtures.invalidTraceIds)('rejects trace id fixture %s', async (traceId) => {
    await expectCheck({ traceId }, 'audit_record_trace_id_ck');
  });

  it.each(auditFixtures.validReasons)('accepts reason fixture %s', async (reason) => {
    await insert({ reason });
  });

  it.each(auditFixtures.invalidReasons.map((reason) => [JSON.stringify(reason), reason]))(
    'rejects reason fixture %s',
    async (_label, reason) => {
      await expectCheck({ reason }, 'audit_record_reason_ck');
    },
  );

  it('bounds the reason at 500 characters', async () => {
    await insert({ reason: 'x'.repeat(500) });
    await expectCheck({ reason: 'x'.repeat(501) }, 'audit_record_reason_ck');
  });

  it('accepts object change evidence with before and/or after', async () => {
    await insert({ change: '{"after":{"name":"x"}}' });
    await insert({ change: '{"before":{"name":"x"},"after":{"name":"y"}}' });
  });

  it.each([
    ['JSON null', 'null'],
    ['a number', '42'],
    ['a string', '"after"'],
    ['an array', '[{"after":{}}]'],
    ['an empty object', '{}'],
    ['an extra top-level key', '{"after":{"name":"x"},"extra":1}'],
    ['only an unknown key', '{"during":{"name":"x"}}'],
  ])('rejects %s as change evidence', async (_label, change) => {
    await expectCheck({ change }, 'audit_record_change_ck');
  });

  it('bounds the serialized change evidence', async () => {
    await insert({ change: JSON.stringify({ after: { text: 'x'.repeat(32_000) } }) });
    await expectCheck(
      { change: JSON.stringify({ after: { text: 'x'.repeat(32_768) } }) },
      'audit_record_change_ck',
    );
  });

  it('has exactly the planned constraints, and no foreign key, secondary index, trigger or function', async () => {
    const constraints = await postgres.client.$queryRaw<Array<{ name: string; type: string }>>`
      SELECT conname::text AS name, contype::text AS type FROM pg_constraint
      WHERE conrelid = 'audit_record'::regclass AND contype IN ('p', 'u', 'f', 'c', 'x', 't')
      ORDER BY conname COLLATE "C"`;
    expect(constraints).toEqual([
      { name: 'audit_record_action_ck', type: 'c' },
      { name: 'audit_record_action_module_ck', type: 'c' },
      { name: 'audit_record_actor_ck', type: 'c' },
      { name: 'audit_record_actor_process_ck', type: 'c' },
      { name: 'audit_record_change_ck', type: 'c' },
      { name: 'audit_record_pkey', type: 'p' },
      { name: 'audit_record_reason_ck', type: 'c' },
      { name: 'audit_record_source_module_ck', type: 'c' },
      { name: 'audit_record_target_id_ck', type: 'c' },
      { name: 'audit_record_target_type_ck', type: 'c' },
      { name: 'audit_record_trace_id_ck', type: 'c' },
    ]);
    const indexes = await postgres.client.$queryRaw<Array<{ name: string }>>`
      SELECT indexname::text AS name FROM pg_indexes WHERE tablename = 'audit_record'`;
    expect(indexes).toEqual([{ name: 'audit_record_pkey' }]);
    const references = await postgres.client.$queryRaw<Array<{ count: number }>>`
      SELECT count(*)::int AS count FROM pg_constraint
      WHERE contype = 'f' AND (conrelid = 'audit_record'::regclass OR confrelid = 'audit_record'::regclass)`;
    expect(references).toEqual([{ count: 0 }]);
    const triggers = await postgres.client.$queryRaw<Array<{ count: number }>>`
      SELECT count(*)::int AS count FROM pg_trigger WHERE tgrelid = 'audit_record'::regclass`;
    expect(triggers).toEqual([{ count: 0 }]);
    const functions = await postgres.client.$queryRaw<Array<{ count: number }>>`
      SELECT count(*)::int AS count FROM pg_proc WHERE pronamespace = 'public'::regnamespace`;
    expect(functions).toEqual([{ count: 0 }]);
    const enums = await postgres.client.$queryRaw<Array<{ type: string; labels: string[] }>>`
      SELECT t.typname::text AS type, array_agg(e.enumlabel::text ORDER BY e.enumsortorder) AS labels
      FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
      WHERE t.typname LIKE 'audit_%' GROUP BY t.typname ORDER BY t.typname COLLATE "C"`;
    expect(enums).toEqual([
      { type: 'audit_actor_type', labels: ['USER', 'SYSTEM'] },
      { type: 'audit_result', labels: ['SUCCEEDED', 'REFUSED', 'FAILED'] },
    ]);
    for (const { name } of constraints) expect(Buffer.byteLength(name)).toBeLessThanOrEqual(63);
  });

  it('assigns id and occurred_at by default and has no other defaults', async () => {
    const defaults = await postgres.client.$queryRaw<Array<{ column: string; value: string }>>`
      SELECT column_name::text AS column, column_default::text AS value FROM information_schema.columns
      WHERE table_name = 'audit_record' AND column_default IS NOT NULL
      ORDER BY column_name COLLATE "C"`;
    expect(defaults).toEqual([
      { column: 'id', value: 'gen_random_uuid()' },
      { column: 'occurred_at', value: 'transaction_timestamp()' },
    ]);
  });
});
