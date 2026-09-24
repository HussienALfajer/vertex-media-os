import { describe, expect, it } from 'vitest';
import {
  parseAdministrativeReason,
  parseTraceId,
  userActor,
  type AuditAttribution,
} from '@vertex-os/audit';
import {
  EMAIL,
  FakeIdentityProvider,
  ISSUER,
  InMemoryIam,
  USER_ID,
  invitedUser,
} from '../../test-support/identity-provisioning-fakes.js';
import type { ApplicationUser } from '../domain/application-user.js';
import type { UserId } from '../domain/identifiers.js';
import {
  disableUser,
  reactivateUser,
  resendUserInvitation,
  revokeUserSessions,
  suspendUser,
  syncIdentity,
  terminateUser,
  updateDisplayName,
  type UserAdministrationDependencies,
} from './administer-users.js';
import type { SessionRevocation, SessionRevocationReason } from './ports/session-revocation.js';

const ADMIN = '00000000-0000-4000-8000-00000000ad01';

function attribution(): AuditAttribution {
  const actor = userActor(ADMIN);
  const traceId = parseTraceId('trace-lifecycle-1');
  const reason = parseAdministrativeReason('Synthetic reason for the test.');
  if (!actor.ok || !traceId.ok || !reason.ok) throw new Error('attribution fixture');
  return { actor: actor.value, traceId: traceId.value, reason: reason.value };
}

/** Records every revocation with what was committed and what Keycloak had seen at that moment. */
class RecordingSessions implements SessionRevocation {
  readonly calls: {
    userId: UserId;
    reason: SessionRevocationReason;
    accessState: string | undefined;
    providerCalls: number;
  }[] = [];
  live = 2;

  constructor(
    private readonly iam: InMemoryIam,
    private readonly provider: FakeIdentityProvider,
  ) {}

  async revokeUserSessions(userId: UserId, reason: SessionRevocationReason): Promise<number> {
    this.calls.push({
      userId,
      reason,
      accessState: this.iam.users.get(userId)?.accessState,
      providerCalls: this.provider.mutatingCalls().length,
    });
    const revoked = this.live;
    this.live = 0;
    return revoked;
  }
}

const activatedAt = new Date('2026-09-20T10:00:00.000Z');

function setup(user: ApplicationUser) {
  const iam = new InMemoryIam(user);
  const provider = new FakeIdentityProvider();
  const sessions = new RecordingSessions(iam, provider);
  const dependencies: UserAdministrationDependencies = {
    users: iam.repository,
    runner: iam,
    identityProvider: provider,
    invitationLifespanSeconds: 43_200,
    sessions,
  };
  return { iam, provider, sessions, dependencies };
}

/** An ACTIVE user with an enabled, owned, bound identity and one Keycloak session. */
function active(overrides: Partial<ApplicationUser> = {}) {
  const context = setup(invitedUser());
  const identity = context.provider.add({
    username: EMAIL,
    vertexUserIds: [USER_ID],
    emailVerified: true,
    password: true,
    otp: true,
    requiredActions: [],
    sessions: 1,
  });
  context.iam.users.set(
    USER_ID,
    invitedUser({
      accessState: 'ACTIVE',
      identity: { issuer: ISSUER, subject: identity.subject },
      identitySyncState: 'SYNCED',
      invitationDeliveryState: 'SENT',
      invitationSentAt: activatedAt,
      firstActivatedAt: activatedAt,
      version: 5,
      ...overrides,
    }),
  );
  return { ...context, identity };
}

const trail = (iam: InMemoryIam) => iam.audit.map((entry) => `${entry.action}:${entry.result}`);
const userId = USER_ID as string;

