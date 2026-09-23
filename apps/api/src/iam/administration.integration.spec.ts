import { randomUUID } from 'node:crypto';
import {
  parseAdministrativeReason,
  parseTraceId,
  userActor,
  type AuditAttribution,
} from '@vertex-os/audit';
import { createAuditRecorder } from '@vertex-os/audit-persistence';
import { createDatabaseClient, type DatabaseClient } from '@vertex-os/database';
import { iamPermissionManifest } from '@vertex-os/iam';
import { synchronizeIamReferenceData } from '@vertex-os/iam/composition';
import {
  createApplicationUserRepository,
  createIamTransactionRunner,
} from '@vertex-os/iam-persistence';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startMigratedPostgres, type MigratedPostgres } from '../../test-support/postgres.js';
import { createIamAdministration, type IamAdministration } from './administration.js';
import { createIamAuthorization, type IamAuthorization } from './authorization.js';

/**
 * IAM department, membership, role and permission administration composed with its real adapters
 * (IAM-R05 Done means 1 to 9): PostgreSQL, the Audit adapter, and the authorization context of
 * IAM-R04 to observe the effect of each change. Competing operations run truly concurrently,
 * either in parallel or against a transaction that holds the contested row lock.
 */

let postgres: MigratedPostgres;
let database: DatabaseClient;
let admin: IamAdministration;
let authorization: IamAuthorization;

beforeAll(async () => {
  postgres = await startMigratedPostgres();
  database = createDatabaseClient({ connectionString: postgres.url });
  admin = createIamAdministration(database, { auditRecorderFor: createAuditRecorder });
  authorization = createIamAuthorization(database, { auditRecorderFor: createAuditRecorder });
}, 180_000);

afterAll(async () => {
  try {
    await database?.disconnect();
  } finally {
    await postgres?.stop();
  }
});

beforeEach(async () => {
  await sql(
    `TRUNCATE audit_record, iam_application_user, iam_department, iam_role, iam_permission CASCADE`,
  );
  const traceId = parseTraceId('trace-administration-sync');
  if (!traceId.ok) throw new Error('trace fixture');
  const synced = await synchronizeIamReferenceData(
    { runner: createIamTransactionRunner(database, { auditRecorderFor: createAuditRecorder }) },
    { manifests: [iamPermissionManifest], traceId: traceId.value },
  );
  if (synced.outcome !== 'synchronized') throw new Error('reference synchronization');
  await sql(`DELETE FROM audit_record`);
});

// ---------------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------------

const ADMIN_ID = '00000000-0000-4000-8000-00000000a001';

function by(reason?: string): AuditAttribution {
  const actor = userActor(ADMIN_ID);
  const traceId = parseTraceId('trace-administration-test');
  if (!actor.ok || !traceId.ok) throw new Error('attribution fixture');
  if (reason === undefined) return { actor: actor.value, traceId: traceId.value };
  const parsed = parseAdministrativeReason(reason);
  if (!parsed.ok) throw new Error('reason fixture');
  return { actor: actor.value, traceId: traceId.value, reason: parsed.value };
}

function sql(statement: string): Promise<string> {
  return postgres.sql(statement);
}

/** psql prints the returned value, then the command tag. */
async function value(statement: string): Promise<string> {
  return (await sql(statement)).split('\n')[0] ?? '';
}

async function invitedUser(): Promise<string> {
  const created = await createApplicationUserRepository(database).create({
    email: `${randomUUID()}@example.invalid` as never,
    displayName: 'Synthetic User' as never,
    accessState: 'INVITED',
    identitySyncState: 'PENDING',
    invitationDeliveryState: 'NOT_SENT',
    memberships: [],
    roleIds: [],
  });
  if (created.outcome !== 'created') throw new Error('seed user');
  return created.user.id;
}

const ACTIVATE = (id: string) =>
  `UPDATE iam_application_user SET access_state = 'ACTIVE', first_activated_at = now(),
     identity_issuer = 'http://127.0.0.1:1/realms/vertex', identity_subject = '${id}',
     identity_sync_state = 'SYNCED', version = version + 1 WHERE id = '${id}'`;

