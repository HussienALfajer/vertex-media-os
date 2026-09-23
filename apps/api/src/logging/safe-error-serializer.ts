import { describeDatabaseError, type DatabaseErrorDescription } from '@vertex-os/database';

/**
 * The shape every logged `err` takes. `type`, `message` and `stack` are always strings (the shape
 * Fastify's logger types expect); a database error's own message and stack are never used.
 */
export interface SerializedError {
  readonly [key: string]: unknown;
  readonly type: string;
  readonly message: string;
  readonly stack: string;
  readonly database?: DatabaseErrorDescription;
  readonly code?: string | number;
  readonly statusCode?: number;
  readonly cause?: SerializedError;
}

/** Stands in for a database error's message, which carries row data and raw input. */
export const DATABASE_ERROR_MESSAGE = 'Database error; only its allowlisted description is logged.';

const MAX_CAUSE_DEPTH = 3;
const SAFE_CODE = /^[A-Za-z0-9_.:-]{1,64}$/;

function typeOf(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value !== 'object') return typeof value;
  try {
    const name: unknown = value.constructor?.name;
    return typeof name === 'string' && name.length > 0 ? name : 'Object';
  } catch {
    return 'Object';
  }
}

function describeValue(value: unknown): string {
  try {
    return String(value);
  } catch {
    return '[unprintable]';
  }
}

function serialize(value: unknown, depth: number, seen: WeakSet<object>): SerializedError {
  const type = typeOf(value);
  const database = describeDatabaseError(value);
  // Database errors carry row data and raw input in their messages, meta and stacks: only the
  // allowlisted description is ever logged (IAM-02 D-15).
  if (database) return { type, message: DATABASE_ERROR_MESSAGE, stack: '', database };
  if (!(value instanceof Error)) return { type, message: describeValue(value), stack: '' };
  if (seen.has(value)) return { type, message: '[circular]', stack: '' };
  seen.add(value);

  const code: unknown = (value as { code?: unknown }).code;
  const statusCode: unknown = (value as { statusCode?: unknown }).statusCode;
  const cause: unknown = value.cause;
  return {
    type,
    message: value.message,
    stack: value.stack ?? '',
    ...((typeof code === 'string' && SAFE_CODE.test(code)) ||
    (typeof code === 'number' && Number.isFinite(code))
      ? { code }
      : {}),
    ...(typeof statusCode === 'number' && Number.isInteger(statusCode) ? { statusCode } : {}),
    ...(cause === undefined
      ? {}
      : {
          cause:
            depth < MAX_CAUSE_DEPTH
              ? serialize(cause, depth + 1, seen)
              : { type: typeOf(cause), message: '[cause depth limit reached]', stack: '' },
        }),
  };
}

/**
 * Pino `err` serializer for every logger in the API process. Unlike pino's standard serializer it
 * never copies arbitrary enumerable properties (such as Prisma's `meta`, which holds whole database
 * rows): database errors become their allowlisted description; other errors keep only `type`,
 * `message`, `stack`, a safe `code`, `statusCode` and a depth-bounded `cause` chain. It never
 * throws, including on cyclic causes and non-Error values.
 */
export function safeErrorSerializer(value: unknown): SerializedError {
  try {
    return serialize(value, 0, new WeakSet());
  } catch {
    return { type: 'unserializable', message: '', stack: '' };
  }
}
