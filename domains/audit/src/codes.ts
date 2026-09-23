import type { AuditValidationResult } from './result.js';
import { codePointLength, hasControlCharacter } from './text.js';

declare const auditBrand: unique symbol;
type Brand<T extends string> = string & { readonly [auditBrand]: T };

/** Owning module of the audited behavior, e.g. `iam`. */
export type AuditModuleCode = Brand<'AuditModuleCode'>;
/** `<module>.<resource>.<event>`, e.g. `iam.role.permissions-granted`. */
export type AuditActionCode = Brand<'AuditActionCode'>;
/** `<module>.<resource>`, e.g. `iam.permission`. */
export type AuditTargetType = Brand<'AuditTargetType'>;
/** Opaque identifier or stable code of the target; never an email or free text. */
export type AuditTargetId = Brand<'AuditTargetId'>;
/** Identified system process acting without a user, `<module>.<process>`, e.g. `iam.reference-sync`. */
export type SystemProcessCode = Brand<'SystemProcessCode'>;
/** Vertex user identifier as canonical lowercase UUID text. */
export type AuditUserId = Brand<'AuditUserId'>;
/** Request or trace correlation identifier. */
export type TraceId = Brand<'TraceId'>;
/** Untrusted, bounded accountability text an administrator supplied (spec Section 53). */
export type AdministrativeReason = Brand<'AdministrativeReason'>;

const SEGMENT = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;
const TARGET_ID = /^[a-z0-9]([a-z0-9._-]{0,126}[a-z0-9])?$/;
// Identical to the API's accepted request-ID grammar (apps/api/src/http/request-id.ts), so every
// API request ID is a valid audit trace ID (IAM-02 I-8).
const TRACE_ID = /^[A-Za-z0-9._:-]{1,128}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function segments(value: string, count: number, maximum: number): boolean {
  const parts = value.split('.');
  return (
    value.length <= maximum && parts.length === count && parts.every((part) => SEGMENT.test(part))
  );
}

export function isAuditModuleCode(value: unknown): value is AuditModuleCode {
  return isString(value) && value.length >= 2 && value.length <= 32 && SEGMENT.test(value);
}

export function isAuditActionCode(value: unknown): value is AuditActionCode {
  return isString(value) && segments(value, 3, 128);
}

export function isAuditTargetType(value: unknown): value is AuditTargetType {
  return isString(value) && segments(value, 2, 64);
}

export function isAuditTargetId(value: unknown): value is AuditTargetId {
  return isString(value) && TARGET_ID.test(value);
}

export function isAuditUserId(value: unknown): value is AuditUserId {
  return isString(value) && UUID.test(value);
}

export function parseSystemProcess(
  value: string,
): AuditValidationResult<SystemProcessCode, 'invalid-process'> {
  return isString(value) && segments(value, 2, 64)
    ? { ok: true, value: value as SystemProcessCode }
    : { ok: false, reason: 'invalid-process' };
}

export function parseTraceId(value: string): AuditValidationResult<TraceId, 'invalid-trace-id'> {
  return isString(value) && TRACE_ID.test(value)
    ? { ok: true, value: value as TraceId }
    : { ok: false, reason: 'invalid-trace-id' };
}

/** Trims, then requires 1–500 code points and no C0/C1 control character. */
export function parseAdministrativeReason(
  input: string,
): AuditValidationResult<AdministrativeReason, 'invalid-reason'> {
  if (!isString(input)) return { ok: false, reason: 'invalid-reason' };
  const value = input.trim();
  const length = codePointLength(value);
  return length >= 1 && length <= 500 && !hasControlCharacter(value)
    ? { ok: true, value: value as AdministrativeReason }
    : { ok: false, reason: 'invalid-reason' };
}
