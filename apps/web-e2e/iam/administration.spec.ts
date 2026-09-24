import { randomBytes } from 'node:crypto';
import { fetchFromPage } from '../test-support/iam/browser-context.js';
import { expect, test, type AdminApi } from '../test-support/iam/fixtures.js';
import {
  completeInvitation,
  submitKeycloakPassword,
  signIn,
} from '../test-support/iam/keycloak-pages.js';
import { actionLink, recordSecret, sql, waitForMail } from '../test-support/iam/stack.js';

/**
 * Administration through the real API, Keycloak and PostgreSQL (IAM-R09B J-03 to J-06, J-08;
 * spec Section 46.7; IAM-R08B D-15, IAM-R08C D-14). The step under test runs in the web app;
 * setup that another journey already covers goes through the API.
 */

const code = (prefix: string) => `${prefix}-${randomBytes(4).toString('hex')}`;

interface Versioned {
  readonly id: string;
  readonly version: number;
}

/** A custom role that maps `permissionCodes`, created through the API. */
async function roleWith(
  api: AdminApi,
  name: string,
  permissionCodes: string[],
): Promise<Versioned> {
  const role = await api.send<Versioned>('POST', '/api/iam/roles', { code: code('role'), name });
  await api.send('PUT', `/api/iam/roles/${role.id}/permissions`, {
    expectedVersion: role.version,
    permissionCodes,
  });
  return role;
}

test('J-03 an administrator invites a user, who completes the invitation and activates at first sign-in', async ({
  admin,
  openContext,
  stack,
  uniqueEmail,
}) => {
  const email = uniqueEmail('invited');
  await admin.goto('/users/new');
  await admin.getByLabel('Email').fill(email);
  await admin.getByLabel('Display name').fill('E2E invited');
  await admin.getByRole('button', { name: 'Invite user' }).click();
  await expect(admin.getByText('User invited', { exact: true })).toBeVisible();
  const status = admin.getByRole('region', { name: 'Account status' });
  await expect(status).toContainText('Invited');
  await expect(status).toContainText('Invitation sent');

  const invitee = await (await openContext()).newPage();
  const device = await completeInvitation(
    invitee,
    actionLink(await waitForMail(stack.mailpitUrl, email)),
  );
  recordSecret(stack, device.secret);
  await signIn(invitee, email, device);
  await expect(invitee.getByRole('region', { name: 'Account' })).toContainText('E2E invited');

  // First activation: the administrator now sees the account Active with its activation time.
  await admin.reload();
  await expect(status).toContainText('Active');
  await expect(status).not.toContainText('Not activated yet');
});

test('J-04 an administrator assigns a role, and the holder gains its access on the next request', async ({
  activeUser,
  admin,
  adminApi,
}) => {
  const roleName = `E2E readers ${code('n')}`;
  await roleWith(adminApi, roleName, ['iam.users.read']);
  const user = await activeUser({ label: 'assignee' });
  await expect(user.page.getByRole('link', { name: 'Users' })).toBeHidden();
  expect((await fetchFromPage(user.page, '/api/iam/users')).status).toBe(403);

  await admin.goto(`/users/${user.id}`);
  await admin.getByRole('button', { name: 'Assign role' }).click();
  const dialog = admin.getByRole('dialog', { name: 'Assign a role to the user' });
  await dialog.getByLabel('Role').selectOption({ label: roleName });
  await dialog.getByRole('button', { name: 'Assign role' }).click();
  await expect(admin.getByText('Role assigned', { exact: true })).toBeVisible();

  await user.page.reload();
  await user.page.getByRole('link', { name: 'Users' }).click();
  await expect(user.page.getByRole('heading', { level: 1, name: 'Users' })).toBeVisible();
  await expect(user.page.getByRole('row').filter({ hasText: user.email })).toBeVisible();
  expect((await fetchFromPage(user.page, '/api/iam/users')).status).toBe(200);
});

