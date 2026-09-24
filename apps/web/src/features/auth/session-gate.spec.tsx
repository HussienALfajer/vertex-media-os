import { QueryClientProvider, useQuery, type QueryClient } from '@tanstack/react-query';
import { act, render, screen } from '@testing-library/react';
import { UiRoot } from '@vertex-os/ui';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiRequest, forgetCsrfToken, isApiProblem } from '../../lib/http';
import { createQueryClient } from '../../query-client';
import { AUTH_QUERY_KEY } from './auth-state';
import { SessionGate } from './session-gate';

const A = { id: 'user-a', email: 'a@example.test', displayName: 'A' };
const B = { id: 'user-b', email: 'b@example.test', displayName: 'B' };
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

/** What the fake API answers now; tests change it between steps. */
interface Api {
  user: typeof A;
  permissionCodes: string[];
  /** Overrides every answer, as the real API does after it clears the session cookie. */
  refuse?: { status: number; code: string };
  users: () => Response | Promise<Response>;
}

function stubApi(api: Api) {
  const mock = vi.fn((path: string) => {
    if (path === '/api/health/live') return Promise.resolve(json(200, { status: 'ok' }));
    if (api.refuse) return Promise.resolve(json(api.refuse.status, { code: api.refuse.code }));
    if (path === '/api/auth/session')
      return Promise.resolve(json(200, { user: api.user, session: SESSION }));
    if (path === '/api/iam/me')
      return Promise.resolve(
        json(200, { user: api.user, departments: [], permissionCodes: api.permissionCodes }),
      );
    if (path === '/api/iam/users') return Promise.resolve(api.users());
    return Promise.reject(new Error(`Unexpected request ${path}`));
  });
  vi.stubGlobal('fetch', mock);
  return mock;
}

/** A protected view of the kind IAM-R08B adds: its query declares the permission it needs. */
function ProtectedRows() {
  const users = useQuery({
    queryKey: ['iam', 'users'],
    queryFn: () => apiRequest('/api/iam/users'),
    meta: { permission: 'iam.users.read' },
    retry: false,
  });
  if (users.data !== undefined) return <p>{`rows: ${JSON.stringify(users.data)}`}</p>;
  if (isApiProblem(users.error, 403)) return <p>no permission</p>;
  return <p>loading rows</p>;
}

function renderGate(client: QueryClient) {
  render(
    <UiRoot>
      <QueryClientProvider client={client}>
        <SessionGate>
          <h1>Protected area</h1>
          <ProtectedRows />
        </SessionGate>
      </QueryClientProvider>
    </UiRoot>,
  );
}

const sessionReads = (mock: ReturnType<typeof stubApi>) =>
  mock.mock.calls.filter(([path]) => path === '/api/auth/session').length;

describe('the session gate and protected views', () => {
  let client: QueryClient;
  let api: Api;

  beforeEach(() => {
    forgetCsrfToken();
    client = createQueryClient();
    api = {
      user: A,
      permissionCodes: ['iam.users.read'],
      users: () => json(200, ['row of A']),
    };
  });

  afterEach(() => {
    client.clear();
    vi.unstubAllGlobals();
  });

  it('stops showing protected rows when the permission is lost (review S-1)', async () => {
    stubApi(api);
    renderGate(client);
    expect(await screen.findByText('rows: ["row of A"]')).toBeTruthy();

    api.permissionCodes = [];
    api.users = () => json(403, { code: 'AUTHORIZATION_DENIED' });
    await act(() => client.refetchQueries({ queryKey: AUTH_QUERY_KEY }));

    expect(await screen.findByText('no permission')).toBeTruthy();
    expect(screen.queryByText(/row of A/)).toBeNull();
  });

  it('stops showing the previous user’s rows when another user is signed in (review S-1)', async () => {
    stubApi(api);
    renderGate(client);
    expect(await screen.findByText('rows: ["row of A"]')).toBeTruthy();

    api.user = B;
    api.users = () => json(200, ['row of B']);
    await act(() => client.refetchQueries({ queryKey: AUTH_QUERY_KEY }));

    expect(await screen.findByText('rows: ["row of B"]')).toBeTruthy();
    expect(screen.queryByText(/row of A/)).toBeNull();
  });

  it('keeps the signed-in page on 403 AUTHORIZATION_DENIED, drops the rows and re-reads the permissions', async () => {
    const fetchMock = stubApi(api);
    renderGate(client);
    expect(await screen.findByText('rows: ["row of A"]')).toBeTruthy();
    const readsBefore = sessionReads(fetchMock);

    api.users = () => json(403, { code: 'AUTHORIZATION_DENIED' });
    await act(() => client.refetchQueries({ queryKey: ['iam', 'users'] }));

    expect(await screen.findByText('no permission')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Protected area' })).toBeTruthy();
    expect(client.getQueryData(['iam', 'users'])).toBeUndefined();
    await vi.waitFor(() => expect(sessionReads(fetchMock)).toBeGreaterThan(readsBefore));
  });

  it('keeps the signed-in page when a background refresh cannot reach the API', async () => {
    const fetchMock = stubApi(api);
    renderGate(client);
    expect(await screen.findByText('rows: ["row of A"]')).toBeTruthy();

    fetchMock.mockImplementation(() => Promise.reject(new TypeError('Failed to fetch')));
    await act(() => client.refetchQueries({ queryKey: AUTH_QUERY_KEY }));

    expect(client.getQueryState(AUTH_QUERY_KEY)?.status).toBe('error');
    expect(screen.getByRole('heading', { name: 'Protected area' })).toBeTruthy();
    expect(screen.getByText('rows: ["row of A"]')).toBeTruthy();
  });

  it.each([
    [401, 'AUTH_SESSION_EXPIRED', 'انتهت الجلسة. سجّل الدخول للمتابعة.'],
    [
      401,
      'AUTH_SESSION_INVALID',
      'لم تعد الجلسة صالحة، ربما بسبب تسجيل الخروج من مكان آخر. سجّل الدخول للمتابعة.',
    ],
    [403, 'IAM_USER_INACTIVE', 'حسابك غير مفعّل حاليًا في Vertex OS. تواصل مع مسؤول النظام.'],
  ])(
    'explains a %s %s met by a protected view, although the cookie is gone afterwards (review S-2)',
    async (status, code, notice) => {
      stubApi(api);
      renderGate(client);
      expect(await screen.findByText('rows: ["row of A"]')).toBeTruthy();

      // The first refusal names the reason; every later request has no cookie any more.
      api.users = () => {
        api.refuse = { status: 401, code: 'AUTHENTICATION_REQUIRED' };
        return json(status, { code });
      };
      await act(() => client.refetchQueries({ queryKey: ['iam', 'users'] }));

      expect(await screen.findByText(notice)).toBeTruthy();
      expect(screen.queryByText(/row of A/)).toBeNull();
      expect(screen.queryByRole('heading', { name: 'Protected area' })).toBeNull();
    },
  );
});
