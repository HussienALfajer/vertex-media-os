import { fetchFromPage, vertexCookie } from '../../test-support/iam/browser-context.js';
import { expect, test } from '../../test-support/iam/fixtures.js';
import { signIn } from '../../test-support/iam/keycloak-pages.js';
import { sql, WEB_ORIGIN } from '../../test-support/iam/stack.js';

/**
 * Sign-in, sign-out and the ends of a session in a real browser against the pinned Keycloak
 * (IAM-R09B J-01, J-02, J-07, J-09; spec Section 46.7).
 */

test('J-01 a user signs in through Keycloak and reaches the signed-in shell', async ({
  activeUser,
}) => {
  const user = await activeUser({ label: 'sign-in' });
  // First activation happened at that sign-in: the shell greets the user by name.
  await expect(user.page.getByRole('region', { name: 'Account' })).toContainText(user.displayName);
  await expect(user.page.getByRole('button', { name: 'Sign out' })).toBeVisible();
  expect((await fetchFromPage(user.page, '/api/auth/session')).status).toBe(200);
});

test('J-02 sign-out ends the Vertex session and the Keycloak session', async ({
  activeUser,
  request,
}) => {
  const user = await activeUser({ label: 'sign-out' });
  const before = await vertexCookie(user.context, '__Host-vertex-session');
  expect(before).toBeDefined();

  await user.page.getByRole('button', { name: 'Sign out' }).click();
  await user.page.waitForURL(`${WEB_ORIGIN}/`);
  await expect(user.page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
  expect(await vertexCookie(user.context, '__Host-vertex-session')).toBeUndefined();

  // The old session value is refused by the API.
  const replay = await request.get(`${WEB_ORIGIN}/api/auth/session`, {
    headers: { cookie: `__Host-vertex-session=${before?.value ?? ''}` },
  });
  expect(replay.status()).toBe(401);

  // Keycloak asks for the password again: its session ended too.
  await user.page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(user.page.locator('form#kc-form-login')).toBeVisible();
});

test('J-07 an administrator ends a user’s sessions, and the user sees the session ended', async ({
  activeUser,
  admin,
}) => {
  const user = await activeUser({ label: 'revoked' });

  await admin.goto(`/users/${user.id}`);
  await admin.getByRole('button', { name: 'User actions' }).click();
  await admin.getByRole('menuitem', { name: 'End sessions' }).click();
  const dialog = admin.getByRole('alertdialog', { name: 'End all of this user’s sessions?' });
  await expect(dialog).toContainText(user.email);
  await dialog.getByRole('button', { name: 'End sessions' }).click();
  await expect(admin.getByText('Sessions ended', { exact: true })).toBeVisible();

  await user.page.reload();
  await expect(user.page.getByText('Session ended', { exact: true })).toBeVisible();
  await expect(user.page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
});

test('J-07 an expired session reaches the expired state', async ({ activeUser, stack }) => {
  const user = await activeUser({ label: 'expired' });
  // The idle deadline passes (D-14); the lifetime check keeps it after the creation time.
  sql(
    stack,
    `UPDATE auth_session SET created_at = now() - interval '2 hours', ` +
      `last_seen_at = now() - interval '1 hour', idle_expires_at = now() - interval '1 second' ` +
      `WHERE user_id = '${user.id}' AND revoked_at IS NULL`,
  );
  await user.page.reload();
  await expect(user.page.getByText('Session expired', { exact: true })).toBeVisible();

  // Signing in again starts a new session.
  await signIn(user.page, user.email, user.device);
  await expect(user.page.getByRole('region', { name: 'Account' })).toContainText(user.displayName);
});

test('J-09 a Keycloak-side logout ends the Vertex session through back-channel logout', async ({
  activeUser,
  stack,
}) => {
  const user = await activeUser({ label: 'backchannel' });
  const subject = sql(
    stack,
    `SELECT identity_subject FROM iam_application_user WHERE id = '${user.id}'`,
  );

  const token = await fetch(`${stack.keycloakUrl}/realms/master/protocol/openid-connect/token`, {
    method: 'POST',
    body: new URLSearchParams({
      grant_type: 'password',
      client_id: 'admin-cli',
      username: stack.keycloakAdmin.username,
      password: stack.keycloakAdmin.password,
    }),
  });
  expect(token.status).toBe(200);
  const { access_token: bearer } = (await token.json()) as { access_token: string };
  // Keycloak ends the user's sessions and notifies each client's back-channel logout URL.
  const logout = await fetch(`${stack.keycloakUrl}/admin/realms/vertex/users/${subject}/logout`, {
    method: 'POST',
    headers: { authorization: `Bearer ${bearer}` },
  });
  expect(logout.status).toBe(204);

  // Observed in the database: a refused request would clear the browser's cookie with its answer.
  await expect
    .poll(() =>
      sql(
        stack,
        `SELECT count(*) FROM auth_session WHERE user_id = '${user.id}' ` +
          `AND revocation_reason = 'BACKCHANNEL_LOGOUT'`,
      ),
    )
    .toBe('1');
  await user.page.reload();
  await expect(user.page.getByText('Session ended', { exact: true })).toBeVisible();
});
