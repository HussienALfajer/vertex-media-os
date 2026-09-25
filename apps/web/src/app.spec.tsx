import { QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { forgetCsrfToken } from './lib/http';
import { leaveApplication } from './lib/navigation';
import { createQueryClient } from './query-client';
import { createAppRouter } from './router';

vi.mock('./lib/navigation', () => ({ leaveApplication: vi.fn() }));

const USER = {
  id: '0b7c7f2e-0000-4000-8000-000000000001',
  email: 'sara@example.test',
  displayName: 'سارة',
};
const SESSION = {
  idleExpiresAt: '2026-09-24T10:00:00.000Z',
  absoluteExpiresAt: '2026-09-24T18:00:00.000Z',
};

function json(status: number, body: unknown, contentType = 'application/json') {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': contentType } });
}

type Handler = () => Response | Promise<Response>;
type Routes = Record<string, Handler>;

const live: Routes = { 'GET /api/health/live': () => json(200, { status: 'ok' }) };

const signedIn: Routes = {
  ...live,
  'GET /api/auth/session': () => json(200, { user: USER, session: SESSION }),
  'GET /api/iam/me': () =>
    json(200, {
      user: USER,
      departments: [
        { id: 'd1', code: 'ops', name: 'العمليات', isPrimary: true },
        { id: 'd2', code: 'sales', name: 'المبيعات', isPrimary: false },
      ],
      permissionCodes: ['iam.users.read'],
    }),
};

const refusal = (status: number, code: string) => () =>
  json(status, { status, code }, 'application/problem+json');

function signedOut(code = 'AUTHENTICATION_REQUIRED'): Routes {
  return { ...live, 'GET /api/auth/session': refusal(401, code) };
}

/** A request that stays in flight, for pending states. */
const pending: Handler = () => new Promise<Response>(() => undefined);

/** Answers by `METHOD /path`; an unknown request fails like an unreachable API (review T-10). */
function routeFetch(routes: Routes) {
  const mock = vi.fn((path: string, init?: RequestInit) => {
    const handler = routes[`${init?.method ?? 'GET'} ${path}`];
    return handler === undefined
      ? Promise.reject(new Error(`Unexpected request ${init?.method ?? 'GET'} ${path}`))
      : Promise.resolve(handler());
  });
  vi.stubGlobal('fetch', mock);
  return mock;
}

function renderApp(path = '/') {
  const queryClient = createQueryClient();
  const history = createMemoryHistory({ initialEntries: [path] });
  const router = createAppRouter(history);
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { queryClient, router };
}

/** jsdom renders the narrow layout: the account area sits in the navigation drawer. */
async function openAccountArea() {
  fireEvent.click(await screen.findByRole('button', { name: 'فتح التنقل' }));
  return screen.findByRole('region', { name: 'الحساب' });
}

function closeNavigationDrawer() {
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
}

async function findApiStatus(regionName = 'حالة النظام') {
  const region = await screen.findByRole('region', { name: regionName });
  return within(region).getByRole('status');
}

beforeEach(() => forgetCsrfToken());

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.mocked(leaveApplication).mockReset();
});

