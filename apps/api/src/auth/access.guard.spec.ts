import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type {
  AuthorizationContext,
  AuthorizationDenial,
  PermissionCode,
  ResolveAuthorizationContextResult,
} from '@vertex-os/iam';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { beforeEach, describe, expect, it } from 'vitest';
import { AccessGuard, RequirePermission } from './access.guard.js';
import type { AuthRuntime } from './auth-runtime.js';
import { requireAuthorization, requireSession } from './request-session.js';
import { csrfTokenFor, hashSecret } from './secrets.js';
import type { ValidSession } from './sessions.js';

/**
 * The access guard and the request-scoped resolution over a fake runtime, so each step can be
 * observed: memoization, the inactive race of D-09, CSRF wherever a session is used (D-03), and
 * the denial evidence of D-15.
 */
const USER_ID = '0d6f7a52-8f7e-4c2a-9a55-1f2b3c4d5e6f';
const SECRET = 'a'.repeat(43);
const USERS_READ = 'iam.users.read' as PermissionCode;
const ROLES_MANAGE = 'iam.roles.manage' as PermissionCode;

const session: ValidSession = {
  id: 'session-1',
  userId: USER_ID,
  csrfTokenHash: hashSecret(csrfTokenFor(SECRET)),
  idleExpiresAt: new Date('2026-09-23T12:30:00.000Z'),
  absoluteExpiresAt: new Date('2026-09-23T22:00:00.000Z'),
  idToken: undefined,
};

const context: AuthorizationContext = {
  userId: USER_ID as AuthorizationContext['userId'],
  accessState: 'ACTIVE',
  departmentIds: [],
  permissionCodes: [USERS_READ],
};

interface Observed {
  resolutions: number;
  revoked: string[];
  denials: AuthorizationDenial[];
}

function fakeRuntime(
  observed: Observed,
  answer: () => ResolveAuthorizationContextResult,
  failDenial = false,
): AuthRuntime {
  return {
    sessions: {
      authenticate: async () => ({ outcome: 'valid', session, revalidation: 'not-due' }),
      verifyCsrf: (_session: ValidSession, presented: string | undefined) =>
        presented === csrfTokenFor(SECRET),
      revoke: async (_session: unknown, reason: string) => {
        observed.revoked.push(reason);
        return true;
      },
    },
    iam: {
      resolveSessionUser: async () => ({
        outcome: 'active',
        user: { id: USER_ID, email: 'ada@example.test', displayName: 'Ada' },
      }),
    },
    authorization: {
      resolveAuthorizationContext: async () => {
        observed.resolutions += 1;
        return answer();
      },
      recordAuthorizationDenial: async (denial: AuthorizationDenial) => {
        if (failDenial) throw new Error('audit unavailable');
        observed.denials.push(denial);
      },
    },
  } as unknown as AuthRuntime;
}

function fakeRequest(method = 'GET', headers: Record<string, string> = {}) {
  const logs: Array<[string, unknown]> = [];
  const log = (level: string) => (entry: unknown) => logs.push([level, entry]);
  const request = {
    method,
    id: 'req-1',
    headers: { cookie: `__Host-vertex-session=${SECRET}`, ...headers },
    log: { info: log('info'), warn: log('warn'), error: log('error') },
  } as unknown as FastifyRequest;
  const cookies: unknown[] = [];
  const reply = {
    header: (name: string, value: unknown) => {
      if (name === 'set-cookie') cookies.push(value);
      return reply;
    },
  } as unknown as FastifyReply;
  return { request, reply, logs, cookies };
}

function executionContext(handler: () => unknown, request: FastifyRequest, reply: FastifyReply) {
  return {
    getHandler: () => handler,
    getClass: () => Object,
    switchToHttp: () => ({ getRequest: () => request, getResponse: () => reply }),
  } as unknown as ExecutionContext;
}

describe('requireAuthorization', () => {
  let observed: Observed;
  beforeEach(() => {
    observed = { resolutions: 0, revoked: [], denials: [] };
  });

  it('resolves the context once per request and again for the next request', async () => {
    const runtime = fakeRuntime(observed, () => ({ outcome: 'active', context }));
    const first = fakeRequest();
    await expect(requireAuthorization(runtime, first.request, first.reply)).resolves.toBe(context);
    await requireAuthorization(runtime, first.request, first.reply);
    expect(observed.resolutions).toBe(1);

    const second = fakeRequest();
    await requireAuthorization(runtime, second.request, second.reply);
    expect(observed.resolutions).toBe(2);
  });

  it.each(['inactive', 'not-found'] as const)(
    'revokes the session and refuses the request when the user is %s at context time',
    async (outcome) => {
      const runtime = fakeRuntime(observed, () => ({ outcome }));
      const { request, reply, cookies } = fakeRequest();
      const failure = await requireAuthorization(runtime, request, reply).catch(
        (error: unknown) => error,
      );
      expect(failure).toBeInstanceOf(ForbiddenException);
      expect((failure as ForbiddenException).errorCode).toBe('IAM_USER_INACTIVE');
      expect(observed.revoked).toEqual(['ACCESS_REVOKED']);
      expect(cookies).toHaveLength(1);
    },
  );
});

