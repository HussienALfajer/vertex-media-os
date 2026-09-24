import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import type { AuditRecorder } from '@vertex-os/audit';
import { createAuditRecorder } from '@vertex-os/audit-persistence';
import {
  createDatabaseClient,
  type DatabaseClient,
  type DatabaseTransaction,
} from '@vertex-os/database';
import { createApplicationUserRepository } from '@vertex-os/iam-persistence';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startMigratedPostgres, type MigratedPostgres } from '../../test-support/postgres.js';
import { testAuthConfig } from '../../test-support/auth-config.js';
import { createApp } from '../app.factory.js';
import { loadAppConfig, type AppConfig } from '../config/app-config.js';
import {
  EXIT_FAILED,
  EXIT_REFUSED,
  EXIT_SYNCHRONIZED,
  createCommandLogger,
  runIamReferenceSync,
} from './iam-sync-reference.command.js';
import { testProvisioningConfig } from '../../test-support/provisioning-config.js';

const runFile = promisify(execFile);
const apiRoot = fileURLToPath(new URL('../../', import.meta.url));
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

type LogRecord = Record<string, unknown>;

function capture(): { lines: string[]; destination: { write(line: string): void } } {
  const lines: string[] = [];
  return { lines, destination: { write: (line: string) => void lines.push(line) } };
}

