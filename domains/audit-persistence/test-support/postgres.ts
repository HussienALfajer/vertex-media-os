import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { createDatabaseClient, type DatabaseClient } from '@vertex-os/database';
import { auditPersistenceOf, type AuditPersistenceClient } from '@vertex-os/database/audit';

const runFile = promisify(execFile);
const databaseRoot = fileURLToPath(new URL('../../../packages/database/', import.meta.url));
const prismaCli = fileURLToPath(
  new URL('../../../packages/database/node_modules/prisma/build/index.js', import.meta.url),
);

export interface MigratedPostgres {
  readonly container: StartedPostgreSqlContainer;
  readonly url: string;
  readonly database: DatabaseClient;
  readonly client: AuditPersistenceClient;
  stop(): Promise<void>;
}

/**
 * Starts PostgreSQL 18.6 and applies every migration with the real `prisma migrate deploy`, only
 * after asserting that the URL passed to Prisma targets the started container.
 */
export async function startMigratedPostgres(): Promise<MigratedPostgres> {
  const container = await new PostgreSqlContainer('postgres:18.6-alpine').start();
  const url = container.getConnectionUri();
  const parsed = new URL(url);
  if (
    parsed.hostname !== container.getHost() ||
    Number(parsed.port) !== container.getMappedPort(5432) ||
    parsed.pathname.slice(1) !== container.getDatabase()
  ) {
    await container.stop();
    throw new Error('Test database URL does not target the started container.');
  }
  try {
    await runFile(process.execPath, [prismaCli, 'migrate', 'deploy'], {
      cwd: databaseRoot,
      env: { ...process.env, DATABASE_URL: url },
      timeout: 120_000,
    });
  } catch (error) {
    await container.stop();
    throw error;
  }
  const database = createDatabaseClient({ connectionString: url });
  return {
    container,
    url,
    database,
    client: auditPersistenceOf(database),
    async stop(): Promise<void> {
      await database.disconnect();
      await container.stop();
    },
  };
}
