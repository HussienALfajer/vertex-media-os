import { describe, expect, it } from 'vitest';
import { parseSystemProcess, parseTraceId, type AuditAttribution } from '@vertex-os/audit';
import {
  EMAIL,
  FakeIdentityProvider,
  ISSUER,
  InMemoryIam,
  OTHER_USER_ID,
  USER_ID,
  invitedUser,
} from '../../test-support/identity-provisioning-fakes.js';
import type { ApplicationUser } from '../domain/application-user.js';
import type { IdentityProvisioningDependencies } from './identity-provisioning-dependencies.js';
import { outstandingInvitationActions, provesOwnership } from './identity-rules.js';
import { dispatchInvitation, resendInvitation } from './invitation-dispatch.js';
import { provisionIdentity } from './provision-identity.js';
import { reconcileIdentity } from './reconcile-identity.js';

function attribution(): AuditAttribution {
  const process = parseSystemProcess('iam.test-provisioning');
  const traceId = parseTraceId('trace-provisioning-1');
  if (!process.ok || !traceId.ok) throw new Error('attribution fixture');
  return { actor: { type: 'SYSTEM', process: process.value }, traceId: traceId.value };
}

const LIFESPAN = 43_200;

function setup(user: ApplicationUser = invitedUser(), ...others: ApplicationUser[]) {
  const iam = new InMemoryIam(user, ...others);
  const provider = new FakeIdentityProvider();
  const dependencies: IdentityProvisioningDependencies = {
    users: iam.repository,
    runner: iam,
    identityProvider: provider,
    invitationLifespanSeconds: LIFESPAN,
  };
  const request = { userId: USER_ID, attribution: attribution() };
  return { iam, provider, dependencies, request };
}

const actions = (iam: InMemoryIam) => iam.audit.map((entry) => `${entry.action}:${entry.result}`);

/** A provisioned INVITED user: bound, SYNCED, identity present. */
function provisioned(overrides: Partial<ApplicationUser> = {}) {
  const context = setup();
  const identity = context.provider.add({ username: EMAIL, vertexUserIds: [USER_ID] });
  context.iam.users.set(
    USER_ID,
    invitedUser({
      identity: { issuer: ISSUER, subject: identity.subject },
      identitySyncState: 'SYNCED',
      version: 3,
      ...overrides,
    }),
  );
  return { ...context, identity };
}

describe('identity rules', () => {
  const user = invitedUser();
  const identity = {
    subject: 's-1',
    username: EMAIL,
    email: EMAIL,
    enabled: true,
    emailVerified: false,
    vertexUserIds: [USER_ID],
    requiredActions: [],
  };

  it('proves ownership only by username, a single matching vertexUserId and a bound subject', () => {
    expect(provesOwnership(identity, user)).toBe(true);
    expect(provesOwnership({ ...identity, username: 'ADA@example.test' }, user)).toBe(false);
    expect(provesOwnership({ ...identity, vertexUserIds: [] }, user)).toBe(false);
    expect(provesOwnership({ ...identity, vertexUserIds: [OTHER_USER_ID] }, user)).toBe(false);
    expect(provesOwnership({ ...identity, vertexUserIds: [USER_ID, USER_ID] }, user)).toBe(false);
    const bound = invitedUser({ identity: { issuer: ISSUER, subject: 's-2' } });
    expect(provesOwnership(identity, bound)).toBe(false);
    expect(provesOwnership({ ...identity, subject: 's-2' }, bound)).toBe(true);
  });

  it('asks an invitation only for the factors not yet established', () => {
    const none = { password: false, otp: false };
    expect(outstandingInvitationActions({ emailVerified: false }, none)).toEqual([
      'VERIFY_EMAIL',
      'UPDATE_PASSWORD',
      'CONFIGURE_TOTP',
    ]);
    expect(
      outstandingInvitationActions({ emailVerified: true }, { password: true, otp: false }),
    ).toEqual(['CONFIGURE_TOTP']);
    expect(
      outstandingInvitationActions({ emailVerified: true }, { password: true, otp: true }),
    ).toEqual([]);
  });
});