describe('pnpm iam:sync-reference against real PostgreSQL', () => {
  let postgres: MigratedPostgres;
  let config: AppConfig;

  beforeAll(async () => {
    postgres = await startMigratedPostgres();
    config = loadAppConfig({ NODE_ENV: 'test', LOG_LEVEL: 'info', DATABASE_URL: postgres.url });
  }, 180_000);
  afterAll(async () => {
    await postgres?.stop();
  });
  beforeEach(async () => {
    await postgres.sql(
      'TRUNCATE iam_application_user, iam_department, iam_role, iam_permission, audit_record CASCADE',
    );
  });

  async function count(table: string): Promise<number> {
    return Number(await postgres.sql(`SELECT count(*) FROM ${table}`));
  }

  /** Every IAM reference row and every Audit row as exact JSON text. */
  async function snapshot(): Promise<string> {
    return postgres.sql(`SELECT concat_ws(E'\\n',
      (SELECT string_agg(row_to_json(p)::text, E'\\n' ORDER BY code COLLATE "C") FROM iam_permission p),
      (SELECT string_agg(row_to_json(r)::text, E'\\n' ORDER BY code COLLATE "C") FROM iam_role r),
      (SELECT string_agg(row_to_json(m)::text, E'\\n' ORDER BY permission_code COLLATE "C") FROM iam_role_permission m),
      (SELECT string_agg(row_to_json(a)::text, E'\\n' ORDER BY id) FROM audit_record a))`);
  }

  async function run(
    options: {
      auditRecorderFor?: (handle: DatabaseClient | DatabaseTransaction) => AuditRecorder;
    } = {},
  ) {
    const log = capture();
    const exitCode = await runIamReferenceSync(config, {
      ...options,
      logDestination: log.destination,
    });
    const records = log.lines.map((line) => JSON.parse(line) as LogRecord);
    return { exitCode, records, output: log.lines.join('') };
  }

  function expectNoConnectionDetails(output: string): void {
    const url = new URL(postgres.url);
    for (const secret of [
      'sentinel',
      `${url.hostname}:${url.port}`,
      'postgres://',
      'postgresql://',
    ]) {
      expect(output).not.toContain(secret);
    }
  }

  it('first run: exits 0, logs one result line and writes 12 permissions, 1 role, 12 mappings and 14 Audit records', async () => {
    const { exitCode, records, output } = await run();
    expect(exitCode).toBe(EXIT_SYNCHRONIZED);
    expect(records).toHaveLength(1);
    const [line] = records;
    expect(line).toMatchObject({
      level: 30,
      command: 'iam:sync-reference',
      msg: 'iam reference data synchronized',
      outcome: 'synchronized',
      counts: {
        permissionsRegistered: 12,
        permissionsUpdated: 0,
        permissionsGranted: 12,
        permissionsRevoked: 0,
      },
      changes: { systemRole: 'created' },
    });
    const traceId = String(line?.['traceId']);
    expect(traceId).toMatch(UUID);
    expectNoConnectionDetails(output);

    expect(await count('iam_permission')).toBe(12);
    expect(
      await postgres.sql(
        "SELECT count(*) FROM iam_role WHERE is_system AND code = 'system-administrator' AND version = 1",
      ),
    ).toBe('1');
    expect(await count('iam_role')).toBe(1);
    expect(await count('iam_role_permission')).toBe(12);
    expect(await count('audit_record')).toBe(14);
    expect(
      await postgres.sql(`SELECT count(*) FROM audit_record WHERE trace_id = '${traceId}'
        AND source_module = 'iam' AND actor_type = 'SYSTEM' AND actor_process = 'iam.reference-sync'
        AND actor_user_id IS NULL AND result = 'SUCCEEDED'`),
    ).toBe('14');
    expect(
      await postgres.sql(
        'SELECT action || \'=\' || count(*) FROM audit_record GROUP BY action ORDER BY action COLLATE "C"',
      ),
    ).toBe(
      ['iam.permission.registered=12', 'iam.role.created=1', 'iam.role.permissions-granted=1'].join(
        '\n',
      ),
    );
  });

  it('second run: exits 0 with no change, the same rows and still 14 Audit records', async () => {
    expect((await run()).exitCode).toBe(EXIT_SYNCHRONIZED);
    const before = await snapshot();
    const { exitCode, records } = await run();
    expect(exitCode).toBe(EXIT_SYNCHRONIZED);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      outcome: 'synchronized',
      counts: {
        permissionsRegistered: 0,
        permissionsUpdated: 0,
        permissionsGranted: 0,
        permissionsRevoked: 0,
      },
      changes: { systemRole: 'unchanged' },
    });
    expect(await snapshot()).toBe(before);
    expect(await count('audit_record')).toBe(14);
  });

  it('rolls back every IAM change and every real Audit record when the last append fails', async () => {
    const { exitCode, records, output } = await run({
      auditRecorderFor: (handle) => {
        const real = createAuditRecorder(handle);
        let appended = 0;
        return {
          async append(entry) {
            await real.append(entry);
            appended += 1;
            if (appended === 14) throw new Error('injected failure after the last real append');
          },
        };
      },
    });
    expect(exitCode).toBe(EXIT_FAILED);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      level: 50,
      msg: 'iam reference data synchronization failed',
      err: { type: 'Error', message: 'injected failure after the last real append' },
    });
    expect(String(records[0]?.['traceId'])).toMatch(UUID);
    expectNoConnectionDetails(output);
    for (const table of ['iam_permission', 'iam_role', 'iam_role_permission', 'audit_record']) {
      expect(await count(table)).toBe(0);
    }
  });

  it('refuses with exit 2 when the database holds an undeclared permission, changing and recording nothing', async () => {
    expect((await run()).exitCode).toBe(EXIT_SYNCHRONIZED);
    await postgres.sql(`INSERT INTO iam_permission (code, owning_module, name, description, state, sensitivity)
      VALUES ('iam.z.read', 'iam', 'Injected', 'Inserted by SQL.', 'ACTIVE', 'PRIVILEGED')`);
    const before = await snapshot();
    const { exitCode, records } = await run();
    expect(exitCode).toBe(EXIT_REFUSED);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      level: 40,
      msg: 'iam reference data synchronization refused',
      outcome: 'refused',
      reason: 'undeclared-permissions',
      details: ['iam.z.read'],
    });
    expect(await snapshot()).toBe(before);
    expect(await count('audit_record')).toBe(14);
  });

  it('keeps row data and raw input out of both loggers for a real database error (A1-02)', async () => {
    const sentinel = 'sentinel-not-a-uuid-7c1e';
    const database = createDatabaseClient({ connectionString: postgres.url });
    let error: unknown;
    try {
      const repository = createApplicationUserRepository(database);
      error = await repository
        .findById(sentinel as Parameters<typeof repository.findById>[0])
        .catch((failure: unknown) => failure);
    } finally {
      await database.disconnect();
    }
    // The raw error does carry the input; this is what must never reach a log.
    expect(`${String(error)}${JSON.stringify(error)}`).toContain(sentinel);

    const commandLog = capture();
    createCommandLogger(config, commandLog.destination).error({ err: error }, 'probe');
    const apiLog = capture();
    const app = await createApp(config, testAuthConfig(), testProvisioningConfig(), {
      logStream: apiLog.destination,
    });
    try {
      app.getHttpAdapter().getInstance().log.error({ err: error }, 'probe');
    } finally {
      await app.close();
    }
    for (const lines of [commandLog.lines, apiLog.lines]) {
      expect(lines.join('')).not.toContain(sentinel);
      expectNoConnectionDetails(lines.join(''));
      const probe = lines
        .map((line) => JSON.parse(line) as LogRecord)
        .filter((record) => record['msg'] === 'probe');
      expect(probe).toEqual([
        expect.objectContaining({
          err: expect.objectContaining({
            type: 'PrismaClientKnownRequestError',
            database: expect.objectContaining({
              prismaCode: 'P2007',
              sqlState: '22P02',
              driverKind: 'InvalidInputValue',
            }),
          }),
        }),
      ]);
    }
  });

  describe('the built command entry', () => {
    const entry = ['--enable-source-maps', 'dist/commands/iam-sync-reference.js'];
    const baseEnvironment = {
      PATH: process.env['PATH'] ?? '',
      SystemRoot: process.env['SystemRoot'] ?? '',
    };

    async function command(environment: Record<string, string>) {
      try {
        const { stdout, stderr } = await runFile(process.execPath, entry, {
          cwd: apiRoot,
          env: { ...baseEnvironment, ...environment },
          timeout: 60_000,
        });
        return { exitCode: 0, stdout, stderr };
      } catch (failure) {
        const result = failure as { code?: number; stdout?: string; stderr?: string };
        return {
          exitCode: result.code ?? -1,
          stdout: result.stdout ?? '',
          stderr: result.stderr ?? '',
        };
      }
    }

    it('synchronizes as a process: exit 0 and one JSON result line without connection details', async () => {
      const result = await command({ DATABASE_URL: postgres.url, LOG_LEVEL: 'info' });
      expect(result.exitCode).toBe(0);
      const lines = result.stdout.trim().split('\n');
      expect(lines).toHaveLength(1);
      expect(JSON.parse(lines[0] ?? '{}')).toMatchObject({
        msg: 'iam reference data synchronized',
      });
      expect(result.stderr).toBe('');
      expectNoConnectionDetails(result.stdout + result.stderr);
      expect(await count('audit_record')).toBe(14);
    });

    it('exits 1 on missing or invalid configuration, naming the variable but never its value', async () => {
      const missing = await command({});
      expect(missing.exitCode).toBe(1);
      expect(missing.stderr).toContain('DATABASE_URL');
      expect(missing.stdout).toBe('');

      const invalid = await command({ DATABASE_URL: 'mysql://sentinel-user:sentinel-secret@db/x' });
      expect(invalid.exitCode).toBe(1);
      expect(invalid.stderr).toContain('DATABASE_URL');
      expect(invalid.stderr).not.toContain('sentinel');
      expect(await count('iam_permission')).toBe(0);
    });
  });
});
