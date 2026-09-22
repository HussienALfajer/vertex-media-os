import helmet from '@fastify/helmet';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import type { FastifyLoggerOptions } from 'fastify';
import { AppModule } from './app.module.js';
import { type AppConfig } from './config/app-config.js';
import { ProblemDetailsFilter } from './http/problem-details.js';
import { REQUEST_ID_HEADER, resolveRequestId } from './http/request-id.js';
import { PinoLoggerService } from './logging/pino-logger.service.js';
import { serveApiDocs } from './openapi/openapi.js';

/** Stable prefix of every HTTP route; the web application reaches the API through it. */
export const API_PREFIX = 'api';

/** Fastify's default request body limit (1 MiB), stated explicitly so it is a reviewed choice. */
const BODY_LIMIT_BYTES = 1_048_576;

export interface CreateAppOptions {
  /** Destination of the JSON log records; standard output when omitted. Tests inspect logs through it. */
  readonly logStream?: NonNullable<FastifyLoggerOptions['stream']>;
}

/**
 * Creates the fully configured (not yet listening) Nest application on Fastify.
 * The server entry point, Fastify-injection tests and OpenAPI generation all use
 * this one factory, so they exercise the same middleware, filters and headers.
 */
export async function createApp(
  config: AppConfig,
  options: CreateAppOptions = {},
): Promise<NestFastifyApplication> {
  const adapter = new FastifyAdapter({
    logger: {
      level: config.logging.level,
      ...(options.logStream ? { stream: options.logStream } : {}),
    },
    // Request ids come only from `resolveRequestId`, which validates inbound values.
    requestIdHeader: false,
    genReqId: resolveRequestId,
    bodyLimit: BODY_LIMIT_BYTES,
  });

  const fastify = adapter.getInstance();
  fastify.addHook('onRequest', async (request, reply) => {
    void reply.header(REQUEST_ID_HEADER, request.id);
  });

  const app = await NestFactory.create<NestFastifyApplication>(AppModule.forRoot(config), adapter, {
    logger: new PinoLoggerService(fastify.log),
    abortOnError: false,
  });

  app.setGlobalPrefix(API_PREFIX);
  app.useGlobalFilters(new ProblemDetailsFilter());

  // CORS stays disabled: the browser reaches the API same-origin (Vite proxy in development).
  await app.register(helmet, {
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        'frame-ancestors': ["'none'"],
        // The API serves no mixed content; HTTPS is enforced by HSTS once deployed behind TLS.
        'upgrade-insecure-requests': null,
      },
    },
    frameguard: { action: 'deny' },
  });

  if (config.docs.enabled) {
    serveApiDocs(app);
  }

  return app;
}
