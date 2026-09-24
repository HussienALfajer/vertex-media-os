import { randomBytes, randomUUID } from 'node:crypto';
import {
  parseAdministrativeReason,
  parseSystemProcess,
  parseTraceId,
  userActor,
  type AuditAttribution,
} from '@vertex-os/audit';
import { createAuditRecorder } from '@vertex-os/audit-persistence';
import { createDatabaseClient, type DatabaseClient } from '@vertex-os/database';
import { iamPermissionManifest } from '@vertex-os/iam';
import { synchronizeIamReferenceData } from '@vertex-os/iam/composition';
import { createIamTransactionRunner } from '@vertex-os/iam-persistence';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { seedInvitedUser } from '../../test-support/iam-users.js';
import { startKeycloak, type StartedKeycloak } from '../../test-support/keycloak.js';
import { startMigratedPostgres, type MigratedPostgres } from '../../test-support/postgres.js';
import { createSessionStore } from '../auth/session-store.js';
import {
  EXIT_COMPLETE,
  EXIT_INCOMPLETE,
  EXIT_REFUSED,
  EXIT_USAGE,
  runIamBootstrap,
} from '../commands/iam-bootstrap.command.js';
import { loadAppConfig, type AppConfig } from '../config/app-config.js';
import {
  loadIdentityProvisioningConfig,
  type IdentityProvisioningConfig,
} from '../config/identity-provisioning-config.js';
import { createIamAdministration, type IamAdministration } from './administration.js';
import {
  createIamBootstrap,
  createIamUserAdministration,
  type IamUserAdministration,
  type RevokeUserSessions,
} from './user-administration.js';

/**
 * IAM user lifecycle administration and the bootstrap command composed with their real adapters:
 * PostgreSQL, the Audit adapter, the session store and the pinned Keycloak with its mail sink
 * (IAM-R06 Done means 1 to 9). Keycloak failures are injected through the adapter's transport.
 */

let postgres: MigratedPostgres;
let keycloak: StartedKeycloak;
let database: DatabaseClient;
let provisioning: IdentityProvisioningConfig;
let appConfig: AppConfig;
let users: IamUserAdministration;
let offline: IamUserAdministration;
let roles: IamAdministration;
let revokeUserSessions: RevokeUserSessions;

/** A transport that never reaches Keycloak: every provider outcome is unknown. */
const unreachable: typeof fetch = () => Promise.reject(new TypeError('fetch failed'));

beforeAll(async () => {
  [postgres, keycloak] = await Promise.all([startMigratedPostgres(), startKeycloak()]);
  database = createDatabaseClient({ connectionString: postgres.url });
  provisioning = loadIdentityProvisioningConfig({
    NODE_ENV: 'test',
    KEYCLOAK_ISSUER_URL: keycloak.issuer,
    KEYCLOAK_PROVISIONER_CLIENT_ID: 'vertex-provisioner',
    KEYCLOAK_PROVISIONER_CLIENT_SECRET: keycloak.secrets.provisionerClient,
  });
  appConfig = loadAppConfig({ NODE_ENV: 'test', LOG_LEVEL: 'info', DATABASE_URL: postgres.url });
  const store = createSessionStore(database, { auditRecorderFor: createAuditRecorder });
  revokeUserSessions = (userId, reason, attribution) =>
    store.revokeUserSessions({ userId, reason, now: new Date(), attribution });
  users = createIamUserAdministration(provisioning, database, { revokeUserSessions });
  offline = createIamUserAdministration(provisioning, database, {
    revokeUserSessions,
    fetch: unreachable,
  });
  roles = createIamAdministration(database, { auditRecorderFor: createAuditRecorder });
  await synchronize();
}, 300_000);

afterAll(async () => {
  await database?.disconnect();
  await Promise.all([postgres?.stop(), keycloak?.stop()]);
});

// ---------------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------------

async function synchronize(): Promise<void> {
  const traceId = parseTraceId('trace-lifecycle-sync');
  if (!traceId.ok) throw new Error('trace fixture');
  const synced = await synchronizeIamReferenceData(
    { runner: createIamTransactionRunner(database, { auditRecorderFor: createAuditRecorder }) },
    { manifests: [iamPermissionManifest], traceId: traceId.value },
  );
  if (synced.outcome !== 'synchronized') throw new Error('reference synchronization');
}

