import { expect, test } from '@playwright/test';
import { openLab } from '../support.js';

test.describe('overlay ownership (§17.2, §31)', () => {
  test('a dialog focuses its first field, keeps Tab inside, inerts the page and restores the opener', async ({
    page,
  }) => {
    await openLab(page, '/dev/ui/overlays');
    const opener = page.getByRole('button', { name: 'تعديل المستخدم' });
    await opener.click();
    const dialog = page.getByRole('dialog', { name: 'تعديل المستخدم' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('textbox', { name: 'الاسم' })).toBeFocused();

    // Tab and Shift+Tab never leave the modal. At its boundary focus briefly lands on the
    // primitive's hidden focus guard, which returns it inside within a frame; a real escape
    // to the page never settles inside and fails this check.
    for (let step = 0; step < 12; step += 1) {
      await page.keyboard.press(step % 3 === 2 ? 'Shift+Tab' : 'Tab');
      await expect
        .poll(
          () => page.evaluate(() => Boolean(document.activeElement?.closest('[role="dialog"]'))),
          { timeout: 1_000 },
        )
        .toBe(true);
    }
    // The page behind is inert or hidden from assistive technology while the modal is open.
    const behindReachable = await page.evaluate(() => {
      const main = document.querySelector('main');
      return main !== null && main.closest('[inert], [aria-hidden="true"]') === null && !main.inert;
    });
    expect(behindReachable).toBe(false);

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(opener).toBeFocused();
  });

  test('a dirty dialog asks before closing and keeps the draft', async ({ page }) => {
    await openLab(page, '/dev/ui/overlays');
    await page.getByRole('button', { name: 'تعديل المستخدم' }).click();
    const dialog = page.getByRole('dialog', { name: 'تعديل المستخدم' });
    const name = dialog.getByRole('textbox', { name: 'الاسم' });
    await name.fill('اسم معدّل');
    await page.keyboard.press('Escape');
    const keep = dialog.getByRole('button', { name: 'متابعة التحرير' });
    await expect(keep).toBeFocused();
    await keep.press('Enter');
    await expect(name).toHaveValue('اسم معدّل');
    await dialog.getByRole('button', { name: 'إلغاء' }).click();
    await dialog.getByRole('button', { name: 'تجاهل التغييرات' }).click();
    await expect(dialog).toBeHidden();
  });

  test('Escape closes the owned menu first, then the dialog', async ({ page }) => {
    await openLab(page, '/dev/ui/overlays');
    await page.getByRole('button', { name: 'تعديل المستخدم' }).click();
    const dialog = page.getByRole('dialog', { name: 'تعديل المستخدم' });
    await dialog.getByRole('button', { name: 'إجراءات إضافية' }).click();
    const menu = page.getByRole('menu');
    await expect(menu).toBeVisible();
    // The menu belongs to the dialog: it is rendered inside it.
    expect(await menu.evaluate((node) => Boolean(node.closest('[role="dialog"]')))).toBe(true);
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
    await expect(dialog).toBeVisible();
    // Keep pressing Escape: supplemental tooltip (if shown) closes next, then the dialog.
    await expect(async () => {
      await page.keyboard.press('Escape');
      await expect(dialog).toBeHidden({ timeout: 500 });
    }).toPass({ timeout: 5_000 });
  });

  test('a destructive confirmation starts on the safe action and ignores outside presses', async ({
    page,
  }) => {
    await openLab(page, '/dev/ui/overlays');
    const opener = page.getByRole('button', { name: 'تعطيل المستخدم', exact: true });
    await opener.click();
    const alert = page.getByRole('alertdialog', { name: 'تعطيل المستخدم؟' });
    await expect(alert.getByRole('button', { name: 'إلغاء' })).toBeFocused();
    await page.mouse.click(5, 5);
    await expect(alert).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(alert).toBeHidden();
    await expect(opener).toBeFocused();
  });

  test('a confirmation opened from a row menu returns focus to that menu trigger', async ({
    page,
  }) => {
    await openLab(page, '/dev/ui/iam');
    const trigger = page.getByRole('button', { name: 'إجراءات Omar Farouk (demo)' });
    await trigger.focus();
    await page.keyboard.press('Enter');
    await page.getByRole('menuitem', { name: 'تعطيل المستخدم' }).click();
    const alert = page.getByRole('alertdialog', { name: 'تعطيل المستخدم؟' });
    await expect(alert.getByRole('button', { name: 'إلغاء' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(alert).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test('focus falls back to a surviving control when the trigger is removed', async ({ page }) => {
    await openLab(page, '/dev/ui/overlays');
    await page.getByRole('button', { name: 'حذف المسودة VX-2026-012' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'حذف المسودة' }).click();
    await expect(page.getByRole('button', { name: 'حذف المسودة VX-2026-012' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'مسودات تجريبية' })).toBeFocused();
  });

  for (const [language, edge] of [
    ['ar', 'right'],
    ['en', 'left'],
  ] as const) {
    test(`the navigation drawer attaches to inline-start (${edge} edge in ${language})`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 1000, height: 800 });
      await openLab(page, '/dev/ui/overlays', { language });
      await page
        .getByRole('button', { name: language === 'ar' ? 'توسيع التنقل' : 'Expand navigation' })
        .click();
      const drawer = page.getByRole('dialog', {
        name: language === 'ar' ? 'التنقل الرئيسي' : 'Main navigation',
      });
      await expect(drawer).toBeVisible();
      await expect(async () => {
        const box = await drawer.boundingBox();
        // Distance between the drawer and the viewport edge it must attach to.
        const gap = box ? (edge === 'right' ? 1000 - (box.x + box.width) : box.x) : Number.NaN;
        expect(box?.width).toBeLessThan(1000);
        expect(Math.round(gap)).toBe(0);
      }).toPass();
      await page.keyboard.press('Escape');
      await expect(drawer).toBeHidden();
    });
  }
});
