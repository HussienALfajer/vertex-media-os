import { expect, test } from '@playwright/test';
import { openLab, pageOverflowsInline } from '../support.js';

test.describe('data tables (§29)', () => {
  test('sorting is announced, reflected in aria-sort and keeps focus on the header button', async ({
    page,
  }) => {
    await openLab(page, '/dev/ui/iam');
    const sort = page
      .getByRole('columnheader', { name: 'المستخدم' })
      .getByRole('button', { name: 'المستخدم' });
    await sort.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('columnheader', { name: 'المستخدم' })).toHaveAttribute(
      'aria-sort',
      'ascending',
    );
    await expect(sort).toBeFocused();
    await expect(page.locator('[aria-live="polite"]')).toHaveText('مرتب حسب المستخدم تصاعديًا');
    await sort.click();
    await expect(page.getByRole('columnheader', { name: 'المستخدم' })).toHaveAttribute(
      'aria-sort',
      'descending',
    );
  });

  test('page selection is explicit, mixed and replaced in place by the bulk bar', async ({
    page,
  }) => {
    await openLab(page, '/dev/ui/iam');
    const all = page.getByRole('checkbox', { name: 'تحديد السجلات المتاحة في هذه الصفحة' });
    await all.check();
    await expect(page.getByRole('group', { name: /تم تحديد 7 سجلات/ })).toBeVisible();
    await page.getByRole('checkbox', { name: /^تحديد سارة الخطيب/ }).uncheck();
    await expect(all).toBeChecked({ indeterminate: true });
    await page.getByRole('button', { name: 'إلغاء التحديد' }).click();
    await expect(page.getByRole('button', { name: 'دعوة مستخدم' })).toBeVisible();
  });

  test('changing a filter clears the selection and distinguishes no matches from no records', async ({
    page,
  }) => {
    await openLab(page, '/dev/ui/iam');
    await page.getByRole('checkbox', { name: /^تحديد Omar Farouk/ }).check();
    await page.getByRole('combobox', { name: 'حالة الوصول' }).selectOption('SUSPENDED');
    await expect(page.getByRole('group', { name: /تم تحديد/ })).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: 'إزالة عامل التصفية: حالة الوصول: موقوف مؤقتًا' }),
    ).toBeVisible();
    const search = page.getByRole('searchbox', { name: 'البحث في المستخدمين' });
    await search.fill('لا يوجد أحد بهذا الاسم');
    await search.press('Enter');
    await expect(page.getByRole('heading', { name: 'لا توجد نتائج مطابقة' })).toBeVisible();
    await expect(search).toBeFocused();
  });

  test('a narrow viewport scrolls the table inside its named region, never the page', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openLab(page, '/dev/ui/tables');
    const region = page.getByRole('region', { name: 'مستندات مالية تجريبية' });
    await expect(region).toHaveAttribute('tabindex', '0');
    expect(await region.evaluate((node) => node.scrollWidth > node.clientWidth)).toBe(true);
    expect(await pageOverflowsInline(page)).toBe(false);
    await expect(page.getByText('مرّر أفقيًا لعرض بقية الأعمدة.')).toBeVisible();
  });
});
