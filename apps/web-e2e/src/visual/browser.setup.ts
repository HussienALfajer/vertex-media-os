import { execFileSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import { chromium, expect, test as setup } from '@playwright/test';
import { visualBrowser } from './browser.js';

/** Directory of the locked `playwright-core` (@playwright/test -> playwright -> playwright-core). */
function playwrightCoreDirectory(): string {
  let from = import.meta.url;
  for (const name of ['@playwright/test', 'playwright', 'playwright-core']) {
    const manifest = realpathSync(createRequire(from).resolve(`${name}/package.json`));
    from = manifest;
    if (name === 'playwright-core') return dirname(manifest);
  }
  throw new Error('playwright-core could not be resolved');
}

const docker = (...args: string[]) =>
  execFileSync('docker', args, { stdio: 'pipe', encoding: 'utf8' });

/** Removes a container left behind by an interrupted run, which would hold the port. */
function removeLeftover(container: string): void {
  try {
    docker('rm', '--force', container);
  } catch {
    // Nothing to remove.
  }
}

/** Ready when a client can actually connect, not merely when the port is published. */
async function connectableVersion(endpoint: string): Promise<string> {
  const deadline = Date.now() + 60_000;
  for (;;) {
    try {
      const browser = await chromium.connect(endpoint, { timeout: 5_000 });
      const version = browser.version();
      await browser.close();
      return version;
    } catch (error) {
      if (Date.now() > deadline) throw error;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
}

setup('start the pinned Linux browser for visual baselines', async () => {
  setup.setTimeout(600_000);
  const { image, container, port } = visualBrowser(setup.info());
  removeLeftover(container);
  docker(
    'run',
    '--detach',
    '--rm',
    '--init',
    '--name',
    container,
    '--publish',
    `127.0.0.1:${port}:${port}`,
    '--volume',
    `${playwrightCoreDirectory()}:/opt/playwright-core:ro`,
    image,
    'node',
    '/opt/playwright-core/cli.js',
    'run-server',
    '--port',
    String(port),
    '--host',
    '0.0.0.0',
  );
  expect(await connectableVersion(`ws://127.0.0.1:${port}/`)).toMatch(/^\d+\./);
});
