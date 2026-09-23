import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import {
  parseSystemProcess,
  parseTraceId,
  userActor,
  type AuditAttribution,
  type TraceId,
} from '@vertex-os/audit';
import type { AuthorizationContext, SessionUser } from '@vertex-os/iam';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { AuthRuntime } from './auth-runtime.js';
import { clearedCookie, readCookie, SESSION_COOKIE } from './cookies.js';
import type { ValidSession } from './sessions.js';

/** Header carrying the CSRF synchronizer token on unsafe requests (IAM-R03 D-18). */
export const CSRF_HEADER = 'x-csrf-token';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** The authenticated context of one request. The raw secret lives only for the request. */
export interface RequestSession {
  readonly secret: string;
  readonly session: ValidSession;
  readonly user: SessionUser;
}

const resolved = new WeakMap<FastifyRequest, RequestSession>();
const authorized = new WeakMap<FastifyRequest, AuthorizationContext>();

/** The request's trace ID; request IDs share the Audit trace-ID grammar (IAM-02 I-8). */
export function traceIdOf(request: FastifyRequest): TraceId {
  const traceId = parseTraceId(request.id);
  if (!traceId.ok) throw new Error('The request ID is not a valid trace ID.');
  return traceId.value;
}

export function userAttribution(request: FastifyRequest, userId: string): AuditAttribution {
  const actor = userActor(userId);
  if (!actor.ok) throw new Error('A session names an invalid user identifier.');
  return { actor: actor.value, traceId: traceIdOf(request) };
}

export function systemAttribution(request: FastifyRequest, process: string): AuditAttribution {
  const code = parseSystemProcess(process);
  if (!code.ok) throw new Error(`Invalid system process code ${process}.`);
  return { actor: { type: 'SYSTEM', process: code.value }, traceId: traceIdOf(request) };
}

function failWith(reply: FastifyReply, error: Error): never {
  // A session the server no longer accepts is removed from the browser as well.
  void reply.header('set-cookie', clearedCookie(SESSION_COOKIE));
  throw error;
}

/** Revokes the session of a user who is no longer ACTIVE and refuses the request. */
async function refuseInactiveUser(
  runtime: AuthRuntime,
  request: FastifyRequest,
  reply: FastifyReply,
  session: ValidSession,
): Promise<never> {
  await runtime.sessions.revoke(
    session,
    'ACCESS_REVOKED',
    systemAttribution(request, 'iam.session-check'),
  );
  request.log.info({ auth: 'session-revoked', reason: 'user-not-active' }, 'session revoked');
  return failWith(
    reply,
    new ForbiddenException('The account is not active.', { errorCode: 'IAM_USER_INACTIVE' }),
  );
}

/**
 * Resolves the request's application session (IAM-R03 D-11, D-24): the cookie must name a live,
 * unrevoked session that the identity provider still backs (IAM-R03F D-05), and its user must be
 * ACTIVE in committed IAM state. A user who is no longer ACTIVE loses the session at once. On an
 * unsafe method the session is usable only with its CSRF token in `X-CSRF-Token` (spec Section 15;
 * IAM-R04 D-03), whoever resolves it. The result is memoized for the request only.
 */
export async function requireSession(
  runtime: AuthRuntime,
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<RequestSession> {
  const known = resolved.get(request);
  if (known) return known;

  const secret = readCookie(request.headers.cookie, SESSION_COOKIE);
  if (secret === undefined) {
    throw new UnauthorizedException('Sign-in is required.', {
      errorCode: 'AUTHENTICATION_REQUIRED',
    });
  }
  const lookup = await runtime.sessions.authenticate(
    secret,
    systemAttribution(request, 'iam.session-check'),
  );
  if (lookup.outcome === 'ended') {
    request.log.info(
      { auth: 'session-revoked', reason: 'provider-session-ended' },
      'session revoked',
    );
  }
  if (lookup.outcome === 'expired') {
    failWith(
      reply,
      new UnauthorizedException('The session has expired.', { errorCode: 'AUTH_SESSION_EXPIRED' }),
    );
  }
  if (lookup.outcome === 'invalid' || lookup.outcome === 'ended') {
    failWith(
      reply,
      new UnauthorizedException('The session is not valid.', { errorCode: 'AUTH_SESSION_INVALID' }),
    );
  }

  if (lookup.revalidation === 'unavailable') {
    request.log.warn(
      { auth: 'session-revalidation-unavailable' },
      'identity provider unavailable; session not extended',
    );
  }

  const user = await runtime.iam.resolveSessionUser(lookup.session.userId);
  if (user.outcome !== 'active') return refuseInactiveUser(runtime, request, reply, lookup.session);

  if (!SAFE_METHODS.has(request.method)) {
    const presented = request.headers[CSRF_HEADER];
    if (typeof presented !== 'string' || !runtime.sessions.verifyCsrf(lookup.session, presented)) {
      request.log.warn({ auth: 'csrf-rejected' }, 'CSRF validation failed');
      throw new ForbiddenException('CSRF validation failed.', {
        errorCode: 'CSRF_VALIDATION_FAILED',
      });
    }
  }

  const context: RequestSession = { secret, session: lookup.session, user: user.user };
  resolved.set(request, context);
  return context;
}

/**
 * The current actor's IAM authorization context (spec Section 17; IAM-R04 D-08 to D-10): the
 * request's session first, then the context projected from committed IAM state. Memoized for the
 * request only, never across requests (invariant 11). A user found not ACTIVE here, restricted
 * after the session check, loses the session exactly as in {@link requireSession}.
 */
export async function requireAuthorization(
  runtime: AuthRuntime,
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<AuthorizationContext> {
  const known = authorized.get(request);
  if (known) return known;

  const { session } = await requireSession(runtime, request, reply);
  const result = await runtime.authorization.resolveAuthorizationContext(session.userId);
  if (result.outcome !== 'active') return refuseInactiveUser(runtime, request, reply, session);

  authorized.set(request, result.context);
  return result.context;
}
