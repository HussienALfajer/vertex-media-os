import { AxeBuilder } from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { openLab, pageOverflowsInline, type LabModes } from '../support.js';

const SECTIONS = [
  '',
  'foundations',
  'bidi',
  'actions',
  'forms',
  'feedback',
  'overlays',
  'navigation',
  'tables',
  'layouts',
  'print',
  'iam',
  'crm',
  'projects',
  'finance',
];

test.describe('automated accessibility scan (supplements manual review, §41.2)', () => {
  const modes: readonly (LabModes & { name: string })[] = [
    { name: 'ar light', language: 'ar', theme: 'light' },
    { name: 'en dark compact', language: 'en', theme: 'dark', density: 'compact' },
  ];
  for (const mode of modes)
    for (const section of SECTIONS)
      test(`/dev/ui/${section || '(overview)'} has no WCAG 2.2 A/AA violations — ${mode.name}`, async ({
        page,
      }) => {
        await openLab(page, `/dev/ui/${section}`, mode);
        const results = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
          .analyze();
        expect(
          results.violations.map(
            ({ id, nodes }) => `${id}: ${nodes.map((node) => node.target.join(' ')).join(' | ')}`,
          ),
        ).toEqual([]);
      });

  test('an open modal passes the scan and the application shell too', async ({ page }) => {
    await openLab(page, '/dev/ui/overlays');
    await page.getByRole('button', { name: 'تعديل المستخدم' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(results.violations.map((violation) => violation.id)).toEqual([]);
    // Landmark structure while a modal is open: its header/footer must not add page landmarks.
    const landmarks = await new AxeBuilder({ page })
      .withRules([
        'landmark-no-duplicate-banner',
        'landmark-no-duplicate-contentinfo',
        'landmark-banner-is-top-level',
        'landmark-contentinfo-is-top-level',
        'landmark-unique',
      ])
      .analyze();
    expect(landmarks.violations.map((violation) => violation.id)).toEqual([]);
  });
});

test.describe('responsive reflow (§23)', () => {
  const expected = {
    320: 'narrow',
    390: 'narrow',
    768: 'rail',
    1024: 'rail',
    1440: 'expanded',
  } as const;
  for (const [width, layout] of Object.entries(expected))
    test(`${width}px: ${layout} shell and no page-level horizontal scrolling`, async ({ page }) => {
      await page.setViewportSize({ width: Number(width), height: 900 });
      for (const section of ['', 'forms', 'iam', 'finance', 'bidi']) {
        await openLab(page, `/dev/ui/${section}`);
        await expect(page.locator('.vx-shell')).toHaveAttribute('data-layout', layout);
        expect(await pageOverflowsInline(page), `/dev/ui/${section} at ${width}px`).toBe(false);
      }
    });

  test('400% browser zoom (a 320 CSS px viewport at 4x) reflows without horizontal scrolling', async ({
    browser,
  }) => {
    const context = await browser.newContext({
      viewport: { width: 320, height: 256 },
      deviceScaleFactor: 4,
    });
    const page = await context.newPage();
    for (const section of ['forms', 'overlays', 'layouts']) {
      await openLab(page, `/dev/ui/${section}`);
      expect(await pageOverflowsInline(page), section).toBe(false);
    }
    await context.close();
  });

  test('200% browser text size reflows the shell and grows controls without clipping', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    // The browser's own text-size preference (not a CSS override), so rem media queries move.
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Page.setFontSizes', { fontSizes: { standard: 32, fixed: 26 } });
    await openLab(page, '/dev/ui/forms');
    await expect(page.locator('.vx-shell')).toHaveAttribute('data-layout', 'narrow');
    expect(await pageOverflowsInline(page)).toBe(false);
    const input = page.getByRole('textbox', { name: 'الاسم الكامل' });
    expect(await input.evaluate((node) => getComputedStyle(node).fontSize)).toBe('32px');
    expect((await input.boundingBox())?.height).toBeGreaterThanOrEqual(80);
  });
});

test.describe('touch geometry (§14)', () => {
  test('a coarse pointer forces Default density and 44px targets even when Compact is saved', async ({
    browser,
  }) => {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      isMobile: true,
      hasTouch: true,
    });
    const page = await context.newPage();
    for (const section of ['actions', 'forms', 'navigation', 'iam']) {
      await openLab(page, `/dev/ui/${section}`, { density: 'compact' });
      await expect(page.locator('html')).toHaveAttribute('data-density', 'default');
      // Every visible action, field, tab, navigation link and choice row (label + control).
      const undersized = await page.evaluate(() =>
        [
          ...document.querySelectorAll<HTMLElement>(
            'button, select, input:not([type="checkbox"]):not([type="radio"]), [role="tab"], .vx-sidebar-link, .vx-breadcrumb a, .vx-brand, .vx-choice',
          ),
        ]
          .filter(
            (element) =>
              element.getClientRects().length > 0 &&
              !element.closest('.vx-visually-hidden, [inert]'),
          )
          .map((element) => ({ element, box: element.getBoundingClientRect() }))
          .filter(
            ({ element, box }) =>
              box.height < 44 || (!element.matches('.vx-choice, input, select') && box.width < 44),
          )
          .map(
            ({ element, box }) =>
              `${element.tagName}.${element.className} "${(element.textContent ?? '').trim().slice(0, 24)}" ${Math.round(box.width)}x${Math.round(box.height)}`,
          ),
      );
      expect(undersized, section).toEqual([]);
    }
    await page.getByRole('button', { name: 'إجراءات Omar Farouk (demo)' }).click();
    for (const item of await page.getByRole('menuitem').all())
      expect((await item.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    await context.close();
  });

  test('Compact changes control geometry, never type size', async ({ page }) => {
    await openLab(page, '/dev/ui/forms', { density: 'compact' });
    const input = page.getByRole('textbox', { name: 'الاسم الكامل' });
    expect((await input.boundingBox())?.height).toBe(36);
    expect(await input.evaluate((node) => getComputedStyle(node).fontSize)).toBe('14px');
    await openLab(page, '/dev/ui/forms', { density: 'default' });
    expect((await page.getByRole('textbox', { name: 'الاسم الكامل' }).boundingBox())?.height).toBe(
      40,
    );
  });
});

test.describe('the eight shared mode combinations (§41.1)', () => {
  test('the IAM directory keeps order, geometry, surface and sorting in every combination', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    for (const language of ['ar', 'en'] as const)
      for (const theme of ['light', 'dark'] as const)
        for (const density of ['default', 'compact'] as const) {
          const mode = `${language} ${theme} ${density}`;
          await openLab(page, '/dev/ui/iam', { language, theme, density });
          const root = page.locator('html');
          await expect(root).toHaveAttribute('dir', language === 'ar' ? 'rtl' : 'ltr');
          await expect(root).toHaveAttribute('data-theme', theme);
          await expect(root).toHaveAttribute('data-density', density);
          const table = page.getByRole('table', {
            name: language === 'ar' ? 'دليل المستخدمين' : 'User directory',
          });
          // Two-line identity rows: 68px Default, 60px Compact (§14), plus the 1px separator.
          const row = await table.getByRole('row').nth(1).boundingBox();
          expect(row?.height, mode).toBe((density === 'default' ? 68 : 60) + 1);
          // Selection then identity from inline-start; actions at inline-end (§24.1, §29.1).
          const headers = table.getByRole('columnheader');
          const first = await headers.first().boundingBox();
          const last = await headers.last().boundingBox();
          expect(
            first && last && (language === 'ar' ? first.x > last.x : first.x < last.x),
            mode,
          ).toBe(true);
          // The table surface follows the theme mapping (background.surface).
          expect(
            await table
              .getByRole('cell')
              .first()
              .evaluate((node) => getComputedStyle(node).backgroundColor),
            mode,
          ).toBe(theme === 'light' ? 'rgb(255, 255, 255)' : 'rgb(24, 35, 30)');
          const sort = headers.nth(1).getByRole('button');
          await sort.focus();
          await page.keyboard.press('Enter');
          await expect(headers.nth(1), mode).toHaveAttribute('aria-sort', 'ascending');
        }
  });
});

