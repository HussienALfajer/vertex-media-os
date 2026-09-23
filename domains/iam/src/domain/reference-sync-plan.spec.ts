import { describe, expect, it } from 'vitest';
import {
  parseModuleCode,
  parsePermissionCode,
  parseRoleCode,
  type PermissionCode,
} from './codes.js';
import type { RoleId } from './identifiers.js';
import {
  iamPermissionManifest,
  systemAdministratorRole,
  type PermissionDefinition,
  type PermissionManifest,
} from './permission-catalog.js';
import {
  planReferenceSync,
  validatePermissionManifests,
  type DeclaredPermission,
  type PersistedSystemRole,
  type ReferenceSnapshot,
  type ReferenceSyncPlan,
} from './reference-sync-plan.js';
import { parseDescription, parseEntityName, type Description, type EntityName } from './text.js';

const ROLE_ID = '6f1e0c64-2f4b-4f6e-9b76-2b8a2d1f6a10' as RoleId;

const SPEC_SECTION_19_CODES = [
  'iam.users.read',
  'iam.users.create',
  'iam.users.update',
  'iam.users.manage-access',
  'iam.users.manage-roles',
  'iam.users.manage-departments',
  'iam.roles.read',
  'iam.roles.manage',
  'iam.permissions.read',
  'iam.departments.read',
  'iam.departments.manage',
  'iam.sessions.revoke',
];

function definition(
  code: string,
  overrides: Partial<PermissionDefinition> = {},
): PermissionDefinition {
  return {
    code,
    name: `Name of ${code}`,
    description: `Description of ${code}.`,
    state: 'ACTIVE',
    sensitivity: 'STANDARD',
    ...overrides,
  };
}

function declare(...manifests: PermissionManifest[]): readonly DeclaredPermission[] {
  const validated = validatePermissionManifests(manifests);
  if (!validated.ok) throw new Error(`invalid test manifest: ${validated.details.join(' ')}`);
  return validated.permissions;
}

function systemRole(overrides: Partial<PersistedSystemRole> = {}): PersistedSystemRole {
  return {
    id: ROLE_ID,
    code: systemAdministratorRole.code,
    name: systemAdministratorRole.name,
    description: systemAdministratorRole.description,
    state: 'ACTIVE',
    isSystem: true,
    version: 3,
    permissionCodes: [],
    ...overrides,
  };
}

/** The snapshot a completed run leaves behind for the given declarations. */
function converged(declared: readonly DeclaredPermission[], version = 3): ReferenceSnapshot {
  return {
    permissions: declared,
    systemRoles: [
      systemRole({
        version,
        permissionCodes: declared.filter((p) => p.state === 'ACTIVE').map((p) => p.code),
      }),
    ],
  };
}

function plan(
  declared: readonly DeclaredPermission[],
  snapshot: ReferenceSnapshot,
): ReferenceSyncPlan {
  const result = planReferenceSync(declared, systemAdministratorRole, snapshot);
  if (result.outcome !== 'planned') throw new Error(`refused: ${result.reason}`);
  return result.plan;
}

const EMPTY_CHANGES = {
  register: [],
  update: [],
  grant: [],
  revoke: [],
  versionBump: undefined,
};

const manifest = (...permissions: PermissionDefinition[]): PermissionManifest => ({
  module: 'iam',
  permissions,
});

