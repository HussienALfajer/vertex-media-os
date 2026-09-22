import { expect, test } from '@playwright/test';

test('the web shell loads and observes the live API through its own origin', async ({ page }) => {
  const pageErrors: Error[] = [];
  page.on('pageerror', (error) => pageErrors.push(error));
  const liveness = page.waitForResponse(
    (response) => new URL(response.url()).pathname === '/api/health/live',
  );

  await page.goto('/');

  await expect(page.getByRole('heading', { level: 1, name: 'Vertex OS' })).toBeVisible();
  const livenessResponse = await liveness;
  expect(livenessResponse.status()).toBe(200);
  // The browser calls the web origin's /api path (Vite proxy), not a cross-origin API URL.
  expect(new URL(livenessResponse.url()).origin).toBe(new URL(page.url()).origin);
  await expect(page.getByRole('region', { name: 'System status' }).getByRole('status')).toHaveText(
    'API connection available',
  );
  expect(pageErrors).toEqual([]);
});
