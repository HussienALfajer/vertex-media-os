import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { hasPermission, type AuthorizationContext, type PermissionCode } from '@vertex-os/iam';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { AuthRuntime } from './auth-runtime.js';
import { requireAuthorization, requireSession, traceIdOf } from './request-session.js';

/** Injection token of the composed {@link AuthRuntime}; private to the authentication module. */
export const AUTH_RUNTIME = Symbol('AUTH_RUNTIME');

/**
 * The current-user capability (IAM-R04 D-10): the only authentication service other modules can
 * inject. It yields the current actor's authorization context, never the runtime, its secrets or
 * its session operations.
 */
export interface CurrentActor {
  require(request: FastifyRequest, reply: FastifyReply): Promise<AuthorizationContext>;
}

/** Injection token of {@link CurrentActor}. */
export const CURRENT_ACTOR = Symbol('CURRENT_ACTOR');

export function createCurrentActor(runtime: AuthRuntime): CurrentActor {
  return Object.freeze({
    require: (request: FastifyRequest, reply: FastifyReply) =>
      requireAuthorization(runtime, request, reply),
  });
}

/** Metadata key of {@link Public}; tests read it to pin the public set (D-02). */
export const PUBLIC_ROUTE = 'vertex:public';
const REQUIRED_PERMISSION = 'vertex:required-permission';

/**
 * Marks a route that needs no application session (spec Section 24; IAM-R04 D-01, D-02): health,
 * the OIDC login and callback, and back-channel logout, which its protocol authenticates. Read on
 * the handler only, so a method added to a public controller is protected.
 */
export const Public = (): MethodDecorator => SetMetadata(PUBLIC_ROUTE, true);

/**
 * Requires a coarse capability on a protected route (spec Section 16.1; IAM-R04 D-04). The owning
 * module still decides access to the specific resource (spec Section 16.3). One code per handler:
 * a second one would silently replace the first, so declaring it fails at load (review S-1).
 */
export const RequirePermission =
  (code: PermissionCode): MethodDecorator =>
  (target, key, descriptor) => {
    if (
      new Reflector().get<unknown>(
        REQUIRED_PERMISSION,
        descriptor.value as unknown as () => unknown,
      ) !== undefined
    ) {
      throw new Error(`Handler ${String(key)} declares more than one required permission.`);
    }
    SetMetadata(REQUIRED_PERMISSION, code)(target, key, descriptor);
  };

/**
 * The global access guard (spec Sections 15, 16.4, 24): every route requires a valid application
 * session, and on unsafe methods its CSRF token, unless its handler is `@Public()`. A route with
 * `@RequirePermission()` also requires that permission in the current authorization context. It
 * fails closed: forgetting an annotation leaves a route protected, never public.
 */
@Injectable()
export class AccessGuard implements CanActivate {
  constructor(
    @Inject(AUTH_RUNTIME) private readonly runtime: AuthRuntime,
    @Inject(Reflector) private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const handler = context.getHandler();
    const isPublic = this.reflector.get<boolean | undefined>(PUBLIC_ROUTE, handler) === true;
    const required = this.reflector.get<PermissionCode | undefined>(REQUIRED_PERMISSION, handler);
    if (isPublic && required !== undefined) {
      // A contradiction in the route's own declaration: refuse rather than guess (D-04).
      throw new Error(`Route ${handler.name} is both public and permission-protected.`);
    }
    if (isPublic) return true;

    const http = context.switchToHttp();
    const request = http.getRequest<FastifyRequest>();
    const reply = http.getResponse<FastifyReply>();
    await requireSession(this.runtime, request, reply);
    if (required === undefined) return true;

    const actor = await requireAuthorization(this.runtime, request, reply);
    if (hasPermission(actor, required)) return true;

    request.log.warn({ auth: 'authorization-denied', permission: required }, 'permission denied');
    try {
      await this.runtime.authorization.recordAuthorizationDenial({
        userId: actor.userId,
        permissionCode: required,
        traceId: traceIdOf(request),
      });
    } catch (error) {
      // The request stays denied; only the evidence is missing, and that is reported (D-15).
      request.log.error(
        { err: error, auth: 'authorization-denial-unrecorded' },
        'authorization denial could not be recorded',
      );
    }
    throw new ForbiddenException('The required permission is missing.', {
      errorCode: 'AUTHORIZATION_DENIED',
    });
  }
}
