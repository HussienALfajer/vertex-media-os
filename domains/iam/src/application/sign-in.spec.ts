import { describe, expect, it } from 'vitest';
import { parseTraceId } from '@vertex-os/audit';
import {
  ISSUER,
  InMemoryIam,
  OTHER_USER_ID,
  USER_ID,
  invitedUser,
} from '../../test-support/identity-provisioning-fakes.js';
import type { ApplicationUser } from '../domain/application-user.js';
import {
  resolveIdentityUser,
  resolveSessionUser,
  signIn,
  type SignInDependencies,
} from './sign-in.js';

const SUBJECT = '5b1f0c3e-2d4a-4e6b-9c8d-7a6b5c4d3e2f';
const ACTIVATED_AT = new Date('2026-09-20T08:00:00.000Z');

function traceId() {
  const parsed = parseTraceId('trace-sign-in-1');
  if (!parsed.ok) throw new Error('trace fixture');
  return parsed.value;
}

function bound(overrides: Partial<ApplicationUser> = {}): ApplicationUser {
  return invitedUser({
    identity: { issuer: ISSUER, subject: SUBJECT },
    identitySyncState: 'SYNCED',
    invitationDeliveryState: 'SENT',
    invitationSentAt: new Date('2026-09-23T10:05:00.000Z'),
    version: 4,
    ...overrides,
  });
}

function active(overrides: Partial<ApplicationUser> = {}): ApplicationUser {
  return bound({ accessState: 'ACTIVE', firstActivatedAt: ACTIVATED_AT, ...overrides });
}

function setup(...users: ApplicationUser[]) {
  const iam = new InMemoryIam(...users);
  const dependencies: SignInDependencies = { users: iam.repository, runner: iam };
  const request = { issuer: ISSUER, subject: SUBJECT, traceId: traceId() };
  return { iam, dependencies, request };
}