describe('shipped IAM reference data', () => {
  it('declares exactly the twelve spec Section 19 permissions, all ACTIVE and valid', () => {
    const validated = validatePermissionManifests([iamPermissionManifest]);
    expect(validated.ok).toBe(true);
    expect(iamPermissionManifest.module).toBe('iam');
    expect(iamPermissionManifest.permissions.map((permission) => permission.code)).toEqual(
      SPEC_SECTION_19_CODES,
    );
    expect(iamPermissionManifest.permissions.every((p) => p.state === 'ACTIVE')).toBe(true);
  });

  it('carries the IAM-02 Section 21.1 names, descriptions and sensitivities', () => {
    expect(
      iamPermissionManifest.permissions.map((p) => [p.code, p.name, p.description, p.sensitivity]),
    ).toEqual([
      [
        'iam.users.read',
        'Read users',
        'View the IAM user directory and user details.',
        'SENSITIVE',
      ],
      [
        'iam.users.create',
        'Create users',
        'Create and provision invited users and resend their invitations.',
        'PRIVILEGED',
      ],
      [
        'iam.users.update',
        'Update users',
        "Update a user's display name, the only mutable profile field in V1.",
        'SENSITIVE',
      ],
      [
        'iam.users.manage-access',
        'Manage user access',
        'Suspend, disable, reactivate or terminate user access, and retry identity synchronization.',
        'PRIVILEGED',
      ],
      ['iam.users.manage-roles', 'Manage user roles', 'Grant and remove user roles.', 'PRIVILEGED'],
      [
        'iam.users.manage-departments',
        'Manage user departments',
        'Manage user department memberships.',
        'SENSITIVE',
      ],
      ['iam.roles.read', 'Read roles', 'View roles and their permission mappings.', 'SENSITIVE'],
      [
        'iam.roles.manage',
        'Manage roles',
        'Create, update and deactivate custom roles and edit their permission mappings.',
        'PRIVILEGED',
      ],
      ['iam.permissions.read', 'Read permissions', 'View the permission catalog.', 'STANDARD'],
      ['iam.departments.read', 'Read departments', 'View departments.', 'STANDARD'],
      [
        'iam.departments.manage',
        'Manage departments',
        'Create, update, activate and deactivate departments.',
        'SENSITIVE',
      ],
      [
        'iam.sessions.revoke',
        'Revoke sessions',
        'Revoke application sessions for another user.',
        'PRIVILEGED',
      ],
    ]);
    expect(Object.isFrozen(iamPermissionManifest)).toBe(true);
    expect(Object.isFrozen(iamPermissionManifest.permissions)).toBe(true);
    expect(iamPermissionManifest.permissions.every((p) => Object.isFrozen(p))).toBe(true);
  });

  it('defines the protected System Administrator role of spec Section 20', () => {
    expect(systemAdministratorRole).toEqual({
      code: 'system-administrator',
      name: 'System Administrator',
      description: 'Protected system role that holds every active permission.',
    });
    expect(parseRoleCode(systemAdministratorRole.code).ok).toBe(true);
    expect(parseEntityName(systemAdministratorRole.name)).toEqual({
      ok: true,
      value: systemAdministratorRole.name,
    });
    expect(parseDescription(systemAdministratorRole.description)).toEqual({
      ok: true,
      value: systemAdministratorRole.description,
    });
    expect(Object.isFrozen(systemAdministratorRole)).toBe(true);
  });
});

