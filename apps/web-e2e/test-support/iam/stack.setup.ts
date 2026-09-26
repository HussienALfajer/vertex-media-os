import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { composeImage, docker, publishedPort, until } from './docker.js';

const root = fileURLToPath(new URL('../../../../', import.meta.url));
const apiRoot = join(root, 'apps/api');
const webRoot = join(root, 'apps/web');
const dbRoot = join(root, 'packages/database');
const API_PORT = 3110;
const WEB_PORT = 4320;
const WEB_ORIGIN = `http://127.0.0.1:${WEB_PORT}`;

function commandEnv(extra: Record<string, string>): NodeJS.ProcessEnv {
  return { ...process.env, ...extra, DOTENV_CONFIG_PATH: join(root, '.env.e2e-unused') };
}

function runNode(cwd: string, script: string, args: string[], env: NodeJS.ProcessEnv): void {
  execFileSync(process.execPath, [script, ...args], { cwd, env, stdio: 'pipe' });
}

function start(
  cwd: string,
  script: string,
  args: string[],
  env: NodeJS.ProcessEnv,
  log: string[],
): ChildProcess {
  const child = spawn(process.execPath, [script, ...args], {
    cwd,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout?.on('data', (part: Buffer) => log.push(part.toString('utf8')));
  child.stderr?.on('data', (part: Buffer) => log.push(part.toString('utf8')));
  return child;
}

async function stop(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const ended = new Promise<void>((resolve) => child.once('exit', () => resolve()));
  child.kill();
  await ended;
}

export default async function globalSetup(): Promise<() => Promise<void>> {
  const work = mkdtempSync(join(tmpdir(), 'vertex-iam-e2e-'));
  const container = `vertex-iam-e2e-${randomUUID()}`;
  const pgUser = 'iam_e2e';
  const database = 'vertex_iam_e2e';
  const pgPassword = randomBytes(24).toString('base64url');
  const adminPassword = randomBytes(48).toString('base64url');
  const adminEmail = `admin-${randomUUID()}@example.test`;
  let api: ChildProcess | undefined;
  let web: ChildProcess | undefined;
  let postgresStarted = false;
  const apiLog: string[] = [];
  const webLog: string[] = [];

  const teardown = async () => {
    if (web) await stop(web);
    if (api) await stop(api);
    if (postgresStarted) docker('rm', '--force', '--volumes', container);
    rmSync(work, { recursive: true, force: true });
    const output = [...apiLog, ...webLog].join('');
    if ([pgPassword, adminPassword].some((secret) => output.includes(secret))) {
      throw new Error('A stack log exposed a generated secret.');
    }
  };

  try {
    const buildEnv = commandEnv({ NX_DAEMON: 'false' });
    runNode(
      root,
      fileURLToPath(import.meta.resolve('nx/bin/nx.js')),
      ['run-many', '-t', 'build', '-p', '@vertex-os/api', '@vertex-os/web'],
      buildEnv,
    );

    const postgresEnvFile = join(work, 'postgres.env');
    writeFileSync(
      postgresEnvFile,
      `POSTGRES_USER=${pgUser}\nPOSTGRES_PASSWORD=${pgPassword}\nPOSTGRES_DB=${database}\n`,
      { mode: 0o600 },
    );
    docker(
      'run',
      '--detach',
      '--rm',
      '--name',
      container,
      '--publish',
      '127.0.0.1::5432',
      '--env-file',
      postgresEnvFile,
      composeImage(root, 'postgres'),
    );
    postgresStarted = true;
    await until('PostgreSQL', async () => {
      docker('exec', container, 'pg_isready', '-h', '127.0.0.1', '-U', pgUser, '-d', database);
      return true;
    });
    const url = `postgresql://${pgUser}:${pgPassword}@127.0.0.1:${publishedPort(container, 5432)}/${database}`;
    const appEnv = commandEnv({
      NODE_ENV: 'test',
      DATABASE_URL: url,
      LOG_LEVEL: 'warn',
    });
    runNode(
      dbRoot,
      join(dbRoot, 'node_modules/prisma/build/index.js'),
      ['migrate', 'deploy'],
      appEnv,
    );
    runNode(apiRoot, join(apiRoot, 'dist/commands/iam-sync-reference.js'), [], appEnv);
    runNode(apiRoot, join(apiRoot, 'dist/commands/iam-bootstrap.js'), ['--email', adminEmail], {
      ...appEnv,
      IAM_BOOTSTRAP_PASSWORD: adminPassword,
    });

    api = start(
      apiRoot,
      join(apiRoot, 'dist/main.js'),
      [],
      {
        ...appEnv,
        API_HOST: '127.0.0.1',
        API_PORT: String(API_PORT),
        AUTH_RATE_LIMIT_SIGN_IN: '100',
      },
      apiLog,
    );
    await until(
      'API',
      async () => (await fetch(`http://127.0.0.1:${API_PORT}/api/health/ready`)).ok,
      120_000,
      () => (api?.exitCode === null ? undefined : `API exited ${api?.exitCode}`),
    );
    web = start(
      webRoot,
      join(webRoot, 'node_modules/vite/bin/vite.js'),
      ['preview', '--port', String(WEB_PORT), '--strictPort'],
      commandEnv({ API_HOST: '127.0.0.1', API_PORT: String(API_PORT) }),
      webLog,
    );
    await until(
      'web',
      async () => (await fetch(WEB_ORIGIN)).ok,
      120_000,
      () => (web?.exitCode === null ? undefined : `web exited ${web?.exitCode}`),
    );

    process.env['VERTEX_IAM_E2E_STACK'] = JSON.stringify({
      webOrigin: WEB_ORIGIN,
      adminEmail,
      adminPassword,
    });
    return teardown;
  } catch (error) {
    await teardown();
    throw error;
  }
}
