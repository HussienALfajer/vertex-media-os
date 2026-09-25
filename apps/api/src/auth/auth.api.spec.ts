import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testAuthConfig } from '../../test-support/auth-config.js';
import { testProvisioningConfig } from '../../test-support/provisioning-config.js';
import { createApp } from '../app.factory.js';
import { loadAppConfig } from '../config/app-config.js';
import { createOpenApiDocument } from '../openapi/openapi.js';

const SENTINEL = 'sentinel-7f3a9c';

describe('local authentication HTTP surface', () => {
  let app: NestFastifyApplication;
  const logs: string[] = [];

  beforeAll(async () => {
    app = await createApp(
      loadAppConfig({
        NODE_ENV: 'test',
        DATABASE_URL: 'postgresql://vertex:unused@127.0.0.1:1/vertex_os',
      }),
      testAuthConfig({ AUTH_RATE_LIMIT_SIGN_IN: '2' }),
      testProvisioningConfig(),
      { logStream: { write: (line: string) => logs.push(line) } },
    );
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('requires a session for session, CSRF and logout', async () => {
    for (const [method, url] of [
      ['GET', '/api/auth/session'],
      ['GET', '/api/auth/csrf'],
      ['POST', '/api/auth/logout'],
    ] as const) {
      const response = await app.inject({ method, url });
      expect(response.statusCode).toBe(401);
      expect(response.json().code).toBe('AUTHENTICATION_REQUIRED');
    }
  });

  it('clears an invalid session cookie', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/auth/session',
      headers: { cookie: `__Host-vertex-session=${SENTINEL}` },
    });
    expect(response.statusCode).toBe(401);
    expect(response.json().code).toBe('AUTH_SESSION_INVALID');
    expect(response.headers['set-cookie']).toContain('__Host-vertex-session=;');
  });

  it('accepts only a bounded JSON login body', async () => {
    const malformed = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'user@example.invalid', password: SENTINEL, extra: SENTINEL },
    });
    expect(malformed.statusCode).toBe(400);
    expect(malformed.body).not.toContain(SENTINEL);
    const form = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: 'email=x&password=y',
    });
    expect(form.statusCode).toBe(415);
  });

  it('rate limits login before reaching the database', async () => {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { email: 'user@example.invalid', password: 'long enough password for test' },
      });
      expect(response.statusCode).toBe(500);
    }
    const limited = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'user@example.invalid', password: 'long enough password for test' },
    });
    expect(limited.statusCode).toBe(429);
    expect(limited.headers['retry-after']).toBeDefined();
    expect(logs.join('')).not.toContain('long enough password for test');
  });

  it('documents local login and no external callback endpoints', () => {
    const paths = createOpenApiDocument(app).paths;
    expect(paths['/api/auth/login']?.post).toBeDefined();
    expect(paths['/api/auth/login']?.get).toBeUndefined();
    expect(paths['/api/auth/callback']).toBeUndefined();
    expect(paths['/api/auth/backchannel-logout']).toBeUndefined();
    expect(paths['/api/auth/logout']?.post?.security).toEqual([{ session: [] }]);
  });
});
