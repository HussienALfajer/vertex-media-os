import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import {
  parseSystemProcess,
  parseTraceId,
  userActor,
  type AuditAttribution,
  type TraceId,
} from '@vertex-os/audit';
import type { SessionUser } from '@vertex-os/iam';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { AuthRuntime } from './auth-runtime.js';
import { clearedCookie, readCookie, SESSION_COOKIE } from './cookies.js';
import type { ValidSession } from './sessions.js';

/** The authenticated context of one request. The raw secret lives only for the request. */
export interface RequestSession {
  readonly secret: string;
  readonly session: ValidSession;
  readonly user: SessionUser;
}

const resolved = new WeakMap<FastifyRequest, RequestSession>();

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

/**
 * Resolves the request's application session (IAM-R03 D-11, D-24): the cookie must name a live,
 * unrevoked session, and its user must be ACTIVE in committed IAM state. A user who is no longer
 * ACTIVE loses the session at once. The result is memoized for the request only.
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
  const lookup = await runtime.sessions.authenticate(secret);
  if (lookup.outcome === 'expired') {
    failWith(
      reply,
      new UnauthorizedException('The session has expired.', { errorCode: 'AUTH_SESSION_EXPIRED' }),
    );
  }
  if (lookup.outcome === 'invalid') {
    failWith(
      reply,
      new UnauthorizedException('The session is not valid.', { errorCode: 'AUTH_SESSION_INVALID' }),
    );
  }

  const user = await runtime.iam.resolveSessionUser(lookup.session.userId);
  if (user.outcome !== 'active') {
    await runtime.sessions.revoke(
      lookup.session,
      'ACCESS_REVOKED',
      systemAttribution(request, 'iam.session-check'),
    );
    request.log.info({ auth: 'session-revoked', reason: 'user-not-active' }, 'session revoked');
    failWith(
      reply,
      new ForbiddenException('The account is not active.', { errorCode: 'IAM_USER_INACTIVE' }),
    );
  }

  const context: RequestSession = { secret, session: lookup.session, user: user.user };
  resolved.set(request, context);
  return context;
}
