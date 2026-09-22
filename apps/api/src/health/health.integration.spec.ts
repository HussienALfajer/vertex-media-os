import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../app.factory.js';
import { loadAppConfig } from '../config/app-config.js';

// Same image as infra/compose.yaml and the database package tests.
const POSTGRES_IMAGE = 'postgres:18.6-alpine';

describe('GET /api/health/ready against real PostgreSQL (Testcontainers)', () => {
  let postgres: StartedPostgreSqlContainer | undefined;
  let app: NestFastifyApplication;

  beforeAll(async () => {
    postgres = await new PostgreSqlContainer(POSTGRES_IMAGE).start();
    app = await createApp(
      loadAppConfig({
        NODE_ENV: 'test',
        LOG_LEVEL: 'silent',
        DATABASE_URL: postgres.getConnectionUri(),
      }),
    );
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app?.close();
    await postgres?.stop();
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
