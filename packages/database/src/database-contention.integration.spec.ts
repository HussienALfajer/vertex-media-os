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
      VALUES ('iam.users.read', 'iam', 'Read users', 'Synthetic permission.', 'ACTIVE', 'STANDARD')`;
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
