import { readFileSync } from 'node:fs';

interface FixtureSets {
  readonly validEmails: readonly string[];
  readonly invalidEmails: readonly string[];
  readonly validDepartmentRoleCodes: readonly string[];
  readonly invalidDepartmentRoleCodes: readonly string[];
  readonly validModuleCodes: readonly string[];
  readonly invalidModuleCodes: readonly string[];
  readonly validPermissionCodes: readonly string[];
  readonly invalidPermissionCodes: readonly string[];
}

const fixtures = JSON.parse(
  readFileSync(new URL('../../iam/test-support/validation-fixtures.json', import.meta.url), 'utf8'),
) as FixtureSets;

export const {
  validEmails,
  invalidEmails,
  validDepartmentRoleCodes,
  invalidDepartmentRoleCodes,
  validModuleCodes,
  invalidModuleCodes,
  validPermissionCodes,
  invalidPermissionCodes,
} = fixtures;
