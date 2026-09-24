import { randomBytes, randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { parseSystemProcess, parseTraceId } from '@vertex-os/audit';
import { createAuditRecorder } from '@vertex-os/audit-persistence';
import { createDatabaseClient, type DatabaseClient } from '@vertex-os/database';
import { iamPermissionManifest } from '@vertex-os/iam';
import { synchronizeIamReferenceData } from '@vertex-os/iam/composition';
import { createIamTransactionRunner } from '@vertex-os/iam-persistence';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TEST_AUTH_ENVIRONMENT, testAuthConfig } from '../../../test-support/auth-config.js';
import { seedInvitedUser } from '../../../test-support/iam-users.js';
import { IAM_ROUTES } from '../../../test-support/iam-routes.js';
import { startMigratedPostgres, type MigratedPostgres } from '../../../test-support/postgres.js';
import { testProvisioningConfig } from '../../../test-support/provisioning-config.js';
import { createApp } from '../../app.factory.js';
import { csrfTokenFor } from '../../auth/secrets.js';
import { createSessionStore } from '../../auth/session-store.js';
import { createSessionService } from '../../auth/sessions.js';
import { createTokenCiphers } from '../../auth/token-cipher.js';
import { loadAppConfig } from '../../config/app-config.js';

/**
 * The IAM HTTP surface against real PostgreSQL (IAM-R07 Done means 1 to 7, 9, 10): the access
 * guard, validation, the bound capabilities, the Audit adapter and the problem mapping, with
 * sessions created directly. Keycloak is unreachable here, so every provisioning step fails in a
 * known way; the Keycloak journey suite covers the successful identity paths.
 */

let postgres: MigratedPostgres;
let database: DatabaseClient;
let app: NestFastifyApplication;

/** A transport that never reaches Keycloak: every provider outcome is unknown. */
const unreachable: typeof fetch = () => Promise.reject(new TypeError('fetch failed'));

beforeAll(async () => {
  postgres = await startMigratedPostgres();
  database = createDatabaseClient({ connectionString: postgres.url });
  const traceId = parseTraceId('trace-iam-http-sync');
  if (!traceId.ok) throw new Error('trace fixture');
  const synced = await synchronizeIamReferenceData(
    { runner: createIamTransactionRunner(database, { auditRecorderFor: createAuditRecorder }) },
    { manifests: [iamPermissionManifest], traceId: traceId.value },
  );
  if (synced.outcome !== 'synchronized') throw new Error('reference synchronization');
  app = await createApp(
    loadAppConfig({ NODE_ENV: 'test', LOG_LEVEL: 'info', DATABASE_URL: postgres.url }),
    testAuthConfig(),
    testProvisioningConfig(),
    { logStream: { write: () => undefined }, identityFetch: unreachable },
  );
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
}, 180_000);

afterAll(async () => {
  try {
    await app?.close();
    await database?.disconnect();
  } finally {
    await postgres?.stop();
  }
});

// ---------------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------------

interface Actor {
  readonly id: string;
  readonly secret: string;
}

const suffix = () => randomBytes(4).toString('hex');

async function value(statement: string): Promise<string> {
  return (await postgres.sql(statement)).split('\n')[0] ?? '';
}

async function rows(statement: string): Promise<string[]> {
  const output = await postgres.sql(statement);
  return output === '' ? [] : output.split('\n');
}

/** A custom role mapping exactly `codes`, inserted directly. */
async function role(codes: readonly string[], state = 'ACTIVE'): Promise<string> {
  const id = await value(
    `INSERT INTO iam_role (code, name, state, is_system)
       VALUES ('r-${suffix()}', 'Synthetic role', '${state}', false) RETURNING id`,
  );
  for (const code of codes) {
    await postgres.sql(
      `INSERT INTO iam_role_permission (role_id, permission_code) VALUES ('${id}', '${code}')`,
    );
  }
  return id;
}

async function department(state = 'ACTIVE'): Promise<string> {
  return value(
    `INSERT INTO iam_department (code, name, state)
       VALUES ('d-${suffix()}', 'Synthetic department', '${state}') RETURNING id`,
  );
}

async function systemRoleId(): Promise<string> {
  return value(`SELECT id FROM iam_role WHERE code = 'system-administrator'`);
}

/**
 * An ACTIVE user holding the given roles, with an identity bound under the unreachable test issuer,
 * as sign-in would leave it.
 */
async function activeUser(roleIds: readonly string[] = []): Promise<string> {
  const id = await seedInvitedUser(postgres, `user-${suffix()}@example.test`);
  await postgres.sql(
    `UPDATE iam_application_user SET access_state = 'ACTIVE', first_activated_at = now(),
       identity_issuer = '${testProvisioningConfig().issuer}',
       identity_subject = gen_random_uuid()::text, identity_sync_state = 'SYNCED',
       invitation_delivery_state = 'SENT', invitation_sent_at = now()
       WHERE id = '${id}'`,
  );
  for (const roleId of roleIds) {
    await postgres.sql(
      `INSERT INTO iam_user_role_assignment (user_id, role_id) VALUES ('${id}', '${roleId}')`,
    );
  }
  return id;
}

