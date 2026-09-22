import type { SchemaObject } from '@nestjs/swagger';

/** OpenAPI description of {@link import('../http/problem-details.js').ProblemDetails}. */
export const ProblemDetailsSchema: SchemaObject = {
  type: 'object',
  required: ['type', 'title', 'status', 'instance', 'code', 'traceId'],
  properties: {
    type: { type: 'string', example: 'about:blank' },
    title: { type: 'string', example: 'Service Unavailable' },
    status: { type: 'integer', example: 503 },
    detail: { type: 'string', example: 'PostgreSQL is not reachable.' },
    instance: { type: 'string', example: '/api/health/ready' },
    code: { type: 'string', example: 'NOT_READY' },
    traceId: { type: 'string', example: '7f0c5d8e-2f4b-4b8e-9a51-2c7d1e0b6a3f' },
  },
};
