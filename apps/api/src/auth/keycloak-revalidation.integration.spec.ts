import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDatabaseClient, type DatabaseClient } from '@vertex-os/database';
import { TestContainers } from 'testcontainers';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TEST_AUTH_ENVIRONMENT, testAuthConfig } from '../../test-support/auth-config.js';
import { eventually, freePort, JWT, keycloakJourney } from '../../test-support/keycloak-journey.js';
import { startKeycloak, type StartedKeycloak } from '../../test-support/keycloak.js';
import { startMigratedPostgres, type MigratedPostgres } from '../../test-support/postgres.js';
import { createApp } from '../app.factory.js';
import { loadAppConfig } from '../config/app-config.js';
import { loadIdentityProvisioningConfig } from '../config/identity-provisioning-config.js';
import { createIdentityProvisioning } from '../iam/identity-provisioning.js';
import { testProvisioningConfig } from '../../test-support/provisioning-config.js';

/**
 * IAM-CP1 CP1-01 against the pinned Keycloak (IAM-R03F D-10): Keycloak-side logout, recovery and
 * disablement reach a Vertex session for its whole lifetime, not only while the Keycloak SSO session
 * happens to survive its idle timeout.
 *
 * This suite owns its Keycloak container and lowers that realm's SSO idle timeout through the Admin
 * API (the committed realm keeps 1800 s). Keycloak decides idle expiry on its own clock and keeps an
 * idle session for a fixed grace window before treating it as expired, so the suite waits in real
 * time; that wait is the behavior under test (TESTING Section 67). The API's clock is moved ahead
 * instead, to cross its one-minute re-validation interval on each request.
 */

/** The realm's SSO idle timeout for this suite only. */
const SSO_IDLE_SECONDS = 20;
/** Keycloak's grace window after the idle timeout (`SessionTimeoutHelper`, 120 s in 26.x). */
const KEYCLOAK_IDLE_GRACE_SECONDS = 120;
/** How often the kept-alive session is used: well inside the SSO idle timeout. */
const USE_EVERY_MS = 8_000;

let postgres: MigratedPostgres;
let keycloak: StartedKeycloak;
let database: DatabaseClient;
let app: NestFastifyApplication;
let journey: ReturnType<typeof keycloakJourney>;
const logLines: string[] = [];
/** How far the API's clock runs ahead of real time. */
let clockOffset = 0;

beforeAll(async () => {
  const port = await freePort();
  await TestContainers.exposeHostPorts(port);
  [postgres, keycloak] = await Promise.all([
    startMigratedPostgres(),
    startKeycloak({
      uris: {
        backchannelLogout: `http://host.testcontainers.internal:${port}/api/auth/backchannel-logout`,
      },
    }),
  ]);
  const realm = await keycloak.admin('', {
    method: 'PUT',
    body: JSON.stringify({ ssoSessionIdleTimeout: SSO_IDLE_SECONDS }),
  });
  expect(realm.status).toBe(204);
  database = createDatabaseClient({ connectionString: postgres.url });
  const provisioning = createIdentityProvisioning(
    loadIdentityProvisioningConfig({
      NODE_ENV: 'test',
      KEYCLOAK_ISSUER_URL: keycloak.issuer,
      KEYCLOAK_PROVISIONER_CLIENT_ID: 'vertex-provisioner',
      KEYCLOAK_PROVISIONER_CLIENT_SECRET: keycloak.secrets.provisionerClient,
    }),
    database,
  );
  journey = keycloakJourney({
    keycloak,
    postgres,
    database,
    provisioning,
    apiOrigin: `http://127.0.0.1:${port}`,
  });
  app = await createApp(
    loadAppConfig({ NODE_ENV: 'test', LOG_LEVEL: 'info', DATABASE_URL: postgres.url }),
    testAuthConfig({
      KEYCLOAK_ISSUER_URL: keycloak.issuer,
      KEYCLOAK_WEB_CLIENT_SECRET: keycloak.secrets.webClient,
      KEYCLOAK_WEB_REDIRECT_URI: keycloak.uris.redirect,
      KEYCLOAK_WEB_POST_LOGOUT_REDIRECT_URI: keycloak.uris.postLogoutRedirect,
    }),
    testProvisioningConfig(),
    {
      logStream: { write: (line: string) => logLines.push(line) },
      now: () => new Date(Date.now() + clockOffset),
    },
  );
  await app.listen({ host: '127.0.0.1', port });
}, 360_000);

