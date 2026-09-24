import { describe, expect, it } from 'vitest';
import type { AuthorizationFacts } from './authorization-context.js';
import type { PermissionCode } from './codes.js';
import type { NormalizedEmail } from './email.js';
import type { UserId } from './identifiers.js';
import { userAccessStates, type UserAccessState } from './states.js';
import {
  classifyBootstrap,
  decideAccessRestriction,
  decideReactivation,
  exceedsGrantCeiling,
  type BootstrapCandidate,
  type GrantActor,
  type RestrictedAccessState,
} from './user-lifecycle.js';

const ADA = '00000000-0000-4000-8000-00000000000a' as UserId;
const BOB = '00000000-0000-4000-8000-00000000000b' as UserId;
const CY = '00000000-0000-4000-8000-00000000000c' as UserId;
const EMAIL = 'ada@example.test' as NormalizedEmail;
const code = (value: string) => value as PermissionCode;

describe('access transitions (spec Section 10.6)', () => {
  const allowed: Record<UserAccessState, RestrictedAccessState[]> = {
    INVITED: ['SUSPENDED', 'DISABLED', 'TERMINATED'],
    ACTIVE: ['SUSPENDED', 'DISABLED', 'TERMINATED'],
    SUSPENDED: ['DISABLED', 'TERMINATED'],
    DISABLED: ['TERMINATED'],
    TERMINATED: [],
  };
  const targets: RestrictedAccessState[] = ['SUSPENDED', 'DISABLED', 'TERMINATED'];

  for (const from of userAccessStates) {
    for (const to of targets) {
      const expected = allowed[from].includes(to) ? 'restrict' : 'invalid-access-transition';
      it(`${from} → ${to}: ${expected}`, () => {
        const decision = decideAccessRestriction({
          from,
          to,
          holdsSystemAdministratorRole: false,
          activeAdministrators: 0,
        });
        expect(decision.kind === 'restrict' ? 'restrict' : decision.reason).toBe(expected);
      });
    }
  }

  it('refuses to remove the last ACTIVE System Administrator, and only that one', () => {
    for (const to of targets) {
      expect(
        decideAccessRestriction({
          from: 'ACTIVE',
          to,
          holdsSystemAdministratorRole: true,
          activeAdministrators: 1,
        }),
      ).toEqual({ kind: 'refuse', reason: 'last-system-admin' });
      expect(
        decideAccessRestriction({
          from: 'ACTIVE',
          to,
          holdsSystemAdministratorRole: true,
          activeAdministrators: 2,
        }),
      ).toEqual({ kind: 'restrict' });
    }
    // Holders that are not ACTIVE do not count and are not blocked (spec Section 20).
    for (const from of ['INVITED', 'SUSPENDED'] as const) {
      expect(
        decideAccessRestriction({
          from,
          to: 'TERMINATED',
          holdsSystemAdministratorRole: true,
          activeAdministrators: 0,
        }),
      ).toEqual({ kind: 'restrict' });
    }
  });

  it('checks the transition before the administrator count', () => {
    expect(
      decideAccessRestriction({
        from: 'TERMINATED',
        to: 'TERMINATED',
        holdsSystemAdministratorRole: true,
        activeAdministrators: 1,
      }),
    ).toEqual({ kind: 'refuse', reason: 'invalid-access-transition' });
  });
});

describe('reactivation (spec Section 10.7)', () => {
  const at = new Date('2026-09-01T00:00:00.000Z');

  it('derives ACTIVE after a first activation and INVITED otherwise', () => {
    for (const accessState of ['SUSPENDED', 'DISABLED'] as const) {
      expect(decideReactivation({ accessState, firstActivatedAt: at, version: 4 }, 4)).toEqual({
        kind: 'reactivate',
        target: 'ACTIVE',
      });
      expect(
        decideReactivation({ accessState, firstActivatedAt: undefined, version: 4 }, 4),
      ).toEqual({ kind: 'reactivate', target: 'INVITED' });
    }
  });

  it('refuses every other state, TERMINATED included, before comparing versions', () => {
    for (const accessState of ['INVITED', 'ACTIVE', 'TERMINATED'] as const) {
      expect(decideReactivation({ accessState, firstActivatedAt: at, version: 4 }, 3)).toEqual({
        kind: 'refuse',
        reason: 'invalid-access-transition',
      });
    }
  });

  it('refuses a stale version', () => {
    expect(
      decideReactivation({ accessState: 'SUSPENDED', firstActivatedAt: at, version: 4 }, 3),
    ).toEqual({ kind: 'refuse', reason: 'version-conflict' });
  });
});

