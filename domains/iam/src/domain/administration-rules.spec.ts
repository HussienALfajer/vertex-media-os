import { describe, expect, it } from 'vitest';
import type { DepartmentCode, PermissionCode, RoleCode } from './codes.js';
import type { DepartmentId, RoleId } from './identifiers.js';
import {
  decideMembershipAddition,
  decideMembershipRemoval,
  decidePrimaryChange,
  type DepartmentView,
  type MembershipFact,
} from './organization.js';
import {
  decideRoleAssignment,
  decideRoleChange,
  decideRoleRemoval,
  parseAnyPermissionCode,
  planMappingReplacement,
  type RoleView,
} from './roles.js';
import type { PermissionState } from './states.js';
import type { Description, EntityName } from './text.js';
import { decideVersionedChange } from './versioned-change.js';

const SALES = '00000000-0000-4000-8000-000000000001' as DepartmentId;
const STUDIO = '00000000-0000-4000-8000-000000000002' as DepartmentId;
const ARCHIVE = '00000000-0000-4000-8000-000000000003' as DepartmentId;
const name = (value: string) => value as EntityName;
const description = (value: string) => value as Description;
const code = (value: string) => value as PermissionCode;

const department: DepartmentView = {
  id: SALES,
  code: 'sales' as DepartmentCode,
  name: name('Sales'),
  description: undefined,
  state: 'ACTIVE',
  version: 3,
};

const customRole: RoleView = {
  id: '00000000-0000-4000-8000-000000000010' as RoleId,
  code: 'editor' as RoleCode,
  name: name('Editor'),
  description: description('Edits content.'),
  state: 'ACTIVE',
  isSystem: false,
  version: 2,
};
const systemRole: RoleView = {
  ...customRole,
  code: 'system-administrator' as RoleCode,
  isSystem: true,
};

function member(departmentId: DepartmentId, isPrimary = false, active = true): MembershipFact {
  return { departmentId, isPrimary, departmentState: active ? 'ACTIVE' : 'INACTIVE' };
}

describe('versioned department and role changes (IAM-R05 D-14)', () => {
  it('refuses a stale version before anything else, even for a no-op', () => {
    expect(decideVersionedChange(department, 2, {})).toEqual({ kind: 'version-conflict' });
    expect(decideVersionedChange(department, 4, { state: 'INACTIVE' })).toEqual({
      kind: 'version-conflict',
    });
  });

  it('writes only the changed fields, with before and after evidence', () => {
    expect(
      decideVersionedChange(department, 3, {
        name: name('Sales'),
        description: description('Sells.'),
        state: 'INACTIVE',
      }),
    ).toEqual({
      kind: 'write',
      changes: { description: 'Sells.', state: 'INACTIVE' },
      before: { description: null, state: 'ACTIVE' },
      after: { description: 'Sells.', state: 'INACTIVE' },
    });
  });

  it('clears a description with null and treats clearing an absent one as unchanged', () => {
    const described = { ...department, description: description('Sells.') };
    expect(decideVersionedChange(described, 3, { description: null })).toEqual({
      kind: 'write',
      changes: { description: null },
      before: { description: 'Sells.' },
      after: { description: null },
    });
    expect(decideVersionedChange(department, 3, { description: null })).toEqual({
      kind: 'unchanged',
    });
  });

  it('reports a request that changes nothing as unchanged', () => {
    expect(decideVersionedChange(department, 3, { name: name('Sales'), state: 'ACTIVE' })).toEqual({
      kind: 'unchanged',
    });
  });
});