describe('removing access (spec Section 31.1)', () => {
  for (const [operation, to, reason] of [
    [suspendUser, 'SUSPENDED', 'suspended'],
    [disableUser, 'DISABLED', 'disabled'],
    [terminateUser, 'TERMINATED', 'terminated'],
  ] as const) {
    it(`${to}: commits the denial, then revokes sessions, then disables the identity`, async () => {
      const { iam, provider, sessions, dependencies } = active();

      const result = await operation(dependencies, { userId }, attribution());

      expect(result).toMatchObject({
        outcome: 'restricted',
        sessionsRevoked: 2,
        identity: { outcome: 'synced' },
        user: { accessState: to, identitySyncState: 'SYNCED' },
      });
      // The denial was committed before any revocation, and revocation ran before Keycloak.
      expect(sessions.calls).toEqual([{ userId, reason, accessState: to, providerCalls: 0 }]);
      expect(provider.mutatingCalls()).toEqual(['setEnabled:false', 'terminateSessions']);
      expect(iam.transactions[0]).toBe(`lock-user+restrict:${to}`);
      expect(trail(iam)).toEqual([
        `iam.user.${to.toLowerCase()}:SUCCEEDED`,
        'iam.user.identity-reconciled:SUCCEEDED',
      ]);
      const [record] = iam.audit;
      expect(record?.reason).toBe('Synthetic reason for the test.');
      expect(record?.change).toEqual({
        before: { accessState: 'ACTIVE', identitySyncState: 'SYNCED' },
        after: { accessState: to, identitySyncState: 'PENDING' },
      });
    });
  }

  it('keeps the user denied and records FAILED when Keycloak is unavailable', async () => {
    const { iam, provider, sessions, dependencies } = active();
    provider.failNext('findBySubject');

    const result = await suspendUser(dependencies, { userId }, attribution());

    expect(result).toMatchObject({
      outcome: 'restricted',
      sessionsRevoked: 2,
      identity: { outcome: 'failed', failure: 'provider-unavailable' },
      user: { accessState: 'SUSPENDED', identitySyncState: 'FAILED' },
    });
    expect(sessions.calls).toHaveLength(1);
    expect(iam.get().accessState).toBe('SUSPENDED');
  });

  it('refuses transitions outside the table without writing or revoking anything', async () => {
    for (const [state, operation] of [
      ['TERMINATED', suspendUser],
      ['TERMINATED', terminateUser],
      ['DISABLED', suspendUser],
      ['SUSPENDED', suspendUser],
    ] as const) {
      const { iam, provider, sessions, dependencies } = active({ accessState: state });
      const before = iam.get();

      const result = await operation(dependencies, { userId }, attribution());

      expect(result).toEqual({ outcome: 'invalid-access-transition' });
      expect(iam.get()).toEqual(before);
      expect(iam.audit).toEqual([]);
      expect(sessions.calls).toEqual([]);
      expect(provider.calls).toEqual([]);
    }
  });

  it('answers an unknown or malformed user without side effects', async () => {
    const { sessions, dependencies } = active();
    expect(
      await suspendUser(
        dependencies,
        { userId: '00000000-0000-4000-8000-000000000999' },
        attribution(),
      ),
    ).toEqual({ outcome: 'user-not-found' });
    expect(await suspendUser(dependencies, { userId: 'not-a-uuid' }, attribution())).toEqual({
      outcome: 'invalid',
      field: 'userId',
    });
    expect(sessions.calls).toEqual([]);
  });
});

