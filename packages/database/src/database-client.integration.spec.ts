import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { getContainerRuntimeClient } from 'testcontainers';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabaseClient, DatabaseUnavailableError } from './index.js';

// Same image line as `infra/compose.yaml`, so tests and local development run one PostgreSQL major.
const POSTGRES_IMAGE = 'postgres:18.6-alpine';

describe('createDatabaseClient against real PostgreSQL (Testcontainers)', () => {
  let postgres: StartedPostgreSqlContainer;

  beforeAll(async () => {
    postgres = await new PostgreSqlContainer(POSTGRES_IMAGE).start();
  }, 180_000);

  afterAll(async () => {
    await postgres?.stop();
  });

  it('ping resolves when PostgreSQL answers', async () => {
    const client = createDatabaseClient({ connectionString: postgres.getConnectionUri() });
    try {
      await expect(client.ping()).resolves.toBeUndefined();
    } finally {
      await client.disconnect();
    }
  });

  it('ping rejects with a log-safe error when PostgreSQL is unreachable', async () => {
    // TCP port 1 is never a PostgreSQL listener; the connection is refused immediately.
    const client = createDatabaseClient({
      connectionString: 'postgresql://nobody:nothing@127.0.0.1:1/unreachable',
      connectTimeoutMs: 2_000,
    });
    try {
      const failure = await client.ping().catch((error: unknown) => error);

      expect(failure).toBeInstanceOf(DatabaseUnavailableError);
      expect(failure).toMatchObject({ reason: 'DatabaseNotReachable', sqlState: undefined });
      expect(failure).not.toHaveProperty('cause');
      expect(JSON.stringify(failure) + String(failure)).not.toMatch(
        /127\.0\.0\.1|nobody|nothing|unreachable/,
      );
    } finally {
      await client.disconnect();
    }
  });

  it('ping rejects with a log-safe error when PostgreSQL refuses the credentials', async () => {
    const url = new URL(postgres.getConnectionUri());
    url.username = 'sentinel_user';
    url.password = 'sentinel-password-7c1e';
    const client = createDatabaseClient({ connectionString: url.toString() });
    try {
      const failure = await client.ping().catch((error: unknown) => error);

      expect(failure).toBeInstanceOf(DatabaseUnavailableError);
      expect(failure).toMatchObject({ reason: 'AuthenticationFailed', sqlState: '28P01' });
      expect(JSON.stringify(failure) + String(failure)).not.toContain('sentinel');
    } finally {
      await client.disconnect();
    }
  });

  it('ping itself gives up within its bounds while PostgreSQL is stalled, then recovers', async () => {
    const client = createDatabaseClient({
      connectionString: postgres.getConnectionUri(),
      connectTimeoutMs: 1_000,
      statementTimeoutMs: 1_000,
    });
    const container = (await getContainerRuntimeClient()).container.getById(postgres.getId());
    try {
      // Leaves one established, idle connection in the pool.
      await client.ping();

      // A paused container accepts TCP connections but never answers: a stalled server.
      await container.pause();
      try {
        // The pooled connection sends the statement and gets no answer: the statement bound ends it
        // and discards that connection.
        await expectToRejectWithin(client.ping(), 3_000);
        // No connection is left, so this attempt has to connect: the connect bound ends it.
        await expectToRejectWithin(client.ping(), 3_000);
      } finally {
        await container.unpause();
      }

      await expect(client.ping()).resolves.toBeUndefined();
    } finally {
      await client.disconnect();
    }
  });
});

/** Asserts that the operation itself settles as a rejection, not merely that a caller stops waiting. */
async function expectToRejectWithin(operation: Promise<unknown>, limitMs: number): Promise<void> {
  const startedAt = performance.now();
  await expect(operation).rejects.toBeInstanceOf(DatabaseUnavailableError);
  expect(performance.now() - startedAt).toBeLessThan(limitMs);
}
