import { expect, test } from '@playwright/test';
import { openLab } from '../support.js';

test.describe('forms (§28)', () => {
  test('a failed submission focuses the error summary, whose links focus each field', async ({
    page,
  }) => {
    await openLab(page, '/dev/ui/forms');
    const form = page.locator('[data-specimen="form-validation"]');
    await form.getByRole('button', { name: 'حفظ التغييرات' }).click();
    const summary = form.getByText('يوجد خطآن يحتاجان إلى تصحيح');
    await expect(summary).toBeVisible();
    await expect(summary.locator('..')).toBeFocused();
    await form.getByRole('link', { name: 'هذا الرمز مستخدم بالفعل.' }).click();
    const code = form.getByRole('textbox', { name: 'رمز الدور' });
    await expect(code).toBeFocused();
    await expect(code).toHaveAttribute('aria-invalid', 'true');
    await expect(code).toHaveAccessibleDescription(
      /أحرف لاتينية صغيرة ونقاط\..*هذا الرمز مستخدم بالفعل\./,
    );
  });

  test('choices expose native checked, mixed and disabled states', async ({ page }) => {
    await openLab(page, '/dev/ui/forms');
    await expect(page.getByRole('checkbox', { name: 'ملخص يومي' })).toBeChecked();
    await expect(page.getByRole('checkbox', { name: 'كل التنبيهات (مختلط)' })).toBeChecked({
      indeterminate: true,
    });
    await expect(page.getByRole('checkbox', { name: 'تنبيهات المالية' })).toBeDisabled();
    await expect(
      page.getByRole('checkbox', { name: 'تنبيهات المالية' }),
    ).toHaveAccessibleDescription('تتطلب صلاحية المالية.');
    const choice = page.getByRole('radio', { name: 'جدول' });
    await page.getByText('جدول', { exact: true }).click();
    await expect(choice).toBeChecked();
  });

  test('Enter in a search field searches without submitting a form', async ({ page }) => {
    await openLab(page, '/dev/ui/forms');
    const search = page.getByRole('searchbox', { name: 'البحث في العملاء' });
    await search.fill('الأفق');
    await search.press('Enter');
    await expect(page.getByRole('status').filter({ hasText: 'آخر بحث:' })).toContainText('الأفق');
    await page.getByRole('button', { name: 'مسح البحث' }).click();
    await expect(search).toHaveValue('');
    await expect(search).toBeFocused();
  });
});

test.describe('RTL and bidirectional layout (§24)', () => {
  test('Arabic is first-run RTL and the logical order holds in the table', async ({ page }) => {
    await openLab(page, '/dev/ui/iam');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    const header = page.getByRole('table', { name: 'دليل المستخدمين' }).getByRole('row').first();
    const selection = await header.getByRole('columnheader').first().boundingBox();
    const identity = await header.getByRole('columnheader', { name: 'المستخدم' }).boundingBox();
    const actions = await header.getByRole('columnheader', { name: 'الإجراءات' }).boundingBox();
    // Selection, then identity, from the inline-start (right) edge; actions at inline-end.
    expect(selection && identity && selection.x > identity.x).toBe(true);
    expect(identity && actions && identity.x > actions.x).toBe(true);
  });

  test('embedded LTR values keep their order and only directional icons mirror', async ({
    page,
  }) => {
    await openLab(page, '/dev/ui/bidi');
    await expect(page.getByText('-1,234.50 USD', { exact: true })).toHaveAttribute('dir', 'ltr');
    await expect(page.getByText('+90 555 010 0200', { exact: true })).toHaveAttribute('dir', 'ltr');
    await openLab(page, '/dev/ui/foundations');
    const transform = (name: string) =>
      page
        .locator('li', { has: page.getByText(name, { exact: true }) })
        .locator('svg')
        .first()
        .evaluate((svg) => getComputedStyle(svg).transform);
    expect(await transform('chevron-end')).toBe('matrix(-1, 0, 0, 1, 0, 0)');
    expect(await transform('search')).toBe('none');
    expect(await transform('clock')).toBe('none');
  });

  for (const [language, next] of [
    ['ar', 'ArrowLeft'],
    ['en', 'ArrowRight'],
  ] as const) {
    test(`${next} moves to the logically next tab in ${language}`, async ({ page }) => {
      await openLab(page, '/dev/ui/navigation', { language });
      const tabs = page.getByRole('tablist').first().getByRole('tab');
      await tabs.first().focus();
      await page.keyboard.press(next);
      await expect(tabs.nth(1)).toBeFocused();
      await page.keyboard.press('End');
      await expect(tabs.nth(2)).toBeFocused();
    });
  }

  test('switches put the on-thumb at inline-end in both directions', async ({ page }) => {
    for (const language of ['ar', 'en'] as const) {
      await openLab(page, '/dev/ui/forms', { language });
      const control = page.getByRole('switch', {
        name: language === 'ar' ? 'إشعارات فورية' : 'Instant notifications',
      });
      await expect(control).toBeChecked();
      // Signed distance of the thumb centre from the track centre (positive = to the right).
      const offset = await control.evaluate((input) => {
        const centre = (element: Element) => {
          const box = element.getBoundingClientRect();
          return box.x + box.width / 2;
        };
        return centre(input.nextElementSibling ?? input) - centre(input);
      });
      // Checked: thumb at inline-end — left of centre in RTL, right of centre in LTR.
      expect(Math.sign(offset)).toBe(language === 'ar' ? -1 : 1);
    }
  });
});

test.describe('modes (§40.1)', () => {
  test('theme, language and density change live without losing focus or typed text', async ({
    page,
  }) => {
    await openLab(page, '/dev/ui');
    await page.getByRole('radio', { name: 'داكن' }).check();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.getByRole('radio', { name: 'مضغوطة' }).check();
    await expect(page.locator('html')).toHaveAttribute('data-density', 'compact');
    // Keyboard selection (a pointer press does not focus a radio in WebKit): focus must
    // survive the direction change on the very control that caused it.
    await page.getByRole('radio', { name: 'العربية (RTL)' }).focus();
    await page.keyboard.press('ArrowDown');
    const english = page.getByRole('radio', { name: 'English (LTR)' });
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
    await expect(english).toBeChecked();
    await expect(english).toBeFocused();
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  });
});
