import { STATUS_CODES } from 'node:http';
import { type ArgumentsHost, Catch, type ExceptionFilter, HttpException } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';

export const PROBLEM_CONTENT_TYPE = 'application/problem+json';

/**
 * RFC 9457 Problem Details, extended with the stable application fields defined
 * by docs/ENGINEERING.md (Error Model): a machine-readable `code` and the request
 * correlation identifier as `traceId`.
 */
export interface ProblemDetails {
  readonly type: string;
  readonly title: string;
  readonly status: number;
  readonly detail?: string;
  readonly instance: string;
  readonly code: string;
  readonly traceId: string;
}

interface ProblemContext {
  readonly url: string;
  readonly requestId: string;
}

const INTERNAL_SERVER_ERROR = 500;

/**
 * Maps any thrown value to Problem Details. Only deliberate HTTP exceptions may
 * contribute a `detail`; unexpected errors are reported generically so internals
 * (stack traces, database or infrastructure messages) never reach clients.
 */
export function toProblemDetails(exception: unknown, context: ProblemContext): ProblemDetails {
  const isHttpException = exception instanceof HttpException;
  const status = isHttpException ? exception.getStatus() : INTERNAL_SERVER_ERROR;
  const explicitCode = isHttpException ? exception.errorCode : undefined;
  const exposeDetail =
    isHttpException && (status < INTERNAL_SERVER_ERROR || explicitCode !== undefined);

  return {
    // `about:blank`: the problem is fully described by the HTTP status (RFC 9457, Section 4.2.1).
    type: 'about:blank',
    title: STATUS_CODES[status] ?? 'Unknown Error',
    status,
    ...(exposeDetail ? { detail: exception.message } : {}),
    instance: context.url.split('?', 1)[0] ?? context.url,
    code: explicitCode ?? codeForStatus(status),
    traceId: context.requestId,
  };
}

/** `404` -> `NOT_FOUND`, `503` -> `SERVICE_UNAVAILABLE`, derived from the standard reason phrase. */
function codeForStatus(status: number): string {
  const phrase = STATUS_CODES[status];
  return phrase === undefined
    ? `HTTP_${status}`
    : phrase
        .replace(/[^A-Za-z0-9]+/g, '_')
        .replace(/^_|_$/g, '')
        .toUpperCase();
}

/**
 * Global filter producing one response shape for every failure, including
 * Nest's route-not-found handling and errors raised by Fastify itself.
 */
@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<FastifyRequest>();
    const reply = http.getResponse<FastifyReply>();

    if (!(exception instanceof HttpException)) {
      request.log.error({ err: exception }, 'request failed with an unexpected error');
    }

    if (reply.sent) {
      return;
    }

    const problem = toProblemDetails(exception, { url: request.url, requestId: request.id });
    void reply.status(problem.status).type(PROBLEM_CONTENT_TYPE).send(problem);
  }
}