describe('grant ceiling (spec Section 23.1)', () => {
  function facts(
    accessState: UserAccessState,
    grants: [string, 'ACTIVE' | 'INACTIVE', 'ACTIVE' | 'DEPRECATED'][],
  ): AuthorizationFacts {
    return {
      accessState,
      memberships: [],
      grants: grants.map(([permissionCode, roleState, permissionState]) => ({
        permissionCode: code(permissionCode),
        roleState,
        permissionState,
      })),
    };
  }
  const user = (
    value: AuthorizationFacts | undefined,
    holdsSystemAdministratorRole = false,
  ): GrantActor => ({ kind: 'user', userId: ADA, facts: value, holdsSystemAdministratorRole });
  const permissions = (...codes: string[]) => ({
    kind: 'permissions' as const,
    codes: codes.map(code),
  });
  const systemRole = { kind: 'system-role' as const };

  it('never limits a system process', () => {
    expect(exceedsGrantCeiling({ kind: 'system' }, systemRole)).toBe(false);
    expect(exceedsGrantCeiling({ kind: 'system' }, permissions('iam.users.read'))).toBe(false);
  });

  it('never limits an ACTIVE System Administrator', () => {
    const admin = user(facts('ACTIVE', []), true);
    expect(exceedsGrantCeiling(admin, systemRole)).toBe(false);
    expect(exceedsGrantCeiling(admin, permissions('iam.roles.manage'))).toBe(false);
  });

  it('limits a System Administrator role holder who is not ACTIVE like anyone else', () => {
    for (const state of ['INVITED', 'SUSPENDED', 'DISABLED', 'TERMINATED'] as const) {
      const holder = user(facts(state, [['iam.roles.manage', 'ACTIVE', 'ACTIVE']]), true);
      expect(exceedsGrantCeiling(holder, systemRole)).toBe(true);
      expect(exceedsGrantCeiling(holder, permissions('iam.roles.manage'))).toBe(true);
    }
  });

  it('refuses the system role to every other user', () => {
    const manager = user(facts('ACTIVE', [['iam.users.manage-roles', 'ACTIVE', 'ACTIVE']]));
    expect(exceedsGrantCeiling(manager, systemRole)).toBe(true);
  });

  it('allows exactly the permissions the actor holds effectively', () => {
    const manager = user(
      facts('ACTIVE', [
        ['iam.users.read', 'ACTIVE', 'ACTIVE'],
        ['iam.roles.manage', 'ACTIVE', 'ACTIVE'],
        ['iam.sessions.revoke', 'INACTIVE', 'ACTIVE'],
        ['iam.users.create', 'ACTIVE', 'DEPRECATED'],
      ]),
    );
    expect(exceedsGrantCeiling(manager, permissions())).toBe(false);
    expect(exceedsGrantCeiling(manager, permissions('iam.users.read', 'iam.roles.manage'))).toBe(
      false,
    );
    // Held only through an INACTIVE role, or only as a DEPRECATED code: not effective.
    expect(exceedsGrantCeiling(manager, permissions('iam.sessions.revoke'))).toBe(true);
    expect(exceedsGrantCeiling(manager, permissions('iam.users.create'))).toBe(true);
    expect(exceedsGrantCeiling(manager, permissions('iam.users.read', 'iam.users.update'))).toBe(
      true,
    );
  });

  it('gives an actor who is not ACTIVE, or does not exist, nothing to grant', () => {
    const suspended = user(facts('SUSPENDED', [['iam.users.read', 'ACTIVE', 'ACTIVE']]));
    expect(exceedsGrantCeiling(suspended, permissions('iam.users.read'))).toBe(true);
    expect(exceedsGrantCeiling(user(undefined), permissions('iam.users.read'))).toBe(true);
    expect(exceedsGrantCeiling(user(undefined), permissions())).toBe(false);
  });
});

describe('bootstrap classification (spec Sections 21.2, 21.3)', () => {
  const candidate = (
    id: UserId,
    accessState: BootstrapCandidate['accessState'],
    email = EMAIL,
  ): BootstrapCandidate => ({ id, email, accessState });
  const other = 'bob@example.test' as NormalizedEmail;

  function normal(candidates: BootstrapCandidate[], emailInUse = false) {
    return classifyBootstrap({ mode: 'normal', email: EMAIL, candidates, emailInUse });
  }
  function recovery(candidates: BootstrapCandidate[], emailInUse = false) {
    return classifyBootstrap({ mode: 'recovery', email: EMAIL, candidates, emailInUse });
  }

  it('creates a candidate when there is none', () => {
    expect(normal([])).toEqual({ kind: 'create' });
  });

  it('refuses to create a candidate whose email another user holds', () => {
    expect(normal([], true)).toEqual({ kind: 'refuse', reason: 'email-taken' });
  });

  it('resumes exactly one INVITED candidate with the same email', () => {
    expect(normal([candidate(ADA, 'INVITED')], true)).toEqual({ kind: 'resume', candidate: ADA });
  });

  it('refuses while an ACTIVE System Administrator exists, in both modes', () => {
    const set = [candidate(ADA, 'ACTIVE'), candidate(BOB, 'INVITED', other)];
    expect(normal(set)).toEqual({ kind: 'refuse', reason: 'active-administrator-exists' });
    expect(recovery(set)).toEqual({ kind: 'refuse', reason: 'active-administrator-exists' });
  });

  it('requires recovery for any other candidate set', () => {
    const required = { kind: 'refuse', reason: 'recovery-required' };
    expect(normal([candidate(ADA, 'INVITED', other)], true)).toEqual(required);
    expect(normal([candidate(ADA, 'INVITED'), candidate(BOB, 'INVITED', other)], true)).toEqual(
      required,
    );
    expect(normal([candidate(ADA, 'SUSPENDED')], true)).toEqual(required);
    expect(normal([candidate(ADA, 'DISABLED')], true)).toEqual(required);
  });

  it('recovers by terminating INVITED candidates and stripping the others', () => {
    expect(
      recovery([
        candidate(ADA, 'INVITED', other),
        candidate(BOB, 'SUSPENDED', other),
        candidate(CY, 'DISABLED', other),
      ]),
    ).toEqual({ kind: 'recover', terminate: [ADA], strip: [BOB, CY] });
    expect(recovery([])).toEqual({ kind: 'recover', terminate: [], strip: [] });
  });

  it('refuses recovery when the new email belongs to any user', () => {
    expect(recovery([candidate(ADA, 'INVITED')], true)).toEqual({
      kind: 'refuse',
      reason: 'email-taken',
    });
  });
});
