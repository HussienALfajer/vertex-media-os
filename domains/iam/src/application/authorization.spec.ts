import { describe, expect, it } from 'vitest';
import { parseTraceId } from '@vertex-os/audit';
import { InMemoryIam, USER_ID } from '../../test-support/identity-provisioning-fakes.js';
import {
  hasPermission,
  projectAuthorizationContext,
  type AuthorizationFacts,
} from '../domain/authorization-context.js';
import type { PermissionCode } from '../domain/codes.js';
import type { DepartmentId } from '../domain/identifiers.js';
import { recordAuthorizationDenial, resolveAuthorizationContext } from './authorization.js';
import type { AuthorizationReader } from './ports/authorization-reader.js';

const SALES = '1a2b3c4d-0000-4000-8000-000000000001' as DepartmentId;
const STUDIO = '1a2b3c4d-0000-4000-8000-000000000002' as DepartmentId;
const ARCHIVE = '1a2b3c4d-0000-4000-8000-000000000003' as DepartmentId;
const USERS_READ = 'iam.users.read' as PermissionCode;
const ROLES_READ = 'iam.roles.read' as PermissionCode;
const ROLES_MANAGE = 'iam.roles.manage' as PermissionCode;
const SESSIONS_REVOKE = 'iam.sessions.revoke' as PermissionCode;

function facts(overrides: Partial<AuthorizationFacts> = {}): AuthorizationFacts {
  return { accessState: 'ACTIVE', memberships: [], grants: [], ...overrides };
}

function reader(result: AuthorizationFacts | undefined): AuthorizationReader & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    readAuthorizationFacts: async (userId) => {
      calls.push(userId);
      return result;
    },
  };
}

describe('projectAuthorizationContext', () => {
  it('keeps only ACTIVE permissions held through ACTIVE roles, de-duplicated and sorted', () => {
    const context = projectAuthorizationContext(
      USER_ID,
      facts({
        grants: [
          { roleState: 'ACTIVE', permissionCode: USERS_READ, permissionState: 'ACTIVE' },
          { roleState: 'ACTIVE', permissionCode: ROLES_READ, permissionState: 'ACTIVE' },
          // The same code through a second ACTIVE role appears once.
          { roleState: 'ACTIVE', permissionCode: USERS_READ, permissionState: 'ACTIVE' },
          // Retired and deprecated permissions are never effective (D-06).
          { roleState: 'ACTIVE', permissionCode: ROLES_MANAGE, permissionState: 'RETIRED' },
          { roleState: 'ACTIVE', permissionCode: SESSIONS_REVOKE, permissionState: 'DEPRECATED' },
          // A permission held only through an INACTIVE role is not effective.
          {
            roleState: 'INACTIVE',
            permissionCode: 'iam.users.create' as PermissionCode,
            permissionState: 'ACTIVE',
          },
        ],
      }),
    );
    expect(context?.permissionCodes).toEqual([ROLES_READ, USERS_READ]);
  });

  it('keeps a permission held through an INACTIVE role when an ACTIVE role also grants it', () => {
    const context = projectAuthorizationContext(
      USER_ID,
      facts({
        grants: [
          { roleState: 'INACTIVE', permissionCode: USERS_READ, permissionState: 'ACTIVE' },
          { roleState: 'ACTIVE', permissionCode: USERS_READ, permissionState: 'ACTIVE' },
        ],
      }),
    );
    expect(context?.permissionCodes).toEqual([USERS_READ]);
  });

  it('keeps only ACTIVE departments and the primary only while its department is ACTIVE', () => {
    const withPrimary = projectAuthorizationContext(
      USER_ID,
      facts({
        memberships: [
          { departmentId: STUDIO, isPrimary: false, departmentState: 'ACTIVE' },
          { departmentId: SALES, isPrimary: true, departmentState: 'ACTIVE' },
          { departmentId: ARCHIVE, isPrimary: false, departmentState: 'INACTIVE' },
        ],
      }),
    );
    expect(withPrimary?.departmentIds).toEqual([SALES, STUDIO]);
    expect(withPrimary?.primaryDepartmentId).toBe(SALES);

    const inactivePrimary = projectAuthorizationContext(
      USER_ID,
      facts({
        memberships: [
          { departmentId: ARCHIVE, isPrimary: true, departmentState: 'INACTIVE' },
          { departmentId: STUDIO, isPrimary: false, departmentState: 'ACTIVE' },
        ],
      }),
    );
    expect(inactivePrimary?.departmentIds).toEqual([STUDIO]);
    // The primary is absent, never replaced by another department.
    expect(inactivePrimary).not.toHaveProperty('primaryDepartmentId');
  });

  it('exposes exactly the contract fields, frozen, with no role identity', () => {
    const context = projectAuthorizationContext(
      USER_ID,
      facts({
        memberships: [{ departmentId: SALES, isPrimary: true, departmentState: 'ACTIVE' }],
        grants: [{ roleState: 'ACTIVE', permissionCode: USERS_READ, permissionState: 'ACTIVE' }],
      }),
    );
    expect(context).toEqual({
      userId: USER_ID,
      accessState: 'ACTIVE',
      primaryDepartmentId: SALES,
      departmentIds: [SALES],
      permissionCodes: [USERS_READ],
    });
    expect(Object.isFrozen(context)).toBe(true);
    expect(Object.isFrozen(context?.permissionCodes)).toBe(true);
    expect(Object.isFrozen(context?.departmentIds)).toBe(true);
  });

  it.each(['INVITED', 'SUSPENDED', 'DISABLED', 'TERMINATED'] as const)(
    'gives a %s user no context, whatever the user holds',
    (accessState) => {
      const context = projectAuthorizationContext(
        USER_ID,
        facts({
          accessState,
          memberships: [{ departmentId: SALES, isPrimary: true, departmentState: 'ACTIVE' }],
          grants: [{ roleState: 'ACTIVE', permissionCode: USERS_READ, permissionState: 'ACTIVE' }],
        }),
      );
      expect(context).toBeUndefined();
    },
  );
});

