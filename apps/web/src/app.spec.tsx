import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router';
import { render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAppRouter } from './router';

function renderShell(path = '/') {
  const queryClient = new QueryClient();
  const router = createAppRouter(createMemoryHistory({ initialEntries: [path] }));
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

async function findApiStatus(regionName = 'حالة النظام') {
  const region = await screen.findByRole('region', { name: regionName });
  return within(region).getByRole('status');
}

function jsonResponse(status: number, body: unknown, contentType = 'application/json') {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': contentType } });
}

describe('Vertex OS technical shell', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('starts in Arabic RTL and shows the API as available when liveness succeeds', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { status: 'ok' }));
    vi.stubGlobal('fetch', fetchMock);

    renderShell();

    expect(await screen.findByRole('heading', { level: 1, name: 'Vertex OS' })).toBeTruthy();
    expect(document.documentElement.lang).toBe('ar');
    expect(document.documentElement.dir).toBe('rtl');
    const status = await findApiStatus();
    await vi.waitFor(() => expect(status.textContent).toBe('الاتصال بالواجهة البرمجية متاح'));
    // Same-origin contract: the browser calls the relative /api path, never an API origin.
    expect(fetchMock).toHaveBeenCalledWith('/api/health/live', expect.anything());
  });

  it('provides one main landmark, named navigation and a skip link to the main content', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise<Response>(() => undefined)),
    );

    renderShell();

    const main = await screen.findByRole('main');
    expect(screen.getAllByRole('main')).toHaveLength(1);
    expect(screen.getByRole('link', { name: 'الانتقال إلى المحتوى' }).getAttribute('href')).toBe(
      `#${main.id}`,
    );
    // Narrow layout in jsdom: navigation is offered through a named control, not a fake route.
    expect(screen.getByRole('button', { name: 'فتح التنقل' })).toBeTruthy();
  });

  it('shows a pending state while the liveness check is in flight', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise<Response>(() => undefined)),
    );

    renderShell();

    expect((await findApiStatus()).textContent).toBe('جارٍ التحقق من الاتصال بالواجهة البرمجية…');
  });

  it('stays usable and shows the API as unavailable when the request fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    renderShell();

    const status = await findApiStatus();
    await vi.waitFor(() => expect(status.textContent).toBe('الاتصال بالواجهة البرمجية غير متاح'));
    expect(screen.getByRole('heading', { level: 1, name: 'Vertex OS' })).toBeTruthy();
  });

  it('re-checks automatically and shows the API as available again once it recovers', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockRejectedValueOnce(new TypeError('Failed to fetch'))
        .mockResolvedValue(jsonResponse(200, { status: 'ok' })),
    );

    renderShell();

    const status = await findApiStatus();
    await vi.waitFor(() => expect(status.textContent).toBe('الاتصال بالواجهة البرمجية غير متاح'));
    await vi.advanceTimersByTimeAsync(15_000);
    await vi.waitFor(() => expect(status.textContent).toBe('الاتصال بالواجهة البرمجية متاح'));
  });

  it('shows the API as unavailable when it answers with a problem response', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse(503, { status: 503, code: 'NOT_READY' }, 'application/problem+json'),
        ),
    );

    renderShell();

    const status = await findApiStatus();
    await vi.waitFor(() => expect(status.textContent).toBe('الاتصال بالواجهة البرمجية غير متاح'));
  });

  it('renders the same status behaviour in English when that preference is stored', async () => {
    localStorage.setItem('vertex.ui.preferences', JSON.stringify({ version: 1, language: 'en' }));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(200, { status: 'ok' })));

    renderShell();

    const status = await findApiStatus('System status');
    await vi.waitFor(() => expect(status.textContent).toBe('API connection available'));
    expect(document.documentElement.dir).toBe('ltr');
  });

  it('answers unknown addresses with a not-found page instead of an empty screen', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise<Response>(() => undefined)),
    );

    renderShell('/no-such-page');

    expect(
      await screen.findByRole('heading', { level: 1, name: 'الصفحة غير موجودة' }),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'العودة إلى الرئيسية' })).toBeTruthy();
  });
});