async function activeUser(): Promise<string> {
  const id = await invitedUser();
  await sql(ACTIVATE(id));
  return id;
}

async function systemRoleId(): Promise<string> {
  return value(`SELECT id FROM iam_role WHERE code = 'system-administrator'`);
}

async function department(code: string): Promise<{ id: string; version: number }> {
  const created = await admin.createDepartment({ code, name: `Department ${code}` }, by());
  if (created.outcome !== 'created') throw new Error('seed department');
  return { id: created.department.id, version: created.department.version };
}

async function customRole(code: string, codes: string[] = []): Promise<string> {
  const created = await admin.createRole({ code, name: `Role ${code}` }, by());
  if (created.outcome !== 'created') throw new Error('seed role');
  if (codes.length > 0) {
    const replaced = await admin.replaceRolePermissions(
      { roleId: created.role.id, expectedVersion: 1, permissionCodes: codes },
      by(),
    );
    if (replaced.outcome !== 'updated') throw new Error('seed mappings');
  }
  return created.role.id;
}

async function context(userId: string) {
  const resolved = await authorization.resolveAuthorizationContext(userId);
  if (resolved.outcome !== 'active') throw new Error(`no context: ${resolved.outcome}`);
  return resolved.context;
}

async function primaryOf(userId: string): Promise<string[]> {
  const out = await sql(
    `SELECT department_id FROM iam_department_membership
       WHERE user_id = '${userId}' AND is_primary ORDER BY department_id`,
  );
  return out === '' ? [] : out.split('\n');
}

/** `action|result|reason|change` of the IAM administration records, oldest first. */
async function evidence(): Promise<string[]> {
  const out = await sql(
    `SELECT action || '|' || result || '|' || coalesce(reason, '') || '|' ||
            coalesce(change::text, '')
       FROM audit_record ORDER BY occurred_at, id`,
  );
  return out === '' ? [] : out.split('\n');
}

async function actions(): Promise<string[]> {
  return (await evidence()).map((line) => line.split('|').slice(0, 2).join('|'));
}

/**
 * Runs `statements` in one psql transaction that holds its locks for `seconds`, and resolves once
 * that transaction is sleeping, i.e. once the locks are held. Await `done` afterwards.
 */
async function holdLocks(statements: string, seconds = 1.5): Promise<{ done: Promise<string> }> {
  const marker = `hold_${randomUUID().replaceAll('-', '')}`;
  const done = sql(`BEGIN; ${statements}; SELECT pg_sleep(${seconds}) AS ${marker}; COMMIT;`);
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const sleeping = await value(
      `SELECT count(*) FROM pg_stat_activity WHERE query LIKE '%AS ${marker}%'
         AND wait_event = 'PgSleep'`,
    );
    if (sleeping === '1') return { done };
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('the lock-holding transaction never started sleeping');
}

// ---------------------------------------------------------------------------------------------
// Departments (IAM-MP-08)
// ---------------------------------------------------------------------------------------------