describe('reactivation (spec Sections 10.7, 31.2)', () => {
  function suspended(overrides: Partial<ApplicationUser> = {}) {
    const context = active({ accessState: 'SUSPENDED', ...overrides });
    context.identity.enabled = false;
    context.identity.sessions = 0;
    return context;
  }

  it('enables the identity before committing ACTIVE and SYNCED', async () => {
    const { iam, provider, dependencies } = suspended();

    const result = await reactivateUser(
      dependencies,
      { userId, expectedVersion: 5 },
      attribution(),
    );

    expect(result).toMatchObject({
      outcome: 'reactivated',
      target: 'ACTIVE',
      user: { accessState: 'ACTIVE', identitySyncState: 'SYNCED', firstActivatedAt: activatedAt },
      invitation: { outcome: 'not-applicable' },
    });
    expect(provider.mutatingCalls()).toEqual(['setEnabled:true']);
    // PENDING first, the target state only in the final commit.
    expect(iam.transactions).toEqual(['sync:PENDING', 'reactivate:ACTIVE']);
    expect(trail(iam)).toEqual([
      'iam.user.reactivation-started:SUCCEEDED',
      'iam.user.reactivated:SUCCEEDED',
    ]);
    expect(iam.audit[1]?.change).toEqual({
      before: { accessState: 'SUSPENDED', identitySyncState: 'PENDING' },
      after: { accessState: 'ACTIVE', identitySyncState: 'SYNCED', steps: ['enabled'] },
    });
  });

  it('never grants access when Keycloak cannot enable the identity', async () => {
    for (const failure of ['unavailable', 'rejected'] as const) {
      const { iam, provider, dependencies } = suspended({ accessState: 'DISABLED' });
      provider.failNext('setEnabled', failure);

      const result = await reactivateUser(
        dependencies,
        { userId, expectedVersion: 5 },
        attribution(),
      );

      expect(result).toEqual({ outcome: 'identity-failed', failure: `provider-${failure}` });
      expect(iam.get()).toMatchObject({ accessState: 'DISABLED', identitySyncState: 'FAILED' });
    }
  });

  it('disables the identity again when a competing change wins the final commit', async () => {
    const { iam, provider, dependencies, identity } = suspended();
    // A disablement commits while Keycloak is enabling the identity.
    provider.onNext('setEnabled', () => iam.commit({ accessState: 'DISABLED' }));

    const result = await reactivateUser(
      dependencies,
      { userId, expectedVersion: 5 },
      attribution(),
    );

    expect(result).toEqual({ outcome: 'superseded' });
    expect(iam.get()).toMatchObject({ accessState: 'DISABLED', identitySyncState: 'SYNCED' });
    expect(identity.enabled).toBe(false);
    expect(provider.mutatingCalls()).toEqual([
      'setEnabled:true',
      'setEnabled:false',
      'terminateSessions',
    ]);
  });

  it('leaves FAILED when the compensation cannot complete', async () => {
    const { iam, provider, dependencies, identity } = suspended();
    provider.onNext('setEnabled', () => {
      iam.commit({ accessState: 'DISABLED' });
      // Keycloak becomes unreachable before the compensation reads the identity.
      provider.failNext('findBySubject');
    });

    const result = await reactivateUser(
      dependencies,
      { userId, expectedVersion: 5 },
      attribution(),
    );

    expect(result).toEqual({ outcome: 'superseded' });
    // IAM denies access; the mismatch with the enabled identity is visible for sync-identity.
    expect(iam.get()).toMatchObject({ accessState: 'DISABLED', identitySyncState: 'FAILED' });
    expect(identity.enabled).toBe(true);
  });

  it('returns a never-activated user to INVITED, provisioning and inviting it', async () => {
    const { iam, provider, dependencies } = setup(
      invitedUser({ accessState: 'SUSPENDED', identitySyncState: 'SYNCED', version: 2 }),
    );

    const result = await reactivateUser(
      dependencies,
      { userId, expectedVersion: 2 },
      attribution(),
    );

    expect(result).toMatchObject({
      outcome: 'reactivated',
      target: 'INVITED',
      user: {
        accessState: 'INVITED',
        identitySyncState: 'SYNCED',
        invitationDeliveryState: 'SENT',
      },
      invitation: { outcome: 'sent' },
    });
    expect(iam.get().firstActivatedAt).toBeUndefined();
    expect(provider.mutatingCalls()[0]).toMatch(/^create/);
  });

  it('does not re-send an invitation that was already attempted', async () => {
    const { provider, dependencies } = setup(
      invitedUser({
        accessState: 'DISABLED',
        invitationDeliveryState: 'FAILED',
        version: 2,
      }),
    );

    const result = await reactivateUser(
      dependencies,
      { userId, expectedVersion: 2 },
      attribution(),
    );

    expect(result).toMatchObject({ target: 'INVITED', invitation: { outcome: 'not-applicable' } });
    expect(provider.sent).toEqual([]);
  });

  it('refuses a stale version and any state but SUSPENDED or DISABLED, writing nothing', async () => {
    const stale = suspended();
    expect(
      await reactivateUser(stale.dependencies, { userId, expectedVersion: 4 }, attribution()),
    ).toEqual({ outcome: 'version-conflict' });
    expect(stale.iam.audit).toEqual([]);
    for (const state of ['INVITED', 'ACTIVE', 'TERMINATED'] as const) {
      const context = active({ accessState: state });
      expect(
        await reactivateUser(context.dependencies, { userId, expectedVersion: 5 }, attribution()),
      ).toEqual({ outcome: 'invalid-access-transition' });
      expect(context.provider.calls).toEqual([]);
    }
  });

  it('refuses when a competing change lands between the read and the PENDING write', async () => {
    const { iam, provider, dependencies } = suspended();
    iam.beforeRun = () => {
      iam.beforeRun = undefined;
      iam.commit({ accessState: 'DISABLED' });
    };

    const result = await reactivateUser(
      dependencies,
      { userId, expectedVersion: 5 },
      attribution(),
    );

    expect(result).toEqual({ outcome: 'version-conflict' });
    expect(provider.calls).toEqual([]);
  });
});

