import {
  ForbiddenException,
  SetMetadata,
  UnauthorizedException,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type {
  AuthorizationContext,
  AuthorizationDenial,
  PermissionCode,
  ResolveAuthorizationContextResult,
} from '@vertex-os/iam';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { beforeEach, describe, expect, it } from 'vitest';
import { AccessGuard, PUBLIC_ROUTE, RequirePermission } from './access.guard.js';
import type { AuthRuntime } from './auth-runtime.js';
import { createRateLimiter } from './rate-limit.js';
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
  evidenceLimit = 30,
): AuthRuntime {
  return {
    limits: { evidence: createRateLimiter({ limit: evidenceLimit, windowSeconds: 60 }) },
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

function executionContext(
  handler: () => unknown,
  request: FastifyRequest,
  reply: FastifyReply,
  owner: object = Object,
) {
  return {
    getHandler: () => handler,
    getClass: () => owner,
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

  it('rejects a second required permission on one handler when it is declared', () => {
    expect(() => {
      class Stacked {
        @RequirePermission(USERS_READ)
        @RequirePermission(ROLES_MANAGE)
        both(): string {
          return 'both';
        }
      }
      return Stacked;
    }).toThrow('more than one required permission');
  });

  it('reads the public marker on the handler only, never on its controller', async () => {
    @SetMetadata(PUBLIC_ROUTE, true)
    class MarkedController {
      open(): string {
        return 'open';
      }
    }
    const observed = { resolutions: 0, revoked: [], denials: [] };
    const guard = new AccessGuard(
      fakeRuntime(observed, () => ({ outcome: 'active', context })),
      new Reflector(),
    );
    const { request, reply } = fakeRequest('GET', { cookie: '' });
    const failure = await guard
      .canActivate(
        executionContext(MarkedController.prototype.open, request, reply, MarkedController),
      )
      .catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(UnauthorizedException);
  });

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

  it('records at most the evidence limit of denials per user and window, then logs only (IAM-R09 D-04)', async () => {
    const observed = { resolutions: 0, revoked: [], denials: [] as AuthorizationDenial[] };
    const guard = new AccessGuard(
      fakeRuntime(observed, () => ({ outcome: 'active', context }), false, 2),
      new Reflector(),
    );
    const allLogs: Array<[string, unknown]> = [];
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const { request, reply, logs } = fakeRequest();
      const failure = await guard
        .canActivate(executionContext(handlers.missing, request, reply))
        .catch((error: unknown) => error);
      // The answer never depends on the evidence bound.
      expect((failure as ForbiddenException).errorCode).toBe('AUTHORIZATION_DENIED');
      allLogs.push(...logs);
    }
    expect(observed.denials).toHaveLength(2);
    expect(
      allLogs.filter(([, entry]) => (entry as { auth?: string }).auth === 'authorization-denied'),
    ).toHaveLength(4);
    expect(allLogs).toContainEqual([
      'warn',
      { auth: 'evidence-limited', evidence: 'authorization-denial' },
    ]);
    expect(
      allLogs.filter(([, entry]) => (entry as { auth?: string }).auth === 'evidence-limited'),
    ).toHaveLength(1);
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