describe('signIn', () => {
  it('signs in an ACTIVE user without writing anything', async () => {
    const { iam, dependencies, request } = setup(active());
    await expect(signIn(dependencies, request)).resolves.toEqual({
      outcome: 'signed-in',
      userId: USER_ID,
      firstActivation: false,
    });
    expect(iam.transactions).toEqual([]);
    expect(iam.audit).toEqual([]);
    expect(iam.get()).toEqual(active());
  });

  it('activates an INVITED user once, with Audit evidence in the same transaction', async () => {
    const { iam, dependencies, request } = setup(bound());
    await expect(signIn(dependencies, request)).resolves.toEqual({
      outcome: 'signed-in',
      userId: USER_ID,
      firstActivation: true,
    });
    const user = iam.get();
    expect(user.accessState).toBe('ACTIVE');
    expect(user.firstActivatedAt).toBeInstanceOf(Date);
    expect(user.lastAccessStateChangedAt).toEqual(user.firstActivatedAt);
    expect(user.version).toBe(5);
    expect(iam.transactions).toEqual(['activate']);
    expect(iam.audit).toHaveLength(1);
    expect(iam.audit[0]).toMatchObject({
      sourceModule: 'iam',
      action: 'iam.user.first-activated',
      actor: { type: 'USER', userId: USER_ID },
      target: { type: 'iam.user', id: USER_ID },
      result: 'SUCCEEDED',
      traceId: 'trace-sign-in-1',
      change: { before: { accessState: 'INVITED' }, after: { accessState: 'ACTIVE' } },
    });

    // A second sign-in finds an ACTIVE user and leaves firstActivatedAt alone.
    const firstActivatedAt = user.firstActivatedAt;
    await expect(signIn(dependencies, request)).resolves.toMatchObject({ firstActivation: false });
    expect(iam.get().firstActivatedAt).toEqual(firstActivatedAt);
  });

  it('decides by accessState only: FAILED synchronization or delivery never blocks activation', async () => {
    const { iam, dependencies, request } = setup(
      bound({ identitySyncState: 'FAILED', invitationDeliveryState: 'FAILED' }),
    );
    await expect(signIn(dependencies, request)).resolves.toMatchObject({
      outcome: 'signed-in',
      firstActivation: true,
    });
    expect(iam.get()).toMatchObject({
      accessState: 'ACTIVE',
      identitySyncState: 'FAILED',
      invitationDeliveryState: 'FAILED',
    });
  });

  it.each(['SUSPENDED', 'DISABLED', 'TERMINATED'] as const)(
    'denies a %s user and records the Keycloak mismatch as identitySyncState FAILED',
    async (accessState) => {
      const { iam, dependencies, request } = setup(active({ accessState }));
      await expect(signIn(dependencies, request)).resolves.toEqual({ outcome: 'inactive' });
      expect(iam.get()).toMatchObject({ accessState, identitySyncState: 'FAILED', version: 5 });
      expect(iam.transactions).toEqual(['sync:FAILED']);
      expect(iam.audit).toHaveLength(1);
      expect(iam.audit[0]).toMatchObject({
        action: 'iam.user.sign-in-refused',
        actor: { type: 'USER', userId: USER_ID },
        target: { type: 'iam.user', id: USER_ID },
        result: 'REFUSED',
        change: {
          before: { accessState, identitySyncState: 'SYNCED' },
          after: { accessState, identitySyncState: 'FAILED' },
        },
      });
    },
  );

  it('records only the refusal when the mismatch is already FAILED', async () => {
    const { iam, dependencies, request } = setup(
      active({ accessState: 'SUSPENDED', identitySyncState: 'FAILED' }),
    );
    await expect(signIn(dependencies, request)).resolves.toEqual({ outcome: 'inactive' });
    expect(iam.get().version).toBe(4);
    expect(iam.transactions).toEqual(['']);
    expect(iam.audit.map((entry) => entry.action)).toEqual(['iam.user.sign-in-refused']);
  });

  it('denies an unmapped identity, creates nothing and records a system REFUSED entry', async () => {
    const { iam, dependencies, request } = setup(bound({ identity: undefined }));
    await expect(signIn(dependencies, request)).resolves.toEqual({ outcome: 'unmapped' });
    expect(iam.users.size).toBe(1);
    expect(iam.get().accessState).toBe('INVITED');
    expect(iam.audit).toHaveLength(1);
    expect(iam.audit[0]).toMatchObject({
      action: 'iam.identity.sign-in-refused',
      actor: { type: 'SYSTEM', process: 'iam.sign-in' },
      target: { type: 'iam.identity', id: SUBJECT },
      result: 'REFUSED',
    });
    expect(iam.audit[0]).not.toHaveProperty('change');
  });

  it('matches issuer and subject together, never either alone', async () => {
    const { dependencies, request } = setup(active());
    await expect(
      signIn(dependencies, { ...request, issuer: 'http://127.0.0.1:8080/realms/other' }),
    ).resolves.toEqual({ outcome: 'unmapped' });
    await expect(
      signIn(dependencies, { ...request, subject: '0f0f0f0f-0f0f-4f0f-8f0f-0f0f0f0f0f0f' }),
    ).resolves.toEqual({ outcome: 'unmapped' });
  });

  it('records a subject outside the Audit target grammar under a fixed identifier', async () => {
    const { iam, dependencies, request } = setup();
    await signIn(dependencies, { ...request, subject: 'Mixed Case/Subject' });
    expect(iam.audit[0]?.target).toEqual({ type: 'iam.identity', id: 'invalid' });
  });

  it('never overwrites a suspension committed while the first activation was being decided', async () => {
    const { iam, dependencies, request } = setup(bound());
    iam.beforeRun = () => {
      iam.beforeRun = undefined;
      iam.commit({ accessState: 'SUSPENDED' });
    };
    await expect(signIn(dependencies, request)).resolves.toEqual({ outcome: 'inactive' });
    expect(iam.get()).toMatchObject({
      accessState: 'SUSPENDED',
      firstActivatedAt: undefined,
      identitySyncState: 'FAILED',
    });
    expect(iam.audit.map((entry) => entry.action)).toEqual(['iam.user.sign-in-refused']);
  });

  it('keeps the firstActivatedAt of a parallel first sign-in that committed first', async () => {
    const { iam, dependencies, request } = setup(bound());
    iam.beforeRun = () => {
      iam.beforeRun = undefined;
      iam.commit({
        accessState: 'ACTIVE',
        firstActivatedAt: ACTIVATED_AT,
        lastAccessStateChangedAt: ACTIVATED_AT,
      });
    };
    await expect(signIn(dependencies, request)).resolves.toEqual({
      outcome: 'signed-in',
      userId: USER_ID,
      firstActivation: false,
    });
    expect(iam.get().firstActivatedAt).toEqual(ACTIVATED_AT);
    expect(iam.audit).toEqual([]);
  });

  it('activates exactly once when first sign-ins run concurrently', async () => {
    const { iam, dependencies, request } = setup(bound());
    const results = await Promise.all([
      signIn(dependencies, request),
      signIn(dependencies, request),
      signIn(dependencies, request),
    ]);
    expect(results.every((result) => result.outcome === 'signed-in')).toBe(true);
    expect(
      results.filter((result) => 'firstActivation' in result && result.firstActivation),
    ).toHaveLength(1);
    expect(iam.audit.map((entry) => entry.action)).toEqual(['iam.user.first-activated']);
  });

  it('denies as conflict when competing changes keep winning, and activates nothing', async () => {
    const { iam, dependencies, request } = setup(bound());
    iam.beforeRun = () => iam.commit({});
    await expect(signIn(dependencies, request)).resolves.toEqual({ outcome: 'conflict' });
    expect(iam.get().accessState).toBe('INVITED');
    expect(iam.audit).toEqual([]);
  });

  it('rolls the FAILED mismatch back when the refusal cannot be audited', async () => {
    const { iam, dependencies, request } = setup(active({ accessState: 'SUSPENDED' }));
    iam.failAuditOnAction = 'iam.user.sign-in-refused';
    await expect(signIn(dependencies, request)).rejects.toThrow('audit append failed');
    expect(iam.get()).toEqual(active({ accessState: 'SUSPENDED' }));
  });

  it('rolls the activation back when its Audit append fails', async () => {
    const { iam, dependencies, request } = setup(bound());
    iam.failAuditOnAction = 'iam.user.first-activated';
    await expect(signIn(dependencies, request)).rejects.toThrow('audit append failed');
    expect(iam.get()).toEqual(bound());
  });
});

