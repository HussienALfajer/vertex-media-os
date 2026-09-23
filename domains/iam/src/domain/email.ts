import type { ValidationResult } from './result.js';

declare const emailBrand: unique symbol;
export type NormalizedEmail = string & { readonly [emailBrand]: 'NormalizedEmail' };
export type EmailReason = 'invalid-email';

export function normalizeEmail(input: string): ValidationResult<NormalizedEmail, EmailReason> {
  const value = input.trim();
  if (value.length < 3 || value.length > 254 || !/^[\x21-\x7e]+$/.test(value)) {
    return { ok: false, reason: 'invalid-email' };
  }
  if (!/^[^@]+@[^@]+$/.test(value)) {
    return { ok: false, reason: 'invalid-email' };
  }
  return { ok: true, value: value.toLowerCase() as NormalizedEmail };
}
