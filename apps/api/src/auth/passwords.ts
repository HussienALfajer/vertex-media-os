import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
const COST = 131_072;
const BLOCK_SIZE = 8;
const PARALLELISM = 1;
const KEY_BYTES = 64;
const MAX_MEMORY = 256 * 1024 * 1024;
const FORMAT = /^scrypt\$(\d+)\$(\d+)\$(\d+)\$([A-Za-z0-9_-]{43})\$([A-Za-z0-9_-]{86})$/;

/** The same work is performed for an unknown email, without disclosing account existence. */
export const DUMMY_PASSWORD_HASH = `scrypt$${COST}$${BLOCK_SIZE}$${PARALLELISM}$${'A'.repeat(43)}$${'A'.repeat(86)}`;

export function validPassword(password: unknown): password is string {
  return (
    typeof password === 'string' &&
    [...password].length >= 15 &&
    [...password].length <= 128 &&
    Buffer.byteLength(password, 'utf8') <= 512 &&
    !password.includes('\0')
  );
}

function derive(
  password: string,
  salt: Buffer,
  cost: number,
  blockSize: number,
  parallelism: number,
) {
  return new Promise<Buffer>((resolve, reject) => {
    scrypt(
      password,
      salt,
      KEY_BYTES,
      {
        N: cost,
        r: blockSize,
        p: parallelism,
        maxmem: MAX_MEMORY,
      },
      (error, key) => {
        if (error) reject(error);
        else resolve(key);
      },
    );
  });
}

export async function hashPassword(password: string): Promise<string> {
  if (!validPassword(password)) throw new Error('Invalid password length.');
  const salt = randomBytes(32);
  const hash = await derive(password, salt, COST, BLOCK_SIZE, PARALLELISM);
  return `scrypt$${COST}$${BLOCK_SIZE}$${PARALLELISM}$${salt.toString('base64url')}$${hash.toString('base64url')}`;
}

export async function verifyPassword(
  password: string,
  encoded: string | undefined,
): Promise<boolean> {
  const match = FORMAT.exec(encoded ?? DUMMY_PASSWORD_HASH);
  if (!match || typeof password !== 'string' || Buffer.byteLength(password, 'utf8') > 512) {
    return false;
  }
  // Work factors are fixed by this application. Never accept attacker-controlled cost values.
  if (
    Number(match[1]) !== COST ||
    Number(match[2]) !== BLOCK_SIZE ||
    Number(match[3]) !== PARALLELISM
  ) {
    return false;
  }
  const salt = Buffer.from(match[4] ?? '', 'base64url');
  const expected = Buffer.from(match[5] ?? '', 'base64url');
  if (salt.length !== 32 || expected.length !== KEY_BYTES) return false;
  const actual = await derive(password, salt, COST, BLOCK_SIZE, PARALLELISM);
  return timingSafeEqual(actual, expected) && encoded !== undefined;
}
