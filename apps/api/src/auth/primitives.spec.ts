import { describe, expect, it } from 'vitest';
import {
  clearedCookie,
  LOGIN_COOKIE,
  readCookie,
  SESSION_COOKIE,
  sessionCookie,
} from './cookies.js';
import { csrfTokenFor, hashSecret, isSecretShaped, matchesHash, newSecret } from './secrets.js';

describe('secrets', () => {
  it('issues 256-bit base64url secrets and stores only their SHA-256', () => {
    const secret = newSecret();
    expect(secret).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(newSecret()).not.toBe(secret);
    const hash = hashSecret(secret);
    expect(hash).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(hash).not.toBe(secret);
    expect(matchesHash(secret, hash)).toBe(true);
    expect(matchesHash(newSecret(), hash)).toBe(false);
  });

  it('rejects anything not shaped like an issued secret before hashing it', () => {
    expect(isSecretShaped(undefined)).toBe(false);
    expect(isSecretShaped('short')).toBe(false);
    expect(isSecretShaped(`${newSecret()}x`)).toBe(false);
    expect(isSecretShaped('a'.repeat(42) + '=')).toBe(false);
    expect(matchesHash(undefined, hashSecret(newSecret()))).toBe(false);
  });

  it('derives one CSRF token per session secret, unlinkable to it', () => {
    const secret = newSecret();
    const token = csrfTokenFor(secret);
    expect(csrfTokenFor(secret)).toBe(token);
    expect(csrfTokenFor(newSecret())).not.toBe(token);
    expect(token).not.toBe(secret);
    expect(token).not.toBe(hashSecret(secret));
    expect(isSecretShaped(token)).toBe(true);
  });
});

describe('cookies', () => {
  it('issues host-scoped, HttpOnly, Secure cookies', () => {
    expect(sessionCookie('s')).toBe(
      '__Host-vertex-session=s; Path=/; Secure; HttpOnly; SameSite=Strict',
    );
    expect(clearedCookie(SESSION_COOKIE)).toBe(
      '__Host-vertex-session=; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=Strict',
    );
    expect(clearedCookie(LOGIN_COOKIE)).toContain('Max-Age=0');
    for (const cookie of [sessionCookie('s'), clearedCookie(LOGIN_COOKIE)]) {
      expect(cookie).not.toMatch(/Domain=/i);
    }
  });

  it('reads exactly one value and ignores similar names and duplicates', () => {
    expect(readCookie(undefined, SESSION_COOKIE)).toBeUndefined();
    expect(readCookie('a=1; __Host-vertex-session=abc; b=2', SESSION_COOKIE)).toBe('abc');
    expect(readCookie('__Host-vertex-sessionx=abc', SESSION_COOKIE)).toBeUndefined();
    expect(readCookie('vertex-session=abc', SESSION_COOKIE)).toBeUndefined();
    expect(
      readCookie('__Host-vertex-session=a; __Host-vertex-session=b', SESSION_COOKIE),
    ).toBeUndefined();
    expect(readCookie('__Host-vertex-login=h', LOGIN_COOKIE)).toBe('h');
  });
});
