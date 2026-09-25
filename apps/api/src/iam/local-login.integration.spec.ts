import { randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { parseSystemProcess, parseTraceId } from '@vertex-os/audit';
import { createDatabaseClient, type DatabaseClient } from '@vertex-os/database';
import { iamPermissionManifest } from '@vertex-os/iam';
import { synchronizeIamReferenceData } from '@vertex-os/iam/composition';
import {
  createIamTransactionRunner,
  findSystemAdministratorRoleId,
} from '@vertex-os/iam-persistence';
import { createAuditRecorder } from '@vertex-os/audit-persistence';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startMigratedPostgres, type MigratedPostgres } from '../../test-support/postgres.js';
import { testAuthConfig } from '../../test-support/auth-config.js';
import { testProvisioningConfig } from '../../test-support/provisioning-config.js';
import { createApp } from '../app.factory.js';
import { hashPassword } from '../auth/passwords.js';
import { loadAppConfig } from '../config/app-config.js';
import { createIamBootstrap, createIamUserAdministration } from './user-administration.js';

const EMAIL = 'staff@example.invalid';
const PASSWORD = 'a very long test passphrase 5QG!';
const ADMIN_EMAIL = 'admin@example.invalid';
const ADMIN_PASSWORD = 'another long administrator password 7!';

