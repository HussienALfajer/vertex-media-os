import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { AuditEntry, AuditRecorder } from '@vertex-os/audit';
import type {
  DisplayName,
  IamTransactionRunner,
  NormalizedEmail,
  UserId,
} from '@vertex-os/iam/persistence';
import { createApplicationUserRepository, createIamTransactionRunner } from './index.js';
import { startMigratedPostgres, type MigratedPostgres } from '../test-support/postgres.js';

const ISSUER = 'http://127.0.0.1:8080/realms/vertex';
const missingId = '00000000-0000-4000-8000-000000000099' as UserId;

describe('UserIdentityStore against real PostgreSQL', () => {
  let postgres: MigratedPostgres;
  let runner: IamTransactionRunner;
  const appended: AuditEntry[] = [];
  const recorder: AuditRecorder = {
    append: async (entry) => {
      appended.push(entry);
    },
  };

  beforeAll(async () => {
    postgres = await startMigratedPostgres();
    runner = createIamTransactionRunner(postgres.database, { auditRecorderFor: () => recorder });
  }, 180_000);
  afterAll(async () => {
    await postgres?.stop();
  });
  beforeEach(async () => {
    await postgres.client.$executeRawUnsafe('TRUNCATE iam_application_user CASCADE');
  });

  async function invitedUser(
    email = 'store@example.invalid',
  ): Promise<{ id: UserId; version: number }> {
    const created = await createApplicationUserRepository(postgres.database).create({
      email: email as NormalizedEmail,
      displayName: 'Synthetic User' as DisplayName,
      accessState: 'INVITED',
      identitySyncState: 'PENDING',
      invitationDeliveryState: 'NOT_SENT',
      memberships: [],
      roleIds: [],
    });
    if (created.outcome !== 'created') throw new Error('seed user');
    return { id: created.user.id, version: created.user.version };
  }

  async function row(id: UserId) {
    return postgres.client.iamApplicationUser.findUniqueOrThrow({ where: { id } });
  }

  it('binds an unbound user at its version and raises the version by one', async () => {
    const user = await invitedUser();
    const before = await row(user.id);

    const result = await runner.run(({ users }) =>
      users.bindIdentity({ id: user.id, expectedVersion: 1, issuer: ISSUER, subject: 'subject-a' }),
    );

    expect(result).toMatchObject({
      outcome: 'updated',
      user: { identity: { issuer: ISSUER, subject: 'subject-a' }, version: 2 },
    });
    const after = await row(user.id);
    expect(after).toMatchObject({
      identityIssuer: ISSUER,
      identitySubject: 'subject-a',
      version: 2,
    });
    expect(after.updatedAt.getTime()).toBeGreaterThanOrEqual(before.updatedAt.getTime());
    expect(after.identitySyncState).toBe(before.identitySyncState);
  });

  it('never re-binds, and reports stale versions and unknown users', async () => {
    const user = await invitedUser();
    await runner.run(({ users }) =>
      users.bindIdentity({ id: user.id, expectedVersion: 1, issuer: ISSUER, subject: 'subject-a' }),
    );

    const rebind = await runner.run(({ users }) =>
      users.bindIdentity({ id: user.id, expectedVersion: 2, issuer: ISSUER, subject: 'subject-b' }),
    );
    const stale = await runner.run(({ users }) =>
      users.recordIdentitySync({ id: user.id, expectedVersion: 1, state: 'SYNCED' }),
    );
    const unknown = await runner.run(({ users }) =>
      users.recordIdentitySync({ id: missingId, expectedVersion: 1, state: 'SYNCED' }),
    );

    expect(rebind).toEqual({ outcome: 'version-conflict' });
    expect(stale).toEqual({ outcome: 'version-conflict' });
    expect(unknown).toEqual({ outcome: 'not-found' });
    expect(await row(user.id)).toMatchObject({
      identitySubject: 'subject-a',
      identitySyncState: 'PENDING',
      version: 2,
    });
  });

  it('refuses an identity another user holds, without aborting the transaction', async () => {
    const holder = await invitedUser('holder@example.invalid');
    const user = await invitedUser();
    await runner.run(({ users }) =>
      users.bindIdentity({ id: holder.id, expectedVersion: 1, issuer: ISSUER, subject: 'shared' }),
    );

    const result = await runner.run(async ({ users }) => {
      const taken = await users.bindIdentity({
        id: user.id,
        expectedVersion: 1,
        issuer: ISSUER,
        subject: 'shared',
      });
      // The transaction is still usable after the refusal.
      const recorded = await users.recordIdentitySync({
        id: user.id,
        expectedVersion: 1,
        state: 'FAILED',
      });
      return { taken, recorded: recorded.outcome };
    });

    expect(result).toEqual({ taken: { outcome: 'identity-taken' }, recorded: 'updated' });
    expect(await row(user.id)).toMatchObject({
      identitySubject: null,
      identitySyncState: 'FAILED',
    });
  });

  it('lets exactly one of two users bind the same identity at the same time', async () => {
    const first = await invitedUser('first@example.invalid');
    const second = await invitedUser('second@example.invalid');

    const results = await Promise.allSettled(
      [first, second].map((user) =>
        runner.run(({ users }) =>
          users.bindIdentity({
            id: user.id,
            expectedVersion: 1,
            issuer: ISSUER,
            subject: 'contested',
          }),
        ),
      ),
    );

    const bound = await postgres.client.iamApplicationUser.count({
      where: { identitySubject: 'contested' },
    });
    expect(bound).toBe(1);
    expect(
      results.filter(
        (result) => result.status === 'fulfilled' && result.value.outcome === 'updated',
      ),
    ).toHaveLength(1);
  });

  it('records delivery states: SENT sets invitationSentAt, FAILED keeps it', async () => {
    const user = await invitedUser();

    const sent = await runner.run(({ users }) =>
      users.recordInvitationDelivery({ id: user.id, expectedVersion: 1, state: 'SENT' }),
    );
    const sentAt = (await row(user.id)).invitationSentAt;
    const failed = await runner.run(({ users }) =>
      users.recordInvitationDelivery({ id: user.id, expectedVersion: 2, state: 'FAILED' }),
    );

    expect(sent.outcome).toBe('updated');
    expect(sentAt).toBeInstanceOf(Date);
    expect(failed).toMatchObject({
      outcome: 'updated',
      user: { invitationDeliveryState: 'FAILED', invitationSentAt: sentAt, version: 3 },
    });
  });

  it('records a first FAILED dispatch without a sent time', async () => {
    const user = await invitedUser();

    await runner.run(({ users }) =>
      users.recordInvitationDelivery({ id: user.id, expectedVersion: 1, state: 'FAILED' }),
    );

    expect(await row(user.id)).toMatchObject({
      invitationDeliveryState: 'FAILED',
      invitationSentAt: null,
    });
  });

  it('lets exactly one of several concurrent writers at one version succeed', async () => {
    const user = await invitedUser();

    const results = await Promise.all(
      Array.from({ length: 6 }, () =>
        runner.run(({ users }) =>
          users.recordInvitationDelivery({ id: user.id, expectedVersion: 1, state: 'FAILED' }),
        ),
      ),
    );

    expect(results.filter((result) => result.outcome === 'updated')).toHaveLength(1);
    expect(results.filter((result) => result.outcome === 'version-conflict')).toHaveLength(5);
    expect((await row(user.id)).version).toBe(2);
  });

  it('rolls a write back when later work in the same transaction fails', async () => {
    const user = await invitedUser();

    await expect(
      runner.run(async ({ users }) => {
        await users.recordIdentitySync({ id: user.id, expectedVersion: 1, state: 'SYNCED' });
        throw new Error('audit append failed');
      }),
    ).rejects.toThrow('audit append failed');

    expect(await row(user.id)).toMatchObject({ identitySyncState: 'PENDING', version: 1 });
  });
  async function boundUser(subject = 'subject-a'): Promise<{ id: UserId; version: number }> {
    const user = await invitedUser();
    const bound = await runner.run(({ users }) =>
      users.bindIdentity({ id: user.id, expectedVersion: 1, issuer: ISSUER, subject }),
    );
    if (bound.outcome !== 'updated') throw new Error('seed binding');
    return { id: user.id, version: bound.user.version };
  }

  it('finds a user by issuer and subject together, and by nothing else', async () => {
    const user = await boundUser();
    const repository = createApplicationUserRepository(postgres.database);

    await expect(
      repository.findByIdentity({ issuer: ISSUER, subject: 'subject-a' }),
    ).resolves.toMatchObject({ id: user.id, identity: { issuer: ISSUER, subject: 'subject-a' } });
    await expect(
      repository.findByIdentity({
        issuer: 'http://127.0.0.1:8080/realms/other',
        subject: 'subject-a',
      }),
    ).resolves.toBeUndefined();
    await expect(
      repository.findByIdentity({ issuer: ISSUER, subject: 'store@example.invalid' }),
    ).resolves.toBeUndefined();
  });

  it('activates an INVITED user once and sets both activation times', async () => {
    const user = await boundUser();

    const result = await runner.run(({ users }) =>
      users.recordFirstActivation({ id: user.id, expectedVersion: user.version }),
    );

    expect(result).toMatchObject({
      outcome: 'updated',
      user: { accessState: 'ACTIVE', version: 3 },
    });
    const after = await row(user.id);
    expect(after.accessState).toBe('ACTIVE');
    expect(after.firstActivatedAt).toBeInstanceOf(Date);
    expect(after.lastAccessStateChangedAt).toEqual(after.firstActivatedAt);

    const again = await runner.run(({ users }) =>
      users.recordFirstActivation({ id: user.id, expectedVersion: 3 }),
    );
    expect(again).toEqual({ outcome: 'version-conflict' });
    expect((await row(user.id)).firstActivatedAt).toEqual(after.firstActivatedAt);
  });

  it('never activates a user that is no longer INVITED, even at the same version', async () => {
    const user = await boundUser();
    // A restriction written without a version bump still wins: the write also requires INVITED.
    await postgres.client.$executeRawUnsafe(
      `UPDATE iam_application_user SET access_state = 'SUSPENDED' WHERE id = '${user.id}'`,
    );

    const result = await runner.run(({ users }) =>
      users.recordFirstActivation({ id: user.id, expectedVersion: user.version }),
    );

    expect(result).toEqual({ outcome: 'version-conflict' });
    expect(await row(user.id)).toMatchObject({ accessState: 'SUSPENDED', firstActivatedAt: null });
  });

  it('activates once when several first sign-ins write at the same version', async () => {
    const user = await boundUser();
    const results = await Promise.all(
      Array.from({ length: 6 }, () =>
        runner.run(({ users }) =>
          users.recordFirstActivation({ id: user.id, expectedVersion: user.version }),
        ),
      ),
    );
    expect(results.filter((result) => result.outcome === 'updated')).toHaveLength(1);
    expect(results.filter((result) => result.outcome === 'version-conflict')).toHaveLength(5);
    expect((await row(user.id)).version).toBe(user.version + 1);
  });

  it('lets exactly one of a first activation and a concurrent suspension commit', async () => {
    for (let round = 0; round < 5; round += 1) {
      await postgres.client.$executeRawUnsafe('TRUNCATE iam_application_user CASCADE');
      const user = await boundUser();
      const [activation, suspension] = await Promise.all([
        runner.run(({ users }) =>
          users.recordFirstActivation({ id: user.id, expectedVersion: user.version }),
        ),
        postgres.client.$executeRawUnsafe(
          `UPDATE iam_application_user SET access_state = 'SUSPENDED', version = version + 1
           WHERE id = '${user.id}' AND version = ${user.version}`,
        ),
      ]);
      const committed = await row(user.id);
      expect([activation.outcome === 'updated', suspension === 1]).toContain(true);
      expect(activation.outcome === 'updated').not.toBe(suspension === 1);
      expect(committed.version).toBe(user.version + 1);
      if (suspension === 1) {
        expect(committed).toMatchObject({ accessState: 'SUSPENDED', firstActivatedAt: null });
      } else {
        expect(committed.accessState).toBe('ACTIVE');
      }
    }
  });
});