describe('manifest validation', () => {
  const details = (...manifests: PermissionManifest[]): readonly string[] => {
    const validated = validatePermissionManifests(manifests);
    return validated.ok ? [] : validated.details;
  };

  it('accepts several modules with distinct codes', () => {
    expect(
      validatePermissionManifests([
        manifest(definition('iam.users.read')),
        { module: 'crm', permissions: [definition('crm.clients.read')] },
      ]).ok,
    ).toBe(true);
  });

  it('rejects a duplicate module', () => {
    expect(details(manifest(definition('iam.a.read')), manifest(definition('iam.b.read')))).toEqual(
      ['duplicate-module:iam'],
    );
  });

  it('rejects a duplicate code within and across manifests', () => {
    expect(details(manifest(definition('iam.a.read'), definition('iam.a.read')))).toEqual([
      'duplicate-code:iam.a.read',
    ]);
  });

  it('rejects a code of another module and a malformed code without echoing it', () => {
    expect(details(manifest(definition('crm.clients.read')))).toEqual([
      'wrong-module:crm.clients.read',
    ]);
    expect(details(manifest(definition('iam.users'), definition('IAM.Users.Read')))).toEqual([
      'invalid-code:iam#0',
      'invalid-code:iam#1',
    ]);
  });

  it('rejects a malformed module by its position', () => {
    expect(details({ module: 'Not A Module', permissions: [] })).toEqual([
      'invalid-module:manifest-0',
    ]);
  });

  it('rejects invalid and non-canonical names and descriptions', () => {
    expect(
      details(
        manifest(
          definition('iam.a.read', { name: '' }),
          definition('iam.b.read', { name: ' Padded ' }),
          definition('iam.c.read', { description: 'x'.repeat(2001) }),
          definition('iam.d.read', { description: 'Trailing space. ' }),
          definition('iam.e.read', { name: 'Bad\u0007name' }),
        ),
      ),
    ).toEqual([
      'invalid-name:iam.a.read',
      'non-canonical-name:iam.b.read',
      'invalid-description:iam.c.read',
      'non-canonical-description:iam.d.read',
      'invalid-name:iam.e.read',
    ]);
  });

  it('rejects unknown states and sensitivities', () => {
    expect(
      details(
        manifest(
          definition('iam.a.read', { state: 'REMOVED' as never }),
          definition('iam.b.read', { sensitivity: 'SECRET' as never }),
        ),
      ),
    ).toEqual(['invalid-state:iam.a.read', 'invalid-sensitivity:iam.b.read']);
  });

  it('reports codes and positions only, never free text', () => {
    const sentinel = 'Sentinel Person <person@example.invalid>';
    const all = details(
      manifest(
        definition('iam.a.read', { name: `${sentinel}\u0000` }),
        definition(sentinel),
        definition('iam.b.read', { description: `${sentinel} ` }),
      ),
    );
    expect(all.length).toBeGreaterThan(0);
    expect(all.join(' ')).not.toMatch(/Sentinel|example/);
  });
});

