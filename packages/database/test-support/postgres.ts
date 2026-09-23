import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';

const runFile = promisify(execFile);

// Same image line as `infra/compose.yaml`, so tests and local development run one PostgreSQL major.
export const POSTGRES_IMAGE = 'postgres:18.6-alpine';
export const databaseRoot = fileURLToPath(new URL('..', import.meta.url));
const prismaCli = fileURLToPath(new URL('../node_modules/prisma/build/index.js', import.meta.url));

export interface PrismaRun {
  readonly exitCode: number;
  readonly output: string;
}

export interface TestPostgres {
  readonly container: StartedPostgreSqlContainer;
  readonly url: string;
  /**
   * Runs the repository's real Prisma CLI against this container only. `DATABASE_URL` is always
   * passed explicitly and checked to target the started container first, so a test can never
   * migrate a developer database. Rejects when the CLI exits non-zero.
   */
  prisma(args: readonly string[]): Promise<string>;
  /** Like `prisma`, but resolves with the exit code and output instead of rejecting. */
  prismaRun(args: readonly string[]): Promise<PrismaRun>;
  stop(): Promise<void>;
}

export async function startPostgres(): Promise<TestPostgres> {
  const container = await new PostgreSqlContainer(POSTGRES_IMAGE).start();
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
  const run = (args: readonly string[]) =>
    runFile(process.execPath, [prismaCli, ...args], {
      cwd: databaseRoot,
      env: { ...process.env, DATABASE_URL: url },
      timeout: 120_000,
    });
  return {
    container,
    url,
    async prisma(args) {
      const { stdout, stderr } = await run(args);
      return stdout + stderr;
    },
    async prismaRun(args) {
      try {
        const { stdout, stderr } = await run(args);
        return { exitCode: 0, output: stdout + stderr };
      } catch (error) {
        const failure = error as { code?: unknown; stdout?: unknown; stderr?: unknown };
        return {
          exitCode: typeof failure.code === 'number' ? failure.code : -1,
          output: `${String(failure.stdout ?? '')}${String(failure.stderr ?? '')}`,
        };
      }
    },
    async stop() {
      await container.stop();
    },
  };
}

/** Starts a container and applies every migration with the real `prisma migrate deploy`. */
export async function startMigratedPostgres(): Promise<TestPostgres> {
  const postgres = await startPostgres();
  try {
    await postgres.prisma(['migrate', 'deploy']);
  } catch (error) {
    await postgres.stop();
    throw error;
  }
  return postgres;
}