function system(reason?: string): AuditAttribution {
  const process = parseSystemProcess('iam.test-lifecycle');
  const traceId = parseTraceId(`trace-${randomUUID()}`);
  if (!process.ok || !traceId.ok) throw new Error('attribution fixture');
  const actor = { type: 'SYSTEM', process: process.value } as const;
  if (reason === undefined) return { actor, traceId: traceId.value };
  const parsed = parseAdministrativeReason(reason);
  if (!parsed.ok) throw new Error('reason fixture');
  return { actor, traceId: traceId.value, reason: parsed.value };
}

function as(userId: string): AuditAttribution {
  const actor = userActor(userId);
  const traceId = parseTraceId(`trace-${randomUUID()}`);
  if (!actor.ok || !traceId.ok) throw new Error('attribution fixture');
  return { actor: actor.value, traceId: traceId.value };
}

function uniqueEmail(label: string): string {
  return `${label}-${randomBytes(4).toString('hex')}@example.test`;
}

function sql(statement: string): Promise<string> {
  return postgres.sql(statement);
}

async function value(statement: string): Promise<string> {
  return (await sql(statement)).split('\n')[0] ?? '';
}

async function row(id: string) {
  return value(
    `SELECT access_state || '|' || identity_sync_state || '|' || invitation_delivery_state
       FROM iam_application_user WHERE id = '${id}'`,
  );
}

async function subjectOf(id: string): Promise<string> {
  return value(`SELECT identity_subject FROM iam_application_user WHERE id = '${id}'`);
}

async function identityEnabled(subject: string): Promise<boolean> {
  const response = await keycloak.admin(`/users/${subject}`);
  if (!response.ok) throw new Error(`identity ${subject} answered ${response.status}`);
  return ((await response.json()) as { enabled: boolean }).enabled;
}

async function trail(id: string): Promise<string[]> {
  const out = await sql(
    `SELECT action || ':' || result FROM audit_record WHERE target_id = '${id}'
       ORDER BY occurred_at, id`,
  );
  return out === '' ? [] : out.split('\n');
}

/** Stores `count` live application sessions for the user, as a sign-in would. */
async function liveSessions(userId: string, count = 2): Promise<void> {
  for (let index = 0; index < count; index += 1) {
    const hash = () => randomBytes(32).toString('base64url');
    await sql(
      `INSERT INTO auth_session (token_hash, csrf_token_hash, user_id, created_at, last_seen_at,
         idle_expires_at, absolute_expires_at)
       VALUES ('${hash()}', '${hash()}', '${userId}', now(), now(), now() + interval '30 minutes',
         now() + interval '8 hours')`,
    );
  }
}

async function revocations(userId: string): Promise<string> {
  return sql(
    `SELECT coalesce(revocation_reason::text, 'live') FROM auth_session WHERE user_id = '${userId}'
       ORDER BY revocation_reason`,
  );
}

/** Creates a user through the use case and completes first activation as sign-in would. */
async function activeUser(label: string, roleIds: string[] = []): Promise<string> {
  const created = await users.createUser(
    { email: uniqueEmail(label), displayName: 'Synthetic User', roleIds },
    system(),
  );
  if (created.outcome !== 'created') throw new Error(`seed user: ${created.outcome}`);
  expect(created.identity).toEqual({ outcome: 'synced' });
  await sql(
    `UPDATE iam_application_user SET access_state = 'ACTIVE', first_activated_at = now(),
       version = version + 1 WHERE id = '${created.user.id}'`,
  );
  return created.user.id;
}

/**
 * Runs `statements` in one psql transaction that holds its locks for `seconds` and resolves once
 * it sleeps, so operations started next are in flight together when it commits (as in R05).
 */
