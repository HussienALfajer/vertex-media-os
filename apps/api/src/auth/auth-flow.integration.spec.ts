import { randomUUID } from 'node:crypto';
import { Logger } from '@nestjs/common';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createAuditRecorder } from '@vertex-os/audit-persistence';
import { createDatabaseClient, type DatabaseClient } from '@vertex-os/database';
import { authPersistenceOf } from '@vertex-os/database/auth';
import { createIamTransactionRunner } from '@vertex-os/iam-persistence';
import type { LightMyRequestResponse } from 'fastify';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  TEST_AUTH_ENVIRONMENT,
  testAuthConfig,
  UNLIMITED_RATES,
} from '../../test-support/auth-config.js';
import {
  FAKE_CLIENT_SECRET,
  FAKE_ISSUER,
  FakeOidcProvider,
  type AuthorizeOptions,
} from '../../test-support/fake-oidc-provider.js';
import { startMigratedPostgres, type MigratedPostgres } from '../../test-support/postgres.js';
import { createApp } from '../app.factory.js';
import { loadAppConfig } from '../config/app-config.js';
import { JWT } from '../../test-support/keycloak-journey.js';
import { LOGIN_COOKIE, SESSION_COOKIE } from './cookies.js';
import { seedInvitedUser } from '../../test-support/iam-users.js';
import { testProvisioningConfig } from '../../test-support/provisioning-config.js';

/**
 * The BFF endpoints end to end against real PostgreSQL, IAM and the Audit adapter, with a fake
 * OpenID provider behind the OIDC client's `fetch` (the real Keycloak journey is in
 * keycloak-login.integration.spec.ts). Covers spec Sections 13–15, 32–33 and 46.6.
 */
