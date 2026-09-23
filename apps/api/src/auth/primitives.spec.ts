import { describe, expect, it } from 'vitest';
import {
  clearedCookie,
  LOGIN_COOKIE,
  loginCookie,
  readCookie,
  SESSION_COOKIE,
  sessionCookie,
} from './cookies.js';
import { csrfTokenFor, hashSecret, isSecretShaped, matchesHash, newSecret } from './secrets.js';
import { createTokenCipher } from './token-cipher.js';

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
    expect(loginCookie('h', 600)).toBe(
      '__Host-vertex-login=h; Path=/; Max-Age=600; Secure; HttpOnly; SameSite=Lax',
    );
    expect(clearedCookie(SESSION_COOKIE)).toBe(
      '__Host-vertex-session=; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=Strict',
    );
    expect(clearedCookie(LOGIN_COOKIE)).toContain('Max-Age=0');
    for (const cookie of [sessionCookie('s'), loginCookie('h', 1)]) {
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

describe('ID-token cipher', () => {
  const cipher = createTokenCipher('sentinel-token-encryption-secret-000000');
  const sessionId = '6a1f2b3c-4d5e-4f60-8a1b-2c3d4e5f6a7b';

  it('round-trips, with a fresh IV each time and no plaintext in the ciphertext', () => {
    const first = cipher.encrypt('header.payload.signature', sessionId);
    const second = cipher.encrypt('header.payload.signature', sessionId);
    expect(first).not.toBe(second);
    expect(first).not.toContain('payload');
    expect(cipher.decrypt(first, cipher.keyVersion, sessionId)).toBe('header.payload.signature');
  });

  it('refuses another session, another key, another version and altered data', () => {
    const sealed = cipher.encrypt('token', sessionId);
    expect(cipher.decrypt(sealed, cipher.keyVersion, '00000000-0000-4000-8000-000000000000')).toBe(
      undefined,
    );
    const other = createTokenCipher('another-token-encryption-secret-0000000');
    expect(other.decrypt(sealed, other.keyVersion, sessionId)).toBeUndefined();
    expect(cipher.decrypt(sealed, cipher.keyVersion + 1, sessionId)).toBeUndefined();
    const raw = Buffer.from(sealed, 'base64url');
    raw[raw.length - 1] = (raw[raw.length - 1] ?? 0) ^ 1;
    expect(cipher.decrypt(raw.toString('base64url'), cipher.keyVersion, sessionId)).toBeUndefined();
    expect(cipher.decrypt('', cipher.keyVersion, sessionId)).toBeUndefined();
  });
});