describe('resolveSessionUser', () => {
  it('returns only the safe context of an ACTIVE user', async () => {
    const { dependencies } = setup(active());
    await expect(resolveSessionUser(dependencies, USER_ID)).resolves.toEqual({
      outcome: 'active',
      user: { id: USER_ID, email: 'ada@example.test', displayName: 'Ada' },
    });
  });

  it.each(['INVITED', 'SUSPENDED', 'DISABLED', 'TERMINATED'] as const)(
    'treats a %s user as inactive',
    async (accessState) => {
      const { dependencies } = setup(active({ accessState }));
      await expect(resolveSessionUser(dependencies, USER_ID)).resolves.toEqual({
        outcome: 'inactive',
      });
    },
  );

  it('reports unknown and malformed identifiers as not found', async () => {
    const { dependencies } = setup(active());
    await expect(resolveSessionUser(dependencies, OTHER_USER_ID)).resolves.toEqual({
      outcome: 'not-found',
    });
    await expect(resolveSessionUser(dependencies, 'not-a-uuid')).resolves.toEqual({
      outcome: 'not-found',
    });
  });
});

describe('resolveIdentityUser', () => {
  it('finds the user bound to issuer and subject, and nobody for anything else', async () => {
    const { dependencies } = setup(active());
    await expect(
      resolveIdentityUser(dependencies, { issuer: ISSUER, subject: SUBJECT }),
    ).resolves.toBe(USER_ID);
    await expect(
      resolveIdentityUser(dependencies, { issuer: `${ISSUER}x`, subject: SUBJECT }),
    ).resolves.toBeUndefined();
  });
});
