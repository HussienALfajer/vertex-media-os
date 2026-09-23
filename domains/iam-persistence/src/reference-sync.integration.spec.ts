import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseTraceId, type AuditEntry, type AuditRecorder } from '@vertex-os/audit';
import {
  iamPermissionManifest,
  type PermissionDefinition,
  type PermissionManifest,
  type ReferenceSyncResult,
} from '@vertex-os/iam';
import { synchronizeIamReferenceData } from '@vertex-os/iam/composition';
import { createIamTransactionRunner } from './index.js';
import { startMigratedPostgres, type MigratedPostgres } from '../test-support/postgres.js';

const parsedTraceId = parseTraceId('trace-reference-sync');
if (!parsedTraceId.ok) throw new Error('trace id fixture');
const TRACE_ID = parsedTraceId.value;

const NO_CHANGES = {
  permissionsRegistered: [],
  permissionsUpdated: [],
  systemRole: 'unchanged',
  permissionsGranted: [],
  permissionsRevoked: [],
};

class RecordingRecorder implements AuditRecorder {
  readonly entries: AuditEntry[] = [];
  constructor(private readonly failOnAppend?: number) {}
  async append(entry: AuditEntry): Promise<void> {
    if (this.failOnAppend === this.entries.length + 1) throw new Error('audit append failed');
    this.entries.push(entry);
  }
}

function definition(
  code: string,
  overrides: Partial<PermissionDefinition> = {},
): PermissionDefinition {
  return {
    code,
    name: `Name of ${code}`,
    description: `Description of ${code}.`,
    state: 'ACTIVE',
    sensitivity: 'STANDARD',
    ...overrides,
  };
}

const manifest = (...permissions: PermissionDefinition[]): PermissionManifest => ({
  module: 'iam',
  permissions,
});