describe('membership rules (spec Section 22; IAM-R05 D-09, D-10)', () => {
  it('adds a non-primary membership without touching the primary', () => {
    expect(decideMembershipAddition([member(STUDIO, true)], department, false)).toEqual({
      kind: 'add',
      demote: undefined,
    });
  });

  it('demotes the current primary when the addition is explicitly primary', () => {
    expect(decideMembershipAddition([member(STUDIO, true)], department, true)).toEqual({
      kind: 'add',
      demote: STUDIO,
    });
    expect(decideMembershipAddition([], department, true)).toEqual({
      kind: 'add',
      demote: undefined,
    });
  });

  it('refuses duplicates and INACTIVE departments', () => {
    expect(decideMembershipAddition([member(SALES)], department, false)).toEqual({
      kind: 'refuse',
      reason: 'duplicate-membership',
    });
    expect(decideMembershipAddition([], { id: SALES, state: 'INACTIVE' }, false)).toEqual({
      kind: 'refuse',
      reason: 'department-inactive',
    });
  });

  it('switches the primary explicitly and never to an INACTIVE department', () => {
    const memberships = [member(SALES, true), member(STUDIO), member(ARCHIVE, false, false)];
    expect(decidePrimaryChange(memberships, STUDIO, true, 'ACTIVE')).toEqual({
      kind: 'change',
      demote: SALES,
      promote: STUDIO,
    });
    expect(decidePrimaryChange(memberships, ARCHIVE, true, 'INACTIVE')).toEqual({
      kind: 'refuse',
      reason: 'department-inactive',
    });
    expect(decidePrimaryChange(memberships, SALES, true, 'ACTIVE')).toEqual({
      kind: 'unchanged',
    });
    expect(decidePrimaryChange(memberships, STUDIO, false, 'ACTIVE')).toEqual({
      kind: 'unchanged',
    });
  });

  it('clears the primary without choosing another one', () => {
    expect(
      decidePrimaryChange([member(SALES, true), member(STUDIO)], SALES, false, 'ACTIVE'),
    ).toEqual({ kind: 'change', demote: SALES, promote: undefined });
  });

  it('refuses a primary change for a department the user does not belong to', () => {
    expect(decidePrimaryChange([member(SALES)], STUDIO, true, 'ACTIVE')).toEqual({
      kind: 'refuse',
      reason: 'membership-not-found',
    });
  });

  it('removes the primary without a replacement unless one is named', () => {
    const memberships = [member(SALES, true), member(STUDIO)];
    expect(decideMembershipRemoval(memberships, SALES, undefined)).toEqual({
      kind: 'remove',
      wasPrimary: true,
      promote: undefined,
    });
    expect(decideMembershipRemoval(memberships, SALES, { id: STUDIO, state: 'ACTIVE' })).toEqual({
      kind: 'remove',
      wasPrimary: true,
      promote: STUDIO,
    });
  });

  it('refuses a replacement that is not a valid other membership of the user', () => {
    const memberships = [member(SALES, true), member(STUDIO), member(ARCHIVE, false, false)];
    for (const [removed, replacement] of [
      [STUDIO, { id: SALES, state: 'ACTIVE' }], // the removed membership is not primary
      [SALES, { id: SALES, state: 'ACTIVE' }], // replacement is the removed membership
      [SALES, { id: '00000000-0000-4000-8000-000000000009' as DepartmentId, state: 'ACTIVE' }],
    ] as const) {
      expect(decideMembershipRemoval(memberships, removed, replacement)).toEqual({
        kind: 'refuse',
        reason: 'primary-conflict',
      });
    }
    expect(decideMembershipRemoval(memberships, SALES, { id: ARCHIVE, state: 'INACTIVE' })).toEqual(
      { kind: 'refuse', reason: 'department-inactive' },
    );
    expect(decideMembershipRemoval(memberships, STUDIO, undefined)).toEqual({
      kind: 'remove',
      wasPrimary: false,
      promote: undefined,
    });
    expect(decideMembershipRemoval([], SALES, undefined)).toEqual({
      kind: 'refuse',
      reason: 'membership-not-found',
    });
  });
});

