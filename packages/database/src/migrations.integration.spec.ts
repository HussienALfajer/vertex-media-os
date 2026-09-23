import { execFile } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabaseClient, type DatabaseClient } from './index.js';
import { persistenceClientOf } from './persistence.js';

const runFile = promisify(execFile);
const databaseRoot = fileURLToPath(new URL('..', import.meta.url));
const prismaCli = fileURLToPath(new URL('../node_modules/prisma/build/index.js', import.meta.url));
const migrationsRoot = fileURLToPath(new URL('../prisma/migrations/', import.meta.url));
const POSTGRES_IMAGE = 'postgres:18.6-alpine';

describe('IAM migration history against real PostgreSQL', () => {
  let postgres: StartedPostgreSqlContainer;
  let url: string;
  let database: DatabaseClient;

  function assertContainerTarget(): void {
    const parsed = new URL(url);
    expect(parsed.hostname).toBe(postgres.getHost());
    expect(Number(parsed.port)).toBe(postgres.getMappedPort(5432));
    expect(parsed.pathname.slice(1)).toBe(postgres.getDatabase());
  }

  async function prisma(...args: readonly string[]): Promise<string> {
    assertContainerTarget();
    const { stdout, stderr } = await runFile(process.execPath, [prismaCli, ...args], {
      cwd: databaseRoot,
      env: { ...process.env, DATABASE_URL: url },
      timeout: 120_000,
    });
    return stdout + stderr;
  }

  beforeAll(async () => {
    postgres = await new PostgreSqlContainer(POSTGRES_IMAGE).start();
    url = postgres.getConnectionUri();
    assertContainerTarget();
    await prisma('migrate', 'deploy');
    database = createDatabaseClient({ connectionString: url });
  }, 180_000);

  afterAll(async () => {
    await database?.disconnect();
    await postgres?.stop();
  });

  it('applies all migrations from empty and records each as finished', async () => {
    const rows = await persistenceClientOf(database).$queryRaw<
      Array<{ migration_name: string; finished_at: Date | null; rolled_back_at: Date | null }>
    >`SELECT migration_name, finished_at, rolled_back_at FROM _prisma_migrations`;
    expect(rows).toHaveLength(1);
    expect(rows[0]?.migration_name).toBe('20260923013708_iam_persistence_foundation');
    expect(rows[0]?.finished_at).toBeInstanceOf(Date);
    expect(rows[0]?.rolled_back_at).toBeNull();
  });

  it('a second deploy is a no-op and changes no migration rows', async () => {
    const before = await persistenceClientOf(database).$queryRaw<
      Array<{ count: number }>
    >`SELECT count(*)::int AS count FROM _prisma_migrations`;
    const output = await prisma('migrate', 'deploy');
    const after = await persistenceClientOf(database).$queryRaw<
      Array<{ count: number }>
    >`SELECT count(*)::int AS count FROM _prisma_migrations`;
    expect(output).toContain('No pending migrations');
    expect(after).toEqual(before);
  });

  it('has no Prisma schema drift after deploy', async () => {
    await expect(
      prisma(
        'migrate',
        'diff',
        '--from-config-datasource',
        '--to-schema',
        'prisma/schema',
        '--exit-code',
      ),
    ).resolves.toBeDefined();
  });

  it('wraps every migration atomically without non-transactional statements', async () => {
    const lock = await readFile(
      new URL('../prisma/migrations/migration_lock.toml', import.meta.url),
      'utf8',
    );
    expect(lock).toMatch(/^provider = "postgresql"$/m);
    const directories = (await readdir(migrationsRoot, { withFileTypes: true })).filter((item) =>
      item.isDirectory(),
    );
    expect(directories.length).toBeGreaterThan(0);
    for (const directory of directories) {
      const sql = await readFile(
        new URL(`../prisma/migrations/${directory.name}/migration.sql`, import.meta.url),
        'utf8',
      );
      const statements = sql.replace(/^\s*--.*$/gm, '').trim();
      expect(statements).toMatch(/^BEGIN;/);
      expect(statements).toMatch(/COMMIT;$/);
      expect(statements.match(/\bBEGIN;/g)).toHaveLength(1);
      expect(statements.match(/\bCOMMIT;/g)).toHaveLength(1);
      expect(statements).not.toMatch(/\bROLLBACK\b|\bCONCURRENTLY\b|\bCREATE SCHEMA\b/i);
    }
  });

  it('creates no IAM reference data', async () => {
    const [row] = await persistenceClientOf(database).$queryRaw<
      Array<{
        users: number;
        departments: number;
        roles: number;
        permissions: number;
        memberships: number;
        assignments: number;
        grants: number;
      }>
    >`SELECT
      (SELECT count(*)::int FROM iam_application_user) AS users,
      (SELECT count(*)::int FROM iam_department) AS departments,
      (SELECT count(*)::int FROM iam_role) AS roles,
      (SELECT count(*)::int FROM iam_permission) AS permissions,
      (SELECT count(*)::int FROM iam_department_membership) AS memberships,
      (SELECT count(*)::int FROM iam_user_role_assignment) AS assignments,
      (SELECT count(*)::int FROM iam_role_permission) AS grants`;
    expect(row).toEqual({
      users: 0,
      departments: 0,
      roles: 0,
      permissions: 0,
      memberships: 0,
      assignments: 0,
      grants: 0,
    });
  });

  it('keeps the Prisma client behind a registered DatabaseClient handle', async () => {
    const client = persistenceClientOf(database);
    await expect(client.$queryRaw`SELECT 1`).resolves.toBeDefined();
    expect(() => persistenceClientOf({} as DatabaseClient)).toThrow(TypeError);
    await expect(database.ping()).resolves.toBeUndefined();
  });
});
