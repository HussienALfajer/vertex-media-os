/**
 * Same-origin HTTP access for the web application. The browser only talks to the Vertex OS API
 * through relative `/api/...` paths (served by the Vite proxy in development), so no API origin
 * is configured in browser code and no CORS is needed. The only credential is the API's
 * `HttpOnly` session cookie; browser code never sees a token (IAM-R08 D-07).
 */

type ApiPath = `/api/${string}`;
type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/** A refusal the API answered with an HTTP status, usually as RFC 9457 Problem Details. */
export class ApiProblem extends Error {
  constructor(
    readonly status: number,
    readonly code: string | undefined,
    /** The names of the invalid request fields (`400 VALIDATION_FAILED`), never their values. */
    readonly fields: readonly string[] = [],
    /** `Retry-After` in seconds, when the API sent one (`503 SERVICE_BUSY`). */
    readonly retryAfterSeconds: number | undefined = undefined,
  ) {
    super(`API request failed with HTTP ${status}${code === undefined ? '' : ` (${code})`}`);
    this.name = 'ApiProblem';
  }
}

/** The API could not be reached, or answered with a body the client cannot read. */
export class NetworkFailure extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'NetworkFailure';
  }
}

export function isApiProblem(error: unknown, status?: number, code?: string): error is ApiProblem {
  return (
    error instanceof ApiProblem &&
    (status === undefined || error.status === status) &&
    (code === undefined || error.code === code)
  );
}

/**
 * The session's CSRF token (spec Section 15), held in memory only: never in browser storage and
 * never in the query cache. A generation counter keeps a request that started before
 * `forgetCsrfToken()` from storing a token of the previous session.
 */
let csrfToken: string | undefined;
let csrfRequest: Promise<string> | undefined;
let csrfGeneration = 0;

export function forgetCsrfToken(): void {
  csrfToken = undefined;
  csrfRequest = undefined;
  csrfGeneration += 1;
}

async function currentCsrfToken(): Promise<string> {
  if (csrfToken !== undefined) return csrfToken;
  if (csrfRequest === undefined) {
    const generation = csrfGeneration;
    const request = send('GET', '/api/auth/csrf').then((body) => {
      if (!isRecord(body) || typeof body['token'] !== 'string' || body['token'] === '') {
        throw new NetworkFailure('Unexpected CSRF token response from the API');
      }
      if (generation === csrfGeneration) csrfToken = body['token'];
      return body['token'];
    });
    csrfRequest = request;
    // A failed fetch is not remembered: the next unsafe request asks again.
    request.catch(() => {
      if (csrfRequest === request) csrfRequest = undefined;
    });
  }
  return csrfRequest;
}

export interface RequestOptions {
  readonly method?: Method;
  /** Sent as JSON. */
  readonly body?: unknown;
  readonly signal?: AbortSignal;
}

/**
 * Sends one request and returns the parsed JSON body (`undefined` for an empty answer). Unsafe
 * methods carry the in-memory CSRF token as `X-CSRF-Token`. A `403 CSRF_VALIDATION_FAILED` drops
 * the token so the next action fetches a fresh one; the refused request is not retried.
 */
export async function apiRequest(path: ApiPath, options: RequestOptions = {}): Promise<unknown> {
  const method = options.method ?? 'GET';
  const csrf = method === 'GET' ? undefined : await currentCsrfToken();
  try {
    return await send(method, path, options, csrf);
  } catch (error) {
    if (isApiProblem(error, 403, 'CSRF_VALIDATION_FAILED')) forgetCsrfToken();
    throw error;
  }
}

/** Kept for simple reads (the liveness check). */
export function getJson(path: ApiPath, signal?: AbortSignal): Promise<unknown> {
  return apiRequest(path, signal === undefined ? {} : { signal });
}

async function send(
  method: Method,
  path: ApiPath,
  options: RequestOptions = {},
  csrf?: string,
): Promise<unknown> {
  const headers: Record<string, string> = { accept: 'application/json' };
  if (options.body !== undefined) headers['content-type'] = 'application/json';
  if (csrf !== undefined) headers['x-csrf-token'] = csrf;

  let response: Response;
  try {
    response = await fetch(path, {
      method,
      headers,
      credentials: 'same-origin',
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
      ...(options.signal === undefined ? {} : { signal: options.signal }),
    });
  } catch (error) {
    // An abort is the caller's decision, not a connectivity failure.
    if (options.signal?.aborted) throw error;
    throw new NetworkFailure('The Vertex OS API could not be reached', { cause: error });
  }

  if (!response.ok) throw await problemOf(response);
  const text = await response.text();
  if (text === '') return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    throw new NetworkFailure('Unreadable response from the API', { cause: error });
  }
}

/** Reads the stable fields of an RFC 9457 problem response, if the body is one. */
async function problemOf(response: Response): Promise<ApiProblem> {
  const retryAfter = Number(response.headers.get('retry-after') ?? Number.NaN);
  const retryAfterSeconds =
    Number.isInteger(retryAfter) && retryAfter >= 0 ? retryAfter : undefined;
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    // Not JSON (for example a proxy error page): the HTTP status alone describes the failure.
  }
  const code = isRecord(body) && typeof body['code'] === 'string' ? body['code'] : undefined;
  const fields =
    isRecord(body) && Array.isArray(body['fields'])
      ? body['fields'].filter((field): field is string => typeof field === 'string')
      : [];
  return new ApiProblem(response.status, code, fields, retryAfterSeconds);
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