async function holdLocks(statements: string, seconds = 1.5): Promise<{ done: Promise<string> }> {
  const marker = `hold_${randomUUID().replaceAll('-', '')}`;
  const done = sql(`BEGIN; ${statements}; SELECT pg_sleep(${seconds}) AS ${marker}; COMMIT;`);
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const sleeping = await value(
      `SELECT count(*) FROM pg_stat_activity WHERE query LIKE '%AS ${marker}%'
         AND wait_event = 'PgSleep'`,
    );
    if (sleeping === '1') return { done };
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('the lock-holding transaction never started sleeping');
}

const HOLD_SYSTEM_ROLE = `SELECT id FROM iam_role WHERE code = 'system-administrator' FOR UPDATE`;
const HOLD_USERS = (...ids: string[]) =>
  `SELECT id FROM iam_application_user WHERE id IN ('${ids.join(`', '`)}') ORDER BY id FOR UPDATE`;

async function systemRoleId(): Promise<string> {
  return value(`SELECT id FROM iam_role WHERE code = 'system-administrator'`);
}

async function versionOf(id: string): Promise<number> {
  return Number(await value(`SELECT version FROM iam_application_user WHERE id = '${id}'`));
}

// ---------------------------------------------------------------------------------------------
// Creation (spec Section 12; IAM-R06 D-11)
// ---------------------------------------------------------------------------------------------

describe('user creation', () => {
  it('commits the user with memberships and roles, then provisions and invites it', async () => {
    const department = await roles.createDepartment(
      { code: `d-${randomBytes(3).toString('hex')}`, name: 'Studio' },
      system(),
    );
    const role = await roles.createRole(
      { code: `r-${randomBytes(3).toString('hex')}`, name: 'Reader' },
      system(),
    );
    if (department.outcome !== 'created' || role.outcome !== 'created') throw new Error('seed');
    const email = uniqueEmail('create');

    const created = await users.createUser(
      {
        email: `  ${email.toUpperCase()} `,
        displayName: 'Ada Lovelace',
        memberships: [{ departmentId: department.department.id, isPrimary: true }],
        roleIds: [role.role.id],
      },
      system(),
    );

    expect(created).toMatchObject({
      outcome: 'created',
      user: {
        email,
        displayName: 'Ada Lovelace',
        accessState: 'INVITED',
        identitySyncState: 'SYNCED',
        invitationDeliveryState: 'SENT',
      },
      identity: { outcome: 'synced' },
      invitation: { outcome: 'sent' },
    });
    if (created.outcome !== 'created') return;
    expect(Object.keys(created.user)).not.toContain('identity');
    expect(await keycloak.mail.waitFor(email)).toBeDefined();
    expect(
      await value(
        `SELECT count(*) FROM iam_department_membership WHERE user_id = '${created.user.id}'
           AND is_primary`,
      ),
    ).toBe('1');
    expect(
      await value(
        `SELECT count(*) FROM iam_user_role_assignment WHERE user_id = '${created.user.id}'`,
      ),
    ).toBe('1');
    expect(await trail(created.user.id)).toEqual([
      'iam.user.created:SUCCEEDED',
      'iam.user.identity-bound:SUCCEEDED',
      'iam.user.identity-reconciled:SUCCEEDED',
      'iam.user.invitation-dispatch-started:SUCCEEDED',
      'iam.user.invitation-dispatched:SUCCEEDED',
    ]);
  });

  it('creates nothing, locally or in Keycloak, for an existing email', async () => {
    const email = uniqueEmail('twice');
    const first = await users.createUser({ email, displayName: 'First' }, system());
    expect(first.outcome).toBe('created');
    const before = await value(`SELECT count(*) FROM audit_record`);

    expect(await users.createUser({ email, displayName: 'Second' }, system())).toEqual({
      outcome: 'email-conflict',
    });
    expect(await value(`SELECT count(*) FROM iam_application_user WHERE email = '${email}'`)).toBe(
      '1',
    );
    expect(await value(`SELECT count(*) FROM audit_record`)).toBe(before);
  });

  it('refuses inactive or unknown references and grants beyond the ceiling without writing', async () => {
    const inactive = await roles.createRole(
      { code: `r-${randomBytes(3).toString('hex')}`, name: 'Old' },
      system(),
    );
    if (inactive.outcome !== 'created') throw new Error('seed');
    await roles.deactivateRole({ roleId: inactive.role.id, expectedVersion: 1 }, system());
    const department = await roles.createDepartment(
      { code: `d-${randomBytes(3).toString('hex')}`, name: 'Closed' },
      system(),
    );
    if (department.outcome !== 'created') throw new Error('seed');
    await roles.deactivateDepartment(
      { departmentId: department.department.id, expectedVersion: 1 },
      system(),
    );
    // A user who holds nothing, to try a grant beyond the ceiling (spec Section 23.1).
    const manager = await activeUser('manager');
    const count = () => value(`SELECT count(*) FROM iam_application_user`);
    const before = await count();

    expect(
      await users.createUser(
        { email: uniqueEmail('x'), displayName: 'X', roleIds: [inactive.role.id] },
        system(),
      ),
    ).toEqual({ outcome: 'role-inactive' });
    expect(
      await users.createUser(
        {
          email: uniqueEmail('x'),
          displayName: 'X',
          memberships: [{ departmentId: department.department.id, isPrimary: false }],
        },
        system(),
      ),
    ).toEqual({ outcome: 'department-inactive' });
    expect(
      await users.createUser(
        { email: uniqueEmail('x'), displayName: 'X', roleIds: [randomUUID()] },
        system(),
      ),
    ).toEqual({ outcome: 'role-not-found' });
    expect(
      await users.createUser(
        { email: uniqueEmail('x'), displayName: 'X', roleIds: [await systemRoleId()] },
        as(manager),
      ),
    ).toEqual({ outcome: 'grant-exceeds-actor' });
    expect(await count()).toBe(before);
    expect(
      await value(
        `SELECT result || '|' || target_type FROM audit_record
           WHERE actor_user_id = '${manager}' AND action = 'iam.user.role-assigned'`,
      ),
    ).toBe('REFUSED|iam.role');
  });
});

