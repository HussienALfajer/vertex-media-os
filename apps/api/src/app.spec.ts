import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from './app.factory.js';
import { testAuthConfig } from '../test-support/auth-config.js';
import { loadAppConfig } from './config/app-config.js';
import { createOpenApiDocument } from './openapi/openapi.js';
import { testProvisioningConfig } from '../test-support/provisioning-config.js';

// TCP port 1 never hosts PostgreSQL: these tests prove the API behaves correctly without a database.
const UNREACHABLE_DATABASE_URL = 'postgresql://vertex:fake-test-password@127.0.0.1:1/vertex_os';

async function startApp(environment: Record<string, string> = {}): Promise<NestFastifyApplication> {
  const app = await createApp(
    loadAppConfig({
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      DATABASE_URL: UNREACHABLE_DATABASE_URL,
      ...environment,
    }),
    testAuthConfig(),
    testProvisioningConfig(),
  );
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return app;
}

describe('API over Fastify inject without PostgreSQL', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    app = await startApp();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('reports liveness without needing the database', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/health/live' });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toMatch(/^application\/json/);
    expect(response.json()).toEqual({ status: 'ok' });
  });

  it('reports not-ready as a 503 problem when PostgreSQL is unreachable', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/health/ready' });

    expect(response.statusCode).toBe(503);
    expect(response.headers['content-type']).toMatch(/^application\/problem\+json/);
    expect(response.json()).toEqual({
      type: 'about:blank',
      title: 'Service Unavailable',
      status: 503,
      detail: 'PostgreSQL is not reachable.',
      instance: '/api/health/ready',
      code: 'NOT_READY',
      traceId: response.headers['x-request-id'],
    });
    expect(response.body).not.toContain('fake-test-password');
    expect(response.body).not.toContain('127.0.0.1');
  });

  it('answers unknown routes with a 404 problem', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/does-not-exist?probe=1' });

    expect(response.statusCode).toBe(404);
    expect(response.headers['content-type']).toMatch(/^application\/problem\+json/);
    expect(response.json()).toMatchObject({
      type: 'about:blank',
      title: 'Not Found',
      status: 404,
      instance: '/api/does-not-exist',
      code: 'NOT_FOUND',
    });
  });

  it('answers unsupported methods on existing paths with a 404 problem', async () => {
    const response = await app.inject({ method: 'DELETE', url: '/api/health/live' });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ status: 404, code: 'NOT_FOUND' });
  });

  it('applies the security header baseline to every response', async () => {
    for (const url of ['/api/health/live', '/api/does-not-exist']) {
      const { headers } = await app.inject({ method: 'GET', url });

      expect(headers['x-content-type-options']).toBe('nosniff');
      expect(headers['x-frame-options']).toBe('DENY');
      expect(headers['referrer-policy']).toBe('no-referrer');
      expect(headers['strict-transport-security']).toMatch(/max-age=\d+/);
      expect(headers['content-security-policy']).toContain("frame-ancestors 'none'");
      expect(headers['content-security-policy']).toContain("object-src 'none'");
    }
  });

  it('does not grant cross-origin browser access', async () => {
    const simple = await app.inject({
      method: 'GET',
      url: '/api/health/live',
      headers: { origin: 'http://untrusted.example' },
    });
    const preflight = await app.inject({
      method: 'OPTIONS',
      url: '/api/health/live',
      headers: { origin: 'http://untrusted.example', 'access-control-request-method': 'GET' },
    });

    expect(simple.headers['access-control-allow-origin']).toBeUndefined();
    expect(preflight.statusCode).toBeGreaterThanOrEqual(400);
    expect(preflight.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('generates a request id when none is supplied and returns it', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/health/live' });

    expect(response.headers['x-request-id']).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it('propagates a well-formed inbound request id', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/does-not-exist',
      headers: { 'x-request-id': 'edge-proxy.4f1c:9a' },
    });

    expect(response.headers['x-request-id']).toBe('edge-proxy.4f1c:9a');
    expect(response.json()).toMatchObject({ traceId: 'edge-proxy.4f1c:9a' });
  });

  it('replaces a malformed inbound request id instead of trusting it', async () => {
    for (const hostile of ['has spaces', 'x'.repeat(129), 'quote"inside', '{"level":60}']) {
      const response = await app.inject({
        method: 'GET',
        url: '/api/health/live',
        headers: { 'x-request-id': hostile },
      });

      expect(response.headers['x-request-id']).not.toBe(hostile);
      expect(response.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    }
  });

  it('serves the OpenAPI document and UI outside production', async () => {
    const document = await app.inject({ method: 'GET', url: '/api/docs/openapi.json' });
    const ui = await app.inject({ method: 'GET', url: '/api/docs' });

    expect(document.statusCode).toBe(200);
    expect(Object.keys(document.json().paths)).toEqual(
      expect.arrayContaining(['/api/health/live', '/api/health/ready']),
    );
    expect(ui.statusCode).toBe(200);
    expect(ui.headers['content-type']).toMatch(/^text\/html/);
  });

  it('describes both health routes in the generated OpenAPI document', () => {
    const document = createOpenApiDocument(app);

    expect(document.paths['/api/health/live']?.get?.responses).toHaveProperty('200');
    expect(document.paths['/api/health/ready']?.get?.responses).toHaveProperty('200');
    expect(document.paths['/api/health/ready']?.get?.responses).toHaveProperty('503');
  });
});

describe('readiness failure logging', () => {
  // Every connection detail is a distinctive sentinel, so a leak anywhere in the log output shows up.
  const SENTINEL_DATABASE_URL =
    'postgresql://sentinel_user:sentinel-password-7c1e@127.0.0.1:1/sentinel_db';

  it('logs one structured, correlated warning without connection details', async () => {
    const lines: string[] = [];
    const app = await createApp(
      loadAppConfig({ NODE_ENV: 'test', LOG_LEVEL: 'warn', DATABASE_URL: SENTINEL_DATABASE_URL }),
      testAuthConfig(),
      testProvisioningConfig(),
      { logStream: { write: (line) => lines.push(line) } },
    );
    try {
      await app.init();
      await app.getHttpAdapter().getInstance().ready();

      const response = await app.inject({ method: 'GET', url: '/api/health/ready' });

      expect(response.statusCode).toBe(503);
      const records = lines.map((line) => JSON.parse(line) as Record<string, unknown>);
      const failures = records.filter((record) => record['msg'] === 'readiness check failed');
      expect(failures).toHaveLength(1);
      expect(failures[0]).toMatchObject({
        level: 40,
        reqId: response.headers['x-request-id'],
        dependency: 'postgresql',
        reason: 'DatabaseNotReachable',
        durationMs: expect.any(Number),
      });
      expect(failures[0]).not.toHaveProperty('err');
      expect(failures[0]).not.toHaveProperty('stack');

      const output = lines.join('');
      for (const leaked of ['sentinel', '127.0.0.1:1', 'postgresql://']) {
        expect(output).not.toContain(leaked);
      }
    } finally {
      await app.close();
    }
  });
});

describe('API documentation exposure', () => {
  it('does not serve the documentation UI or document when docs are disabled', async () => {
    const app = await startApp({ API_DOCS_ENABLED: 'false' });
    try {
      const ui = await app.inject({ method: 'GET', url: '/api/docs' });
      const document = await app.inject({ method: 'GET', url: '/api/docs/openapi.json' });

      expect(ui.statusCode).toBe(404);
      expect(document.statusCode).toBe(404);
    } finally {
      await app.close();
    }
  });
});
