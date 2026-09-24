import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, type OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import { namedSchemas } from './schemas.js';

/** Where the interactive documentation is served when enabled (never by default in production). */
export const API_DOCS_PATH = 'api/docs';

/** Builds the OpenAPI description of every route registered on `app`. */
export function createOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('Vertex OS API')
    .setDescription('Internal REST API of Vertex OS.')
    .setVersion('0.0.0')
    .addCookieAuth('__Host-vertex-session', { type: 'apiKey', in: 'cookie' }, 'session')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  // Components defined by Zod schemas (IAM-R07 D-17) join the ones Nest derived from classes.
  return {
    ...document,
    components: {
      ...document.components,
      schemas: { ...document.components?.schemas, ...namedSchemas() },
    },
  };
}

/** Serves Swagger UI at `/api/docs` and the JSON document at `/api/docs/openapi.json`. */
export function serveApiDocs(app: INestApplication): void {
  SwaggerModule.setup(API_DOCS_PATH, app, () => createOpenApiDocument(app), {
    jsonDocumentUrl: `${API_DOCS_PATH}/openapi.json`,
    raw: ['json'],
  });
}