describe('provisionIdentity', () => {
  it('creates, binds and enables the identity, then sends the first invitation', async () => {
    const { iam, provider, dependencies, request } = setup();

    const result = await provisionIdentity(dependencies, request);

    expect(result.identity.outcome).toBe('synced');
    expect(result.invitation).toMatchObject({
      outcome: 'sent',
      actions: ['VERIFY_EMAIL', 'UPDATE_PASSWORD', 'CONFIGURE_TOTP'],
    });
    const [identity] = provider.identities.values();
    expect(identity).toMatchObject({ username: EMAIL, vertexUserIds: [USER_ID], enabled: true });
    const user = iam.get();
    expect(user).toMatchObject({
      accessState: 'INVITED',
      identity: { issuer: ISSUER, subject: identity?.subject },
      identitySyncState: 'SYNCED',
      invitationDeliveryState: 'SENT',
    });
    expect(user.invitationSentAt).toBeInstanceOf(Date);
    expect(provider.sent).toEqual([{ subject: identity?.subject, lifespan: LIFESPAN }]);
    // The factors are the identity's own required actions, never part of the emailed link.
    expect(identity?.requiredActions).toEqual(['UPDATE_PASSWORD', 'CONFIGURE_TOTP']);
    expect(actions(iam)).toEqual([
      'iam.user.identity-bound:SUCCEEDED',
      'iam.user.identity-reconciled:SUCCEEDED',
      'iam.user.invitation-dispatch-started:SUCCEEDED',
      'iam.user.invitation-dispatched:SUCCEEDED',
    ]);
    // Every write is its own transaction, between Keycloak calls.
    expect(iam.transactions).toEqual([
      'bind',
      'sync:SYNCED',
      'invitation:FAILED',
      'invitation:SENT',
    ]);
    expect(iam.audit.map((entry) => entry.target.id as string)).toEqual(Array(4).fill(USER_ID));
    expect(JSON.stringify(iam.audit)).not.toContain(EMAIL);
  });

  it('leaves the user INVITED, FAILED and NOT_SENT when Keycloak is unavailable', async () => {
    const { iam, provider, dependencies, request } = setup();
    provider.failNext('create');

    const result = await provisionIdentity(dependencies, request);

    expect(result).toMatchObject({
      identity: { outcome: 'failed', failure: 'provider-unavailable' },
      invitation: { outcome: 'not-applicable' },
    });
    expect(iam.get()).toMatchObject({
      accessState: 'INVITED',
      identity: undefined,
      identitySyncState: 'FAILED',
      invitationDeliveryState: 'NOT_SENT',
    });
    expect(iam.audit.at(-1)?.change?.after).toMatchObject({ failure: 'provider-unavailable' });
  });

  it('links the identity of a lost create response instead of creating a second one', async () => {
    const { iam, provider, dependencies, request } = setup();
    provider.loseCreateResponse = true;

    const first = await provisionIdentity(dependencies, request);
    expect(first.identity).toMatchObject({ outcome: 'failed', failure: 'provider-unavailable' });
    provider.loseCreateResponse = false;
    const second = await provisionIdentity(dependencies, request);

    expect(second.identity.outcome).toBe('synced');
    expect(second.invitation.outcome).toBe('sent');
    expect(provider.identities.size).toBe(1);
    expect(provider.calls.filter((call) => call === 'create')).toHaveLength(1);
    expect(iam.get().identity?.subject).toBe([...provider.identities.keys()][0]);
  });

  it('dispatches the first invitation once when provisioning runs twice at the same time', async () => {
    const { iam, provider, dependencies, request } = setup();

    const results = await Promise.all([
      provisionIdentity(dependencies, request),
      provisionIdentity(dependencies, request),
    ]);

    expect(provider.identities.size).toBe(1);
    expect(provider.sent).toHaveLength(1);
    expect(iam.get()).toMatchObject({
      identitySyncState: 'SYNCED',
      invitationDeliveryState: 'SENT',
    });
    expect(results.map((result) => result.identity.outcome)).toEqual(['synced', 'synced']);
  });

  it('does not invite a user whose earlier invitation was attempted', async () => {
    const { provider, dependencies, request } = provisioned({ invitationDeliveryState: 'FAILED' });

    const result = await provisionIdentity(dependencies, request);

    expect(result.invitation.outcome).toBe('not-applicable');
    expect(provider.sent).toHaveLength(0);
  });
});