test('J-05 removing a permission through the review step takes effect on the holder’s next request', async ({
  activeUser,
  admin,
  adminApi,
}) => {
  const role = await roleWith(adminApi, `E2E reviewers ${code('n')}`, ['iam.users.read']);
  const user = await activeUser({ label: 'holder', roleIds: [role.id] });
  await user.page.getByRole('link', { name: 'Users' }).click();
  await expect(user.page.getByRole('heading', { level: 1, name: 'Users' })).toBeVisible();

  await admin.goto(`/roles/${role.id}`);
  await admin.getByRole('button', { name: 'Edit permissions' }).click();
  await admin.getByRole('checkbox', { name: /iam\.users\.read/ }).uncheck();
  await admin.getByRole('button', { name: 'Review changes' }).click();
  await expect(admin.getByText('Removed (1)')).toBeVisible();
  await admin.getByRole('button', { name: 'Save permission changes' }).click();
  await expect(admin.getByText('Role permissions saved', { exact: true })).toBeVisible();

  // No stale privilege: the next request is refused by the API, and the UI follows.
  const refused = await fetchFromPage(user.page, '/api/iam/users');
  expect(refused.status).toBe(403);
  await user.page.reload();
  await expect(user.page.getByRole('link', { name: 'Users' })).toBeHidden();
  await user.page.goto('/users');
  await expect(user.page.getByText('You do not have access to this page')).toBeVisible();
});

test('J-06 suspension ends the user’s session, and Keycloak refuses their next sign-in', async ({
  activeUser,
  admin,
  stack,
}) => {
  const user = await activeUser({ label: 'suspended' });

  await admin.goto(`/users/${user.id}`);
  await admin.getByRole('button', { name: 'User actions' }).click();
  await admin.getByRole('menuitem', { name: 'Suspend access' }).click();
  const dialog = admin.getByRole('alertdialog', { name: 'Suspend this user’s access?' });
  await expect(dialog).toContainText(user.email);
  await dialog.getByRole('button', { name: 'Suspend access' }).click();
  await expect(admin.getByText('Access suspended', { exact: true })).toBeVisible();

  await user.page.reload();
  await expect(user.page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
  await expect(user.page.getByRole('region', { name: 'Account' })).toBeHidden();

  // The identity is disabled in Keycloak, so its password and OTP no longer open a session.
  await user.page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await submitKeycloakPassword(user.page, user.email);
  await expect(user.page.locator('body')).toContainText('Account is disabled');
  expect(
    sql(
      stack,
      `SELECT count(*) FROM auth_session WHERE user_id = '${user.id}' AND revoked_at IS NULL`,
    ),
  ).toBe('0');
});

test('J-08 deactivating a department, after its confirmation, leaves the member’s context', async ({
  activeUser,
  admin,
  adminApi,
}) => {
  const name = `E2E department ${code('d')}`;
  const department = await adminApi.send<Versioned>('POST', '/api/iam/departments', {
    code: code('dept'),
    name,
  });
  const user = await activeUser({
    label: 'member',
    memberships: [{ departmentId: department.id, isPrimary: true }],
  });
  await expect(user.page.getByRole('region', { name: 'Account' })).toContainText(name);

  await admin.goto(`/departments/${department.id}`);
  await admin.getByRole('button', { name: 'Deactivate department' }).click();
  const dialog = admin.getByRole('alertdialog', { name: 'Deactivate the department?' });
  await expect(dialog).toContainText('Members in any access state: 1');
  await dialog.getByRole('button', { name: 'Deactivate department' }).click();
  await expect(admin.getByText('Department deactivated', { exact: true })).toBeVisible();

  await user.page.reload();
  await expect(user.page.getByRole('region', { name: 'Account' })).toContainText(user.displayName);
  await expect(user.page.getByRole('region', { name: 'Account' })).not.toContainText(name);
});
