import type { ValidationResult } from './result.js';

declare const idBrand: unique symbol;
export type UserId = string & { readonly [idBrand]: 'UserId' };
export type DepartmentId = string & { readonly [idBrand]: 'DepartmentId' };
export type RoleId = string & { readonly [idBrand]: 'RoleId' };

type IdentifierReason = 'invalid-identifier';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function parseUserId(value: string): ValidationResult<UserId, IdentifierReason> {
  return UUID.test(value)
    ? { ok: true, value: value as UserId }
    : { ok: false, reason: 'invalid-identifier' };
}

export function parseDepartmentId(value: string): ValidationResult<DepartmentId, IdentifierReason> {
  return UUID.test(value)
    ? { ok: true, value: value as DepartmentId }
    : { ok: false, reason: 'invalid-identifier' };
}

export function parseRoleId(value: string): ValidationResult<RoleId, IdentifierReason> {
  return UUID.test(value)
    ? { ok: true, value: value as RoleId }
    : { ok: false, reason: 'invalid-identifier' };
}