describe('role rules (spec Sections 9.6, 9.7, 20, 23; IAM-R05 D-11, D-13 to D-15)', () => {
  it('protects every attribute and state of the system role, whatever the version', () => {
    for (const requested of [{ name: name('Root') }, { state: 'INACTIVE' as const }, {}]) {
      expect(decideRoleChange(systemRole, 1, requested)).toEqual({
        kind: 'system-role-protected',
      });
    }
  });

  it('applies the versioned change to custom roles', () => {
    expect(decideRoleChange(customRole, 2, { state: 'INACTIVE' })).toEqual({
      kind: 'write',
      changes: { state: 'INACTIVE' },
      before: { state: 'ACTIVE' },
      after: { state: 'INACTIVE' },
    });
    expect(decideRoleChange(customRole, 1, { state: 'INACTIVE' })).toEqual({
      kind: 'version-conflict',
    });
  });

  it('parses permission codes of any module and rejects wildcards', () => {
    expect(parseAnyPermissionCode('iam.users.read')).toBe('iam.users.read');
    expect(parseAnyPermissionCode('crm.leads.manage')).toBe('crm.leads.manage');
    for (const value of ['iam.*', '*', 'iam.users', 'iam.users.*', 'IAM.users.read', '']) {
      expect(parseAnyPermissionCode(value)).toBeUndefined();
    }
  });

  const catalog = new Map<PermissionCode, PermissionState>([
    [code('iam.a.read'), 'ACTIVE'],
    [code('iam.b.read'), 'ACTIVE'],
    [code('iam.c.read'), 'DEPRECATED'],
    [code('iam.d.read'), 'RETIRED'],
  ]);

  it('replaces the mapping set as a sorted diff', () => {
    expect(
      planMappingReplacement(
        customRole,
        2,
        [code('iam.b.read'), code('iam.c.read')],
        [code('iam.b.read'), code('iam.a.read')],
        catalog,
      ),
    ).toEqual({
      kind: 'replace',
      add: ['iam.a.read'],
      remove: ['iam.c.read'],
      before: ['iam.b.read', 'iam.c.read'],
      after: ['iam.a.read', 'iam.b.read'],
    });
  });

  it('never newly maps or keeps a code that is not ACTIVE', () => {
    expect(
      planMappingReplacement(
        customRole,
        2,
        [code('iam.c.read')],
        [code('iam.d.read'), code('iam.c.read')],
        catalog,
      ),
    ).toEqual({ kind: 'permission-not-assignable', codes: ['iam.c.read', 'iam.d.read'] });
  });

  it('refuses unknown codes, stale versions and the system role, in that precedence', () => {
    expect(planMappingReplacement(customRole, 2, [], [code('iam.x.read')], catalog)).toEqual({
      kind: 'unknown-permission',
      codes: ['iam.x.read'],
    });
    expect(planMappingReplacement(customRole, 1, [], [code('iam.x.read')], catalog)).toEqual({
      kind: 'version-conflict',
    });
    expect(planMappingReplacement(systemRole, 1, [], [], catalog)).toEqual({
      kind: 'system-role-protected',
    });
  });

  it('reports an identical set as unchanged', () => {
    expect(
      planMappingReplacement(customRole, 2, [code('iam.a.read')], [code('iam.a.read')], catalog),
    ).toEqual({ kind: 'unchanged' });
  });

  it('assigns only ACTIVE roles and only once', () => {
    expect(decideRoleAssignment(customRole, false)).toEqual({ kind: 'assign' });
    expect(decideRoleAssignment(customRole, true)).toEqual({
      kind: 'refuse',
      reason: 'duplicate-assignment',
    });
    expect(decideRoleAssignment({ ...customRole, state: 'INACTIVE' }, false)).toEqual({
      kind: 'refuse',
      reason: 'role-inactive',
    });
  });

  it('never removes the System Administrator role from the last ACTIVE holder', () => {
    const removal = {
      assigned: true,
      isSystemAdministratorRole: true,
      targetAccessState: 'ACTIVE' as const,
    };
    expect(decideRoleRemoval({ ...removal, activeAdministrators: 1 })).toEqual({
      kind: 'refuse',
      reason: 'last-system-admin',
    });
    expect(decideRoleRemoval({ ...removal, activeAdministrators: 2 })).toEqual({
      kind: 'remove',
    });
  });

  it('counts only ACTIVE holders: other holders and other roles are never blocked', () => {
    for (const targetAccessState of ['INVITED', 'SUSPENDED', 'DISABLED', 'TERMINATED'] as const) {
      expect(
        decideRoleRemoval({
          assigned: true,
          isSystemAdministratorRole: true,
          targetAccessState,
          activeAdministrators: 0,
        }),
      ).toEqual({ kind: 'remove' });
    }
    expect(
      decideRoleRemoval({
        assigned: true,
        isSystemAdministratorRole: false,
        targetAccessState: 'ACTIVE',
        activeAdministrators: 1,
      }),
    ).toEqual({ kind: 'remove' });
    expect(
      decideRoleRemoval({
        assigned: false,
        isSystemAdministratorRole: true,
        targetAccessState: 'ACTIVE',
        activeAdministrators: 1,
      }),
    ).toEqual({ kind: 'refuse', reason: 'assignment-not-found' });
  });
});