async function sessionFor(userId: string): Promise<string> {
  const process = parseSystemProcess('iam.test-http');
  const traceId = parseTraceId(`trace-${randomUUID()}`);
  if (!process.ok || !traceId.ok) throw new Error('attribution fixture');
  const sessions = createSessionService({
    store: createSessionStore(database, { auditRecorderFor: createAuditRecorder }),
    ciphers: createTokenCiphers(TEST_AUTH_ENVIRONMENT.AUTH_TOKEN_ENCRYPTION_SECRET),
    provider: { refreshSession: async () => ({ ok: false, failure: 'unavailable' }) },
    limits: testAuthConfig().session,
  });
  const { secret } = await sessions.establish({
    userId,
    idpSessionId: undefined,
    idToken: undefined,
    refreshToken: undefined,
    attribution: { actor: { type: 'SYSTEM', process: process.value }, traceId: traceId.value },
  });
  return secret;
}

/** A signed-in ACTIVE user holding exactly `codes` through one custom role. */
async function actor(codes: readonly string[]): Promise<Actor> {
  const id = await activeUser(codes.length === 0 ? [] : [await role(codes)]);
  return { id, secret: await sessionFor(id) };
}

/** A signed-in ACTIVE System Administrator. */
async function administrator(): Promise<Actor> {
  const id = await activeUser([await systemRoleId()]);
  return { id, secret: await sessionFor(id) };
}

interface CallOptions {
  readonly csrf?: string | null;
  readonly query?: string;
}

/** Request IDs of the unsafe calls each actor made, to find their Audit records. */
const unsafeRequests = new Map<string, string[]>();

