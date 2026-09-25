import { expect, test } from '@playwright/test';

test('the web shell loads in Arabic, offers sign-in and observes the live API through its own origin', async ({
  page,
}) => {
  const pageErrors: Error[] = [];
  page.on('pageerror', (error) => pageErrors.push(error));
  const liveness = page.waitForResponse(
    (response) => new URL(response.url()).pathname === '/api/health/live',
  );
  const session = page.waitForResponse(
    (response) => new URL(response.url()).pathname === '/api/auth/session',
  );

  await page.goto('/');

  await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  // No session cookie: the API answers 401 and the app shows the signed-out entry.
  expect((await session).status()).toBe(401);
  await expect(
    page.getByRole('heading', { level: 1, name: 'تسجيل الدخول إلى Vertex OS' }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'تسجيل الدخول' })).toBeVisible();
  await expect(page.getByLabel('البريد الإلكتروني')).toBeVisible();
  await expect(page.getByLabel('كلمة المرور')).toBeVisible();
  const livenessResponse = await liveness;
  expect(livenessResponse.status()).toBe(200);
  // The browser calls the web origin's /api path (Vite proxy), not a cross-origin API URL.
  expect(new URL(livenessResponse.url()).origin).toBe(new URL(page.url()).origin);
  await expect(page.getByRole('region', { name: 'حالة النظام' }).getByRole('status')).toHaveText(
    'الاتصال بالواجهة البرمجية متاح',
  );
  expect(pageErrors).toEqual([]);
});

test('the same journey works in English', async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem('vertex.ui.preferences', JSON.stringify({ version: 1, language: 'en' })),
  );
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
  await expect(page.getByRole('heading', { level: 1, name: 'Sign in to Vertex OS' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'System status' }).getByRole('status')).toHaveText(
    'API connection available',
  );
});

test('the signed-out form accepts email and password without exposing them in a URL', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByLabel('البريد الإلكتروني').fill('nobody@example.test');
  await page.getByLabel('كلمة المرور').fill('example-test-password-only');
  await page.getByRole('button', { name: 'تسجيل الدخول' }).click();
  await expect(page.getByText('تعذّر إكمال تسجيل الدخول')).toBeVisible();
  await expect(page).toHaveURL((url) => url.pathname === '/' && url.search === '');
  expect(await page.evaluate(() => document.cookie)).toBe('');
});
