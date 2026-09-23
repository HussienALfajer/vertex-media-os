import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';

const runFile = promisify(execFile);
const databaseRoot = fileURLToPath(new URL('../../../packages/database/', import.meta.url));
const prismaCli = fileURLToPath(
  new URL('../../../packages/database/node_modules/prisma/build/index.js', import.meta.url),
);

export interface MigratedPostgres {
  readonly container: StartedPostgreSqlContainer;
  readonly url: string;
  /**
   * Runs SQL inside the container with psql and returns the unaligned, tuple-only output. The API
   * may not import the domain-scoped Prisma entries (lint), so tests inspect the database this way.
   */
  sql(statement: string): Promise<string>;
  stop(): Promise<void>;
}

/**
 * Starts PostgreSQL 18.6 and applies every migration with the real `prisma migrate deploy`, only
 * after asserting that the URL passed to Prisma targets the started container.
 */
export async function startMigratedPostgres(): Promise<MigratedPostgres> {
  // Distinctive credentials, so a test can prove that no log line contains them.
  const container = await new PostgreSqlContainer('postgres:18.6-alpine')
    .withUsername('sentinel_user')
    .withPassword('sentinel_password_7c1e')
    .withDatabase('sentinel_db')
    .start();
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
  return {
    container,
    url,
    async sql(statement) {
      const result = await container.exec([
        'psql',
        '-U',
        container.getUsername(),
        '-d',
        container.getDatabase(),
        '-v',
        'ON_ERROR_STOP=1',
        '-t',
        '-A',
        '-c',
        statement,
      ]);
      if (result.exitCode !== 0) throw new Error(`psql failed: ${result.output}`);
      return result.output.trim();
    },
    async stop() {
      await container.stop();
    },
  };
}