describe('IAM reference synchronization against real PostgreSQL', () => {
  let postgres: MigratedPostgres;

  beforeAll(async () => {
    postgres = await startMigratedPostgres();
  }, 180_000);
  afterAll(async () => {
    await postgres?.stop();
  });
  beforeEach(async () => {
    await postgres.client
      .$executeRaw`TRUNCATE iam_application_user, iam_department, iam_role, iam_permission CASCADE`;
  });

  async function sync(
    manifests: readonly PermissionManifest[],
    recorder: AuditRecorder = new RecordingRecorder(),
  ): Promise<ReferenceSyncResult> {
    const runner = createIamTransactionRunner(postgres.database, {
      auditRecorderFor: () => recorder,
    });
    return synchronizeIamReferenceData({ runner }, { manifests, traceId: TRACE_ID });
  }

  /** Every column of every reference row, as exact JSON text (timestamps included). */
  async function state(): Promise<{ permissions: string[]; roles: string[]; mappings: string[] }> {
    const rows = (query: Promise<Array<{ row: string }>>) =>
      query.then((result) => result.map((entry) => entry.row));
    return {
      permissions: await rows(postgres.client.$queryRaw`
        SELECT row_to_json(p)::text AS row FROM iam_permission p ORDER BY code COLLATE "C"`),
      roles: await rows(postgres.client.$queryRaw`
        SELECT row_to_json(r)::text AS row FROM iam_role r ORDER BY code COLLATE "C"`),
      mappings: await rows(postgres.client.$queryRaw`
        SELECT row_to_json(m)::text AS row FROM iam_role_permission m
        ORDER BY role_id, permission_code COLLATE "C"`),
    };
  }

  async function systemRole() {
    return postgres.client.iamRole.findUniqueOrThrow({
      where: { code: 'system-administrator' },
      select: {
        id: true,
        name: true,
        description: true,
        state: true,
        isSystem: true,
        version: true,
        permissions: { select: { permissionCode: true }, orderBy: { permissionCode: 'asc' } },
      },
    });
  }

  async function permissionStates(): Promise<Record<string, string>> {
    const rows = await postgres.client.iamPermission.findMany({
      select: { code: true, state: true },
      orderBy: { code: 'asc' },
    });
    return Object.fromEntries(rows.map((row) => [row.code, row.state]));
  }

  it('first run: registers the catalog, creates the system role and grants every ACTIVE permission, with 14 entries', async () => {
    const recorder = new RecordingRecorder();
    const result = await sync([iamPermissionManifest], recorder);
    const codes = iamPermissionManifest.permissions.map((p) => p.code).sort();
    expect(result).toEqual({
      outcome: 'synchronized',
      changes: {
        permissionsRegistered: codes,
        permissionsUpdated: [],
        systemRole: 'created',
        permissionsGranted: codes,
        permissionsRevoked: [],
      },
    });

    const permissions = await postgres.client.iamPermission.findMany({
      select: {
        code: true,
        owningModule: true,
        name: true,
        description: true,
        state: true,
        sensitivity: true,
      },
      orderBy: { code: 'asc' },
    });
    expect(permissions).toEqual(
      [...iamPermissionManifest.permissions]
        .sort((left, right) => (left.code < right.code ? -1 : 1))
        .map((p) => ({ ...p, owningModule: 'iam' })),
    );
    const role = await systemRole();
    expect(role).toMatchObject({
      name: 'System Administrator',
      description: 'Protected system role that holds every active permission.',
      state: 'ACTIVE',
      isSystem: true,
      version: 1,
    });
    expect(role.permissions.map((mapping) => mapping.permissionCode)).toEqual(codes);
    expect(await postgres.client.iamRole.count()).toBe(1);

    expect(recorder.entries).toHaveLength(14);
    expect(
      recorder.entries.map((entry) => [entry.action, entry.target.type, entry.target.id]),
    ).toEqual([
      ...codes.map((code) => ['iam.permission.registered', 'iam.permission', code]),
      ['iam.role.created', 'iam.role', role.id],
      ['iam.role.permissions-granted', 'iam.role', role.id],
    ]);
    for (const entry of recorder.entries) {
      expect(entry).toMatchObject({
        sourceModule: 'iam',
        actor: { type: 'SYSTEM', process: 'iam.reference-sync' },
        result: 'SUCCEEDED',
        traceId: 'trace-reference-sync',
      });
    }
    expect(recorder.entries[13]?.change).toEqual({ after: { permissionCodes: codes } });
  });

  it('a second run changes nothing: identical rows, timestamps and version, and no Audit entry', async () => {
    await sync([iamPermissionManifest]);
    const before = await state();
    const recorder = new RecordingRecorder();
    expect(await sync([iamPermissionManifest], recorder)).toEqual({
      outcome: 'synchronized',
      changes: NO_CHANGES,
    });
    expect(await state()).toEqual(before);
    expect(recorder.entries).toEqual([]);
  });

  it('evolves the catalog run by run, keeping the role on exactly the ACTIVE set and bumping its version once per changing run', async () => {
    const expectRole = async (version: number, codes: string[]) => {
      const role = await systemRole();
      expect(role.version).toBe(version);
      expect(role.permissions.map((mapping) => mapping.permissionCode)).toEqual(codes);
    };
    const a = definition('iam.a.read');
    const b = definition('iam.b.read');
    const c = definition('iam.c.read');
    const d = definition('iam.d.read');

    await sync([manifest(a, b, c)]);
    await expectRole(1, ['iam.a.read', 'iam.b.read', 'iam.c.read']);

    // Add a code: register and grant.
    expect(await sync([manifest(a, b, c, d)])).toMatchObject({
      changes: { permissionsRegistered: ['iam.d.read'], permissionsGranted: ['iam.d.read'] },
    });
    await expectRole(2, ['iam.a.read', 'iam.b.read', 'iam.c.read', 'iam.d.read']);

    // ACTIVE → DEPRECATED: update and revoke.
    const bDeprecated = { ...b, state: 'DEPRECATED' as const };
    expect(await sync([manifest(a, bDeprecated, c, d)])).toMatchObject({
      changes: { permissionsUpdated: ['iam.b.read'], permissionsRevoked: ['iam.b.read'] },
    });
    await expectRole(3, ['iam.a.read', 'iam.c.read', 'iam.d.read']);

    // DEPRECATED → ACTIVE: update and grant.
    expect(await sync([manifest(a, b, c, d)])).toMatchObject({
      changes: { permissionsUpdated: ['iam.b.read'], permissionsGranted: ['iam.b.read'] },
    });
    await expectRole(4, ['iam.a.read', 'iam.b.read', 'iam.c.read', 'iam.d.read']);

    // ACTIVE → RETIRED: update and revoke.
    const cRetired = { ...c, state: 'RETIRED' as const };
    await sync([manifest(a, b, cRetired, d)]);
    await expectRole(5, ['iam.a.read', 'iam.b.read', 'iam.d.read']);

    // A code declared RETIRED is registered to reserve it and never granted; no version change.
    const eRetired = definition('iam.e.read', { state: 'RETIRED' });
    expect(await sync([manifest(a, b, cRetired, d, eRetired)])).toMatchObject({
      changes: {
        permissionsRegistered: ['iam.e.read'],
        permissionsGranted: [],
        systemRole: 'unchanged',
      },
    });
    await expectRole(5, ['iam.a.read', 'iam.b.read', 'iam.d.read']);

    // Metadata only: update the row, touch nothing else.
    const beforeMetadata = await state();
    const aRenamed = {
      ...a,
      name: 'Renamed',
      description: 'New description.',
      sensitivity: 'PRIVILEGED' as const,
    };
    expect(await sync([manifest(aRenamed, b, cRetired, d, eRetired)])).toEqual({
      outcome: 'synchronized',
      changes: { ...NO_CHANGES, permissionsUpdated: ['iam.a.read'] },
    });
    const afterMetadata = await state();
    expect(afterMetadata.roles).toEqual(beforeMetadata.roles);
    expect(afterMetadata.mappings).toEqual(beforeMetadata.mappings);
    expect(afterMetadata.permissions.slice(1)).toEqual(beforeMetadata.permissions.slice(1));
    expect(
      await postgres.client.iamPermission.findUniqueOrThrow({ where: { code: 'iam.a.read' } }),
    ).toMatchObject({
      name: 'Renamed',
      description: 'New description.',
      sensitivity: 'PRIVILEGED',
    });
    await expectRole(5, ['iam.a.read', 'iam.b.read', 'iam.d.read']);

    // Drift in the role's name and description is repaired and bumps the version.
    await postgres.client
      .$executeRaw`UPDATE iam_role SET name = 'Admins', description = NULL WHERE is_system`;
    expect(await sync([manifest(aRenamed, b, cRetired, d, eRetired)])).toMatchObject({
      changes: { systemRole: 'updated' },
    });
    expect(await systemRole()).toMatchObject({
      name: 'System Administrator',
      description: 'Protected system role that holds every active permission.',
      version: 6,
    });

    // An extra mapping to a DEPRECATED code is revoked and bumps the version.
    await sync([manifest(aRenamed, bDeprecated, cRetired, d, eRetired)]);
    await expectRole(7, ['iam.a.read', 'iam.d.read']);
    await postgres.client.$executeRaw`INSERT INTO iam_role_permission (role_id, permission_code)
      SELECT id, 'iam.b.read' FROM iam_role WHERE is_system`;
    expect(await sync([manifest(aRenamed, bDeprecated, cRetired, d, eRetired)])).toMatchObject({
      changes: { permissionsRevoked: ['iam.b.read'], systemRole: 'updated' },
    });
    await expectRole(8, ['iam.a.read', 'iam.d.read']);
    expect(await permissionStates()).toEqual({
      'iam.a.read': 'ACTIVE',
      'iam.b.read': 'DEPRECATED',
      'iam.c.read': 'RETIRED',
      'iam.d.read': 'ACTIVE',
      'iam.e.read': 'RETIRED',
    });
  });

  it('refuses an undeclared persisted permission and a RETIRED reactivation without changing anything', async () => {
    const a = definition('iam.a.read');
    const bRetired = definition('iam.b.read', { state: 'RETIRED' });
    await sync([manifest(a, bRetired)]);

    await postgres.client.$executeRaw`INSERT INTO iam_permission
      (code, owning_module, name, description, state, sensitivity)
      VALUES ('iam.z.read', 'iam', 'Injected', 'Inserted by SQL.', 'ACTIVE', 'PRIVILEGED')`;
    const before = await state();
    const recorder = new RecordingRecorder();
    expect(await sync([manifest(a, bRetired)], recorder)).toEqual({
      outcome: 'refused',
      reason: 'undeclared-permissions',
      details: ['iam.z.read'],
    });
    expect(await state()).toEqual(before);
    expect(recorder.entries).toEqual([]);

    await postgres.client.$executeRaw`DELETE FROM iam_permission WHERE code = 'iam.z.read'`;
    const beforeReactivation = await state();
    expect(await sync([manifest(a, { ...bRetired, state: 'ACTIVE' })], recorder)).toEqual({
      outcome: 'refused',
      reason: 'retired-permission-reactivated',
      details: ['iam.b.read'],
    });
    expect(await state()).toEqual(beforeReactivation);
    expect(recorder.entries).toEqual([]);
  });

  it('never reads or writes custom roles or their mappings', async () => {
    const a = definition('iam.a.read');
    const b = definition('iam.b.read');
    const c = definition('iam.c.read');
    await sync([manifest(a, b, c)]);
    await postgres.client.$executeRaw`INSERT INTO iam_role (code, name, state, is_system)
      VALUES ('content-editors', 'Content Editors', 'ACTIVE', false)`;
    await postgres.client.$executeRaw`INSERT INTO iam_role_permission (role_id, permission_code)
      SELECT iam_role.id, iam_permission.code FROM iam_role, iam_permission
      WHERE iam_role.code = 'content-editors' AND iam_permission.code IN ('iam.b.read', 'iam.c.read')`;
    const customBefore = await postgres.client.$queryRaw<Array<{ row: string }>>`
      SELECT row_to_json(r)::text AS row FROM iam_role r WHERE code = 'content-editors'`;

    await sync([manifest(a, { ...b, state: 'DEPRECATED' }, { ...c, state: 'RETIRED' })]);

    expect(
      await postgres.client.$queryRaw`
        SELECT row_to_json(r)::text AS row FROM iam_role r WHERE code = 'content-editors'`,
    ).toEqual(customBefore);
    const customMappings = await postgres.client.$queryRaw<Array<{ code: string }>>`
      SELECT m.permission_code AS code FROM iam_role_permission m JOIN iam_role r ON r.id = m.role_id
      WHERE r.code = 'content-editors' ORDER BY m.permission_code COLLATE "C"`;
    expect(customMappings).toEqual([{ code: 'iam.b.read' }, { code: 'iam.c.read' }]);
    expect((await systemRole()).permissions.map((m) => m.permissionCode)).toEqual(['iam.a.read']);
  });

  it('keeps nothing of a first run whose last Audit append fails', async () => {
    const failing = new RecordingRecorder(14);
    await expect(sync([iamPermissionManifest], failing)).rejects.toThrow('audit append failed');
    expect(failing.entries).toHaveLength(13);
    expect(await state()).toEqual({ permissions: [], roles: [], mappings: [] });
  });

  it('leaves a converged database byte-identical when an evolution fails on its last append', async () => {
    const a = definition('iam.a.read');
    const b = definition('iam.b.read');
    await sync([manifest(a, b)]);
    const before = await state();
    // Register c (1 entry), deprecate b (1), revoke b (1), grant c (1): fail on the 4th append.
    const failing = new RecordingRecorder(4);
    await expect(
      sync([manifest(a, { ...b, state: 'DEPRECATED' }, definition('iam.c.read'))], failing),
    ).rejects.toThrow('audit append failed');
    expect(failing.entries.map((entry) => entry.action)).toEqual([
      'iam.permission.registered',
      'iam.permission.updated',
      'iam.role.permissions-revoked',
    ]);
    expect(await state()).toEqual(before);
  });

  it('lets exactly one of four truly concurrent first runs make the changes', async () => {
    const recorders = Array.from({ length: 4 }, () => new RecordingRecorder());
    const results = await Promise.all(
      recorders.map((recorder) => sync([iamPermissionManifest], recorder)),
    );
    const changed = results.filter(
      (result) => result.outcome === 'synchronized' && result.changes.systemRole === 'created',
    );
    const converged = results.filter(
      (result) =>
        result.outcome === 'synchronized' &&
        JSON.stringify(result.changes) === JSON.stringify(NO_CHANGES),
    );
    expect(changed).toHaveLength(1);
    expect(converged).toHaveLength(3);
    expect(recorders.reduce((total, recorder) => total + recorder.entries.length, 0)).toBe(14);
    expect(await postgres.client.iamPermission.count()).toBe(12);
    const role = await systemRole();
    expect(role.version).toBe(1);
    expect(role.permissions).toHaveLength(12);
  });

  it('makes a second run wait for the lock and plan from the first run’s committed result', async () => {
    let reachedFirstAppend: () => void = () => undefined;
    const firstRunAppending = new Promise<void>((resolve) => {
      reachedFirstAppend = resolve;
    });
    let releaseFirstRun: () => void = () => undefined;
    const firstRunMayContinue = new Promise<void>((resolve) => {
      releaseFirstRun = resolve;
    });
    const order: string[] = [];
    const gated: AuditRecorder = {
      async append() {
        reachedFirstAppend();
        await firstRunMayContinue;
      },
    };

    const first = sync([iamPermissionManifest], gated).then((result) => {
      order.push('first');
      return result;
    });
    await firstRunAppending; // The first run holds the lock and has written, but not committed.
    const second = sync([iamPermissionManifest]).then((result) => {
      order.push('second');
      return result;
    });
    // Observable database condition: the second run's transaction waits on the advisory lock.
    await vi.waitFor(
      async () => {
        const [row] = await postgres.client.$queryRaw<Array<{ waiting: number }>>`
          SELECT count(*)::int AS waiting FROM pg_stat_activity
          WHERE wait_event_type = 'Lock' AND wait_event = 'advisory'`;
        expect(row?.waiting).toBe(1);
      },
      { timeout: 4_000, interval: 25 },
    );
    expect(order).toEqual([]);
    releaseFirstRun();

    const [firstResult, secondResult] = await Promise.all([first, second]);
    expect(order).toEqual(['first', 'second']);
    expect(firstResult).toMatchObject({
      outcome: 'synchronized',
      changes: { systemRole: 'created' },
    });
    expect(secondResult).toEqual({ outcome: 'synchronized', changes: NO_CHANGES });
  });
});
