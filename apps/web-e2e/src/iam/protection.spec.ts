import { randomBytes } from 'node:crypto';
import { fetchFromPage } from '../../test-support/iam/browser-context.js';
import { expect, test } from '../../test-support/iam/fixtures.js';
import { runBootstrap, sql } from '../../test-support/iam/stack.js';

/**
 * Protections that hold whatever the UI shows (IAM-R09B J-12, J-13; spec Sections 21, 46.7):
 * the last System Administrator, a key authorization denial, bootstrap refusing to become a
 * backdoor, and housekeeping scheduled by the server entry.
 */

test('J-13 the last System Administrator cannot remove their own role or suspend themselves', async ({
  admin,
  stack,
}) => {
  const adminId = sql(
    stack,
    `SELECT id FROM iam_application_user WHERE email = '${stack.adminEmail}'`,
  );
  await admin.goto(`/users/${adminId}`);

  await admin.getByRole('button', { name: /^Remove role System Administrator/ }).click();
  const removal = admin.getByRole('alertdialog', { name: 'Remove this role from the user?' });
  await expect(removal).toContainText('The last active System Administrator cannot be removed.');
  await removal.getByRole('button', { name: 'Remove role' }).click();
  await expect(
    admin.getByText('At least one active System Administrator must remain.'),
  ).toBeVisible();

  await admin.reload();
  await admin.getByRole('button', { name: 'User actions' }).click();
  await admin.getByRole('menuitem', { name: 'Suspend access' }).click();
  const suspension = admin.getByRole('alertdialog', { name: 'Suspend this user’s access?' });
  await expect(suspension).toContainText('This is your own account');
  await suspension.getByRole('button', { name: 'Suspend access' }).click();
  await expect(
    admin.getByText('At least one active System Administrator must remain.'),
  ).toBeVisible();

  // Nothing changed: still ACTIVE, still holding the role, the session still valid.
  expect(sql(stack, `SELECT access_state FROM iam_application_user WHERE id = '${adminId}'`)).toBe(
    'ACTIVE',
  );
  expect((await fetchFromPage(admin, '/api/auth/session')).status).toBe(200);
});

test('J-13 a user without a permission is denied in the UI and by the API', async ({
  activeUser,
  stack,
}) => {
  const user = await activeUser({ label: 'denied' });
  await user.page.goto('/users');
  await expect(user.page.getByText('You do not have access to this page')).toBeVisible();

  const read = await fetchFromPage(user.page, '/api/iam/users');
  expect(read).toEqual({ status: 403, code: 'AUTHORIZATION_DENIED' });
  // A mutation with a valid CSRF token is refused on the permission, and changes nothing.
  const adminId = sql(
    stack,
    `SELECT id FROM iam_application_user WHERE email = '${stack.adminEmail}'`,
  );
  const suspend = await user.page.evaluate(async (target) => {
    const csrf = (await (await fetch('/api/auth/csrf')).json()) as { token: string };
    const response = await fetch(`/api/iam/users/${target}/suspend`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-csrf-token': csrf.token },
      body: '{}',
    });
    return { status: response.status, code: ((await response.json()) as { code: string }).code };
  }, adminId);
  expect(suspend).toEqual({ status: 403, code: 'AUTHORIZATION_DENIED' });
  expect(sql(stack, `SELECT access_state FROM iam_application_user WHERE id = '${adminId}'`)).toBe(
    'ACTIVE',
  );
});

test('J-13 bootstrap refuses a second administrator and recovery while one is ACTIVE', async ({
  stack,
}) => {
  const email = `second-admin-${randomBytes(4).toString('hex')}@example.test`;
  expect(runBootstrap(stack, ['--email', email, '--display-name', 'E2E second'])).toBe(2);
  expect(
    runBootstrap(stack, [
      '--email',
      email,
      '--display-name',
      'E2E second',
      '--recovery',
      '--reason',
      'e2e refusal check',
    ]),
  ).toBe(2);
  expect(sql(stack, `SELECT count(*) FROM iam_application_user WHERE email = '${email}'`)).toBe(
    '0',
  );
});

test('J-12 the running server schedules housekeeping, which deletes an expired login attempt', async ({
  stack,
}) => {
  // Since IAM-R09 nothing but housekeeping deletes another sign-in's attempt (D-10).
  const handle = randomBytes(32).toString('base64url').slice(0, 43);
  const id = sql(
    stack,
    `INSERT INTO auth_login_attempt (handle_hash, state, nonce, code_verifier, created_at, expires_at) ` +
      `VALUES ('${handle}', 'e2e', 'e2e', 'e2e', now() - interval '20 minutes', ` +
      `now() - interval '10 minutes') RETURNING id`,
  ).split(/\r?\n/)[0];
  await expect
    .poll(() => sql(stack, `SELECT count(*) FROM auth_login_attempt WHERE id = '${id}'`), {
      // One housekeeping interval (60 s) after the server started, plus margin.
      timeout: 120_000,
      intervals: [2_000],
    })
    .toBe('0');
});
