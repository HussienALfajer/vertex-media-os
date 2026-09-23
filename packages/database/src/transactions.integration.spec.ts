import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startMigratedPostgres, type TestPostgres } from '../test-support/postgres.js';
import { auditPersistenceOf } from './audit.js';
import { iamPersistenceOf, runInTransaction } from './iam.js';
import { createDatabaseClient, type DatabaseClient, type DatabaseTransaction } from './index.js';

async function permissionCount(database: DatabaseClient): Promise<number> {
  const [row] = await iamPersistenceOf(database).$queryRaw<
    Array<{ count: number }>
  >`SELECT count(*)::int AS count FROM iam_permission`;
  return row?.count ?? -1;
}

async function insertPermission(handle: DatabaseClient | DatabaseTransaction): Promise<void> {
  await iamPersistenceOf(handle).iamPermission.create({
    data: {
      code: 'iam.users.read',
      owningModule: 'iam',
      name: 'Read users',
      description: 'Synthetic permission.',
      state: 'ACTIVE',
      sensitivity: 'STANDARD',
    },
    select: { code: true },
  });
}

describe('domain-scoped clients and runInTransaction against real PostgreSQL', () => {
  let postgres: TestPostgres;
  let database: DatabaseClient;

  beforeAll(async () => {
    postgres = await startMigratedPostgres();
    database = createDatabaseClient({ connectionString: postgres.url });
  }, 180_000);

  afterAll(async () => {
    await database?.disconnect();
    await postgres?.stop();
  });

  beforeEach(async () => {
    await iamPersistenceOf(database).$executeRaw`TRUNCATE iam_permission CASCADE`;
  });

  it('resolves both scoped accessors to one transaction client inside runInTransaction', async () => {
    await runInTransaction(database, async (transaction) => {
      expect(iamPersistenceOf(transaction)).toBe(auditPersistenceOf(transaction));
      expect(iamPersistenceOf(transaction)).not.toBe(iamPersistenceOf(database));
      await insertPermission(transaction);
      // Visible inside the transaction, invisible to the pool until it commits.
      const [inside] = await auditPersistenceOf(transaction).$queryRaw<
        Array<{ count: number }>
      >`SELECT count(*)::int AS count FROM iam_permission`;
      expect(inside?.count).toBe(1);
      expect(await permissionCount(database)).toBe(0);
    });
    expect(await permissionCount(database)).toBe(1);
  });

  it('commits when the work resolves and returns its value', async () => {
    const result = await runInTransaction(database, async (transaction) => {
      await insertPermission(transaction);
      return 'done';
    });
    expect(result).toBe('done');
    expect(await permissionCount(database)).toBe(1);
  });

  it('rolls back every write and rethrows the same error when the work rejects', async () => {
    const failure = new Error('work failed after writing');
    await expect(
      runInTransaction(database, async (transaction) => {
        await insertPermission(transaction);
        throw failure;
      }),
    ).rejects.toBe(failure);
    expect(await permissionCount(database)).toBe(0);
  });

  it('rejects a transaction handle after its transaction has ended', async () => {
    let escaped: DatabaseTransaction | undefined;
    await runInTransaction(database, async (transaction) => {
      escaped = transaction;
    });
    if (!escaped) throw new Error('Expected a transaction handle');
    const handle = escaped;
    expect(Object.isFrozen(handle)).toBe(true);
    expect(Object.keys(handle)).toEqual([]);
    expect(() => iamPersistenceOf(handle)).toThrow(TypeError);
    expect(() => auditPersistenceOf(handle)).toThrow(TypeError);
  });

  it('rejects the handle of a transaction that rolled back', async () => {
    let escaped: DatabaseTransaction | undefined;
    await runInTransaction(database, async (transaction) => {
      escaped = transaction;
      throw new Error('roll back');
    }).catch(() => undefined);
    if (!escaped) throw new Error('Expected a transaction handle');
    const handle = escaped;
    expect(() => iamPersistenceOf(handle)).toThrow(TypeError);
  });

  it('rejects handles it did not create, including a transaction handle used as a client', async () => {
    const foreign = {} as DatabaseClient;
    expect(() => iamPersistenceOf(foreign)).toThrow(TypeError);
    expect(() => auditPersistenceOf(foreign)).toThrow(TypeError);
    await expect(runInTransaction(foreign, async () => 'never')).rejects.toBeInstanceOf(TypeError);
    await runInTransaction(database, async (transaction) => {
      await expect(
        runInTransaction(transaction as unknown as DatabaseClient, async () => 'nested'),
      ).rejects.toBeInstanceOf(TypeError);
    });
  });

  it('runs ReadCommitted by default and Serializable on request', async () => {
    const isolation = (transaction: DatabaseTransaction): Promise<Array<{ level: string }>> =>
      iamPersistenceOf(transaction).$queryRaw<
        Array<{ level: string }>
      >`SELECT current_setting('transaction_isolation') AS level`;
    const defaults = await runInTransaction(database, isolation);
    const serializable = await runInTransaction(database, isolation, {
      isolationLevel: 'Serializable',
    });
    expect(defaults).toEqual([{ level: 'read committed' }]);
    expect(serializable).toEqual([{ level: 'serializable' }]);
  });

  it('ends a transaction that outlives its timeout and keeps none of its writes', async () => {
    // One server-side statement (1.5 s) outlasts the transaction bound (250 ms) but not the
    // statement bound (5 s): the transaction expires while it runs and can no longer commit.
    const failure = await runInTransaction(
      database,
      async (transaction) => {
        await insertPermission(transaction);
        await iamPersistenceOf(transaction).$executeRaw`SELECT pg_sleep(1.5)`;
      },
      { timeoutMs: 250 },
    ).catch((error: unknown) => error);
    expect(failure).toMatchObject({ code: 'P2028' });
    expect(await permissionCount(database)).toBe(0);
  });
});