describe('Vertex OS technical shell', () => {
  it('starts in Arabic RTL and shows the API as available when liveness succeeds', async () => {
    const fetchMock = routeFetch(signedIn);

    renderApp();

    expect(await screen.findByRole('heading', { level: 1, name: 'Vertex OS' })).toBeTruthy();
    expect(document.documentElement.lang).toBe('ar');
    expect(document.documentElement.dir).toBe('rtl');
    const status = await findApiStatus();
    await vi.waitFor(() => expect(status.textContent).toBe('الاتصال بالواجهة البرمجية متاح'));
    // Same-origin contract: the browser calls the relative /api path, never an API origin.
    expect(fetchMock).toHaveBeenCalledWith('/api/health/live', expect.anything());
  });

  it('provides one main landmark, named navigation and a skip link to the main content', async () => {
    routeFetch({ 'GET /api/auth/session': pending, 'GET /api/health/live': pending });

    renderApp();

    const main = await screen.findByRole('main');
    expect(screen.getAllByRole('main')).toHaveLength(1);
    expect(screen.getByRole('link', { name: 'الانتقال إلى المحتوى' }).getAttribute('href')).toBe(
      `#${main.id}`,
    );
    // Narrow layout in jsdom: navigation is offered through a named control, not a fake route.
    expect(screen.getByRole('button', { name: 'فتح التنقل' })).toBeTruthy();
  });

  it('shows a pending state while the liveness check is in flight', async () => {
    routeFetch({ ...signedIn, 'GET /api/health/live': pending });

    renderApp();

    expect((await findApiStatus()).textContent).toBe('جارٍ التحقق من الاتصال بالواجهة البرمجية…');
  });

  it('stays usable and shows the API as unavailable when the liveness request fails', async () => {
    routeFetch({
      ...signedIn,
      'GET /api/health/live': () => Promise.reject(new TypeError('Failed to fetch')),
    });

    renderApp();

    const status = await findApiStatus();
    await vi.waitFor(() => expect(status.textContent).toBe('الاتصال بالواجهة البرمجية غير متاح'));
    expect(screen.getByRole('heading', { level: 1, name: 'Vertex OS' })).toBeTruthy();
  });

  it('re-checks automatically and shows the API as available again once it recovers', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let reachable = false;
    routeFetch({
      ...signedIn,
      'GET /api/health/live': () =>
        reachable ? json(200, { status: 'ok' }) : Promise.reject(new TypeError('Failed to fetch')),
    });

    renderApp();

    const status = await findApiStatus();
    await vi.waitFor(() => expect(status.textContent).toBe('الاتصال بالواجهة البرمجية غير متاح'));
    reachable = true;
    await vi.advanceTimersByTimeAsync(15_000);
    await vi.waitFor(() => expect(status.textContent).toBe('الاتصال بالواجهة البرمجية متاح'));
  });

  it('shows the API as unavailable when it answers with a problem response', async () => {
    routeFetch({ ...signedIn, 'GET /api/health/live': refusal(503, 'NOT_READY') });

    renderApp();

    const status = await findApiStatus();
    await vi.waitFor(() => expect(status.textContent).toBe('الاتصال بالواجهة البرمجية غير متاح'));
  });

  it('renders the same status behaviour in English when that preference is stored', async () => {
    localStorage.setItem('vertex.ui.preferences', JSON.stringify({ version: 1, language: 'en' }));
    routeFetch(signedIn);

    renderApp();

    const status = await findApiStatus('System status');
    await vi.waitFor(() => expect(status.textContent).toBe('API connection available'));
    expect(document.documentElement.dir).toBe('ltr');
  });

  it('answers unknown addresses with a not-found page instead of an empty screen', async () => {
    routeFetch(signedOut());

    renderApp('/no-such-page');

    expect(
      await screen.findByRole('heading', { level: 1, name: 'الصفحة غير موجودة' }),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'العودة إلى الرئيسية' })).toBeTruthy();
  });
});

