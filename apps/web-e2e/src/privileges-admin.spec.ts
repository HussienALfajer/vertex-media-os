import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/**
 * The department, role and permission administration screens of the production build in a real
 * browser, in Arabic (RTL) and English (LTR), with an accessibility scan (IAM-R08C D-14). As in
 * `users-admin.spec.ts`, the browser's `/api` requests are answered in the page with the API's
 * documented shapes; signed-in journeys through the real API belong to IAM-MP-15. Synthetic data.
 */

const ADMIN = {
  id: '0b7c7f2e-0000-4000-8000-000000000001',
  email: 'admin@example.test',
  displayName: 'مديرة النظام',
};
const CODES = [
  'iam.departments.manage',
  'iam.departments.read',
  'iam.permissions.read',
  'iam.roles.manage',
  'iam.roles.read',
  'iam.users.read',
];

const DEPARTMENT = {
  id: '0b7c7f2e-0000-4000-8000-0000000000d1',
  code: 'ops',
  name: 'العمليات',
  description: 'فريق التشغيل',
  state: 'ACTIVE',
  version: 3,
};
const ROLE = {
  id: '0b7c7f2e-0000-4000-8000-0000000000e1',
  code: 'editor',
  name: 'محرر',
  description: null,
  state: 'ACTIVE',
  isSystem: false,
  version: 2,
  permissionCodes: ['iam.users.read'],
};
const CATALOG = [
  {
    code: 'iam.users.read',
    owningModule: 'iam',
    name: 'عرض المستخدمين',
    description: 'عرض دليل المستخدمين وتفاصيلهم.',
    state: 'ACTIVE',
    sensitivity: 'STANDARD',
  },
  {
    code: 'iam.roles.manage',
    owningModule: 'iam',
    name: 'إدارة الأدوار',
    description: 'إنشاء الأدوار المخصصة وتعديل صلاحياتها.',
    state: 'ACTIVE',
    sensitivity: 'PRIVILEGED',
  },
];

async function answerApi(page: Page) {
  await page.route('**/api/**', async (route) => {
    const { pathname } = new URL(route.request().url());
    const reply = (body: unknown) =>
      route.fulfill({ status: 200, contentType: 'application/json', json: body });
    const pageOf = (items: unknown[], total = items.length) => ({
      items,
      page: 1,
      pageSize: 25,
      total,
    });
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
    if (pathname === '/api/iam/departments') return reply(pageOf([DEPARTMENT]));
    if (pathname === `/api/iam/departments/${DEPARTMENT.id}`) return reply(DEPARTMENT);
    if (pathname === '/api/iam/roles') return reply(pageOf([ROLE]));
    if (pathname === `/api/iam/roles/${ROLE.id}`) return reply(ROLE);
    if (pathname === '/api/iam/permissions') return reply(pageOf(CATALOG));
    if (pathname === '/api/iam/users') return reply(pageOf([], 4));
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

test('department administration is accessible in Arabic RTL, including the deactivation confirmation', async ({
  page,
}) => {
  const pageErrors: Error[] = [];
  page.on('pageerror', (error) => pageErrors.push(error));
  await answerApi(page);

  await page.goto('/departments');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.getByRole('heading', { level: 1, name: 'الأقسام' })).toBeVisible();
  const row = page.getByRole('row').filter({ hasText: 'ops' });
  await expect(row).toContainText('نشط');
  await expectAccessible(page);

  await row.getByRole('link', { name: 'العمليات' }).click();
  await expect(page).toHaveURL(`/departments/${DEPARTMENT.id}`);
  await expect(page.getByRole('heading', { level: 1, name: 'العمليات' })).toBeVisible();
  await expect(page.getByText('عدد المستخدمين: 4')).toBeVisible();
  await expectAccessible(page);

  await page.getByRole('button', { name: 'إيقاف القسم' }).click();
  const dialog = page.getByRole('alertdialog', { name: 'إيقاف القسم؟' });
  await expect(dialog).toContainText('عدد الأعضاء بكل حالات الوصول: 4');
  await expect(dialog.getByRole('button', { name: 'إلغاء' })).toBeFocused();
  await expectAccessible(page);
  await dialog.getByRole('button', { name: 'إلغاء' }).click();
  await expect(dialog).toBeHidden();
  expect(pageErrors).toEqual([]);
});

test('the permission editor and its review are accessible in Arabic RTL', async ({ page }) => {
  const pageErrors: Error[] = [];
  page.on('pageerror', (error) => pageErrors.push(error));
  await answerApi(page);

  await page.goto(`/roles/${ROLE.id}`);
  await expect(page.getByRole('heading', { level: 1, name: 'محرر' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'صلاحيات الدور' })).toContainText('عرض المستخدمين');
  await expectAccessible(page);

  await page.getByRole('button', { name: 'تعديل الصلاحيات' }).click();
  const editor = page.getByRole('dialog', { name: 'صلاحيات الدور «محرر»' });
  await expect(editor.getByRole('checkbox', { name: /iam\.users\.read/ })).toBeChecked();
  await editor.getByRole('checkbox', { name: /iam\.roles\.manage/ }).check();
  await expectAccessible(page);

  await editor.getByRole('button', { name: 'مراجعة التغييرات' }).click();
  await expect(editor.getByRole('heading', { name: 'ستُضاف (1)' })).toBeVisible();
  await expect(editor).toContainText('تضيف صلاحية امتيازية');
  await expectAccessible(page);
  expect(pageErrors).toEqual([]);
});

test('the role list and the permission catalog are accessible in English LTR', async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem('vertex.ui.preferences', JSON.stringify({ version: 1, language: 'en' })),
  );
  await answerApi(page);
  await page.goto('/roles');
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
  await expect(page.getByRole('row').filter({ hasText: 'editor' })).toContainText('Custom role');
  await expectAccessible(page);

  await page.goto('/permissions');
  await expect(page.getByRole('row').filter({ hasText: 'iam.roles.manage' })).toContainText(
    'Privileged',
  );
  await expectAccessible(page);
});
