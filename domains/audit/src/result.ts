/** Outcome of validating untrusted input: the typed value, or a stable reason code (never the input). */
export type AuditValidationResult<T, R extends string> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly reason: R };
