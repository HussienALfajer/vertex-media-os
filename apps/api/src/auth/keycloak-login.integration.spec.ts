import { randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDatabaseClient, type DatabaseClient } from '@vertex-os/database';
import { TestContainers } from 'testcontainers';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TEST_AUTH_ENVIRONMENT, testAuthConfig } from '../../test-support/auth-config.js';
import {
  actionLink,
  Browser,
  FORMS,
  freshTotp,
  hasForm,
  links,
  open,
  submit,
} from '../../test-support/keycloak-browser.js';
import {
  eventually,
  freePort,
  JWT,
  keycloakJourney,
  TEST_PASSWORD,
} from '../../test-support/keycloak-journey.js';
import { startKeycloak, type StartedKeycloak } from '../../test-support/keycloak.js';
import { startMigratedPostgres, type MigratedPostgres } from '../../test-support/postgres.js';
import { createApp } from '../app.factory.js';
import { loadAppConfig } from '../config/app-config.js';
import { loadIdentityProvisioningConfig } from '../config/identity-provisioning-config.js';
import { createIdentityProvisioning } from '../iam/identity-provisioning.js';

/**
 * The browser sign-in lifecycle against the pinned Keycloak with the committed realm (IAM-R03 Done
 * means 1–7): the API listens on loopback, Keycloak reaches its back-channel endpoint through the
 * Testcontainers host exposure (D-13), and a fetch-based browser with an RFC 6238 authenticator
 * plays the user. Nothing bypasses the realm's MFA.
 */

let postgres: MigratedPostgres;
let keycloak: StartedKeycloak;
let database: DatabaseClient;
let app: NestFastifyApplication;
let journey: ReturnType<typeof keycloakJourney>;
/** Every log line the application wrote during the whole suite (CP1-02). */
const logLines: string[] = [];

beforeAll(async () => {
  const port = await freePort();
  // Keycloak calls the back-channel endpoint from its container; the API stays on loopback.
  await TestContainers.exposeHostPorts(port);
  [postgres, keycloak] = await Promise.all([
    startMigratedPostgres(),
    startKeycloak({
      uris: {
        backchannelLogout: `http://host.testcontainers.internal:${port}/api/auth/backchannel-logout`,
      },
    }),
  ]);
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
    { logStream: { write: (line: string) => logLines.push(line) } },
  );
  await app.listen({ host: '127.0.0.1', port });
}, 360_000);

afterAll(async () => {
  // Clean up first, so a failing scan leaves nothing running (CP1-12); then scan the whole suite's
  // capture, whatever order the tests ran in (CP1-02).
  try {
    await app?.close();
    await database?.disconnect();
  } finally {
    await Promise.all([postgres?.stop(), keycloak?.stop()]);
  }
  const output = logLines.join('');
  expect(output).toContain('"url":"/api/auth/callback"');
  expect(output).not.toMatch(JWT);
  expect(output).not.toMatch(/[?&](code|state|session_state)=/);
  expect(output).not.toContain('__Host-vertex');
  const handled = journey.handledSecrets([TEST_AUTH_ENVIRONMENT.AUTH_TOKEN_ENCRYPTION_SECRET]);
  expect(handled.length).toBeGreaterThan(10);
  for (const secret of handled) expect(output).not.toContain(secret);
});

const newBrowser = () => journey.browser();

// ---------------------------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------------------------

