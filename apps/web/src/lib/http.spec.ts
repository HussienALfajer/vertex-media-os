import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiProblem, apiRequest, forgetCsrfToken, NetworkFailure } from './http';

function json(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

type Call = [string, RequestInit];

describe('the API client', () => {
  let fetchMock: ReturnType<typeof vi.fn<(path: string, init: RequestInit) => Promise<Response>>>;

  beforeEach(() => {
    forgetCsrfToken();
    fetchMock = vi.fn<(path: string, init: RequestInit) => Promise<Response>>();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => vi.unstubAllGlobals());

  const headersOf = (call: Call) => call[1].headers as Record<string, string>;

  it('reads same-origin JSON without a CSRF token', async () => {
    fetchMock.mockResolvedValue(json(200, { ok: true }));

    await expect(apiRequest('/api/things')).resolves.toEqual({ ok: true });

    const [path, init] = fetchMock.mock.calls[0] as Call;
    expect(path).toBe('/api/things');
    expect(init.method).toBe('GET');
    expect(init.credentials).toBe('same-origin');
    expect(headersOf([path, init])).not.toHaveProperty('x-csrf-token');
  });

  it('returns undefined for an empty success', async () => {
    fetchMock
      .mockResolvedValueOnce(json(200, { token: 'csrf-1' }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    await expect(apiRequest('/api/things/1', { method: 'DELETE' })).resolves.toBeUndefined();
  });

  it('reads the stable fields of a problem response', async () => {
    fetchMock.mockResolvedValue(
      json(
        503,
        { status: 503, code: 'SERVICE_BUSY', fields: ['name', 7, 'code'] },
        { 'retry-after': '1' },
      ),
    );

    const error = await apiRequest('/api/things').catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ApiProblem);
    expect(error).toMatchObject({
      status: 503,
      code: 'SERVICE_BUSY',
      fields: ['name', 'code'],
      retryAfterSeconds: 1,
    });
  });

  it('keeps the status when a refusal has no problem body', async () => {
    fetchMock.mockResolvedValue(new Response('<html>Bad gateway</html>', { status: 502 }));

    const error = await apiRequest('/api/things').catch((caught: unknown) => caught);

    expect(error).toMatchObject({ status: 502, code: undefined, fields: [] });
  });

  it('reports an unreachable API as a network failure, not as a refusal', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(apiRequest('/api/things')).rejects.toBeInstanceOf(NetworkFailure);
  });

  it('passes an abort through unchanged', async () => {
    const controller = new AbortController();
    const abort = new DOMException('aborted', 'AbortError');
    fetchMock.mockImplementation(() => {
      controller.abort();
      return Promise.reject(abort);
    });

    await expect(apiRequest('/api/things', { signal: controller.signal })).rejects.toBe(abort);
  });

  it('reports an unreadable success body as a network failure', async () => {
    fetchMock.mockResolvedValue(new Response('not json', { status: 200 }));

    await expect(apiRequest('/api/things')).rejects.toBeInstanceOf(NetworkFailure);
  });

  it('fetches the CSRF token once and sends it on every unsafe request', async () => {
    fetchMock
      .mockResolvedValueOnce(json(200, { token: 'csrf-1' }))
      .mockImplementation(() => Promise.resolve(json(200, { done: true })));

    await apiRequest('/api/things', { method: 'POST', body: { name: 'a' } });
    await apiRequest('/api/things/1', { method: 'PATCH', body: { name: 'b' } });

    const calls = fetchMock.mock.calls as Call[];
    expect(calls.map(([path, init]) => `${init.method} ${path}`)).toEqual([
      'GET /api/auth/csrf',
      'POST /api/things',
      'PATCH /api/things/1',
    ]);
    expect(headersOf(calls[1] as Call)['x-csrf-token']).toBe('csrf-1');
    expect(headersOf(calls[2] as Call)['x-csrf-token']).toBe('csrf-1');
    expect(headersOf(calls[1] as Call)['content-type']).toBe('application/json');
    expect((calls[1] as Call)[1].body).toBe('{"name":"a"}');
  });

  it('drops the token after a CSRF refusal and does not retry the refused request', async () => {
    fetchMock
      .mockResolvedValueOnce(json(200, { token: 'csrf-old' }))
      .mockResolvedValueOnce(json(403, { code: 'CSRF_VALIDATION_FAILED' }))
      .mockResolvedValueOnce(json(200, { token: 'csrf-new' }))
      .mockResolvedValueOnce(json(200, { done: true }));

    await expect(apiRequest('/api/things', { method: 'POST' })).rejects.toMatchObject({
      status: 403,
      code: 'CSRF_VALIDATION_FAILED',
    });
    await apiRequest('/api/things', { method: 'POST' });

    const calls = fetchMock.mock.calls as Call[];
    expect(calls.map(([path, init]) => `${init.method} ${path}`)).toEqual([
      'GET /api/auth/csrf',
      'POST /api/things',
      'GET /api/auth/csrf',
      'POST /api/things',
    ]);
    expect(headersOf(calls[3] as Call)['x-csrf-token']).toBe('csrf-new');
  });

  it('does not keep a token that arrives after it was forgotten', async () => {
    let answer: (response: Response) => void = () => undefined;
    fetchMock.mockReturnValueOnce(new Promise<Response>((resolve) => (answer = resolve)));
    const first = apiRequest('/api/things', { method: 'POST' });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    forgetCsrfToken();
    fetchMock.mockResolvedValueOnce(json(200, { done: true }));
    answer(json(200, { token: 'csrf-of-the-previous-session' }));
    await first;

    fetchMock
      .mockResolvedValueOnce(json(200, { token: 'csrf-current' }))
      .mockResolvedValueOnce(json(200, { done: true }));
    await apiRequest('/api/things', { method: 'POST' });

    const calls = fetchMock.mock.calls as Call[];
    expect(calls[2]?.[0]).toBe('/api/auth/csrf');
    expect(headersOf(calls[3] as Call)['x-csrf-token']).toBe('csrf-current');
  });

  it('refuses an unsafe request when the CSRF token cannot be read', async () => {
    fetchMock.mockResolvedValueOnce(json(401, { code: 'AUTHENTICATION_REQUIRED' }));

    await expect(apiRequest('/api/things', { method: 'POST' })).rejects.toMatchObject({
      status: 401,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