// ---------------------------------------------------------------------------------------------
// Access lifecycle (spec Sections 10, 31, 32; IAM-R06 D-06 to D-10)
// ---------------------------------------------------------------------------------------------

describe('access lifecycle', () => {
  it('suspends, reactivates, disables and terminates against real Keycloak', async () => {
    const id = await activeUser('journey');
    const subject = await subjectOf(id);
    await liveSessions(id);

    const suspended = await users.suspendUser({ userId: id }, system('Leave of absence'));
    expect(suspended).toMatchObject({
      outcome: 'restricted',
      sessionsRevoked: 2,
      identity: { outcome: 'synced' },
      user: { accessState: 'SUSPENDED', identitySyncState: 'SYNCED' },
    });
    expect(await identityEnabled(subject)).toBe(false);
    expect(await revocations(id)).toBe('USER_SUSPENDED\nUSER_SUSPENDED');

    const reactivated = await users.reactivateUser(
      { userId: id, expectedVersion: await versionOf(id) },
      system(),
    );
    expect(reactivated).toMatchObject({
      outcome: 'reactivated',
      target: 'ACTIVE',
      user: { accessState: 'ACTIVE', identitySyncState: 'SYNCED' },
    });
    expect(await identityEnabled(subject)).toBe(true);
    // Reactivation creates no session (spec Section 10.7).
    expect(
      await value(
        `SELECT count(*) FROM auth_session WHERE user_id = '${id}' AND revoked_at IS NULL`,
      ),
    ).toBe('0');

    expect(await users.disableUser({ userId: id }, system())).toMatchObject({
      user: { accessState: 'DISABLED' },
    });
    expect(await users.suspendUser({ userId: id }, system())).toEqual({
      outcome: 'invalid-access-transition',
    });
    expect(await users.terminateUser({ userId: id }, system())).toMatchObject({
      user: { accessState: 'TERMINATED', identitySyncState: 'SYNCED' },
    });
    expect(await identityEnabled(subject)).toBe(false);
    expect(
      await users.reactivateUser({ userId: id, expectedVersion: await versionOf(id) }, system()),
    ).toEqual({ outcome: 'invalid-access-transition' });
    // The record and its identity mapping stay (spec Section 10.5).
    expect(await subjectOf(id)).toBe(subject);
    expect(await trail(id)).toEqual(
      expect.arrayContaining([
        'iam.user.suspended:SUCCEEDED',
        'iam.user.reactivation-started:SUCCEEDED',
        'iam.user.reactivated:SUCCEEDED',
        'iam.user.disabled:SUCCEEDED',
        'iam.user.terminated:SUCCEEDED',
      ]),
    );
  });

  it('keeps access removed when Keycloak is unreachable, and sync-identity repairs it later', async () => {
    const id = await activeUser('offline');
    const subject = await subjectOf(id);
    await liveSessions(id, 1);

    const suspended = await offline.suspendUser({ userId: id }, system());
    expect(suspended).toMatchObject({
      outcome: 'restricted',
      sessionsRevoked: 1,
      identity: { outcome: 'failed', failure: 'provider-unavailable' },
      user: { accessState: 'SUSPENDED', identitySyncState: 'FAILED' },
    });
    expect(await revocations(id)).toBe('USER_SUSPENDED');
    // Keycloak still has the identity enabled, but IAM denies access (spec Section 31.1).
    expect(await identityEnabled(subject)).toBe(true);

    expect(await users.syncIdentity({ userId: id }, system())).toMatchObject({
      outcome: 'synced',
      user: { accessState: 'SUSPENDED', identitySyncState: 'SYNCED' },
    });
    expect(await identityEnabled(subject)).toBe(false);
  });

  it('grants nothing when Keycloak is unreachable during reactivation', async () => {
    const id = await activeUser('reactivate-offline');
    await users.suspendUser({ userId: id }, system());
    const version = await versionOf(id);

    expect(
      await offline.reactivateUser({ userId: id, expectedVersion: version }, system()),
    ).toEqual({
      outcome: 'identity-failed',
      failure: 'provider-unavailable',
    });
    expect(await row(id)).toBe('SUSPENDED|FAILED|SENT');
    expect(await identityEnabled(await subjectOf(id))).toBe(false);
  });

  it('returns a never-provisioned user to INVITED by creating its identity and inviting it', async () => {
    const email = uniqueEmail('never');
    const id = await seedInvitedUser(postgres, email);
    // Nothing exists in Keycloak to disable, so the denial is already in sync.
    await users.suspendUser({ userId: id }, system());
    expect(await row(id)).toBe('SUSPENDED|SYNCED|NOT_SENT');

    const reactivated = await users.reactivateUser(
      { userId: id, expectedVersion: await versionOf(id) },
      system(),
    );

    expect(reactivated).toMatchObject({
      outcome: 'reactivated',
      target: 'INVITED',
      invitation: { outcome: 'sent' },
    });
    expect(await row(id)).toBe('INVITED|SYNCED|SENT');
    expect(
      await value(`SELECT first_activated_at IS NULL FROM iam_application_user WHERE id = '${id}'`),
    ).toBe('t');
    expect(await keycloak.mail.waitFor(email)).toBeDefined();
  });

  it('revokes every session and ends the Keycloak sessions on the administrator action', async () => {
    const id = await activeUser('revoke');
    await liveSessions(id, 3);

    const result = await users.revokeSessions({ userId: id }, system());

    expect(result).toEqual({
      outcome: 'revoked',
      sessionsRevoked: 3,
      providerSessions: { outcome: 'terminated' },
    });
    expect(await revocations(id)).toBe(
      'ADMINISTRATOR_REVOKED\nADMINISTRATOR_REVOKED\nADMINISTRATOR_REVOKED',
    );
    expect(await row(id)).toBe('ACTIVE|SYNCED|SENT');
    expect(await trail(id)).toContain('iam.user.sessions-revoked:SUCCEEDED');
  });

  it('updates the display name only, version-checked', async () => {
    const id = await activeUser('rename');
    const version = await versionOf(id);
    expect(
      await users.updateDisplayName(
        { userId: id, expectedVersion: version - 1, displayName: 'Z' },
        system(),
      ),
    ).toEqual({ outcome: 'version-conflict' });
    expect(
      await users.updateDisplayName(
        { userId: id, expectedVersion: version, displayName: 'Grace' },
        system(),
      ),
    ).toMatchObject({ outcome: 'updated', user: { displayName: 'Grace', version: version + 1 } });
  });
});