describe('local password sign-in', () => {
  let postgres: MigratedPostgres;
  let database: DatabaseClient;
  let app: NestFastifyApplication;
  const logs: string[] = [];

  beforeAll(async () => {
    postgres = await startMigratedPostgres();
    database = createDatabaseClient({ connectionString: postgres.url });
    const referenceTrace = parseTraceId('local-auth-reference-sync');
    if (!referenceTrace.ok) throw new Error('Invalid reference trace.');
    const synchronized = await synchronizeIamReferenceData(
      { runner: createIamTransactionRunner(database, { auditRecorderFor: createAuditRecorder }) },
      { manifests: [iamPermissionManifest], traceId: referenceTrace.value },
    );
    if (synchronized.outcome !== 'synchronized')
      throw new Error('Reference synchronization failed.');
    const process = parseSystemProcess('iam.local-test');
    const trace = parseTraceId(randomUUID());
    if (!process.ok || !trace.ok) throw new Error('Invalid test attribution.');
    const users = createIamUserAdministration(testProvisioningConfig(), database, {
      revokeUserSessions: async () => 0,
    });
    const created = await users.createUser(
      { email: EMAIL, password: PASSWORD },
      { actor: { type: 'SYSTEM', process: process.value }, traceId: trace.value },
    );
    expect(created.outcome).toBe('created');
    const administratorRoleId = await findSystemAdministratorRoleId(database);
    if (!administratorRoleId) throw new Error('Administrator role was not synchronized.');
    const administrator = await users.createUser(
      { email: ADMIN_EMAIL, password: ADMIN_PASSWORD, roleIds: [administratorRoleId] },
      { actor: { type: 'SYSTEM', process: process.value }, traceId: trace.value },
    );
    expect(administrator.outcome).toBe('created');
    app = await createApp(
      loadAppConfig({ NODE_ENV: 'test', DATABASE_URL: postgres.url }),
      testAuthConfig(),
      testProvisioningConfig(),
      { logStream: { write: (line: string) => logs.push(line) } },
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
    expect(logs.join('')).not.toContain(PASSWORD);
  });

  it('rejects unknown users and incorrect passwords with the same response', async () => {
    const attempt = (email: string, password: string) =>
      app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { email, password },
      });
    const wrong = await attempt(EMAIL, 'a different long test password');
    const unknown = await attempt('unknown@example.invalid', PASSWORD);
    expect(wrong.statusCode).toBe(401);
    expect(unknown.statusCode).toBe(401);
    expect(wrong.json().code).toBe('AUTH_LOGIN_FAILED');
    expect(unknown.json().code).toBe('AUTH_LOGIN_FAILED');
  });

  it('activates an invited account, issues a session, protects writes and logs out', async () => {
    const signedIn = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: EMAIL, password: PASSWORD },
    });
    expect(signedIn.statusCode).toBe(200);
    const cookie = String(signedIn.headers['set-cookie']).match(/__Host-vertex-session=[^;]+/)?.[0];
    expect(cookie).toBeDefined();
    const session = await app.inject({
      method: 'GET',
      url: '/api/auth/session',
      headers: { cookie },
    });
    expect(session.statusCode).toBe(200);
    expect(session.json().user.email).toBe(EMAIL);
    const csrf = await app.inject({ method: 'GET', url: '/api/auth/csrf', headers: { cookie } });
    expect(csrf.statusCode).toBe(200);
    const noCsrf = await app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: { cookie },
    });
    expect(noCsrf.statusCode).toBe(403);
    const logout = await app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: { cookie, 'x-csrf-token': csrf.json().token },
    });
    expect(logout.statusCode).toBe(200);
    const ended = await app.inject({
      method: 'GET',
      url: '/api/auth/session',
      headers: { cookie },
    });
    expect(ended.statusCode).toBe(401);
  });

  it('lets the administrator add an employee with a password and selected role', async () => {
    const signedIn = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
    });
    expect(signedIn.statusCode).toBe(200);
    const cookie = String(signedIn.headers['set-cookie']).match(/__Host-vertex-session=[^;]+/)?.[0];
    expect(cookie).toBeDefined();
    const csrf = await app.inject({ method: 'GET', url: '/api/auth/csrf', headers: { cookie } });
    expect(csrf.statusCode).toBe(200);
    const roles = await app.inject({ method: 'GET', url: '/api/iam/roles', headers: { cookie } });
    expect(roles.statusCode).toBe(200);
    const roleId = (roles.json().items as { id: string; code: string }[]).find(
      (role) => role.code === 'system-administrator',
    )?.id;
    expect(roleId).toBeDefined();
    const created = await app.inject({
      method: 'POST',
      url: '/api/iam/users',
      headers: { cookie, 'x-csrf-token': csrf.json().token },
      payload: {
        email: 'new-employee@example.invalid',
        password: 'employee passphrase long enough 9!',
        roleIds: [roleId],
      },
    });
    expect(created.statusCode).toBe(201);
    const employee = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: {
        email: 'new-employee@example.invalid',
        password: 'employee passphrase long enough 9!',
      },
    });
    expect(employee.statusCode).toBe(200);
    expect(employee.json().user.email).toBe('new-employee@example.invalid');
  });

  it('initializes a migrated account password once, with admin authorization and audit', async () => {
    const process = parseSystemProcess('iam.local-test');
    const trace = parseTraceId(randomUUID());
    if (!process.ok || !trace.ok) throw new Error('Invalid test attribution');
    const users = createIamUserAdministration(testProvisioningConfig(), database, {
      revokeUserSessions: async () => 0,
    });
    const legacy = await users.createUser(
      { email: 'legacy@example.invalid' },
      { actor: { type: 'SYSTEM', process: process.value }, traceId: trace.value },
    );
    if (legacy.outcome !== 'created') throw new Error('Legacy user could not be created');
    const before = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'legacy@example.invalid', password: 'legacy password long enough 8!' },
    });
    expect(before.statusCode).toBe(401);
    const admin = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
    });
    expect(admin.statusCode).toBe(200);
    const cookie = String(admin.headers['set-cookie']).match(/__Host-vertex-session=[^;]+/)?.[0];
    const csrf = await app.inject({ method: 'GET', url: '/api/auth/csrf', headers: { cookie } });
    const route = `/api/iam/users/${legacy.user.id}/password`;
    const input = {
      expectedVersion: legacy.user.version,
      password: 'legacy password long enough 8!',
    };
    const missingCsrf = await app.inject({
      method: 'POST',
      url: route,
      headers: { cookie },
      payload: input,
    });
    expect(missingCsrf.statusCode).toBe(403);
    const initialized = await app.inject({
      method: 'POST',
      url: route,
      headers: { cookie, 'x-csrf-token': csrf.json().token },
      payload: input,
    });
    expect(initialized.statusCode).toBe(200);
    const repeated = await app.inject({
      method: 'POST',
      url: route,
      headers: { cookie, 'x-csrf-token': csrf.json().token },
      payload: { ...input, expectedVersion: legacy.user.version + 1 },
    });
    expect(repeated.statusCode).toBe(409);
    expect(repeated.json().code).toBe('IAM_PASSWORD_ALREADY_CONFIGURED');
    const after = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'legacy@example.invalid', password: input.password },
    });
    expect(after.statusCode).toBe(200);
    expect(logs.join('')).not.toContain(input.password);
  });

  it('refuses another bootstrap when an active administrator exists', async () => {
    const trace = parseTraceId(randomUUID());
    if (!trace.ok) throw new Error('Invalid trace');
    const bootstrap = createIamBootstrap(testProvisioningConfig(), database, {
      revokeUserSessions: async () => 0,
    });
    const result = await bootstrap({
      mode: 'normal',
      email: 'second-admin@example.invalid',
      displayName: 'Second Admin',
      passwordHash: await hashPassword('second admin password 9!'),
      manifests: [iamPermissionManifest],
      traceId: trace.value,
    });
    expect(result).toEqual({ outcome: 'refused', reason: 'active-administrator-exists' });
  });
});