test.describe('typography fallback (§12.1)', () => {
  test('without the web fonts, text in controls, rows and headings grows instead of clipping', async ({
    page,
  }) => {
    // The state before fonts resolve (font-display: swap) or when they cannot load.
    await page.route('**/*.woff2', (route) => route.abort());
    for (const section of ['forms', 'iam', 'foundations', 'finance']) {
      await openLab(page, `/dev/ui/${section}`);
      const report = await page.evaluate(() => ({
        loaded: [...document.fonts].filter((face) => face.status === 'loaded').length,
        clipped: [
          ...document.querySelectorAll<HTMLElement>(
            '.vx-button, .vx-input, .vx-status, .vx-badge, .vx-choice-label, .vx-label, .vx-page-title, .vx-table td, .vx-table th, .vx-sidebar-link, h2, h3',
          ),
        ]
          .filter((element) => element.getClientRects().length > 0)
          .filter((element) => element.scrollHeight > element.clientHeight + 1)
          .map(
            (element) =>
              `${element.className} "${(element.textContent ?? '').trim().slice(0, 24)}"`,
          ),
      }));
      expect(report.loaded, section).toBe(0);
      expect(report.clipped, section).toEqual([]);
    }
  });
});

test.describe('state precedence (§19)', () => {
  test('disabled replaces every variant and intent with the disabled roles', async ({ page }) => {
    await openLab(page, '/dev/ui/actions', { language: 'ar', theme: 'light' });
    const disabled = page
      .locator('[data-specimen="button-matrix"]')
      .getByRole('button', { name: 'غير متاح' });
    await expect(disabled).toHaveCount(5);
    for (const button of await disabled.all()) {
      const style = await button.evaluate((node) => {
        const computed = getComputedStyle(node);
        return {
          color: computed.color,
          background: computed.backgroundColor,
          ghost: node.getAttribute('data-variant') === 'ghost',
        };
      });
      // text.disabled (neutral.500) on action.disabled.background (neutral.100); ghost stays transparent.
      expect(style.color).toBe('rgb(113, 128, 120)');
      expect(style.background).toBe(style.ghost ? 'rgba(0, 0, 0, 0)' : 'rgb(238, 239, 231)');
    }
  });
});