async function call(
  who: Actor,
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  url: string,
  body?: unknown,
  options: CallOptions = {},
) {
  const csrf = options.csrf === undefined ? csrfTokenFor(who.secret) : options.csrf;
  const response = await app.inject({
    method,
    url: options.query === undefined ? url : `${url}?${options.query}`,
    headers: {
      cookie: `__Host-vertex-session=${who.secret}`,
      ...(method !== 'GET' && csrf !== null ? { 'x-csrf-token': csrf } : {}),
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    ...(body === undefined ? {} : { payload: JSON.stringify(body) }),
  });
  if (method !== 'GET') {
    const requestId = String(response.headers['x-request-id']);
    unsafeRequests.set(who.id, [...(unsafeRequests.get(who.id) ?? []), requestId]);
  }
  return response;
}

function problemOf(response: { json(): unknown }) {
  return response.json() as { status: number; code: string; fields?: string[] };
}

const concrete = (route: string) =>
  route
    .replace('{userId}', randomUUID())
    .replace('{departmentId}', randomUUID())
    .replace('{roleId}', randomUUID());

// ---------------------------------------------------------------------------------------------
// Protection of every route (spec Section 46.5 items 1 to 3)
// ---------------------------------------------------------------------------------------------

describe('protection of every IAM route', () => {
  it('refuses a user without the route permission and records each denial', async () => {
    const nobody = await actor([]);
    const guarded = Object.entries(IAM_ROUTES).filter(([, code]) => code !== null);
    for (const [route] of guarded) {
      const [method, path] = route.split(' ') as ['GET', string];
      const response = await call(nobody, method, concrete(path), {});
      expect(response.statusCode, route).toBe(403);
      expect(problemOf(response).code, route).toBe('AUTHORIZATION_DENIED');
    }
    expect(
      await value(
        `SELECT count(*) FROM audit_record
           WHERE action = 'iam.authorization.denied' AND actor_user_id = '${nobody.id}'`,
      ),
    ).toBe(String(guarded.length));
  });

  it('refuses every unsafe route without the session CSRF token, or with another session token', async () => {
    const admin = await administrator();
    const other = await administrator();
    for (const route of Object.keys(IAM_ROUTES).filter((route) => !route.startsWith('GET '))) {
      const [method, path] = route.split(' ') as ['POST', string];
      for (const csrf of [null, csrfTokenFor(other.secret)]) {
        const response = await call(admin, method, concrete(path), {}, { csrf });
        expect(response.statusCode, route).toBe(403);
        expect(problemOf(response).code, route).toBe('CSRF_VALIDATION_FAILED');
      }
    }
  });

  it('lets a holder of the permission past the guard on every route', async () => {
    const admin = await administrator();
    for (const route of Object.keys(IAM_ROUTES)) {
      const [method, path] = route.split(' ') as ['GET', string];
      const response = await call(admin, method, concrete(path), method === 'GET' ? undefined : {});
      expect([401, 403], route).not.toContain(response.statusCode);
      expect(response.statusCode, route).toBeLessThan(500);
      // IAM answers carry personal data; no cache may keep them, refusals included (D-06).
      expect(response.headers['cache-control'], route).toBe('no-store');
    }
  });
});

// ---------------------------------------------------------------------------------------------
// The current user (spec Section 25.2)
// ---------------------------------------------------------------------------------------------

describe('GET /api/iam/me', () => {
  it('returns the profile, ACTIVE departments and effective codes, for any ACTIVE session', async () => {
    const primary = await department();
    const closed = await department('INACTIVE');
    const reader = await actor(['iam.users.read', 'iam.departments.read']);
    await postgres.sql(
      `INSERT INTO iam_department_membership (user_id, department_id, is_primary)
         VALUES ('${reader.id}', '${primary}', true), ('${reader.id}', '${closed}', false)`,
    );

    const response = await call(reader, 'GET', '/api/iam/me');

    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    const body = response.json() as Record<string, unknown>;
    expect(body).toEqual({
      user: { id: reader.id, email: expect.any(String), displayName: 'Synthetic User' },
      departments: [
        { id: primary, code: expect.any(String), name: 'Synthetic department', isPrimary: true },
      ],
      permissionCodes: ['iam.departments.read', 'iam.users.read'],
    });
    const nobody = await actor([]);
    expect((await call(nobody, 'GET', '/api/iam/me')).json()).toMatchObject({
      departments: [],
      permissionCodes: [],
    });
  });
});

// ---------------------------------------------------------------------------------------------
// Departments (spec Section 25.6)
// ---------------------------------------------------------------------------------------------

describe('departments', () => {
  it('creates, reads, updates, deactivates and lists with versions, codes and refusals', async () => {
    const manager = await actor(['iam.departments.manage', 'iam.departments.read']);
    const code = `studio-${suffix()}`;

    const created = await call(manager, 'POST', '/api/iam/departments', {
      code,
      name: 'Studio',
    });
    expect(created.statusCode).toBe(201);
    const view = created.json() as { id: string; version: number };
    expect(view).toMatchObject({ code, name: 'Studio', description: null, state: 'ACTIVE' });

    const taken = await call(manager, 'POST', '/api/iam/departments', { code, name: 'Twice' });
    expect([taken.statusCode, problemOf(taken).code]).toEqual([
      409,
      'IAM_DEPARTMENT_CODE_CONFLICT',
    ]);

    const updated = await call(manager, 'PATCH', `/api/iam/departments/${view.id}`, {
      expectedVersion: 1,
      description: 'Creative work',
    });
    expect(updated.json()).toMatchObject({ description: 'Creative work', version: 2 });
    const stale = await call(manager, 'PATCH', `/api/iam/departments/${view.id}`, {
      expectedVersion: 1,
      name: 'Stale',
    });
    expect([stale.statusCode, problemOf(stale).code]).toEqual([409, 'IAM_VERSION_CONFLICT']);

    const deactivated = await call(manager, 'POST', `/api/iam/departments/${view.id}/deactivate`, {
      expectedVersion: 2,
    });
    expect(deactivated.json()).toMatchObject({ state: 'INACTIVE', version: 3 });
    const reactivated = await call(manager, 'POST', `/api/iam/departments/${view.id}/activate`, {
      expectedVersion: 3,
    });
    expect([reactivated.statusCode, reactivated.json()]).toEqual([
      200,
      expect.objectContaining({ state: 'ACTIVE', version: 4 }),
    ]);
    await call(manager, 'POST', `/api/iam/departments/${view.id}/deactivate`, {
      expectedVersion: 4,
    });

    const missing = await call(manager, 'GET', `/api/iam/departments/${randomUUID()}`);
    expect([missing.statusCode, problemOf(missing).code]).toEqual([
      404,
      'IAM_DEPARTMENT_NOT_FOUND',
    ]);

    const listed = await call(manager, 'GET', '/api/iam/departments', undefined, {
      query: `search=${code}&state=INACTIVE`,
    });
    expect(listed.json()).toMatchObject({ total: 1, page: 1, pageSize: 25, items: [{ code }] });

    const unknown = await call(manager, 'POST', '/api/iam/departments', {
      code: `x-${suffix()}`,
      name: 'X',
      state: 'INACTIVE',
    });
    expect([unknown.statusCode, problemOf(unknown).fields]).toEqual([400, ['state']]);
    for (const query of ['pageSize=101', 'page=0', 'state=GONE', 'sort=name']) {
      const refused = await call(manager, 'GET', '/api/iam/departments', undefined, { query });
      expect([refused.statusCode, problemOf(refused).code], query).toEqual([
        400,
        'VALIDATION_FAILED',
      ]);
    }
    const badId = await call(manager, 'GET', '/api/iam/departments/not-a-uuid');
    expect([badId.statusCode, problemOf(badId).fields]).toEqual([400, ['departmentId']]);
  });
});

// ---------------------------------------------------------------------------------------------
// Roles, mappings and the grant ceiling (spec Sections 20, 23, 23.1, 25.7)
// ---------------------------------------------------------------------------------------------

describe('roles and mappings', () => {
  it('creates a role, maps permissions, protects the system role and refuses unknown codes', async () => {
    const admin = await administrator();
    const created = await call(admin, 'POST', '/api/iam/roles', {
      code: `editor-${suffix()}`,
      name: 'Editor',
    });
    expect(created.statusCode).toBe(201);
    const roleId = (created.json() as { id: string }).id;

    const mapped = await call(admin, 'PUT', `/api/iam/roles/${roleId}/permissions`, {
      expectedVersion: 1,
      permissionCodes: ['iam.users.read', 'iam.roles.read'],
      reason: 'Editors read the directory.',
    });
    expect(mapped.json()).toMatchObject({
      version: 2,
      permissionCodes: ['iam.roles.read', 'iam.users.read'],
    });
    expect((await call(admin, 'GET', `/api/iam/roles/${roleId}`)).json()).toMatchObject({
      permissionCodes: ['iam.roles.read', 'iam.users.read'],
    });

    const unknown = await call(admin, 'PUT', `/api/iam/roles/${roleId}/permissions`, {
      expectedVersion: 2,
      permissionCodes: ['iam.nothing.here'],
    });
    expect([unknown.statusCode, problemOf(unknown).code]).toEqual([422, 'IAM_UNKNOWN_PERMISSION']);

    const system = await call(admin, 'POST', `/api/iam/roles/${await systemRoleId()}/deactivate`, {
      expectedVersion: 1,
    });
    expect([system.statusCode, problemOf(system).code]).toEqual([409, 'IAM_SYSTEM_ROLE_PROTECTED']);
  });

  it('refuses a grant beyond the ceiling with 403 and a REFUSED record naming the session user', async () => {
    const manager = await actor(['iam.roles.manage', 'iam.users.manage-roles']);
    const target = await activeUser();
    const custom = await role([]);

    const mapping = await call(manager, 'PUT', `/api/iam/roles/${custom}/permissions`, {
      expectedVersion: 1,
      permissionCodes: ['iam.sessions.revoke'],
    });
    expect([mapping.statusCode, problemOf(mapping).code]).toEqual([403, 'IAM_GRANT_EXCEEDS_ACTOR']);

    const assignment = await call(manager, 'POST', `/api/iam/users/${target}/roles`, {
      roleId: await systemRoleId(),
    });
    expect([assignment.statusCode, problemOf(assignment).code]).toEqual([
      403,
      'IAM_GRANT_EXCEEDS_ACTOR',
    ]);
    expect(
      await rows(
        `SELECT action || '|' || result || '|' || actor_type || '|' || actor_user_id
           FROM audit_record WHERE actor_user_id = '${manager.id}' ORDER BY occurred_at, id`,
      ),
    ).toEqual([
      `iam.role.permissions-replaced|REFUSED|USER|${manager.id}`,
      `iam.user.role-assigned|REFUSED|USER|${manager.id}`,
    ]);
    expect(
      await value(`SELECT count(*) FROM iam_user_role_assignment WHERE user_id = '${target}'`),
    ).toBe('0');
  });
});

// ---------------------------------------------------------------------------------------------
// Memberships and role assignments (spec Sections 22, 25.4, 25.5)
// ---------------------------------------------------------------------------------------------

describe('memberships and role assignments', () => {
  it('adds, changes and removes memberships, refusing a replacement that is not a membership', async () => {
    const manager = await actor(['iam.users.manage-departments']);
    const user = await activeUser();
    const [first, second] = [await department(), await department()];

    const added = await call(manager, 'POST', `/api/iam/users/${user}/departments`, {
      departmentId: first,
      isPrimary: true,
    });
    expect([added.statusCode, added.json()]).toEqual([
      201,
      { departmentId: first, isPrimary: true, demotedPrimaryDepartmentId: null },
    ]);
    const twice = await call(manager, 'POST', `/api/iam/users/${user}/departments`, {
      departmentId: first,
      isPrimary: false,
    });
    expect(problemOf(twice).code).toBe('IAM_DUPLICATE_DEPARTMENT_MEMBERSHIP');
    await call(manager, 'POST', `/api/iam/users/${user}/departments`, {
      departmentId: second,
      isPrimary: false,
    });

    // The replacement must be another membership; the backend never guesses one (spec Section 22).
    const foreign = await call(
      manager,
      'DELETE',
      `/api/iam/users/${user}/departments/${first}`,
      undefined,
      { query: `replacementPrimaryDepartmentId=${await department()}` },
    );
    expect([foreign.statusCode, problemOf(foreign).code]).toEqual([
      422,
      'IAM_PRIMARY_DEPARTMENT_CONFLICT',
    ]);
    const removed = await call(
      manager,
      'DELETE',
      `/api/iam/users/${user}/departments/${first}`,
      undefined,
      { query: `replacementPrimaryDepartmentId=${second}` },
    );
    expect([removed.statusCode, removed.json()]).toEqual([200, { primaryDepartmentId: second }]);
    const changed = await call(manager, 'PATCH', `/api/iam/users/${user}/departments/${second}`, {
      isPrimary: false,
    });
    expect(changed.json()).toEqual({ primaryDepartmentId: null });
    const missing = await call(manager, 'PATCH', `/api/iam/users/${user}/departments/${first}`, {
      isPrimary: true,
    });
    expect([missing.statusCode, problemOf(missing).code]).toEqual([
      404,
      'IAM_MEMBERSHIP_NOT_FOUND',
    ]);
  });

  it('assigns and removes roles and keeps the last ACTIVE System Administrator', async () => {
    await postgres.sql(
      `DELETE FROM iam_user_role_assignment WHERE role_id =
         (SELECT id FROM iam_role WHERE code = 'system-administrator')`,
    );
    const admin = await administrator();
    const user = await activeUser();
    const custom = await role(['iam.users.read']);

    const assigned = await call(admin, 'POST', `/api/iam/users/${user}/roles`, {
      roleId: custom,
      reason: 'Needs the directory.',
    });
    expect([assigned.statusCode, assigned.json()]).toEqual([201, { userId: user, roleId: custom }]);
    const twice = await call(admin, 'POST', `/api/iam/users/${user}/roles`, { roleId: custom });
    expect(problemOf(twice).code).toBe('IAM_DUPLICATE_ROLE_ASSIGNMENT');
    const removed = await call(admin, 'DELETE', `/api/iam/users/${user}/roles/${custom}`);
    expect([removed.statusCode, removed.body]).toEqual([204, '']);
    const gone = await call(admin, 'DELETE', `/api/iam/users/${user}/roles/${custom}`);
    expect(problemOf(gone).code).toBe('IAM_ROLE_ASSIGNMENT_NOT_FOUND');

    const last = await call(
      admin,
      'DELETE',
      `/api/iam/users/${admin.id}/roles/${await systemRoleId()}`,
    );
    expect([last.statusCode, problemOf(last).code]).toEqual([409, 'IAM_LAST_SYSTEM_ADMIN']);
    expect(
      await value(`SELECT reason FROM audit_record WHERE action = 'iam.user.role-assigned'
         AND actor_user_id = '${admin.id}' AND result = 'SUCCEEDED'`),
    ).toBe('Needs the directory.');
  });
});

// ---------------------------------------------------------------------------------------------
// Users: directory, detail, update (spec Sections 25.3, 42, 46.5)
// ---------------------------------------------------------------------------------------------

describe('user directory and profile', () => {
  it('pages and filters the directory without security metadata or the identity mapping', async () => {
    const reader = await actor(['iam.users.read']);
    const marker = `Marker ${suffix()}`;
    const ids: string[] = [];
    for (let index = 0; index < 3; index += 1) {
      const id = await activeUser();
      await postgres.sql(
        `UPDATE iam_application_user SET display_name = '${marker}',
           identity_issuer = 'http://idp.test/realms/vertex',
           identity_subject = 'subject-${suffix()}', identity_sync_state = 'SYNCED'
           WHERE id = '${id}'`,
      );
      ids.push(id);
    }

    const first = await call(reader, 'GET', '/api/iam/users', undefined, {
      query: `search=${encodeURIComponent(marker.toLowerCase())}&pageSize=2`,
    });
    const second = await call(reader, 'GET', '/api/iam/users', undefined, {
      query: `search=${encodeURIComponent(marker)}&pageSize=2&page=2`,
    });

    const page = first.json() as { total: number; items: Record<string, unknown>[] };
    expect(page.total).toBe(3);
    const listed = [...page.items, ...(second.json() as typeof page).items].map((item) => item.id);
    expect(listed).toEqual([...ids].sort());
    expect(Object.keys(page.items[0] ?? {}).sort()).toEqual([
      'accessState',
      'departments',
      'displayName',
      'email',
      'id',
      'identitySyncState',
      'invitationDeliveryState',
      'roles',
    ]);
    const detail = await call(reader, 'GET', `/api/iam/users/${ids[0]}`);
    expect(detail.json()).toMatchObject({
      id: ids[0],
      version: 1,
      firstActivatedAt: expect.any(String),
    });
    for (const response of [first, second, detail]) {
      expect(response.body).not.toMatch(/subject-|idp\.test|identity(Issuer|Subject)|"identity"/);
    }
  });

  it('updates only the display name, refusing every other field and a stale version', async () => {
    const editor = await actor(['iam.users.update']);
    const user = await activeUser();

    for (const field of ['email', 'accessState', 'identitySubject', 'firstActivatedAt']) {
      const refused = await call(editor, 'PATCH', `/api/iam/users/${user}`, {
        expectedVersion: 1,
        displayName: 'Ada',
        [field]: 'x',
      });
      expect([refused.statusCode, problemOf(refused).fields], field).toEqual([400, [field]]);
    }
    const updated = await call(editor, 'PATCH', `/api/iam/users/${user}`, {
      expectedVersion: 1,
      displayName: '  Ada Lovelace ',
    });
    expect(updated.json()).toMatchObject({ displayName: 'Ada Lovelace', version: 2 });
    const stale = await call(editor, 'PATCH', `/api/iam/users/${user}`, {
      expectedVersion: 1,
      displayName: 'Stale',
    });
    expect(problemOf(stale).code).toBe('IAM_VERSION_CONFLICT');
    const blank = await call(editor, 'PATCH', `/api/iam/users/${user}`, {
      expectedVersion: 2,
      displayName: '   ',
    });
    expect([blank.statusCode, problemOf(blank).fields]).toEqual([400, ['displayName']]);
  });
});

// ---------------------------------------------------------------------------------------------
// User lifecycle with Keycloak unreachable (spec Sections 12, 27, 31, 32)
// ---------------------------------------------------------------------------------------------

describe('user lifecycle when Keycloak is unreachable', () => {
  it('commits local changes and reports the failed identity steps in the states', async () => {
    const admin = await administrator();
    const created = await call(admin, 'POST', '/api/iam/users', {
      email: `new-${suffix()}@example.test`,
      displayName: 'New User',
    });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({
      user: {
        accessState: 'INVITED',
        identitySyncState: 'FAILED',
        invitationDeliveryState: 'NOT_SENT',
      },
    });
    const newId = (created.json() as { user: { id: string } }).user.id;
    const conflict = await call(admin, 'POST', '/api/iam/users', {
      email: (created.json() as { user: { email: string } }).user.email.toUpperCase(),
      displayName: 'Again',
    });
    expect([conflict.statusCode, problemOf(conflict).code]).toEqual([409, 'IAM_EMAIL_CONFLICT']);

    const resend = await call(admin, 'POST', `/api/iam/users/${newId}/resend-invitation`);
    expect([resend.statusCode, problemOf(resend).code]).toEqual([
      409,
      'IAM_IDENTITY_SYNC_INCOMPLETE',
    ]);
    const sync = await call(admin, 'POST', `/api/iam/users/${newId}/sync-identity`);
    expect([sync.statusCode, problemOf(sync).code]).toEqual([503, 'IDENTITY_PROVIDER_UNAVAILABLE']);
  });

  it('suspends through the authentication sessions, then refuses reactivation without Keycloak', async () => {
    const admin = await administrator();
    const target = await activeUser();
    const targetSession = await sessionFor(target);
    const asTarget: Actor = { id: target, secret: targetSession };
    expect((await call(asTarget, 'GET', '/api/iam/me')).statusCode).toBe(200);

    const suspended = await call(admin, 'POST', `/api/iam/users/${target}/suspend`, {
      reason: 'Lost laptop.',
    });
    expect(suspended.statusCode).toBe(200);
    expect(suspended.json()).toMatchObject({
      user: { accessState: 'SUSPENDED', identitySyncState: 'FAILED' },
      sessionsRevoked: 1,
    });
    // Revoked through AuthRuntime.sessions: the session no longer exists for the API (AB-1).
    expect(
      await value(`SELECT revocation_reason FROM auth_session WHERE user_id = '${target}'`),
    ).toBe('USER_SUSPENDED');
    expect((await call(asTarget, 'GET', '/api/iam/me')).statusCode).toBe(401);

    const version = Number(
      await value(`SELECT version FROM iam_application_user WHERE id = '${target}'`),
    );
    const reactivated = await call(admin, 'POST', `/api/iam/users/${target}/reactivate`, {
      expectedVersion: version,
    });
    expect([reactivated.statusCode, problemOf(reactivated).code]).toEqual([
      503,
      'IDENTITY_PROVIDER_UNAVAILABLE',
    ]);
    const stale = await call(admin, 'POST', `/api/iam/users/${target}/reactivate`, {
      expectedVersion: 1,
    });
    expect(problemOf(stale).code).toBe('IAM_VERSION_CONFLICT');
    const again = await call(admin, 'POST', `/api/iam/users/${target}/suspend`);
    expect(problemOf(again).code).toBe('IAM_INVALID_ACCESS_TRANSITION');

    const revoked = await call(admin, 'POST', `/api/iam/users/${target}/revoke-sessions`, {});
    // The Keycloak sessions could not be ended; the application sessions were already revoked.
    expect(revoked.json()).toEqual({ sessionsRevoked: 0, providerSessions: 'FAILED' });
    const terminated = await call(admin, 'POST', `/api/iam/users/${target}/terminate`);
    expect(terminated.json()).toMatchObject({ user: { accessState: 'TERMINATED' } });
    const missing = await call(admin, 'POST', `/api/iam/users/${randomUUID()}/disable`);
    expect([missing.statusCode, problemOf(missing).code]).toEqual([404, 'IAM_USER_NOT_FOUND']);
  });

  it('refuses to reactivate a System Administrator for an actor who is not one (SEC-2)', async () => {
    const manager = await actor(['iam.users.manage-access', 'iam.users.read']);
    await administrator();
    const target = await activeUser([await systemRoleId()]);
    await postgres.sql(
      `UPDATE iam_application_user SET access_state = 'SUSPENDED', version = version + 1
         WHERE id = '${target}'`,
    );

    const refused = await call(manager, 'POST', `/api/iam/users/${target}/reactivate`, {
      expectedVersion: 2,
    });

    expect([refused.statusCode, problemOf(refused).code]).toEqual([403, 'IAM_GRANT_EXCEEDS_ACTOR']);
    expect(
      await value(
        `SELECT result || '|' || actor_user_id FROM audit_record
           WHERE target_id = '${target}' AND action = 'iam.user.reactivated'`,
      ),
    ).toBe(`REFUSED|${manager.id}`);
    expect(
      await value(
        `SELECT access_state || '|' || version FROM iam_application_user WHERE id = '${target}'`,
      ),
    ).toBe('SUSPENDED|2');
  });
});

// ---------------------------------------------------------------------------------------------
// The remaining operations and refusals (spec Section 46.5 items 1, 4 and 5)
// ---------------------------------------------------------------------------------------------

describe('every operation and refusal', () => {
  it('lists, renames, deactivates and activates roles, refusing a ceiling breach and unknown roles', async () => {
    const admin = await administrator();
    const code = `lister-${suffix()}`;
    const created = await call(admin, 'POST', '/api/iam/roles', { code, name: 'Lister' });
    const roleId = (created.json() as { id: string }).id;
    await call(admin, 'PUT', `/api/iam/roles/${roleId}/permissions`, {
      expectedVersion: 1,
      permissionCodes: ['iam.sessions.revoke'],
    });

    const listed = await call(admin, 'GET', '/api/iam/roles', undefined, {
      query: `search=${code}&state=ACTIVE`,
    });
    expect([listed.statusCode, listed.json()]).toEqual([
      200,
      {
        items: [
          {
            id: roleId,
            code,
            name: 'Lister',
            description: null,
            state: 'ACTIVE',
            isSystem: false,
            version: 2,
          },
        ],
        page: 1,
        pageSize: 25,
        total: 1,
      },
    ]);
    const renamed = await call(admin, 'PATCH', `/api/iam/roles/${roleId}`, {
      expectedVersion: 2,
      description: 'Lists things.',
    });
    expect([renamed.statusCode, renamed.json()]).toEqual([
      200,
      expect.objectContaining({ description: 'Lists things.', version: 3 }),
    ]);
    const deactivated = await call(admin, 'POST', `/api/iam/roles/${roleId}/deactivate`, {
      expectedVersion: 3,
      reason: 'Paused.',
    });
    expect([deactivated.statusCode, deactivated.json()]).toEqual([
      200,
      expect.objectContaining({ state: 'INACTIVE', version: 4 }),
    ]);

    // Activating a role that maps a permission the actor lacks is a grant (spec Section 23.1).
    const manager = await actor(['iam.roles.manage']);
    const refused = await call(manager, 'POST', `/api/iam/roles/${roleId}/activate`, {
      expectedVersion: 4,
    });
    expect([refused.statusCode, problemOf(refused).code]).toEqual([403, 'IAM_GRANT_EXCEEDS_ACTOR']);
    const activated = await call(admin, 'POST', `/api/iam/roles/${roleId}/activate`, {
      expectedVersion: 4,
    });
    expect([activated.statusCode, activated.json()]).toEqual([
      200,
      expect.objectContaining({ state: 'ACTIVE', version: 5 }),
    ]);

    for (const [method, url] of [
      ['GET', `/api/iam/roles/${randomUUID()}`],
      ['POST', `/api/iam/users/${await activeUser()}/roles`],
    ] as const) {
      const missing = await call(
        admin,
        method,
        url,
        method === 'GET' ? undefined : { roleId: randomUUID() },
      );
      expect([missing.statusCode, problemOf(missing).code], url).toEqual([
        404,
        'IAM_ROLE_NOT_FOUND',
      ]);
    }
  });

  it('refuses inactive roles and departments, and permissions that are not assignable', async () => {
    const admin = await administrator();
    const user = await activeUser();
    const inactiveRole = await role([], 'INACTIVE');
    const inactiveDepartment = await department('INACTIVE');
    const deprecated = 'iam.legacy.read';
    await postgres.sql(
      `INSERT INTO iam_permission (code, owning_module, name, description, state, sensitivity)
         VALUES ('${deprecated}', 'iam', 'Legacy', 'Legacy', 'DEPRECATED', 'STANDARD')`,
    );

    const answers = [
      await call(admin, 'POST', `/api/iam/users/${user}/roles`, { roleId: inactiveRole }),
      await call(admin, 'POST', `/api/iam/users/${user}/departments`, {
        departmentId: inactiveDepartment,
        isPrimary: false,
      }),
      await call(admin, 'POST', '/api/iam/users', {
        email: `x-${suffix()}@example.test`,
        displayName: 'X',
        roleIds: [inactiveRole],
      }),
      await call(admin, 'POST', '/api/iam/users', {
        email: `x-${suffix()}@example.test`,
        displayName: 'X',
        memberships: [{ departmentId: inactiveDepartment, isPrimary: true }],
      }),
      await call(admin, 'PUT', `/api/iam/roles/${await role([])}/permissions`, {
        expectedVersion: 1,
        permissionCodes: [deprecated],
      }),
    ];

    expect(answers.map((answer) => [answer.statusCode, problemOf(answer).code])).toEqual([
      [409, 'IAM_ROLE_INACTIVE'],
      [409, 'IAM_DEPARTMENT_INACTIVE'],
      [409, 'IAM_ROLE_INACTIVE'],
      [409, 'IAM_DEPARTMENT_INACTIVE'],
      [409, 'IAM_PERMISSION_NOT_ASSIGNABLE'],
    ]);
  });

  it('pages the permission catalog by code with a state filter', async () => {
    const reader = await actor(['iam.permissions.read']);
    const active = Number(
      await value(`SELECT count(*) FROM iam_permission WHERE state = 'ACTIVE'`),
    );

    const first = await call(reader, 'GET', '/api/iam/permissions', undefined, {
      query: 'state=ACTIVE&pageSize=5',
    });
    const last = await call(reader, 'GET', '/api/iam/permissions', undefined, {
      query: `state=ACTIVE&pageSize=5&page=${Math.ceil(active / 5)}`,
    });

    const page = first.json() as { items: { code: string }[]; total: number };
    expect([first.statusCode, page.total, page.items.length]).toEqual([200, active, 5]);
    expect(page.items.map((item) => item.code)).toEqual(
      [...page.items.map((item) => item.code)].sort(),
    );
    expect(page.items[0]).toEqual({
      code: expect.stringMatching(/^iam\./),
      owningModule: 'iam',
      name: expect.any(String),
      description: expect.any(String),
      state: 'ACTIVE',
      sensitivity: expect.stringMatching(/^(STANDARD|SENSITIVE|PRIVILEGED)$/),
    });
    expect((last.json() as { items: unknown[] }).items).toHaveLength(
      active - 5 * (Math.ceil(active / 5) - 1),
    );
  });

  it('disables a user and revokes a live session, whose next request is refused', async () => {
    const admin = await administrator();
    for (const operation of ['disable', 'revoke-sessions'] as const) {
      const target = await activeUser();
      const asTarget: Actor = { id: target, secret: await sessionFor(target) };
      expect((await call(asTarget, 'GET', '/api/iam/me')).statusCode).toBe(200);

      const answer = await call(admin, 'POST', `/api/iam/users/${target}/${operation}`, {});

      expect(answer.statusCode, operation).toBe(200);
      expect(answer.json(), operation).toMatchObject({ sessionsRevoked: 1 });
      expect((await call(asTarget, 'GET', '/api/iam/me')).statusCode, operation).toBe(401);
      expect(
        await value(`SELECT revocation_reason FROM auth_session WHERE user_id = '${target}'`),
      ).toBe(operation === 'disable' ? 'USER_DISABLED' : 'ADMINISTRATOR_REVOKED');
    }
  });
});

// ---------------------------------------------------------------------------------------------
// Accountability and contention (IAM-R07 D-07, D-15)
// ---------------------------------------------------------------------------------------------

describe('accountability and contention', () => {
  it('attributes every record written by a session user request to that user (SEC-1)', async () => {
    const admin = await administrator();
    const user = await activeUser();
    const custom = await role([]);
    const dept = await department();
    let requests = 0;
    for (const [status, request] of [
      [
        200,
        () =>
          call(admin, 'PATCH', `/api/iam/users/${user}`, {
            expectedVersion: 1,
            displayName: 'Bea',
          }),
      ],
      [
        201,
        () =>
          call(admin, 'POST', `/api/iam/users/${user}/departments`, {
            departmentId: dept,
            isPrimary: true,
          }),
      ],
      [
        200,
        () =>
          call(admin, 'PATCH', `/api/iam/users/${user}/departments/${dept}`, { isPrimary: false }),
      ],
      [201, () => call(admin, 'POST', `/api/iam/users/${user}/roles`, { roleId: custom })],
      [204, () => call(admin, 'DELETE', `/api/iam/users/${user}/roles/${custom}`)],
      [
        200,
        () =>
          call(admin, 'PUT', `/api/iam/roles/${custom}/permissions`, {
            expectedVersion: 1,
            permissionCodes: ['iam.users.read'],
          }),
      ],
      [
        200,
        () =>
          call(admin, 'POST', `/api/iam/roles/${custom}/deactivate`, {
            expectedVersion: 2,
            reason: 'Unused.',
          }),
      ],
      [200, () => call(admin, 'POST', `/api/iam/roles/${custom}/activate`, { expectedVersion: 3 })],
      [
        200,
        () =>
          call(admin, 'PATCH', `/api/iam/roles/${custom}`, { expectedVersion: 4, name: 'Renamed' }),
      ],
      [201, () => call(admin, 'POST', '/api/iam/roles', { code: `sec-${suffix()}`, name: 'R' })],
      [
        201,
        () => call(admin, 'POST', '/api/iam/departments', { code: `a-${suffix()}`, name: 'A' }),
      ],
      [
        200,
        () =>
          call(admin, 'POST', `/api/iam/departments/${dept}/deactivate`, { expectedVersion: 1 }),
      ],
      [
        200,
        () => call(admin, 'POST', `/api/iam/departments/${dept}/activate`, { expectedVersion: 2 }),
      ],
      [
        200,
        () =>
          call(admin, 'PATCH', `/api/iam/departments/${dept}`, { expectedVersion: 3, name: 'B' }),
      ],
      [200, () => call(admin, 'DELETE', `/api/iam/users/${user}/departments/${dept}`)],
      [
        201,
        () =>
          call(admin, 'POST', '/api/iam/users', {
            email: `sec-${suffix()}@example.test`,
            displayName: 'New',
          }),
      ],
      [
        200,
        () => call(admin, 'POST', `/api/iam/users/${user}/revoke-sessions`, { reason: 'Check.' }),
      ],
      [200, () => call(admin, 'POST', `/api/iam/users/${user}/suspend`, { reason: 'Leave.' })],
      [
        503,
        async () =>
          call(admin, 'POST', `/api/iam/users/${user}/reactivate`, {
            expectedVersion: Number(
              await value(`SELECT version FROM iam_application_user WHERE id = '${user}'`),
            ),
          }),
      ],
      [503, () => call(admin, 'POST', `/api/iam/users/${user}/sync-identity`)],
      [200, () => call(admin, 'POST', `/api/iam/users/${user}/disable`)],
      [200, () => call(admin, 'POST', `/api/iam/users/${user}/terminate`)],
    ] as const) {
      const response = await request();
      expect(response.statusCode, response.body).toBe(status);
      requests += 1;
    }

    const traces = (unsafeRequests.get(admin.id) ?? []).map((id) => `'${id}'`).join(', ');
    const actors = await rows(
      `SELECT DISTINCT actor_type || '|' || coalesce(actor_user_id::text, actor_process)
         FROM audit_record WHERE trace_id IN (${traces})`,
    );
    expect(actors).toEqual([`USER|${admin.id}`]);
    // Every one of those requests left evidence under its own trace.
    expect(
      Number(
        await value(
          `SELECT count(DISTINCT trace_id) FROM audit_record WHERE trace_id IN (${traces})`,
        ),
      ),
    ).toBe(requests);
  });

  it('answers a lock wait beyond the statement bound with 503 SERVICE_BUSY', async () => {
    const editor = await actor(['iam.users.update']);
    const user = await activeUser();
    const marker = `hold_${suffix()}`;
    const holding = postgres.sql(
      `BEGIN; SELECT id FROM iam_application_user WHERE id = '${user}' FOR UPDATE;
         SELECT pg_sleep(7) AS ${marker}; COMMIT;`,
    );
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const sleeping = await value(
        `SELECT count(*) FROM pg_stat_activity WHERE query LIKE '%AS ${marker}%'
           AND wait_event = 'PgSleep'`,
      );
      if (sleeping === '1') break;
      if (attempt === 99) throw new Error('the lock-holding transaction never started sleeping');
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    const response = await call(editor, 'PATCH', `/api/iam/users/${user}`, {
      expectedVersion: 1,
      displayName: 'Busy',
    });
    await holding;

    expect(response.statusCode).toBe(503);
    expect(response.headers['retry-after']).toBe('1');
    expect(problemOf(response).code).toBe('SERVICE_BUSY');
    expect(await value(`SELECT display_name FROM iam_application_user WHERE id = '${user}'`)).toBe(
      'Synthetic User',
    );
  }, 20_000);
});
