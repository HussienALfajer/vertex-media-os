import { randomUUID } from 'node:crypto';
import { parseSystemProcess, parseTraceId, type AuditAttribution } from '@vertex-os/audit';
import { createAuditRecorder } from '@vertex-os/audit-persistence';
import { createDatabaseClient, type DatabaseClient } from '@vertex-os/database';
import { authPersistenceOf } from '@vertex-os/database/auth';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startMigratedPostgres, type MigratedPostgres } from '../../test-support/postgres.js';
import { csrfTokenFor, hashSecret, newSecret } from './secrets.js';
import { createSessionStore, HOUSEKEEPING_BATCH } from './session-store.js';
import { createSessionService } from './sessions.js';

const MINUTE = 60_000;
const LIMITS = {
  idleTimeoutSeconds: 1800,
  absoluteTimeoutSeconds: 36000,
  retentionDays: 30,
};

function attribution(): AuditAttribution {
  const process = parseSystemProcess('iam.session-test');
  const traceId = parseTraceId('trace-session-test');
  if (!process.ok || !traceId.ok) throw new Error('attribution fixture');
  return { actor: { type: 'SYSTEM', process: process.value }, traceId: traceId.value };
}

describe('local application sessions against PostgreSQL', () => {
  let postgres: MigratedPostgres;
  let database: DatabaseClient;
  let clock: Date;
  const store = () => createSessionStore(database, { auditRecorderFor: createAuditRecorder });
  const service = () => createSessionService({ store: store(), limits: LIMITS, now: () => clock });
  const row = (id: string) =>
    authPersistenceOf(database).authSession.findUniqueOrThrow({ where: { id } });
  const auditActions = async () => {
    const output = await postgres.sql(
      'SELECT action FROM audit_record ORDER BY occurred_at, action',
    );
    return output === '' ? [] : output.split('\n');
  };

  beforeAll(async () => {
    postgres = await startMigratedPostgres();
    database = createDatabaseClient({ connectionString: postgres.url });
  }, 180_000);
  afterAll(async () => {
    await database?.disconnect();
    await postgres?.stop();
  });
  beforeEach(async () => {
    await postgres.sql('TRUNCATE auth_session, auth_login_attempt, audit_record');
    clock = new Date('2026-09-23T12:00:00.000Z');
  });

  it('stores only session and CSRF hashes, with transactional Audit evidence', async () => {
    const sessions = service();
    const { secret, session } = await sessions.establish({
      userId: randomUUID(),
      attribution: attribution(),
    });
    const stored = await row(session.id);
    expect(stored.tokenHash).toBe(hashSecret(secret));
    expect(stored.csrfTokenHash).toBe(hashSecret(csrfTokenFor(secret)));
    expect(JSON.stringify(stored)).not.toContain(secret);
    expect(stored).toMatchObject({
      idpSessionId: null,
      idTokenCiphertext: null,
      refreshTokenCiphertext: null,
      idleExpiresAt: new Date(clock.getTime() + 30 * MINUTE),
      absoluteExpiresAt: new Date(clock.getTime() + 600 * MINUTE),
    });
    expect(await auditActions()).toEqual(['iam.session.established']);
  });

  it('rolls session creation back when Audit append fails', async () => {
    const failing = createSessionService({
      store: createSessionStore(database, {
        auditRecorderFor: () => ({
          append: async () => {
            throw new Error('audit append failed');
          },
        }),
      }),
      limits: LIMITS,
      now: () => clock,
    });
    await expect(
      failing.establish({ userId: randomUUID(), attribution: attribution() }),
    ).rejects.toThrow('audit append failed');
    expect(await authPersistenceOf(database).authSession.count()).toBe(0);
  });

  it('rejects retained provider-backed cookies even when their row is live', async () => {
    const sessions = service();
    const { secret, session } = await sessions.establish({
      userId: randomUUID(),
      attribution: attribution(),
    });
    await authPersistenceOf(database).authSession.update({
      where: { id: session.id },
      data: { idpSessionId: 'retired-provider-session' },
    });
    expect(await sessions.authenticate(secret, attribution())).toEqual({ outcome: 'invalid' });
    await authPersistenceOf(database).authSession.update({
      where: { id: session.id },
      data: { idpSessionId: null, idTokenCiphertext: 'sealed', idTokenKeyVersion: 1 },
    });
    expect(await sessions.authenticate(secret, attribution())).toEqual({ outcome: 'invalid' });
    expect(await row(session.id)).toMatchObject({ idTokenCiphertext: 'sealed' });
  });

  it('slides idle expiry once per minute and stops at absolute expiry', async () => {
    const sessions = service();
    const { secret, session } = await sessions.establish({
      userId: randomUUID(),
      attribution: attribution(),
    });
    clock = new Date(clock.getTime() + 30_000);
    expect(await sessions.authenticate(secret, attribution())).toMatchObject({
      revalidation: 'not-due',
    });
    expect((await row(session.id)).lastSeenAt).toEqual(session.createdAt);
    clock = new Date(clock.getTime() + 30_000);
    expect(await sessions.authenticate(secret, attribution())).toMatchObject({
      outcome: 'valid',
      revalidation: 'refreshed',
      session: { idleExpiresAt: new Date(clock.getTime() + 30 * MINUTE) },
    });
    expect((await row(session.id)).lastSeenAt).toEqual(clock);
    for (let elapsed = 1; elapsed < 600; elapsed += 20) {
      clock = new Date(clock.getTime() + 20 * MINUTE);
      if (clock.getTime() >= session.absoluteExpiresAt.getTime()) break;
      expect(await sessions.authenticate(secret, attribution())).toMatchObject({
        outcome: 'valid',
      });
    }
    clock = new Date(session.absoluteExpiresAt.getTime() - 19 * MINUTE);
    expect(await sessions.authenticate(secret, attribution())).toMatchObject({
      outcome: 'valid',
      session: { idleExpiresAt: session.absoluteExpiresAt },
    });
    expect((await row(session.id)).idleExpiresAt).toEqual(session.absoluteExpiresAt);
    clock = session.absoluteExpiresAt;
    expect(await sessions.authenticate(secret, attribution())).toEqual({ outcome: 'expired' });
  });

  it('lets only one concurrent request touch the same interval', async () => {
    const sessions = service();
    const { secret, session } = await sessions.establish({
      userId: randomUUID(),
      attribution: attribution(),
    });
    clock = new Date(clock.getTime() + 2 * MINUTE);
    const results = await Promise.all(
      Array.from({ length: 8 }, () => sessions.authenticate(secret, attribution())),
    );
    expect(
      results.filter((result) => result.outcome === 'valid' && result.revalidation === 'refreshed'),
    ).toHaveLength(1);
    expect(results.every((result) => result.outcome === 'valid')).toBe(true);
    expect((await row(session.id)).lastSeenAt).toEqual(clock);
  });

  it('cannot accept or slide a session revoked while its touch waits on a row lock', async () => {
    const sessions = service();
    const { secret, session } = await sessions.establish({
      userId: randomUUID(),
      attribution: attribution(),
    });
    clock = new Date(clock.getTime() + 2 * MINUTE);
    const marker = `hold_${randomUUID().replaceAll('-', '')}`;
    const held = postgres.sql(`BEGIN;
      UPDATE auth_session SET revoked_at = '2026-09-23T12:01:00Z', revocation_reason = 'LOGOUT'
      WHERE id = '${session.id}';
      SELECT pg_sleep(1.5) AS ${marker}; COMMIT;`);
    let sleeping = false;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      sleeping =
        (await postgres.sql(
          `SELECT count(*) FROM pg_stat_activity WHERE query LIKE '%AS ${marker}%' AND wait_event = 'PgSleep'`,
        )) === '1';
      if (sleeping) break;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    expect(sleeping).toBe(true);
    const pending = sessions.authenticate(secret, attribution());
    await held;
    expect(await pending).toEqual({ outcome: 'invalid' });
    expect((await row(session.id)).idleExpiresAt).toEqual(session.idleExpiresAt);
  });

  it('refuses expired or revoked touches and never revives their cookies', async () => {
    const sessions = service();
    const expired = await sessions.establish({ userId: randomUUID(), attribution: attribution() });
    clock = expired.session.idleExpiresAt;
    expect(await sessions.authenticate(expired.secret, attribution())).toEqual({
      outcome: 'expired',
    });
    expect(
      await store().touchLocal({
        id: expired.session.id,
        now: clock,
        seenBefore: clock,
        idleExpiresAt: new Date(clock.getTime() + 30 * MINUTE),
      }),
    ).toBe(false);
    const live = await sessions.establish({ userId: randomUUID(), attribution: attribution() });
    expect(await sessions.revoke(live.session, 'LOGOUT', attribution())).toBe(true);
    expect(await sessions.revoke(live.session, 'LOGOUT', attribution())).toBe(false);
    expect(await sessions.authenticate(live.secret, attribution())).toEqual({ outcome: 'invalid' });
    expect(
      await store().touchLocal({
        id: live.session.id,
        now: clock,
        seenBefore: clock,
        idleExpiresAt: new Date(clock.getTime() + 30 * MINUTE),
      }),
    ).toBe(false);
    expect(await auditActions()).toEqual([
      'iam.session.established',
      'iam.session.established',
      'iam.session.revoked',
    ]);
  });

  it('rolls revocation back when Audit append fails', async () => {
    const sessions = service();
    const { secret, session } = await sessions.establish({
      userId: randomUUID(),
      attribution: attribution(),
    });
    const failing = createSessionStore(database, {
      auditRecorderFor: () => ({
        append: async () => {
          throw new Error('audit append failed');
        },
      }),
    });
    await expect(
      failing.revoke({ id: session.id, reason: 'LOGOUT', now: clock, attribution: attribution() }),
    ).rejects.toThrow('audit append failed');
    expect(await sessions.authenticate(secret, attribution())).toMatchObject({ outcome: 'valid' });
  });

  it('revokes all live sessions of one user without touching others', async () => {
    const sessions = service();
    const alice = randomUUID();
    const first = await sessions.establish({ userId: alice, attribution: attribution() });
    const second = await sessions.establish({ userId: alice, attribution: attribution() });
    const bob = await sessions.establish({ userId: randomUUID(), attribution: attribution() });
    expect(await sessions.revokeUserSessions(alice, 'ACCESS_REVOKED', attribution())).toBe(2);
    expect(await sessions.revokeUserSessions(alice, 'ACCESS_REVOKED', attribution())).toBe(0);
    expect(await sessions.authenticate(first.secret, attribution())).toEqual({
      outcome: 'invalid',
    });
    expect(await sessions.authenticate(second.secret, attribution())).toEqual({
      outcome: 'invalid',
    });
    expect(await sessions.authenticate(bob.secret, attribution())).toMatchObject({
      outcome: 'valid',
    });
  });

  it('binds a CSRF token to its own session', async () => {
    const sessions = service();
    const first = await sessions.establish({ userId: randomUUID(), attribution: attribution() });
    const second = await sessions.establish({ userId: randomUUID(), attribution: attribution() });
    const lookup = await sessions.authenticate(first.secret, attribution());
    if (lookup.outcome !== 'valid') throw new Error('valid session expected');
    expect(sessions.verifyCsrf(lookup.session, sessions.csrfToken(first.secret))).toBe(true);
    expect(sessions.verifyCsrf(lookup.session, sessions.csrfToken(second.secret))).toBe(false);
    expect(sessions.verifyCsrf(lookup.session, first.secret)).toBe(false);
  });

  it('discards expired legacy tokens and old login attempts without decrypting them', async () => {
    const sessions = service();
    const old = await sessions.establish({ userId: randomUUID(), attribution: attribution() });
    await authPersistenceOf(database).authSession.update({
      where: { id: old.session.id },
      data: {
        idpSessionId: 'retired',
        refreshTokenCiphertext: 'sealed',
        refreshTokenKeyVersion: 1,
      },
    });
    await authPersistenceOf(database).authLoginAttempt.create({
      data: {
        handleHash: hashSecret(newSecret()),
        state: 'old',
        nonce: 'old',
        codeVerifier: 'old',
        createdAt: clock,
        expiresAt: new Date(clock.getTime() + MINUTE),
      },
    });
    clock = new Date(clock.getTime() + 31 * MINUTE);
    expect(await sessions.housekeep()).toMatchObject({
      loginAttemptsDeleted: 1,
      sessionTokensDiscarded: 1,
      sessionsPurged: 0,
    });
    expect(await row(old.session.id)).toMatchObject({
      refreshTokenCiphertext: null,
      refreshTokenKeyVersion: null,
    });
    expect(await sessions.authenticate(old.secret, attribution())).toEqual({ outcome: 'invalid' });
  });

  describe('legacy-state housekeeping under retention and load', () => {
    const DAY = 24 * 60 * MINUTE;
    async function insertLegacySessions(count: number, idleAt: Date, label: string): Promise<void> {
      await postgres.sql(`INSERT INTO auth_session (token_hash, csrf_token_hash, user_id, idp_session_id,
          created_at, last_seen_at, idle_expires_at, absolute_expires_at, id_token_ciphertext,
          id_token_key_version, refresh_token_ciphertext, refresh_token_key_version)
        SELECT substr(md5('${label}-t-' || i) || md5('${label}-u-' || i), 1, 43),
          substr(md5('${label}-c-' || i) || md5('${label}-d-' || i), 1, 43), gen_random_uuid(),
          '${label}-' || i, ts - interval '10 minutes', ts - interval '10 minutes', ts,
          ts + interval '1 hour', 'sealed-id', 1, 'sealed-refresh', 1
        FROM generate_series(1, ${count}) AS i, (SELECT '${idleAt.toISOString()}'::timestamptz AS ts) AS t`);
    }
    async function waitForCleanupLock(): Promise<void> {
      for (let attempt = 0; attempt < 100; attempt += 1) {
        const waiting = Number(
          await postgres.sql(
            "SELECT count(*) FROM pg_stat_activity WHERE wait_event_type = 'Lock' AND query LIKE 'UPDATE auth_session%'",
          ),
        );
        if (waiting > 0) return;
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      throw new Error('housekeeping never waited on the held session row');
    }

    it('purges only rows beyond retention while keeping durable Audit evidence', async () => {
      const sessions = service();
      const old = await sessions.establish({ userId: randomUUID(), attribution: attribution() });
      clock = new Date(clock.getTime() + 10 * MINUTE);
      await sessions.revoke(old.session, 'LOGOUT', attribution());
      const recent = await sessions.establish({ userId: randomUUID(), attribution: attribution() });
      clock = new Date(clock.getTime() + 30 * DAY + 20 * MINUTE);
      expect(await sessions.housekeep()).toMatchObject({ sessionsPurged: 1 });
      expect(
        await authPersistenceOf(database).authSession.findMany({ select: { id: true } }),
      ).toEqual([{ id: recent.session.id }]);
      expect(await auditActions()).toEqual([
        'iam.session.established',
        'iam.session.revoked',
        'iam.session.established',
      ]);
      clock = new Date(clock.getTime() + 20 * MINUTE);
      expect((await sessions.housekeep()).sessionsPurged).toBe(1);
    });

    it('cleans a legacy-token backlog in bounded batches without touching live rows', async () => {
      const count = HOUSEKEEPING_BATCH * 2 + 50;
      await insertLegacySessions(count, new Date(clock.getTime() - MINUTE), 'backlog');
      await insertLegacySessions(3, new Date(clock.getTime() + 30 * MINUTE), 'live');
      expect(await service().housekeep()).toMatchObject({
        loginAttemptsDeleted: 0,
        sessionTokensDiscarded: count,
        sessionsPurged: 0,
      });
      expect(
        await postgres.sql(
          'SELECT count(*) FROM auth_session WHERE id_token_ciphertext IS NOT NULL OR refresh_token_ciphertext IS NOT NULL',
        ),
      ).toBe('3');
    });

    it('retries an interrupted legacy-token sweep window', async () => {
      const sessions = service();
      await sessions.housekeep();
      const count = HOUSEKEEPING_BATCH * 2 + 50;
      await insertLegacySessions(count, new Date(clock.getTime() + MINUTE), 'window');
      clock = new Date(clock.getTime() + 120 * MINUTE);
      const marker = `hold_${randomUUID().replaceAll('-', '')}`;
      const held = postgres.sql(`BEGIN;
        UPDATE auth_session SET id_token_ciphertext = NULL, id_token_key_version = NULL,
          refresh_token_ciphertext = NULL, refresh_token_key_version = NULL
          WHERE idp_session_id = 'window-1';
        SELECT pg_sleep(1.5) AS ${marker}; COMMIT;`);
      let sleeping = false;
      for (let attempt = 0; attempt < 100; attempt += 1) {
        sleeping =
          (await postgres.sql(
            `SELECT count(*) FROM pg_stat_activity WHERE query LIKE '%AS ${marker}%' AND wait_event = 'PgSleep'`,
          )) === '1';
        if (sleeping) break;
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      expect(sleeping).toBe(true);
      const cut = sessions.housekeep();
      await waitForCleanupLock();
      await held;
      expect((await cut).sessionTokensDiscarded).toBe(HOUSEKEEPING_BATCH - 1);
      clock = new Date(clock.getTime() + MINUTE);
      expect((await sessions.housekeep()).sessionTokensDiscarded).toBe(count - HOUSEKEEPING_BATCH);
      expect(
        await postgres.sql(
          'SELECT count(*) FROM auth_session WHERE id_token_ciphertext IS NOT NULL OR refresh_token_ciphertext IS NOT NULL',
        ),
      ).toBe('0');
    });

    it('rechecks a row after a concurrent update makes its legacy tokens unexpired', async () => {
      await insertLegacySessions(1, new Date(clock.getTime() - MINUTE), 'racing');
      const id = await postgres.sql(
        "SELECT id FROM auth_session WHERE idp_session_id = 'racing-1'",
      );
      const future = new Date(clock.getTime() + 30 * MINUTE);
      const marker = `hold_${randomUUID().replaceAll('-', '')}`;
      const held = postgres.sql(`BEGIN;
        UPDATE auth_session SET idle_expires_at = '${future.toISOString()}'
          WHERE id = '${id}';
        SELECT pg_sleep(1.5) AS ${marker}; COMMIT;`);
      let sleeping = false;
      for (let attempt = 0; attempt < 100; attempt += 1) {
        sleeping =
          (await postgres.sql(
            `SELECT count(*) FROM pg_stat_activity WHERE query LIKE '%AS ${marker}%' AND wait_event = 'PgSleep'`,
          )) === '1';
        if (sleeping) break;
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      expect(sleeping).toBe(true);
      const pending = store().housekeep({
        now: clock,
        tokensExpiredAfter: new Date(0),
        purgeBefore: new Date(0),
      });
      await waitForCleanupLock();
      await held;
      expect((await pending).sessionTokensDiscarded).toBe(0);
      expect((await row(id)).refreshTokenCiphertext).toBe('sealed-refresh');
    });
  });

  describe('retained database invariants', () => {
    const hash = () => hashSecret(newSecret());
    const sessionInsert = (overrides: Record<string, string> = {}) => {
      const columns = {
        token_hash: `'${hash()}'`,
        csrf_token_hash: `'${hash()}'`,
        user_id: `'${randomUUID()}'`,
        created_at: `'2026-09-23T12:00:00Z'`,
        last_seen_at: `'2026-09-23T12:00:00Z'`,
        idle_expires_at: `'2026-09-23T12:30:00Z'`,
        absolute_expires_at: `'2026-09-23T22:00:00Z'`,
        ...overrides,
      };
      return `INSERT INTO auth_session (${Object.keys(columns).join(', ')})
        VALUES (${Object.values(columns).join(', ')})`;
    };
    const cases: Array<[string, Record<string, string>]> = [
      ['auth_session_token_hash_ck', { token_hash: `'${newSecret()}=='` }],
      ['auth_session_csrf_token_hash_ck', { csrf_token_hash: `'not-a-digest'` }],
      ['auth_session_expiry_ck', { idle_expires_at: `'2026-09-23T23:00:00Z'` }],
      ['auth_session_lifetime_ck', { idle_expires_at: `'2026-09-23T12:00:00Z'` }],
      ['auth_session_revocation_ck', { revoked_at: `'2026-09-23T12:05:00Z'` }],
      ['auth_session_revocation_ck', { revocation_reason: `'LOGOUT'` }],
      ['auth_session_id_token_ck', { id_token_ciphertext: `'sealed'` }],
      ['auth_session_id_token_ck', { id_token_ciphertext: `'sealed'`, id_token_key_version: '0' }],
      ['auth_session_refresh_token_ck', { refresh_token_key_version: '1' }],
      [
        'auth_session_refresh_token_ck',
        { refresh_token_ciphertext: `'sealed'`, refresh_token_key_version: '0' },
      ],
      ['auth_session_idp_session_id_ck', { idp_session_id: `''` }],
      [
        'auth_session_token_ciphertext_ck',
        { id_token_ciphertext: `''`, id_token_key_version: '1' },
      ],
      [
        'auth_session_token_ciphertext_ck',
        { refresh_token_ciphertext: `''`, refresh_token_key_version: '1' },
      ],
    ];
    for (const [constraint, values] of cases) {
      it(`rejects a row violating ${constraint}`, async () => {
        await expect(postgres.sql(sessionInsert(values))).rejects.toThrow(
          new RegExp(`violates check constraint "${constraint}"`),
        );
      });
    }

    it('retains login-attempt constraints and unique hashes for historical cleanup', async () => {
      const attemptInsert = (overrides: Record<string, string> = {}) => {
        const columns = {
          handle_hash: `'${hash()}'`,
          state: `'state-value'`,
          nonce: `'nonce-value'`,
          code_verifier: `'verifier-value'`,
          created_at: `'2026-09-23T12:00:00Z'`,
          expires_at: `'2026-09-23T12:10:00Z'`,
          ...overrides,
        };
        return `INSERT INTO auth_login_attempt (${Object.keys(columns).join(', ')})
          VALUES (${Object.values(columns).join(', ')})`;
      };
      const invalid: Array<[string, Record<string, string>]> = [
        ['auth_login_attempt_handle_hash_ck', { handle_hash: `'${newSecret()}=='` }],
        ['auth_login_attempt_expiry_ck', { expires_at: `'2026-09-23T12:00:00Z'` }],
        ['auth_login_attempt_secrets_ck', { state: `''` }],
        ['auth_login_attempt_secrets_ck', { nonce: `''` }],
        ['auth_login_attempt_secrets_ck', { code_verifier: `''` }],
      ];
      for (const [constraint, values] of invalid) {
        await expect(postgres.sql(attemptInsert(values))).rejects.toThrow(
          new RegExp(`violates check constraint "${constraint}"`),
        );
      }
      const handle = hash();
      await postgres.sql(attemptInsert({ handle_hash: `'${handle}'` }));
      await expect(postgres.sql(attemptInsert({ handle_hash: `'${handle}'` }))).rejects.toThrow(
        /auth_login_attempt_handle_hash_key/,
      );
      const token = hash();
      await postgres.sql(sessionInsert({ token_hash: `'${token}'` }));
      await expect(postgres.sql(sessionInsert({ token_hash: `'${token}'` }))).rejects.toThrow(
        /auth_session_token_hash_key/,
      );
    });

    it('keeps revocation final at the database boundary', async () => {
      const sessions = service();
      const { session } = await sessions.establish({
        userId: randomUUID(),
        attribution: attribution(),
      });
      await sessions.revoke(session, 'LOGOUT', attribution());
      for (const change of [
        'revoked_at = NULL, revocation_reason = NULL',
        `revoked_at = revoked_at + interval '1 minute'`,
        `revocation_reason = 'ACCESS_REVOKED'`,
      ]) {
        await expect(
          postgres.sql(`UPDATE auth_session SET ${change} WHERE id = '${session.id}'`),
        ).rejects.toThrow(/auth_session_revocation_final/);
      }
    });
  });
});
