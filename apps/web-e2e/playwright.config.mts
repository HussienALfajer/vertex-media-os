import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';

const workspaceRoot = fileURLToPath(new URL('../../', import.meta.url));
const isCI = process.env['CI'] !== undefined;

// Dedicated ports so the tests never reuse a developer's `pnpm dev` servers (3000/4200).
const API_PORT = '3100';
const WEB_PORT = '4300';
const LAB_PORT = '4310';

/**
 * The one browser that renders visual baselines (DS-D027): Chromium inside the pinned
 * Playwright Linux image (tag and digest), driven through `run-server` from the repository's
 * own locked `playwright-core`, so Windows development and Linux CI compare against one
 * reviewed baseline set with no tolerance loosening.
 */
const VISUAL_BROWSER = {
  image:
    'mcr.microsoft.com/playwright:v1.63.0-noble@sha256:eff16c30e6f3f4af0a03fa4b706120d5e9b0891c344a27d64559aff5900a4a27',
  container: 'vertexos-visual-browser',
  port: 3200,
};

/**
 * Starts the real API (`nx run @vertex-os/api:serve`), the production web build
 * (`nx run @vertex-os/web:preview`, proxying `/api` to that API) and the separate
 * design-system lab build (`nx run @vertex-os/web:preview-lab`).
 *
 * - `smoke` proves the production journey and that the production build ships no lab.
 * - `lab-*` prove shared overlay, form, bidi and focus behaviour in all three engines
 *   (docs/DESIGN_SYSTEM.md §41.2); `lab-chromium` also runs the Chromium-only media
 *   emulation, accessibility-scan, responsive and print checks.
 * - `visual` compares the reviewed baselines, rendered by Chromium inside the pinned Linux
 *   Playwright image (`visual-browser` starts it with Docker; DS-D027). Baselines change
 *   only through an explicit `--update-snapshots` run followed by human review; CI never
 *   writes them.
 *
 * CI retries a failed test once, only to tell a flaky test from a broken one (TESTING.md §31,
 * §56): a test that passes only on retry still fails the run, is annotated on the GitHub run,
 * and keeps the failed attempt's trace and screenshot.
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
  failOnFlakyTests: isCI,
  updateSnapshots: isCI ? 'none' : 'missing',
  reporter: [
    ['list'],
    ['html', { outputFolder: './test-output/report', open: 'never' }],
    ...(isCI ? [['github'] as const] : []),
  ],
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'smoke',
      testMatch: ['smoke.spec.ts', 'production.spec.ts'],
      use: { ...devices['Desktop Chrome'], baseURL: `http://127.0.0.1:${WEB_PORT}` },
    },
    {
      name: 'lab-chromium',
      testMatch: ['lab/shared/**/*.spec.ts', 'lab/chromium/**/*.spec.ts'],
      use: { ...devices['Desktop Chrome'], baseURL: `http://127.0.0.1:${LAB_PORT}` },
    },
    {
      name: 'lab-firefox',
      testMatch: 'lab/shared/**/*.spec.ts',
      use: { ...devices['Desktop Firefox'], baseURL: `http://127.0.0.1:${LAB_PORT}` },
    },
    {
      name: 'lab-webkit',
      testMatch: 'lab/shared/**/*.spec.ts',
      use: { ...devices['Desktop Safari'], baseURL: `http://127.0.0.1:${LAB_PORT}` },
    },
    {
      name: 'visual-browser',
      testMatch: 'visual/browser.setup.ts',
      teardown: 'visual-browser-teardown',
      metadata: VISUAL_BROWSER,
    },
    {
      name: 'visual-browser-teardown',
      testMatch: 'visual/browser.teardown.ts',
      metadata: VISUAL_BROWSER,
    },
    {
      name: 'visual',
      testMatch: 'visual/**/*.visual.ts',
      dependencies: ['visual-browser'],
      snapshotPathTemplate: '{testDir}/{testFileDir}/__screenshots__/{arg}{ext}',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: `http://127.0.0.1:${LAB_PORT}`,
        // The containerised browser reaches the host's lab server through the client.
        connectOptions: {
          wsEndpoint: `ws://127.0.0.1:${VISUAL_BROWSER.port}/`,
          exposeNetwork: '<loopback>',
        },
      },
    },
  ],
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
        // Required by the API's sign-in configuration; no journey signs in, so none is contacted.
        KEYCLOAK_ISSUER_URL: 'http://127.0.0.1:1/realms/never-contacted',
        KEYCLOAK_WEB_CLIENT_SECRET: 'e2e-not-used-client-secret',
        KEYCLOAK_WEB_REDIRECT_URI: `http://127.0.0.1:${WEB_PORT}/api/auth/callback`,
        KEYCLOAK_WEB_POST_LOGOUT_REDIRECT_URI: `http://127.0.0.1:${WEB_PORT}/`,
        AUTH_TOKEN_ENCRYPTION_SECRET: 'e2e-not-used-token-encryption-secret',
        // Required by IAM identity provisioning; no journey provisions, so none is contacted.
        KEYCLOAK_PROVISIONER_CLIENT_ID: 'e2e-not-used-provisioner',
        KEYCLOAK_PROVISIONER_CLIENT_SECRET: 'e2e-not-used-provisioner-secret',
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
    {
      name: 'lab',
      command: 'pnpm exec nx run @vertex-os/web:preview-lab',
      cwd: workspaceRoot,
      url: `http://127.0.0.1:${LAB_PORT}/dev/ui`,
      reuseExistingServer: false,
      timeout: 180_000,
      env: { API_HOST: '127.0.0.1', API_PORT },
    },
  ],
});