describe('planReferenceSync', () => {
  const catalog = declare(iamPermissionManifest);

  it('plans the first run on an empty snapshot: register all, create the role, grant the ACTIVE set', () => {
    const planned = plan(catalog, { permissions: [], systemRoles: [] });
    expect(planned.register.map((p) => p.code)).toEqual([...SPEC_SECTION_19_CODES].sort());
    expect(planned.update).toEqual([]);
    expect(planned.systemRole).toEqual({ kind: 'create', definition: systemAdministratorRole });
    expect(planned.grant).toEqual([...SPEC_SECTION_19_CODES].sort());
    expect(planned.revoke).toEqual([]);
    // A new role starts at version 1 and its initial mappings belong to the creation (I-6).
    expect(planned.versionBump).toBeUndefined();
  });

  it('plans nothing at all for a converged snapshot', () => {
    expect(plan(catalog, converged(catalog))).toEqual({
      ...EMPTY_CHANGES,
      systemRole: { kind: 'unchanged', roleId: ROLE_ID },
    });
  });

  it('registers and grants a newly declared code and bumps the version once', () => {
    const before = declare(manifest(definition('iam.a.read')));
    const after = declare(manifest(definition('iam.a.read'), definition('iam.b.read')));
    const planned = plan(after, converged(before));
    expect(planned.register.map((p) => p.code)).toEqual(['iam.b.read']);
    expect(planned.grant).toEqual(['iam.b.read']);
    expect(planned.revoke).toEqual([]);
    expect(planned.versionBump).toEqual({ roleId: ROLE_ID, expectedVersion: 3 });
  });

  it('updates ACTIVE → DEPRECATED and revokes it from the system role', () => {
    const before = declare(manifest(definition('iam.a.read'), definition('iam.b.read')));
    const after = declare(
      manifest(definition('iam.a.read'), definition('iam.b.read', { state: 'DEPRECATED' })),
    );
    const planned = plan(after, converged(before));
    expect(planned.update).toEqual([
      { code: 'iam.b.read', before: { state: 'ACTIVE' }, after: { state: 'DEPRECATED' } },
    ]);
    expect(planned.revoke).toEqual(['iam.b.read']);
    expect(planned.grant).toEqual([]);
    expect(planned.versionBump).toEqual({ roleId: ROLE_ID, expectedVersion: 3 });
  });

  it('updates DEPRECATED → ACTIVE and grants it again', () => {
    const before = declare(manifest(definition('iam.a.read', { state: 'DEPRECATED' })));
    const after = declare(manifest(definition('iam.a.read')));
    const planned = plan(after, converged(before));
    expect(planned.update).toEqual([
      { code: 'iam.a.read', before: { state: 'DEPRECATED' }, after: { state: 'ACTIVE' } },
    ]);
    expect(planned.grant).toEqual(['iam.a.read']);
    expect(planned.versionBump).toEqual({ roleId: ROLE_ID, expectedVersion: 3 });
  });

  it('updates ACTIVE → RETIRED and DEPRECATED → RETIRED, revoking any mapping', () => {
    const before = declare(
      manifest(definition('iam.a.read'), definition('iam.b.read', { state: 'DEPRECATED' })),
    );
    const after = declare(
      manifest(
        definition('iam.a.read', { state: 'RETIRED' }),
        definition('iam.b.read', { state: 'RETIRED' }),
      ),
    );
    const planned = plan(after, converged(before));
    expect(planned.update.map((change) => [change.code, change.after])).toEqual([
      ['iam.a.read', { state: 'RETIRED' }],
      ['iam.b.read', { state: 'RETIRED' }],
    ]);
    expect(planned.revoke).toEqual(['iam.a.read']);
  });

  it('registers a code declared RETIRED to reserve it, without granting it', () => {
    const planned = plan(
      declare(manifest(definition('iam.a.read'), definition('iam.b.read', { state: 'RETIRED' }))),
      converged(declare(manifest(definition('iam.a.read')))),
    );
    expect(planned.register.map((p) => [p.code, p.state])).toEqual([['iam.b.read', 'RETIRED']]);
    expect(planned.grant).toEqual([]);
    expect(planned.versionBump).toBeUndefined();
  });

  it('updates metadata only, without mapping changes or a version bump', () => {
    const before = declare(manifest(definition('iam.a.read')));
    const after = declare(
      manifest(
        definition('iam.a.read', {
          name: 'Renamed',
          description: 'New description.',
          sensitivity: 'PRIVILEGED',
        }),
      ),
    );
    const planned = plan(after, converged(before));
    expect(planned.update).toEqual([
      {
        code: 'iam.a.read',
        before: {
          name: 'Name of iam.a.read',
          description: 'Description of iam.a.read.',
          sensitivity: 'STANDARD',
        },
        after: { name: 'Renamed', description: 'New description.', sensitivity: 'PRIVILEGED' },
      },
    ]);
    expect(planned.grant).toEqual([]);
    expect(planned.revoke).toEqual([]);
    expect(planned.systemRole.kind).toBe('unchanged');
    expect(planned.versionBump).toBeUndefined();
  });

  it('repairs drift in the role name and description and bumps the version', () => {
    const snapshot = converged(catalog);
    const drifted: ReferenceSnapshot = {
      ...snapshot,
      systemRoles: [
        systemRole({
          ...snapshot.systemRoles[0],
          name: 'Admins' as EntityName,
          description: undefined,
        }),
      ],
    };
    const planned = plan(catalog, drifted);
    expect(planned.systemRole).toEqual({
      kind: 'update',
      roleId: ROLE_ID,
      before: { name: 'Admins', description: null },
      after: {
        name: 'System Administrator',
        description: 'Protected system role that holds every active permission.',
      },
    });
    expect(planned.versionBump).toEqual({ roleId: ROLE_ID, expectedVersion: 3 });
    expect(
      plan(catalog, {
        ...snapshot,
        systemRoles: [
          systemRole({ ...snapshot.systemRoles[0], description: 'Other.' as Description }),
        ],
      }).systemRole,
    ).toMatchObject({
      kind: 'update',
      before: { description: 'Other.' },
    });
  });

  it('revokes an extra mapping to a DEPRECATED code and bumps the version', () => {
    const declared = declare(
      manifest(definition('iam.a.read'), definition('iam.b.read', { state: 'DEPRECATED' })),
    );
    const snapshot: ReferenceSnapshot = {
      permissions: declared,
      systemRoles: [
        systemRole({ permissionCodes: ['iam.a.read', 'iam.b.read'] as PermissionCode[] }),
      ],
    };
    const planned = plan(declared, snapshot);
    expect(planned.revoke).toEqual(['iam.b.read']);
    expect(planned.update).toEqual([]);
    expect(planned.versionBump).toEqual({ roleId: ROLE_ID, expectedVersion: 3 });
  });

  it('sorts every list it plans', () => {
    const declared = declare(
      manifest(definition('iam.c.read'), definition('iam.a.read'), definition('iam.b.read')),
    );
    const planned = plan(declared, { permissions: [], systemRoles: [] });
    expect(planned.register.map((p) => p.code)).toEqual(['iam.a.read', 'iam.b.read', 'iam.c.read']);
    expect(planned.grant).toEqual(['iam.a.read', 'iam.b.read', 'iam.c.read']);
  });

  describe('refusals plan no change', () => {
    const declared = declare(manifest(definition('iam.a.read')));

    function refusal(snapshot: ReferenceSnapshot, permissions = declared): unknown {
      return planReferenceSync(permissions, systemAdministratorRole, snapshot);
    }

    it('refuses a persisted code that no manifest declares', () => {
      const module = parseModuleCode('iam');
      if (!module.ok) throw new Error('module');
      const extra = parsePermissionCode('iam.z.read', module.value);
      if (!extra.ok) throw new Error('code');
      const snapshot = converged(declared);
      expect(
        refusal({
          ...snapshot,
          permissions: [
            ...snapshot.permissions,
            { ...declared[0], code: extra.value } as DeclaredPermission,
          ],
        }),
      ).toEqual({ outcome: 'refused', reason: 'undeclared-permissions', details: ['iam.z.read'] });
    });

    it.each(['ACTIVE', 'DEPRECATED'] as const)('refuses RETIRED → %s', (state) => {
      const retired = declare(manifest(definition('iam.a.read', { state: 'RETIRED' })));
      const reactivated = declare(manifest(definition('iam.a.read', { state })));
      expect(refusal(converged(retired), reactivated)).toEqual({
        outcome: 'refused',
        reason: 'retired-permission-reactivated',
        details: ['iam.a.read'],
      });
    });

    it('refuses a role that holds the reserved code without being a system role', () => {
      expect(
        refusal({ permissions: declared, systemRoles: [systemRole({ isSystem: false })] }),
      ).toEqual({
        outcome: 'refused',
        reason: 'system-role-conflict',
        details: ['system-administrator'],
      });
    });

    it('refuses a system role with another code, two system roles, or an inactive one', () => {
      const otherCode = parseRoleCode('admins');
      if (!otherCode.ok) throw new Error('role code');
      for (const systemRoles of [
        [systemRole({ code: otherCode.value })],
        [systemRole(), systemRole({ id: 'a0000000-0000-4000-8000-000000000001' as RoleId })],
        [systemRole({ state: 'INACTIVE' })],
      ]) {
        expect(refusal({ permissions: declared, systemRoles })).toMatchObject({
          outcome: 'refused',
          reason: 'system-role-conflict',
        });
      }
    });
  });
});