describe('reconcileIdentity', () => {
  it('re-looks up after a duplicate create and links the identity it proves', async () => {
    const { iam, provider, dependencies, request } = setup();
    provider.onNext('create', () => provider.add({ username: EMAIL, vertexUserIds: [USER_ID] }));
    // The first username lookup sees nothing; the identity appears before the create answers.

    const result = await reconcileIdentity(dependencies, request);

    expect(result.outcome).toBe('synced');
    expect(provider.identities.size).toBe(1);
    expect(iam.get().identity?.subject).toBe([...provider.identities.keys()][0]);
  });

  it('reports a conflict when a duplicate create finds nothing under the username', async () => {
    const { iam, provider, dependencies, request } = setup();
    // Keycloak holds the email under another username (duplicate email).
    provider.add({ username: 'someone-else', vertexUserIds: [] });
    provider.create = async () => ({ ok: true, value: { outcome: 'duplicate' } });

    const result = await reconcileIdentity(dependencies, request);

    expect(result).toMatchObject({ outcome: 'failed', failure: 'identity-conflict' });
    expect(iam.get()).toMatchObject({ identity: undefined, identitySyncState: 'FAILED' });
  });

  it.each([
    ['another user', [OTHER_USER_ID]],
    ['no owner', []],
    ['two owners', [USER_ID, OTHER_USER_ID]],
  ])('never links or modifies an identity claimed by %s', async (_label, owners) => {
    const { iam, provider, dependencies, request } = setup();
    const foreign = provider.add({ username: EMAIL, vertexUserIds: owners, enabled: false });
    const before = structuredClone(foreign);

    const result = await reconcileIdentity(dependencies, request);

    expect(result).toMatchObject({ outcome: 'failed', failure: 'identity-conflict' });
    expect(provider.mutatingCalls()).toEqual([]);
    expect(provider.identities.get(foreign.subject)).toEqual(before);
    expect(iam.get()).toMatchObject({ identity: undefined, identitySyncState: 'FAILED' });
    expect(actions(iam)).toEqual(['iam.user.identity-reconciled:FAILED']);
  });

  it.each(['SUSPENDED', 'DISABLED', 'TERMINATED'] as const)(
    'never binds or disables an unproven identity for an unbound %s user',
    async (accessState) => {
      const { iam, provider, dependencies, request } = setup(invitedUser({ accessState }));
      const foreign = provider.add({ username: EMAIL, vertexUserIds: [OTHER_USER_ID] });
      const before = structuredClone(foreign);

      const result = await reconcileIdentity(dependencies, request);

      expect(result).toMatchObject({ outcome: 'failed', failure: 'identity-conflict' });
      expect(provider.mutatingCalls()).toEqual([]);
      expect(provider.identities.get(foreign.subject)).toEqual(before);
      expect(iam.get().identity).toBeUndefined();
    },
  );

  it('reports a conflict when the bound identity no longer exists, and never re-creates it', async () => {
    const { iam, provider, dependencies, request, identity } = provisioned();
    provider.identities.delete(identity.subject);

    const result = await reconcileIdentity(dependencies, request);

    expect(result).toMatchObject({ outcome: 'failed', failure: 'identity-conflict' });
    expect(provider.mutatingCalls()).toEqual([]);
    expect(iam.get().identity?.subject).toBe(identity.subject);
  });

  it('reports a conflict for a binding to another issuer', async () => {
    const { provider, dependencies, request } = provisioned({
      identity: { issuer: 'http://elsewhere/realms/vertex', subject: 'subject-1' },
    });

    const result = await reconcileIdentity(dependencies, request);

    expect(result).toMatchObject({ outcome: 'failed', failure: 'identity-conflict' });
    expect(provider.calls).toEqual([]);
  });

  it('reports a conflict when the identity is already bound to another user', async () => {
    const holder = invitedUser({ id: OTHER_USER_ID, email: 'other@example.test' as never });
    const { iam, provider, dependencies, request } = setup(invitedUser(), holder);
    const identity = provider.add({ username: EMAIL, vertexUserIds: [USER_ID] });
    iam.users.set(OTHER_USER_ID, {
      ...holder,
      identity: { issuer: ISSUER, subject: identity.subject },
    });

    const result = await reconcileIdentity(dependencies, request);

    expect(result).toMatchObject({ outcome: 'failed', failure: 'identity-conflict' });
    expect(iam.get().identity).toBeUndefined();
  });

  it('enables a disabled identity an INVITED user owns', async () => {
    const { iam, dependencies, request, identity } = provisioned({
      identitySyncState: 'FAILED',
    });
    identity.enabled = false;

    const result = await reconcileIdentity(dependencies, request);

    expect(result.outcome).toBe('synced');
    expect(identity.enabled).toBe(true);
    expect(iam.audit.at(-1)?.change?.after).toMatchObject({ steps: ['enabled'] });
  });

  it('refuses to enable a bound identity whose ownership evidence was changed', async () => {
    const { provider, dependencies, request, identity } = provisioned();
    identity.enabled = false;
    identity.vertexUserIds = [OTHER_USER_ID];

    const result = await reconcileIdentity(dependencies, request);

    expect(result).toMatchObject({ outcome: 'failed', failure: 'identity-conflict' });
    expect(identity.enabled).toBe(false);
    expect(provider.mutatingCalls()).toEqual([]);
  });

  it('writes nothing when Keycloak already matches a SYNCED user', async () => {
    const { iam, dependencies, request } = provisioned();

    const result = await reconcileIdentity(dependencies, request);

    expect(result.outcome).toBe('synced');
    expect(iam.transactions).toEqual([]);
    expect(iam.get().version).toBe(3);
  });

  it.each(['SUSPENDED', 'DISABLED', 'TERMINATED'] as const)(
    'disables a %s user’s identity and ends its sessions without proof of ownership',
    async (accessState) => {
      const { iam, provider, dependencies, request, identity } = provisioned({
        accessState,
        identitySyncState: 'PENDING',
      });
      identity.vertexUserIds = [];
      identity.sessions = 2;

      const result = await reconcileIdentity(dependencies, request);

      expect(result.outcome).toBe('synced');
      expect(identity).toMatchObject({ enabled: false, sessions: 0 });
      expect(provider.mutatingCalls()).toEqual(['setEnabled:false', 'terminateSessions']);
      expect(iam.get()).toMatchObject({ accessState, identitySyncState: 'SYNCED' });
    },
  );

  it('keeps access denied and records FAILED when disabling fails', async () => {
    const { iam, provider, dependencies, request, identity } = provisioned({
      accessState: 'SUSPENDED',
      identitySyncState: 'PENDING',
    });
    provider.failNext('setEnabled');

    const result = await reconcileIdentity(dependencies, request);

    expect(result).toMatchObject({ outcome: 'failed', failure: 'provider-unavailable' });
    expect(identity.enabled).toBe(true);
    expect(iam.get()).toMatchObject({ accessState: 'SUSPENDED', identitySyncState: 'FAILED' });
  });

  it('creates nothing for a denied user without an identity', async () => {
    const { iam, provider, dependencies, request } = setup(
      invitedUser({ accessState: 'TERMINATED' }),
    );

    const result = await reconcileIdentity(dependencies, request);

    expect(result.outcome).toBe('synced');
    expect(provider.mutatingCalls()).toEqual([]);
    expect(iam.get()).toMatchObject({ identity: undefined, identitySyncState: 'SYNCED' });
  });

  it('binds and disables an owned identity of an unbound denied user, and only then', async () => {
    const { iam, provider, dependencies, request } = setup(
      invitedUser({ accessState: 'DISABLED' }),
    );
    const identity = provider.add({ username: EMAIL, vertexUserIds: [USER_ID] });

    const result = await reconcileIdentity(dependencies, request);

    expect(result.outcome).toBe('synced');
    expect(iam.get().identity?.subject).toBe(identity.subject);
    expect(identity.enabled).toBe(false);
  });

  it('re-runs against the new committed state when a competing change wins', async () => {
    const { iam, provider, dependencies, request } = setup();
    // Suspension commits between the read and the binding write.
    iam.beforeRun = () => {
      iam.beforeRun = undefined;
      iam.commit({ accessState: 'SUSPENDED', identitySyncState: 'PENDING' });
    };

    const result = await reconcileIdentity(dependencies, request);

    expect(result.outcome).toBe('synced');
    const [identity] = provider.identities.values();
    expect(iam.get()).toMatchObject({ accessState: 'SUSPENDED', identitySyncState: 'SYNCED' });
    expect(identity?.enabled).toBe(false);
  });

  it('gives up without writing after three lost races', async () => {
    const { iam, dependencies, request } = setup();
    iam.beforeRun = () => iam.commit({});

    const result = await reconcileIdentity(dependencies, request);

    expect(result.outcome).toBe('superseded');
    expect(iam.audit).toEqual([]);
    expect(iam.get().identitySyncState).toBe('PENDING');
  });

  it('records FAILED when a stale attempt changed Keycloak and every retry lost a race', async () => {
    const { iam, provider, dependencies, request } = setup();
    // The user is terminated, and that termination reconciled (nothing to disable), while this
    // reconciliation's create is in flight; then unrelated changes keep winning.
    provider.onNext('create', () =>
      iam.commit({ accessState: 'TERMINATED', identitySyncState: 'SYNCED' }),
    );
    let races = 3;
    iam.beforeRun = () => {
      if (races > 0) {
        races -= 1;
        iam.commit({});
      }
    };

    const result = await reconcileIdentity(dependencies, request);

    expect(result).toMatchObject({ outcome: 'failed', failure: 'identity-out-of-sync' });
    expect(iam.get()).toMatchObject({ accessState: 'TERMINATED', identitySyncState: 'FAILED' });
    expect(iam.audit.at(-1)?.change?.after).toMatchObject({ steps: ['created'] });
    // A later reconciliation repairs Keycloak.
    iam.beforeRun = undefined;
    expect((await reconcileIdentity(dependencies, request)).outcome).toBe('synced');
    expect([...provider.identities.values()][0]?.enabled).toBe(false);
  });

  it('records FAILED when a create with a lost response was superseded by competing changes', async () => {
    const { iam, provider, dependencies, request } = setup();
    provider.loseCreateResponse = true;
    provider.onNext('create', () =>
      iam.commit({ accessState: 'TERMINATED', identitySyncState: 'SYNCED' }),
    );
    let races = 3;
    iam.beforeRun = () => {
      if (races > 0) {
        races -= 1;
        iam.commit({});
      }
    };

    const result = await reconcileIdentity(dependencies, request);

    expect(result).toMatchObject({ outcome: 'failed', failure: 'identity-out-of-sync' });
    expect(iam.get()).toMatchObject({ accessState: 'TERMINATED', identitySyncState: 'FAILED' });
  });

  it('rolls the state write back when the Audit append fails', async () => {
    const { iam, dependencies, request } = setup();
    iam.failAuditOnAction = 'iam.user.identity-bound';

    await expect(reconcileIdentity(dependencies, request)).rejects.toThrow('audit append failed');

    expect(iam.get()).toMatchObject({
      identity: undefined,
      identitySyncState: 'PENDING',
      version: 1,
    });
  });

  it('answers not-found for an unknown user', async () => {
    const { dependencies, provider } = setup();
    const result = await reconcileIdentity(dependencies, {
      userId: OTHER_USER_ID,
      attribution: attribution(),
    });
    expect(result.outcome).toBe('not-found');
    expect(provider.calls).toEqual([]);
  });
});

