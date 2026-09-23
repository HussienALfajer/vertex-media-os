import { randomUUID } from 'node:crypto';
import { parseSystemProcess, parseTraceId, type AuditAttribution } from '@vertex-os/audit';
import { createAuditRecorder } from '@vertex-os/audit-persistence';
import { createDatabaseClient, type DatabaseClient } from '@vertex-os/database';
import { authPersistenceOf } from '@vertex-os/database/auth';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startMigratedPostgres, type MigratedPostgres } from '../../test-support/postgres.js';
import type { OidcResult, RefreshedSession } from './oidc.js';
import { csrfTokenFor, hashSecret, newSecret } from './secrets.js';
import { createSessionStore } from './session-store.js';
import { createSessionService, type SessionService } from './sessions.js';
import { createTokenCiphers } from './token-cipher.js';

const LIMITS = {
  idleTimeoutSeconds: 1800,
  absoluteTimeoutSeconds: 36000,
  loginAttemptTimeoutSeconds: 600,
};
const MINUTE = 60_000;
const ENCRYPTION_SECRET = 'sentinel-token-encryption-secret-000000';
const ID_TOKEN = 'eyJhbGciOiJSUzI1NiJ9.sentinel-id-token-payload.signature';
const REFRESH_TOKEN = 'eyJhbGciOiJIUzUxMiJ9.sentinel-refresh-token-payload.signature';

function attribution(): AuditAttribution {
  const process = parseSystemProcess('iam.session-test');
  const traceId = parseTraceId('trace-session-test');
  if (!process.ok || !traceId.ok) throw new Error('attribution fixture');
  return { actor: { type: 'SYSTEM', process: process.value }, traceId: traceId.value };
}

/** Resolves once `ready()` holds, polling briefly; used to hold a refresh while others run. */
async function until(ready: () => boolean): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (!ready() && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 10));
}

