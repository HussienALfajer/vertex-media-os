#!/usr/bin/env node
/**
 * Creates or completes the ignored local `.env` from `.env.example`, generating every secret.
 *
 *   pnpm env:setup            # create .env, or append the keys it is missing
 *   pnpm env:setup -- --force # replace .env (loses local overrides)
 *
 * `.env.example` marks each generated value as `<generated:NAME>`. Every NAME receives its own
 * random value, and repeated NAMEs share one (the database password appears in two keys).
 * Values are never printed.
 *
 * Without `--force`, an existing `.env` is never rewritten: only keys that `.env.example` has and
 * `.env` lacks are appended, so a checkout that predates a new service picks up its settings.
 *
 * PostgreSQL and Keycloak apply their generated credentials only when they initialise an empty
 * data volume and keep them afterwards. A value is therefore generated only while the volume that
 * owns it does not exist; otherwise `.env` and the service would silently disagree. Rotating local
 * credentials means deleting the local data first, which the script explains when it refuses.
 *
 * Uses only Node built-ins so no dependency is needed for secret generation.
 */
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Must match `name:` and the volume keys in infra/compose.yaml.
const COMPOSE_PROJECT = 'vertexos';

/** The Compose volume that keeps each generated value once the service has started. */
const OWNING_VOLUME = {
  'postgres-password': 'postgres-data',
  'keycloak-admin-username': 'keycloak-data',
  'keycloak-admin-password': 'keycloak-data',
  'keycloak-web-client-secret': 'keycloak-data',
  'keycloak-provisioner-client-secret': 'keycloak-data',
};

const PLACEHOLDER = /<generated:([a-z0-9-]+)>/g;
const ASSIGNMENT = /^([A-Za-z_][A-Za-z0-9_]*)=/;

const repositoryRoot = resolve(import.meta.dirname, '..');
const examplePath = resolve(repositoryRoot, '.env.example');
const envPath = resolve(repositoryRoot, '.env');
const force = process.argv.includes('--force');
const envExists = existsSync(envPath);

const template = readFileSync(examplePath, 'utf8');
const templateLines = template.split(/\r?\n/);
const unknown = [...new Set(placeholdersIn(template))].filter((name) => !(name in OWNING_VOLUME));
if (unknown.length > 0) {
  fail(
    `.env.example uses placeholders with no owning volume in this script: ${unknown.join(', ')}.`,
  );
}
if (placeholdersIn(template).length === 0) {
  fail('.env.example no longer contains any <generated:NAME> placeholder; refusing to write .env.');
}

if (envExists && !force) {
  completeExistingEnv();
} else {
  writeNewEnv();
}

function writeNewEnv() {
  const names = [...new Set(placeholdersIn(template))];
  refuseIfVolumesExist(names, [
    ...(envExists
      ? [
          '.env was left untouched. To rotate the local credentials, delete the local development',
          'data first (all data in PostgreSQL and Keycloak is lost), then generate new ones:',
          '',
          '  pnpm infra:reset',
          '  pnpm env:setup -- --force',
        ]
      : [
          'Those values came from an earlier .env. Restore it if you still have it. Otherwise delete',
          'the local development data (all of it is lost) and run this command again:',
          '',
          `  docker compose -p ${COMPOSE_PROJECT} down --volumes`,
          '  pnpm env:setup',
        ]),
  ]);

  const values = generate(names);
  writeFileSync(envPath, render(template, values), {
    encoding: 'utf8',
    flag: force ? 'w' : 'wx',
  });
  console.log(`Wrote ${envPath} with generated local secrets (${names.join(', ')}).`);
  if (envExists) {
    console.log(
      'It was recreated from .env.example: re-apply local overrides such as POSTGRES_PORT.',
    );
  }
}

