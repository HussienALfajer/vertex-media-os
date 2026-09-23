import type { AuditValidationResult } from './result.js';
import { codePointLength, hasControlCharacter, utf8ByteLength } from './text.js';

/** A value recorded as change evidence: a bounded primitive or a bounded list of strings. */
export type AuditChangeValue = string | number | boolean | null | readonly string[];

/** Field name → value, at most 32 fields. */
export type AuditChangeSide = Readonly<Record<string, AuditChangeValue>>;

/**
 * Before/after evidence of the changed fields; at least one side is present. A type alias rather
 * than an interface so it stays assignable to JSON-value types with index signatures.
 */
export type AuditChange = {
  readonly before?: AuditChangeSide;
  readonly after?: AuditChangeSide;
};

export type AuditChangeRejection = 'invalid-change' | 'sensitive-change-field' | 'change-too-large';

export const MAX_CHANGE_FIELDS = 32;
export const MAX_CHANGE_STRING_CODE_POINTS = 2_000;
export const MAX_CHANGE_LIST_ITEMS = 500;
export const MAX_CHANGE_LIST_ITEM_CODE_POINTS = 128;
export const MAX_CHANGE_BYTES = 16_384;

const FIELD_NAME = /^[a-z][A-Za-z0-9]{0,63}$/;
/** Field names that could carry secrets (spec Section 35 "MUST NOT contain"); matched as substrings. */
const SENSITIVE_FIELD_FRAGMENTS = [
  'password',
  'passwd',
  'secret',
  'token',
  'cookie',
  'authorization',
  'credential',
  'sessionid',
  'apikey',
  'privatekey',
] as const;

type Checked<T> = AuditValidationResult<T, AuditChangeRejection>;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isSafeString(value: string, maximum: number): boolean {
  return codePointLength(value) <= maximum && !hasControlCharacter(value);
}

function checkValue(value: unknown): Checked<AuditChangeValue> {
  if (value === null || typeof value === 'boolean') return { ok: true, value };
  if (typeof value === 'number') {
    return Number.isFinite(value) ? { ok: true, value } : { ok: false, reason: 'invalid-change' };
  }
  if (typeof value === 'string') {
    return isSafeString(value, MAX_CHANGE_STRING_CODE_POINTS)
      ? { ok: true, value }
      : { ok: false, reason: 'invalid-change' };
  }
  if (Array.isArray(value)) {
    const items: unknown[] = value;
    const valid =
      items.length <= MAX_CHANGE_LIST_ITEMS &&
      items.every(
        (item) => typeof item === 'string' && isSafeString(item, MAX_CHANGE_LIST_ITEM_CODE_POINTS),
      );
    return valid
      ? { ok: true, value: Object.freeze([...(items as string[])]) }
      : { ok: false, reason: 'invalid-change' };
  }
  return { ok: false, reason: 'invalid-change' };
}

function checkSide(side: unknown): Checked<AuditChangeSide> {
  if (!isPlainObject(side)) return { ok: false, reason: 'invalid-change' };
  const names = Object.keys(side);
  if (names.length < 1 || names.length > MAX_CHANGE_FIELDS) {
    return { ok: false, reason: 'invalid-change' };
  }
  const copy: Record<string, AuditChangeValue> = {};
  for (const name of names) {
    const lower = name.toLowerCase();
    if (SENSITIVE_FIELD_FRAGMENTS.some((fragment) => lower.includes(fragment))) {
      return { ok: false, reason: 'sensitive-change-field' };
    }
    if (!FIELD_NAME.test(name)) return { ok: false, reason: 'invalid-change' };
    const value = checkValue(side[name]);
    if (!value.ok) return value;
    copy[name] = value.value;
  }
  return { ok: true, value: Object.freeze(copy) };
}

/**
 * Validates change evidence and returns an immutable copy. Only `before` and `after` are allowed,
 * each a non-empty object of named fields; values are bounded primitives or bounded string lists;
 * the serialized evidence is at most 16 384 UTF-8 bytes.
 */
export function checkAuditChange(input: unknown): Checked<AuditChange> {
  if (!isPlainObject(input)) return { ok: false, reason: 'invalid-change' };
  const keys = Object.keys(input);
  if (keys.length === 0 || keys.some((key) => key !== 'before' && key !== 'after')) {
    return { ok: false, reason: 'invalid-change' };
  }
  const change: { before?: AuditChangeSide; after?: AuditChangeSide } = {};
  for (const key of keys as ('before' | 'after')[]) {
    const side = checkSide(input[key]);
    if (!side.ok) return side;
    change[key] = side.value;
  }
  if (utf8ByteLength(JSON.stringify(change)) > MAX_CHANGE_BYTES) {
    return { ok: false, reason: 'change-too-large' };
  }
  return { ok: true, value: Object.freeze(change) };
}
