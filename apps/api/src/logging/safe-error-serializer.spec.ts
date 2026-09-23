import { Writable } from 'node:stream';
import { DatabaseUnavailableError } from '@vertex-os/database';
import { describe, expect, it } from 'vitest';
import { createApp } from '../app.factory.js';
import { testAuthConfig } from '../../test-support/auth-config.js';
import { loadAppConfig } from '../config/app-config.js';
import { DATABASE_ERROR_MESSAGE, safeErrorSerializer } from './safe-error-serializer.js';

const SENTINEL = 'sentinel-person@example.com';

class ErrorWithData extends Error {
  readonly meta = {
    driverAdapterError: { cause: { detail: `Failing row contains (${SENTINEL})` } },
  };
  readonly row = { email: SENTINEL };
  readonly code = 'E_SAFE_CODE';
  readonly statusCode = 502;
}

describe('safeErrorSerializer', () => {
  it('keeps type, message, stack, code and statusCode and drops every other property', () => {
    const error = new ErrorWithData('upstream failed');
    const serialized = safeErrorSerializer(error);
    expect(serialized).toEqual({
      type: 'ErrorWithData',
      message: 'upstream failed',
      stack: error.stack,
      code: 'E_SAFE_CODE',
      statusCode: 502,
    });
    expect(JSON.stringify(serialized)).not.toContain(SENTINEL);
  });

  it('keeps a numeric code and drops a code that is not a short token', () => {
    const numeric = Object.assign(new Error('a'), { code: 42 });
    const free = Object.assign(new Error('b'), { code: `contains ${SENTINEL}` });
    expect(safeErrorSerializer(numeric)).toMatchObject({ code: 42 });
    expect(safeErrorSerializer(free)).not.toHaveProperty('code');
  });

  it('logs a database error only as its allowlisted description', () => {
    expect(
      safeErrorSerializer(new DatabaseUnavailableError('DatabaseNotReachable', undefined)),
    ).toEqual({
      type: 'DatabaseUnavailableError',
      message: DATABASE_ERROR_MESSAGE,
      stack: '',
      database: { errorClass: 'DatabaseUnavailableError', reason: 'DatabaseNotReachable' },
    });
  });

  it('serializes the cause chain recursively, applying the same rules, up to a depth of three', () => {
    const root = new ErrorWithData('root');
    const chain = new Error('level 0', {
      cause: new Error('level 1', {
        cause: new Error('level 2', { cause: new Error('level 3', { cause: root }) }),
      }),
    });
    const serialized = safeErrorSerializer(chain);
    expect(serialized.cause?.message).toBe('level 1');
    expect(serialized.cause?.cause?.message).toBe('level 2');
    expect(serialized.cause?.cause?.cause?.message).toBe('level 3');
    expect(serialized.cause?.cause?.cause?.cause).toEqual({
      type: 'ErrorWithData',
      message: '[cause depth limit reached]',
      stack: '',
    });
    expect(JSON.stringify(serialized)).not.toContain(SENTINEL);
    const wrapped = safeErrorSerializer(
      new Error('wrapper', { cause: new DatabaseUnavailableError('Unclassified', undefined) }),
    );
    expect(wrapped.cause).toEqual({
      type: 'DatabaseUnavailableError',
      message: DATABASE_ERROR_MESSAGE,
      stack: '',
      database: { errorClass: 'DatabaseUnavailableError', reason: 'Unclassified' },
    });
  });

  it('never throws on cyclic causes or non-Error values', () => {
    const cyclic = new Error('cyclic');
    cyclic.cause = cyclic;
    expect(safeErrorSerializer(cyclic).cause).toEqual({
      type: 'Error',
      message: '[circular]',
      stack: '',
    });

    const hostile = {
      get email(): string {
        throw new Error('getter');
      },
      toString(): string {
        throw new Error('toString');
      },
    };
    for (const value of [
      undefined,
      null,
      42,
      'plain text',
      { email: SENTINEL },
      hostile,
      Object.create(null),
    ]) {
      expect(() => safeErrorSerializer(value)).not.toThrow();
    }
    expect(safeErrorSerializer({ email: SENTINEL })).toEqual({
      type: 'Object',
      message: '[object Object]',
      stack: '',
    });
    expect(safeErrorSerializer(hostile)).toEqual({
      type: 'Object',
      message: '[unprintable]',
      stack: '',
    });
  });
});

describe('the API logger', () => {
  it('applies the safe serializer to errors logged through the Fastify logger and its children', async () => {
    const lines: string[] = [];
    const app = await createApp(
      loadAppConfig({
        NODE_ENV: 'test',
        LOG_LEVEL: 'error',
        DATABASE_URL: 'postgresql://vertex:unused@127.0.0.1:1/vertex_os',
      }),
      testAuthConfig(),
      {
        logStream: new Writable({
          write(chunk: Buffer, _encoding, done) {
            lines.push(chunk.toString());
            done();
          },
        }),
      },
    );
    try {
      const logger = app.getHttpAdapter().getInstance().log;
      logger.error({ err: new ErrorWithData('first') }, 'direct');
      logger.child({ reqId: 'request-1' }).error({ err: new ErrorWithData('second') }, 'child');
      const records = lines.map((line) => JSON.parse(line) as Record<string, unknown>);
      expect(records).toHaveLength(2);
      expect(records[0]).toMatchObject({
        msg: 'direct',
        err: { type: 'ErrorWithData', message: 'first' },
      });
      expect(records[1]).toMatchObject({
        msg: 'child',
        reqId: 'request-1',
        err: { message: 'second' },
      });
      expect(lines.join('')).not.toContain(SENTINEL);
    } finally {
      await app.close();
    }
  });
});
