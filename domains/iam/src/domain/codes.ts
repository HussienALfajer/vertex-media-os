import type { ValidationResult } from './result.js';

declare const codeBrand: unique symbol;
export type DepartmentCode = string & { readonly [codeBrand]: 'DepartmentCode' };
export type RoleCode = string & { readonly [codeBrand]: 'RoleCode' };
export type ModuleCode = string & { readonly [codeBrand]: 'ModuleCode' };
export type PermissionCode = string & { readonly [codeBrand]: 'PermissionCode' };
export type CodeReason = 'invalid-code' | 'wrong-module';

const DEPARTMENT_ROLE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const MODULE_SEGMENT = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

export function parseDepartmentCode(value: string): ValidationResult<DepartmentCode, CodeReason> {
  return value.length >= 2 && value.length <= 64 && DEPARTMENT_ROLE.test(value)
    ? { ok: true, value: value as DepartmentCode }
    : { ok: false, reason: 'invalid-code' };
}

export function parseRoleCode(value: string): ValidationResult<RoleCode, CodeReason> {
  return value.length >= 2 && value.length <= 64 && DEPARTMENT_ROLE.test(value)
    ? { ok: true, value: value as RoleCode }
    : { ok: false, reason: 'invalid-code' };
}

export function parseModuleCode(value: string): ValidationResult<ModuleCode, CodeReason> {
  return value.length >= 2 && value.length <= 32 && MODULE_SEGMENT.test(value)
    ? { ok: true, value: value as ModuleCode }
    : { ok: false, reason: 'invalid-code' };
}

export function parsePermissionCode(
  value: string,
  owningModule: ModuleCode,
): ValidationResult<PermissionCode, CodeReason> {
  const parts = value.split('.');
  if (
    value.length > 128 ||
    parts.length !== 3 ||
    parts.some((part) => !MODULE_SEGMENT.test(part))
  ) {
    return { ok: false, reason: 'invalid-code' };
  }
  return parts[0] === owningModule
    ? { ok: true, value: value as PermissionCode }
    : { ok: false, reason: 'wrong-module' };
}
