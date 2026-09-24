import { parseSystemProcess, parseTraceId, type AuditAttribution } from '@vertex-os/audit';
import { describe, expect, it } from 'vitest';
import type { NewSession, SessionStore, StoredSession } from './session-store.js';
import { createSessionService } from './sessions.js';
import { createTokenCiphers } from './token-cipher.js';

/**
 * The ordering of IAM-R09 D-08 without a database: a back-channel logout that remembers its
 * identity-provider session before revoking, and a sign-in that checks that memory only after its
 * insert committed. Each test holds one step open while the other side runs (review S-5).
 */
const LIMITS = {
  idleTimeoutSeconds: 1800,
  absoluteTimeoutSeconds: 36000,
  loginAttemptTimeoutSeconds: 600,
  retentionDays: 30,
};

function attribution(): AuditAttribution {
  const process = parseSystemProcess('iam.session-test');
  const traceId = parseTraceId('trace-session-unit');
  if (!process.ok || !traceId.ok) throw new Error('attribution fixture');
  return { actor: { type: 'SYSTEM', process: process.value }, traceId: traceId.value };
}

function gate() {
  let open: () => void = () => undefined;
  const opened = new Promise<void>((resolve) => (open = resolve));
  return { open, opened };
}

/** A store whose insert and whose revocation by identity-provider session can be held open. */
function heldStore(holds: { insert?: Promise<void>; revokeIdp?: Promise<void> }) {
  const revoked: string[] = [];
  const store = {
    async createSession(session: NewSession): Promise<StoredSession> {
      // Not visible to a concurrent revocation until this resolves: the insert has not committed.
      await holds.insert;
      return {
        id: 'session-1',
        userId: session.userId,
        csrfTokenHash: session.csrfTokenHash,
        idpSessionId: session.idpSessionId,
        createdAt: session.createdAt,
        lastSeenAt: session.createdAt,
        idleExpiresAt: session.idleExpiresAt,
        absoluteExpiresAt: session.absoluteExpiresAt,
        revokedAt: undefined,
        idToken: undefined,
        refreshToken: undefined,
      };
    },
    async revoke({ id, reason }: { id: string; reason: string }) {
      revoked.push(`${id}:${reason}`);
      return true;
    },
    async revokeIdpSession() {
      // The logout's UPDATE runs before the insert commits, so it matches no row.
      await holds.revokeIdp;
      return 0;
    },
  } as unknown as SessionStore;
  return { store, revoked };
}

function service(store: SessionStore) {
  return createSessionService({
    store,
    ciphers: createTokenCiphers('sentinel-token-encryption-secret-000000'),
    provider: { refreshSession: async () => ({ ok: false, failure: 'rejected', code: 'x' }) },
    limits: LIMITS,
    clientId: 'vertex-web',
  });
}

const establishInput = {
  userId: '00000000-0000-4000-8000-000000000001',
  idpSessionId: 'kc-racing',
  idToken: undefined,
  refreshToken: undefined,
};

describe('a back-channel logout racing a sign-in (IAM-R09 D-08)', () => {
  it('ends the session when the logout ran while the insert was still uncommitted', async () => {
    const insert = gate();
    const { store, revoked } = heldStore({ insert: insert.opened });
    const sessions = service(store);

    const signIn = sessions.establish({ ...establishInput, attribution: attribution() });
    // The logout completes, matching nothing, before the insert commits.
    expect(await sessions.revokeIdpSession('kc-racing', 'BACKCHANNEL_LOGOUT', attribution())).toBe(
      0,
    );
    insert.open();

    expect((await signIn).endedByProvider).toBe(true);
    expect(revoked).toEqual(['session-1:BACKCHANNEL_LOGOUT']);
  });

  it('ends the session when the insert committed while the logout was still revoking', async () => {
    const revokeIdp = gate();
    const { store, revoked } = heldStore({ revokeIdp: revokeIdp.opened });
    const sessions = service(store);

    // The logout's revocation is in flight and did not see the row; the sign-in completes meanwhile.
    const logout = sessions.revokeIdpSession('kc-racing', 'BACKCHANNEL_LOGOUT', attribution());
    const signIn = await sessions.establish({ ...establishInput, attribution: attribution() });
    revokeIdp.open();
    await logout;

    expect(signIn.endedByProvider).toBe(true);
    expect(revoked).toEqual(['session-1:BACKCHANNEL_LOGOUT']);
  });

  it('keeps a session whose identity-provider session no logout named', async () => {
    const { store, revoked } = heldStore({});
    const sessions = service(store);
    await sessions.revokeIdpSession('kc-other', 'BACKCHANNEL_LOGOUT', attribution());

    expect(
      (await sessions.establish({ ...establishInput, attribution: attribution() })).endedByProvider,
    ).toBe(false);
    expect(revoked).toEqual([]);
  });
});

describe('the expired-token sweep window (IAM-R09 review DATA-1)', () => {
  const MINUTE = 60_000;
  const DAY = 86_400_000;

  function recordingStore(remain: boolean[]) {
    const windows: Array<{ now: Date; tokensExpiredAfter: Date; purgeBefore: Date }> = [];
    const store = {
      async housekeep(change: { now: Date; tokensExpiredAfter: Date; purgeBefore: Date }) {
        windows.push(change);
        return {
          loginAttemptsDeleted: 0,
          sessionTokensDiscarded: 0,
          sessionsPurged: 0,
          expiredTokensRemain: remain.shift() ?? false,
        };
      },
    } as unknown as SessionStore;
    return { store, windows };
  }

  it('reads the whole retention window first, then only the deadlines since the last emptied window', async () => {
    let at = Date.parse('2026-09-24T12:00:00.000Z');
    // The second run leaves expired tokens in its window, so the third reads from where the second
    // began (review DC-1).
    const { store, windows } = recordingStore([false, true, false, false]);
    const sessions = createSessionService({
      store,
      ciphers: createTokenCiphers('sentinel-token-encryption-secret-000000'),
      provider: { refreshSession: async () => ({ ok: false, failure: 'rejected', code: 'x' }) },
      limits: LIMITS,
      clientId: 'vertex-web',
      now: () => new Date(at),
    });

    const first = at;
    await sessions.housekeep();
    at += MINUTE;
    await sessions.housekeep();
    at += MINUTE;
    await sessions.housekeep();
    at += MINUTE;
    await sessions.housekeep();

    const retention = LIMITS.retentionDays * DAY;
    expect(windows.map((w) => w.tokensExpiredAfter.getTime())).toEqual([
      first - retention,
      first - 60 * MINUTE,
      first - 60 * MINUTE,
      first + 2 * MINUTE - 60 * MINUTE,
    ]);
    expect(windows.map((w) => w.purgeBefore.getTime() + retention)).toEqual(
      windows.map((w) => w.now.getTime()),
    );
  });
});