// ---------------------------------------------------------------------------------------------
// Last ACTIVE System Administrator under access reduction (spec Section 20; IAM-R06 D-06)
// ---------------------------------------------------------------------------------------------

describe('last ACTIVE System Administrator', () => {
  beforeEach(async () => {
    // Only this suite's administrators count.
    await sql(
      `DELETE FROM iam_user_role_assignment WHERE role_id =
         (SELECT id FROM iam_role WHERE code = 'system-administrator')`,
    );
  });

  async function administrators(): Promise<string> {
    return value(
      `SELECT count(*) FROM iam_user_role_assignment a JOIN iam_application_user u
         ON u.id = a.user_id JOIN iam_role r ON r.id = a.role_id
         WHERE r.code = 'system-administrator' AND u.access_state = 'ACTIVE'`,
    );
  }

  it('refuses to suspend, disable or terminate the only ACTIVE holder and records it', async () => {
    const only = await activeUser('only-admin', [await systemRoleId()]);
    for (const operation of ['suspendUser', 'disableUser', 'terminateUser'] as const) {
      expect(await offline[operation]({ userId: only }, system('Rotation'))).toEqual({
        outcome: 'last-system-admin',
      });
    }
    expect(await row(only)).toMatch(/^ACTIVE\|/);
    expect(
      await value(
        `SELECT count(*) FROM audit_record WHERE target_id = '${only}' AND result = 'REFUSED'`,
      ),
    ).toBe('3');
  });

  it('lets only one of two concurrent suspensions of the last two holders succeed', async () => {
    const system_ = await systemRoleId();
    const first = await activeUser('admin-a', [system_]);
    const second = await activeUser('admin-b', [system_]);

    // Both targets' rows are held, so without the System Administrator lock both operations would
    // read the ACTIVE count before either commits; with it, the second waits and sees one left.
    const held = await holdLocks(HOLD_USERS(first, second));
    const results = await Promise.all([
      offline.suspendUser({ userId: first }, system()),
      offline.disableUser({ userId: second }, system()),
    ]);
    await held.done;

    expect(results.map((result) => result.outcome).sort()).toEqual([
      'last-system-admin',
      'restricted',
    ]);
    expect(await administrators()).toBe('1');
  });

  it('serializes a suspension with a concurrent role removal on another holder', async () => {
    const system_ = await systemRoleId();
    const first = await activeUser('admin-c', [system_]);
    const second = await activeUser('admin-d', [system_]);

    const held = await holdLocks(HOLD_USERS(first, second));
    const [suspended, removed] = await Promise.all([
      offline.suspendUser({ userId: first }, system()),
      roles.removeRole({ userId: second, roleId: system_ }, system()),
    ]);
    await held.done;

    // Whichever commits first wins; the other sees one ACTIVE holder left and is refused.
    expect([
      ['last-system-admin', 'removed'],
      ['last-system-admin', 'restricted'],
    ]).toContainEqual([suspended.outcome, removed.outcome].sort());
    expect(await administrators()).toBe('1');
  });
});