describe('CSRF wherever a session is used (D-03)', () => {
  it('refuses an unsafe request without its token, whoever resolves the session', async () => {
    const observed = { resolutions: 0, revoked: [], denials: [] };
    const runtime = fakeRuntime(observed, () => ({ outcome: 'active', context }));
    for (const headers of [{}, { 'x-csrf-token': 'wrong' }]) {
      const { request, reply } = fakeRequest('POST', headers);
      const failure = await requireSession(runtime, request, reply).catch(
        (error: unknown) => error,
      );
      expect((failure as ForbiddenException).errorCode).toBe('CSRF_VALIDATION_FAILED');
      const viaContext = fakeRequest('DELETE', headers);
      const failed = await requireAuthorization(
        runtime,
        viaContext.request,
        viaContext.reply,
      ).catch((error: unknown) => error);
      expect((failed as ForbiddenException).errorCode).toBe('CSRF_VALIDATION_FAILED');
    }
    expect(observed.resolutions).toBe(0);

    const valid = fakeRequest('POST', { 'x-csrf-token': csrfTokenFor(SECRET) });
    await expect(requireSession(runtime, valid.request, valid.reply)).resolves.toMatchObject({
      session,
    });
  });
});

describe('AccessGuard', () => {
  class Handlers {
    @RequirePermission(USERS_READ)
    held(): string {
      return 'held';
    }

    @RequirePermission(ROLES_MANAGE)
    missing(): string {
      return 'missing';
    }

    open(): string {
      return 'open';
    }
  }
  const handlers = new Handlers();

  it('lets a held permission through and records nothing', async () => {
    const observed = { resolutions: 0, revoked: [], denials: [] };
    const guard = new AccessGuard(
      fakeRuntime(observed, () => ({ outcome: 'active', context })),
      new Reflector(),
    );
    const { request, reply } = fakeRequest();
    await expect(guard.canActivate(executionContext(handlers.held, request, reply))).resolves.toBe(
      true,
    );
    expect(observed.denials).toEqual([]);
  });

  it('does not resolve the context for a route without a permission requirement', async () => {
    const observed = { resolutions: 0, revoked: [], denials: [] };
    const guard = new AccessGuard(
      fakeRuntime(observed, () => ({ outcome: 'active', context })),
      new Reflector(),
    );
    const { request, reply } = fakeRequest();
    await expect(guard.canActivate(executionContext(handlers.open, request, reply))).resolves.toBe(
      true,
    );
    expect(observed.resolutions).toBe(0);
  });

  it('denies a missing permission with AUTHORIZATION_DENIED and records the denial', async () => {
    const observed = { resolutions: 0, revoked: [], denials: [] as AuthorizationDenial[] };
    const guard = new AccessGuard(
      fakeRuntime(observed, () => ({ outcome: 'active', context })),
      new Reflector(),
    );
    const { request, reply, logs } = fakeRequest();
    const failure = await guard
      .canActivate(executionContext(handlers.missing, request, reply))
      .catch((error: unknown) => error);
    expect((failure as ForbiddenException).errorCode).toBe('AUTHORIZATION_DENIED');
    expect(observed.denials).toEqual([
      { userId: USER_ID, permissionCode: ROLES_MANAGE, traceId: 'req-1' },
    ]);
    expect(logs).toContainEqual([
      'warn',
      { auth: 'authorization-denied', permission: ROLES_MANAGE },
    ]);
  });

  it('still denies when the denial cannot be recorded, and reports the missing evidence', async () => {
    const observed = { resolutions: 0, revoked: [], denials: [] };
    const guard = new AccessGuard(
      fakeRuntime(observed, () => ({ outcome: 'active', context }), true),
      new Reflector(),
    );
    const { request, reply, logs } = fakeRequest();
    const failure = await guard
      .canActivate(executionContext(handlers.missing, request, reply))
      .catch((error: unknown) => error);
    expect((failure as ForbiddenException).errorCode).toBe('AUTHORIZATION_DENIED');
    expect(logs.some(([level]) => level === 'error')).toBe(true);
  });
});
