import { randomUUID } from 'node:crypto';
import { createServer } from 'node:net';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { parseSystemProcess, parseTraceId } from '@vertex-os/audit';
import { createDatabaseClient, type DatabaseClient } from '@vertex-os/database';
import { createApplicationUserRepository } from '@vertex-os/iam-persistence';
import { TestContainers } from 'testcontainers';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testAuthConfig } from '../../test-support/auth-config.js';
import {
  actionLink,
  Browser,
  followInvitation,
  FORMS,
  freshTotp,
  hasForm,
  links,
  open,
  submit,
  totpSecret,
  type Page,
} from '../../test-support/keycloak-browser.js';
import { startKeycloak, type StartedKeycloak } from '../../test-support/keycloak.js';
import { startMigratedPostgres, type MigratedPostgres } from '../../test-support/postgres.js';
import { createApp } from '../app.factory.js';
import { loadAppConfig } from '../config/app-config.js';
import { loadIdentityProvisioningConfig } from '../config/identity-provisioning-config.js';
import {
  createIdentityProvisioning,
  type IdentityProvisioning,
} from '../iam/identity-provisioning.js';

/**
 * The browser sign-in lifecycle against the pinned Keycloak with the committed realm (IAM-R03 Done
 * means 1–7): the API listens on loopback, Keycloak reaches its back-channel endpoint through the
 * Testcontainers host exposure (D-13), and a fetch-based browser with an RFC 6238 authenticator
 * plays the user. Nothing bypasses the realm's MFA.
 */

const TEST_PASSWORD = 'correct horse battery staple, local test only';
const JWT = /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\./;

let postgres: MigratedPostgres;
let keycloak: StartedKeycloak;
let database: DatabaseClient;
let provisioning: IdentityProvisioning;
let app: NestFastifyApplication;
let apiOrigin: string;
const logLines: string[] = [];

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(() =>
        typeof address === 'object' && address ? resolve(address.port) : reject(new Error('port')),
      );
    });
  });
}

beforeAll(async () => {
  const port = await freePort();
  apiOrigin = `http://127.0.0.1:${port}`;
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
  provisioning = createIdentityProvisioning(
    loadIdentityProvisioningConfig({
      NODE_ENV: 'test',
      KEYCLOAK_ISSUER_URL: keycloak.issuer,
      KEYCLOAK_PROVISIONER_CLIENT_ID: 'vertex-provisioner',
      KEYCLOAK_PROVISIONER_CLIENT_SECRET: keycloak.secrets.provisionerClient,
    }),
    database,
  );
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
  await app?.close();
  await database?.disconnect();
  await Promise.all([postgres?.stop(), keycloak?.stop()]);
});

// ---------------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------------

function attribution() {
  const process = parseSystemProcess('iam.test-provisioning');
  const traceId = parseTraceId('trace-keycloak-login');
  if (!process.ok || !traceId.ok) throw new Error('attribution fixture');
  return { actor: { type: 'SYSTEM' as const, process: process.value }, traceId: traceId.value };
}

/** A Vertex user invited through real provisioning whose recipient completed the invitation. */
async function invitedIdentity(label: string) {
  const email = `${label}-${randomUUID()}@example.invalid`;
  const created = await createApplicationUserRepository(database).create({
    email: email as never,
    displayName: 'Synthetic User' as never,
    accessState: 'INVITED',
    identitySyncState: 'PENDING',
    invitationDeliveryState: 'NOT_SENT',
    memberships: [],
    roleIds: [],
  });
  if (created.outcome !== 'created') throw new Error('seed user');
  const provisioned = await provisioning.provision({
    userId: created.user.id,
    attribution: attribution(),
  });
  expect(provisioned.invitation.outcome).toBe('sent');
  const message = await keycloak.mail.waitFor(email);
  const invitation = await followInvitation(
    actionLink(message.text),
    keycloak.baseUrl,
    TEST_PASSWORD,
  );
  if (!invitation.secret) throw new Error('the invitation enrolled no TOTP');
  const subject = await postgres.sql(
    `SELECT identity_subject FROM iam_application_user WHERE id = '${created.user.id}'`,
  );
  return { id: created.user.id, email, subject, secret: invitation.secret, used: invitation.used };
}

/** A browser that keeps what the Vertex API sent it, so tests can prove no token reached it. */
class VertexBrowser extends Browser {
  readonly fromApi: string[] = [];

  async api(path: string, init: RequestInit = {}): Promise<Response> {
    const response = await this.request(`${apiOrigin}${path}`, init);
    const body = await response.clone().text();
    this.fromApi.push(JSON.stringify([...response.headers]), body);
    return response;
  }
}

