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
const AUTH_SESSIONS = '20260923190000_auth_sessions';
const AUTH_REFRESH_TOKEN = '20260923210000_auth_session_refresh_token';
const AUTH_SESSION_LIFECYCLE = '20260924020000_auth_session_lifecycle';
const AUTH_SESSION_HOUSEKEEPING = '20260924200000_auth_session_housekeeping';
const LOCAL_PASSWORD_CREDENTIALS = '20260925060000_local_password_credentials';
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
    baseline: readonly string[] = [IAM_01],
  ): Promise<void> {
    const scratch = await mkdtemp(join(tmpdir(), 'vertex-iam02-upgrade-'));
    const postgres = await startPostgres();
    const database = createDatabaseClient({ connectionString: postgres.url });
    try {
      for (const migration of baseline) {
        await cp(join(migrationsRoot, migration), join(scratch, 'migrations', migration), {
          recursive: true,
        });
      }
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
        { name: AUTH_SESSIONS, finished: true, rolledBack: false },
        { name: AUTH_REFRESH_TOKEN, finished: true, rolledBack: false },
        { name: AUTH_SESSION_LIFECYCLE, finished: true, rolledBack: false },
        { name: AUTH_SESSION_HOUSEKEEPING, finished: true, rolledBack: false },
        { name: LOCAL_PASSWORD_CREDENTIALS, finished: true, rolledBack: false },
      ]);
      expect(await hasSystemCodeCheck(client)).toBe(true);
      expect(await roles(client)).toEqual(before);
      const [mapping] = await client.$queryRaw<Array<{ count: number }>>`
        SELECT count(*)::int AS count FROM iam_role_permission`;
      expect(mapping?.count).toBe(1);
    });
  }, 180_000);

  it('preserves existing users and legacy identity values while requiring a local password', async () => {
    await withIam01Database(async (postgres, client) => {
      await client.$executeRaw`INSERT INTO iam_application_user
        (email, display_name, access_state, identity_issuer, identity_subject,
         identity_sync_state, invitation_delivery_state)
        VALUES ('legacy@example.invalid', 'Legacy User', 'INVITED',
                'https://identity.example.invalid/realm', 'previous-subject', 'SYNCED', 'NOT_SENT')`;
      await client.$executeRaw`INSERT INTO iam_role (code, name, state, is_system)
        VALUES ('system-administrator', 'System Administrator', 'ACTIVE', true)`;
      await client.$executeRaw`INSERT INTO iam_application_user
        (email, display_name, access_state, identity_issuer, identity_subject,
         identity_sync_state, invitation_delivery_state, invitation_sent_at, first_activated_at)
        VALUES ('legacy-admin@example.invalid', 'Legacy Administrator', 'ACTIVE',
                'https://identity.example.invalid/realm', 'previous-admin-subject',
                'SYNCED', 'SENT', now(), now())`;
      await client.$executeRaw`INSERT INTO iam_user_role_assignment (user_id, role_id)
        SELECT u.id, r.id FROM iam_application_user u CROSS JOIN iam_role r
        WHERE u.email = 'legacy-admin@example.invalid' AND r.code = 'system-administrator'`;
      await postgres.prisma(['migrate', 'deploy']);
      const rows = await client.$queryRaw<
        Array<{
          email: string;
          identityIssuer: string;
          identitySubject: string;
          passwordHash: string | null;
          previousIssuer: string;
          previousSubject: string;
        }>
      >`SELECT u.email, u.identity_issuer AS "identityIssuer",
          u.identity_subject AS "identitySubject", u.password_hash AS "passwordHash",
          m.identity_issuer AS "previousIssuer", m.identity_subject AS "previousSubject"
        FROM iam_application_user u
        JOIN iam_legacy_identity_mapping m ON m.user_id = u.id
        WHERE u.email = 'legacy@example.invalid'`;
      expect(rows).toEqual([
        {
          email: 'legacy@example.invalid',
          identityIssuer: 'vertex-local',
          identitySubject: expect.any(String),
          passwordHash: null,
          previousIssuer: 'https://identity.example.invalid/realm',
          previousSubject: 'previous-subject',
        },
      ]);
      const [administrator] = await client.$queryRaw<
        Array<{ state: string; passwordHash: string | null; previousSubject: string; role: string }>
      >`SELECT u.access_state AS state, u.password_hash AS "passwordHash",
          m.identity_subject AS "previousSubject", r.code AS role
        FROM iam_application_user u
        JOIN iam_legacy_identity_mapping m ON m.user_id = u.id
        JOIN iam_user_role_assignment a ON a.user_id = u.id
        JOIN iam_role r ON r.id = a.role_id
        WHERE u.email = 'legacy-admin@example.invalid'`;
      expect(administrator).toEqual({
        state: 'ACTIVE',
        passwordHash: null,
        previousSubject: 'previous-admin-subject',
        role: 'system-administrator',
      });
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
      expect(failed.output).toContain(`Applying migration \`${IAM_SYSTEM_ROLE_CODE}\``);

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

  it('keeps live and revoked IAM-R03 sessions through refresh-token storage and the lifecycle checks (IAM-R03F D-06, IAM-R06 D-19)', async () => {
    await withIam01Database(
      async (postgres, client) => {
        const hash = (label: string) => label.repeat(43).slice(0, 43);
        await client.$executeRaw`INSERT INTO auth_session (token_hash, csrf_token_hash, user_id,
            created_at, last_seen_at, idle_expires_at, absolute_expires_at,
            id_token_ciphertext, id_token_key_version)
          VALUES (${hash('a')}, ${hash('b')}, gen_random_uuid(), now(), now(),
            now() + interval '30 minutes', now() + interval '10 hours', 'sealed', 1)`;
        await client.$executeRaw`INSERT INTO auth_session (token_hash, csrf_token_hash, user_id,
            created_at, last_seen_at, idle_expires_at, absolute_expires_at, revoked_at,
            revocation_reason)
          VALUES (${hash('c')}, ${hash('d')}, gen_random_uuid(), now(), now(),
            now() + interval '30 minutes', now() + interval '10 hours', now(), 'LOGOUT')`;

        await postgres.prisma(['migrate', 'deploy']);

        expect((await history(client)).slice(-4)).toEqual([
          { name: AUTH_REFRESH_TOKEN, finished: true, rolledBack: false },
          { name: AUTH_SESSION_LIFECYCLE, finished: true, rolledBack: false },
          { name: AUTH_SESSION_HOUSEKEEPING, finished: true, rolledBack: false },
          { name: LOCAL_PASSWORD_CREDENTIALS, finished: true, rolledBack: false },
        ]);
        // The housekeeping index is built over the existing rows (IAM-R09 D-06).
        const [index] = await client.$queryRaw<Array<{ count: number }>>`
          SELECT count(*)::int AS count FROM pg_indexes
          WHERE tablename = 'auth_session' AND indexname = 'auth_session_idle_expires_at_idx'`;
        expect(index?.count).toBe(1);
        const rows = await client.$queryRaw<
          Array<{ refresh: boolean; idToken: boolean; revoked: boolean }>
        >`SELECT refresh_token_ciphertext IS NULL AND refresh_token_key_version IS NULL AS refresh,
            id_token_ciphertext IS NOT NULL AS "idToken", revoked_at IS NOT NULL AS revoked
          FROM auth_session ORDER BY token_hash COLLATE "C"`;
        expect(rows).toEqual([
          { refresh: true, idToken: true, revoked: false },
          { refresh: true, idToken: false, revoked: true },
        ]);
        const [reasons] = await client.$queryRaw<Array<{ values: string[] }>>`
          SELECT enum_range(NULL::auth_session_revocation_reason)::text[] AS values`;
        expect(reasons?.values).toEqual(
          expect.arrayContaining([
            'PROVIDER_SESSION_ENDED',
            'USER_SUSPENDED',
            'ADMINISTRATOR_REVOKED',
          ]),
        );
      },
      [IAM_01, AUDIT, IAM_SYSTEM_ROLE_CODE, AUTH_SESSIONS],
    );
  }, 180_000);
});
