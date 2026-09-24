import { defineConfig, devices } from '@playwright/test';

const isCI = process.env['CI'] !== undefined;

/**
 * The IAM journeys (IAM-R09B, spec Section 46.7) against a real stack: the pinned Keycloak with
 * the committed realm, PostgreSQL with every migration, Mailpit, the built API server entry
 * (:3110) and the production web build (:4320). `test-support/iam/stack.setup.ts` starts and stops it,
 * because the containers' ports and generated secrets exist only once they run (D-03). Nothing
 * here reads the developer's `.env`.
 *
 * Every journey runs in Chromium. Firefox also proves the `__Host-` cookies, rotation and
 * sign-out; WebKit keeps no `Secure` cookie over plain HTTP, so its project proves that outcome
 * (D-06). Retries and flaky-test handling follow `playwright.config.mts`.
 */
export default defineConfig({
  testDir: './iam',
  outputDir: './test-output/iam-results',
  globalSetup: './test-support/iam/stack.setup.ts',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  failOnFlakyTests: isCI,
  // Journeys wait for Keycloak pages, email and the housekeeping interval.
  timeout: 150_000,
  expect: { timeout: 15_000 },
  reporter: [
    ['list'],
    ['html', { outputFolder: './test-output/iam-report', open: 'never' }],
    ...(isCI ? [['github'] as const] : []),
  ],
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'iam-chromium',
      testMatch: ['*.spec.ts'],
      testIgnore: ['webkit-http.spec.ts'],
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'iam-firefox',
      testMatch: ['cookies.spec.ts'],
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'iam-webkit',
      testMatch: ['webkit-http.spec.ts'],
      use: { ...devices['Desktop Safari'] },
    },
  ],
});
