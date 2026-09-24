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
import { startKeycloak, type StartedKeycloak } from '../../../test-support/keycloak.js';
import { startMigratedPostgres, type MigratedPostgres } from '../../../test-support/postgres.js';
import { testProvisioningConfig } from '../../../test-support/provisioning-config.js';
import { createApp } from '../../app.factory.js';
import { csrfTokenFor } from '../../auth/secrets.js';
import { createSessionStore } from '../../auth/session-store.js';
import { createSessionService } from '../../auth/sessions.js';
import { createTokenCiphers } from '../../auth/token-cipher.js';
import { loadAppConfig } from '../../config/app-config.js';

/**
 * The user routes whose success needs Keycloak (IAM-R07 Done means 1 to 3, 9): creation with
 * provisioning and invitation, resend, sync-identity, suspension, reactivation to the derived
 * state and the revoke-sessions action, against PostgreSQL and the pinned Keycloak with its mail
 * sink. Failure paths without Keycloak are in `iam-http.integration.spec.ts`.
 */

let postgres: MigratedPostgres;
let keycloak: StartedKeycloak;
let database: DatabaseClient;
let app: NestFastifyApplication;
let admin: { id: string; secret: string };

beforeAll(async () => {
  [postgres, keycloak] = await Promise.all([startMigratedPostgres(), startKeycloak()]);
  database = createDatabaseClient({ connectionString: postgres.url });
  const traceId = parseTraceId('trace-iam-http-keycloak-sync');
  if (!traceId.ok) throw new Error('trace fixture');
  const synced = await synchronizeIamReferenceData(
    { runner: createIamTransactionRunner(database, { auditRecorderFor: createAuditRecorder }) },
    { manifests: [iamPermissionManifest], traceId: traceId.value },
  );
  if (synced.outcome !== 'synchronized') throw new Error('reference synchronization');
  app = await createApp(
    loadAppConfig({ NODE_ENV: 'test', LOG_LEVEL: 'info', DATABASE_URL: postgres.url }),
    testAuthConfig(),
    testProvisioningConfig({
      KEYCLOAK_ISSUER_URL: keycloak.issuer,
      KEYCLOAK_PROVISIONER_CLIENT_SECRET: keycloak.secrets.provisionerClient,
    }),
    { logStream: { write: () => undefined } },
  );
  await app.init();
  await app.getHttpAdapter().getInstance().ready();

  const id = await seedInvitedUser(
    postgres,
    `admin-${randomBytes(4).toString('hex')}@example.test`,
  );
  await postgres.sql(
    `UPDATE iam_application_user SET access_state = 'ACTIVE', first_activated_at = now(),
       identity_issuer = 'http://idp.test/realms/vertex', identity_subject = gen_random_uuid()::text,
       identity_sync_state = 'SYNCED', invitation_delivery_state = 'SENT',
       invitation_sent_at = now() WHERE id = '${id}'`,
  );
  await postgres.sql(
    `INSERT INTO iam_user_role_assignment (user_id, role_id)
       SELECT '${id}', id FROM iam_role WHERE code = 'system-administrator'`,
  );
  admin = { id, secret: await sessionFor(id) };
}, 300_000);

afterAll(async () => {
  try {
    await app?.close();
    await database?.disconnect();
  } finally {
    await Promise.all([postgres?.stop(), keycloak?.stop()]);
  }
});

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

function post(url: string, body?: unknown) {
  return app.inject({
    method: 'POST',
    url,
    headers: {
      cookie: `__Host-vertex-session=${admin.secret}`,
      'x-csrf-token': csrfTokenFor(admin.secret),
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    ...(body === undefined ? {} : { payload: JSON.stringify(body) }),
  });
}

async function identityEnabled(userId: string): Promise<boolean> {
  const subject = (
    await postgres.sql(`SELECT identity_subject FROM iam_application_user WHERE id = '${userId}'`)
  ).split('\n')[0];
  const response = await keycloak.admin(`/users/${subject}`);
  return ((await response.json()) as { enabled: boolean }).enabled;
}

describe('user routes against the pinned Keycloak', () => {
  it('creates, invites, re-invites, restricts, reactivates and revokes over HTTP', async () => {
    const email = `invited-${randomBytes(4).toString('hex')}@example.test`;

    const created = await post('/api/iam/users', { email, displayName: 'Invited User' });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({
      user: {
        email,
        accessState: 'INVITED',
        identitySyncState: 'SYNCED',
        invitationDeliveryState: 'SENT',
        invitationSentAt: expect.any(String),
      },
    });
    expect(created.body).not.toMatch(/identity(Issuer|Subject)|"identity"/);
    const userId = (created.json() as { user: { id: string } }).user.id;
    expect(await keycloak.mail.waitFor(email)).toBeDefined();

    const resent = await post(`/api/iam/users/${userId}/resend-invitation`);
    expect([resent.statusCode, (resent.json() as { invitation: string }).invitation]).toEqual([
      200,
      'SENT',
    ]);
    const synced = await post(`/api/iam/users/${userId}/sync-identity`);
    expect(synced.json()).toMatchObject({
      user: { identitySyncState: 'SYNCED' },
      invitation: 'NOT_APPLICABLE',
    });

    const suspended = await post(`/api/iam/users/${userId}/suspend`, { reason: 'Review.' });
    expect(suspended.json()).toMatchObject({
      user: { accessState: 'SUSPENDED', identitySyncState: 'SYNCED' },
      sessionsRevoked: 0,
    });
    expect(await identityEnabled(userId)).toBe(false);

    const version = (suspended.json() as { user: { version: number } }).user.version;
    const reactivated = await post(`/api/iam/users/${userId}/reactivate`, {
      expectedVersion: version,
    });
    // Never activated: the backend derives INVITED (spec Section 10.7).
    expect([reactivated.statusCode, reactivated.json()]).toEqual([
      200,
      expect.objectContaining({
        target: 'INVITED',
        user: expect.objectContaining({ accessState: 'INVITED' }),
      }),
    ]);
    expect(await identityEnabled(userId)).toBe(true);

    const revoked = await post(`/api/iam/users/${userId}/revoke-sessions`);
    expect(revoked.json()).toEqual({ sessionsRevoked: 0, providerSessions: 'TERMINATED' });
    const notInvited = await post(`/api/iam/users/${admin.id}/resend-invitation`);
    expect([notInvited.statusCode, (notInvited.json() as { code: string }).code]).toEqual([
      409,
      'IAM_INVITATION_NOT_APPLICABLE',
    ]);
  });
});
