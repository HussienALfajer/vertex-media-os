import { QueryObserver, type QueryClient } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiRequest, forgetCsrfToken, NetworkFailure } from '../../lib/http';
import { createQueryClient } from '../../query-client';
import { authQuery, readAuthState, signOut, type AuthState } from './auth-state';

const USER = {
  id: '0b7c7f2e-0000-4000-8000-000000000001',
  email: 'a@example.test',
  displayName: 'A',
};
const OTHER = {
  id: '0b7c7f2e-0000-4000-8000-000000000002',
  email: 'b@example.test',
  displayName: 'B',
};
const SESSION = {
  idleExpiresAt: '2026-09-24T10:00:00.000Z',
  absoluteExpiresAt: '2026-09-24T18:00:00.000Z',
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

type Handler = () => Response | Promise<Response>;

/** Answers by `METHOD /path`; a missing route fails the test loudly. */
function routeFetch(routes: Record<string, Handler>) {
  const mock = vi.fn((path: string, init: RequestInit) => {
    const handler = routes[`${init.method ?? 'GET'} ${path}`];
    if (handler === undefined) throw new Error(`Unexpected request ${init.method} ${path}`);
    return Promise.resolve(handler());
  });
  vi.stubGlobal('fetch', mock);
  return mock;
}

function signedIn(user = USER, permissionCodes = ['iam.users.read']): Record<string, Handler> {
  return {
    'GET /api/auth/session': () => json(200, { user, session: SESSION }),
    'GET /api/iam/me': () =>
      json(200, {
        user,
        departments: [{ id: 'd1', code: 'ops', name: 'Operations', isPrimary: true }],
        permissionCodes,
      }),
  };
}

/** Answers a GET from a route table; a missing route fails the test. */
function answer(routes: Record<string, Handler>, path: string): Response | Promise<Response> {
  const handler = routes[`GET ${path}`];
  if (handler === undefined) throw new Error(`Unexpected request GET ${path}`);
  return handler();
}

const problem = (status: number, code: string) => () => json(status, { status, code });

describe('reading the authentication state', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('is signed in with the user, ACTIVE departments and permission codes', async () => {
    routeFetch(signedIn());
    await expect(readAuthState()).resolves.toEqual({
      status: 'signed-in',
      user: USER,
      departments: [{ id: 'd1', code: 'ops', name: 'Operations', isPrimary: true }],
      permissionCodes: ['iam.users.read'],
    });
  });

  it.each([
    ['AUTHENTICATION_REQUIRED', 'required'],
    ['AUTH_SESSION_EXPIRED', 'expired'],
    ['AUTH_SESSION_INVALID', 'ended'],
  ])('maps 401 %s to signed-out (%s)', async (code, reason) => {
    routeFetch({ 'GET /api/auth/session': problem(401, code) });
    await expect(readAuthState()).resolves.toEqual({ status: 'signed-out', reason });
  });

  it('maps a 401 from /me after a valid session to signed-out', async () => {
    routeFetch({ ...signedIn(), 'GET /api/iam/me': problem(401, 'AUTH_SESSION_INVALID') });
    await expect(readAuthState()).resolves.toEqual({ status: 'signed-out', reason: 'ended' });
  });

  it('maps 403 IAM_USER_INACTIVE to inactive, not to signed-out', async () => {
    routeFetch({ 'GET /api/auth/session': problem(403, 'IAM_USER_INACTIVE') });
    await expect(readAuthState()).resolves.toEqual({ status: 'inactive' });
  });

  it('treats a network failure as an error, never as signed out', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(readAuthState()).rejects.toBeInstanceOf(NetworkFailure);
  });

  it('treats a server error and another 403 as errors', async () => {
    routeFetch({ 'GET /api/auth/session': problem(503, 'SERVICE_BUSY') });
    await expect(readAuthState()).rejects.toMatchObject({ status: 503 });
    routeFetch({ 'GET /api/auth/session': problem(403, 'AUTHORIZATION_DENIED') });
    await expect(readAuthState()).rejects.toMatchObject({ status: 403 });
  });

  it('refuses an unexpected body or a different user from /me', async () => {
    routeFetch({ ...signedIn(), 'GET /api/iam/me': () => json(200, { user: USER }) });
    await expect(readAuthState()).rejects.toBeInstanceOf(NetworkFailure);
    routeFetch({
      ...signedIn(),
      'GET /api/iam/me': () => json(200, { user: OTHER, departments: [], permissionCodes: [] }),
    });
    await expect(readAuthState()).rejects.toBeInstanceOf(NetworkFailure);
  });
});

