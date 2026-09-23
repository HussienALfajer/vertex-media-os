import { describe, expect, it } from 'vitest';
import { parseTraceId, type TraceId } from '@vertex-os/audit';
import {
  FAKE_ROLE_ID,
  InMemoryReferenceStore,
  RecordingAuditRecorder,
  fakeRunner,
} from '../../test-support/reference-data-fakes.js';
import {
  iamPermissionManifest,
  type PermissionDefinition,
  type PermissionManifest,
} from '../domain/permission-catalog.js';
import { synchronizeIamReferenceData } from './synchronize-reference-data.js';

const parsedTraceId = parseTraceId('trace-sync-1');
if (!parsedTraceId.ok) throw new Error('trace id fixture');
const TRACE_ID: TraceId = parsedTraceId.value;

const SYSTEM_ACTOR = { type: 'SYSTEM', process: 'iam.reference-sync' };

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

async function run(
  store: InMemoryReferenceStore,
  manifests: readonly PermissionManifest[],
  audit = new RecordingAuditRecorder(),
) {
  const runner = fakeRunner(store, audit);
  const result = await synchronizeIamReferenceData({ runner }, { manifests, traceId: TRACE_ID });
  return { result, audit, runner };
}

describe('synchronizeIamReferenceData', () => {
  it('first run: registers all, creates the role, grants the ACTIVE set and appends 14 entries', async () => {
    const store = new InMemoryReferenceStore();
    const { result, audit } = await run(store, [iamPermissionManifest]);
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
    expect(store.calls).toEqual([
      'lock',
      'read',
      `register:${codes.join(',')}`,
      'create-role',
      `grant:${codes.join(',')}`,
    ]);
    expect(audit.entries).toHaveLength(14);
    expect(audit.entries.map((entry) => entry.action)).toEqual([
      ...codes.map(() => 'iam.permission.registered'),
      'iam.role.created',
      'iam.role.permissions-granted',
    ]);
    const first = iamPermissionManifest.permissions.find((p) => p.code === codes[0]);
    expect(audit.entries[0]).toEqual({
      sourceModule: 'iam',
      action: 'iam.permission.registered',
      actor: SYSTEM_ACTOR,
      target: { type: 'iam.permission', id: codes[0] },
      result: 'SUCCEEDED',
      traceId: 'trace-sync-1',
      change: {
        after: {
          owningModule: 'iam',
          name: first?.name,
          description: first?.description,
          state: first?.state,
          sensitivity: first?.sensitivity,
        },
      },
    });
    expect(audit.entries[12]).toEqual({
      sourceModule: 'iam',
      action: 'iam.role.created',
      actor: SYSTEM_ACTOR,
      target: { type: 'iam.role', id: FAKE_ROLE_ID },
      result: 'SUCCEEDED',
      traceId: 'trace-sync-1',
      change: {
        after: {
          code: 'system-administrator',
          name: 'System Administrator',
          description: 'Protected system role that holds every active permission.',
          state: 'ACTIVE',
          isSystem: true,
        },
      },
    });
    expect(audit.entries[13]).toMatchObject({
      action: 'iam.role.permissions-granted',
      target: { type: 'iam.role', id: FAKE_ROLE_ID },
      change: { after: { permissionCodes: codes } },
    });
    expect(store.roles).toMatchObject([{ version: 1, permissionCodes: codes }]);
  });

  it('a converged run takes the lock, reads, and writes and appends nothing', async () => {
    const store = new InMemoryReferenceStore();
    await run(store, [iamPermissionManifest]);
    store.calls.length = 0;
    const { result, audit } = await run(store, [iamPermissionManifest]);
    expect(result).toEqual({
      outcome: 'synchronized',
      changes: {
        permissionsRegistered: [],
        permissionsUpdated: [],
        systemRole: 'unchanged',
        permissionsGranted: [],
        permissionsRevoked: [],
      },
    });
    expect(store.calls).toEqual(['lock', 'read']);
    expect(audit.entries).toEqual([]);
  });

  it('records updates, revocations and grants with only the changed fields, then bumps once', async () => {
    const store = new InMemoryReferenceStore();
    await run(store, [manifest(definition('iam.a.read'), definition('iam.b.read'))]);
    store.calls.length = 0;
    const { result, audit } = await run(store, [
      manifest(
        definition('iam.a.read', { state: 'DEPRECATED', name: 'Renamed' }),
        definition('iam.b.read'),
        definition('iam.c.read'),
      ),
    ]);
    expect(result).toEqual({
      outcome: 'synchronized',
      changes: {
        permissionsRegistered: ['iam.c.read'],
        permissionsUpdated: ['iam.a.read'],
        systemRole: 'updated',
        permissionsGranted: ['iam.c.read'],
        permissionsRevoked: ['iam.a.read'],
      },
    });
    expect(store.calls).toEqual([
      'lock',
      'read',
      'register:iam.c.read',
      'update:iam.a.read',
      'revoke:iam.a.read',
      'grant:iam.c.read',
      'bump:1',
    ]);
    expect(audit.entries.map((entry) => [entry.action, entry.target.id, entry.change])).toEqual([
      [
        'iam.permission.registered',
        'iam.c.read',
        {
          after: {
            owningModule: 'iam',
            name: 'Name of iam.c.read',
            description: 'Description of iam.c.read.',
            state: 'ACTIVE',
            sensitivity: 'STANDARD',
          },
        },
      ],
      [
        'iam.permission.updated',
        'iam.a.read',
        {
          before: { name: 'Name of iam.a.read', state: 'ACTIVE' },
          after: { name: 'Renamed', state: 'DEPRECATED' },
        },
      ],
      [
        'iam.role.permissions-revoked',
        FAKE_ROLE_ID,
        { before: { permissionCodes: ['iam.a.read'] } },
      ],
      [
        'iam.role.permissions-granted',
        FAKE_ROLE_ID,
        { after: { permissionCodes: ['iam.c.read'] } },
      ],
    ]);
    expect(store.roles[0]?.version).toBe(2);
  });

  it('records a role name and description repair as iam.role.updated', async () => {
    const store = new InMemoryReferenceStore();
    await run(store, [iamPermissionManifest]);
    const role = store.roles[0];
    if (!role) throw new Error('role');
    role.name = 'Admins' as typeof role.name;
    role.description = undefined;
    const { result, audit } = await run(store, [iamPermissionManifest]);
    expect(result).toMatchObject({ outcome: 'synchronized', changes: { systemRole: 'updated' } });
    expect(audit.entries).toEqual([
      {
        sourceModule: 'iam',
        action: 'iam.role.updated',
        actor: SYSTEM_ACTOR,
        target: { type: 'iam.role', id: FAKE_ROLE_ID },
        result: 'SUCCEEDED',
        traceId: 'trace-sync-1',
        change: {
          before: { name: 'Admins', description: null },
          after: {
            name: 'System Administrator',
            description: 'Protected system role that holds every active permission.',
          },
        },
      },
    ]);
    expect(role.version).toBe(2);
  });

  it('always acts as the system process iam.reference-sync', async () => {
    const store = new InMemoryReferenceStore();
    const { audit } = await run(store, [iamPermissionManifest]);
    expect(new Set(audit.entries.map((entry) => JSON.stringify(entry.actor)))).toEqual(
      new Set([JSON.stringify(SYSTEM_ACTOR)]),
    );
    expect(new Set(audit.entries.map((entry) => entry.traceId))).toEqual(new Set(['trace-sync-1']));
  });

  it('refuses an invalid manifest before opening a transaction', async () => {
    const store = new InMemoryReferenceStore();
    const { result, runner, audit } = await run(store, [
      manifest(definition('iam.a.read'), definition('iam.a.read')),
    ]);
    expect(result).toEqual({
      outcome: 'refused',
      reason: 'invalid-manifest',
      details: ['duplicate-code:iam.a.read'],
    });
    expect(runner.runs).toBe(0);
    expect(store.calls).toEqual([]);
    expect(audit.entries).toEqual([]);
  });

  it('refuses without writing or appending when the snapshot holds an undeclared code', async () => {
    const store = new InMemoryReferenceStore();
    await run(store, [manifest(definition('iam.a.read'), definition('iam.b.read'))]);
    store.calls.length = 0;
    const { result, audit } = await run(store, [manifest(definition('iam.a.read'))]);
    expect(result).toEqual({
      outcome: 'refused',
      reason: 'undeclared-permissions',
      details: ['iam.b.read'],
    });
    expect(store.calls).toEqual(['lock', 'read']);
    expect(audit.entries).toEqual([]);
  });

  it('propagates an append failure out of the runner', async () => {
    const store = new InMemoryReferenceStore();
    const failing = new RecordingAuditRecorder(14);
    await expect(run(store, [iamPermissionManifest], failing)).rejects.toThrow('append failed');
    expect(failing.entries).toHaveLength(13);
  });
});
