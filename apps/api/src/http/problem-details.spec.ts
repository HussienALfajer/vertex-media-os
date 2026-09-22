import {
  BadRequestException,
  InternalServerErrorException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { toProblemDetails } from './problem-details.js';

const context = { url: '/api/example?token=abc', requestId: 'req-1' };

describe('toProblemDetails', () => {
  it('reports unexpected errors as a generic 500 without exposing their message', () => {
    const problem = toProblemDetails(
      new Error('connect ECONNREFUSED postgresql://vertex:secret@db:5432/app'),
      context,
    );

    expect(problem).toEqual({
      type: 'about:blank',
      title: 'Internal Server Error',
      status: 500,
      instance: '/api/example',
      code: 'INTERNAL_SERVER_ERROR',
      traceId: 'req-1',
    });
    expect(JSON.stringify(problem)).not.toContain('secret');
  });

  it('keeps the detail of deliberate client errors', () => {
    const problem = toProblemDetails(new BadRequestException('Missing field "name".'), context);

    expect(problem).toMatchObject({
      status: 400,
      title: 'Bad Request',
      detail: 'Missing field "name".',
      code: 'BAD_REQUEST',
    });
  });

  it('uses the explicit application error code and detail of a deliberate server error', () => {
    const problem = toProblemDetails(
      new ServiceUnavailableException('PostgreSQL is not reachable.', { errorCode: 'NOT_READY' }),
      context,
    );

    expect(problem).toMatchObject({
      status: 503,
      detail: 'PostgreSQL is not reachable.',
      code: 'NOT_READY',
    });
  });

  it('hides the message of server errors that carry no explicit application code', () => {
    const problem = toProblemDetails(
      new InternalServerErrorException('pool exhausted at 10.0.0.7'),
      context,
    );

    expect(problem).not.toHaveProperty('detail');
    expect(problem.code).toBe('INTERNAL_SERVER_ERROR');
  });
});
