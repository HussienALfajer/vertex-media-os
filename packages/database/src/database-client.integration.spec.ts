import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabaseClient } from './index.js';

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

  it('ping rejects when PostgreSQL is unreachable', async () => {
    // TCP port 1 is never a PostgreSQL listener; the connection is refused immediately.
    const client = createDatabaseClient({
      connectionString: 'postgresql://nobody:nothing@127.0.0.1:1/unreachable',
      connectTimeoutMs: 2_000,
    });
    try {
      await expect(client.ping()).rejects.toThrow();
    } finally {
      await client.disconnect();
    }
  });
});
