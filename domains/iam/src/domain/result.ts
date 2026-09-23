export type ValidationResult<T, R extends string> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly reason: R };