describe('department lifecycle', () => {
  it('creates an ACTIVE department at version 1 with Audit evidence, and refuses its code again', async () => {
    const created = await admin.createDepartment(
      { code: 'sales', name: 'Sales', description: 'Sells.' },
      by('New unit'),
    );
    expect(created).toMatchObject({
      outcome: 'created',
      department: {
        code: 'sales',
        name: 'Sales',
        description: 'Sells.',
        state: 'ACTIVE',
        version: 1,
      },
    });
    expect(await admin.createDepartment({ code: 'sales', name: 'Other' }, by())).toEqual({
      outcome: 'code-taken',
    });
    expect(await admin.createDepartment({ code: 'Sales!', name: 'X' }, by())).toEqual({
      outcome: 'invalid',
      field: 'code',
    });
    expect(await evidence()).toEqual([
      'iam.department.created|SUCCEEDED|New unit|{"after": {"code": "sales", "name": "Sales", "state": "ACTIVE", "description": "Sells."}}',
    ]);
  });

  it('turns a concurrent creation of the same code into code-taken (D-17)', async () => {
    const results = await Promise.all(
      [1, 2, 3].map(() => admin.createDepartment({ code: 'studio', name: 'Studio' }, by())),
    );
    expect(results.map((result) => result.outcome).sort()).toEqual([
      'code-taken',
      'code-taken',
      'created',
    ]);
    expect(await value(`SELECT count(*) FROM iam_department WHERE code = 'studio'`)).toBe('1');
  });

  it('checks versions, writes only changes and never changes the code (Done means 1)', async () => {
    const sales = await department('sales');
    const updated = await admin.updateDepartment(
      { departmentId: sales.id, expectedVersion: 1, name: 'Sales team', description: 'Sells.' },
      by(),
    );
    expect(updated).toMatchObject({
      outcome: 'updated',
      department: { code: 'sales', version: 2 },
    });
    expect(
      await admin.updateDepartment({ departmentId: sales.id, expectedVersion: 1, name: 'X' }, by()),
    ).toEqual({ outcome: 'version-conflict' });
    expect(
      await admin.updateDepartment(
        { departmentId: sales.id, expectedVersion: 2, name: 'Sales team' },
        by(),
      ),
    ).toMatchObject({ outcome: 'unchanged', department: { version: 2 } });
    expect(
      await admin.updateDepartment(
        { departmentId: sales.id, expectedVersion: 2, description: null },
        by(),
      ),
    ).toMatchObject({ outcome: 'updated', department: { description: undefined, version: 3 } });
    expect(
      await admin.activateDepartment({ departmentId: sales.id, expectedVersion: 3 }, by()),
    ).toMatchObject({ outcome: 'unchanged' });
    expect(
      await admin.deactivateDepartment({ departmentId: randomUUID(), expectedVersion: 1 }, by()),
    ).toEqual({ outcome: 'department-not-found' });
    expect(await value(`SELECT name || '|' || version FROM iam_department`)).toBe('Sales team|3');
    expect(await actions()).toEqual([
      'iam.department.created|SUCCEEDED',
      'iam.department.updated|SUCCEEDED',
      'iam.department.updated|SUCCEEDED',
    ]);
  });

  it('lets exactly one of two concurrent changes at the same version win', async () => {
    const sales = await department('sales');
    const results = await Promise.all([
      admin.deactivateDepartment({ departmentId: sales.id, expectedVersion: 1 }, by()),
      admin.updateDepartment({ departmentId: sales.id, expectedVersion: 1, name: 'Renamed' }, by()),
    ]);
    expect(results.map((result) => result.outcome).sort()).toEqual(['updated', 'version-conflict']);
    expect(await value(`SELECT version FROM iam_department`)).toBe('2');
  });

  it('removes a deactivated department and its primary from the next context, and restores them (Done means 2)', async () => {
    const user = await activeUser();
    const sales = await department('sales');
    const studio = await department('studio');
    await admin.addMembership({ userId: user, departmentId: sales.id, isPrimary: true }, by());
    await admin.addMembership({ userId: user, departmentId: studio.id, isPrimary: false }, by());
    expect(await context(user)).toMatchObject({
      primaryDepartmentId: sales.id,
      departmentIds: [sales.id, studio.id].sort(),
    });

    await admin.deactivateDepartment({ departmentId: sales.id, expectedVersion: 1 }, by());
    const without = await context(user);
    expect(without.primaryDepartmentId).toBeUndefined();
    expect(without.departmentIds).toEqual([studio.id]);
    expect(await primaryOf(user)).toEqual([sales.id]);

    await admin.activateDepartment({ departmentId: sales.id, expectedVersion: 2 }, by());
    expect(await context(user)).toMatchObject({ primaryDepartmentId: sales.id });
    expect(await value(`SELECT count(*) FROM iam_department`)).toBe('2');
  });

  it('rolls the change back when its Audit evidence cannot be appended (invariant 16)', async () => {
    const failing = createIamAdministration(database, {
      auditRecorderFor: () => ({
        append: async () => {
          throw new Error('audit unavailable');
        },
      }),
    });
    await expect(failing.createDepartment({ code: 'sales', name: 'Sales' }, by())).rejects.toThrow(
      'audit unavailable',
    );
    const role = await customRole('editor');
    await expect(
      failing.deactivateRole({ roleId: role, expectedVersion: 1 }, by()),
    ).rejects.toThrow('audit unavailable');
    expect(await value(`SELECT count(*) FROM iam_department`)).toBe('0');
    expect(await value(`SELECT state || '|' || version FROM iam_role WHERE id = '${role}'`)).toBe(
      'ACTIVE|1',
    );
  });
});