function completeExistingEnv() {
  const present = new Set(
    readFileSync(envPath, 'utf8')
      .split(/\r?\n/)
      .map((line) => ASSIGNMENT.exec(line)?.[1])
      .filter((key) => key !== undefined),
  );
  const assignments = templateLines.filter((line) => ASSIGNMENT.test(line));
  const missing = assignments.filter((line) => !present.has(ASSIGNMENT.exec(line)[1]));

  if (missing.length === 0) {
    console.log('.env already exists and has every key in .env.example; leaving it untouched.');
    return;
  }

  // A value generated now could not match one that `.env` already holds under another key.
  const presentNames = new Set(
    assignments
      .filter((line) => present.has(ASSIGNMENT.exec(line)[1]))
      .flatMap((line) => placeholdersIn(line)),
  );
  const shared = missing.filter((line) => placeholdersIn(line).some((n) => presentNames.has(n)));
  if (shared.length > 0) {
    fail(
      [
        'Cannot append these keys because their generated value must equal one .env already holds',
        `under another key: ${shared.map((line) => ASSIGNMENT.exec(line)[1]).join(', ')}.`,
        'Add them to .env by hand, using the value .env already has; see .env.example.',
      ].join('\n'),
    );
  }

  const names = [...new Set(missing.flatMap((line) => placeholdersIn(line)))];
  refuseIfVolumesExist(names, [
    '.env was left untouched. Restore the values those services were initialised with, or delete',
    'the local development data (all data in PostgreSQL and Keycloak is lost) and run this again:',
    '',
    '  pnpm infra:reset',
    '  pnpm env:setup',
  ]);

  const values = generate(names);
  const block = [
    '',
    '# --- Added by pnpm env:setup from .env.example (see its comments for each key) ---',
    ...missing.map((line) => render(line, values)),
    '',
  ].join('\n');
  appendFileSync(envPath, block, 'utf8');
  const keys = missing.map((line) => ASSIGNMENT.exec(line)[1]);
  console.log(`Appended ${keys.length} missing key(s) to ${envPath}: ${keys.join(', ')}.`);
}

function placeholdersIn(text) {
  return [...text.matchAll(PLACEHOLDER)].map((match) => match[1]);
}

function generate(names) {
  // URL-safe so a value can be embedded in DATABASE_URL without percent-encoding.
  return Object.fromEntries(names.map((name) => [name, randomBytes(24).toString('base64url')]));
}

function render(text, values) {
  return text.replaceAll(PLACEHOLDER, (_, name) => values[name]);
}

function refuseIfVolumesExist(names, advice) {
  if (names.length === 0) return;
  const owners = new Set(names.map((name) => OWNING_VOLUME[name]));
  const existing = existingVolumes().filter((volume) => owners.has(volume.key));
  if (existing.length === 0) return;
  fail(
    [
      'Refusing to generate new local credentials.',
      '',
      `These Docker volumes already hold local data initialised with earlier credentials, which a`,
      `new value in .env would not match: ${existing.map((volume) => volume.name).join(', ')}.`,
      '',
      ...advice,
    ].join('\n'),
  );
}

/** This repository's local Compose volumes, as `{ key, name }` (key as in infra/compose.yaml). */
function existingVolumes() {
  let output;
  try {
    output = execFileSync(
      'docker',
      [
        'volume',
        'ls',
        '--filter',
        `label=com.docker.compose.project=${COMPOSE_PROJECT}`,
        '--format',
        '{{.Name}} {{.Label "com.docker.compose.volume"}}',
      ],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    );
  } catch (error) {
    const reason =
      String(error.stderr ?? '')
        .trim()
        .split('\n')[0] || error.message;
    fail(
      [
        'Cannot check whether the local data volumes already exist, so no secret was generated.',
        `Make sure Docker is installed and running, then try again. (${reason})`,
      ].join('\n'),
    );
  }
  return output
    .split(/\r?\n/)
    .map((line) => line.trim().split(' '))
    .filter(([name, key]) => name && key)
    .map(([name, key]) => ({ name, key }));
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
