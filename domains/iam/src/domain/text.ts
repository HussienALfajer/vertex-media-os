import type { ValidationResult } from './result.js';

declare const textBrand: unique symbol;
export type DisplayName = string & { readonly [textBrand]: 'DisplayName' };
export type EntityName = string & { readonly [textBrand]: 'EntityName' };
export type Description = string & { readonly [textBrand]: 'Description' };
export type TextReason = 'invalid-text';

function hasControl(value: string): boolean {
  return [...value].some((character) => {
    const code = character.charCodeAt(0);
    return code <= 31 || (code >= 127 && code <= 159);
  });
}

/** A lone UTF-16 surrogate is not text: storage and Audit evidence would disagree about it. */
const LONE_SURROGATE = /\p{Cs}/u;

function parseText(input: string, maximum: number): ValidationResult<string, TextReason> {
  if (typeof input !== 'string' || LONE_SURROGATE.test(input)) {
    return { ok: false, reason: 'invalid-text' };
  }
  const value = input.trim();
  const length = [...value].length;
  return length >= 1 && length <= maximum && !hasControl(value)
    ? { ok: true, value }
    : { ok: false, reason: 'invalid-text' };
}

export function parseDisplayName(input: string): ValidationResult<DisplayName, TextReason> {
  const result = parseText(input, 200);
  return result.ok ? { ok: true, value: result.value as DisplayName } : result;
}

export function parseEntityName(input: string): ValidationResult<EntityName, TextReason> {
  const result = parseText(input, 200);
  return result.ok ? { ok: true, value: result.value as EntityName } : result;
}

export function parseDescription(input: string): ValidationResult<Description, TextReason> {
  const result = parseText(input, 2_000);
  return result.ok ? { ok: true, value: result.value as Description } : result;
}