describe('sign-in through the real Keycloak', () => {
  it('activates an invited user and gives the browser only the opaque session cookie', async () => {
    const user = await journey.invitedIdentity('first-login');
    const browser = newBrowser();
    const { callback } = await journey.signIn(browser, user);

    expect(callback.status).toBe(303);
    expect(callback.headers.get('location')).toBe('/');
    expect(callback.headers.getSetCookie().map((line) => line.split('=')[0])).toEqual([
      '__Host-vertex-login',
      '__Host-vertex-session',
    ]);
    expect(
      await postgres.sql(`SELECT access_state FROM iam_application_user WHERE id = '${user.id}'`),
    ).toBe('ACTIVE');
    expect(await journey.sessionStatus(browser)).toEqual({ status: 200 });

    // No ID, access or refresh token ever reached the browser from the API.
    for (const received of browser.fromApi) expect(received).not.toMatch(JWT);
    // The session row holds hashes and the encrypted ID and refresh tokens only (IAM-R03F D-06).
    const row = await postgres.sql(
      `SELECT token_hash ~ '^[A-Za-z0-9_-]{43}$', id_token_ciphertext !~ '^eyJ',
         refresh_token_ciphertext !~ '^eyJ', idp_session_id IS NOT NULL
       FROM auth_session WHERE user_id = '${user.id}'`,
    );
    expect(row).toBe('t|t|t|t');
  });

  it('denies an identity no Vertex user is bound to, after Keycloak authenticated it', async () => {
    const email = `unmapped-${randomUUID()}@example.invalid`;
    const created = await keycloak.admin('/users', {
      method: 'POST',
      body: JSON.stringify({
        username: email,
        email,
        enabled: true,
        emailVerified: true,
        credentials: [{ type: 'password', value: TEST_PASSWORD, temporary: false }],
      }),
    });
    expect(created.status).toBe(201);
    const browser = newBrowser();
    const { callback } = await journey.signIn(browser, { email });
    expect(callback.headers.get('location')).toBe('/?authError=AUTH_ACCESS_DENIED');
    expect(
      callback.headers.getSetCookie().some((line) => line.startsWith('__Host-vertex-session=')),
    ).toBe(false);
    expect(
      await postgres.sql('SELECT count(*) FROM iam_application_user WHERE email = ' + `'${email}'`),
    ).toBe('0');
  });

  it('denies a suspended user whose Keycloak identity still works, and records the mismatch', async () => {
    const user = await journey.invitedIdentity('suspended');
    await journey.signIn(newBrowser(), user);
    await postgres.sql(
      `UPDATE iam_application_user SET access_state = 'SUSPENDED' WHERE id = '${user.id}'`,
    );
    const { callback } = await journey.signIn(newBrowser(), user);
    expect(callback.headers.get('location')).toBe('/?authError=AUTH_ACCESS_DENIED');
    expect(
      await postgres.sql(
        `SELECT identity_sync_state FROM iam_application_user WHERE id = '${user.id}'`,
      ),
    ).toBe('FAILED');
  });

  it('rejects a callback replayed from another browser', async () => {
    const user = await journey.invitedIdentity('replay');
    const browser = newBrowser();
    const login = await browser.api('/api/auth/login');
    let page = await open(browser, login.headers.get('location') ?? '', keycloak.baseUrl);
    page = await submit(
      browser,
      page,
      FORMS.login,
      { username: user.email, password: TEST_PASSWORD },
      keycloak.baseUrl,
    );
    page = await submit(
      browser,
      page,
      FORMS.otp,
      { otp: freshTotp(user.secret, user.used) },
      keycloak.baseUrl,
    );
    const target = new URL(page.location ?? '');
    // An attacker's browser holds no login cookie for this attempt (login CSRF, SECURITY Section 19).
    const attacker = newBrowser();
    const stolen = await attacker.api(`${target.pathname}${target.search}`);
    expect(stolen.headers.get('location')).toBe('/?authError=AUTH_LOGIN_FAILED');
  });
});