test.describe('motion, forced colours and print', () => {
  test('reduced motion removes transitions and animation', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openLab(page, '/dev/ui/actions');
    const button = page.getByRole('button', { name: 'صغير' });
    expect(await button.evaluate((node) => getComputedStyle(node).transitionDuration)).toBe('0s');
    const spinner = page.locator('.vx-spinner').first();
    expect(await spinner.evaluate((node) => getComputedStyle(node).animationDuration)).toBe('0s');
  });

  test('forced colours keep a visible focus outline and a checked-state cue', async ({ page }) => {
    await page.emulateMedia({ forcedColors: 'active' });
    await openLab(page, '/dev/ui/forms');
    const box = page.getByRole('checkbox', { name: 'ملخص يومي' });
    await box.focus();
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');
    const style = await box.evaluate((node) => {
      const computed = getComputedStyle(node);
      return {
        outline: computed.outlineStyle,
        width: computed.outlineWidth,
        background: computed.backgroundColor,
      };
    });
    expect(style.outline).toBe('solid');
    expect(style.width).toBe('2px');
    expect(style.background).not.toBe('rgba(0, 0, 0, 0)');
  });

  test('print uses the Light presentation, drops interactive chrome and keeps meaning', async ({
    page,
  }) => {
    await openLab(page, '/dev/ui/print', { theme: 'dark' });
    await page.emulateMedia({ media: 'print' });
    // The Light canvas (neutral.50, #F8F8F3) although the stored theme is Dark.
    const canvas = await page.evaluate(
      () => getComputedStyle(document.documentElement).backgroundColor,
    );
    expect(canvas).toBe('rgb(248, 248, 243)');
    await expect(page.locator('.vx-shell-sidebar, .vx-shell-header').first()).toBeHidden();
    await expect(page.getByRole('button', { name: 'معاينة الطباعة' })).toBeHidden();
    const table = page.getByRole('table', { name: 'ملخص المستندات للطباعة' });
    await expect(table.getByRole('columnheader', { name: 'المبلغ' })).toBeVisible();
    await expect(table.getByText('-1,234.50 SAR')).toBeVisible();
    await expect(table.getByText('بانتظار التسعير')).toBeVisible();
    expect(await table.locator('thead').evaluate((node) => getComputedStyle(node).display)).toBe(
      'table-header-group',
    );
    await expect(table.getByRole('button', { name: 'فتح' }).first()).toBeHidden();
    const pdf = await page.pdf({ format: 'A4' });
    expect(pdf.byteLength).toBeGreaterThan(1000);
  });
});
