import { describe, expect, it } from 'vitest';
import {
  invalidDepartmentRoleCodes,
  invalidEmails,
  invalidModuleCodes,
  invalidPermissionCodes,
  validDepartmentRoleCodes,
  validEmails,
  validModuleCodes,
  validPermissionCodes,
} from '../../test-support/validation-fixtures.js';
import { newApplicationUser } from './application-user.js';
import {
  parseDepartmentCode,
  parseModuleCode,
  parsePermissionCode,
  parseRoleCode,
} from './codes.js';
import { normalizeEmail } from './email.js';
import {
  parseDepartmentId,
  parseRoleId,
  parseUserId,
  type DepartmentId,
  type RoleId,
} from './identifiers.js';
import {
  departmentStates,
  identitySyncStates,
  invitationDeliveryStates,
  permissionSensitivities,
  permissionStates,
  roleStates,
  userAccessStates,
} from './states.js';
import { parseDescription, parseDisplayName, parseEntityName } from './text.js';

const departmentId = '00000000-0000-4000-8000-000000000001' as DepartmentId;
const otherDepartmentId = '00000000-0000-4000-8000-000000000002' as DepartmentId;
const roleId = '00000000-0000-4000-8000-000000000003' as RoleId;

describe('IAM persistence value validation', () => {
  it('normalizes the whole ASCII email while preserving dots and plus suffixes', () => {
    expect(normalizeEmail('  First.Last+Tag@EXAMPLE.COM  ')).toEqual({
      ok: true,
      value: 'first.last+tag@example.com',
    });
  });

  it.each(validEmails)('accepts the valid email fixture %s', (value) => {
    expect(normalizeEmail(value).ok).toBe(true);
  });

  it.each(invalidEmails)('rejects the invalid email fixture %s', (value) => {
    expect(normalizeEmail(value)).toEqual({ ok: false, reason: 'invalid-email' });
  });

  it('rejects ASCII control characters and internal spaces in email', () => {
    expect(normalizeEmail('user\u0001@example.com').ok).toBe(false);
    expect(normalizeEmail('user name@example.com').ok).toBe(false);
  });

  it('trims names and counts astral characters as one code point', () => {
    expect(parseDisplayName('  اسم عربي  ')).toEqual({ ok: true, value: 'اسم عربي' });
    expect(parseDisplayName('😀'.repeat(200)).ok).toBe(true);
    expect(parseDisplayName('😀'.repeat(201)).ok).toBe(false);
    expect(parseEntityName('فريق').ok).toBe(true);
  });

  it('rejects empty, overlong and control-bearing text', () => {
    expect(parseDisplayName('  ').ok).toBe(false);
    expect(parseDisplayName('x'.repeat(201)).ok).toBe(false);
    expect(parseEntityName('x\u007f').ok).toBe(false);
    expect(parseDescription('x'.repeat(2000)).ok).toBe(true);
    expect(parseDescription('x'.repeat(2001)).ok).toBe(false);
    expect(parseDescription(' \t ').ok).toBe(false);
  });

  it.each(validDepartmentRoleCodes)('accepts department and role code %s', (value) => {
    expect(parseDepartmentCode(value).ok).toBe(true);
    expect(parseRoleCode(value).ok).toBe(true);
  });

  it.each(invalidDepartmentRoleCodes)('rejects department and role code %s', (value) => {
    expect(parseDepartmentCode(value).ok).toBe(false);
    expect(parseRoleCode(value).ok).toBe(false);
  });

  it.each(validModuleCodes)('accepts module code %s', (value) => {
    expect(parseModuleCode(value).ok).toBe(true);
  });

  it.each(invalidModuleCodes)('rejects module code %s', (value) => {
    expect(parseModuleCode(value).ok).toBe(false);
  });

  it.each(validPermissionCodes)('accepts permission code %s', (value) => {
    const module = parseModuleCode('iam');
    if (!module.ok) throw new Error('fixture module must be valid');
    expect(parsePermissionCode(value, module.value).ok).toBe(true);
  });

  it.each(invalidPermissionCodes)('rejects permission code %s', (value) => {
    const module = parseModuleCode('iam');
    if (!module.ok) throw new Error('fixture module must be valid');
    expect(parsePermissionCode(value, module.value).ok).toBe(false);
  });

  it('rejects a validly shaped permission code with the wrong owning module', () => {
    const module = parseModuleCode('crm');
    if (!module.ok) throw new Error('fixture module must be valid');
    expect(parsePermissionCode('iam.users.read', module.value)).toEqual({
      ok: false,
      reason: 'wrong-module',
    });
  });

  it('accepts only canonical lowercase UUID text for IDs', () => {
    expect(parseUserId(departmentId).ok).toBe(true);
    expect(parseDepartmentId(departmentId).ok).toBe(true);
    expect(parseRoleId(roleId).ok).toBe(true);
    for (const value of [
      'ABCDEF00-0000-4000-8000-000000000001',
      '{00000000-0000-4000-8000-000000000001}',
      'short',
    ]) {
      expect(parseUserId(value).ok).toBe(false);
    }
  });

  it('creates an INVITED/PENDING/NOT_SENT draft with empty relations', () => {
    expect(
      newApplicationUser({
        email: 'TEST@example.com',
        displayName: ' Test ',
        memberships: [],
        roleIds: [],
      }),
    ).toMatchObject({
      ok: true,
      value: {
        email: 'test@example.com',
        displayName: 'Test',
        accessState: 'INVITED',
        identitySyncState: 'PENDING',
        invitationDeliveryState: 'NOT_SENT',
        memberships: [],
        roleIds: [],
      },
    });
  });

  it('rejects duplicate departments, two primaries and duplicate roles', () => {
    const base = { email: 'user@example.com', displayName: 'User', roleIds: [roleId] };
    expect(
      newApplicationUser({
        ...base,
        memberships: [
          { departmentId, isPrimary: false },
          { departmentId, isPrimary: true },
        ],
      }),
    ).toEqual({ ok: false, reason: 'duplicate-department' });
    expect(
      newApplicationUser({
        ...base,
        memberships: [
          { departmentId, isPrimary: true },
          { departmentId: otherDepartmentId, isPrimary: true },
        ],
      }),
    ).toEqual({ ok: false, reason: 'multiple-primary' });
    expect(newApplicationUser({ ...base, memberships: [], roleIds: [roleId, roleId] })).toEqual({
      ok: false,
      reason: 'duplicate-role',
    });
  });

  it('reports typed email and display-name failures', () => {
    expect(
      newApplicationUser({
        email: 'é@example.com',
        displayName: 'User',
        memberships: [],
        roleIds: [],
      }),
    ).toEqual({ ok: false, reason: 'invalid-email' });
    expect(
      newApplicationUser({
        email: 'user@example.com',
        displayName: '  ',
        memberships: [],
        roleIds: [],
      }),
    ).toEqual({ ok: false, reason: 'invalid-display-name' });
  });

  it('keeps all seven state tuples closed and ordered', () => {
    expect(userAccessStates).toEqual(['INVITED', 'ACTIVE', 'SUSPENDED', 'DISABLED', 'TERMINATED']);
    expect(identitySyncStates).toEqual(['PENDING', 'SYNCED', 'FAILED']);
    expect(invitationDeliveryStates).toEqual(['NOT_SENT', 'SENT', 'FAILED']);
    expect(departmentStates).toEqual(['ACTIVE', 'INACTIVE']);
    expect(roleStates).toEqual(['ACTIVE', 'INACTIVE']);
    expect(permissionStates).toEqual(['ACTIVE', 'DEPRECATED', 'RETIRED']);
    expect(permissionSensitivities).toEqual(['STANDARD', 'SENSITIVE', 'PRIVILEGED']);
  });
});
