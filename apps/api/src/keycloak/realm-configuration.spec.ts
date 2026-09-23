import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  KEYCLOAK_IMAGE,
  REALM_FILE,
  REALM_PLACEHOLDERS,
  readServerOptions,
} from '../../test-support/keycloak.js';

/**
 * Static guards on the committed local identity-provider configuration (IAM-R01 D-01, D-03, D-04).
 * The effective realm behaviour is proven against real Keycloak in
 * realm-contract.integration.spec.ts.
 */

const workspaceFile = (path: string) =>
  readFileSync(fileURLToPath(new URL(`../../../../${path}`, import.meta.url)), 'utf8');

const compose = workspaceFile('infra/compose.yaml');
const realmText = readFileSync(REALM_FILE, 'utf8');
const realm = JSON.parse(realmText) as {
  clients: { clientId: string; secret?: string }[];
  users?: { credentials?: unknown }[];
};

describe('Keycloak image', () => {
  it('is pinned by tag and digest, identically in Compose and the test harness', () => {
    expect(KEYCLOAK_IMAGE).toMatch(/^quay\.io\/keycloak\/keycloak:26\.7\.4@sha256:[0-9a-f]{64}$/);
    const images = [...compose.matchAll(/^\s+image:\s*(\S+)\s*$/gm)].map((match) => match[1]);
    expect(images).toContain(KEYCLOAK_IMAGE);
    expect(images.filter((image) => image?.startsWith('quay.io/keycloak/'))).toEqual([
      KEYCLOAK_IMAGE,
    ]);
  });
});

describe('local exposure', () => {
  it('publishes every Compose port on the loopback interface only', () => {
    const published = [...compose.matchAll(/^\s+-\s+'([^']*:\d+)'\s*$/gm)].map((match) => match[1]);
    expect(published.length).toBeGreaterThanOrEqual(2);
    for (const port of published) expect(port).toMatch(/^127\.0\.0\.1:/);
    expect(compose).not.toMatch(/:9000['"]/);
  });

  it('runs Keycloak in development mode with the realm import', () => {
    expect(compose).toContain("command: ['start-dev', '--import-realm']");
  });
});

describe('committed secrets', () => {
  it('holds every client secret as a bare environment placeholder without a default', () => {
    const secrets = realm.clients.map((client) => [client.clientId, client.secret]);
    expect(secrets).toEqual([
      ['vertex-web', '${KEYCLOAK_WEB_CLIENT_SECRET}'],
      ['vertex-provisioner', '${KEYCLOAK_PROVISIONER_CLIENT_SECRET}'],
    ]);
    expect(realm.users?.every((user) => user.credentials === undefined)).toBe(true);
  });

  it('resolves exactly the placeholders that Compose and the harness supply', () => {
    // Keycloak placeholders are upper-case environment names; the user profile's `${username}`
    // style message keys are lower-case and are not placeholders.
    const used = new Set([...realmText.matchAll(/\$\{([A-Z0-9_]+)(:[^}]*)?\}/g)].map((m) => m[1]));
    expect([...used].sort()).toEqual([...REALM_PLACEHOLDERS].sort());
    expect(realmText).not.toMatch(/\$\{[A-Z0-9_]+:/);
    for (const name of REALM_PLACEHOLDERS) {
      expect(compose).toContain(`${name}: \${${name}:?`);
    }
  });

  it('keeps no credential in the shared server options or the environment template', () => {
    const credentialKey = /(_SECRET|_PASSWORD|_USERNAME|BOOTSTRAP_ADMIN.*)$/;
    expect(Object.keys(readServerOptions()).filter((key) => credentialKey.test(key))).toEqual([]);
    const template = workspaceFile('.env.example');
    const secretLines = template
      .split(/\r?\n/)
      .filter((line) => /^[A-Z0-9_]*(SECRET|PASSWORD)[A-Z0-9_]*=/.test(line));
    expect(secretLines.length).toBeGreaterThanOrEqual(4);
    for (const line of secretLines) expect(line).toMatch(/=<generated:[a-z0-9-]+>$/);
  });
});
