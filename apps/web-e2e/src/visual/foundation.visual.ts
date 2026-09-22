import { expect, test, type Page } from '@playwright/test';
import { openLab, type LabModes } from '../lab/support.js';

/**
 * High-value visual baselines (docs/DESIGN_SYSTEM.md §41.2; plan §25.9). They supplement,
 * never replace, the behaviour tests. Inputs are deterministic: self-hosted fonts, static
 * synthetic fixtures with fixed dates, reduced motion, disabled animations and no network
 * beyond the local lab build. Every baseline change requires human design review — update
 * only with an explicit `--update-snapshots` run and inspect every changed image.
 */
const specimen = (page: Page, id: string) => page.locator(`[data-specimen="${id}"]`);

async function open(page: Page, path: string, modes: LabModes = {}, width = 1440) {
  await page.setViewportSize({ width, height: 900 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openLab(page, path, modes);
}

const AR_LIGHT: LabModes = { language: 'ar', theme: 'light', density: 'default' };
const AR_DARK: LabModes = { language: 'ar', theme: 'dark', density: 'default' };

test.describe('foundations', () => {
  test('colour roles — Arabic, Light and Dark', async ({ page }) => {
    await open(page, '/dev/ui/foundations', AR_LIGHT);
    await expect(specimen(page, 'color-roles')).toHaveScreenshot('color-roles-ar-light.png');
    await open(page, '/dev/ui/foundations', AR_DARK);
    await expect(specimen(page, 'color-roles')).toHaveScreenshot('color-roles-ar-dark.png');
  });

  test('typography and delivered families — Arabic shaping, diacritics, figures', async ({
    page,
  }) => {
    await open(page, '/dev/ui/foundations', AR_LIGHT);
    await expect(specimen(page, 'typography')).toHaveScreenshot('typography-ar-light.png');
    await expect(specimen(page, 'font-families')).toHaveScreenshot('font-families-ar-light.png');
  });

  test('bidirectional values keep their own order', async ({ page }) => {
    await open(page, '/dev/ui/bidi', AR_LIGHT);
    await expect(specimen(page, 'bidi-cases')).toHaveScreenshot('bidi-cases-ar-light.png');
  });
});

test.describe('controls and forms', () => {
  test('button variants and states — Arabic Light, English Dark Compact', async ({ page }) => {
    await open(page, '/dev/ui/actions', AR_LIGHT);
    await expect(specimen(page, 'button-matrix')).toHaveScreenshot('button-matrix-ar-light.png');
    await open(page, '/dev/ui/actions', { language: 'en', theme: 'dark', density: 'compact' });
    await expect(specimen(page, 'button-matrix')).toHaveScreenshot(
      'button-matrix-en-dark-compact.png',
    );
  });

  test('field and choice states — Arabic Light and Dark', async ({ page }) => {
    await open(page, '/dev/ui/forms', AR_LIGHT);
    await expect(specimen(page, 'field-states')).toHaveScreenshot('field-states-ar-light.png');
    await expect(specimen(page, 'choice-states')).toHaveScreenshot('choice-states-ar-light.png');
    await open(page, '/dev/ui/forms', AR_DARK);
    await expect(specimen(page, 'choice-states')).toHaveScreenshot('choice-states-ar-dark.png');
  });
});

test.describe('overlays', () => {
  for (const [name, modes] of [
    ['ar-light', AR_LIGHT],
    ['ar-dark', AR_DARK],
  ] as const)
    test(`dialog over the inert page — ${name}`, async ({ page }) => {
      await open(page, '/dev/ui/overlays', modes);
      await page.getByRole('button', { name: 'تعديل المستخدم' }).click();
      const dialog = page.getByRole('dialog', { name: 'تعديل المستخدم' });
      await expect(dialog.getByRole('textbox', { name: 'الاسم' })).toBeFocused();
      await expect(page).toHaveScreenshot(`dialog-${name}.png`);
    });
});

test.describe('tables and the Arabic IAM proof', () => {
  // The four focused table baselines required by DS-6; behaviour tests cover the rest.
  for (const [name, modes] of [
    ['ar-light-default', AR_LIGHT],
    ['ar-dark-compact', { language: 'ar', theme: 'dark', density: 'compact' }],
    ['en-light-default', { language: 'en', theme: 'light', density: 'default' }],
    ['en-dark-compact', { language: 'en', theme: 'dark', density: 'compact' }],
  ] as const)
    test(`IAM user directory — ${name}`, async ({ page }) => {
      await open(page, '/dev/ui/iam', modes);
      await expect(specimen(page, 'iam-directory')).toHaveScreenshot(`iam-directory-${name}.png`);
    });

  test('role permission editor with mixed groups — Arabic Light', async ({ page }) => {
    await open(page, '/dev/ui/iam', AR_LIGHT);
    await expect(specimen(page, 'iam-permissions')).toHaveScreenshot(
      'iam-permissions-ar-light.png',
    );
  });
});

test.describe('application shell', () => {
  test('expanded sidebar at 1440px — Arabic Light', async ({ page }) => {
    await open(page, '/dev/ui', AR_LIGHT);
    await expect(page).toHaveScreenshot('shell-1440-ar-light.png');
  });

  test('narrow shell at 390px — Arabic Dark', async ({ page }) => {
    await open(page, '/dev/ui/finance', AR_DARK, 390);
    await expect(page).toHaveScreenshot('shell-390-finance-ar-dark.png');
  });
});
