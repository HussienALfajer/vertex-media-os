import { Logger } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AuthRuntime } from './auth-runtime.js';
import { AuthHousekeeping } from './housekeeping.js';
import type { HousekeepingResult } from './session-store.js';

/** The scheduler of IAM-R09 D-07 (review DC-3): one run at a time, failures logged, clean shutdown. */
const EMPTY: HousekeepingResult = {
  loginAttemptsDeleted: 0,
  sessionTokensDiscarded: 0,
  sessionsPurged: 0,
};

function housekeepingWith(housekeep: () => Promise<HousekeepingResult>, intervalMs?: number) {
  const runtime = { sessions: { housekeep } } as unknown as AuthRuntime;
  return new AuthHousekeeping(runtime, intervalMs);
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('AuthHousekeeping', () => {
  it('lets a tick that meets a run in progress join it instead of starting another', async () => {
    let finish: (result: HousekeepingResult) => void = () => undefined;
    const housekeep = vi.fn(() => new Promise<HousekeepingResult>((resolve) => (finish = resolve)));
    const housekeeping = housekeepingWith(housekeep);

    const first = housekeeping.run();
    const second = housekeeping.run();
    finish(EMPTY);
    await Promise.all([first, second]);

    expect(housekeep).toHaveBeenCalledTimes(1);
    const next = housekeeping.run();
    expect(housekeep).toHaveBeenCalledTimes(2);
    finish(EMPTY);
    await next;
  });

  it('logs a failed run and lets the next one retry', async () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const housekeep = vi
      .fn<() => Promise<HousekeepingResult>>()
      .mockRejectedValueOnce(new Error('database unavailable'))
      .mockResolvedValueOnce(EMPTY);
    const housekeeping = housekeepingWith(housekeep);

    await expect(housekeeping.run()).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledTimes(1);
    await housekeeping.run();
    expect(housekeep).toHaveBeenCalledTimes(2);
  });

  it('waits for a run in progress when the module is destroyed', async () => {
    let finish: (result: HousekeepingResult) => void = () => undefined;
    const housekeeping = housekeepingWith(
      () => new Promise<HousekeepingResult>((resolve) => (finish = resolve)),
    );
    const run = housekeeping.run();
    let destroyed = false;
    const destroy = housekeeping.onModuleDestroy().then(() => (destroyed = true));

    await Promise.resolve();
    expect(destroyed).toBe(false);
    finish(EMPTY);
    await Promise.all([run, destroy]);
    expect(destroyed).toBe(true);
  });

  it('schedules runs only when an interval is configured, and stops them on destroy', async () => {
    vi.useFakeTimers();
    const housekeep = vi.fn(async () => EMPTY);
    const unscheduled = housekeepingWith(housekeep);
    unscheduled.onApplicationBootstrap();
    await vi.advanceTimersByTimeAsync(180_000);
    expect(housekeep).not.toHaveBeenCalled();

    const scheduled = housekeepingWith(housekeep, 60_000);
    scheduled.onApplicationBootstrap();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(housekeep).toHaveBeenCalledTimes(2);
    await scheduled.onModuleDestroy();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(housekeep).toHaveBeenCalledTimes(2);
  });
});