// ---------------------------------------------------------------------------------------------
// Bootstrap (spec Section 21; IAM-R06 D-15, D-16)
// ---------------------------------------------------------------------------------------------

describe('pnpm iam:bootstrap', () => {
  beforeEach(async () => {
    // A fresh installation: no user holds the System Administrator role.
    await sql(
      `DELETE FROM iam_user_role_assignment WHERE role_id =
         (SELECT id FROM iam_role WHERE code = 'system-administrator')`,
    );
  });

  function capture(): { lines: string[]; destination: { write(line: string): void } } {
    const lines: string[] = [];
    return { lines, destination: { write: (line: string) => void lines.push(line) } };
  }

  async function bootstrap(argv: string[], options: { fetch?: typeof fetch } = {}) {
    const log = capture();
    const exitCode = await runIamBootstrap(appConfig, provisioning, argv, {
      logDestination: log.destination,
      ...options,
    });
    const records = log.lines.map((line) => JSON.parse(line) as Record<string, unknown>);
    return {
      exitCode,
      record: records[0] ?? {},
      output: log.lines.join(''),
      lines: records.length,
    };
  }

  async function candidates(): Promise<string> {
    return sql(
      `SELECT u.email || '|' || u.access_state FROM iam_user_role_assignment a
         JOIN iam_application_user u ON u.id = a.user_id JOIN iam_role r ON r.id = a.role_id
         WHERE r.code = 'system-administrator' AND u.access_state <> 'TERMINATED'
         ORDER BY u.email`,
    );
  }

  it('creates one candidate, invites it, and logs no email', async () => {
    const email = uniqueEmail('root');

    const run = await bootstrap(['--email', email, '--display-name', 'Root Admin']);

    expect(run.exitCode).toBe(EXIT_COMPLETE);
    expect(run.lines).toBe(1);
    expect(run.record).toMatchObject({
      command: 'iam:bootstrap',
      mode: 'normal',
      outcome: 'created',
      identity: { outcome: 'synced' },
      invitation: { outcome: 'sent' },
    });
    expect(run.output).not.toContain(email);
    expect(run.output).not.toContain('Root Admin');
    expect(run.output).not.toContain(keycloak.secrets.provisionerClient);
    expect(await candidates()).toBe(`${email}|INVITED`);
    expect(await keycloak.mail.waitFor(email)).toBeDefined();
    const id = String(run.record['userId']);
    expect(await trail(id)).toEqual(
      expect.arrayContaining(['iam.user.created:SUCCEEDED', 'iam.user.identity-bound:SUCCEEDED']),
    );
    expect(
      await value(
        `SELECT actor_type || '|' || actor_process || '|' || result FROM audit_record
           WHERE action = 'iam.bootstrap.invoked' ORDER BY occurred_at DESC LIMIT 1`,
      ),
    ).toBe('SYSTEM|iam.bootstrap|SUCCEEDED');
  });

  it('resumes the same candidate without change, and re-sends only on request', async () => {
    const email = uniqueEmail('resume');
    await bootstrap(['--email', email, '--display-name', 'Root Admin']);
    await keycloak.mail.waitFor(email);

    const again = await bootstrap(['--email', email, '--display-name', 'Another Name']);
    expect(again.exitCode).toBe(EXIT_COMPLETE);
    expect(again.record).toMatchObject({
      outcome: 'resumed',
      invitation: { outcome: 'not-applicable' },
    });
    expect(
      await value(`SELECT display_name FROM iam_application_user WHERE email = '${email}'`),
    ).toBe('Root Admin');

    const resent = await bootstrap([
      '--email',
      email,
      '--display-name',
      'Root Admin',
      '--resend-invitation',
    ]);
    expect(resent.record).toMatchObject({ outcome: 'resumed', invitation: { outcome: 'sent' } });
    await keycloak.mail.waitFor(email, () => true);
    expect((await keycloak.mail.messages(email)).length).toBeGreaterThanOrEqual(2);
  });

  it('refuses another email, an ACTIVE administrator, and unsynchronized reference data', async () => {
    const email = uniqueEmail('first');
    await bootstrap(['--email', email, '--display-name', 'Root Admin']);

    const other = await bootstrap(['--email', uniqueEmail('other'), '--display-name', 'Other']);
    expect(other.exitCode).toBe(EXIT_REFUSED);
    expect(other.record).toMatchObject({ outcome: 'refused', reason: 'recovery-required' });

    await sql(
      `UPDATE iam_application_user SET access_state = 'ACTIVE', first_activated_at = now()
         WHERE email = '${email}'`,
    );
    for (const argv of [
      ['--email', uniqueEmail('late'), '--display-name', 'Late'],
      ['--email', uniqueEmail('late'), '--display-name', 'Late', '--recovery', '--reason', 'Lost'],
    ]) {
      const refused = await bootstrap(argv);
      expect(refused.record).toMatchObject({ reason: 'active-administrator-exists' });
    }

    await sql(`UPDATE iam_permission SET name = 'Drifted' WHERE code = 'iam.users.read'`);
    try {
      const drifted = await bootstrap(['--email', uniqueEmail('drift'), '--display-name', 'Drift']);
      expect(drifted.record).toMatchObject({ reason: 'reference-data-not-synchronized' });
    } finally {
      await synchronize();
    }
    expect(
      await value(
        `SELECT count(*) FROM audit_record WHERE action LIKE 'iam.bootstrap.%' AND result = 'REFUSED'`,
      ),
    ).not.toBe('0');
  });

  it('recovers: terminates INVITED candidates, strips others, keeps their states, creates one', async () => {
    const invitedEmail = uniqueEmail('stale');
    const created = await bootstrap(['--email', invitedEmail, '--display-name', 'Stale']);
    const stale = String(created.record['userId']);
    const staleSubject = await subjectOf(stale);
    // A second, suspended holder.
    const suspended = await activeUser('suspended-admin', [await systemRoleId()]);
    await sql(
      `UPDATE iam_application_user SET access_state = 'SUSPENDED' WHERE id = '${suspended}'`,
    );
    const suspendedRow = await row(suspended);
    const newEmail = uniqueEmail('recovered');

    const recovered = await bootstrap([
      '--email',
      newEmail,
      '--display-name',
      'Recovered Admin',
      '--recovery',
      '--reason',
      'Lost the first invitation',
    ]);

    expect(recovered.exitCode).toBe(EXIT_COMPLETE);
    expect(recovered.record).toMatchObject({ mode: 'recovery', outcome: 'recovered' });
    expect(recovered.output).not.toContain('Lost the first invitation');
    expect(await candidates()).toBe(`${newEmail}|INVITED`);
    expect(await row(stale)).toMatch(/^TERMINATED\|SYNCED\|/);
    expect(await identityEnabled(staleSubject)).toBe(false);
    expect(await row(suspended)).toBe(suspendedRow);
    expect(
      await value(
        `SELECT count(*) FROM audit_record WHERE action = 'iam.bootstrap.recovery-invoked'
           AND reason = 'Lost the first invitation'`,
      ),
    ).toBe('1');
  });

  it('leaves at most one candidate when invocations run concurrently', async () => {
    const run = createIamBootstrap(provisioning, database, {
      revokeUserSessions,
      fetch: unreachable,
    });
    const traceId = parseTraceId('trace-concurrent-bootstrap');
    if (!traceId.ok) throw new Error('trace fixture');
    const emails = [uniqueEmail('c1'), uniqueEmail('c2'), uniqueEmail('c3')];

    const held = await holdLocks(HOLD_SYSTEM_ROLE);
    const results = await Promise.all(
      emails.map((email) =>
        run({
          mode: 'normal',
          email,
          displayName: 'Concurrent',
          manifests: [iamPermissionManifest],
          traceId: traceId.value,
        }),
      ),
    );

    await held.done;
    expect(results.filter((result) => result.outcome === 'created')).toHaveLength(1);
    expect(results.filter((result) => result.outcome === 'refused')).toHaveLength(2);
    expect((await candidates()).split('\n')).toHaveLength(1);
  });

  it('reports an incomplete run when Keycloak is unreachable, and a re-run resumes it', async () => {
    const email = uniqueEmail('incomplete');
    const first = await bootstrap(['--email', email, '--display-name', 'Root'], {
      fetch: unreachable,
    });
    expect(first.exitCode).toBe(EXIT_INCOMPLETE);
    expect(first.record).toMatchObject({ outcome: 'created', identity: { outcome: 'failed' } });

    const second = await bootstrap(['--email', email, '--display-name', 'Root']);
    expect(second.exitCode).toBe(EXIT_COMPLETE);
    expect(second.record).toMatchObject({ outcome: 'resumed', invitation: { outcome: 'sent' } });
  });

  it('rejects malformed arguments before touching anything', async () => {
    for (const argv of [
      [],
      ['--email', 'a@example.test'],
      ['--email', 'a@example.test', '--display-name', 'A', '--recovery'],
      ['--email', 'a@example.test', '--display-name', 'A', '--reason', 'no recovery'],
      ['--email', 'a@example.test', '--display-name', 'A', '--password', 'x'],
      ['--email', 'not an email', '--display-name', 'A'],
    ]) {
      expect((await bootstrap(argv)).exitCode).toBe(EXIT_USAGE);
    }
    expect(await candidates()).toBe('');
  });
});
