import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Secret handling of the authentication area (IAM-R03 D-03, D-18). Every secret is 32 bytes of
 * CSPRNG output in unpadded base64url (43 characters); only its SHA-256, in the same encoding, is
 * ever stored.
 */

const SECRET = /^[A-Za-z0-9_-]{43}$/;
const CSRF_LABEL = 'vertex-os/csrf/v1';

/** A new session secret, login-attempt handle, or similar bearer value. */
export function newSecret(): string {
  return randomBytes(32).toString('base64url');
}

/** Whether `value` has the shape of a secret this area issued; anything else is rejected unread. */
export function isSecretShaped(value: string | undefined): value is string {
  return value !== undefined && SECRET.test(value);
}

/** The one-way identifier stored in place of a secret. */
export function hashSecret(secret: string): string {
  return createHash('sha256').update(secret, 'utf8').digest('base64url');
}

/**
 * The session's CSRF synchronizer token: an HMAC of the session secret, so it is unguessable
 * without the HttpOnly cookie, identical across the session's tabs, and replaced with the session.
 */
export function csrfTokenFor(sessionSecret: string): string {
  return createHmac('sha256', sessionSecret).update(CSRF_LABEL, 'utf8').digest('base64url');
}

/** Compares a presented secret with a stored hash in constant time. */
export function matchesHash(candidate: string | undefined, storedHash: string): boolean {
  if (!isSecretShaped(candidate)) return false;
  const presented = Buffer.from(hashSecret(candidate), 'utf8');
  const stored = Buffer.from(storedHash, 'utf8');
  return presented.length === stored.length && timingSafeEqual(presented, stored);
}
