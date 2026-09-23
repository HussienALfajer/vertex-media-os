import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startMigratedPostgres, type TestPostgres } from '../test-support/postgres.js';
import { createDatabaseClient, type DatabaseClient } from './index.js';
import { iamPersistenceOf } from './iam.js';

const migrationsRoot = fileURLToPath(new URL('../prisma/migrations/', import.meta.url));
/** The complete, ordered migration history; forward-only, so it only ever grows. */
const MIGRATIONS = [
  '20260923013708_iam_persistence_foundation',
  '20260923035742_audit_foundation',
  '20260923041312_iam_system_role_code',
];

describe('IAM migration history against real PostgreSQL', () => {
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

  it('applies all migrations from empty, in order, and records each as finished', async () => {
    const rows = await iamPersistenceOf(database).$queryRaw<
      Array<{ migration_name: string; finished_at: Date | null; rolled_back_at: Date | null }>
    >`SELECT migration_name, finished_at, rolled_back_at FROM _prisma_migrations
      ORDER BY started_at, migration_name COLLATE "C"`;
    expect(rows.map((row) => row.migration_name)).toEqual(MIGRATIONS);
    for (const row of rows) {
      expect(row.finished_at).toBeInstanceOf(Date);
      expect(row.rolled_back_at).toBeNull();
    }
  });

  it('a second deploy is a no-op and changes no migration rows', async () => {
    const before = await iamPersistenceOf(database).$queryRaw<
      Array<{ count: number }>
    >`SELECT count(*)::int AS count FROM _prisma_migrations`;
    const output = await postgres.prisma(['migrate', 'deploy']);
    const after = await iamPersistenceOf(database).$queryRaw<
      Array<{ count: number }>
    >`SELECT count(*)::int AS count FROM _prisma_migrations`;
    expect(output).toContain('No pending migrations');
    expect(after).toEqual(before);
  });

  it('has no Prisma schema drift after deploy', async () => {
    await expect(
      postgres.prisma([
        'migrate',
        'diff',
        '--from-config-datasource',
        '--to-schema',
        'prisma/schema',
        '--exit-code',
      ]),
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

  it('creates no IAM reference data and no Audit records', async () => {
    const [row] = await iamPersistenceOf(database).$queryRaw<
      Array<{
        users: number;
        departments: number;
        roles: number;
        permissions: number;
        memberships: number;
        assignments: number;
        grants: number;
        auditRecords: number;
      }>
    >`SELECT
      (SELECT count(*)::int FROM iam_application_user) AS users,
      (SELECT count(*)::int FROM iam_department) AS departments,
      (SELECT count(*)::int FROM iam_role) AS roles,
      (SELECT count(*)::int FROM iam_permission) AS permissions,
      (SELECT count(*)::int FROM iam_department_membership) AS memberships,
      (SELECT count(*)::int FROM iam_user_role_assignment) AS assignments,
      (SELECT count(*)::int FROM iam_role_permission) AS grants,
      (SELECT count(*)::int FROM audit_record) AS "auditRecords"`;
    expect(row).toEqual({
      users: 0,
      departments: 0,
      roles: 0,
      permissions: 0,
      memberships: 0,
      assignments: 0,
      grants: 0,
      auditRecords: 0,
    });
  });
});
