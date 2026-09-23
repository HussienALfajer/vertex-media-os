import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { GenericContainer, type StartedTestContainer, Wait } from 'testcontainers';

/**
 * The pinned Keycloak image. infra/compose.yaml uses the same reference; a unit test fails if
 * they differ (IAM-R01 D-01).
 */
export const KEYCLOAK_IMAGE =
  'quay.io/keycloak/keycloak:26.7.4@sha256:82a77884f3af238beab1e7afd63b5f530e1b5c0590bd7aa60b40a40463e29b2c';

export const REALM = 'vertex';

const keycloakRoot = new URL('../../../infra/keycloak/', import.meta.url);
export const REALM_FILE = fileURLToPath(new URL('import/vertex-realm.json', keycloakRoot));
export const SERVER_OPTIONS_FILE = fileURLToPath(new URL('keycloak.env', keycloakRoot));

/** Environment names the committed realm resolves as import placeholders. */
export const REALM_PLACEHOLDERS = [
  'KEYCLOAK_WEB_CLIENT_SECRET',
  'KEYCLOAK_PROVISIONER_CLIENT_SECRET',
  'KEYCLOAK_WEB_REDIRECT_URI',
  'KEYCLOAK_WEB_POST_LOGOUT_REDIRECT_URI',
  'KEYCLOAK_WEB_BACKCHANNEL_LOGOUT_URL',
] as const;

export interface KeycloakUris {
  readonly redirect: string;
  readonly postLogoutRedirect: string;
  readonly backchannelLogout: string;
}

export interface StartedKeycloak {
  readonly container: StartedTestContainer;
  /** Base URL as seen from the test process, for example `http://localhost:32768`. */
  readonly baseUrl: string;
  /** Issuer of the `vertex` realm for requests made through `baseUrl`. */
  readonly issuer: string;
  readonly uris: KeycloakUris;
  /** Test-only secrets generated for this container; never committed or logged. */
  readonly secrets: {
    readonly webClient: string;
    readonly provisionerClient: string;
    readonly adminUsername: string;
    readonly adminPassword: string;
  };
  /** Calls the `vertex` realm Admin REST API (`/admin/realms/vertex<path>`) as the bootstrap administrator. */
  admin(path: string, init?: RequestInit): Promise<Response>;
  /** Container output so far (stdout and stderr). */
  logs(): Promise<string>;
  stop(): Promise<void>;
}

export interface KeycloakOptions {
  readonly uris?: Partial<KeycloakUris>;
}

/** Distinctive values, so a test can prove no log line contains them. */
function sentinel(label: string): string {
  return `sentinel-${label}-${randomBytes(18).toString('base64url')}`;
}

/** Parses the shared non-secret server options (plain `KEY=VALUE` lines). */
export function readServerOptions(): Record<string, string> {
  return Object.fromEntries(
    readFileSync(SERVER_OPTIONS_FILE, 'utf8')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line !== '' && !line.startsWith('#'))
      .map((line) => {
        const separator = line.indexOf('=');
        if (separator <= 0) throw new Error(`Malformed server option line: ${line}`);
        return [line.slice(0, separator), line.slice(separator + 1)];
      }),
  );
}

/**
 * Starts the pinned Keycloak in development mode with the committed `vertex` realm, generated
 * test secrets and the shared server options, and waits until the management interface reports
 * readiness (after the realm import) and the realm answers discovery.
 */
export async function startKeycloak(options: KeycloakOptions = {}): Promise<StartedKeycloak> {
  const uris: KeycloakUris = {
    redirect: 'http://127.0.0.1:4300/api/auth/callback',
    postLogoutRedirect: 'http://127.0.0.1:4300/',
    backchannelLogout: 'http://host.docker.internal:3100/api/auth/backchannel-logout',
    ...options.uris,
  };
  const secrets = {
    webClient: sentinel('web'),
    provisionerClient: sentinel('provisioner'),
    adminUsername: 'test-bootstrap-admin',
    adminPassword: sentinel('admin'),
  };

  const container = await new GenericContainer(KEYCLOAK_IMAGE)
    .withEnvironment({
      ...readServerOptions(),
      KC_BOOTSTRAP_ADMIN_USERNAME: secrets.adminUsername,
      KC_BOOTSTRAP_ADMIN_PASSWORD: secrets.adminPassword,
      KEYCLOAK_WEB_CLIENT_SECRET: secrets.webClient,
      KEYCLOAK_PROVISIONER_CLIENT_SECRET: secrets.provisionerClient,
      KEYCLOAK_WEB_REDIRECT_URI: uris.redirect,
      KEYCLOAK_WEB_POST_LOGOUT_REDIRECT_URI: uris.postLogoutRedirect,
      KEYCLOAK_WEB_BACKCHANNEL_LOGOUT_URL: uris.backchannelLogout,
    })
    .withCopyFilesToContainer([
      { source: REALM_FILE, target: '/opt/keycloak/data/import/vertex-realm.json' },
    ])
    .withCommand(['start-dev', '--import-realm'])
    .withExposedPorts(8080, 9000)
    .withWaitStrategy(Wait.forHttp('/health/ready', 9000).forStatusCode(200))
    .withStartupTimeout(240_000)
    .start();

  const baseUrl = `http://${container.getHost()}:${container.getMappedPort(8080)}`;
  const issuer = `${baseUrl}/realms/${REALM}`;

  try {
    const discovery = await fetch(`${issuer}/.well-known/openid-configuration`);
    if (!discovery.ok) throw new Error(`Realm discovery answered ${discovery.status}.`);
  } catch (error) {
    await container.stop();
    throw error;
  }

  let adminToken: { value: string; expiresAt: number } | undefined;
  async function bearer(): Promise<string> {
    if (adminToken && adminToken.expiresAt > Date.now()) return adminToken.value;
    const response = await fetch(`${baseUrl}/realms/master/protocol/openid-connect/token`, {
      method: 'POST',
      body: new URLSearchParams({
        grant_type: 'password',
        client_id: 'admin-cli',
        username: secrets.adminUsername,
        password: secrets.adminPassword,
      }),
    });
    if (!response.ok) throw new Error(`Bootstrap admin token request failed: ${response.status}`);
    const body = (await response.json()) as { access_token: string; expires_in: number };
    adminToken = {
      value: body.access_token,
      expiresAt: Date.now() + (body.expires_in - 10) * 1000,
    };
    return adminToken.value;
  }

  return {
    container,
    baseUrl,
    issuer,
    uris,
    secrets,
    async admin(path, init = {}) {
      const headers = new Headers(init.headers);
      headers.set('authorization', `Bearer ${await bearer()}`);
      if (init.body !== undefined && !headers.has('content-type')) {
        headers.set('content-type', 'application/json');
      }
      return fetch(`${baseUrl}/admin/realms/${REALM}${path}`, { ...init, headers });
    },
    async logs() {
      const stream = await container.logs();
      const chunks: string[] = [];
      await new Promise<void>((resolve, reject) => {
        stream.on('data', (chunk: Buffer | string) => chunks.push(chunk.toString()));
        stream.on('error', reject);
        stream.on('end', () => resolve());
        // Docker keeps following a running container; what has arrived shortly after is enough.
        setTimeout(() => {
          stream.destroy();
          resolve();
        }, 1_000);
      });
      return chunks.join('');
    },
    async stop() {
      await container.stop();
    },
  };
}