// ---------------------------------------------------------------------------------------------
// Memberships (IAM-MP-08)
// ---------------------------------------------------------------------------------------------

describe('memberships', () => {
  it('adds memberships only to existing ACTIVE departments and only once', async () => {
    const user = await activeUser();
    const sales = await department('sales');
    const archive = await department('archive');
    await admin.deactivateDepartment({ departmentId: archive.id, expectedVersion: 1 }, by());

    expect(
      await admin.addMembership({ userId: user, departmentId: sales.id, isPrimary: false }, by()),
    ).toEqual({ outcome: 'added', demotedPrimaryDepartmentId: undefined });
    expect(
      await admin.addMembership({ userId: user, departmentId: sales.id, isPrimary: true }, by()),
    ).toEqual({ outcome: 'duplicate-membership' });
    expect(
      await admin.addMembership({ userId: user, departmentId: archive.id, isPrimary: false }, by()),
    ).toEqual({ outcome: 'department-inactive' });
    expect(
      await admin.addMembership(
        { userId: user, departmentId: randomUUID(), isPrimary: false },
        by(),
      ),
    ).toEqual({ outcome: 'department-not-found' });
    expect(
      await admin.addMembership(
        { userId: randomUUID(), departmentId: sales.id, isPrimary: false },
        by(),
      ),
    ).toEqual({ outcome: 'user-not-found' });
    expect(
      await admin.addMembership(
        { userId: 'not-a-uuid', departmentId: sales.id, isPrimary: false },
        by(),
      ),
    ).toEqual({ outcome: 'invalid', field: 'userId' });
  });

  it('switches the primary explicitly, clears it, and never makes an INACTIVE department primary', async () => {
    const user = await activeUser();
    const sales = await department('sales');
    const studio = await department('studio');
    await admin.addMembership({ userId: user, departmentId: sales.id, isPrimary: true }, by());
    expect(
      await admin.addMembership({ userId: user, departmentId: studio.id, isPrimary: true }, by()),
    ).toEqual({ outcome: 'added', demotedPrimaryDepartmentId: sales.id });
    expect(await primaryOf(user)).toEqual([studio.id]);

    expect(
      await admin.setPrimaryMembership(
        { userId: user, departmentId: sales.id, isPrimary: true },
        by(),
      ),
    ).toEqual({ outcome: 'updated', primaryDepartmentId: sales.id });
    expect(await primaryOf(user)).toEqual([sales.id]);

    await admin.deactivateDepartment({ departmentId: studio.id, expectedVersion: 1 }, by());
    expect(
      await admin.setPrimaryMembership(
        { userId: user, departmentId: studio.id, isPrimary: true },
        by(),
      ),
    ).toEqual({ outcome: 'department-inactive' });

    expect(
      await admin.setPrimaryMembership(
        { userId: user, departmentId: sales.id, isPrimary: false },
        by(),
      ),
    ).toEqual({ outcome: 'updated', primaryDepartmentId: undefined });
    expect(await primaryOf(user)).toEqual([]);

    const records = await evidence();
    expect(records.filter((line) => line.startsWith('iam.user.'))).toEqual([
      `iam.user.department-added|SUCCEEDED||{"after": {"isPrimary": true, "departmentId": "${sales.id}", "primaryDepartmentId": "${sales.id}"}, "before": {"primaryDepartmentId": null}}`,
      `iam.user.department-added|SUCCEEDED||{"after": {"isPrimary": true, "departmentId": "${studio.id}", "primaryDepartmentId": "${studio.id}"}, "before": {"primaryDepartmentId": "${sales.id}"}}`,
      `iam.user.primary-department-changed|SUCCEEDED||{"after": {"primaryDepartmentId": "${sales.id}"}, "before": {"primaryDepartmentId": "${studio.id}"}}`,
      `iam.user.primary-department-changed|SUCCEEDED||{"after": {"primaryDepartmentId": null}, "before": {"primaryDepartmentId": "${sales.id}"}}`,
    ]);
  });

  it('removes the primary without guessing a replacement, or promotes the one the request names', async () => {
    const user = await activeUser();
    const sales = await department('sales');
    const studio = await department('studio');
    const design = await department('design');
    for (const [id, isPrimary] of [
      [sales.id, true],
      [studio.id, false],
      [design.id, false],
    ] as const) {
      await admin.addMembership({ userId: user, departmentId: id, isPrimary }, by());
    }
    expect(
      await admin.removeMembership(
        { userId: user, departmentId: studio.id, replacementPrimaryDepartmentId: design.id },
        by(),
      ),
    ).toEqual({ outcome: 'primary-conflict' });
    expect(
      await admin.removeMembership(
        { userId: user, departmentId: sales.id, replacementPrimaryDepartmentId: randomUUID() },
        by(),
      ),
    ).toEqual({ outcome: 'primary-conflict' });
    expect(
      await admin.removeMembership(
        { userId: user, departmentId: sales.id, replacementPrimaryDepartmentId: design.id },
        by(),
      ),
    ).toEqual({ outcome: 'removed', primaryDepartmentId: design.id });
    expect(await primaryOf(user)).toEqual([design.id]);

    expect(await admin.removeMembership({ userId: user, departmentId: design.id }, by())).toEqual({
      outcome: 'removed',
      primaryDepartmentId: undefined,
    });
    expect(await primaryOf(user)).toEqual([]);
    expect(await admin.removeMembership({ userId: user, departmentId: design.id }, by())).toEqual({
      outcome: 'membership-not-found',
    });
    expect(await context(user)).toMatchObject({ departmentIds: [studio.id] });
  });

  it('serializes concurrent primary changes of one user, leaving exactly one primary (Done means 4)', async () => {
    const user = await activeUser();
    const departments = await Promise.all(['d1', 'd2', 'd3', 'd4'].map(department));
    for (const entry of departments.slice(0, 3)) {
      await admin.addMembership({ userId: user, departmentId: entry.id, isPrimary: false }, by());
    }
    const [d1, d2, d3, d4] = departments.map((entry) => entry.id) as [
      string,
      string,
      string,
      string,
    ];
    const results = await Promise.all([
      admin.setPrimaryMembership({ userId: user, departmentId: d1, isPrimary: true }, by()),
      admin.setPrimaryMembership({ userId: user, departmentId: d2, isPrimary: true }, by()),
      admin.setPrimaryMembership({ userId: user, departmentId: d3, isPrimary: true }, by()),
      admin.addMembership({ userId: user, departmentId: d4, isPrimary: true }, by()),
    ]);
    expect(results.map((result) => result.outcome).sort()).toEqual([
      'added',
      'updated',
      'updated',
      'updated',
    ]);
    expect(await primaryOf(user)).toHaveLength(1);
  });

  it('orders an addition after a concurrent deactivation of its department (Done means 3, D-08)', async () => {
    const user = await activeUser();
    const sales = await department('sales');
    const held = await holdLocks(
      `UPDATE iam_department SET state = 'INACTIVE', version = version + 1 WHERE id = '${sales.id}'`,
    );
    const added = await admin.addMembership(
      { userId: user, departmentId: sales.id, isPrimary: true },
      by(),
    );
    await held.done;
    expect(added).toEqual({ outcome: 'department-inactive' });
    expect(await value(`SELECT count(*) FROM iam_department_membership`)).toBe('0');
  });
});

