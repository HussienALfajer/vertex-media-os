/**
 * The two cookies of the authentication area (IAM-R03 D-06). Both are host-scoped (`__Host-`:
 * `Secure`, `Path=/`, no `Domain`), `HttpOnly`, and carry only an opaque secret.
 */
export const SESSION_COOKIE = '__Host-vertex-session';
export const LOGIN_COOKIE = '__Host-vertex-login';

type CookieName = typeof SESSION_COOKIE | typeof LOGIN_COOKIE;

/**
 * The value of `name` in a `Cookie` request header. A name sent more than once is treated as
 * absent: a second value can only come from a cookie some other origin tossed in.
 */
export function readCookie(header: string | undefined, name: CookieName): string | undefined {
  if (header === undefined) return undefined;
  const values = header
    .split(';')
    .map((part) => part.trim())
    .filter((part) => part.startsWith(`${name}=`))
    .map((part) => part.slice(name.length + 1));
  return values.length === 1 ? values[0] : undefined;
}

export function sessionCookie(secret: string): string {
  // No Max-Age: the server-side idle and absolute deadlines are authoritative (D-06).
  return `${SESSION_COOKIE}=${secret}; Path=/; Secure; HttpOnly; SameSite=Strict`;
}

export function loginCookie(handle: string, maxAgeSeconds: number): string {
  // Lax, because the callback arrives as a top-level navigation from the identity provider.
  return `${LOGIN_COOKIE}=${handle}; Path=/; Max-Age=${maxAgeSeconds}; Secure; HttpOnly; SameSite=Lax`;
}

export function clearedCookie(name: CookieName): string {
  const sameSite = name === SESSION_COOKIE ? 'Strict' : 'Lax';
  return `${name}=; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=${sameSite}`;
}
