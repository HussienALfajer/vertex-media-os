import { execFileSync } from 'node:child_process';
import { expect, test as teardown } from '@playwright/test';
import { visualBrowser } from './browser.js';

const docker = (...args: string[]) =>
  execFileSync('docker', args, { stdio: 'pipe', encoding: 'utf8' });

teardown('stop the visual baseline browser', () => {
  const { container } = visualBrowser(teardown.info());
  docker('rm', '--force', container);
  expect(docker('ps', '--all', '--quiet', '--filter', `name=^${container}$`).trim()).toBe('');
});