// ---------------------------------------------------------------------------------------------
// Roles and mappings (IAM-MP-09)
// ---------------------------------------------------------------------------------------------

describe('roles and permission mappings', () => {
  it('creates custom roles, never with the reserved code', async () => {
    const created = await admin.createRole({ code: 'editor', name: 'Editor' }, by());
    expect(created).toMatchObject({
      outcome: 'created',
      role: { code: 'editor', state: 'ACTIVE', isSystem: false, version: 1 },
    });
    expect(await admin.createRole({ code: 'system-administrator', name: 'Root' }, by())).toEqual({
      outcome: 'code-taken',
    });
    expect(await admin.createRole({ code: 'editor', name: 'Again' }, by())).toEqual({
      outcome: 'code-taken',
    });
  });

  it('protects the system role from every change and records the refused attempts (Done means 5)', async () => {
    const system = await systemRoleId();
    const before = await value(
      `SELECT name || '|' || state || '|' || version FROM iam_role WHERE id = '${system}'`,
    );
    const mappings = await value(
      `SELECT count(*) FROM iam_role_permission WHERE role_id = '${system}'`,
    );
    expect(
      await admin.updateRole({ roleId: system, expectedVersion: 1, name: 'Root' }, by()),
    ).toEqual({ outcome: 'system-role-protected' });
    expect(await admin.deactivateRole({ roleId: system, expectedVersion: 1 }, by())).toEqual({
      outcome: 'system-role-protected',
    });
    expect(
      await admin.replaceRolePermissions(
        { roleId: system, expectedVersion: 1, permissionCodes: ['iam.users.read'] },
        by(),
      ),
    ).toEqual({ outcome: 'system-role-protected' });
    expect(
      await value(
        `SELECT name || '|' || state || '|' || version FROM iam_role WHERE id = '${system}'`,
      ),
    ).toBe(before);
    expect(
      await value(`SELECT count(*) FROM iam_role_permission WHERE role_id = '${system}'`),
    ).toBe(mappings);
    expect(await actions()).toEqual([
      'iam.role.updated|REFUSED',
      'iam.role.deactivated|REFUSED',
      'iam.role.permissions-replaced|REFUSED',
    ]);
  });

  it('replaces mappings with one version step and never newly maps a non-ACTIVE code (Done means 7)', async () => {
    const role = await customRole('editor');
    expect(
      await admin.replaceRolePermissions(
        { roleId: role, expectedVersion: 1, permissionCodes: ['iam.users.read', 'iam.roles.read'] },
        by(),
      ),
    ).toMatchObject({
      outcome: 'updated',
      role: { version: 2 },
      permissionCodes: ['iam.roles.read', 'iam.users.read'],
    });
    expect(
      await admin.replaceRolePermissions(
        { roleId: role, expectedVersion: 2, permissionCodes: ['iam.roles.read', 'iam.users.read'] },
        by(),
      ),
    ).toMatchObject({ outcome: 'unchanged', role: { version: 2 } });
    expect(
      await admin.replaceRolePermissions(
        { roleId: role, expectedVersion: 1, permissionCodes: ['iam.users.read'] },
        by(),
      ),
    ).toEqual({ outcome: 'version-conflict' });
    expect(
      await admin.replaceRolePermissions(
        { roleId: role, expectedVersion: 2, permissionCodes: ['iam.unknown.read'] },
        by(),
      ),
    ).toEqual({ outcome: 'unknown-permission', permissionCodes: ['iam.unknown.read'] });
    for (const permissionCodes of [['iam.*'], ['*'], ['iam.users.read', 'iam.users.read']]) {
      expect(
        await admin.replaceRolePermissions(
          { roleId: role, expectedVersion: 2, permissionCodes },
          by(),
        ),
      ).toEqual({ outcome: 'invalid', field: 'permissionCodes' });
    }

    await sql(`UPDATE iam_permission SET state = 'DEPRECATED' WHERE code = 'iam.users.read'`);
    expect(
      await admin.replaceRolePermissions(
        { roleId: role, expectedVersion: 2, permissionCodes: ['iam.users.read', 'iam.roles.read'] },
        by(),
      ),
    ).toEqual({ outcome: 'permission-not-assignable', permissionCodes: ['iam.users.read'] });
    expect(
      await admin.replaceRolePermissions(
        { roleId: role, expectedVersion: 2, permissionCodes: ['iam.roles.read'] },
        by(),
      ),
    ).toMatchObject({ outcome: 'updated', role: { version: 3 } });

    expect((await evidence()).filter((line) => line.includes('permissions-replaced'))).toEqual([
      'iam.role.permissions-replaced|SUCCEEDED||{"after": {"permissionCodes": ["iam.roles.read", "iam.users.read"]}, "before": {"permissionCodes": []}}',
      'iam.role.permissions-replaced|SUCCEEDED||{"after": {"permissionCodes": ["iam.roles.read"]}, "before": {"permissionCodes": ["iam.roles.read", "iam.users.read"]}}',
    ]);
  });

  it('orders a replacement after a concurrent deprecation of a requested permission (D-15)', async () => {
    const role = await customRole('editor');
    const held = await holdLocks(
      `UPDATE iam_permission SET state = 'DEPRECATED' WHERE code = 'iam.users.read'`,
    );
    const replaced = await admin.replaceRolePermissions(
      { roleId: role, expectedVersion: 1, permissionCodes: ['iam.users.read'] },
      by(),
    );
    await held.done;
    expect(replaced).toEqual({
      outcome: 'permission-not-assignable',
      permissionCodes: ['iam.users.read'],
    });
  });

  it('refuses a stale role version under concurrency and lets one change win', async () => {
    const role = await customRole('editor');
    const results = await Promise.all([
      admin.deactivateRole({ roleId: role, expectedVersion: 1 }, by()),
      admin.replaceRolePermissions(
        { roleId: role, expectedVersion: 1, permissionCodes: ['iam.users.read'] },
        by(),
      ),
      admin.updateRole({ roleId: role, expectedVersion: 1, name: 'Writer' }, by()),
    ]);
    expect(results.map((result) => result.outcome).sort()).toEqual([
      'updated',
      'version-conflict',
      'version-conflict',
    ]);
    expect(await value(`SELECT version FROM iam_role WHERE id = '${role}'`)).toBe('2');
  });

  it('changes the next authorization context for every privilege change (Done means 8)', async () => {
    const user = await activeUser();
    const role = await customRole('editor', ['iam.users.read', 'iam.roles.read']);
    expect((await context(user)).permissionCodes).toEqual([]);

    expect(await admin.assignRole({ userId: user, roleId: role }, by())).toEqual({
      outcome: 'assigned',
    });
    expect((await context(user)).permissionCodes).toEqual(['iam.roles.read', 'iam.users.read']);

    await admin.replaceRolePermissions(
      { roleId: role, expectedVersion: 2, permissionCodes: ['iam.roles.read'] },
      by(),
    );
    expect((await context(user)).permissionCodes).toEqual(['iam.roles.read']);

    await admin.deactivateRole({ roleId: role, expectedVersion: 3 }, by());
    expect((await context(user)).permissionCodes).toEqual([]);
    expect(await admin.assignRole({ userId: await activeUser(), roleId: role }, by())).toEqual({
      outcome: 'role-inactive',
    });

    await admin.activateRole({ roleId: role, expectedVersion: 4 }, by());
    expect((await context(user)).permissionCodes).toEqual(['iam.roles.read']);

    expect(await admin.assignRole({ userId: user, roleId: role }, by())).toEqual({
      outcome: 'duplicate-assignment',
    });
    expect(await admin.removeRole({ userId: user, roleId: role }, by())).toEqual({
      outcome: 'removed',
    });
    expect((await context(user)).permissionCodes).toEqual([]);
    expect(await admin.removeRole({ userId: user, roleId: role }, by())).toEqual({
      outcome: 'assignment-not-found',
    });
    expect(await admin.assignRole({ userId: user, roleId: randomUUID() }, by())).toEqual({
      outcome: 'role-not-found',
    });
    expect((await evidence()).filter((line) => line.startsWith('iam.user.role-'))).toEqual([
      `iam.user.role-assigned|SUCCEEDED||{"after": {"roleId": "${role}", "roleCode": "editor"}}`,
      `iam.user.role-removed|SUCCEEDED||{"before": {"roleId": "${role}", "roleCode": "editor"}}`,
    ]);
  });
});

