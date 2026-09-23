import type { IncomingMessage } from 'node:http';
import { parseTraceId } from '@vertex-os/audit';
import { describe, expect, it } from 'vitest';
import { resolveRequestId } from './request-id.js';

function request(header?: string): IncomingMessage {
  return { headers: header === undefined ? {} : { 'x-request-id': header } } as IncomingMessage;
}

describe('request IDs as audit trace IDs (IAM-02 I-8)', () => {
  it('produces only values the MOD-AUDIT trace-ID grammar accepts, generated or inbound', () => {
    const inbound = [
      undefined,
      'edge-proxy.4f1c:9a',
      '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
      'X',
      'x'.repeat(128),
      'x'.repeat(129),
      'has spaces',
      'quote"inside',
      '{"level":60}',
      'é',
      '',
    ];
    for (const header of inbound) {
      const id = resolveRequestId(request(header));
      expect(parseTraceId(id)).toEqual({ ok: true, value: id });
    }
  });

  it('keeps every well-formed inbound value unchanged, so the log and the Audit record correlate', () => {
    for (const header of ['edge-proxy.4f1c:9a', 'x'.repeat(128)]) {
      expect(resolveRequestId(request(header))).toBe(header);
    }
  });
});