describe('application sessions against real PostgreSQL', () => {
  let postgres: MigratedPostgres;
  let database: DatabaseClient;
  let clock: Date;
  let sessions: SessionService;
  /** Every refresh the session service asked the identity provider for, in order. */
  let refreshes: Array<{
    refreshToken: string;
    idpSessionId: string | undefined;
    idToken: string | undefined;
  }>;
  /** The identity provider's answer to the n-th refresh (1-based). */
  let answer: (n: number) => Promise<OidcResult<RefreshedSession>>;

  const rotated = async (n: number): Promise<OidcResult<RefreshedSession>> => ({
    ok: true,
    value: { refreshToken: `${REFRESH_TOKEN}-rotated-${n}`, idToken: undefined },
  });

  function service(
    store = createSessionStore(database, { auditRecorderFor: createAuditRecorder }),
  ) {
    return createSessionService({
      store,
      ciphers: createTokenCiphers(ENCRYPTION_SECRET),
      provider: {
        refreshSession: async (input) => {
          refreshes.push(input);
          return answer(refreshes.length);
        },
      },
      limits: LIMITS,
      now: () => clock,
    });
  }

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
    refreshes = [];
    answer = rotated;
    sessions = service();
  });

  const advance = (ms: number) => {
    clock = new Date(clock.getTime() + ms);
  };
  const userId = () => randomUUID();
  const auth = () => authPersistenceOf(database);
  const authenticate = (secret: string) => sessions.authenticate(secret, attribution());
  const row = (id: string) => auth().authSession.findUniqueOrThrow({ where: { id } });

  async function establish(user = userId(), idpSessionId: string | undefined = 'kc-1') {
    return sessions.establish({
      userId: user,
      idpSessionId,
      idToken: ID_TOKEN,
      refreshToken: REFRESH_TOKEN,
      attribution: attribution(),
    });
  }

  async function auditActions(): Promise<string[]> {
    const output = await postgres.sql(
      "SELECT action || ':' || result FROM audit_record ORDER BY occurred_at, action",
    );
    return output === '' ? [] : output.split('\n');
  }

  it('stores only hashes and the encrypted tokens, each under its own key, with Audit evidence', async () => {
    const { secret, session } = await establish();
    const stored = await row(session.id);
    expect(stored.tokenHash).toBe(hashSecret(secret));
    expect(stored.csrfTokenHash).toBe(hashSecret(csrfTokenFor(secret)));
    expect(JSON.stringify(stored)).not.toContain(secret);
    expect(JSON.stringify(stored)).not.toContain(csrfTokenFor(secret));
    expect(JSON.stringify(stored)).not.toContain('sentinel-id-token');
    expect(JSON.stringify(stored)).not.toContain('sentinel-refresh-token');
    expect(stored).toMatchObject({ idTokenKeyVersion: 1, refreshTokenKeyVersion: 1 });
    const ciphers = createTokenCiphers(ENCRYPTION_SECRET);
    expect(ciphers.refreshToken.decrypt(stored.refreshTokenCiphertext ?? '', 1, session.id)).toBe(
      REFRESH_TOKEN,
    );
    // One token's ciphertext never decrypts as the other (IAM-R03F D-06).
    expect(ciphers.idToken.decrypt(stored.refreshTokenCiphertext ?? '', 1, session.id)).toBe(
      undefined,
    );
    expect(stored.idleExpiresAt.getTime() - stored.createdAt.getTime()).toBe(30 * MINUTE);
    expect(stored.absoluteExpiresAt.getTime() - stored.createdAt.getTime()).toBe(600 * MINUTE);
    expect(await auditActions()).toEqual(['iam.session.established:SUCCEEDED']);
    const target = await postgres.sql("SELECT target_type || ' / ' || target_id FROM audit_record");
    expect(target).toBe(`iam.user / ${session.userId}`);
  });

  it('rolls the session back when its Audit append fails', async () => {
    const failing = service(
      createSessionStore(database, {
        auditRecorderFor: () => ({
          append: async () => {
            throw new Error('audit append failed');
          },
        }),
      }),
    );
    await expect(
      failing.establish({
        userId: userId(),
        idpSessionId: undefined,
        idToken: undefined,
        refreshToken: undefined,
        attribution: attribution(),
      }),
    ).rejects.toThrow('audit append failed');
    expect(await auth().authSession.count()).toBe(0);
  });

  it('refuses raw secrets, half revocations and tokens on revoked rows', async () => {
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

    // The refresh token (IAM-R03F D-06): only with its key version, never on a revoked row.
    const { session } = await establish();
    await expect(
      postgres.sql(
        `UPDATE auth_session SET refresh_token_key_version = NULL WHERE id = '${session.id}'`,
      ),
    ).rejects.toThrow(/auth_session_refresh_token_ck/);
    await expect(
      postgres.sql(
        `UPDATE auth_session SET refresh_token_key_version = 0 WHERE id = '${session.id}'`,
      ),
    ).rejects.toThrow(/auth_session_refresh_token_ck/);
    await expect(
      postgres.sql(
        `UPDATE auth_session SET revoked_at = created_at, revocation_reason = 'LOGOUT',
           id_token_ciphertext = NULL, id_token_key_version = NULL WHERE id = '${session.id}'`,
      ),
    ).rejects.toThrow(/auth_session_refresh_token_ck/);
  });

  describe('re-validation against the identity provider (IAM-R03F)', () => {
    it('slides the idle deadline after each refresh, never past the absolute deadline', async () => {
      const { secret } = await establish();
      advance(29 * MINUTE);
      const used = await authenticate(secret);
      expect(used).toMatchObject({ outcome: 'valid', revalidation: 'refreshed' });
      if (used.outcome !== 'valid') return;
      expect(used.session.idleExpiresAt).toEqual(new Date(clock.getTime() + 30 * MINUTE));

      // Keep it busy until the absolute deadline: the idle deadline is capped there.
      for (let elapsed = 49; elapsed < 600; elapsed += 20) {
        advance(20 * MINUTE);
        expect(await authenticate(secret)).toMatchObject({ outcome: 'valid' });
      }
      advance(20 * MINUTE);
      expect(await authenticate(secret)).toEqual({ outcome: 'expired' });
    });

    it('calls the provider and writes at most once a minute, with the rotated token each time', async () => {
      const { secret, session } = await establish();
      advance(30_000);
      expect(await authenticate(secret)).toMatchObject({ revalidation: 'not-due' });
      expect(refreshes).toEqual([]);
      expect((await row(session.id)).lastSeenAt).toEqual(session.createdAt);

      advance(30_000);
      expect(await authenticate(secret)).toMatchObject({ revalidation: 'refreshed' });
      advance(MINUTE);
      expect(await authenticate(secret)).toMatchObject({ revalidation: 'refreshed' });
      expect(refreshes).toEqual([
        // The session's current ID token goes along, so the refreshed one is bound to its subject.
        { refreshToken: REFRESH_TOKEN, idpSessionId: 'kc-1', idToken: ID_TOKEN },
        { refreshToken: `${REFRESH_TOKEN}-rotated-1`, idpSessionId: 'kc-1', idToken: ID_TOKEN },
      ]);
      const stored = await row(session.id);
      expect(stored.lastSeenAt).toEqual(clock);
      expect(
        createTokenCiphers(ENCRYPTION_SECRET).refreshToken.decrypt(
          stored.refreshTokenCiphertext ?? '',
          1,
          session.id,
        ),
      ).toBe(`${REFRESH_TOKEN}-rotated-2`);
    });

    it('keeps the refreshed ID token for the logout hint', async () => {
      answer = async (n) => ({
        ok: true,
        value: { refreshToken: `${REFRESH_TOKEN}-${n}`, idToken: `${ID_TOKEN}.refreshed-${n}` },
      });
      const { secret } = await establish();
      advance(MINUTE);
      const lookup = await authenticate(secret);
      if (lookup.outcome !== 'valid') throw new Error('valid session expected');
      expect(sessions.idTokenOf(lookup.session)).toBe(`${ID_TOKEN}.refreshed-1`);
      const again = await authenticate(secret);
      if (again.outcome !== 'valid') throw new Error('valid session expected');
      expect(sessions.idTokenOf(again.session)).toBe(`${ID_TOKEN}.refreshed-1`);
    });

    it('revokes the session, with Audit evidence, when the provider refuses the refresh', async () => {
      answer = async () => ({ ok: false, failure: 'rejected', code: 'OAUTH_RESPONSE_BODY_ERROR' });
      const { secret, session } = await establish();
      advance(MINUTE);
      expect(await authenticate(secret)).toEqual({ outcome: 'ended' });
      expect(await row(session.id)).toMatchObject({
        revocationReason: 'PROVIDER_SESSION_ENDED',
        idTokenCiphertext: null,
        refreshTokenCiphertext: null,
        refreshTokenKeyVersion: null,
      });
      expect(await auditActions()).toEqual([
        'iam.session.established:SUCCEEDED',
        'iam.session.revoked:SUCCEEDED',
      ]);
      expect(
        await postgres.sql(
          "SELECT actor_process || ' ' || (change->'after'->>'reason') FROM audit_record WHERE action = 'iam.session.revoked'",
        ),
      ).toBe('iam.session-test PROVIDER_SESSION_ENDED');
      advance(MINUTE);
      expect(await authenticate(secret)).toEqual({ outcome: 'invalid' });
      expect(refreshes).toHaveLength(1);
    });

    it('keeps the deadline without sliding it while the provider is unavailable', async () => {
      answer = async () => ({ ok: false, failure: 'unavailable' });
      const { secret, session } = await establish();
      advance(MINUTE);
      expect(await authenticate(secret)).toMatchObject({
        outcome: 'valid',
        revalidation: 'unavailable',
        session: { idleExpiresAt: session.idleExpiresAt },
      });
      advance(MINUTE);
      expect(await authenticate(secret)).toMatchObject({ revalidation: 'unavailable' });
      expect(refreshes).toHaveLength(2);
      expect((await row(session.id)).idleExpiresAt).toEqual(session.idleExpiresAt);

      // The outage ends the session at its unchanged idle deadline, not later.
      advance(28 * MINUTE);
      expect(await authenticate(secret)).toEqual({ outcome: 'expired' });
      expect((await row(session.id)).refreshTokenCiphertext).toBeNull();
    });

    it('never slides a session that has no refresh token', async () => {
      const { secret, session } = await sessions.establish({
        userId: userId(),
        idpSessionId: 'kc-1',
        idToken: ID_TOKEN,
        refreshToken: undefined,
        attribution: attribution(),
      });
      advance(2 * MINUTE);
      expect(await authenticate(secret)).toMatchObject({
        outcome: 'valid',
        revalidation: 'unsupported',
        session: { idleExpiresAt: session.idleExpiresAt },
      });
      expect(refreshes).toEqual([]);
      advance(28 * MINUTE);
      expect(await authenticate(secret)).toEqual({ outcome: 'expired' });
    });

    it('refreshes once for concurrent requests, while the others use the stored deadline', async () => {
      let release!: () => void;
      const gate = new Promise<void>((resolve) => (release = resolve));
      answer = async (n) => {
        await gate;
        return rotated(n);
      };
      const { secret, session } = await establish();
      advance(2 * MINUTE);
      let settled = 0;
      const runs = Array.from({ length: 8 }, () =>
        authenticate(secret).finally(() => {
          settled += 1;
        }),
      );
      // Every other request finishes while the one refresh is still waiting on the provider.
      await until(() => settled === 7);
      expect(settled).toBe(7);
      release();
      const results = await Promise.all(runs);
      expect(refreshes).toHaveLength(1);
      expect(
        results.map((result) => (result as { revalidation?: string }).revalidation).sort(),
      ).toEqual([
        'not-due',
        'not-due',
        'not-due',
        'not-due',
        'not-due',
        'not-due',
        'not-due',
        'refreshed',
      ]);
      expect((await row(session.id)).idleExpiresAt).toEqual(
        new Date(clock.getTime() + 30 * MINUTE),
      );
    });

    it('does not revive or re-arm a session revoked while the provider answers', async () => {
      let release!: () => void;
      const gate = new Promise<void>((resolve) => (release = resolve));
      answer = async (n) => {
        await gate;
        return rotated(n);
      };
      const { secret, session } = await establish();
      advance(2 * MINUTE);
      const pending = authenticate(secret);
      await until(() => refreshes.length === 1);
      await expect(sessions.revoke(session, 'LOGOUT', attribution())).resolves.toBe(true);
      release();
      expect(await pending).toEqual({ outcome: 'invalid' });
      expect(await row(session.id)).toMatchObject({
        revocationReason: 'LOGOUT',
        idleExpiresAt: session.idleExpiresAt,
        refreshTokenCiphertext: null,
        idTokenCiphertext: null,
      });
    });
  });

  it('expires at the idle deadline and never revives an expired session', async () => {
    const { secret, session } = await establish();
    advance(30 * MINUTE);
    // The store refuses an expired row on its own, even with the current claim and token.
    const before = await row(session.id);
    const store = createSessionStore(database, { auditRecorderFor: createAuditRecorder });
    await expect(
      store.claimRevalidation({ id: session.id, now: clock, seenBefore: clock }),
    ).resolves.toBe(false);
    await expect(
      store.applyRevalidation({
        id: session.id,
        now: clock,
        claimedAt: before.lastSeenAt,
        replaces: String(before.refreshTokenCiphertext),
        idleExpiresAt: new Date(clock.getTime() + 30 * MINUTE),
        tokens: { refreshToken: { ciphertext: 'sealed', keyVersion: 1 } },
      }),
    ).resolves.toBe(false);
    expect(await row(session.id)).toEqual(before);
    expect(await authenticate(secret)).toEqual({ outcome: 'expired' });
    expect(refreshes).toEqual([]);
  });

  it('does not re-arm a session whose tokens were discarded between claim and apply', async () => {
    const { session } = await establish();
    const deadline = session.idleExpiresAt.getTime();
    const stored = await row(session.id);
    const store = createSessionStore(database, { auditRecorderFor: createAuditRecorder });
    const claimedAt = new Date(deadline - 5);
    await expect(
      store.claimRevalidation({ id: session.id, now: claimedAt, seenBefore: claimedAt }),
    ).resolves.toBe(true);
    // Another request, with a slightly later clock, sees the session expired and discards its tokens.
    await store.discardExpiredTokens({ id: session.id, now: new Date(deadline + 1) });
    const discarded = await row(session.id);
    expect(discarded).toMatchObject({ refreshTokenCiphertext: null, idTokenCiphertext: null });
    // The refresher's apply, with the earlier clock, must not bring the tokens or a deadline back.
    await expect(
      store.applyRevalidation({
        id: session.id,
        now: new Date(deadline - 1),
        claimedAt,
        replaces: String(stored.refreshTokenCiphertext),
        idleExpiresAt: new Date(claimedAt.getTime() + 30 * MINUTE),
        tokens: { refreshToken: { ciphertext: 'sealed', keyVersion: 1 } },
      }),
    ).resolves.toBe(false);
    expect(await row(session.id)).toEqual(discarded);
  });

  it('revokes once, discards the tokens, and never accepts the session again', async () => {
    const { secret, session } = await establish();
    const live = await row(session.id);
    const lookup = await authenticate(secret);
    if (lookup.outcome !== 'valid') throw new Error('valid session expected');
    expect(sessions.idTokenOf(lookup.session)).toBe(ID_TOKEN);

    await expect(sessions.revoke(session, 'LOGOUT', attribution())).resolves.toBe(true);
    await expect(sessions.revoke(session, 'LOGOUT', attribution())).resolves.toBe(false);
    expect(await authenticate(secret)).toEqual({ outcome: 'invalid' });
    expect(await row(session.id)).toMatchObject({
      revocationReason: 'LOGOUT',
      idTokenCiphertext: null,
      idTokenKeyVersion: null,
      refreshTokenCiphertext: null,
      refreshTokenKeyVersion: null,
    });

    // A later re-validation cannot bring it back.
    const store = createSessionStore(database, { auditRecorderFor: createAuditRecorder });
    await expect(
      store.applyRevalidation({
        id: session.id,
        now: clock,
        claimedAt: live.lastSeenAt,
        replaces: String(live.refreshTokenCiphertext),
        idleExpiresAt: new Date(clock.getTime() + MINUTE),
        tokens: { refreshToken: { ciphertext: 'sealed', keyVersion: 1 } },
      }),
    ).resolves.toBe(false);
    expect(await authenticate(secret)).toEqual({ outcome: 'invalid' });
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

    expect(await authenticate(first.secret)).toEqual({ outcome: 'invalid' });
    expect(await authenticate(second.secret)).toEqual({ outcome: 'invalid' });
    expect(await authenticate(bobs.secret)).toMatchObject({ outcome: 'valid' });
    const reasons = await postgres.sql(
      `SELECT id_token_ciphertext IS NULL AND refresh_token_ciphertext IS NULL, revocation_reason
       FROM auth_session WHERE user_id = '${alice}' ORDER BY idp_session_id`,
    );
    expect(reasons.split('\n')).toEqual(['t|ACCESS_REVOKED', 't|BACKCHANNEL_LOGOUT', 'f|']);
    expect(await auditActions()).toEqual([
      'iam.session.revoked:SUCCEEDED',
      'iam.session.revoked:SUCCEEDED',
    ]);
  });

  it('discards the tokens of an expired session when it is seen, and in the sign-in sweep', async () => {
    const seen = await establish();
    const unseen = await establish();
    advance(30 * MINUTE);
    expect(await authenticate(seen.secret)).toEqual({ outcome: 'expired' });
    const tokens = () =>
      postgres.sql(
        `SELECT id_token_ciphertext IS NULL, refresh_token_ciphertext IS NULL
         FROM auth_session ORDER BY id = '${seen.session.id}' DESC`,
      );
    expect((await tokens()).split(/\s+/)).toEqual(['t|t', 'f|f']);
    await sessions.startLogin({ state: 's', nonce: 'n', codeVerifier: 'v' });
    expect((await tokens()).split(/\s+/)).toEqual(['t|t', 't|t']);
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
    expect(await authenticate(secret)).toMatchObject({ outcome: 'valid' });
  });

  it('revokes once under concurrent revocations and re-validations, and stays revoked', async () => {
    const { secret, session } = await establish();
    advance(2 * MINUTE);
    const results = await Promise.all([
      sessions.revoke(session, 'LOGOUT', attribution()),
      authenticate(secret),
      sessions.revoke(session, 'LOGOUT', attribution()),
      sessions.revokeUserSessions(session.userId, 'ACCESS_REVOKED', attribution()),
      authenticate(secret),
    ]);
    const revocations = [results[0], results[2], results[3] === 1];
    expect(revocations.filter(Boolean)).toHaveLength(1);
    expect(await authenticate(secret)).toEqual({ outcome: 'invalid' });
    expect(
      (await auditActions()).filter((action) => action.startsWith('iam.session.revoked')),
    ).toHaveLength(1);
    expect((await row(session.id)).refreshTokenCiphertext).toBeNull();
  });

  it('checks the CSRF token of the same session only', async () => {
    const first = await establish();
    const second = await establish();
    const lookup = await authenticate(first.secret);
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
      const [attempt] = await auth().authLoginAttempt.findMany();
      expect(attempt?.handleHash).toBe(hashSecret(handle));
      expect(JSON.stringify(attempt)).not.toContain(handle);
      await expect(sessions.finishLogin('not-a-handle')).resolves.toEqual({ outcome: 'missing' });
    });
  });
});
