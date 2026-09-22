/**
 * Minimal same-origin HTTP access for the web application. The browser only talks
 * to the Vertex OS API through relative `/api/...` paths (served by the Vite proxy in
 * development), so no API origin is configured in browser code and no CORS is needed.
 */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string | undefined,
  ) {
    super(`API request failed with HTTP ${status}${code === undefined ? '' : ` (${code})`}`);
    this.name = 'HttpError';
  }
}

export async function getJson(path: `/api/${string}`, signal?: AbortSignal): Promise<unknown> {
  const response = await fetch(path, {
    headers: { accept: 'application/json' },
    ...(signal === undefined ? {} : { signal }),
  });

  if (!response.ok) {
    throw new HttpError(response.status, await readProblemCode(response));
  }

  return response.json();
}

/** Extracts the stable `code` of an RFC 9457 problem response, if the body is one. */
async function readProblemCode(response: Response): Promise<string | undefined> {
  try {
    const body: unknown = await response.json();
    return typeof body === 'object' &&
      body !== null &&
      'code' in body &&
      typeof body.code === 'string'
      ? body.code
      : undefined;
  } catch {
    // Not JSON (for example a proxy error page): the HTTP status alone describes the failure.
    return undefined;
  }
}