/**
 * Signs in at /api/auth/login: Keycloak's password and OTP forms (or TOTP enrolment for an
 * identity without one), then the callback on the API. Returns the API's final answer.
 */
async function signIn(
  browser: VertexBrowser,
  user: { email: string; secret?: string; used?: Set<string> },
): Promise<{ callback: Response; enrolledSecret?: string }> {
  const login = await browser.api('/api/auth/login');
  expect(login.status).toBe(302);
  const authorization = login.headers.get('location') ?? '';
  expect(authorization.startsWith(`${keycloak.issuer}/protocol/openid-connect/auth?`)).toBe(true);

  let page: Page = await open(browser, authorization, keycloak.baseUrl);
  let enrolledSecret: string | undefined;
  if (hasForm(page, FORMS.login)) {
    page = await submit(
      browser,
      page,
      FORMS.login,
      { username: user.email, password: TEST_PASSWORD },
      keycloak.baseUrl,
    );
  }
  if (hasForm(page, FORMS.otp)) {
    if (!user.secret || !user.used) throw new Error('OTP requested for a user without a secret');
    page = await submit(
      browser,
      page,
      FORMS.otp,
      { otp: freshTotp(user.secret, user.used) },
      keycloak.baseUrl,
    );
  } else if (hasForm(page, FORMS.totpEnrolment)) {
    const enrolment = await totpSecret(browser, page, keycloak.baseUrl);
    enrolledSecret = enrolment.secret;
    page = await submit(
      browser,
      enrolment,
      FORMS.totpEnrolment,
      { totp: freshTotp(enrolment.secret, new Set()), userLabel: 'test device' },
      keycloak.baseUrl,
    );
  }
  const redirect = page.location ?? '';
  expect(redirect.startsWith(`${keycloak.uris.redirect}?`)).toBe(true);
  // The registered redirect URI names the web origin; the API behind it is on another port here.
  const target = new URL(redirect);
  const callback = await browser.api(`${target.pathname}${target.search}`);
  return { callback, ...(enrolledSecret ? { enrolledSecret } : {}) };
}

async function sessionStatus(browser: VertexBrowser): Promise<{ status: number; code?: string }> {
  const response = await browser.api('/api/auth/session');
  const body = (await response.json()) as { code?: string };
  return { status: response.status, ...(body.code ? { code: body.code } : {}) };
}

async function keycloakSessions(subject: string): Promise<unknown[]> {
  const response = await keycloak.admin(`/users/${subject}/sessions`);
  expect(response.status).toBe(200);
  return (await response.json()) as unknown[];
}

