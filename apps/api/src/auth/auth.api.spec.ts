import { Logger } from '@nestjs/common';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testAuthConfig } from '../../test-support/auth-config.js';
import { createApp } from '../app.factory.js';
import { loadAppConfig } from '../config/app-config.js';
import { createOpenApiDocument } from '../openapi/openapi.js';
import { testProvisioningConfig } from '../../test-support/provisioning-config.js';

/**
 * The authentication endpoints over Fastify inject, with neither PostgreSQL nor an identity
 * provider reachable: every path here must decide without them. Sessions, sign-in and CSRF with a
 * database are proven by the integration suites.
 */
const SENTINEL = 'sentinel-7f3a9c';

describe('authentication endpoints without PostgreSQL or Keycloak', () => {
  let app: NestFastifyApplication;
  const lines: string[] = [];

  beforeAll(async () => {
    app = await createApp(
      loadAppConfig({
        NODE_ENV: 'test',
        LOG_LEVEL: 'info',
        DATABASE_URL: 'postgresql://vertex:unused@127.0.0.1:1/vertex_os',
      }),
      testAuthConfig(),
      testProvisioningConfig(),
      { logStream: { write: (line: string) => lines.push(line) } },
    );
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app?.close();
  });

  const problem = (response: { json: () => unknown }) => response.json() as Record<string, unknown>;

  it('requires a session for the session and CSRF endpoints', async () => {
    for (const url of ['/api/auth/session', '/api/auth/csrf']) {
      const response = await app.inject({ method: 'GET', url });
      expect(response.statusCode).toBe(401);
      expect(response.headers['content-type']).toMatch(/^application\/problem\+json/);
      expect(problem(response)).toMatchObject({ code: 'AUTHENTICATION_REQUIRED' });
    }
  });

  it('rejects and clears a malformed session cookie without touching the database', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/auth/session',
      headers: { cookie: `__Host-vertex-session=${SENTINEL}` },
    });
    expect(response.statusCode).toBe(401);
    expect(problem(response)).toMatchObject({ code: 'AUTH_SESSION_INVALID' });
    expect(response.headers['set-cookie']).toBe(
      '__Host-vertex-session=; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=Strict',
    );
  });

  it('rejects every unsafe request without a session before any handler runs', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: { 'x-csrf-token': SENTINEL },
    });
    expect(response.statusCode).toBe(401);
    expect(problem(response)).toMatchObject({ code: 'AUTHENTICATION_REQUIRED' });
  });

  it('accepts form bodies on the back-channel route only', async () => {
    const elsewhere = await app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: 'a=b',
    });
    expect(elsewhere.statusCode).toBe(415);
    expect(elsewhere.headers['content-type']).toMatch(/^application\/problem\+json/);

    const missing = await app.inject({
      method: 'POST',
      url: '/api/auth/backchannel-logout',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: 'other=1',
    });
    expect(missing.statusCode).toBe(400);
    expect(missing.json()).toEqual({ error: 'invalid_request' });
    expect(missing.headers['cache-control']).toBe('no-store');
  });

  it('answers 400 when a logout token cannot be validated', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/backchannel-logout',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: `logout_token=${SENTINEL}`,
    });
    expect(response.statusCode).toBe(400);
    expect(response.body).not.toContain(SENTINEL);
  });

  it('refuses a logout token sent as JSON', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/backchannel-logout',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({ logout_token: SENTINEL }),
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: 'invalid_request' });
  });

  it('redirects with a stable code when the callback fails unexpectedly', async () => {
    // A well-formed login handle makes the callback query PostgreSQL, which is unreachable here.
    const response = await app.inject({
      method: 'GET',
      url: '/api/auth/callback?code=c&state=s',
      headers: { cookie: `__Host-vertex-login=${'a'.repeat(43)}` },
    });
    expect(response.statusCode).toBe(303);
    expect(response.headers['location']).toBe('/?authError=AUTH_LOGIN_FAILED');
    expect(response.headers['set-cookie']).toContain('__Host-vertex-login=; Path=/; Max-Age=0');
  });

  it('sends the browser back with a stable code when the provider is unreachable', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/auth/login' });
    expect(response.statusCode).toBe(303);
    expect(response.headers['location']).toBe('/?authError=IDENTITY_PROVIDER_UNAVAILABLE');
    expect(response.headers['set-cookie']).toBe(
      '__Host-vertex-login=; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=Lax',
    );
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('fails a callback without its login cookie and never logs the query string', async () => {
    lines.length = 0;
    const response = await app.inject({
      method: 'GET',
      url: `/api/auth/callback?code=${SENTINEL}-code&state=${SENTINEL}-state&iss=x`,
    });
    expect(response.statusCode).toBe(303);
    expect(response.headers['location']).toBe('/?authError=AUTH_LOGIN_FAILED');
    expect(response.headers['set-cookie']).toContain('__Host-vertex-login=; Path=/; Max-Age=0');
    const output = lines.join('');
    expect(output).toContain('"url":"/api/auth/callback"');
    expect(output).not.toContain(SENTINEL);
  });

  it('documents the six authentication endpoints', () => {
    const paths = createOpenApiDocument(app).paths;
    expect(paths['/api/auth/login']?.get).toBeDefined();
    expect(paths['/api/auth/callback']?.get).toBeDefined();
    expect(paths['/api/auth/session']?.get?.responses).toHaveProperty('401');
    expect(paths['/api/auth/csrf']?.get?.responses).toHaveProperty('200');
    expect(paths['/api/auth/logout']?.post?.responses).toHaveProperty('403');
    expect(paths['/api/auth/logout']?.post?.parameters).toContainEqual(
      expect.objectContaining({ name: 'X-CSRF-Token', in: 'header', required: true }),
    );
    expect(paths['/api/auth/logout']?.post?.security).toEqual([{ session: [] }]);
    expect(paths['/api/auth/backchannel-logout']?.post?.responses).toHaveProperty('400');
  });

  it('keeps error text and stack strings out of Nest logger lines (A2-01)', () => {
    lines.length = 0;
    const logger = new Logger('A2-01');
    logger.error(`message-${SENTINEL}`, `stack-${SENTINEL}`);
    const records = lines.map((line) => JSON.parse(line) as Record<string, unknown>);
    expect(records.at(-1)).toMatchObject({ stackOmitted: true, context: 'A2-01' });
    expect(lines.join('')).not.toContain(`stack-${SENTINEL}`);
  });
});