describe('invitation dispatch and resend', () => {
  it('refuses users who are not INVITED or not synchronized, without calling Keycloak', async () => {
    for (const [overrides, outcome] of [
      [{ accessState: 'ACTIVE', firstActivatedAt: new Date() }, 'not-invited'],
      [{ identitySyncState: 'FAILED' }, 'sync-incomplete'],
      [{ identitySyncState: 'PENDING' }, 'sync-incomplete'],
    ] as const) {
      const { provider, dependencies, request } = provisioned(overrides);
      expect((await resendInvitation(dependencies, request)).outcome).toBe(outcome);
      expect(provider.calls).toEqual([]);
    }
    const unbound = setup(invitedUser({ identitySyncState: 'SYNCED' }));
    expect((await resendInvitation(unbound.dependencies, unbound.request)).outcome).toBe(
      'sync-incomplete',
    );
  });

  it('resends only the missing factors and never replaces an enrolled one', async () => {
    const { provider, dependencies, request, identity } = provisioned({
      invitationDeliveryState: 'SENT',
      invitationSentAt: new Date('2026-09-23T11:00:00.000Z'),
    });
    identity.emailVerified = true;
    identity.password = true;

    const result = await resendInvitation(dependencies, request);

    expect(result).toMatchObject({ outcome: 'sent', actions: ['CONFIGURE_TOTP'] });
    expect(provider.sent).toHaveLength(1);
  });

  it('sends nothing when no factor is outstanding', async () => {
    const { iam, provider, dependencies, request, identity } = provisioned({
      invitationDeliveryState: 'SENT',
      invitationSentAt: new Date(),
    });
    Object.assign(identity, { emailVerified: true, password: true, otp: true });

    const result = await resendInvitation(dependencies, request);

    expect(result.outcome).toBe('no-action-required');
    expect(provider.sent).toEqual([]);
    expect(iam.transactions).toEqual([]);
  });

  it('keeps the earlier invitationSentAt when a resend fails', async () => {
    const sentAt = new Date('2026-09-23T11:00:00.000Z');
    const { iam, provider, dependencies, request } = provisioned({
      invitationDeliveryState: 'SENT',
      invitationSentAt: sentAt,
    });
    provider.failNext('sendInvitation');

    const result = await resendInvitation(dependencies, request);

    expect(result).toMatchObject({ outcome: 'failed', failure: 'provider-unavailable' });
    expect(iam.get()).toMatchObject({
      accessState: 'INVITED',
      identitySyncState: 'SYNCED',
      invitationDeliveryState: 'FAILED',
      invitationSentAt: sentAt,
    });
    expect(actions(iam)).toEqual([
      'iam.user.invitation-dispatch-started:SUCCEEDED',
      'iam.user.invitation-dispatched:FAILED',
    ]);
  });

  it('refuses to send when a missing factor is not a required action of the identity', async () => {
    const { iam, provider, dependencies, request, identity } = provisioned();
    identity.requiredActions = ['UPDATE_PASSWORD'];

    const result = await resendInvitation(dependencies, request);

    expect(result).toMatchObject({ outcome: 'failed', failure: 'identity-out-of-sync' });
    expect(provider.sent).toEqual([]);
    expect(iam.get().identitySyncState).toBe('FAILED');
  });

  it.each([
    ['another email', { email: 'mallory@example.test' }],
    ['another owner', { vertexUserIds: [OTHER_USER_ID] }],
  ])('sends nothing to an identity that now has %s', async (_label, change) => {
    const { iam, provider, dependencies, request, identity } = provisioned();
    Object.assign(identity, change);

    const result = await resendInvitation(dependencies, request);

    expect(result).toMatchObject({ outcome: 'failed', failure: 'identity-conflict' });
    expect(provider.sent).toEqual([]);
    expect(iam.get().identitySyncState).toBe('FAILED');
  });

  it('records the identity as out of sync when it is disabled, and sends nothing', async () => {
    const { iam, provider, dependencies, request, identity } = provisioned();
    identity.enabled = false;

    const result = await dispatchInvitation(dependencies, { ...request, kind: 'first' });

    expect(result).toMatchObject({ outcome: 'failed', failure: 'identity-out-of-sync' });
    expect(provider.sent).toEqual([]);
    expect(iam.get()).toMatchObject({
      identitySyncState: 'FAILED',
      invitationDeliveryState: 'NOT_SENT',
    });
    expect(actions(iam)).toEqual(['iam.user.identity-mismatch-detected:FAILED']);
  });

  it.each([
    ['refused', 'identity-out-of-sync'],
    ['not-found', 'identity-conflict'],
  ] as const)(
    'records both states FAILED when Keycloak answers %s',
    async (sendOutcome, failure) => {
      const { iam, provider, dependencies, request } = provisioned();
      provider.sendOutcome = sendOutcome;

      const result = await dispatchInvitation(dependencies, { ...request, kind: 'first' });

      expect(result).toMatchObject({ outcome: 'failed', failure });
      expect(iam.get()).toMatchObject({
        accessState: 'INVITED',
        identitySyncState: 'FAILED',
        invitationDeliveryState: 'FAILED',
      });
      expect(iam.transactions.at(-1)).toBe('invitation:FAILED+sync:FAILED');
    },
  );

  it('does not record an attempt when reading the identity fails', async () => {
    const { iam, provider, dependencies, request } = provisioned();
    provider.failNext('findBySubject', 'rejected');

    const result = await dispatchInvitation(dependencies, { ...request, kind: 'first' });

    expect(result).toMatchObject({ outcome: 'failed', failure: 'provider-rejected' });
    expect(iam.get().invitationDeliveryState).toBe('NOT_SENT');
    expect(iam.transactions).toEqual([]);
  });

  it('does not record a refusal as a mismatch after a competing change has reconciled', async () => {
    const { iam, provider, dependencies, request, identity } = provisioned();
    provider.sendOutcome = 'refused';
    provider.onNext('sendInvitation', () => {
      identity.enabled = false;
      iam.commit({ accessState: 'SUSPENDED', identitySyncState: 'SYNCED' });
    });

    const result = await dispatchInvitation(dependencies, { ...request, kind: 'first' });

    expect(result).toMatchObject({ outcome: 'failed', failure: 'identity-out-of-sync' });
    expect(iam.get()).toMatchObject({
      accessState: 'SUSPENDED',
      identitySyncState: 'SYNCED',
      invitationDeliveryState: 'FAILED',
    });
    expect(actions(iam)).not.toContain('iam.user.identity-mismatch-detected:FAILED');
  });

  it('records the outcome on the newer version when a competing change lands after the claim', async () => {
    const { iam, provider, dependencies, request } = provisioned();
    provider.onNext('sendInvitation', () => iam.commit({ displayName: 'Ada L.' as never }));

    const result = await dispatchInvitation(dependencies, { ...request, kind: 'first' });

    expect(result.outcome).toBe('sent');
    expect(iam.get()).toMatchObject({ invitationDeliveryState: 'SENT', displayName: 'Ada L.' });
  });
});
