import { randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { parseSystemProcess, parseTraceId, type AuditAttribution } from '@vertex-os/audit';
import { createAuditRecorder } from '@vertex-os/audit-persistence';
import { createDatabaseClient, type DatabaseClient } from '@vertex-os/database';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { TEST_AUTH_ENVIRONMENT, testAuthConfig } from '../../test-support/auth-config.js';
import { startMigratedPostgres, type MigratedPostgres } from '../../test-support/postgres.js';
import { createProbeApp, PROBE_PERMISSION } from '../../test-support/probe-app.js';
import { loadAppConfig } from '../config/app-config.js';
import { csrfTokenFor } from './secrets.js';
import { createSessionStore } from './session-store.js';
import { createSessionService } from './sessions.js';
import { createTokenCiphers } from './token-cipher.js';
import { seedInvitedUser } from '../../test-support/iam-users.js';

/**
 * The authorization context over HTTP against real PostgreSQL (IAM-R04 Done means 3 to 8): the
 * access guard, the bound IAM capability, the one-statement reader and the Audit adapter, with
 * sessions created directly (sign-in itself is proven by auth-flow and the Keycloak journeys).
 */
describe('authorization context against PostgreSQL', () => {
  let postgres: MigratedPostgres;
  let database: DatabaseClient;
  let app: NestFastifyApplication;

  beforeAll(async () => {
    postgres = await startMigratedPostgres();
    database = createDatabaseClient({ connectionString: postgres.url });
    app = await createProbeApp(
      loadAppConfig({ NODE_ENV: 'test', LOG_LEVEL: 'info', DATABASE_URL: postgres.url }),
      testAuthConfig(),
      { logStream: { write: () => undefined } },
    );
  }, 180_000);

  afterAll(async () => {
    try {
      await app?.close();
      await database?.disconnect();
    } finally {
      await postgres?.stop();
    }
  });

  beforeEach(async () => {
    await postgres.sql(
      `TRUNCATE auth_session, auth_login_attempt, audit_record, iam_application_user,
         iam_department, iam_role, iam_permission CASCADE`,
    );
  });

  function attribution(): AuditAttribution {
    const process = parseSystemProcess('iam.authorization-test');
    const traceId = parseTraceId('trace-authorization-test');
    if (!process.ok || !traceId.ok) throw new Error('attribution fixture');
    return { actor: { type: 'SYSTEM', process: process.value }, traceId: traceId.value };
  }

  /** An ACTIVE user with a live session; returns the cookie secret. */
  async function signedInUser(): Promise<{ id: string; secret: string }> {
    const created = {
      user: { id: await seedInvitedUser(postgres, `${randomUUID()}@example.invalid`) },
    };
    const id = created.user.id;
    await postgres.sql(
      `UPDATE iam_application_user SET access_state = 'ACTIVE', first_activated_at = now(),
         identity_issuer = 'http://127.0.0.1:1/realms/vertex', identity_subject = '${randomUUID()}',
         identity_sync_state = 'SYNCED' WHERE id = '${id}'`,
    );
    const config = testAuthConfig();
    const sessions = createSessionService({
      store: createSessionStore(database, { auditRecorderFor: createAuditRecorder }),
      ciphers: createTokenCiphers(TEST_AUTH_ENVIRONMENT.AUTH_TOKEN_ENCRYPTION_SECRET),
      provider: { refreshSession: async () => ({ ok: false, failure: 'unavailable' }) },
      limits: config.session,
      clientId: config.oidc.clientId,
    });
    const { secret } = await sessions.establish({
      userId: id,
      idpSessionId: undefined,
      idToken: undefined,
      refreshToken: undefined,
      attribution: attribution(),
    });
    return { id, secret };
  }

  async function permission(code: string, state = 'ACTIVE'): Promise<void> {
    await postgres.sql(
      `INSERT INTO iam_permission (code, owning_module, name, description, state, sensitivity)
         VALUES ('${code}', 'iam', '${code}', '${code}', '${state}', 'STANDARD')`,
    );
  }

  async function role(code: string, permissions: string[], state = 'ACTIVE'): Promise<string> {
    const id = firstLine(
      await postgres.sql(
        `INSERT INTO iam_role (code, name, state, is_system)
           VALUES ('${code}', '${code}', '${state}', false) RETURNING id`,
      ),
    );
    for (const granted of permissions) {
      await postgres.sql(
        `INSERT INTO iam_role_permission (role_id, permission_code) VALUES ('${id}', '${granted}')`,
      );
    }
    return id;
  }

  async function assign(userId: string, roleId: string): Promise<void> {
    await postgres.sql(
      `INSERT INTO iam_user_role_assignment (user_id, role_id) VALUES ('${userId}', '${roleId}')`,
    );
  }

  async function department(code: string, state = 'ACTIVE'): Promise<string> {
    return firstLine(
      await postgres.sql(
        `INSERT INTO iam_department (code, name, state) VALUES ('${code}', '${code}', '${state}')
           RETURNING id`,
      ),
    );
  }

  /** psql prints the returned value, then the command tag. */
  function firstLine(output: string): string {
    const line = output.split('\n')[0];
    if (!line) throw new Error('psql returned nothing');
    return line;
  }

  const cookie = (secret: string) => `__Host-vertex-session=${secret}`;
  const read = (secret: string, url = '/api/probe/guarded') =>
    app.inject({ method: 'GET', url, headers: { cookie: cookie(secret) } });

  async function deniedRecords(): Promise<string[]> {
    const output = await postgres.sql(
      `SELECT actor_user_id || ' ' || target_type || ' ' || target_id || ' ' || result
         FROM audit_record WHERE action = 'iam.authorization.denied' ORDER BY occurred_at`,
    );
    return output === '' ? [] : output.split('\n');
  }

  it('lets a held permission through and returns only the contract fields', async () => {
    const user = await signedInUser();
    await permission(PROBE_PERMISSION);
    await assign(user.id, await role('viewer', [PROBE_PERMISSION]));
    const sales = await department('sales');
    await postgres.sql(
      `INSERT INTO iam_department_membership (user_id, department_id, is_primary)
         VALUES ('${user.id}', '${sales}', true)`,
    );

    const response = await read(user.secret);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      userId: user.id,
      accessState: 'ACTIVE',
      primaryDepartmentId: sales,
      departmentIds: [sales],
      permissionCodes: [PROBE_PERMISSION],
    });
    expect(await deniedRecords()).toEqual([]);
  });

  it('denies a missing permission with AUTHORIZATION_DENIED and one Audit record', async () => {
    const user = await signedInUser();
    await permission('iam.roles.read');
    await assign(user.id, await role('other', ['iam.roles.read']));

    const response = await read(user.secret);
    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: 'AUTHORIZATION_DENIED' });
    expect(await deniedRecords()).toEqual([
      `${user.id} iam.permission ${PROBE_PERMISSION} REFUSED`,
    ]);

    // A user without any role reaches routes that need no permission, never guarded ones.
    const bare = await signedInUser();
    expect((await read(bare.secret, '/api/probe/actor')).json()).toMatchObject({
      permissionCodes: [],
      departmentIds: [],
    });
    expect((await read(bare.secret)).statusCode).toBe(403);
  });

  it('reflects each privilege removal on the next request of the same session', async () => {
    const user = await signedInUser();
    await permission(PROBE_PERMISSION);
    const viewer = await role('viewer', [PROBE_PERMISSION]);
    await assign(user.id, viewer);
    const allowed = async () => expect((await read(user.secret)).statusCode).toBe(200);
    const denied = async () => expect((await read(user.secret)).statusCode).toBe(403);

    const removals: Array<[string, string]> = [
      [
        `DELETE FROM iam_role_permission WHERE role_id = '${viewer}'`,
        `INSERT INTO iam_role_permission (role_id, permission_code) VALUES ('${viewer}', '${PROBE_PERMISSION}')`,
      ],
      [
        `UPDATE iam_role SET state = 'INACTIVE' WHERE id = '${viewer}'`,
        `UPDATE iam_role SET state = 'ACTIVE' WHERE id = '${viewer}'`,
      ],
      [
        `UPDATE iam_permission SET state = 'DEPRECATED' WHERE code = '${PROBE_PERMISSION}'`,
        `UPDATE iam_permission SET state = 'ACTIVE' WHERE code = '${PROBE_PERMISSION}'`,
      ],
      [
        `DELETE FROM iam_user_role_assignment WHERE user_id = '${user.id}'`,
        `INSERT INTO iam_user_role_assignment (user_id, role_id) VALUES ('${user.id}', '${viewer}')`,
      ],
      [`UPDATE iam_permission SET state = 'RETIRED' WHERE code = '${PROBE_PERMISSION}'`, ''],
    ];
    for (const [remove, restore] of removals) {
      await allowed();
      await postgres.sql(remove);
      await denied();
      if (restore !== '') await postgres.sql(restore);
    }
    expect(await deniedRecords()).toHaveLength(removals.length);
  });

  it('ends the session of a user suspended while it is in use', async () => {
    const user = await signedInUser();
    await permission(PROBE_PERMISSION);
    await assign(user.id, await role('viewer', [PROBE_PERMISSION]));
    expect((await read(user.secret)).statusCode).toBe(200);

    await postgres.sql(
      `UPDATE iam_application_user SET access_state = 'SUSPENDED' WHERE id = '${user.id}'`,
    );
    const suspended = await read(user.secret);
    expect(suspended.statusCode).toBe(403);
    expect(suspended.json()).toMatchObject({ code: 'IAM_USER_INACTIVE' });
    expect(suspended.headers['set-cookie']).toContain('__Host-vertex-session=; Path=/; Max-Age=0');

    // Reactivating the user does not bring the revoked session back.
    await postgres.sql(
      `UPDATE iam_application_user SET access_state = 'ACTIVE' WHERE id = '${user.id}'`,
    );
    const after = await read(user.secret);
    expect(after.statusCode).toBe(401);
    expect(after.json()).toMatchObject({ code: 'AUTH_SESSION_INVALID' });
    // Inactive users are refused before any permission check: no denial is recorded.
    expect(await deniedRecords()).toEqual([]);
  });

  it('keeps inactive departments out of the context and never replaces the primary', async () => {
    const user = await signedInUser();
    const archive = await department('archive', 'INACTIVE');
    const studio = await department('studio');
    await postgres.sql(
      `INSERT INTO iam_department_membership (user_id, department_id, is_primary)
         VALUES ('${user.id}', '${archive}', true), ('${user.id}', '${studio}', false)`,
    );
    const body = (await read(user.secret, '/api/probe/actor')).json() as Record<string, unknown>;
    expect(body['departmentIds']).toEqual([studio]);
    expect(body).not.toHaveProperty('primaryDepartmentId');
  });

  it('requires the CSRF token on an unsafe permission-protected route', async () => {
    const user = await signedInUser();
    await permission(PROBE_PERMISSION);
    await assign(user.id, await role('viewer', [PROBE_PERMISSION]));
    const post = (headers: Record<string, string>) =>
      app.inject({
        method: 'POST',
        url: '/api/probe/guarded',
        headers: { cookie: cookie(user.secret), ...headers },
      });

    const missing = await post({});
    expect(missing.statusCode).toBe(403);
    expect(missing.json()).toMatchObject({ code: 'CSRF_VALIDATION_FAILED' });
    expect((await post({ 'x-csrf-token': csrfTokenFor(user.secret) })).statusCode).toBe(200);
  });
});