describe('session experience', () => {
  it('shows a loading state, then the sign-in page when there is no session', async () => {
    let answer: (response: Response) => void = () => undefined;
    routeFetch({
      ...live,
      'GET /api/auth/session': () => new Promise<Response>((resolve) => (answer = resolve)),
    });

    renderApp();

    expect(await screen.findByText('جارٍ التحقق من الجلسة…')).toBeTruthy();
    act(() => answer(json(401, { code: 'AUTHENTICATION_REQUIRED' })));
    expect(
      await screen.findByRole('heading', { level: 1, name: 'تسجيل الدخول إلى Vertex OS' }),
    ).toBeTruthy();
    // The first visit offers email and password, without an extra verification step.
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByLabelText(/البريد الإلكتروني/)).toBeTruthy();
    expect(screen.getByLabelText(/كلمة المرور/)).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'الحساب' })).toBeNull();
  });

  it('submits email and password to the local login endpoint', async () => {
    const fetch = routeFetch({
      ...signedOut(),
      'POST /api/auth/login': () => json(200, { user: USER, session: SESSION }),
    });

    renderApp();
    fireEvent.change(await screen.findByLabelText(/البريد الإلكتروني/), {
      target: { value: USER.email },
    });
    fireEvent.change(screen.getByLabelText(/كلمة المرور/), {
      target: { value: 'a long test password 4!' },
    });
    fireEvent.click(await screen.findByRole('button', { name: 'تسجيل الدخول' }));
    await waitFor(() => expect(leaveApplication).toHaveBeenCalledWith('/'));
    expect(fetch).toHaveBeenCalledWith(
      '/api/auth/login',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ email: USER.email, password: 'a long test password 4!' }),
      }),
    );
  });

  it.each([
    ['AUTH_SESSION_EXPIRED', 'انتهت الجلسة. سجّل الدخول للمتابعة.'],
    ['AUTH_SESSION_INVALID', 'لم تعد الجلسة صالحة'],
  ])('explains a session that ended (%s)', async (code, text) => {
    routeFetch(signedOut(code));

    renderApp();

    expect(await screen.findByText(text, { exact: false })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'تسجيل الدخول' })).toBeTruthy();
  });

  it('explains an inactive account instead of claiming the user is signed out', async () => {
    routeFetch({ ...live, 'GET /api/auth/session': refusal(403, 'IAM_USER_INACTIVE') });

    renderApp();

    expect(await screen.findByText('الوصول غير متاح')).toBeTruthy();
    expect(screen.getByText(/تواصل مع مسؤول النظام/)).toBeTruthy();
  });

  it('shows a network failure as an error with a retry, not as the sign-in page', async () => {
    let reachable = false;
    routeFetch({
      ...signedIn,
      'GET /api/auth/session': () =>
        reachable
          ? json(200, { user: USER, session: SESSION })
          : Promise.reject(new TypeError('Failed to fetch')),
    });

    renderApp();

    expect(await screen.findByText('تعذّر التحقق من الجلسة')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'تسجيل الدخول' })).toBeNull();
    reachable = true;
    fireEvent.click(screen.getByRole('button', { name: 'إعادة المحاولة' }));
    expect(await openAccountArea()).toBeTruthy();
  });

  it.each([
    ['AUTH_LOGIN_FAILED', 'تعذّر إكمال تسجيل الدخول'],
    ['AUTH_RATE_LIMITED', 'محاولات تسجيل دخول كثيرة'],
  ])('explains the failed sign-in %s and removes it from the address', async (code, title) => {
    routeFetch(signedOut());

    const { router } = renderApp(`/?authError=${code}`);

    expect(await screen.findByText(title)).toBeTruthy();
    await vi.waitFor(() => expect(router.state.location.search).toEqual({}));
    // Replaced, not pushed: going back cannot return to the failure address (D-08).
    expect(router.history.length).toBe(1);
    expect(screen.getByText(title)).toBeTruthy();
  });

  it('ignores an unknown sign-in failure code', async () => {
    routeFetch(signedOut());

    renderApp('/?authError=<script>');

    expect(
      await screen.findByRole('heading', { level: 1, name: 'تسجيل الدخول إلى Vertex OS' }),
    ).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows who is signed in with the primary department in the account area', async () => {
    routeFetch(signedIn);

    renderApp();

    const account = await openAccountArea();
    expect(within(account).getByText('سارة')).toBeTruthy();
    expect(within(account).getByText('العمليات')).toBeTruthy();
    expect(within(account).queryByText('المبيعات')).toBeNull();
    expect(within(account).queryByText(USER.email)).toBeNull();
  });

  it('signs out with the CSRF token and leaves for the logout URL', async () => {
    const fetchMock = routeFetch({
      ...signedIn,
      'GET /api/auth/csrf': () => json(200, { token: 'csrf-token-1' }),
      'POST /api/auth/logout': () =>
        json(200, {
          logoutUrl: 'http://127.0.0.1:8080/realms/vertex/protocol/openid-connect/logout',
        }),
    });

    renderApp();

    const account = await openAccountArea();
    fireEvent.click(within(account).getByRole('button', { name: 'تسجيل الخروج' }));

    await vi.waitFor(() =>
      expect(leaveApplication).toHaveBeenCalledWith(
        'http://127.0.0.1:8080/realms/vertex/protocol/openid-connect/logout',
      ),
    );
    const logout = fetchMock.mock.calls.find(([path]) => path === '/api/auth/logout');
    expect((logout?.[1]?.headers as Record<string, string>)['x-csrf-token']).toBe('csrf-token-1');
    closeNavigationDrawer();
    expect(
      await screen.findByRole('heading', { level: 1, name: 'تسجيل الدخول إلى Vertex OS' }),
    ).toBeTruthy();
    // Nothing of the session reached browser storage; only the UI preferences may be there.
    const stored = [...Object.keys(localStorage), ...Object.keys(sessionStorage)];
    expect(stored.filter((key) => key !== 'vertex.ui.preferences')).toEqual([]);
    expect(JSON.stringify({ ...localStorage, ...sessionStorage })).not.toContain('csrf-token-1');
  });

  it('keeps the user signed in and reports a sign-out that could not reach the API', async () => {
    routeFetch({
      ...signedIn,
      'GET /api/auth/csrf': () => json(200, { token: 'csrf-token-1' }),
      'POST /api/auth/logout': () => Promise.reject(new TypeError('Failed to fetch')),
    });

    renderApp();

    const account = await openAccountArea();
    fireEvent.click(within(account).getByRole('button', { name: 'تسجيل الخروج' }));

    expect(await within(account).findByText(/تعذّر تسجيل الخروج/)).toBeTruthy();
    expect(leaveApplication).not.toHaveBeenCalled();
    closeNavigationDrawer();
    expect(await screen.findByRole('heading', { level: 1, name: 'Vertex OS' })).toBeTruthy();
  });

  it('moves to the sign-in page when the session expires while the app is open', async () => {
    let expired = false;
    routeFetch({
      ...signedIn,
      'GET /api/auth/session': () =>
        expired
          ? json(401, { code: 'AUTH_SESSION_EXPIRED' })
          : json(200, { user: USER, session: SESSION }),
    });

    renderApp();

    expect(await openAccountArea()).toBeTruthy();
    expired = true;
    // Returning to the tab re-reads the session (IAM-R08 D-06).
    act(() => {
      window.dispatchEvent(new Event('visibilitychange'));
      window.dispatchEvent(new Event('focus'));
    });

    expect(await screen.findByText('انتهت الجلسة. سجّل الدخول للمتابعة.')).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'الحساب' })).toBeNull();
  });

  it('renders the signed-out page in English', async () => {
    localStorage.setItem('vertex.ui.preferences', JSON.stringify({ version: 1, language: 'en' }));
    routeFetch(signedOut('AUTH_SESSION_EXPIRED'));

    renderApp();

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Sign in to Vertex OS' }),
    ).toBeTruthy();
    expect(screen.getByText('Your session has expired. Sign in to continue.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeTruthy();
  });
});
