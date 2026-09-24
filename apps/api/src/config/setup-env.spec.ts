import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

/**
 * `pnpm env:setup` (scripts/setup-env.mjs; IAM-CP1 CP1-11, IAM-R09 D-17), run as a copy against a
 * controlled template in a temporary directory. The script asks Docker which local data volumes
 * exist; a preload replaces that one call, so the script itself runs unchanged.
 */
const SCRIPT = fileURLToPath(new URL('../../../../scripts/setup-env.mjs', import.meta.url));

const TEMPLATE = [
  '# Local settings (test template)',
  'API_PORT=3000',
  'AUTH_TOKEN_ENCRYPTION_SECRET=<generated:auth-token-encryption-secret>',
  'POSTGRES_PASSWORD=<generated:postgres-password>',
  'DATABASE_URL=postgresql://vertex:<generated:postgres-password>@127.0.0.1:5432/vertex',
  '',
].join('\n');

/** Replaces `execFileSync('docker', …)`: FAKE_DOCKER names existing volume keys, or `missing`. */
const FAKE_DOCKER = `import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
childProcess.execFileSync = (command) => {
  if (command !== 'docker') throw new Error('unexpected command ' + command);
  const mode = process.env.FAKE_DOCKER ?? '';
  if (mode === 'missing') {
    const error = new Error('spawn docker ENOENT');
    error.stderr = '';
    throw error;
  }
  return mode === '' ? '' : mode.split(',').map((key) => 'vertexos_' + key + ' ' + key).join('\\n');
};
syncBuiltinESMExports();
`;

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'vertex-env-setup-'));
  mkdirSync(join(root, 'scripts'));
  copyFileSync(SCRIPT, join(root, 'scripts', 'setup-env.mjs'));
  writeFileSync(join(root, 'scripts', 'fake-docker.mjs'), FAKE_DOCKER);
  writeFileSync(join(root, '.env.example'), TEMPLATE);
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function run(options: { docker?: string; force?: boolean } = {}) {
  const result = spawnSync(
    process.execPath,
    [
      '--import',
      './scripts/fake-docker.mjs',
      'scripts/setup-env.mjs',
      ...(options.force ? ['--force'] : []),
    ],
    {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, FAKE_DOCKER: options.docker ?? '' },
    },
  );
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
}

const envPath = () => join(root, '.env');
const env = () => readFileSync(envPath(), 'utf8');
const value = (text: string, key: string) => new RegExp(`^${key}=(.*)$`, 'm').exec(text)?.[1] ?? '';

describe('pnpm env:setup', () => {
  it('creates .env with a fresh value per name, shared where a name repeats, printing none', () => {
    const { status, output } = run();
    expect(status).toBe(0);
    const text = env();
    expect(text).not.toContain('<generated:');
    const secret = value(text, 'AUTH_TOKEN_ENCRYPTION_SECRET');
    const password = value(text, 'POSTGRES_PASSWORD');
    expect(secret).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(password).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(secret).not.toBe(password);
    expect(value(text, 'DATABASE_URL')).toBe(
      `postgresql://vertex:${password}@127.0.0.1:5432/vertex`,
    );
    expect(output).not.toContain(secret);
    expect(output).not.toContain(password);
  });

  it('refuses to create values for a service whose data volume already exists', () => {
    const { status, output } = run({ docker: 'postgres-data' });
    expect(status).toBe(1);
    expect(output).toContain('Refusing to generate new local credentials.');
    expect(output).toContain('vertexos_postgres-data');
    expect(existsSync(envPath())).toBe(false);
  });

  it('refuses when Docker cannot say which volumes exist', () => {
    const { status, output } = run({ docker: 'missing' });
    expect(status).toBe(1);
    expect(output).toContain('Cannot check whether the local data volumes already exist');
    expect(existsSync(envPath())).toBe(false);
  });

  it('appends only the missing keys, generating values only the API reads without Docker', () => {
    const existing = [
      '# my local file',
      'POSTGRES_PASSWORD=kept-password',
      'DATABASE_URL=postgresql://vertex:kept-password@127.0.0.1:5440/vertex',
      '',
    ].join('\n');
    writeFileSync(envPath(), existing);
    // Docker is not consulted: the API's own secret belongs to no data volume.
    const { status, output } = run({ docker: 'missing' });
    expect(status).toBe(0);
    expect(output).toContain('Appended 2 missing key(s)');
    const text = env();
    expect(text.startsWith(existing)).toBe(true);
    expect(value(text, 'API_PORT')).toBe('3000');
    expect(value(text, 'AUTH_TOKEN_ENCRYPTION_SECRET')).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(value(text, 'POSTGRES_PASSWORD')).toBe('kept-password');
  });

  it('leaves a complete .env untouched', () => {
    run();
    const before = env();
    const { status, output } = run({ docker: 'postgres-data' });
    expect(status).toBe(0);
    expect(output).toContain('leaving it untouched');
    expect(env()).toBe(before);
  });

  it('refuses to append a key whose value must equal one .env already holds', () => {
    const existing = 'DATABASE_URL=postgresql://vertex:kept@127.0.0.1:5432/vertex\n';
    writeFileSync(envPath(), existing);
    const { status, output } = run();
    expect(status).toBe(1);
    expect(output).toContain('Cannot append these keys');
    expect(output).toContain('POSTGRES_PASSWORD');
    expect(env()).toBe(existing);
  });

  it('refuses to append values for a service whose data volume already exists', () => {
    const existing = 'API_PORT=3000\nAUTH_TOKEN_ENCRYPTION_SECRET=kept-secret\n';
    writeFileSync(envPath(), existing);
    const { status, output } = run({ docker: 'postgres-data' });
    expect(status).toBe(1);
    expect(output).toContain('Refusing to generate new local credentials.');
    expect(env()).toBe(existing);
  });

  it('replaces .env only with --force and only while no owning volume exists', () => {
    writeFileSync(envPath(), 'API_PORT=3999\n');
    const refused = run({ force: true, docker: 'postgres-data' });
    expect(refused.status).toBe(1);
    expect(env()).toBe('API_PORT=3999\n');

    const replaced = run({ force: true });
    expect(replaced.status).toBe(0);
    expect(replaced.output).toContain('re-apply local overrides');
    expect(value(env(), 'API_PORT')).toBe('3000');
  });
});
