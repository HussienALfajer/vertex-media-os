import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { AuditEntry, AuditRecorder } from '@vertex-os/audit';
import type { IamTransactionRunner, UserId } from '@vertex-os/iam/persistence';
import { createApplicationUserRepository, createIamTransactionRunner } from './index.js';
import { startMigratedPostgres, type MigratedPostgres } from '../test-support/postgres.js';
import { seedInvitedUser } from '../test-support/users.js';

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
    return seedInvitedUser(postgres.client, email);
  }

  async function row(id: UserId) {
    return postgres.client.iamApplicationUser.findUniqueOrThrow({ where: { id } });
  }

  /** Runs SQL with psql in its own connection and returns the unaligned, tuple-only output. */
  async function psql(statement: string): Promise<string> {
    const result = await postgres.container.exec([
      'psql',
      '-U',
      postgres.container.getUsername(),
      '-d',
      postgres.container.getDatabase(),
      '-v',
      'ON_ERROR_STOP=1',
      '-t',
      '-A',
      '-c',
      statement,
    ]);
    if (result.exitCode !== 0) throw new Error(`psql failed: ${result.output}`);
    return result.output.trim();
  }

  /**
   * Runs `statement` in a transaction that keeps its row locks for `seconds`, and resolves once it
   * sleeps: the competing operation started next provably meets the uncommitted write (CP1-09).
   */
  async function holdWrite(statement: string, seconds = 1.5): Promise<{ done: Promise<string> }> {
    const marker = `hold_${randomUUID().replaceAll('-', '')}`;
    const done = psql(`BEGIN; ${statement}; SELECT pg_sleep(${seconds}) AS ${marker}; COMMIT;`);
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const sleeping = await psql(
        `SELECT count(*) FROM pg_stat_activity WHERE query LIKE '%AS ${marker}%' AND wait_event = 'PgSleep'`,
      );
      if (sleeping === '1') return { done };
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error('the lock-holding transaction never started sleeping');
  }

  /** Waits until at least `count` statements wait on a lock: the competitors are in flight. */
  async function competitorsWaiting(count: number): Promise<void> {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const waiting = Number(
        await psql("SELECT count(*) FROM pg_stat_activity WHERE wait_event_type = 'Lock'"),
      );
      if (waiting >= count) return;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw new Error('the competing writes never waited on the held lock');
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

  it('refuses a second binding of an identity while the first one is still uncommitted', async () => {
    const first = await invitedUser('first@example.invalid');
    const second = await invitedUser('second@example.invalid');

    // The first binding has written but not committed, so the second one's holder check passes and
    // only the unique key can stop it (CP1-09).
    const hold = await holdWrite(
      `UPDATE iam_application_user SET identity_issuer = '${ISSUER}', identity_subject = 'contested',
         version = version + 1 WHERE id = '${first.id}' AND version = 1 AND identity_subject IS NULL`,
    );
    const competing = runner.run(({ users }) =>
      users.bindIdentity({
        id: second.id,
        expectedVersion: 1,
        issuer: ISSUER,
        subject: 'contested',
      }),
    );
    const settled = competing.then(
      (value) => ({ status: 'fulfilled' as const, value }),
      (reason: unknown) => ({ status: 'rejected' as const, reason }),
    );
    await competitorsWaiting(1);
    await hold.done;

    const result = await settled;
    expect(result.status === 'fulfilled' && result.value.outcome === 'updated').toBe(false);
    expect(
      await postgres.client.iamApplicationUser.findMany({
        where: { identitySubject: 'contested' },
        select: { id: true },
      }),
    ).toEqual([{ id: first.id }]);
    expect(await row(second.id)).toMatchObject({ identitySubject: null, version: 1 });
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

  it('turns writers at a version that a concurrent write consumed into conflicts', async () => {
    const user = await invitedUser();

    const hold = await holdWrite(
      `UPDATE iam_application_user SET invitation_delivery_state = 'SENT', invitation_sent_at = now(),
         version = version + 1
         WHERE id = '${user.id}' AND version = 1`,
    );
    const competing = Array.from({ length: 3 }, () =>
      runner.run(({ users }) =>
        users.recordInvitationDelivery({ id: user.id, expectedVersion: 1, state: 'FAILED' }),
      ),
    );
    await competitorsWaiting(3);
    await hold.done;

    // Each waited on the row lock, then re-checked its version on the committed row (CP1-09).
    expect((await Promise.all(competing)).map((result) => result.outcome)).toEqual([
      'version-conflict',
      'version-conflict',
      'version-conflict',
    ]);
    expect(await row(user.id)).toMatchObject({ invitationDeliveryState: 'SENT', version: 2 });
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

  it('activates once when several first sign-ins meet an uncommitted activation', async () => {
    const user = await boundUser();
    const hold = await holdWrite(
      `UPDATE iam_application_user SET access_state = 'ACTIVE', first_activated_at = now(),
         version = version + 1 WHERE id = '${user.id}' AND version = ${user.version}
         AND access_state = 'INVITED'`,
    );
    const competing = Array.from({ length: 3 }, () =>
      runner.run(({ users }) =>
        users.recordFirstActivation({ id: user.id, expectedVersion: user.version }),
      ),
    );
    await competitorsWaiting(3);
    await hold.done;

    expect((await Promise.all(competing)).map((result) => result.outcome)).toEqual([
      'version-conflict',
      'version-conflict',
      'version-conflict',
    ]);
    expect((await row(user.id)).version).toBe(user.version + 1);
  });

  it('never activates a user whose suspension is in flight', async () => {
    const user = await boundUser();
    const hold = await holdWrite(
      `UPDATE iam_application_user SET access_state = 'SUSPENDED', version = version + 1
         WHERE id = '${user.id}' AND version = ${user.version}`,
    );
    const activation = runner.run(({ users }) =>
      users.recordFirstActivation({ id: user.id, expectedVersion: user.version }),
    );
    await competitorsWaiting(1);
    await hold.done;

    expect(await activation).toEqual({ outcome: 'version-conflict' });
    expect(await row(user.id)).toMatchObject({
      accessState: 'SUSPENDED',
      firstActivatedAt: null,
      version: user.version + 1,
    });
  });

  it('keeps a suspension that meets an in-flight activation from overwriting it unseen', async () => {
    const user = await boundUser();
    const hold = await holdWrite(
      `UPDATE iam_application_user SET access_state = 'ACTIVE', first_activated_at = now(),
         version = version + 1 WHERE id = '${user.id}' AND version = ${user.version}
         AND access_state = 'INVITED'`,
    );
    // A version-checked suspension, as the lifecycle store writes it. Prisma runs a query only
    // once it is awaited, so it is started explicitly.
    const suspension = Promise.resolve(
      postgres.client.$executeRawUnsafe(
        `UPDATE iam_application_user SET access_state = 'SUSPENDED', version = version + 1
         WHERE id = '${user.id}' AND version = ${user.version}`,
      ),
    );
    await competitorsWaiting(1);
    await hold.done;

    expect(await suspension).toBe(0);
    expect(await row(user.id)).toMatchObject({ accessState: 'ACTIVE', version: user.version + 1 });
  });
});
