import { describe, expect, it } from 'vitest';
import type { SessionStore } from './session-store.js';
import { createSessionService } from './sessions.js';

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

describe('local session housekeeping window', () => {
  it('retains the sweep window when old encrypted rows remain', async () => {
    let at = Date.parse('2026-09-24T12:00:00.000Z');
    const windows: Array<{ now: Date; tokensExpiredAfter: Date; purgeBefore: Date }> = [];
    const remain = [false, true, false, false];
    const store = {
      housekeep: async (window: { now: Date; tokensExpiredAfter: Date; purgeBefore: Date }) => {
        windows.push(window);
        return {
          loginAttemptsDeleted: 0,
          sessionTokensDiscarded: 0,
          sessionsPurged: 0,
          expiredTokensRemain: remain.shift() ?? false,
        };
      },
    } as SessionStore;
    const sessions = createSessionService({
      store,
      limits: { idleTimeoutSeconds: 1800, absoluteTimeoutSeconds: 36000, retentionDays: 30 },
      now: () => new Date(at),
    });

    const first = at;
    for (let run = 0; run < 4; run += 1) {
      await sessions.housekeep();
      at += MINUTE;
    }
    const retention = 30 * DAY;
    expect(windows.map((window) => window.tokensExpiredAfter.getTime())).toEqual([
      first - retention,
      first - 60 * MINUTE,
      first - 60 * MINUTE,
      first + 2 * MINUTE - 60 * MINUTE,
    ]);
    expect(windows.map((window) => window.purgeBefore.getTime() + retention)).toEqual(
      windows.map((window) => window.now.getTime()),
    );
  });
});