describe('hasPermission', () => {
  it('answers from the effective codes only; there are no wildcards', () => {
    const context = projectAuthorizationContext(
      USER_ID,
      facts({
        grants: [{ roleState: 'ACTIVE', permissionCode: USERS_READ, permissionState: 'ACTIVE' }],
      }),
    );
    if (!context) throw new Error('context fixture');
    expect(hasPermission(context, USERS_READ)).toBe(true);
    expect(hasPermission(context, ROLES_READ)).toBe(false);
    expect(hasPermission(context, 'iam.*' as PermissionCode)).toBe(false);
    expect(hasPermission(context, 'iam.users' as PermissionCode)).toBe(false);
  });
});

describe('resolveAuthorizationContext', () => {
  it('reads committed facts on every call; nothing is cached between calls', async () => {
    const source = reader(
      facts({
        grants: [{ roleState: 'ACTIVE', permissionCode: USERS_READ, permissionState: 'ACTIVE' }],
      }),
    );
    const first = await resolveAuthorizationContext({ reader: source }, USER_ID);
    const second = await resolveAuthorizationContext({ reader: source }, USER_ID);
    expect(first).toEqual(second);
    expect(first).toMatchObject({ outcome: 'active', context: { permissionCodes: [USERS_READ] } });
    expect(source.calls).toEqual([USER_ID, USER_ID]);
  });

  it('reports an unknown user and an identifier that is not a user ID as not found', async () => {
    const source = reader(undefined);
    await expect(resolveAuthorizationContext({ reader: source }, USER_ID)).resolves.toEqual({
      outcome: 'not-found',
    });
    await expect(resolveAuthorizationContext({ reader: source }, 'not-a-uuid')).resolves.toEqual({
      outcome: 'not-found',
    });
    // A malformed identifier never reaches the reader.
    expect(source.calls).toEqual([USER_ID]);
  });

  it('reports a user who is not ACTIVE as inactive', async () => {
    await expect(
      resolveAuthorizationContext({ reader: reader(facts({ accessState: 'SUSPENDED' })) }, USER_ID),
    ).resolves.toEqual({ outcome: 'inactive' });
  });
});

describe('recordAuthorizationDenial', () => {
  it('appends one REFUSED record naming the user, the permission and the trace', async () => {
    const iam = new InMemoryIam();
    const traceId = parseTraceId('trace-denied-1');
    if (!traceId.ok) throw new Error('trace fixture');
    await recordAuthorizationDenial(
      { runner: iam },
      { userId: USER_ID, permissionCode: ROLES_MANAGE, traceId: traceId.value },
    );
    expect(iam.audit).toHaveLength(1);
    expect(iam.audit[0]).toMatchObject({
      sourceModule: 'iam',
      action: 'iam.authorization.denied',
      actor: { type: 'USER', userId: USER_ID },
      target: { type: 'iam.permission', id: ROLES_MANAGE },
      result: 'REFUSED',
      traceId: 'trace-denied-1',
    });
    expect(iam.audit[0]).not.toHaveProperty('change');
  });

  it('lets a failed append surface to the caller', async () => {
    const iam = new InMemoryIam();
    iam.failAuditOnAction = 'iam.authorization.denied';
    const traceId = parseTraceId('trace-denied-2');
    if (!traceId.ok) throw new Error('trace fixture');
    await expect(
      recordAuthorizationDenial(
        { runner: iam },
        { userId: USER_ID, permissionCode: ROLES_MANAGE, traceId: traceId.value },
      ),
    ).rejects.toThrow('audit append failed');
  });
});