async function eventually(check: () => Promise<boolean>, what: string): Promise<void> {
  const deadline = Date.now() + 15_000;
  while (!(await check())) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

// ---------------------------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------------------------

describe('sign-in through the real Keycloak', () => {
  it('activates an invited user and gives the browser only the opaque session cookie', async () => {
    const user = await invitedIdentity('first-login');
    const browser = new VertexBrowser();
    const { callback } = await signIn(browser, user);

    expect(callback.status).toBe(303);
    expect(callback.headers.get('location')).toBe('/');
    expect(callback.headers.getSetCookie().map((line) => line.split('=')[0])).toEqual([
      '__Host-vertex-login',
      '__Host-vertex-session',
    ]);
    expect(
      await postgres.sql(`SELECT access_state FROM iam_application_user WHERE id = '${user.id}'`),
    ).toBe('ACTIVE');
    expect(await sessionStatus(browser)).toEqual({ status: 200 });

    // No ID, access or refresh token ever reached the browser from the API.
    for (const received of browser.fromApi) expect(received).not.toMatch(JWT);
    // The session row holds hashes and an encrypted ID token only.
    const row = await postgres.sql(
      `SELECT token_hash ~ '^[A-Za-z0-9_-]{43}$', id_token_ciphertext !~ '^eyJ', idp_session_id IS NOT NULL
       FROM auth_session WHERE user_id = '${user.id}'`,
    );
    expect(row).toBe('t|t|t');
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
    const browser = new VertexBrowser();
    const { callback } = await signIn(browser, { email });
    expect(callback.headers.get('location')).toBe('/?authError=AUTH_ACCESS_DENIED');
    expect(
      callback.headers.getSetCookie().some((line) => line.startsWith('__Host-vertex-session=')),
    ).toBe(false);
    expect(
      await postgres.sql('SELECT count(*) FROM iam_application_user WHERE email = ' + `'${email}'`),
    ).toBe('0');
  });

  it('denies a suspended user whose Keycloak identity still works, and records the mismatch', async () => {
    const user = await invitedIdentity('suspended');
    await signIn(new VertexBrowser(), user);
    await postgres.sql(
      `UPDATE iam_application_user SET access_state = 'SUSPENDED' WHERE id = '${user.id}'`,
    );
    const { callback } = await signIn(new VertexBrowser(), user);
    expect(callback.headers.get('location')).toBe('/?authError=AUTH_ACCESS_DENIED');
    expect(
      await postgres.sql(
        `SELECT identity_sync_state FROM iam_application_user WHERE id = '${user.id}'`,
      ),
    ).toBe('FAILED');
  });

  it('rejects a callback replayed from another browser', async () => {
    const user = await invitedIdentity('replay');
    const browser = new VertexBrowser();
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
    const attacker = new VertexBrowser();
    const stolen = await attacker.api(`${target.pathname}${target.search}`);
    expect(stolen.headers.get('location')).toBe('/?authError=AUTH_LOGIN_FAILED');
  });
});

describe('logout through the real Keycloak', () => {
  it('requires the CSRF token, revokes the session and ends the Keycloak session', async () => {
    const user = await invitedIdentity('logout');
    const browser = new VertexBrowser();
    await signIn(browser, user);
    expect(await keycloakSessions(user.subject)).toHaveLength(1);

    const refused = await browser.api('/api/auth/logout', { method: 'POST' });
    expect(refused.status).toBe(403);

    const { token } = (await (await browser.api('/api/auth/csrf')).json()) as { token: string };
    const logout = await browser.api('/api/auth/logout', {
      method: 'POST',
      headers: { 'x-csrf-token': token },
    });
    expect(logout.status).toBe(200);
    const { logoutUrl } = (await logout.json()) as { logoutUrl: string };
    // The browser now sends the emptied cookie, which names no session.
    expect(await sessionStatus(browser)).toMatchObject({ status: 401 });
    expect(
      await postgres.sql(`SELECT revocation_reason FROM auth_session WHERE user_id = '${user.id}'`),
    ).toBe('LOGOUT');

    // RP-initiated logout with id_token_hint: Keycloak ends its session without asking.
    const ended = await open(browser, logoutUrl, keycloak.baseUrl);
    expect(ended.location).toBe(keycloak.uris.postLogoutRedirect);
    expect(await keycloakSessions(user.subject)).toEqual([]);
    // The hint is the only place a token appears, and it went to Keycloak, not to the page.
    expect(new URL(logoutUrl).searchParams.get('id_token_hint')).toMatch(JWT);
  });

  it('revokes the Vertex session when Keycloak logs the user out (back-channel)', async () => {
    const user = await invitedIdentity('backchannel');
    const browser = new VertexBrowser();
    await signIn(browser, user);
    const other = new VertexBrowser();
    await signIn(other, user);

    // An administrator ends one Keycloak session; Keycloak calls the API from its container.
    const [first] = (await keycloakSessions(user.subject)) as { id: string }[];
    const removed = await keycloak.admin(`/sessions/${first?.id}`, { method: 'DELETE' });
    expect(removed.status).toBe(204);
    await eventually(
      async () =>
        (await postgres.sql(
          `SELECT count(*) FROM auth_session WHERE user_id = '${user.id}' AND revocation_reason = 'BACKCHANNEL_LOGOUT'`,
        )) === '1',
      'the back-channel logout',
    );
    const statuses = [await sessionStatus(browser), await sessionStatus(other)];
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
    const user = await invitedIdentity('recovery');
    const browser = new VertexBrowser();
    await signIn(browser, user);

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
      async () => (await sessionStatus(browser)).status === 401,
      'the recovery back-channel logout',
    );
    expect(await sessionStatus(browser)).toMatchObject({ code: 'AUTH_SESSION_INVALID' });
    expect(
      await postgres.sql(`SELECT revocation_reason FROM auth_session WHERE user_id = '${user.id}'`),
    ).toBe('BACKCHANNEL_LOGOUT');
  });
});

describe('secret safety of the lifecycle', () => {
  it('logs no cookie, code, state, token or client secret', () => {
    const output = logLines.join('');
    expect(output).not.toMatch(JWT);
    expect(output).not.toMatch(/[?&](code|state|session_state)=/);
    expect(output).not.toContain(keycloak.secrets.webClient);
    expect(output).not.toContain('__Host-vertex');
    expect(output).toContain('"url":"/api/auth/callback"');
  });
});
