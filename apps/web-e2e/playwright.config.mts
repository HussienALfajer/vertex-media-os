import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';

const workspaceRoot = fileURLToPath(new URL('../../', import.meta.url));
const isCI = process.env['CI'] !== undefined;

// Dedicated ports so the smoke test never reuses a developer's `pnpm dev` servers (3000/4200).
const API_PORT = '3100';
const WEB_PORT = '4300';

/**
 * Starts the real API (`nx run @vertex-os/api:serve`) and the production web build
 * (`nx run @vertex-os/web:preview`, proxying `/api` to that API) and drives Chromium.
 *
 * The smoke journey only observes liveness, which does not touch PostgreSQL; readiness
 * against real PostgreSQL is proven by the Testcontainers integration tests. The API
 * still validates its configuration at startup, so it receives a syntactically valid,
 * non-production database URL that is never connected.
 */
export default defineConfig({
  testDir: './src',
  outputDir: './test-output/results',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  reporter: [['list'], ['html', { outputFolder: './test-output/report', open: 'never' }]],
  use: {
    baseURL: `http://127.0.0.1:${WEB_PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      name: 'api',
      command: 'pnpm exec nx run @vertex-os/api:serve',
      cwd: workspaceRoot,
      url: `http://127.0.0.1:${API_PORT}/api/health/live`,
      reuseExistingServer: false,
      timeout: 180_000,
      env: {
        NODE_ENV: 'test',
        API_HOST: '127.0.0.1',
        API_PORT,
        LOG_LEVEL: 'warn',
        DATABASE_URL: 'postgresql://e2e:not-used@127.0.0.1:1/never_connected',
      },
    },
    {
      name: 'web',
      command: 'pnpm exec nx run @vertex-os/web:preview',
      cwd: workspaceRoot,
      url: `http://127.0.0.1:${WEB_PORT}`,
      reuseExistingServer: false,
      timeout: 180_000,
      env: { API_HOST: '127.0.0.1', API_PORT },
    },
  ],
});
