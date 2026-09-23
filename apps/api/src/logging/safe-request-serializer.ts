import type { FastifyRequest } from 'fastify';

/** The request fields every `incoming request` log line carries. */
export interface SerializedRequest {
  readonly [key: string]: unknown;
  readonly method: string;
  /** The path only: query strings can carry OIDC authorization codes and state (spec Section 36). */
  readonly url: string;
  readonly host?: string;
  readonly remoteAddress?: string;
  readonly remotePort?: number;
}

/**
 * Pino `req` serializer for the API. Fastify's default logs the full URL, so the OIDC callback's
 * `?code=…&state=…` would reach the logs; this one keeps the fields of the default minus the query
 * string and fragment (IAM-R03 D-20). Never throws.
 */
export function safeRequestSerializer(request: FastifyRequest): SerializedRequest {
  const url: unknown = request.url;
  const method: unknown = request.method;
  const host: unknown = request.host;
  const ip: unknown = request.ip;
  const remotePort: unknown = request.socket?.remotePort;
  return {
    method: typeof method === 'string' ? method : '',
    url: typeof url === 'string' ? (url.split(/[?#]/, 1)[0] ?? '') : '',
    ...(typeof host === 'string' ? { host } : {}),
    ...(typeof ip === 'string' ? { remoteAddress: ip } : {}),
    ...(typeof remotePort === 'number' ? { remotePort } : {}),
  };
}
