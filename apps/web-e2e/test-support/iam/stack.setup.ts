import { execFileSync, execSync, spawn, type ChildProcess } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import {
  copyFileSync,
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { ApiTraffic, webContext } from './browser-context.js';
import { composeImage, docker, freePort, publishedPort, removeLeftover, until } from './docker.js';
import { completeInvitation, signIn } from './keycloak-pages.js';
import {
  actionLink,
  API_PORT,
  JWT,
  STACK_VARIABLE,
  TEST_PASSWORD,
  waitForMail,
  WEB_ORIGIN,
  WEB_PORT,
  type IamStack,
} from './stack.js';

/**
 * Global setup of `playwright.iam.config.mts` (IAM-R09B D-03): a real IAM stack, driven as a
 * black box. PostgreSQL, Mailpit and the pinned Keycloak run in containers with the committed
 * realm; the migrations, reference synchronization and bootstrap run through their real
 * commands; the built API server entry and the production web build serve the journeys. It
 * signs the bootstrap administrator in once (D-05) and returns the teardown, which also scans the
 * API's log for tokens and handled secrets (D-13).
 */

const root = fileURLToPath(new URL('../../../../', import.meta.url));
const apiRoot = join(root, 'apps/api');
const webRoot = join(root, 'apps/web');
const databaseRoot = join(root, 'packages/database');
/** Scanned stack logs, kept where CI collects a failed run's diagnostics. */
const logsDirectory = join(root, 'apps/web-e2e/test-output/iam-logs');

const NAME = 'vertexos-e2e-iam';
const containers = {
  postgres: `${NAME}-postgres`,
  mailpit: `${NAME}-mailpit`,
  keycloak: `${NAME}-keycloak`,
};

/** The shared non-secret Keycloak server options (plain `KEY=VALUE` lines). */
function keycloakServerOptions(): string[] {
  return readFileSync(join(root, 'infra/keycloak/keycloak.env'), 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#'));
}

/** Distinctive values, so the log scan can prove that none of them was written. */
const sentinel = (label: string) => `sentinel_${label}_${randomBytes(18).toString('hex')}`;

const answers = async (url: string) => (await fetch(url)).ok;

interface Started {
  readonly child: ChildProcess;
  /** Resolves once the log file holds everything the process wrote. */
  readonly written: Promise<void>;
}

function start(
  command: string,
  args: string[],
  cwd: string,
  env: Record<string, string>,
  log: string,
): Started {
  const output = createWriteStream(log);
  const written = new Promise<void>((resolve) => output.once('close', () => resolve()));
  const child = spawn(command, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
  // One writer for both streams; the file closes when both have ended.
  let open = 2;
  const end = () => {
    open -= 1;
    if (open === 0) output.end();
  };
  for (const stream of [child.stdout, child.stderr]) {
    stream?.on('data', (chunk: Buffer) => output.write(chunk));
    stream?.once('end', end);
  }
  return { child, written };
}

async function stopProcess({ child, written }: Started): Promise<void> {
  if (child.exitCode === null && child.signalCode === null) {
    const exited = new Promise((resolve) => child.once('exit', resolve));
    child.kill();
    await exited;
  }
  await written;
}

const exited = ({ child }: Started) =>
  child.exitCode === null ? undefined : `exited with code ${child.exitCode}`;

/** The log scan of D-13: every token or handled secret the text holds. */
function leaks(log: string, known: readonly string[]): string[] {
  return [
    ...(JWT.test(log) ? ['a JWT'] : []),
    ...(/[?&](code|state)=/.test(log) ? ['an authorization response parameter'] : []),
    ...(log.includes('__Host-vertex') ? ['a Vertex cookie'] : []),
    ...(known.some((value) => log.includes(value)) ? ['a handled secret'] : []),
  ];
}

/**
 * The environment of every process the stack starts: what a shell needs to run programs, never
 * the runner's own variables, which Nx fills from the developer's `.env`.
 */
function baseEnvironment(): Record<string, string> {
  const keep = ['PATH', 'Path', 'PATHEXT', 'SystemRoot', 'TEMP', 'TMP', 'HOME', 'USERPROFILE'];
  return Object.fromEntries(
    keep.flatMap((name) => {
      const value = process.env[name];
      return value === undefined ? [] : [[name, value]];
    }),
  );
}

export default async function globalSetup(): Promise<() => Promise<void>> {
  // A fixed name, so a run removes what an interrupted run left (its generated secrets included).
  const work = join(tmpdir(), NAME);
  rmSync(work, { recursive: true, force: true });
  mkdirSync(work, { recursive: true });
  const handledFile = join(work, 'handled.txt');
  writeFileSync(handledFile, '');
  // Scanned logs are kept for CI's failure artifact; stale ones are removed first.
  rmSync(logsDirectory, { recursive: true, force: true });
  const apiLog = join(work, 'api.log');
  const webLog = join(work, 'web.log');
  const keycloakLog = join(work, 'keycloak.log');
  const known: string[] = [TEST_PASSWORD];
  let ready = false;

  // D-13: once every process has stopped, the API and web logs must hold no token and no handled
  // secret. Each clean log is then copied to `test-output` for diagnosis (review T-2).
  const scanAndKeepLogs = () => {
    const handled = readFileSync(handledFile, 'utf8')
      .split('\n')
      .filter((value) => value.length >= 8);
    const secretsSeen = [...known, ...handled];
    const found: string[] = [];
    for (const [name, file] of [
      ['api.log', apiLog],
      ['web.log', webLog],
      ['keycloak.log', keycloakLog],
    ] as const) {
      if (!existsSync(file)) continue;
      const hits = leaks(readFileSync(file, 'utf8'), secretsSeen);
      if (hits.length === 0) {
        mkdirSync(logsDirectory, { recursive: true });
        copyFileSync(file, join(logsDirectory, name));
      } else if (name !== 'keycloak.log') found.push(`${name} holds ${hits.join(', ')}`);
    }
    if (found.length > 0)
      throw new Error(`Secret material in the stack's logs: ${found.join('; ')}.`);
    // A positive control: the scan read a log of the whole run, sign-in callbacks included.
    if (ready && !readFileSync(apiLog, 'utf8').includes('/api/auth/callback'))
      throw new Error('The API log holds no sign-in callback: the scan did not read a whole log.');
  };
  // The temporary directory goes last, after the scan.
  const cleanups: (() => Promise<void> | void)[] = [
    () => rmSync(work, { recursive: true, force: true }),
    scanAndKeepLogs,
  ];
  /** Writes an environment file, so secrets never appear on a command line or in its error. */
  const secretFile = (name: string, lines: readonly string[]) => {
    const file = join(work, name);
    writeFileSync(file, `${lines.join('\n')}\n`, { mode: 0o600 });
    return file;
  };
  // Every step runs even when an earlier one fails; the first failure fails the run.
  const teardown = async () => {
    const failures: unknown[] = [];
    for (const cleanup of cleanups.reverse()) {
      try {
        await cleanup();
      } catch (error) {
        failures.push(error);
      }
    }
    if (failures.length > 0) throw failures[0];
  };

  try {
    // The built API and the production web build (cached by Nx when unchanged).
    execSync('pnpm exec nx run-many -t build -p @vertex-os/api @vertex-os/web', {
      cwd: root,
      stdio: 'inherit',
      env: { ...baseEnvironment(), NX_DAEMON: 'false' },
    });

    const secrets = {
      postgres: sentinel('pg'),
      webClient: sentinel('web'),
      provisionerClient: sentinel('provisioner'),
      keycloakAdmin: sentinel('kc_admin'),
      smtp: sentinel('smtp'),
      tokenEncryption: sentinel('token_encryption'),
    };
    known.push(...Object.values(secrets));

    for (const container of Object.values(containers)) removeLeftover('container', container);
    removeLeftover('network', NAME);
    cleanups.push(() => removeLeftover('network', NAME));
    docker('network', 'create', NAME);

    // PostgreSQL with every migration applied by the real Prisma CLI.
    const postgresUser = 'e2e_user';
    const database = 'vertex_e2e';
    cleanups.push(() => removeLeftover('container', containers.postgres));
    docker(
      'run',
      '--detach',
      '--rm',
      '--name',
      containers.postgres,
      '--network',
      NAME,
      '--publish',
      '127.0.0.1::5432',
      '--env-file',
      secretFile('postgres.env', [
        `POSTGRES_USER=${postgresUser}`,
        `POSTGRES_PASSWORD=${secrets.postgres}`,
        `POSTGRES_DB=${database}`,
      ]),
      composeImage(root, 'postgres'),
    );
    // Over TCP: the image's initialisation server listens on its socket only.
    await until('PostgreSQL', async () => {
      docker(
        'exec',
        containers.postgres,
        'pg_isready',
        '-h',
        '127.0.0.1',
        '-U',
        postgresUser,
        '-d',
        database,
      );
      return true;
    });
    const databaseUrl = `postgresql://${postgresUser}:${secrets.postgres}@127.0.0.1:${publishedPort(containers.postgres, 5432)}/${database}`;
    execFileSync(
      process.execPath,
      [join(databaseRoot, 'node_modules/prisma/build/index.js'), 'migrate', 'deploy'],
      {
        cwd: databaseRoot,
        env: { ...baseEnvironment(), DATABASE_URL: databaseUrl },
        stdio: 'pipe',
      },
    );

    // Mailpit on the stack network; its SMTP port is also published for a host-network Keycloak.
    cleanups.push(() => removeLeftover('container', containers.mailpit));
    docker(
      'run',
      '--detach',
      '--rm',
      '--name',
      containers.mailpit,
      '--network',
      NAME,
      '--network-alias',
      'mailpit',
      '--publish',
      '127.0.0.1::8025',
      '--publish',
      '127.0.0.1::1025',
      '--env',
      'MP_SMTP_AUTH_ACCEPT_ANY=true',
      '--env',
      'MP_SMTP_AUTH_ALLOW_INSECURE=true',
      '--env',
      'MP_DISABLE_VERSION_CHECK=true',
      composeImage(root, 'mailpit'),
    );
    const mailpitUrl = `http://127.0.0.1:${publishedPort(containers.mailpit, 8025)}`;
    await until('Mailpit', () => answers(`${mailpitUrl}/readyz`));

    // Keycloak must reach the API's loopback back-channel logout endpoint (D-08). Docker Desktop
    // forwards `host.docker.internal` to the host's loopback, as the Compose realm relies on; on
    // Linux that name does not reach a loopback port, so Keycloak shares the host's network there.
    const hostNetwork = process.platform === 'linux';
    const keycloakAdmin = { username: 'e2e-bootstrap-admin', password: secrets.keycloakAdmin };
    const keycloakEnv = [
      ...keycloakServerOptions(),
      `KC_BOOTSTRAP_ADMIN_USERNAME=${keycloakAdmin.username}`,
      `KC_BOOTSTRAP_ADMIN_PASSWORD=${keycloakAdmin.password}`,
      `KEYCLOAK_WEB_CLIENT_SECRET=${secrets.webClient}`,
      `KEYCLOAK_PROVISIONER_CLIENT_SECRET=${secrets.provisionerClient}`,
      `KEYCLOAK_WEB_REDIRECT_URI=${WEB_ORIGIN}/api/auth/callback`,
      `KEYCLOAK_WEB_POST_LOGOUT_REDIRECT_URI=${WEB_ORIGIN}/`,
      `KEYCLOAK_WEB_BACKCHANNEL_LOGOUT_URL=http://${hostNetwork ? '127.0.0.1' : 'host.docker.internal'}:${API_PORT}/api/auth/backchannel-logout`,
      `KEYCLOAK_SMTP_HOST=${hostNetwork ? '127.0.0.1' : 'mailpit'}`,
      `KEYCLOAK_SMTP_PORT=${hostNetwork ? publishedPort(containers.mailpit, 1025) : 1025}`,
      'KEYCLOAK_SMTP_FROM=no-reply@vertex.test',
      'KEYCLOAK_SMTP_USER=keycloak',
      `KEYCLOAK_SMTP_PASSWORD=${secrets.smtp}`,
      'KEYCLOAK_SMTP_STARTTLS=false',
      'KEYCLOAK_SMTP_SSL=false',
    ];
    let network: string[];
    let keycloakPort: number;
    let managementPort: number;
    if (hostNetwork) {
      keycloakPort = await freePort();
      managementPort = await freePort();
      network = ['--network', 'host'];
      keycloakEnv.push(
        'KC_HTTP_HOST=127.0.0.1',
        `KC_HTTP_PORT=${keycloakPort}`,
        `KC_HTTP_MANAGEMENT_PORT=${managementPort}`,
      );
    } else {
      network = ['--network', NAME, '--publish', '127.0.0.1::8080', '--publish', '127.0.0.1::9000'];
      keycloakPort = 0;
      managementPort = 0;
    }
    const envFile = secretFile('keycloak.env', keycloakEnv);
    cleanups.push(() => removeLeftover('container', containers.keycloak));
    // Before the container is removed: its log, for the failure artifact.
    cleanups.push(() => {
      try {
        writeFileSync(keycloakLog, docker('logs', containers.keycloak));
      } catch {
        // No container, no log.
      }
    });
    docker(
      'run',
      '--detach',
      '--rm',
      '--name',
      containers.keycloak,
      ...network,
      '--env-file',
      envFile,
      '--mount',
      `type=bind,source=${join(root, 'infra/keycloak/import/vertex-realm.json')},target=/opt/keycloak/data/import/vertex-realm.json,readonly`,
      composeImage(root, 'keycloak'),
      'start-dev',
      '--import-realm',
    );
    if (!hostNetwork) {
      keycloakPort = publishedPort(containers.keycloak, 8080);
      managementPort = publishedPort(containers.keycloak, 9000);
    }
    await until(
      'Keycloak',
      () => answers(`http://127.0.0.1:${managementPort}/health/ready`),
      240_000,
      () => {
        try {
          docker('inspect', containers.keycloak);
          return undefined;
        } catch {
          return 'the container stopped';
        }
      },
    );

    // One host name for the browser and the API: one issuer, and one site with the web app (D-07).
    const keycloakUrl = `http://127.0.0.1:${keycloakPort}`;
    const issuer = `${keycloakUrl}/realms/vertex`;

    const commandEnv: Record<string, string> = {
      NODE_ENV: 'test',
      LOG_LEVEL: 'info',
      DATABASE_URL: databaseUrl,
      KEYCLOAK_ISSUER_URL: issuer,
      KEYCLOAK_PROVISIONER_CLIENT_ID: 'vertex-provisioner',
      KEYCLOAK_PROVISIONER_CLIENT_SECRET: secrets.provisionerClient,
      KEYCLOAK_INVITATION_LIFESPAN_SECONDS: '43200',
    };
    const runCommand = (script: string, args: string[] = []) =>
      execFileSync(process.execPath, ['--enable-source-maps', `dist/commands/${script}`, ...args], {
        cwd: apiRoot,
        env: { ...baseEnvironment(), ...commandEnv },
        encoding: 'utf8',
        stdio: 'pipe',
      });
    runCommand('iam-sync-reference.js');
    const adminEmail = `admin-${randomUUID()}@example.test`;
    runCommand('iam-bootstrap.js', ['--email', adminEmail, '--display-name', 'E2E Administrator']);

    // The built API server entry, with every value it reads (no `.env`).
    const api = start(
      process.execPath,
      ['--enable-source-maps', 'dist/main.js'],
      apiRoot,
      {
        ...baseEnvironment(),
        ...commandEnv,
        API_HOST: '127.0.0.1',
        API_PORT: String(API_PORT),
        KEYCLOAK_WEB_CLIENT_ID: 'vertex-web',
        KEYCLOAK_WEB_CLIENT_SECRET: secrets.webClient,
        KEYCLOAK_WEB_REDIRECT_URI: `${WEB_ORIGIN}/api/auth/callback`,
        KEYCLOAK_WEB_POST_LOGOUT_REDIRECT_URI: `${WEB_ORIGIN}/`,
        AUTH_TOKEN_ENCRYPTION_SECRET: secrets.tokenEncryption,
        // Parallel journeys share one client address; rate limiting is proven by the API tests.
        AUTH_RATE_LIMIT_SIGN_IN: '1000',
      },
      apiLog,
    );
    cleanups.push(() => stopProcess(api));
    await until(
      'the API',
      () => answers(`http://127.0.0.1:${API_PORT}/api/health/ready`),
      120_000,
      () => exited(api),
    );

    // The production web build, proxying `/api` to that API.
    const web = start(
      process.execPath,
      [
        join(webRoot, 'node_modules/vite/bin/vite.js'),
        'preview',
        '--port',
        String(WEB_PORT),
        '--strictPort',
      ],
      webRoot,
      { ...baseEnvironment(), API_HOST: '127.0.0.1', API_PORT: String(API_PORT) },
      webLog,
    );
    cleanups.push(() => stopProcess(web));
    // Also ends when the preview exits, for example because another server holds the port.
    await until(
      'the web preview',
      () => answers(WEB_ORIGIN),
      120_000,
      () => exited(web),
    );

    // The bootstrap administrator completes the invitation and signs in once (D-05).
    const adminState = join(work, 'admin-state.json');
    const handled = known;
    const browser = await chromium.launch();
    try {
      const traffic = new ApiTraffic();
      const context = await webContext(browser, traffic);
      const page = await context.newPage();
      const device = await completeInvitation(
        page,
        actionLink(await waitForMail(mailpitUrl, adminEmail)),
      );
      handled.push(device.secret);
      await signIn(page, adminEmail, device);
      await page.getByRole('region', { name: 'Account' }).getByText('E2E Administrator').waitFor();
      const state = await context.storageState({ path: adminState });
      handled.push(
        ...state.cookies
          .filter((cookie) => cookie.name.startsWith('__Host-vertex'))
          .map((cookie) => cookie.value),
      );
      const findings = await traffic.settled();
      if (findings.length > 0)
        throw new Error(`Token material reached the browser: ${findings.join('; ')}`);
    } finally {
      await browser.close();
    }

    const stack: IamStack = {
      keycloakUrl,
      issuer,
      mailpitUrl,
      adminState,
      adminEmail,
      postgres: { container: containers.postgres, user: postgresUser, database },
      keycloakAdmin,
      commandEnv,
      handledFile,
    };
    process.env[STACK_VARIABLE] = JSON.stringify(stack);
    ready = true;

    return teardown;
  } catch (error) {
    await teardown();
    throw error;
  }
}
