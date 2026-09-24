import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/**
 * The user administration screens of the production build in a real browser, in Arabic (RTL)
 * and English (LTR), with an accessibility scan (IAM-R08B D-15). A signed-in journey through the
 * real API needs Keycloak and belongs to IAM-MP-15, so here the browser's `/api` requests are
 * answered in the page with the API's documented shapes. Synthetic data only.
 */

const ADMIN = {
  id: '0b7c7f2e-0000-4000-8000-000000000001',
  email: 'admin@example.test',
  displayName: 'مديرة النظام',
};
const TARGET = '0b7c7f2e-0000-4000-8000-000000000002';
const CODES = [
  'iam.departments.read',
  'iam.roles.read',
  'iam.sessions.revoke',
  'iam.users.create',
  'iam.users.manage-access',
  'iam.users.manage-departments',
  'iam.users.manage-roles',
  'iam.users.read',
  'iam.users.update',
];

const department = { id: '0b7c7f2e-0000-4000-8000-0000000000d1', code: 'ops', name: 'العمليات' };
const role = { id: '0b7c7f2e-0000-4000-8000-0000000000e1', code: 'editor', name: 'محرر' };
const target = {
  id: TARGET,
  email: 'sara@example.test',
  displayName: 'سارة',
  accessState: 'INVITED',
  identitySyncState: 'SYNCED',
  invitationDeliveryState: 'SENT',
  invitationSentAt: '2026-09-20T08:00:00.000Z',
  firstActivatedAt: null,
  lastAccessStateChangedAt: '2026-09-20T08:00:00.000Z',
  createdAt: '2026-09-20T08:00:00.000Z',
  updatedAt: '2026-09-20T08:00:00.000Z',
  version: 1,
  departments: [{ ...department, state: 'ACTIVE', isPrimary: true }],
  roles: [{ ...role, state: 'ACTIVE', isSystem: false }],
};

async function answerApi(page: Page) {
  await page.route('**/api/**', async (route) => {
    const { pathname } = new URL(route.request().url());
    const method = route.request().method();
    const reply = (body: unknown) =>
      route.fulfill({ status: 200, contentType: 'application/json', json: body });
    if (pathname === '/api/health/live') return reply({ status: 'ok' });
    if (pathname === '/api/auth/session')
      return reply({
        user: ADMIN,
        session: {
          idleExpiresAt: '2026-09-24T10:00:00.000Z',
          absoluteExpiresAt: '2026-09-24T18:00:00.000Z',
        },
      });
    if (pathname === '/api/iam/me')
      return reply({ user: ADMIN, departments: [], permissionCodes: CODES });
    if (pathname === '/api/iam/users' && method === 'GET') {
      const summary = {
        id: target.id,
        email: target.email,
        displayName: target.displayName,
        accessState: target.accessState,
        identitySyncState: target.identitySyncState,
        invitationDeliveryState: target.invitationDeliveryState,
        departments: target.departments,
        roles: target.roles,
      };
      return reply({ items: [summary], page: 1, pageSize: 25, total: 1 });
    }
    if (pathname === `/api/iam/users/${TARGET}`) return reply(target);
    return route.fulfill({
      status: 404,
      contentType: 'application/problem+json',
      json: { status: 404, code: 'NOT_FOUND' },
    });
  });
}

async function expectAccessible(page: Page) {
  // Scan the settled page: an overlay's entry transition blends colours while it runs.
  await page.waitForFunction(() =>
    document
      .getAnimations()
      .every(
        (animation) =>
          animation.playState !== 'running' ||
          animation.effect?.getTiming().iterations === Infinity,
      ),
  );
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(
    results.violations.map(
      ({ id, nodes }) => `${id}: ${nodes.map((node) => node.target.join(' ')).join(' | ')}`,
    ),
  ).toEqual([]);
}

test('the user directory and detail are accessible in Arabic RTL, including a confirmation', async ({
  page,
}) => {
  const pageErrors: Error[] = [];
  page.on('pageerror', (error) => pageErrors.push(error));
  await answerApi(page);

  await page.goto('/users');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.getByRole('heading', { level: 1, name: 'المستخدمون' })).toBeVisible();
  const row = page.getByRole('row').filter({ hasText: 'sara@example.test' });
  await expect(row).toContainText('مدعو');
  await expect(row).toContainText('تمت المزامنة');
  await expect(row).toContainText('أُرسلت الدعوة');
  await expectAccessible(page);

  await row.getByRole('link', { name: 'سارة' }).click();
  await expect(page).toHaveURL(`/users/${TARGET}`);
  await expect(page.getByRole('heading', { level: 1, name: 'سارة' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'حالة الحساب' })).toContainText('أُرسلت الدعوة');
  await expectAccessible(page);

  await page.getByRole('button', { name: 'إجراءات المستخدم' }).click();
  await page.getByRole('menuitem', { name: 'تعطيل المستخدم' }).click();
  const dialog = page.getByRole('alertdialog', { name: 'تعطيل المستخدم؟' });
  await expect(dialog).toContainText('sara@example.test');
  await expect(dialog.getByRole('button', { name: 'إلغاء' })).toBeFocused();
  await expectAccessible(page);
  await dialog.getByRole('button', { name: 'إلغاء' }).click();
  await expect(dialog).toBeHidden();
  expect(pageErrors).toEqual([]);
});

test('the user detail is accessible in English LTR', async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem('vertex.ui.preferences', JSON.stringify({ version: 1, language: 'en' })),
  );
  await answerApi(page);
  await page.goto(`/users/${TARGET}`);
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
  await expect(page.getByRole('region', { name: 'Account status' })).toContainText(
    'Invitation sent',
  );
  await expectAccessible(page);
});