describe('browser authentication against PostgreSQL and a fake provider', () => {
  let postgres: MigratedPostgres;
  let database: DatabaseClient;
  let provider: FakeOidcProvider;
  let app: NestFastifyApplication;
  /** Every log line the application wrote during the whole suite (CP1-02). */
  const lines: string[] = [];
  /** Every secret the suite handled: none of them may appear in any log line. */
  const secrets: string[] = [];
  /** Moves the API's clock ahead of real time, to cross the re-validation interval. */
  let clockOffset = 0;

  beforeAll(async () => {
    postgres = await startMigratedPostgres();
    database = createDatabaseClient({ connectionString: postgres.url });
    provider = await FakeOidcProvider.start();
    app = await createApp(
      loadAppConfig({ NODE_ENV: 'test', LOG_LEVEL: 'info', DATABASE_URL: postgres.url }),
      testAuthConfig({
        ...UNLIMITED_RATES,
        KEYCLOAK_ISSUER_URL: FAKE_ISSUER,
        KEYCLOAK_WEB_CLIENT_SECRET: FAKE_CLIENT_SECRET,
      }),
      testProvisioningConfig(),
      {
        logStream: { write: (line: string) => lines.push(line) },
        oidcFetch: provider.fetch,
        now: () => new Date(Date.now() + clockOffset),
      },
    );
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  }, 180_000);

  afterAll(async () => {
    // Clean up first, so a failing scan leaves nothing running (CP1-12); then scan the whole
    // suite's capture, whatever order the tests ran in (CP1-02).
    try {
      await app?.close();
      await database?.disconnect();
    } finally {
      await postgres?.stop();
    }
    const output = lines.join('');
    expect(output).toContain('"auth":"sign-in"');
    const handled = [
      ...secrets,
      ...provider.issued,
      ...provider.verifiers,
      FAKE_CLIENT_SECRET,
      TEST_AUTH_ENVIRONMENT.AUTH_TOKEN_ENCRYPTION_SECRET,
    ];
    expect(secrets.length).toBeGreaterThan(0);
    expect(provider.verifiers.length).toBeGreaterThan(0);
    for (const secret of handled) expect(output).not.toContain(secret);
    // Whatever the list above misses, no JWT-shaped value reaches a log line (CP1-23).
    expect(output).not.toMatch(JWT);
  });

  // Before the next test truncates it: no Audit change or reason written by this test holds a
  // token, code, verifier or secret the suite handled (CP1-25).
  afterEach(async () => {
    const evidence = await postgres.sql(
      "SELECT coalesce(change::text, '') || ' ' || coalesce(reason, '') FROM audit_record",
    );
    for (const secret of [...secrets, ...provider.issued, ...provider.verifiers].filter(
      (value) => value.length >= 8,
    )) {
      expect(evidence).not.toContain(secret);
    }
    expect(evidence).not.toMatch(JWT);
  });

  beforeEach(async () => {
    clockOffset = 0;
    await postgres.sql(
      'TRUNCATE auth_session, auth_login_attempt, audit_record, iam_application_user CASCADE',
    );
  });

  async function seedUser(
    accessState: 'INVITED' | 'ACTIVE' | 'SUSPENDED' | 'DISABLED' | 'TERMINATED' = 'INVITED',
  ): Promise<{ id: string; subject: string }> {
    const created = {
      user: { id: await seedInvitedUser(postgres, `${randomUUID()}@example.invalid`) },
    };
    const subject = randomUUID();
    await createIamTransactionRunner(database, { auditRecorderFor: createAuditRecorder }).run(
      ({ users }) =>
        users.bindIdentity({
          id: created.user.id,
          expectedVersion: 1,
          issuer: FAKE_ISSUER,
          subject,
        }),
    );
    await postgres.sql(
      `UPDATE iam_application_user SET identity_sync_state = 'SYNCED' WHERE id = '${created.user.id}'`,
    );
    if (accessState !== 'INVITED') {
      await postgres.sql(
        `UPDATE iam_application_user SET access_state = '${accessState}',
           first_activated_at = now() WHERE id = '${created.user.id}'`,
      );
    }
    return { id: created.user.id, subject };
  }

  function cookieOf(response: LightMyRequestResponse, name: string): string | undefined {
    const header = response.headers['set-cookie'];
    const all = header === undefined ? [] : Array.isArray(header) ? header : [header];
    const pair = all.map((line) => line.split(';')[0] ?? '').find((p) => p.startsWith(`${name}=`));
    const value = pair?.slice(name.length + 1);
    return value === undefined || value === '' ? undefined : value;
  }

  async function signIn(
    options: AuthorizeOptions = {},
    previousSession?: string,
  ): Promise<{ response: LightMyRequestResponse; session: string | undefined }> {
    const login = await app.inject({ method: 'GET', url: '/api/auth/login' });
    expect(login.statusCode).toBe(302);
    const handle = cookieOf(login, LOGIN_COOKIE);
    if (handle) secrets.push(handle);
    const authorization = new URL(String(login.headers['location'])).searchParams;
    for (const name of ['state', 'nonce']) {
      const value = authorization.get(name);
      expect(value).toBeTruthy();
      secrets.push(value ?? '');
    }
    const callback = new URL(provider.authorize(String(login.headers['location']), options));
    const cookies = [`${LOGIN_COOKIE}=${handle}`];
    if (previousSession) cookies.push(`${SESSION_COOKIE}=${previousSession}`);
    const response = await app.inject({
      method: 'GET',
      url: `${callback.pathname}${callback.search}`,
      headers: { cookie: cookies.join('; ') },
    });
    const session = cookieOf(response, SESSION_COOKIE);
    if (session) secrets.push(session);
    return { response, session };
  }

  const withSession = (session: string, extra: Record<string, string> = {}) => ({
    cookie: `${SESSION_COOKIE}=${session}`,
    ...extra,
  });

  async function csrfToken(session: string): Promise<string> {
    const response = await app.inject({
      method: 'GET',
      url: '/api/auth/csrf',
      headers: withSession(session),
    });
    expect(response.statusCode).toBe(200);
    const { token } = response.json() as { token: string };
    secrets.push(token);
    return token;
  }

  async function audit(): Promise<string[]> {
    const output = await postgres.sql(
      "SELECT action || ':' || result FROM audit_record ORDER BY occurred_at, action",
    );
    return output === '' ? [] : output.split('\n');
  }

  /** The back-channel logout security events: result, target, actor and change. */
  async function backchannelEvidence(): Promise<string[]> {
    const output = await postgres.sql(
      `SELECT result || '|' || target_type || '|' || target_id || '|' || actor_process || '|' || change::text
       FROM audit_record WHERE action = 'iam.session.backchannel-logout' ORDER BY occurred_at`,
    );
    return output === '' ? [] : output.split('\n');
  }

  async function userRow(id: string): Promise<string> {
    return postgres.sql(
      `SELECT access_state || '|' || identity_sync_state || '|' || (first_activated_at IS NOT NULL)
       FROM iam_application_user WHERE id = '${id}'`,
    );
  }

  it('signs in an invited user, activates them once and issues only the session cookie', async () => {
    const user = await seedUser('INVITED');
    const login = await app.inject({ method: 'GET', url: '/api/auth/login' });
    expect(login.headers['set-cookie']).toMatch(
      /^__Host-vertex-login=[A-Za-z0-9_-]{43}; Path=\/; Max-Age=600; Secure; HttpOnly; SameSite=Lax$/,
    );
    expect(login.headers['cache-control']).toBe('no-store');

    const { response, session } = await signIn({ subject: user.subject });
    expect(response.statusCode).toBe(303);
    expect(response.headers['location']).toBe('/');
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['set-cookie']).toEqual([
      '__Host-vertex-login=; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=Lax',
      `__Host-vertex-session=${session}; Path=/; Secure; HttpOnly; SameSite=Strict`,
    ]);
    expect(response.body).toBe('');
    for (const token of provider.issued)
      expect(JSON.stringify(response.headers)).not.toContain(token);
    expect(await userRow(user.id)).toBe('ACTIVE|SYNCED|true');
    // Activation commits first; the session and its evidence follow in their own transaction.
    expect(await audit()).toEqual([
      'iam.user.first-activated:SUCCEEDED',
      'iam.session.established:SUCCEEDED',
    ]);

    const current = await app.inject({
      method: 'GET',
      url: '/api/auth/session',
      headers: withSession(session ?? ''),
    });
    expect(current.statusCode).toBe(200);
    expect(current.headers['cache-control']).toBe('no-store');
    const body = current.json() as {
      user: Record<string, unknown>;
      session: Record<string, unknown>;
    };
    expect(Object.keys(body.user).sort()).toEqual(['displayName', 'email', 'id']);
    expect(body.user['id']).toBe(user.id);
    expect(Object.keys(body.session).sort()).toEqual(['absoluteExpiresAt', 'idleExpiresAt']);
    for (const token of provider.issued) expect(current.body).not.toContain(token);
  });

  it('never activates twice: a second sign-in keeps firstActivatedAt', async () => {
    const user = await seedUser('INVITED');
    await signIn({ subject: user.subject });
    const first = await postgres.sql(
      `SELECT first_activated_at FROM iam_application_user WHERE id = '${user.id}'`,
    );
    await signIn({ subject: user.subject });
    expect(
      await postgres.sql(
        `SELECT first_activated_at FROM iam_application_user WHERE id = '${user.id}'`,
      ),
    ).toBe(first);
    expect(
      (await audit()).filter((action) => action.startsWith('iam.user.first-activated')),
    ).toHaveLength(1);
  });

  it('denies an unmapped identity without revealing why, and creates nothing', async () => {
    const { response, session } = await signIn({ subject: randomUUID() });
    expect(response.headers['location']).toBe('/?authError=AUTH_ACCESS_DENIED');
    expect(session).toBeUndefined();
    expect(await postgres.sql('SELECT count(*) FROM iam_application_user')).toBe('0');
    expect(await postgres.sql('SELECT count(*) FROM auth_session')).toBe('0');
    expect(await audit()).toEqual(['iam.identity.sign-in-refused:REFUSED']);
  });

  it.each(['SUSPENDED', 'DISABLED', 'TERMINATED'] as const)(
    'denies a %s user and records the identity mismatch',
    async (accessState) => {
      const user = await seedUser(accessState);
      const { response, session } = await signIn({ subject: user.subject });
      expect(response.headers['location']).toBe('/?authError=AUTH_ACCESS_DENIED');
      expect(session).toBeUndefined();
      expect(await userRow(user.id)).toBe(`${accessState}|FAILED|true`);
      expect(await audit()).toEqual(['iam.user.sign-in-refused:REFUSED']);
    },
  );

  it('rejects a forged state, a replayed callback and a missing login cookie', async () => {
    const user = await seedUser('ACTIVE');
    const forged = await signIn({ subject: user.subject, state: 'forged-state' });
    expect(forged.response.headers['location']).toBe('/?authError=AUTH_LOGIN_FAILED');

    const login = await app.inject({ method: 'GET', url: '/api/auth/login' });
    const handle = cookieOf(login, LOGIN_COOKIE);
    const callback = new URL(
      provider.authorize(String(login.headers['location']), { subject: user.subject }),
    );
    const request = {
      method: 'GET' as const,
      url: `${callback.pathname}${callback.search}`,
      headers: { cookie: `${LOGIN_COOKIE}=${handle}` },
    };
    expect((await app.inject(request)).headers['location']).toBe('/');
    expect((await app.inject(request)).headers['location']).toBe('/?authError=AUTH_LOGIN_FAILED');
    const cookieless = await app.inject({ ...request, headers: {} });
    expect(cookieless.headers['location']).toBe('/?authError=AUTH_LOGIN_FAILED');
    expect(await postgres.sql('SELECT count(*) FROM auth_session')).toBe('1');
  });

  it('rejects ID tokens with a wrong nonce, audience or signature', async () => {
    const user = await seedUser('ACTIVE');
    for (const options of [
      { idTokenClaims: { nonce: 'another' } },
      { idTokenClaims: { aud: 'account-console', azp: 'account-console' } },
      { signWith: 'stranger' as const },
    ]) {
      const { response, session } = await signIn({ subject: user.subject, ...options });
      expect(response.headers['location']).toBe('/?authError=AUTH_LOGIN_FAILED');
      expect(session).toBeUndefined();
    }
    expect(await postgres.sql('SELECT count(*) FROM auth_session')).toBe('0');
  });

  it('reports a provider outage at the callback as unavailable', async () => {
    const user = await seedUser('ACTIVE');
    provider.tokenStatus = 502;
    const { response } = await signIn({ subject: user.subject });
    expect(response.headers['location']).toBe('/?authError=IDENTITY_PROVIDER_UNAVAILABLE');
  });

  it('rotates the session when the same browser signs in again', async () => {
    const user = await seedUser('ACTIVE');
    const first = await signIn({ subject: user.subject });
    const second = await signIn({ subject: user.subject }, first.session);
    expect(second.session).toBeDefined();
    expect(second.session).not.toBe(first.session);
    const old = await app.inject({
      method: 'GET',
      url: '/api/auth/session',
      headers: withSession(first.session ?? ''),
    });
    expect(old.json()).toMatchObject({ code: 'AUTH_SESSION_INVALID' });
    expect(
      await postgres.sql("SELECT count(*) FROM auth_session WHERE revocation_reason = 'REPLACED'"),
    ).toBe('1');
  });

  describe('CSRF (spec Section 46.6)', () => {
    it('protects logout: missing, wrong and foreign tokens fail; the session token succeeds', async () => {
      const user = await seedUser('ACTIVE');
      const { session } = await signIn({ subject: user.subject });
      const other = await signIn({ subject: (await seedUser('ACTIVE')).subject });
      const own = await csrfToken(session ?? '');
      expect(await csrfToken(session ?? '')).toBe(own);
      const foreign = await csrfToken(other.session ?? '');

      for (const header of [{}, { 'x-csrf-token': 'wrong' }, { 'x-csrf-token': foreign }]) {
        const refused = await app.inject({
          method: 'POST',
          url: '/api/auth/logout',
          headers: withSession(session ?? '', header),
        });
        expect(refused.statusCode).toBe(403);
        expect(refused.json()).toMatchObject({ code: 'CSRF_VALIDATION_FAILED' });
      }
      expect(
        await postgres.sql('SELECT count(*) FROM auth_session WHERE revoked_at IS NOT NULL'),
      ).toBe('0');

      const logout = await app.inject({
        method: 'POST',
        url: '/api/auth/logout',
        headers: withSession(session ?? '', { 'x-csrf-token': own }),
      });
      expect(logout.statusCode).toBe(200);
      expect(logout.headers['set-cookie']).toBe(
        '__Host-vertex-session=; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=Strict',
      );
      // The API ended the provider session itself; the browser gets no token (invariant 2).
      expect(logout.json()).toEqual({ logoutUrl: 'http://127.0.0.1:4300/' });
      for (const token of provider.issued) expect(logout.body).not.toContain(token);
      expect(provider.endedSessions).toHaveLength(1);
      expect(provider.issued).toContain(provider.endedSessions[0]);

      const after = await app.inject({
        method: 'GET',
        url: '/api/auth/session',
        headers: withSession(session ?? ''),
      });
      expect(after.json()).toMatchObject({ code: 'AUTH_SESSION_INVALID' });
      const again = await app.inject({
        method: 'POST',
        url: '/api/auth/logout',
        headers: withSession(session ?? '', { 'x-csrf-token': own }),
      });
      expect(again.statusCode).toBe(401);
      expect(
        await postgres.sql(
          "SELECT revocation_reason || '|' || (id_token_ciphertext IS NULL) FROM auth_session WHERE revoked_at IS NOT NULL",
        ),
      ).toBe('LOGOUT|true');
    });

    it('never changes state on safe methods', async () => {
      const user = await seedUser('ACTIVE');
      const { session } = await signIn({ subject: user.subject });
      await postgres.sql('TRUNCATE audit_record');
      for (const url of ['/api/auth/session', '/api/auth/csrf', '/api/auth/logout']) {
        await app.inject({ method: 'GET', url, headers: withSession(session ?? '') });
      }
      expect(
        await postgres.sql('SELECT count(*) FROM auth_session WHERE revoked_at IS NOT NULL'),
      ).toBe('0');
      expect(await audit()).toEqual([]);
    });
  });

  it('revokes the session on the next request once the user is no longer ACTIVE', async () => {
    const user = await seedUser('ACTIVE');
    const { session } = await signIn({ subject: user.subject });
    await postgres.sql(
      `UPDATE iam_application_user SET access_state = 'SUSPENDED' WHERE id = '${user.id}'`,
    );
    const denied = await app.inject({
      method: 'GET',
      url: '/api/auth/session',
      headers: withSession(session ?? ''),
    });
    expect(denied.statusCode).toBe(403);
    expect(denied.json()).toMatchObject({ code: 'IAM_USER_INACTIVE' });
    expect(await postgres.sql('SELECT revocation_reason FROM auth_session')).toBe('ACCESS_REVOKED');
    await postgres.sql(
      `UPDATE iam_application_user SET access_state = 'ACTIVE' WHERE id = '${user.id}'`,
    );
    const stillRevoked = await app.inject({
      method: 'GET',
      url: '/api/auth/session',
      headers: withSession(session ?? ''),
    });
    expect(stillRevoked.json()).toMatchObject({ code: 'AUTH_SESSION_INVALID' });
  });

  describe('re-validation against the provider (IAM-R03F)', () => {
    async function sessionAfterInterval(session: string) {
      clockOffset += 61_000;
      return app.inject({ method: 'GET', url: '/api/auth/session', headers: withSession(session) });
    }

    it('refreshes the provider session once the interval has passed, and slides the deadline', async () => {
      const user = await seedUser('ACTIVE');
      const { session } = await signIn({ subject: user.subject });
      const before = provider.refreshed;
      const response = await sessionAfterInterval(session ?? '');
      expect(response.statusCode).toBe(200);
      expect(provider.refreshed).toBe(before + 1);
      // The rotated tokens stay on the server (Done means 4).
      const answered = `${response.body}${JSON.stringify(response.headers)}`;
      for (const token of provider.issued) expect(answered).not.toContain(token);
      const { session: deadlines } = response.json() as { session: { idleExpiresAt: string } };
      expect(new Date(deadlines.idleExpiresAt).getTime()).toBeGreaterThan(
        Date.now() + clockOffset + 29 * 60_000,
      );
      // Within the interval, no further refresh.
      await app.inject({
        method: 'GET',
        url: '/api/auth/session',
        headers: withSession(session ?? ''),
      });
      expect(provider.refreshed).toBe(before + 1);
    });

    it('revokes the session when the provider session ended without a back-channel call', async () => {
      const user = await seedUser('ACTIVE');
      const { session } = await signIn({ subject: user.subject, sessionId: 'kc-silently-ended' });
      provider.endedProviderSessions.add('kc-silently-ended');
      const response = await sessionAfterInterval(session ?? '');
      expect(response.statusCode).toBe(401);
      expect(response.json()).toMatchObject({ code: 'AUTH_SESSION_INVALID' });
      expect(String(response.headers['set-cookie'])).toMatch(/^__Host-vertex-session=;/);
      expect(
        await postgres.sql(
          'SELECT revocation_reason, refresh_token_ciphertext IS NULL, id_token_ciphertext IS NULL FROM auth_session',
        ),
      ).toBe('PROVIDER_SESSION_ENDED|t|t');
      expect(
        await postgres.sql(
          "SELECT actor_process FROM audit_record WHERE action = 'iam.session.revoked'",
        ),
      ).toBe('iam.session-check');
      expect(lines.join('')).toContain('"reason":"provider-session-ended"');
    });

    it('keeps the session, without extending it, while the provider is unreachable', async () => {
      const user = await seedUser('ACTIVE');
      const { session } = await signIn({ subject: user.subject });
      const idle = await postgres.sql('SELECT idle_expires_at FROM auth_session');
      provider.offline = true;
      try {
        const response = await sessionAfterInterval(session ?? '');
        expect(response.statusCode).toBe(200);
      } finally {
        provider.offline = false;
      }
      expect(await postgres.sql('SELECT idle_expires_at FROM auth_session')).toBe(idle);
      expect(lines.join('')).toContain('"auth":"session-revalidation-unavailable"');
    });
  });

  describe('back-channel logout (spec Section 33)', () => {
    const post = (payload: string) =>
      app.inject({
        method: 'POST',
        url: '/api/auth/backchannel-logout',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        payload,
      });

    it('revokes the sessions of the named Keycloak session, idempotently', async () => {
      const user = await seedUser('ACTIVE');
      const target = await signIn({ subject: user.subject, sessionId: 'kc-session-a' });
      const other = await signIn({ subject: user.subject, sessionId: 'kc-session-b' });
      const token = await provider.logoutToken({ sid: 'kc-session-a', sub: user.subject });

      const first = await post(`logout_token=${token}`);
      expect(first.statusCode).toBe(200);
      expect(first.body).toBe('');
      expect(first.headers['cache-control']).toBe('no-store');
      expect((await post(`logout_token=${token}`)).statusCode).toBe(200);

      const revoked = await app.inject({
        method: 'GET',
        url: '/api/auth/session',
        headers: withSession(target.session ?? ''),
      });
      expect(revoked.json()).toMatchObject({ code: 'AUTH_SESSION_INVALID' });
      const kept = await app.inject({
        method: 'GET',
        url: '/api/auth/session',
        headers: withSession(other.session ?? ''),
      });
      expect(kept.statusCode).toBe(200);
      expect(await audit()).toContain('iam.session.revoked:SUCCEEDED');
      expect(
        await postgres.sql(
          "SELECT actor_process FROM audit_record WHERE action = 'iam.session.revoked'",
        ),
      ).toBe('iam.backchannel-logout');
    });

    it('revokes every session of a subject when no session is named', async () => {
      const user = await seedUser('ACTIVE');
      await signIn({ subject: user.subject });
      await signIn({ subject: user.subject });
      const token = await provider.logoutToken({ sid: undefined, sub: user.subject });
      expect((await post(`logout_token=${token}`)).statusCode).toBe(200);
      expect(
        await postgres.sql(
          "SELECT count(*) FROM auth_session WHERE revocation_reason = 'BACKCHANNEL_LOGOUT'",
        ),
      ).toBe('2');
    });

    it('rejects forged tokens and revokes nothing', async () => {
      const user = await seedUser('ACTIVE');
      await signIn({ subject: user.subject, sessionId: 'kc-session-c' });
      for (const token of [
        await provider.logoutToken({ sid: 'kc-session-c' }, 'stranger'),
        await provider.logoutToken({ sid: 'kc-session-c', aud: 'account-console' }),
        await provider.logoutToken({ sid: 'kc-session-c', nonce: 'n' }),
      ]) {
        const response = await post(`logout_token=${token}`);
        expect(response.statusCode).toBe(400);
        expect(response.json()).toEqual({ error: 'invalid_request' });
      }
      expect(
        await postgres.sql('SELECT count(*) FROM auth_session WHERE revoked_at IS NOT NULL'),
      ).toBe('0');
      // Each refusal is a security event naming the client only (spec Section 33; CP1-14).
      expect(await backchannelEvidence()).toEqual([
        'REFUSED|iam.oidc-client|vertex-web|iam.backchannel-logout|{"after": {"failure": "rejected"}}',
        'REFUSED|iam.oidc-client|vertex-web|iam.backchannel-logout|{"after": {"failure": "rejected"}}',
        'REFUSED|iam.oidc-client|vertex-web|iam.backchannel-logout|{"after": {"failure": "rejected"}}',
      ]);
    });

    it('records a valid logout token that matches no session, without identifiers', async () => {
      const user = await seedUser('ACTIVE');
      const token = await provider.logoutToken({ sid: 'kc-session-unknown', sub: user.subject });
      expect((await post(`logout_token=${token}`)).statusCode).toBe(200);
      expect(await backchannelEvidence()).toEqual([
        'SUCCEEDED|iam.oidc-client|vertex-web|iam.backchannel-logout|{"after": {"matched": "none"}}',
      ]);
      const record = await postgres.sql(
        "SELECT row_to_json(r)::text FROM audit_record r WHERE action = 'iam.session.backchannel-logout'",
      );
      for (const value of ['kc-session-unknown', user.subject, user.id, token]) {
        expect(record).not.toContain(value);
      }
    });

    it('never leaves a live session when the logout arrives between code exchange and session insert', async () => {
      const user = await seedUser('ACTIVE');
      // Keycloak ends the SSO session while the API is still exchanging the code (R03 D-3).
      provider.beforeCodeGrantAnswer = async () => {
        const token = await provider.logoutToken({ sid: 'kc-session-racing', sub: user.subject });
        expect((await post(`logout_token=${token}`)).statusCode).toBe(200);
      };
      const { response, session } = await signIn({
        subject: user.subject,
        sessionId: 'kc-session-racing',
      });
      expect(response.headers['location']).toBe('/?authError=AUTH_LOGIN_FAILED');
      expect(session).toBeUndefined();
      expect(
        await postgres.sql(
          "SELECT revocation_reason || '|' || (id_token_ciphertext IS NULL) FROM auth_session",
        ),
      ).toBe('BACKCHANNEL_LOGOUT|true');
      expect(
        await postgres.sql(
          "SELECT actor_process FROM audit_record WHERE action = 'iam.session.revoked'",
        ),
      ).toBe('iam.backchannel-logout');
      // A later sign-in with another Keycloak session is not affected.
      expect((await signIn({ subject: user.subject })).session).toBeDefined();
    });
  });

  describe('rate and evidence limits (IAM-R09 D-03 to D-05)', () => {
    let limited: NestFastifyApplication;

    beforeAll(async () => {
      limited = await createApp(
        loadAppConfig({ NODE_ENV: 'test', LOG_LEVEL: 'info', DATABASE_URL: postgres.url }),
        testAuthConfig({
          KEYCLOAK_ISSUER_URL: FAKE_ISSUER,
          KEYCLOAK_WEB_CLIENT_SECRET: FAKE_CLIENT_SECRET,
          AUTH_RATE_LIMIT_SIGN_IN: '2',
          AUTH_RATE_LIMIT_LOGOUT: '1',
          AUTH_EVIDENCE_LIMIT: '1',
        }),
        testProvisioningConfig(),
        {
          logStream: { write: (line: string) => lines.push(line) },
          oidcFetch: provider.fetch,
        },
      );
      await limited.init();
      await limited.getHttpAdapter().getInstance().ready();
    });

    afterAll(async () => {
      await limited?.close();
    });

    const from = (address: string, extra: Record<string, string> = {}) => ({
      'x-forwarded-for': address,
      ...extra,
    });

    /** One sign-in from `address`: its login and callback use that address's whole budget. */
    async function signInFrom(address: string, subject: string): Promise<string> {
      const login = await limited.inject({
        method: 'GET',
        url: '/api/auth/login',
        headers: from(address),
      });
      const handle = cookieOf(login, LOGIN_COOKIE);
      if (handle) secrets.push(handle);
      const callback = new URL(provider.authorize(String(login.headers['location']), { subject }));
      const response = await limited.inject({
        method: 'GET',
        url: `${callback.pathname}${callback.search}`,
        headers: from(address, { cookie: `${LOGIN_COOKIE}=${handle}` }),
      });
      const session = cookieOf(response, SESSION_COOKIE);
      if (!session) throw new Error('sign-in failed');
      secrets.push(session);
      return session;
    }

    async function tokenOf(session: string): Promise<string> {
      const response = await limited.inject({
        method: 'GET',
        url: '/api/auth/csrf',
        headers: withSession(session),
      });
      const { token } = response.json() as { token: string };
      secrets.push(token);
      return token;
    }

    it('stores no login attempt for a refused login', async () => {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const login = await limited.inject({
          method: 'GET',
          url: '/api/auth/login',
          headers: from('198.51.100.10'),
        });
        const handle = cookieOf(login, LOGIN_COOKIE);
        if (handle) secrets.push(handle);
        expect(login.statusCode).toBe(attempt < 2 ? 302 : 303);
      }
      expect(await postgres.sql('SELECT count(*) FROM auth_login_attempt')).toBe('2');
    });

    it('refuses logout beyond the limit for an address with 429 and Retry-After', async () => {
      const user = await seedUser('ACTIVE');
      const first = await signInFrom('198.51.100.20', user.subject);
      const second = await signInFrom('198.51.100.21', user.subject);
      const logout = async (session: string) =>
        limited.inject({
          method: 'POST',
          url: '/api/auth/logout',
          headers: from('198.51.100.22', {
            ...withSession(session),
            'x-csrf-token': await tokenOf(session),
          }),
        });
      expect((await logout(first)).statusCode).toBe(200);
      const refused = await logout(second);
      expect(refused.statusCode).toBe(429);
      expect(refused.json()).toMatchObject({ code: 'RATE_LIMITED' });
      expect(Number(refused.headers['retry-after'])).toBeGreaterThan(0);
      expect(refused.headers['cache-control']).toBe('no-store');
      const still = await limited.inject({
        method: 'GET',
        url: '/api/auth/session',
        headers: withSession(second),
      });
      expect(still.statusCode).toBe(200);
    });

    it('bounds the evidence of refused logout tokens for the whole process, logging the suppression once (review S-1)', async () => {
      const start = lines.length;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const token = await provider.logoutToken({}, 'stranger');
        const response = await limited.inject({
          method: 'POST',
          url: '/api/auth/backchannel-logout',
          // Each refusal comes from another address; one budget still bounds them all.
          headers: from(`198.51.100.${30 + attempt}`, {
            'content-type': 'application/x-www-form-urlencoded',
          }),
          payload: `logout_token=${token}`,
        });
        expect(response.statusCode).toBe(400);
      }
      expect(await backchannelEvidence()).toHaveLength(1);
      const own = lines.slice(start);
      expect(
        own.filter((line) => line.includes('"auth":"backchannel-logout-rejected"')),
      ).toHaveLength(3);
      expect(own.filter((line) => line.includes('"auth":"evidence-limited"'))).toHaveLength(1);
    });
  });

  it('logs the database error of a Nest Logger call without its row data (A2-01)', async () => {
    let failure: unknown;
    try {
      await authPersistenceOf(database).authSession.findUnique({
        where: { id: 'sentinel-input-4d2a' },
      });
    } catch (error) {
      failure = error;
    }
    expect(String(failure)).toContain('sentinel-input-4d2a');
    // Inspects its own lines only: the suite-wide capture stays whole for the final scan.
    const start = lines.length;
    new Logger('A2-01').error(failure);
    const own = lines.slice(start).join('');
    expect(own).not.toContain('sentinel-input-4d2a');
    expect(own).toContain('Database error; only its allowlisted description is logged.');
  });
});
