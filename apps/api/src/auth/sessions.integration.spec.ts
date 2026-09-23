import { randomUUID } from 'node:crypto';
import { parseSystemProcess, parseTraceId, type AuditAttribution } from '@vertex-os/audit';
import { createAuditRecorder } from '@vertex-os/audit-persistence';
import { createDatabaseClient, type DatabaseClient } from '@vertex-os/database';
import { authPersistenceOf } from '@vertex-os/database/auth';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startMigratedPostgres, type MigratedPostgres } from '../../test-support/postgres.js';
import { csrfTokenFor, hashSecret, newSecret } from './secrets.js';
import { createSessionStore } from './session-store.js';
import { createSessionService, type SessionService } from './sessions.js';
import { createTokenCipher } from './token-cipher.js';

const LIMITS = {
  idleTimeoutSeconds: 1800,
  absoluteTimeoutSeconds: 36000,
  loginAttemptTimeoutSeconds: 600,
};
const MINUTE = 60_000;
const ID_TOKEN = 'eyJhbGciOiJSUzI1NiJ9.sentinel-id-token-payload.signature';

function attribution(): AuditAttribution {
  const process = parseSystemProcess('iam.session-test');
  const traceId = parseTraceId('trace-session-test');
  if (!process.ok || !traceId.ok) throw new Error('attribution fixture');
  return { actor: { type: 'SYSTEM', process: process.value }, traceId: traceId.value };
}

