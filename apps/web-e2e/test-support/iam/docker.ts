import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { join } from 'node:path';

/**
 * The Docker CLI, as the visual-browser setup drives it. The e2e project imports no container
 * library (Nx: `scope:web` bans `testcontainers`), and fixed names let a run remove what an
 * interrupted run left behind.
 */
export function docker(...args: string[]): string {
  return execFileSync('docker', args, { encoding: 'utf8', stdio: 'pipe' }).trim();
}

/** Removes a leftover container or network by name; nothing to remove is fine. */
export function removeLeftover(kind: 'container' | 'network', name: string): void {
  try {
    if (kind === 'container') docker('rm', '--force', '--volumes', name);
    else docker('network', 'rm', name);
  } catch {
    // Nothing to remove.
  }
}

/** The loopback port Docker published for `containerPort` of `container`. */
export function publishedPort(container: string, containerPort: number): number {
  const line = docker('port', container, `${containerPort}/tcp`).split(/\r?\n/)[0] ?? '';
  const port = Number(line.slice(line.lastIndexOf(':') + 1));
  if (!Number.isInteger(port) || port <= 0)
    throw new Error(`${container} publishes no ${containerPort}`);
  return port;
}

/** A loopback port that is free right now. */
export function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(() =>
        typeof address === 'object' && address ? resolve(address.port) : reject(new Error('port')),
      );
    });
  });
}

/**
 * Polls `check` until it holds or `timeoutMs` passes. `failed` names a state that no waiting can
 * repair, such as the process under test having exited; it ends the wait at once.
 */
export async function until(
  what: string,
  check: () => Promise<boolean>,
  timeoutMs = 240_000,
  failed: () => string | undefined = () => undefined,
) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const failure = failed();
    if (failure !== undefined) throw new Error(`${what}: ${failure}`);
    try {
      if (await check()) return;
    } catch {
      // Not ready yet.
    }
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

/** The image a Compose service pins, so the stack never drifts from local development. */
export function composeImage(root: string, service: string): string {
  const compose = readFileSync(join(root, 'infra/compose.yaml'), 'utf8');
  const lines = compose.split(/\r?\n/);
  const start = lines.indexOf(`  ${service}:`);
  const image = lines
    .slice(start + 1)
    .find(
      (line, index, rest) =>
        line.startsWith('    image: ') &&
        !rest.slice(0, index).some((previous) => /^ {2}\S/.test(previous)),
    );
  if (start < 0 || image === undefined)
    throw new Error(`infra/compose.yaml has no image for ${service}`);
  return image.slice('    image: '.length).trim();
}
