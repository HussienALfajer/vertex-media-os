import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { AuthRuntime } from './auth-runtime.js';
import { requireSession } from './request-session.js';

/** Injection token of the composed {@link AuthRuntime}. */
export const AUTH_RUNTIME = Symbol('AUTH_RUNTIME');

/** Header carrying the CSRF synchronizer token on unsafe requests (IAM-R03 D-18). */
export const CSRF_HEADER = 'x-csrf-token';

const CSRF_EXEMPT = 'vertex:csrf-exempt';

/**
 * Marks a route that is authenticated by its protocol rather than by the browser session, and so
 * takes no CSRF token. Only the back-channel logout endpoint uses it (spec Section 24).
 */
export const CsrfExempt = (): MethodDecorator => SetMetadata(CSRF_EXEMPT, true);

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Global guard (spec Section 15): every unsafe request needs a valid application session and that
 * session's CSRF token in `X-CSRF-Token`. It fails closed: a route is exempt only when it says so,
 * so a new unsafe endpoint is protected without any annotation.
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(
    @Inject(AUTH_RUNTIME) private readonly runtime: AuthRuntime,
    @Inject(Reflector) private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const http = context.switchToHttp();
    const request = http.getRequest<FastifyRequest>();
    if (SAFE_METHODS.has(request.method)) return true;
    if (this.reflector.getAllAndOverride<boolean>(CSRF_EXEMPT, [context.getHandler()])) return true;

    const { session } = await requireSession(
      this.runtime,
      request,
      http.getResponse<FastifyReply>(),
    );
    const presented = request.headers[CSRF_HEADER];
    if (typeof presented !== 'string' || !this.runtime.sessions.verifyCsrf(session, presented)) {
      request.log.warn({ auth: 'csrf-rejected' }, 'CSRF validation failed');
      throw new ForbiddenException('CSRF validation failed.', {
        errorCode: 'CSRF_VALIDATION_FAILED',
      });
    }
    return true;
  }
}