describe('application sessions against real PostgreSQL', () => {
  let postgres: MigratedPostgres;
  let database: DatabaseClient;
  let clock: Date;
  let sessions: SessionService;

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
    sessions = createSessionService({
      store: createSessionStore(database, { auditRecorderFor: createAuditRecorder }),
      cipher: createTokenCipher('sentinel-token-encryption-secret-000000'),
      limits: LIMITS,
      now: () => clock,
    });
  });

  const advance = (ms: number) => {
    clock = new Date(clock.getTime() + ms);
  };
  const userId = () => randomUUID();
  const auth = () => authPersistenceOf(database);

  async function establish(user = userId(), idpSessionId: string | undefined = 'kc-1') {
    return sessions.establish({
      userId: user,
      idpSessionId,
      idToken: ID_TOKEN,
      attribution: attribution(),
    });
  }

  async function auditActions(): Promise<string[]> {
    const output = await postgres.sql(
      "SELECT action || ':' || result FROM audit_record ORDER BY occurred_at, action",
    );
    return output === '' ? [] : output.split('\n');
  }

  it('stores only hashes and the encrypted ID token, with Audit evidence', async () => {
    const { secret, session } = await establish();
    const row = await auth().authSession.findUniqueOrThrow({ where: { id: session.id } });
    expect(row.tokenHash).toBe(hashSecret(secret));
    expect(row.csrfTokenHash).toBe(hashSecret(csrfTokenFor(secret)));
    expect(JSON.stringify(row)).not.toContain(secret);
    expect(JSON.stringify(row)).not.toContain(csrfTokenFor(secret));
    expect(row.idTokenCiphertext).not.toContain('sentinel-id-token');
    expect(row.idTokenKeyVersion).toBe(1);
    expect(row.idleExpiresAt.getTime() - row.createdAt.getTime()).toBe(30 * MINUTE);
    expect(row.absoluteExpiresAt.getTime() - row.createdAt.getTime()).toBe(600 * MINUTE);
    expect(await auditActions()).toEqual(['iam.session.established:SUCCEEDED']);
    const target = await postgres.sql("SELECT target_type || ' / ' || target_id FROM audit_record");
    expect(target).toBe(`iam.user / ${session.userId}`);
  });

  it('rolls the session back when its Audit append fails', async () => {
    const failing = createSessionService({
      store: createSessionStore(database, {
        auditRecorderFor: () => ({
          append: async () => {
            throw new Error('audit append failed');
          },
        }),
      }),
      cipher: createTokenCipher('sentinel-token-encryption-secret-000000'),
      limits: LIMITS,
      now: () => clock,
    });
    await expect(
      failing.establish({
        userId: userId(),
        idpSessionId: undefined,
        idToken: undefined,
        attribution: attribution(),
      }),
    ).rejects.toThrow('audit append failed');
    expect(await auth().authSession.count()).toBe(0);
  });

  it('refuses raw secrets, half revocations and ID tokens on revoked rows', async () => {
    const base = {
      userId: userId(),
      csrfTokenHash: hashSecret(newSecret()),
      createdAt: clock,
      lastSeenAt: clock,
      idleExpiresAt: new Date(clock.getTime() + MINUTE),
      absoluteExpiresAt: new Date(clock.getTime() + 2 * MINUTE),
    };
    await expect(
      auth().authSession.create({ data: { ...base, tokenHash: `${newSecret()}==` } }),
    ).rejects.toThrow();
    await expect(
      auth().authSession.create({
        data: { ...base, tokenHash: hashSecret(newSecret()), revokedAt: clock },
      }),
    ).rejects.toThrow();
    await expect(
      auth().authSession.create({
        data: {
          ...base,
          tokenHash: hashSecret(newSecret()),
          revokedAt: clock,
          revocationReason: 'LOGOUT',
          idTokenCiphertext: 'x',
          idTokenKeyVersion: 1,
        },
      }),
    ).rejects.toThrow();
    await expect(
      auth().authSession.create({
        data: {
          ...base,
          tokenHash: hashSecret(newSecret()),
          idleExpiresAt: new Date(clock.getTime() + 3 * MINUTE),
        },
      }),
    ).rejects.toThrow();
  });

  it('slides the idle deadline while in use, never past the absolute deadline', async () => {
    const { secret } = await establish();
    advance(29 * MINUTE);
    const used = await sessions.authenticate(secret);
    expect(used).toMatchObject({ outcome: 'valid' });
    if (used.outcome !== 'valid') return;
    expect(used.session.idleExpiresAt).toEqual(new Date(clock.getTime() + 30 * MINUTE));

    // Keep it busy until the absolute deadline: the idle deadline is capped there.
    for (let elapsed = 49; elapsed < 600; elapsed += 20) {
      advance(20 * MINUTE);
      expect(await sessions.authenticate(secret)).toMatchObject({ outcome: 'valid' });
    }
    advance(20 * MINUTE);
    expect(await sessions.authenticate(secret)).toEqual({ outcome: 'expired' });
  });

  it('expires at the idle deadline and never revives an expired session', async () => {
    const { secret, session } = await establish();
    advance(30 * MINUTE);
    expect(await sessions.authenticate(secret)).toEqual({ outcome: 'expired' });
    const before = await auth().authSession.findUniqueOrThrow({ where: { id: session.id } });
    await createSessionStore(database, { auditRecorderFor: createAuditRecorder }).touch({
      id: session.id,
      now: clock,
      seenBefore: clock,
      idleExpiresAt: new Date(clock.getTime() + 30 * MINUTE),
    });
    expect(await auth().authSession.findUniqueOrThrow({ where: { id: session.id } })).toEqual(
      before,
    );
    expect(await sessions.authenticate(secret)).toEqual({ outcome: 'expired' });
  });

  it('writes at most once a minute for a busy session', async () => {
    const { secret, session } = await establish();
    advance(30_000);
    await sessions.authenticate(secret);
    const unchanged = await auth().authSession.findUniqueOrThrow({ where: { id: session.id } });
    expect(unchanged.lastSeenAt).toEqual(session.createdAt);
    advance(30_000);
    await sessions.authenticate(secret);
    const touched = await auth().authSession.findUniqueOrThrow({ where: { id: session.id } });
    expect(touched.lastSeenAt).toEqual(clock);
  });

  it('revokes once, discards the ID token, and never accepts the session again', async () => {
    const { secret, session } = await establish();
    const lookup = await sessions.authenticate(secret);
    if (lookup.outcome !== 'valid') throw new Error('valid session expected');
    expect(sessions.idTokenOf(lookup.session)).toBe(ID_TOKEN);

    await expect(sessions.revoke(session, 'LOGOUT', attribution())).resolves.toBe(true);
    await expect(sessions.revoke(session, 'LOGOUT', attribution())).resolves.toBe(false);
    expect(await sessions.authenticate(secret)).toEqual({ outcome: 'invalid' });
    const row = await auth().authSession.findUniqueOrThrow({ where: { id: session.id } });
    expect(row).toMatchObject({
      revocationReason: 'LOGOUT',
      idTokenCiphertext: null,
      idTokenKeyVersion: null,
    });

    // A later touch cannot bring it back.
    await createSessionStore(database, { auditRecorderFor: createAuditRecorder }).touch({
      id: session.id,
      now: clock,
      seenBefore: clock,
      idleExpiresAt: new Date(clock.getTime() + MINUTE),
    });
    expect(await sessions.authenticate(secret)).toEqual({ outcome: 'invalid' });
    expect(await auditActions()).toEqual([
      'iam.session.established:SUCCEEDED',
      'iam.session.revoked:SUCCEEDED',
    ]);
  });

  it('revokes by user and by identity-provider session, only live sessions, one record each', async () => {
    const alice = userId();
    const bob = userId();
    const first = await establish(alice, 'kc-a1');
    const second = await establish(alice, 'kc-a2');
    const bobs = await establish(bob, 'kc-b1');
    const expired = await establish(alice, 'kc-a3');
    await auth().authSession.update({
      where: { id: expired.session.id },
      // Its idle deadline is now: expired, so revocation leaves it alone.
      data: { idleExpiresAt: clock },
    });
    await postgres.sql('TRUNCATE audit_record');

    await expect(
      sessions.revokeIdpSession('kc-a2', 'BACKCHANNEL_LOGOUT', attribution()),
    ).resolves.toBe(1);
    await expect(sessions.revokeUserSessions(alice, 'ACCESS_REVOKED', attribution())).resolves.toBe(
      1,
    );
    await expect(
      sessions.revokeIdpSession('kc-a2', 'BACKCHANNEL_LOGOUT', attribution()),
    ).resolves.toBe(0);

    expect(await sessions.authenticate(first.secret)).toEqual({ outcome: 'invalid' });
    expect(await sessions.authenticate(second.secret)).toEqual({ outcome: 'invalid' });
    expect(await sessions.authenticate(bobs.secret)).toMatchObject({ outcome: 'valid' });
    const reasons = await postgres.sql(
      `SELECT id_token_ciphertext IS NULL, revocation_reason FROM auth_session WHERE user_id = '${alice}' ORDER BY idp_session_id`,
    );
    expect(reasons.split('\n')).toEqual(['t|ACCESS_REVOKED', 't|BACKCHANNEL_LOGOUT', 'f|']);
    expect(await auditActions()).toEqual([
      'iam.session.revoked:SUCCEEDED',
      'iam.session.revoked:SUCCEEDED',
    ]);
  });

  it('discards the ID token of an expired session when it is seen, and in the sign-in sweep', async () => {
    const seen = await establish();
    const unseen = await establish();
    advance(30 * MINUTE);
    expect(await sessions.authenticate(seen.secret)).toEqual({ outcome: 'expired' });
    const tokens = () =>
      postgres.sql(
        `SELECT id_token_ciphertext IS NULL FROM auth_session ORDER BY id = '${seen.session.id}' DESC`,
      );
    expect((await tokens()).split(/\s+/)).toEqual(['t', 'f']);
    await sessions.startLogin({ state: 's', nonce: 'n', codeVerifier: 'v' });
    expect((await tokens()).split(/\s+/)).toEqual(['t', 't']);
    expect(unseen.session.id).not.toBe(seen.session.id);
  });

  it('rolls a revocation back when its Audit append fails', async () => {
    const { secret, session } = await establish();
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
    expect(await sessions.authenticate(secret)).toMatchObject({ outcome: 'valid' });
  });

  it('revokes once under concurrent revocations and touches, and stays revoked', async () => {
    const { secret, session } = await establish();
    advance(2 * MINUTE);
    const results = await Promise.all([
      sessions.revoke(session, 'LOGOUT', attribution()),
      sessions.authenticate(secret),
      sessions.revoke(session, 'LOGOUT', attribution()),
      sessions.revokeUserSessions(session.userId, 'ACCESS_REVOKED', attribution()),
      sessions.authenticate(secret),
    ]);
    const revocations = [results[0], results[2], results[3] === 1];
    expect(revocations.filter(Boolean)).toHaveLength(1);
    expect(await sessions.authenticate(secret)).toEqual({ outcome: 'invalid' });
    expect(
      (await auditActions()).filter((action) => action.startsWith('iam.session.revoked')),
    ).toHaveLength(1);
  });

  it('checks the CSRF token of the same session only', async () => {
    const first = await establish();
    const second = await establish();
    const lookup = await sessions.authenticate(first.secret);
    if (lookup.outcome !== 'valid') throw new Error('valid session expected');
    expect(sessions.verifyCsrf(lookup.session, sessions.csrfToken(first.secret))).toBe(true);
    expect(sessions.verifyCsrf(lookup.session, sessions.csrfToken(second.secret))).toBe(false);
    expect(sessions.verifyCsrf(lookup.session, first.secret)).toBe(false);
    expect(sessions.verifyCsrf(lookup.session, undefined)).toBe(false);
  });

  describe('login attempts', () => {
    const secrets = { state: 'state-1', nonce: 'nonce-1', codeVerifier: 'verifier-1' };

    it('are consumed exactly once, even by concurrent callbacks', async () => {
      const handle = await sessions.startLogin(secrets);
      const results = await Promise.all(
        Array.from({ length: 8 }, () => sessions.finishLogin(handle)),
      );
      expect(results.filter((result) => result.outcome === 'found')).toEqual([
        { outcome: 'found', ...secrets },
      ]);
      expect(results.filter((result) => result.outcome === 'missing')).toHaveLength(7);
      expect(await auth().authLoginAttempt.count()).toBe(0);
    });

    it('expire, are removed when used late, and old ones are purged by new attempts', async () => {
      const late = await sessions.startLogin(secrets);
      const abandoned = await sessions.startLogin(secrets);
      advance(10 * MINUTE);
      await expect(sessions.finishLogin(late)).resolves.toEqual({ outcome: 'expired' });
      await sessions.startLogin(secrets);
      expect(await auth().authLoginAttempt.count()).toBe(1);
      await expect(sessions.finishLogin(abandoned)).resolves.toEqual({ outcome: 'missing' });
    });

    it('store only the hash of the browser handle', async () => {
      const handle = await sessions.startLogin(secrets);
      const [row] = await auth().authLoginAttempt.findMany();
      expect(row?.handleHash).toBe(hashSecret(handle));
      expect(JSON.stringify(row)).not.toContain(handle);
      await expect(sessions.finishLogin('not-a-handle')).resolves.toEqual({ outcome: 'missing' });
    });
  });
});
