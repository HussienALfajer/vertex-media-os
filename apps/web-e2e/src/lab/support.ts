import { expect, type Page } from '@playwright/test';

export interface LabModes {
  readonly language?: 'ar' | 'en';
  readonly theme?: 'light' | 'dark' | 'system';
  readonly density?: 'default' | 'compact';
}

let seeds = 0;

/**
 * Opens a lab page with the given UI preferences already stored, exactly as a returning
 * user would have them, and waits for the delivered fonts so rendering is settled.
 *
 * The preferences are seeded once per call: a later reload or in-page preference change is
 * not overwritten, so tests can prove that preferences persist.
 */
export async function openLab(page: Page, path: string, modes: LabModes = {}): Promise<void> {
  seeds += 1;
  await page.addInitScript(
    ({ preferences, seed }) => {
      try {
        if (sessionStorage.getItem(seed) !== null) return;
        sessionStorage.setItem(seed, 'applied');
        localStorage.setItem(
          'vertex.ui.preferences',
          JSON.stringify({ version: 1, ...preferences }),
        );
      } catch {
        // Documents without storage (about:blank) are not lab pages.
      }
    },
    { preferences: modes, seed: `vx-e2e-seed-${seeds}` },
  );
  await page.goto(path);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
}

/** Whether the page (not an inner region) scrolls horizontally. */
export async function pageOverflowsInline(page: Page): Promise<boolean> {
  return page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  );
}
