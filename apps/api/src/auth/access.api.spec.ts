import { ModulesContainer, Reflector } from '@nestjs/core';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testAuthConfig } from '../../test-support/auth-config.js';
import { createProbeApp } from '../../test-support/probe-app.js';
import { createApp } from '../app.factory.js';
import { loadAppConfig } from '../config/app-config.js';
import { createOpenApiDocument } from '../openapi/openapi.js';
import { PUBLIC_ROUTE } from './access.guard.js';
import { testProvisioningConfig } from '../../test-support/provisioning-config.js';

/**
 * Protected by default (spec Section 24; IAM-R04 D-01, D-02), over Fastify inject with neither
 * PostgreSQL nor an identity provider reachable: without a session nothing reaches either.
 */
const config = () =>
  loadAppConfig({
    NODE_ENV: 'test',
    LOG_LEVEL: 'info',
    DATABASE_URL: 'postgresql://vertex:unused@127.0.0.1:1/vertex_os',
  });

/** The only routes that may answer without an application session (D-02). */
const PUBLIC_ROUTES = ['GET /api/health/live', 'GET /api/health/ready', 'POST /api/auth/login'];

const METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const;

describe('protected by default', () => {
  let app: NestFastifyApplication;
  let probe: NestFastifyApplication;
  const lines: string[] = [];

  beforeAll(async () => {
    app = await createApp(config(), testAuthConfig(), testProvisioningConfig(), {
      logStream: { write: () => undefined },
    });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    probe = await createProbeApp(config(), testAuthConfig(), {
      logStream: { write: (line: string) => lines.push(line) },
    });
  });

  afterAll(async () => {
    await app?.close();
    await probe?.close();
  });

  it('has exactly the public routes of the specification; every other route needs a session', async () => {
    const paths = createOpenApiDocument(app).paths;
    const routes = Object.entries(paths).flatMap(([path, item]) =>
      METHODS.filter((method) => item[method] !== undefined).map(
        (method) => [method.toUpperCase() as Uppercase<typeof method>, path] as const,
      ),
    );
    expect(routes.length).toBeGreaterThan(PUBLIC_ROUTES.length);

    const open: string[] = [];
    for (const [method, url] of routes) {
      const response = await app.inject({ method, url });
      if (response.statusCode === 401) {
        expect(response.json()).toMatchObject({ code: 'AUTHENTICATION_REQUIRED' });
      } else {
        open.push(`${method} ${url}`);
      }
    }
    expect(open.sort()).toEqual(PUBLIC_ROUTES);
  });

  it('marks exactly the handlers of those routes public', () => {
    const reflector = new Reflector();
    const marked: string[] = [];
    for (const module of app.get(ModulesContainer).values()) {
      for (const wrapper of module.controllers.values()) {
        const prototype = (wrapper.metatype as { prototype: object }).prototype;
        for (const name of Object.getOwnPropertyNames(prototype)) {
          const handler = (prototype as Record<string, unknown>)[name];
          if (typeof handler !== 'function' || name === 'constructor') continue;
          if (reflector.get<boolean | undefined>(PUBLIC_ROUTE, handler) === true) {
            marked.push(`${wrapper.name}.${name}`);
          }
        }
      }
    }
    expect(marked.sort()).toEqual([
      'AuthController.login',
      'HealthController.live',
      'HealthController.ready',
    ]);
  });

  it('protects the HEAD form of a protected GET route', async () => {
    const response = await app.inject({ method: 'HEAD', url: '/api/auth/session' });
    expect(response.statusCode).toBe(401);
  });

  it('protects a route whose author added no annotation, for safe and unsafe methods', async () => {
    for (const method of ['GET', 'HEAD', 'POST'] as const) {
      const response = await probe.inject({ method, url: '/api/probe/unmarked' });
      expect(response.statusCode).toBe(401);
      if (method !== 'HEAD') {
        expect(response.json()).toMatchObject({ code: 'AUTHENTICATION_REQUIRED' });
      }
    }
    const forged = await probe.inject({
      method: 'GET',
      url: '/api/probe/unmarked',
      headers: { cookie: '__Host-vertex-session=forged' },
    });
    expect(forged.statusCode).toBe(401);
    expect(forged.json()).toMatchObject({ code: 'AUTH_SESSION_INVALID' });
  });

  it('asks for a session before it looks at a required permission', async () => {
    for (const method of ['GET', 'POST'] as const) {
      const response = await probe.inject({ method, url: '/api/probe/guarded' });
      expect(response.statusCode).toBe(401);
      expect(response.json()).toMatchObject({ code: 'AUTHENTICATION_REQUIRED' });
    }
  });

  it('refuses a route declared both public and permission-protected', async () => {
    lines.length = 0;
    const response = await probe.inject({ method: 'GET', url: '/api/probe/contradiction' });
    expect(response.statusCode).toBe(500);
    expect(response.json()).toMatchObject({ code: 'INTERNAL_SERVER_ERROR' });
    expect(response.body).not.toContain('reached');
    expect(lines.join('')).toContain('request failed with an unexpected error');
  });
});