describe('protected state in the query client', () => {
  let client: QueryClient;

  beforeEach(() => {
    forgetCsrfToken();
    client = createQueryClient();
  });

  afterEach(() => {
    client.clear();
    vi.unstubAllGlobals();
  });

  const protectedKey = ['iam', 'users'];

  async function seedProtected(permission = 'iam.users.read') {
    await client.prefetchQuery({
      queryKey: protectedKey,
      queryFn: () => Promise.resolve(['a protected row']),
      meta: { permission },
    });
    expect(client.getQueryData(protectedKey)).toEqual(['a protected row']);
  }

  it('removes protected queries and refetches the state when any query answers 401', async () => {
    const fetchMock = routeFetch(signedIn());
    await client.fetchQuery(authQuery);
    await seedProtected();

    fetchMock.mockImplementation(() =>
      Promise.resolve(json(401, { code: 'AUTH_SESSION_EXPIRED' })),
    );
    await client
      .fetchQuery({ queryKey: ['iam', 'roles'], queryFn: () => apiRequest('/api/iam/roles') })
      .catch(() => undefined);

    expect(client.getQueryData(protectedKey)).toBeUndefined();
    await vi.waitFor(() =>
      expect(client.getQueryData(authQuery.queryKey)).toEqual({
        status: 'signed-out',
        reason: 'expired',
      }),
    );
  });

  it('drops the data of a query refused with 403 AUTHORIZATION_DENIED and keeps its error', async () => {
    const fetchMock = routeFetch(signedIn());
    await client.fetchQuery(authQuery);
    fetchMock.mockImplementation((path: string) =>
      Promise.resolve(
        path === '/api/iam/users' ? json(200, ['a protected row']) : answer(signedIn(), path),
      ),
    );
    const observer = new QueryObserver(client, {
      queryKey: protectedKey,
      queryFn: () => apiRequest('/api/iam/users'),
      retry: false,
    });
    const unsubscribe = observer.subscribe(() => undefined);
    await vi.waitFor(() => expect(client.getQueryData(protectedKey)).toEqual(['a protected row']));

    fetchMock.mockImplementation((path: string) =>
      Promise.resolve(
        path === '/api/iam/users'
          ? json(403, { code: 'AUTHORIZATION_DENIED' })
          : answer(signedIn(USER, []), path),
      ),
    );
    await observer.refetch();

    const state = client.getQueryState(protectedKey);
    expect(state?.status).toBe('error');
    expect(state?.data).toBeUndefined();
    unsubscribe();
  });

  it('removes a query whose declared permission the refreshed codes no longer include', async () => {
    const fetchMock = routeFetch(signedIn(USER, ['iam.users.read', 'iam.roles.read']));
    await client.fetchQuery(authQuery);
    await seedProtected('iam.users.read');
    await client.prefetchQuery({
      queryKey: ['iam', 'roles'],
      queryFn: () => Promise.resolve(['a role']),
      meta: { permission: 'iam.roles.read' },
    });

    fetchMock.mockImplementation((path: string) =>
      Promise.resolve(answer(signedIn(USER, ['iam.roles.read']), path)),
    );
    await client.refetchQueries({ queryKey: authQuery.queryKey });

    expect(client.getQueryData(protectedKey)).toBeUndefined();
    expect(client.getQueryData(['iam', 'roles'])).toEqual(['a role']);
  });

  it('removes protected queries when another user is signed in', async () => {
    const fetchMock = routeFetch(signedIn(USER));
    await client.fetchQuery(authQuery);
    await seedProtected();

    fetchMock.mockImplementation((path: string) => Promise.resolve(answer(signedIn(OTHER), path)));
    await client.refetchQueries({ queryKey: authQuery.queryKey });

    expect(client.getQueryData(protectedKey)).toBeUndefined();
    expect((client.getQueryData(authQuery.queryKey) as AuthState).status).toBe('signed-in');
  });

  it('removes protected queries when the refreshed state is signed out or inactive', async () => {
    for (const refusal of [
      problem(401, 'AUTH_SESSION_EXPIRED'),
      problem(403, 'IAM_USER_INACTIVE'),
    ]) {
      const fetchMock = routeFetch(signedIn());
      await client.fetchQuery(authQuery);
      await seedProtected();

      fetchMock.mockImplementation(() => Promise.resolve(refusal()));
      await client.refetchQueries({ queryKey: authQuery.queryKey });

      expect(client.getQueryData(protectedKey)).toBeUndefined();
    }
  });

  it('keeps the signed-in state when a background refresh cannot reach the API', async () => {
    const fetchMock = routeFetch(signedIn());
    await client.fetchQuery(authQuery);
    await seedProtected();

    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await client.refetchQueries({ queryKey: authQuery.queryKey });

    expect((client.getQueryData(authQuery.queryKey) as AuthState).status).toBe('signed-in');
    expect(client.getQueryData(protectedKey)).toEqual(['a protected row']);
  });

  it('signs out with the CSRF token, clears protected state and returns the logout URL', async () => {
    const fetchMock = routeFetch({
      ...signedIn(),
      'GET /api/auth/csrf': () => json(200, { token: 'csrf-1' }),
      'POST /api/auth/logout': () =>
        json(200, { logoutUrl: 'http://127.0.0.1:8080/realms/vertex/logout-done' }),
    });
    await client.fetchQuery(authQuery);
    await seedProtected();

    await expect(signOut(client)).resolves.toBe('http://127.0.0.1:8080/realms/vertex/logout-done');

    const logout = fetchMock.mock.calls.find(([path]) => path === '/api/auth/logout');
    expect((logout?.[1].headers as Record<string, string>)['x-csrf-token']).toBe('csrf-1');
    expect(client.getQueryData(protectedKey)).toBeUndefined();
    expect(client.getQueryData(authQuery.queryKey)).toEqual({
      status: 'signed-out',
      reason: 'required',
    });
  });

  it('does not follow a logout URL that is not http or https', async () => {
    routeFetch({
      ...signedIn(),
      'GET /api/auth/csrf': () => json(200, { token: 'csrf-1' }),
      'POST /api/auth/logout': () => json(200, { logoutUrl: 'data:text/html,logout' }),
    });
    await client.fetchQuery(authQuery);

    await expect(signOut(client)).resolves.toBeUndefined();
  });

  it('treats a session that is already gone as signed out', async () => {
    const fetchMock = routeFetch(signedIn());
    await client.fetchQuery(authQuery);
    await seedProtected();

    fetchMock.mockImplementation(() =>
      Promise.resolve(json(401, { code: 'AUTH_SESSION_INVALID' })),
    );
    await expect(signOut(client)).resolves.toBeUndefined();

    expect(client.getQueryData(protectedKey)).toBeUndefined();
    expect(client.getQueryData(authQuery.queryKey)).toEqual({
      status: 'signed-out',
      reason: 'ended',
    });
  });

  it('keeps the state and reports the error when sign-out cannot reach the API', async () => {
    const fetchMock = routeFetch(signedIn());
    await client.fetchQuery(authQuery);
    await seedProtected();

    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(signOut(client)).rejects.toBeInstanceOf(NetworkFailure);

    expect(client.getQueryData(protectedKey)).toEqual(['a protected row']);
  });

  it('forgets the CSRF token and the mutation cache when protected state is cleared (T-2)', async () => {
    const fetchMock = routeFetch({
      ...signedIn(),
      'GET /api/auth/csrf': () => json(200, { token: 'csrf-of-the-old-session' }),
      'POST /api/things': () => json(200, { done: true }),
    });
    await client.fetchQuery(authQuery);
    await client
      .getMutationCache()
      .build(client, { mutationFn: () => apiRequest('/api/things', { method: 'POST' }) })
      .execute(undefined);
    expect(client.getMutationCache().getAll()).toHaveLength(1);

    fetchMock.mockImplementation((path: string, init: RequestInit) =>
      Promise.resolve(
        path === '/api/auth/session'
          ? json(401, { code: 'AUTH_SESSION_INVALID' })
          : path === '/api/auth/csrf'
            ? json(200, { token: 'csrf-of-the-new-session' })
            : json(200, { method: init.method }),
      ),
    );
    await client.refetchQueries({ queryKey: authQuery.queryKey });
    expect(client.getMutationCache().getAll()).toHaveLength(0);

    await apiRequest('/api/things', { method: 'POST' });
    const post = fetchMock.mock.calls.at(-1);
    expect(fetchMock.mock.calls.at(-2)?.[0]).toBe('/api/auth/csrf');
    expect((post?.[1].headers as Record<string, string>)['x-csrf-token']).toBe(
      'csrf-of-the-new-session',
    );
  });

  it('clears protected data when the first state read is inactive (T-6)', async () => {
    routeFetch({ 'GET /api/auth/session': problem(403, 'IAM_USER_INACTIVE') });
    await seedProtected();

    await client.fetchQuery(authQuery);

    expect(client.getQueryData(protectedKey)).toBeUndefined();
  });

  it('does not clear protected data when reading the state itself fails (T-6)', async () => {
    const fetchMock = routeFetch(signedIn());
    await client.fetchQuery(authQuery);
    await seedProtected();

    fetchMock.mockImplementation(() =>
      Promise.resolve(json(403, { code: 'AUTHORIZATION_DENIED' })),
    );
    await client.refetchQueries({ queryKey: authQuery.queryKey });

    expect(client.getQueryState(authQuery.queryKey)?.status).toBe('error');
    expect(client.getQueryData(protectedKey)).toEqual(['a protected row']);
  });

  it('never retries a refused read, and retries a network failure twice (T-6)', async () => {
    vi.useFakeTimers();
    try {
      const refused = vi.fn(() => apiRequest('/api/iam/users'));
      routeFetch({ 'GET /api/iam/users': problem(404, 'NOT_FOUND') });
      const first = client.fetchQuery({ queryKey: ['a'], queryFn: refused }).catch(() => undefined);
      await vi.runAllTimersAsync();
      await first;
      expect(refused).toHaveBeenCalledTimes(1);

      const unreachable = vi.fn(() => Promise.reject(new NetworkFailure('down')));
      const second = client
        .fetchQuery({ queryKey: ['b'], queryFn: unreachable })
        .catch(() => undefined);
      await vi.runAllTimersAsync();
      await second;
      expect(unreachable).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it('never polls the session: no read happens without focus or a refusal (D-06, T-5)', async () => {
    vi.useFakeTimers();
    try {
      const fetchMock = routeFetch(signedIn());
      const observer = new QueryObserver(client, authQuery);
      const unsubscribe = observer.subscribe(() => undefined);
      await vi.advanceTimersByTimeAsync(1_000);
      const reads = fetchMock.mock.calls.length;
      expect(reads).toBe(2);

      await vi.advanceTimersByTimeAsync(60 * 60 * 1000);

      expect(fetchMock.mock.calls.length).toBe(reads);
      unsubscribe();
    } finally {
      vi.useRealTimers();
    }
  });
});