describe('display name, sync-identity and resend', () => {
  it('updates only the display name, version-checked', async () => {
    const { iam, provider, dependencies } = active();

    expect(
      await updateDisplayName(
        dependencies,
        { userId, expectedVersion: 4, displayName: 'Ada L.' },
        attribution(),
      ),
    ).toEqual({ outcome: 'version-conflict' });
    const updated = await updateDisplayName(
      dependencies,
      { userId, expectedVersion: 5, displayName: '  Ada L.  ' },
      attribution(),
    );
    expect(updated).toMatchObject({
      outcome: 'updated',
      user: { displayName: 'Ada L.', version: 6 },
    });
    expect(
      await updateDisplayName(
        dependencies,
        { userId, expectedVersion: 6, displayName: 'Ada L.' },
        attribution(),
      ),
    ).toMatchObject({ outcome: 'unchanged' });
    expect(trail(iam)).toEqual(['iam.user.updated:SUCCEEDED']);
    expect(iam.audit[0]?.change).toEqual({
      before: { displayName: 'Ada' },
      after: { displayName: 'Ada L.' },
    });
    expect(provider.calls).toEqual([]);
  });

  it('reports sync-identity failures as the requested effect failing (spec Section 27)', async () => {
    const { provider, dependencies } = active();
    provider.failNext('findBySubject');
    expect(await syncIdentity(dependencies, { userId }, attribution())).toEqual({
      outcome: 'identity-failed',
      failure: 'provider-unavailable',
    });
    expect(await syncIdentity(dependencies, { userId }, attribution())).toMatchObject({
      outcome: 'synced',
      user: { accessState: 'ACTIVE', identitySyncState: 'SYNCED' },
    });
  });

  it('resends only to INVITED users', async () => {
    const { dependencies } = active();
    expect(await resendUserInvitation(dependencies, { userId }, attribution())).toEqual({
      outcome: 'not-invited',
    });
  });
});

describe('explicit session revocation (IAM-R06 D-10)', () => {
  it('revokes every application session, then ends the Keycloak sessions', async () => {
    const { iam, provider, sessions, dependencies, identity } = active();

    const result = await revokeUserSessions(dependencies, { userId }, attribution());

    expect(result).toEqual({
      outcome: 'revoked',
      sessionsRevoked: 2,
      providerSessions: { outcome: 'terminated' },
    });
    expect(sessions.calls).toEqual([
      { userId, reason: 'administrator', accessState: 'ACTIVE', providerCalls: 0 },
    ]);
    expect(provider.mutatingCalls()).toEqual(['terminateSessions']);
    expect(identity.sessions).toBe(0);
    expect(iam.get()).toMatchObject({
      accessState: 'ACTIVE',
      identitySyncState: 'SYNCED',
      version: 5,
    });
    expect(trail(iam)).toEqual(['iam.user.sessions-revoked:SUCCEEDED']);
    expect(iam.audit[0]?.change).toEqual({
      after: { sessionsRevoked: 2, providerSessions: 'terminated' },
    });
  });

  it('keeps the local revocation and records a Keycloak failure', async () => {
    const { iam, provider, dependencies } = active();
    provider.failNext('terminateSessions');

    const result = await revokeUserSessions(dependencies, { userId }, attribution());

    expect(result).toEqual({
      outcome: 'revoked',
      sessionsRevoked: 2,
      providerSessions: { outcome: 'failed', failure: 'provider-unavailable' },
    });
    expect(trail(iam)).toEqual(['iam.user.sessions-revoked:FAILED']);
  });

  it('calls no provider for a user without an identity, and still records the action', async () => {
    const { iam, provider, sessions, dependencies } = setup(invitedUser());
    sessions.live = 0;

    const result = await revokeUserSessions(dependencies, { userId }, attribution());

    expect(result).toMatchObject({
      sessionsRevoked: 0,
      providerSessions: { outcome: 'no-identity' },
    });
    expect(provider.calls).toEqual([]);
    expect(trail(iam)).toEqual(['iam.user.sessions-revoked:SUCCEEDED']);
  });
});
