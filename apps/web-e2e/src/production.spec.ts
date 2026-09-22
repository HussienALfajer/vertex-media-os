import { readdirSync, readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

const dist = new URL('../../web/dist/', import.meta.url);

test('the production build exposes no design-system lab (DS-D026)', async ({ page }) => {
  await page.goto('/dev/ui');
  await expect(page.getByRole('heading', { level: 1, name: 'الصفحة غير موجودة' })).toBeVisible();
  await page.goto('/dev/ui/iam');
  await expect(page.getByRole('heading', { level: 1, name: 'الصفحة غير موجودة' })).toBeVisible();
  await expect(page.getByText('دليل المستخدمين')).toHaveCount(0);
});

test('the production bundle contains no lab module or synthetic fixture', () => {
  const assets = new URL('assets/', dist);
  const scripts = readdirSync(assets).filter((file) => file.endsWith('.js'));
  expect(scripts.length).toBeGreaterThan(0);
  for (const file of scripts) {
    const code = readFileSync(new URL(file, assets), 'utf8');
    for (const marker of [
      'مختبر نظام التصميم',
      'Design system lab',
      'sara.demo@example.test',
      'INV-2026-0042',
    ])
      expect(code, `${file} contains "${marker}"`).not.toContain(marker);
  }
});

test('the first paint uses the stored theme and direction before any body content exists', async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      'vertex.ui.preferences',
      JSON.stringify({ version: 1, theme: 'dark', language: 'en' }),
    );
    // Record the root attributes at the moment the parser inserts <body> (observing the
    // document itself: the init script can run before <html> exists).
    new MutationObserver((_records, observer) => {
      if (!document.body) return;
      const root = document.documentElement;
      (window as unknown as { firstPaintRoot: object }).firstPaintRoot = {
        theme: root.dataset['theme'],
        dir: root.dir,
        lang: root.lang,
      };
      observer.disconnect();
    }).observe(document, { childList: true, subtree: true });
  });
  await page.goto('/');
  const root = await page.evaluate(
    () => (window as unknown as { firstPaintRoot: object }).firstPaintRoot,
  );
  expect(root).toEqual({ theme: 'dark', dir: 'ltr', lang: 'en' });
});
