import helmet from '@fastify/helmet';
import { UnsupportedMediaTypeException } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import type { FastifyLoggerOptions } from 'fastify';
import { AppModule, type AppModuleOptions } from './app.module.js';
import { type AppConfig } from './config/app-config.js';
import type { AuthConfig } from './config/auth-config.js';
import type { IdentityProvisioningConfig } from './config/identity-provisioning-config.js';
import { ProblemDetailsFilter } from './http/problem-details.js';
import { REQUEST_ID_HEADER, resolveRequestId } from './http/request-id.js';
import { PinoLoggerService } from './logging/pino-logger.service.js';
import { safeErrorSerializer } from './logging/safe-error-serializer.js';
import { safeRequestSerializer } from './logging/safe-request-serializer.js';
import { serveApiDocs } from './openapi/openapi.js';

/** Stable prefix of every HTTP route; the web application reaches the API through it. */
export const API_PREFIX = 'api';

/** Fastify's default request body limit (1 MiB), stated explicitly so it is a reviewed choice. */
const BODY_LIMIT_BYTES = 1_048_576;

/** The one route that takes a form body: Keycloak's back-channel logout (spec Section 33). */
const FORM_BODY_ROUTE = `/${API_PREFIX}/auth/backchannel-logout`;
const FORM_BODY_LIMIT_BYTES = 32_768;

export interface CreateAppOptions extends AppModuleOptions {
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
  auth: AuthConfig,
  provisioning: IdentityProvisioningConfig,
  options: CreateAppOptions = {},
): Promise<NestFastifyApplication> {
  const { logStream, ...moduleOptions } = options;
  const adapter = new FastifyAdapter({
    logger: {
      level: config.logging.level,
      // `err`: database errors are logged as allowlisted descriptions (IAM-02 D-15). `req`: the
      // path without its query string, which can carry OIDC codes and state (IAM-R03 D-20).
      serializers: { err: safeErrorSerializer, req: safeRequestSerializer },
      ...(logStream ? { stream: logStream } : {}),
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
  // Form bodies are accepted by the back-channel logout route only; any other route answers 415.
  fastify.addContentTypeParser(
    'application/x-www-form-urlencoded',
    { parseAs: 'string', bodyLimit: FORM_BODY_LIMIT_BYTES },
    (request, body, done) => {
      if (request.url.split('?', 1)[0] !== FORM_BODY_ROUTE) {
        done(new UnsupportedMediaTypeException('Form bodies are not accepted here.'), undefined);
        return;
      }
      done(null, Object.fromEntries(new URLSearchParams(String(body))));
    },
  );

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule.forRoot(config, auth, provisioning, moduleOptions),
    adapter,
    {
      logger: new PinoLoggerService(fastify.log),
      abortOnError: false,
      // Nest would add its own JSON and form parsers for every route. Fastify's built-in JSON parser
      // (prototype-poisoning checks on) and the restricted form parser above are the only ones.
      bodyParser: false,
    },
  );

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
