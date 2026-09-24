import { describe, expect, it } from 'vitest';
import { clientAddressKey, createRateLimiter } from './rate-limit.js';

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

describe('clientAddressKey (IAM-R09 review S-3)', () => {
  it('keeps an IPv4 address and folds an IPv4-mapped one onto it', () => {
    expect(clientAddressKey('198.51.100.7')).toBe('198.51.100.7');
    expect(clientAddressKey('::ffff:198.51.100.7')).toBe('198.51.100.7');
  });

  it('keys an IPv6 address by its /64, whatever its interface part and notation', () => {
    const key = clientAddressKey('2001:db8:aa:bb::1');
    expect(key).toBe('2001:db8:aa:bb::/64');
    expect(clientAddressKey('2001:0db8:00aa:00bb:1234:5678:9abc:def0')).toBe(key);
    expect(clientAddressKey('2001:db8:aa:bb:ffff::')).toBe(key);
    expect(clientAddressKey('2001:db8:aa:bc::1')).not.toBe(key);
    expect(clientAddressKey('::1')).toBe('0:0:0:0::/64');
  });
});