describe('logout through the real Keycloak', () => {
  it('requires the CSRF token, revokes the session and ends the Keycloak session', async () => {
    const user = await journey.invitedIdentity('logout');
    const browser = newBrowser();
    await journey.signIn(browser, user);
    expect(await journey.keycloakSessions(user.subject)).toHaveLength(1);

    const refused = await browser.api('/api/auth/logout', { method: 'POST' });
    expect(refused.status).toBe(403);

    const { token } = (await (await browser.api('/api/auth/csrf')).json()) as { token: string };
    const logout = await browser.api('/api/auth/logout', {
      method: 'POST',
      headers: { 'x-csrf-token': token },
    });
    expect(logout.status).toBe(200);
    // The API ended the Keycloak session itself: the browser only learns where to go next.
    expect(await logout.json()).toEqual({ logoutUrl: keycloak.uris.postLogoutRedirect });
    expect(await journey.keycloakSessions(user.subject)).toEqual([]);
    for (const received of browser.fromApi) expect(received).not.toMatch(JWT);
    // The browser now sends the emptied cookie, which names no session.
    expect(await journey.sessionStatus(browser)).toMatchObject({ status: 401 });
    expect(
      await postgres.sql(`SELECT revocation_reason FROM auth_session WHERE user_id = '${user.id}'`),
    ).toBe('LOGOUT');

    // A later sign-in in the same browser needs the password and OTP again (no silent SSO).
    const login = await browser.api('/api/auth/login');
    const page = await open(browser, login.headers.get('location') ?? '', keycloak.baseUrl);
    expect(hasForm(page, FORMS.login)).toBe(true);
  });

  it('revokes the Vertex session when Keycloak logs the user out (back-channel)', async () => {
    const user = await journey.invitedIdentity('backchannel');
    const browser = newBrowser();
    await journey.signIn(browser, user);
    const other = newBrowser();
    await journey.signIn(other, user);

    // An administrator ends one Keycloak session; Keycloak calls the API from its container.
    const [first] = (await journey.keycloakSessions(user.subject)) as { id: string }[];
    const removed = await keycloak.admin(`/sessions/${first?.id}`, { method: 'DELETE' });
    expect(removed.status).toBe(204);
    await eventually(
      async () =>
        (await postgres.sql(
          `SELECT count(*) FROM auth_session WHERE user_id = '${user.id}' AND revocation_reason = 'BACKCHANNEL_LOGOUT'`,
        )) === '1',
      'the back-channel logout',
    );
    const statuses = [await journey.sessionStatus(browser), await journey.sessionStatus(other)];
    expect(statuses.filter((status) => status.status === 200)).toHaveLength(1);

    // Ending every Keycloak session of the user revokes the rest.
    expect((await keycloak.admin(`/users/${user.subject}/logout`, { method: 'POST' })).status).toBe(
      204,
    );
    await eventually(
      async () =>
        (await postgres.sql(
          `SELECT count(*) FROM auth_session WHERE user_id = '${user.id}' AND revoked_at IS NULL`,
        )) === '0',
      'the second back-channel logout',
    );
    expect(
      await postgres.sql(
        "SELECT DISTINCT actor_process FROM audit_record WHERE action = 'iam.session.revoked'",
      ),
    ).toContain('iam.backchannel-logout');
  });

  it('revokes Vertex sessions when a self-service reset signs the user out elsewhere (D-15)', async () => {
    const user = await journey.invitedIdentity('recovery');
    const browser = newBrowser();
    await journey.signIn(browser, user);

    const resetBrowser = new Browser();
    const login = await open(
      resetBrowser,
      `${keycloak.issuer}/protocol/openid-connect/auth?${new URLSearchParams({
        client_id: 'vertex-web',
        response_type: 'code',
        scope: 'openid',
        redirect_uri: keycloak.uris.redirect,
        code_challenge: 'a'.repeat(43),
        code_challenge_method: 'S256',
      })}`,
      keycloak.baseUrl,
    );
    const resetLink = links(login.html).find((link) =>
      link.includes('/login-actions/reset-credentials'),
    );
    const form = await open(
      resetBrowser,
      new URL(resetLink ?? '', keycloak.baseUrl).href,
      keycloak.baseUrl,
    );
    await submit(
      resetBrowser,
      form,
      FORMS.resetRequest,
      { username: user.email },
      keycloak.baseUrl,
    );
    const message = await keycloak.mail.waitFor(user.email, (mail) =>
      /password/i.test(mail.subject),
    );
    const mailbox = new Browser();
    const otp = await open(mailbox, actionLink(message.text), keycloak.baseUrl);
    const passwordPage = await submit(
      mailbox,
      otp,
      FORMS.otp,
      { otp: freshTotp(user.secret, user.used) },
      keycloak.baseUrl,
    );
    expect(hasForm(passwordPage, FORMS.passwordUpdate)).toBe(true);
    const newPassword = 'a brand new passphrase, local test only';
    await submit(
      mailbox,
      passwordPage,
      FORMS.passwordUpdate,
      // The form's "sign out from other devices" box, checked by default.
      { 'password-new': newPassword, 'password-confirm': newPassword, 'logout-sessions': 'on' },
      keycloak.baseUrl,
    );

    await eventually(
      async () => (await journey.sessionStatus(browser)).status === 401,
      'the recovery back-channel logout',
    );
    expect(await journey.sessionStatus(browser)).toMatchObject({ code: 'AUTH_SESSION_INVALID' });
    expect(
      await postgres.sql(`SELECT revocation_reason FROM auth_session WHERE user_id = '${user.id}'`),
    ).toBe('BACKCHANNEL_LOGOUT');
  });
});
