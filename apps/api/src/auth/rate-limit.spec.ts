import { describe, expect, it } from 'vitest';
import { createRateLimiter } from './rate-limit.js';

function clock(start = 1_000_000) {
  let at = start;
  return { now: () => at, advance: (ms: number) => (at += ms) };
}

describe('createRateLimiter', () => {
  it('allows the limit within a window, then refuses with the time left', () => {
    const time = clock();
    const limiter = createRateLimiter({ limit: 2, windowSeconds: 60, now: time.now });
    expect(limiter.take('a')).toEqual({ allowed: true });
    time.advance(10_000);
    expect(limiter.take('a')).toEqual({ allowed: true });
    time.advance(20_500);
    expect(limiter.take('a')).toEqual({ allowed: false, retryAfterSeconds: 30, first: true });
    expect(limiter.take('a')).toEqual({ allowed: false, retryAfterSeconds: 30, first: false });
  });

  it('starts a new window once the old one has passed', () => {
    const time = clock();
    const limiter = createRateLimiter({ limit: 1, windowSeconds: 10, now: time.now });
    expect(limiter.take('a').allowed).toBe(true);
    expect(limiter.take('a').allowed).toBe(false);
    time.advance(9_999);
    expect(limiter.take('a')).toMatchObject({ allowed: false, retryAfterSeconds: 1 });
    time.advance(1);
    expect(limiter.take('a').allowed).toBe(true);
    expect(limiter.take('a')).toMatchObject({ allowed: false, first: true });
  });

  it('counts each key on its own', () => {
    const time = clock();
    const limiter = createRateLimiter({ limit: 1, windowSeconds: 60, now: time.now });
    expect(limiter.take('a').allowed).toBe(true);
    expect(limiter.take('b').allowed).toBe(true);
    expect(limiter.take('a').allowed).toBe(false);
    expect(limiter.take('b').allowed).toBe(false);
  });

  it('forgets the oldest key when the table is full, never refusing a new key', () => {
    const time = clock();
    const limiter = createRateLimiter({ limit: 1, windowSeconds: 60, maxKeys: 2, now: time.now });
    expect(limiter.take('a').allowed).toBe(true);
    expect(limiter.take('b').allowed).toBe(true);
    // A third key is admitted; the oldest one ('a') is dropped and starts a fresh window.
    expect(limiter.take('c').allowed).toBe(true);
    expect(limiter.take('b').allowed).toBe(false);
    expect(limiter.take('c').allowed).toBe(false);
    expect(limiter.take('a').allowed).toBe(true);
  });
});
