import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';

interface Stack {
  webOrigin: string;
  adminEmail: string;
  adminPassword: string;
}

function stack(): Stack {
  const raw = process.env['VERTEX_IAM_E2E_STACK'];
  if (!raw) throw new Error('IAM stack was not started');
  return JSON.parse(raw) as Stack;
}

async function adminWrite<T>(
  page: Page,
  method: 'POST' | 'PUT',
  path: string,
  body: unknown,
): Promise<T> {
  const answer = await page.evaluate(
    async ({ method, path, body }) => {
      const csrf = await fetch('/api/auth/csrf', { credentials: 'same-origin' });
      if (!csrf.ok) throw new Error(`CSRF request failed: ${csrf.status}`);
      const { token } = (await csrf.json()) as { token: string };
      const response = await fetch(path, {
        method,
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json', 'x-csrf-token': token },
        body: JSON.stringify(body),
      });
      return { status: response.status, body: await response.json() };
    },
    { method, path, body },
  );
  expect(answer.status, `${method} ${path}: ${JSON.stringify(answer.body)}`).toBeGreaterThanOrEqual(
    200,
  );
  expect(answer.status, `${method} ${path}: ${JSON.stringify(answer.body)}`).toBeLessThan(300);
  return answer.body as T;
}

test('administrator signs in, creates a staff account, and staff signs in with email and password', async ({
  browser,
}) => {
  const { webOrigin, adminEmail, adminPassword } = stack();
  const email = `staff-${randomUUID()}@example.test`;
  const password = `staff-test-${randomUUID()}-password`;
  const admin = await browser.newContext({ locale: 'en-US' });
  const page = await admin.newPage();
  try {
    await page.goto(webOrigin);
    await page.getByLabel('البريد الإلكتروني').fill(adminEmail);
    await page.getByLabel('كلمة المرور').fill(adminPassword);
    await page.getByRole('button', { name: 'تسجيل الدخول' }).click();
    await expect(page.getByRole('region', { name: 'الحساب' })).toContainText(adminEmail);
    expect(await page.evaluate(() => document.cookie)).toBe('');

    const roleName = `Staff readers ${randomUUID().slice(0, 8)}`;
    const createdRole = await adminWrite<{ id: string; version: number }>(
      page,
      'POST',
      '/api/iam/roles',
      { code: `staff-readers-${randomUUID().slice(0, 8)}`, name: roleName },
    );
    const mappedRole = await adminWrite<{ id: string; version: number }>(
      page,
      'PUT',
      `/api/iam/roles/${createdRole.id}/permissions`,
      { expectedVersion: createdRole.version, permissionCodes: ['iam.users.read'] },
    );

    await page.goto(`${webOrigin}/users/new`);
    await page.getByLabel('البريد الإلكتروني').fill(email);
    await page.getByLabel('كلمة المرور').fill(password);
    await page.getByRole('checkbox', { name: new RegExp(roleName) }).check();
    await page.getByRole('button', { name: 'إضافة المستخدم' }).click();
    await expect(page).toHaveURL(/\/users\/[0-9a-f-]+/);
    await expect(page.getByText(email).first()).toBeVisible();
    const staffId = new URL(page.url()).pathname.split('/').at(-1);
    expect(staffId).toMatch(/^[0-9a-f-]{36}$/);

    const staff = await browser.newContext({ locale: 'en-US' });
    try {
      const staffPage = await staff.newPage();
      await staffPage.goto(webOrigin);
      await staffPage.getByLabel('البريد الإلكتروني').fill(email);
      await staffPage.getByLabel('كلمة المرور').fill(password);
      await staffPage.getByRole('button', { name: 'تسجيل الدخول' }).click();
      await expect(staffPage.getByRole('region', { name: 'الحساب' })).toContainText(email);
      expect(await staffPage.evaluate(() => document.cookie)).toBe('');
      const allowed = await staffPage.evaluate(
        async () => (await fetch('/api/iam/users', { credentials: 'same-origin' })).status,
      );
      expect(allowed).toBe(200);

      await adminWrite(page, 'PUT', `/api/iam/roles/${createdRole.id}/permissions`, {
        expectedVersion: mappedRole.version,
        permissionCodes: [],
      });
      const denied = await staffPage.evaluate(
        async () => (await fetch('/api/iam/users', { credentials: 'same-origin' })).status,
      );
      expect(denied).toBe(403);

      await adminWrite(page, 'POST', `/api/iam/users/${staffId}/suspend`, {
        reason: 'E2E access test',
      });
      const ended = await staffPage.evaluate(
        async () => (await fetch('/api/iam/me', { credentials: 'same-origin' })).status,
      );
      expect(ended).toBe(401);
    } finally {
      await staff.close();
    }
  } finally {
    await admin.close();
  }
});

test('invalid credentials share a generic failure and signing out ends the session', async ({
  page,
}) => {
  const { webOrigin, adminEmail, adminPassword } = stack();
  await page.goto(webOrigin);
  const email = page.getByLabel('البريد الإلكتروني');
  const password = page.getByLabel('كلمة المرور');
  const signIn = page.getByRole('button', { name: 'تسجيل الدخول' });

  await email.fill(adminEmail);
  await password.fill('invalid-credential');
  await signIn.click();
  await expect(page.getByText('لم يكتمل تسجيل الدخول. حاول مرة أخرى.')).toBeVisible();
  await expect(password).toHaveValue('');

  await email.fill(`unknown-${randomUUID()}@example.test`);
  await password.fill('invalid-credential');
  await signIn.click();
  await expect(page.getByText('لم يكتمل تسجيل الدخول. حاول مرة أخرى.')).toBeVisible();
  await expect(password).toHaveValue('');

  await email.fill(adminEmail);
  await password.fill(adminPassword);
  await signIn.click();
  await expect(page.getByRole('region', { name: 'الحساب' })).toContainText(adminEmail);
  await page.getByRole('button', { name: 'تسجيل الخروج' }).click();
  await expect(page.getByRole('heading', { name: 'تسجيل الدخول إلى Vertex OS' })).toBeVisible();
  const status = await page.evaluate(
    async () => (await fetch('/api/auth/session', { credentials: 'same-origin' })).status,
  );
  expect(status).toBe(401);
});
