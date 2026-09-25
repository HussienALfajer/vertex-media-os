import { defineConfig, devices } from '@playwright/test';

const isCI = process.env['CI'] !== undefined;

/** Browser journeys against disposable PostgreSQL, the built API and the production web app. */
export default defineConfig({
  testDir: './iam',
  outputDir: './test-output/iam-results',
  globalSetup: './test-support/iam/stack.setup.ts',
  fullyParallel: false,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  failOnFlakyTests: isCI,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [
    ['list'],
    ['html', { outputFolder: './test-output/iam-report', open: 'never' }],
    ...(isCI ? [['github'] as const] : []),
  ],
  use: { trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [{ name: 'iam-chromium', use: { ...devices['Desktop Chrome'] } }],
});