afterAll(async () => {
  try {
    await app?.close();
    await database?.disconnect();
  } finally {
    await Promise.all([postgres?.stop(), keycloak?.stop()]);
  }
  const output = logLines.join('');
  expect(output).toContain('"auth":"sign-in"');
  expect(output).not.toMatch(JWT);
  expect(output).not.toMatch(/[?&](code|state|session_state)=/);
  expect(output).not.toContain('__Host-vertex');
  const handled = journey.handledSecrets([TEST_AUTH_ENVIRONMENT.AUTH_TOKEN_ENCRYPTION_SECRET]);
  expect(handled.length).toBeGreaterThan(10);
  for (const secret of handled) expect(output).not.toContain(secret);
});

/** Moves the API's clock past its re-validation interval. */
function nextInterval(): void {
  clockOffset += 61_000;
}

async function revocationReason(userId: string): Promise<string> {
  return postgres.sql(`SELECT revocation_reason FROM auth_session WHERE user_id = '${userId}'`);
}

describe('re-validation against the real Keycloak (IAM-R03F)', () => {
  it('keeps a used Keycloak session alive past its idle timeout, so a Keycloak logout still reaches Vertex', async () => {
    const active = await journey.invitedIdentity('kept-alive');
    const unused = await journey.invitedIdentity('unused');
    const activeBrowser = journey.browser();
    const unusedBrowser = journey.browser();
    await journey.signIn(activeBrowser, active);
    await journey.signIn(unusedBrowser, unused);
    const signedInAt = Date.now();

    // Use one session more often than the realm's idle timeout, until its idle timeout and grace
    // window have passed several times over; leave the other one alone.
    while (Date.now() - signedInAt < (SSO_IDLE_SECONDS + KEYCLOAK_IDLE_GRACE_SECONDS + 10) * 1000) {
      nextInterval();
      expect(await journey.sessionStatus(activeBrowser)).toEqual({ status: 200 });
      await new Promise((resolve) => setTimeout(resolve, USE_EVERY_MS));
    }
    expect(await journey.keycloakSessions(active.subject)).toHaveLength(1);
    // The unused one idled out at Keycloak, silently: no back-channel call reached Vertex.
    expect(await journey.keycloakSessions(unused.subject)).toEqual([]);
    expect(await revocationReason(unused.id)).toBe('');

    // Its Vertex session is still within its own idle limit, but the next re-validation ends it.
    expect(await journey.sessionStatus(unusedBrowser)).toEqual({
      status: 401,
      code: 'AUTH_SESSION_INVALID',
    });
    expect(await revocationReason(unused.id)).toBe('PROVIDER_SESSION_ENDED');

    // A Keycloak-side logout of the kept-alive session reaches Vertex through back-channel logout.
    expect(
      (await keycloak.admin(`/users/${active.subject}/logout`, { method: 'POST' })).status,
    ).toBe(204);
    await eventually(
      async () => (await revocationReason(active.id)) === 'BACKCHANNEL_LOGOUT',
      'the back-channel logout',
    );
    expect(await journey.sessionStatus(activeBrowser)).toMatchObject({ status: 401 });
  }, 300_000);

  it('ends an active Vertex session once the Keycloak identity is disabled', async () => {
    const user = await journey.invitedIdentity('disabled');
    const browser = journey.browser();
    await journey.signIn(browser, user);
    expect(await journey.sessionStatus(browser)).toEqual({ status: 200 });

    const current = (await (await keycloak.admin(`/users/${user.subject}`)).json()) as object;
    const disabled = await keycloak.admin(`/users/${user.subject}`, {
      method: 'PUT',
      body: JSON.stringify({ ...current, enabled: false }),
    });
    expect(disabled.status).toBe(204);

    nextInterval();
    expect(await journey.sessionStatus(browser)).toEqual({
      status: 401,
      code: 'AUTH_SESSION_INVALID',
    });
    expect(await revocationReason(user.id)).toBe('PROVIDER_SESSION_ENDED');
    expect(
      await postgres.sql(
        `SELECT refresh_token_ciphertext IS NULL AND id_token_ciphertext IS NULL
         FROM auth_session WHERE user_id = '${user.id}'`,
      ),
    ).toBe('t');
  }, 120_000);
});
