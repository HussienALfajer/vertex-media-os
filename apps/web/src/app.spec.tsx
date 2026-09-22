import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router';
import { render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAppRouter } from './router';

function renderShell() {
  const queryClient = new QueryClient();
  const router = createAppRouter(createMemoryHistory({ initialEntries: ['/'] }));
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

async function findApiStatus() {
  const region = await screen.findByRole('region', { name: 'System status' });
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

  it('identifies the product and shows the API as available when liveness succeeds', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { status: 'ok' }));
    vi.stubGlobal('fetch', fetchMock);

    renderShell();

    expect(await screen.findByRole('heading', { level: 1, name: 'Vertex OS' })).toBeTruthy();
    const status = await findApiStatus();
    await vi.waitFor(() => expect(status.textContent).toBe('API connection available'));
    // Same-origin contract: the browser calls the relative /api path, never an API origin.
    expect(fetchMock).toHaveBeenCalledWith('/api/health/live', expect.anything());
  });

  it('shows a pending state while the liveness check is in flight', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise<Response>(() => undefined)),
    );

    renderShell();

    expect((await findApiStatus()).textContent).toBe('Checking API connection…');
  });

  it('stays usable and shows the API as unavailable when the request fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    renderShell();

    const status = await findApiStatus();
    await vi.waitFor(() => expect(status.textContent).toBe('API connection unavailable'));
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
    await vi.waitFor(() => expect(status.textContent).toBe('API connection unavailable'));
    await vi.advanceTimersByTimeAsync(15_000);
    await vi.waitFor(() => expect(status.textContent).toBe('API connection available'));
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
    await vi.waitFor(() => expect(status.textContent).toBe('API connection unavailable'));
  });
});
