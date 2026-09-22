import { randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';

/** Header carrying the request correlation identifier in both directions. */
export const REQUEST_ID_HEADER = 'x-request-id';

/**
 * Inbound identifiers are attacker-controlled and end up in every log line of the
 * request, so only short, printable, delimiter-free tokens (UUIDs, W3C trace ids,
 * typical proxy ids) are honored. Anything else is replaced by a fresh UUID.
 */
const ACCEPTED_REQUEST_ID = /^[A-Za-z0-9._:-]{1,128}$/;

/** Fastify `genReqId`: reuse a well-formed inbound `x-request-id`, otherwise generate one. */
export function resolveRequestId(request: IncomingMessage): string {
  const inbound = request.headers[REQUEST_ID_HEADER];
  return typeof inbound === 'string' && ACCEPTED_REQUEST_ID.test(inbound) ? inbound : randomUUID();
}
