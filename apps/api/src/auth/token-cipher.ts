import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';

/**
 * Encryption of the identity-provider tokens a session keeps server-side: the ID token, used as
 * `id_token_hint` for RP-initiated logout (IAM-R03 D-17), and the refresh token, used to re-validate
 * the session against the identity provider (IAM-R03F D-06). AES-256-GCM with a key derived by
 * HKDF-SHA256 from the configured secret under a purpose-bound `info`, a random 96-bit IV per
 * value, and the session row ID as additional authenticated data, so a ciphertext copied to another
 * session, or to the other token's column, does not decrypt.
 */
export interface TokenCipher {
  readonly keyVersion: number;
  encrypt(plaintext: string, sessionId: string): string;
  /** The plaintext, or `undefined` when the value was produced by another key or was altered. */
  decrypt(ciphertext: string, keyVersion: number, sessionId: string): string | undefined;
}

/** One cipher per stored token, each with its own derived key. */
export interface TokenCiphers {
  readonly idToken: TokenCipher;
  readonly refreshToken: TokenCipher;
}

export type TokenPurpose = 'id-token' | 'refresh-token';

const KEY_VERSION = 1;
const HKDF_SALT = 'vertex-os/auth';
const IV_BYTES = 12;
const TAG_BYTES = 16;

export function createTokenCipher(secret: string, purpose: TokenPurpose): TokenCipher {
  const info = `vertex-os/auth/${purpose}/v${KEY_VERSION}`;
  const key = Buffer.from(hkdfSync('sha256', secret, HKDF_SALT, info, 32));

  return Object.freeze({
    keyVersion: KEY_VERSION,
    encrypt(plaintext: string, sessionId: string): string {
      const iv = randomBytes(IV_BYTES);
      const cipher = createCipheriv('aes-256-gcm', key, iv);
      cipher.setAAD(Buffer.from(sessionId, 'utf8'));
      const body = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
      return Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64url');
    },
    decrypt(ciphertext: string, keyVersion: number, sessionId: string): string | undefined {
      if (keyVersion !== KEY_VERSION) return undefined;
      const raw = Buffer.from(ciphertext, 'base64url');
      if (raw.length <= IV_BYTES + TAG_BYTES) return undefined;
      try {
        const decipher = createDecipheriv('aes-256-gcm', key, raw.subarray(0, IV_BYTES));
        decipher.setAAD(Buffer.from(sessionId, 'utf8'));
        decipher.setAuthTag(raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES));
        const body = raw.subarray(IV_BYTES + TAG_BYTES);
        return Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8');
      } catch {
        return undefined;
      }
    },
  });
}

export function createTokenCiphers(secret: string): TokenCiphers {
  return Object.freeze({
    idToken: createTokenCipher(secret, 'id-token'),
    refreshToken: createTokenCipher(secret, 'refresh-token'),
  });
}
