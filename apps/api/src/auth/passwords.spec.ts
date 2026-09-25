import { describe, expect, it } from 'vitest';
import { DUMMY_PASSWORD_HASH, hashPassword, validPassword, verifyPassword } from './passwords.js';

describe('password credentials', () => {
  it('accepts long passphrases and rejects short passwords', () => {
    expect(validPassword('a sufficiently long passphrase')).toBe(true);
    expect(validPassword('short')).toBe(false);
  });

  it('salts each credential, verifies a match and denies a wrong or unknown credential', async () => {
    const password = 'a sufficiently long passphrase';
    const first = await hashPassword(password);
    const second = await hashPassword(password);
    expect(first).not.toBe(second);
    expect(await verifyPassword(password, first)).toBe(true);
    expect(await verifyPassword('another sufficiently long passphrase', first)).toBe(false);
    expect(await verifyPassword(password, undefined)).toBe(false);
    expect(await verifyPassword(password, DUMMY_PASSWORD_HASH)).toBe(false);
  });
});
