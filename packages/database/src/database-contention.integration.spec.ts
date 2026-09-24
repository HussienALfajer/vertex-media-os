import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startMigratedPostgres, type TestPostgres } from '../test-support/postgres.js';
import { iamPersistenceOf, runInTransaction } from './iam.js';
import {
  createDatabaseClient,
  describeDatabaseError,
  isDatabaseContention,
  type DatabaseClient,
} from './index.js';

/**
 * Contention is classified from structured fields only (IAM-R07 D-15): a lock wait that outlives
 * the statement bound, and a transaction that outlives its own bound, are both contention; an
 * ordinary constraint violation is not.
 */
describe('database contention classification against real PostgreSQL', () => {
  let postgres: TestPostgres;
  let holder: DatabaseClient;
  let waiter: DatabaseClient;

  beforeAll(async () => {
    postgres = await startMigratedPostgres();
    holder = createDatabaseClient({ connectionString: postgres.url });
    waiter = createDatabaseClient({ connectionString: postgres.url, statementTimeoutMs: 400 });
    await iamPersistenceOf(holder).$executeRaw`
      INSERT INTO iam_permission (code, owning_module, name, description, state, sensitivity)
      VALUES ('iam.users.read', 'iam', 'Read users', 'Synthetic permission.', 'ACTIVE', 'STANDARD'),
        ('iam.users.create', 'iam', 'Create users', 'Synthetic permission.', 'ACTIVE', 'STANDARD')`;
  }, 180_000);

  afterAll(async () => {
    await holder?.disconnect();
    await waiter?.disconnect();
    await postgres?.stop();
  });

  it('classifies a lock wait that exceeds the statement bound as contention', async () => {
    let release: () => void = () => undefined;
    const released = new Promise<void>((resolve) => (release = resolve));
    let locked: () => void = () => undefined;
    const isLocked = new Promise<void>((resolve) => (locked = resolve));
    const holding = runInTransaction(
      holder,
      async (transaction) => {
        await iamPersistenceOf(transaction).$queryRaw`
          SELECT code FROM iam_permission WHERE code = 'iam.users.read' FOR UPDATE`;
        locked();
        await released;
      },
      { timeoutMs: 10_000 },
    );
    await isLocked;

    const failure = await runInTransaction(waiter, async (transaction) => {
      await iamPersistenceOf(transaction).$queryRaw`
        SELECT code FROM iam_permission WHERE code = 'iam.users.read' FOR UPDATE`;
    }).catch((error: unknown) => error);
    release();
    await holding;

    // The server's statement timeout cancels the wait; the driver gives up only a margin later.
    expect(describeDatabaseError(failure)).toMatchObject({ sqlState: '57014' });
    expect(isDatabaseContention(failure)).toBe(true);
  });

  it('classifies a transaction that outlives its bound as contention', async () => {
    const failure = await runInTransaction(
      holder,
      async (transaction) => {
        await iamPersistenceOf(transaction).$executeRaw`SELECT pg_sleep(0.5)`;
      },
      { timeoutMs: 100 },
    ).catch((error: unknown) => error);
    expect(describeDatabaseError(failure)).toMatchObject({ prismaCode: 'P2028' });

    expect(isDatabaseContention(failure)).toBe(true);
  });

  /** Holds a row lock on `code` in a transaction of `client` until `release` is called. */
  async function holdRow(client: DatabaseClient, code: string) {
    let release: () => void = () => undefined;
    const released = new Promise<void>((resolve) => (release = resolve));
    let locked: () => void = () => undefined;
    const isLocked = new Promise<void>((resolve) => (locked = resolve));
    const holding = runInTransaction(
      client,
      async (transaction) => {
        await iamPersistenceOf(transaction).$queryRaw`
          SELECT code FROM iam_permission WHERE code = ${code} FOR UPDATE`;
        locked();
        await released;
      },
      { timeoutMs: 10_000 },
    );
    await isLocked;
    return { release, holding };
  }

  it('classifies a refused lock (55P03) as contention (IAM-R07 T-8)', async () => {
    const hold = await holdRow(holder, 'iam.users.read');
    const failure = await runInTransaction(waiter, async (transaction) => {
      await iamPersistenceOf(transaction).$queryRaw`
        SELECT code FROM iam_permission WHERE code = 'iam.users.read' FOR UPDATE NOWAIT`;
    }).catch((error: unknown) => error);
    hold.release();
    await hold.holding;

    expect(describeDatabaseError(failure)).toMatchObject({ sqlState: '55P03' });
    expect(isDatabaseContention(failure)).toBe(true);
  });

  it('classifies a deadlock victim as contention (IAM-R07 T-8)', async () => {
    // The statement bound outlasts PostgreSQL's deadlock detection (deadlock_timeout, 1 s).
    const first = createDatabaseClient({
      connectionString: postgres.url,
      statementTimeoutMs: 5_000,
    });
    const second = createDatabaseClient({
      connectionString: postgres.url,
      statementTimeoutMs: 5_000,
    });
    try {
      let firstLocked: () => void = () => undefined;
      const firstHolds = new Promise<void>((resolve) => (firstLocked = resolve));
      let secondLocked: () => void = () => undefined;
      const secondHolds = new Promise<void>((resolve) => (secondLocked = resolve));
      const lockBoth = (
        client: DatabaseClient,
        own: string,
        other: string,
        held: () => void,
        otherHeld: Promise<void>,
      ) =>
        runInTransaction(
          client,
          async (transaction) => {
            const scoped = iamPersistenceOf(transaction);
            await scoped.$queryRaw`SELECT code FROM iam_permission WHERE code = ${own} FOR UPDATE`;
            held();
            await otherHeld;
            await scoped.$queryRaw`SELECT code FROM iam_permission WHERE code = ${other} FOR UPDATE`;
          },
          { timeoutMs: 10_000 },
        ).then(
          () => undefined,
          (error: unknown) => error,
        );
      // Opposite lock orders: PostgreSQL's deadlock detector aborts one of the two.
      const outcomes = await Promise.all([
        lockBoth(first, 'iam.users.read', 'iam.users.create', firstLocked, secondHolds),
        lockBoth(second, 'iam.users.create', 'iam.users.read', secondLocked, firstHolds),
      ]);
      const failures = outcomes.filter((outcome) => outcome !== undefined);
      expect(failures).toHaveLength(1);
      const [failure] = failures;
      // A raw statement reports the SQLSTATE under P2010.
      expect(describeDatabaseError(failure)).toMatchObject({ sqlState: '40P01' });
      expect(isDatabaseContention(failure)).toBe(true);
    } finally {
      await first.disconnect();
      await second.disconnect();
    }
  });

  /**
   * Runs `write` in a REPEATABLE READ transaction whose snapshot predates another transaction's
   * change to the row it then writes, and returns the failure.
   */
  async function staleWrite(
    write: (scoped: ReturnType<typeof iamPersistenceOf>) => Promise<unknown>,
  ): Promise<unknown> {
    let read: () => void = () => undefined;
    const hasRead = new Promise<void>((resolve) => (read = resolve));
    let changed: () => void = () => undefined;
    const hasChanged = new Promise<void>((resolve) => (changed = resolve));
    const repeatable = runInTransaction(
      waiter,
      async (transaction) => {
        const scoped = iamPersistenceOf(transaction);
        await scoped.$executeRaw`SET TRANSACTION ISOLATION LEVEL REPEATABLE READ`;
        await scoped.$queryRaw`SELECT name FROM iam_permission WHERE code = 'iam.users.create'`;
        read();
        await hasChanged;
        await write(scoped);
      },
      { timeoutMs: 10_000 },
    ).then(
      () => undefined,
      (error: unknown) => error,
    );
    await hasRead;
    await iamPersistenceOf(holder).$executeRaw`
      UPDATE iam_permission SET name = name || '.' WHERE code = 'iam.users.create'`;
    changed();
    return repeatable;
  }

  it('classifies a write conflict of a typed query (P2034) as contention (IAM-R07 T-8)', async () => {
    const failure = await staleWrite((scoped) =>
      scoped.iamPermission.update({
        where: { code: 'iam.users.create' },
        data: { name: 'Create users (typed)' },
      }),
    );
    expect(describeDatabaseError(failure)).toMatchObject({ prismaCode: 'P2034' });
    expect(isDatabaseContention(failure)).toBe(true);
  });

  it('classifies a serialization failure of a raw statement (40001) as contention (IAM-R07 T-8)', async () => {
    const failure = await staleWrite((scoped) =>
      Promise.resolve(
        scoped.$executeRaw`UPDATE iam_permission SET name = 'Create users (raw)' WHERE code = 'iam.users.create'`,
      ),
    );
    expect(describeDatabaseError(failure)).toMatchObject({ sqlState: '40001' });
    expect(isDatabaseContention(failure)).toBe(true);
  });

  it('does not classify a constraint violation or a non-database error as contention', async () => {
    const failure = await iamPersistenceOf(holder)
      .$executeRaw`INSERT INTO iam_permission (code, owning_module, name, description, state,
        sensitivity) VALUES ('iam.users.read', 'iam', 'x', 'x', 'ACTIVE', 'STANDARD')`.catch(
      (error: unknown) => error,
    );

    expect(describeDatabaseError(failure)).toMatchObject({ sqlState: '23505' });
    expect(isDatabaseContention(failure)).toBe(false);
    expect(isDatabaseContention(new Error('57014'))).toBe(false);
  });
});
