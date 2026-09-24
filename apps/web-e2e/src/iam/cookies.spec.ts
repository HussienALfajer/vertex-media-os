import { vertexCookie } from '../../test-support/iam/browser-context.js';
import { expect, test } from '../../test-support/iam/fixtures.js';
import { sql, WEB_ORIGIN } from '../../test-support/iam/stack.js';

/**
 * The `__Host-` cookies on `http://127.0.0.1` in Chromium and Firefox (IAM-R09B J-10; R08 D-03):
 * their attributes, rotation at a new sign-in, and removal at sign-out. WebKit keeps no `Secure`
 * cookie over plain HTTP (D-06; `webkit-http.spec.ts`).
 */

test('J-10 the session cookie is host-only, Secure, HttpOnly and Strict, rotates at a new sign-in and is removed at sign-out', async ({
  activeUser,
  request,
  stack,
}) => {
  const user = await activeUser({ label: 'cookies' });
  const first = await vertexCookie(user.context, '__Host-vertex-session');
  expect(first).toMatchObject({
    domain: '127.0.0.1',
    path: '/',
    secure: true,
    httpOnly: true,
    sameSite: 'Strict',
    // No Max-Age: the server-side deadlines are authoritative (SECURITY Section 11).
    expires: -1,
  });
  // The login cookie lived only until the callback consumed it.
  expect(await vertexCookie(user.context, '__Host-vertex-login')).toBeUndefined();

  // Signing in again while signed in: Keycloak's session answers at once, and the callback
  // replaces the Vertex session (same site locally, so the Strict cookie reaches it; D-07).
  await user.page.goto('/api/auth/login');
  await user.page.waitForURL(`${WEB_ORIGIN}/`);
  await expect(user.page.getByRole('region', { name: 'Account' })).toContainText(user.displayName);
  const second = await vertexCookie(user.context, '__Host-vertex-session');
  expect(second?.value).toBeDefined();
  expect(second?.value).not.toBe(first?.value);
  const replay = await request.get(`${WEB_ORIGIN}/api/auth/session`, {
    headers: { cookie: `__Host-vertex-session=${first?.value ?? ''}` },
  });
  expect(replay.status()).toBe(401);
  expect(
    sql(
      stack,
      `SELECT revocation_reason FROM auth_session WHERE user_id = '${user.id}' AND revoked_at IS NOT NULL`,
    ),
  ).toBe('REPLACED');

  await user.page.getByRole('button', { name: 'Sign out' }).click();
  await expect(user.page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
  expect(await vertexCookie(user.context, '__Host-vertex-session')).toBeUndefined();
});
