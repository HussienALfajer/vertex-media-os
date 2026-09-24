import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { getContainerRuntimeClient } from 'testcontainers';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp, type CreateAppOptions } from '../app.factory.js';
import { testAuthConfig } from '../../test-support/auth-config.js';
import { type LogLevel, loadAppConfig } from '../config/app-config.js';
import { testProvisioningConfig } from '../../test-support/provisioning-config.js';

// Same image as infra/compose.yaml and the database package tests.
const POSTGRES_IMAGE = 'postgres:18.6-alpine';

async function startApp(
  databaseUrl: string,
  logLevel: LogLevel = 'silent',
  options: CreateAppOptions = {},
): Promise<NestFastifyApplication> {
  const app = await createApp(
    loadAppConfig({ NODE_ENV: 'test', LOG_LEVEL: logLevel, DATABASE_URL: databaseUrl }),
    testAuthConfig(),
    testProvisioningConfig(),
    options,
  );
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return app;
}

describe('GET /api/health/ready against real PostgreSQL (Testcontainers)', () => {
  let postgres: StartedPostgreSqlContainer | undefined;
  let app: NestFastifyApplication;

  beforeAll(async () => {
    postgres = await new PostgreSqlContainer(POSTGRES_IMAGE).start();
    app = await startApp(postgres.getConnectionUri());
  });

  afterAll(async () => {
    await app?.close();
    await postgres?.stop();
  });

  it('reports not-ready without logging connection details when PostgreSQL rejects the credentials', async () => {
    // PostgreSQL's authentication error names the user; the log must not repeat it.
    const url = new URL(postgres?.getConnectionUri() ?? '');
    url.username = 'sentinel_user';
    url.password = 'sentinel-password-7c1e';
    url.pathname = '/sentinel_db';
    const lines: string[] = [];
    const rejected = await startApp(url.toString(), 'warn', {
      logStream: { write: (line) => lines.push(line) },
    });
    try {
      const response = await rejected.inject({ method: 'GET', url: '/api/health/ready' });

      expect(response.statusCode).toBe(503);
      expect(response.json()).toMatchObject({ status: 503, code: 'NOT_READY' });
      const output = lines.join('');
      expect(output).toContain('readiness check failed');
      for (const leaked of ['sentinel', `${url.hostname}:${url.port}`, 'postgres://']) {
        expect(output).not.toContain(leaked);
        expect(response.body).not.toContain(leaked);
      }
    } finally {
      await rejected.close();
    }
  });

  it('reports not-ready within its bounds while PostgreSQL is stalled and recovers afterwards', async () => {
    const warmUp = await app.inject({ method: 'GET', url: '/api/health/ready' });
    expect(warmUp.statusCode).toBe(200);

    // A paused container accepts TCP connections but never answers: a stalled server.
    const container = (await getContainerRuntimeClient()).container.getById(
      postgres?.getId() ?? '',
    );
    await container.pause();
    try {
      const startedAt = performance.now();
      const stalled = await app.inject({ method: 'GET', url: '/api/health/ready' });

      expect(stalled.statusCode).toBe(503);
      expect(stalled.json()).toMatchObject({ status: 503, code: 'NOT_READY' });
      // The database client's own bounds (2 s connect, 1 s statement) plus scheduling margin.
      expect(performance.now() - startedAt).toBeLessThan(4_000);
    } finally {
      await container.unpause();
    }

    const recovered = await app.inject({ method: 'GET', url: '/api/health/ready' });
    expect(recovered.statusCode).toBe(200);
  });

  it('reports ready while PostgreSQL answers and stops reporting ready once it goes away', async () => {
    const whileUp = await app.inject({ method: 'GET', url: '/api/health/ready' });

    expect(whileUp.statusCode).toBe(200);
    expect(whileUp.json()).toEqual({ status: 'ready' });

    await postgres?.stop();
    postgres = undefined;

    const afterStop = await app.inject({ method: 'GET', url: '/api/health/ready' });

    expect(afterStop.statusCode).toBe(503);
    expect(afterStop.headers['content-type']).toMatch(/^application\/problem\+json/);
    expect(afterStop.json()).toMatchObject({ status: 503, code: 'NOT_READY' });

    const liveness = await app.inject({ method: 'GET', url: '/api/health/live' });
    expect(liveness.statusCode).toBe(200);
  });
});