// ---------------------------------------------------------------------------------------------
// Last ACTIVE System Administrator (IAM-MP-09)
// ---------------------------------------------------------------------------------------------

describe('last ACTIVE System Administrator', () => {
  it('refuses to remove the role from the only ACTIVE holder and records the attempt', async () => {
    const system = await systemRoleId();
    const only = await activeUser();
    const invited = await invitedUser();
    await admin.assignRole({ userId: only, roleId: system }, by());
    await admin.assignRole({ userId: invited, roleId: system }, by());

    expect(await admin.removeRole({ userId: only, roleId: system }, by('Rotation'))).toEqual({
      outcome: 'last-system-admin',
    });
    // Holders that are not ACTIVE do not count and are not blocked (spec Section 20).
    expect(await admin.removeRole({ userId: invited, roleId: system }, by())).toEqual({
      outcome: 'removed',
    });
    expect((await context(only)).permissionCodes).toContain('iam.roles.manage');
    expect((await evidence()).filter((line) => line.startsWith('iam.user.role-removed'))).toEqual([
      `iam.user.role-removed|REFUSED|Rotation|{"before": {"roleId": "${system}", "roleCode": "system-administrator"}}`,
      `iam.user.role-removed|SUCCEEDED||{"before": {"roleId": "${system}", "roleCode": "system-administrator"}}`,
    ]);
  });

  it('lets only one of two concurrent removals from the last two ACTIVE holders succeed (Done means 6)', async () => {
    const system = await systemRoleId();
    const first = await activeUser();
    const second = await activeUser();
    await admin.assignRole({ userId: first, roleId: system }, by());
    await admin.assignRole({ userId: second, roleId: system }, by());

    // Both removals queue behind a transaction that holds the System Administrator row, so they
    // are in flight together when it commits.
    const held = await holdLocks(`SELECT id FROM iam_role WHERE id = '${system}' FOR UPDATE`, 1);
    const results = await Promise.all([
      admin.removeRole({ userId: first, roleId: system }, by()),
      admin.removeRole({ userId: second, roleId: system }, by()),
    ]);
    await held.done;
    expect(results.map((result) => result.outcome).sort()).toEqual([
      'last-system-admin',
      'removed',
    ]);
    expect(
      await value(
        `SELECT count(*) FROM iam_user_role_assignment a JOIN iam_application_user u
           ON u.id = a.user_id WHERE a.role_id = '${system}' AND u.access_state = 'ACTIVE'`,
      ),
    ).toBe('1');
  });

  it('waits for a concurrent first activation of its target and then applies the rule (D-07)', async () => {
    const system = await systemRoleId();
    const candidate = await invitedUser();
    await admin.assignRole({ userId: candidate, roleId: system }, by());

    const held = await holdLocks(ACTIVATE(candidate));
    const removed = await admin.removeRole({ userId: candidate, roleId: system }, by());
    await held.done;
    expect(removed).toEqual({ outcome: 'last-system-admin' });
    expect(
      await value(
        `SELECT count(*) FROM iam_user_role_assignment WHERE user_id = '${candidate}'
           AND role_id = '${system}'`,
      ),
    ).toBe('1');
  });

  it('assigns the system role like any ACTIVE role and grants every ACTIVE permission', async () => {
    const system = await systemRoleId();
    const user = await activeUser();
    expect(await admin.assignRole({ userId: user, roleId: system }, by())).toEqual({
      outcome: 'assigned',
    });
    expect((await context(user)).permissionCodes).toEqual(
      iamPermissionManifest.permissions.map((permission) => permission.code).sort(),
    );
  });
});
