import { cp, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { startPostgres, type TestPostgres } from '../test-support/postgres.js';
import { iamPersistenceOf, type IamPersistenceClient } from './iam.js';
import { createDatabaseClient } from './index.js';

const IAM_01 = '20260923013708_iam_persistence_foundation';
const AUDIT = '20260923035742_audit_foundation';
const IAM_SYSTEM_ROLE_CODE = '20260923041312_iam_system_role_code';
const migrationsRoot = fileURLToPath(new URL('../prisma/migrations/', import.meta.url));
const schemaRoot = fileURLToPath(new URL('../prisma/schema', import.meta.url));

/**
 * Upgrade-path evidence for the tightened IAM constraint (IAM-02 D-07; TESTING Section 14): a
 * database migrated to IAM-01 only, with representative synthetic rows, is upgraded by the real
 * `prisma migrate deploy`. A temporary Prisma configuration in the OS temporary directory points at
 * a copy of the IAM-01 migration alone; no SQL file is ever executed by the test itself.
 */
describe('upgrading an IAM-01 database with the IAM-02 migrations', () => {
  async function withIam01Database(
    work: (postgres: TestPostgres, client: IamPersistenceClient) => Promise<void>,
  ): Promise<void> {
    const scratch = await mkdtemp(join(tmpdir(), 'vertex-iam02-upgrade-'));
    const postgres = await startPostgres();
    const database = createDatabaseClient({ connectionString: postgres.url });
    try {
      await cp(join(migrationsRoot, IAM_01), join(scratch, 'migrations', IAM_01), {
        recursive: true,
      });
      await cp(
        join(migrationsRoot, 'migration_lock.toml'),
        join(scratch, 'migrations', 'migration_lock.toml'),
      );
      const config = join(scratch, 'prisma.config.mjs');
      await writeFile(
        config,
        [
          'export default {',
          `  schema: ${JSON.stringify(schemaRoot)},`,
          `  migrations: { path: ${JSON.stringify(join(scratch, 'migrations'))} },`,
          '  // The URL stays in the environment the harness passes; it is never written to disk.',
          '  datasource: { url: process.env.DATABASE_URL },',
          '};',
          '',
        ].join('\n'),
        'utf8',
      );
      await postgres.prisma(['migrate', 'deploy', '--config', config]);
      await work(postgres, iamPersistenceOf(database));
    } finally {
      await database.disconnect();
      await postgres.stop();
      await rm(scratch, { recursive: true, force: true });
    }
  }

  async function history(client: IamPersistenceClient) {
    return client.$queryRaw<
      Array<{ name: string; finished: boolean; rolledBack: boolean }>
    >`SELECT migration_name AS name, finished_at IS NOT NULL AS finished,
        rolled_back_at IS NOT NULL AS "rolledBack"
      FROM _prisma_migrations ORDER BY started_at, migration_name COLLATE "C"`;
  }

  async function hasSystemCodeCheck(client: IamPersistenceClient): Promise<boolean> {
    const [row] = await client.$queryRaw<Array<{ present: boolean }>>`
      SELECT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'iam_role_system_code_ck') AS present`;
    return row?.present ?? false;
  }

  async function roles(client: IamPersistenceClient) {
    return client.$queryRaw<Array<{ code: string; isSystem: boolean; version: number }>>`
      SELECT code, is_system AS "isSystem", version FROM iam_role ORDER BY code COLLATE "C"`;
  }

  it('keeps valid rows and adds the constraint when the data satisfies it', async () => {
    await withIam01Database(async (postgres, client) => {
      expect(await history(client)).toEqual([{ name: IAM_01, finished: true, rolledBack: false }]);
      expect(await hasSystemCodeCheck(client)).toBe(false);
      await client.$executeRaw`INSERT INTO iam_role (code, name, state, is_system)
        VALUES ('content-editors', 'Content Editors', 'ACTIVE', false),
               ('system-administrator', 'System Administrator', 'ACTIVE', true)`;
      await client.$executeRaw`INSERT INTO iam_permission
        (code, owning_module, name, description, state, sensitivity)
        VALUES ('iam.users.read', 'iam', 'Read users', 'Synthetic.', 'ACTIVE', 'SENSITIVE')`;
      await client.$executeRaw`INSERT INTO iam_role_permission (role_id, permission_code)
        SELECT id, 'iam.users.read' FROM iam_role WHERE code = 'system-administrator'`;
      const before = await roles(client);

      await postgres.prisma(['migrate', 'deploy']);

      expect(await history(client)).toEqual([
        { name: IAM_01, finished: true, rolledBack: false },
        { name: AUDIT, finished: true, rolledBack: false },
        { name: IAM_SYSTEM_ROLE_CODE, finished: true, rolledBack: false },
      ]);
      expect(await hasSystemCodeCheck(client)).toBe(true);
      expect(await roles(client)).toEqual(before);
      const [mapping] = await client.$queryRaw<Array<{ count: number }>>`
        SELECT count(*)::int AS count FROM iam_role_permission`;
      expect(mapping?.count).toBe(1);
    });
  }, 180_000);

  it('fails the IAM migration atomically, and leaves the data intact, for a custom role holding the reserved code', async () => {
    await withIam01Database(async (postgres, client) => {
      await client.$executeRaw`INSERT INTO iam_role (code, name, state, is_system)
        VALUES ('system-administrator', 'Impostor', 'ACTIVE', false)`;

      const failed = await postgres.prismaRun(['migrate', 'deploy']);
      expect(failed.exitCode).not.toBe(0);
      // With the atomic wrapper, Prisma 7.10 reports the secondary error for the failed migration
      // (IAM-01 D-09's accepted cost); the root cause is found as IAM-01 Section 16.5 describes.
      expect(failed.output).toContain('current transaction is aborted');
      expect(failed.output).toContain(`migration_name="${IAM_SYSTEM_ROLE_CODE}"`);

      expect(await hasSystemCodeCheck(client)).toBe(false);
      expect(await roles(client)).toEqual([
        { code: 'system-administrator', isSystem: false, version: 1 },
      ]);
      expect(await history(client)).toEqual([
        { name: IAM_01, finished: true, rolledBack: false },
        { name: AUDIT, finished: true, rolledBack: false },
        { name: IAM_SYSTEM_ROLE_CODE, finished: false, rolledBack: false },
      ]);
      const [audit] = await client.$queryRaw<Array<{ present: boolean }>>`
        SELECT to_regclass('audit_record') IS NOT NULL AS present`;
      expect(audit?.present).toBe(true);

      const redeploy = await postgres.prismaRun(['migrate', 'deploy']);
      expect(redeploy.exitCode).not.toBe(0);
      expect(redeploy.output).toContain('P3009');
    });
  }, 180_000);
});
