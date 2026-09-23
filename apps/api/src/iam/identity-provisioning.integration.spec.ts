import { randomBytes, randomUUID } from 'node:crypto';
import { parseSystemProcess, parseTraceId, type AuditAttribution } from '@vertex-os/audit';
import { createDatabaseClient, type DatabaseClient } from '@vertex-os/database';
import type { UserId } from '@vertex-os/iam';
import { createKeycloakIdentityProvider } from '@vertex-os/iam-keycloak';
import { createApplicationUserRepository } from '@vertex-os/iam-persistence';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  Browser,
  FORMS,
  freshTotp,
  hasForm,
  links,
  open,
  submit,
  totpSecret,
  type Page,
} from '../../test-support/keycloak-browser.js';
import { startKeycloak, type StartedKeycloak } from '../../test-support/keycloak.js';
import { startMigratedPostgres, type MigratedPostgres } from '../../test-support/postgres.js';
import {
  loadIdentityProvisioningConfig,
  type IdentityProvisioningConfig,
} from '../config/identity-provisioning-config.js';
import { createIdentityProvisioning, type IdentityProvisioning } from './identity-provisioning.js';

/**
 * IAM identity provisioning composed with its real adapters: PostgreSQL, the Audit adapter, and
 * the pinned Keycloak with the committed realm and a mail sink (docs/modules/iam.md Sections 11,
 * 12, 31, 46.4 and 50). Vertex's integration contract, not Keycloak internals.
 */

let postgres: MigratedPostgres;
let keycloak: StartedKeycloak;
let database: DatabaseClient;
let config: IdentityProvisioningConfig;
let provisioning: IdentityProvisioning;

beforeAll(async () => {
  [postgres, keycloak] = await Promise.all([startMigratedPostgres(), startKeycloak()]);
  database = createDatabaseClient({ connectionString: postgres.url });
  config = loadIdentityProvisioningConfig({
    NODE_ENV: 'test',
    KEYCLOAK_ISSUER_URL: keycloak.issuer,
    KEYCLOAK_PROVISIONER_CLIENT_ID: 'vertex-provisioner',
    KEYCLOAK_PROVISIONER_CLIENT_SECRET: keycloak.secrets.provisionerClient,
  });
  provisioning = createIdentityProvisioning(config, database);
}, 300_000);

afterAll(async () => {
  await database?.disconnect();
  await Promise.all([postgres?.stop(), keycloak?.stop()]);
});

// ---------------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------------

const TEST_PASSWORD = 'correct horse battery staple, local test only';

function attribution(): AuditAttribution {
  const process = parseSystemProcess('iam.test-provisioning');
  const traceId = parseTraceId(randomUUID());
  if (!process.ok || !traceId.ok) throw new Error('attribution fixture');
  return { actor: { type: 'SYSTEM', process: process.value }, traceId: traceId.value };
}

function uniqueEmail(label: string): string {
  return `${label}-${randomBytes(4).toString('hex')}@example.test`;
}

/** Commits a new INVITED user, as user creation does before any Keycloak work (spec Section 12). */
async function invitedUser(label: string): Promise<{ id: UserId; email: string }> {
  const email = uniqueEmail(label);
  const created = await createApplicationUserRepository(database).create({
    email: email as never,
    displayName: 'Synthetic User' as never,
    accessState: 'INVITED',
    identitySyncState: 'PENDING',
    invitationDeliveryState: 'NOT_SENT',
    memberships: [],
    roleIds: [],
  });
  if (created.outcome !== 'created') throw new Error('seed user');
  return { id: created.user.id, email };
}

const request = (id: UserId) => ({ userId: id, attribution: attribution() });

async function row(id: UserId) {
  const user = await createApplicationUserRepository(database).findById(id);
  if (!user) throw new Error('user missing');
  return user;
}

/** Commits an access change the way IAM-MP-10 will: new state, PENDING, next version. */
async function commitAccess(id: UserId, state: 'SUSPENDED' | 'DISABLED' | 'TERMINATED') {
  await postgres.sql(
    `UPDATE iam_application_user SET access_state = '${state}', identity_sync_state = 'PENDING',
       version = version + 1, last_access_state_changed_at = now(), updated_at = now()
     WHERE id = '${id}'`,
  );
}

async function auditTrail(id: UserId): Promise<string[]> {
  const output = await postgres.sql(
    `SELECT action || ':' || result FROM audit_record WHERE target_id = '${id}' ORDER BY occurred_at, id`,
  );
  return output === '' ? [] : output.split('\n');
}

async function adminJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await keycloak.admin(path, init);
  if (!response.ok) throw new Error(`${path} answered ${response.status}`);
  return (await response.json()) as T;
}

interface KeycloakUser {
  readonly id: string;
  readonly username: string;
  readonly email: string;
  readonly enabled: boolean;
  readonly emailVerified: boolean;
  readonly attributes?: Record<string, string[]>;
}

async function identitiesNamed(email: string): Promise<KeycloakUser[]> {
  return adminJson<KeycloakUser[]>(
    `/users?username=${encodeURIComponent(email)}&exact=true&briefRepresentation=false`,
  );
}

async function sessionsOf(subject: string): Promise<unknown[]> {
  return adminJson<unknown[]>(`/users/${subject}/sessions`);
}

function actionLink(text: string): string {
  const link = /(https?:\/\/\S+\/login-actions\/action-token\S+)/.exec(text)?.[1];
  if (!link) throw new Error('message without an action link');
  return link;
}

/**
 * Follows an invitation link as its recipient: proceeds through Keycloak's pages, enrolling a
 * TOTP and setting a password when asked. Returns which forms appeared and the TOTP secret.
 */
async function completeActions(link: string): Promise<{
  seen: string[];
  secret: string | undefined;
  used: Set<string>;
  last: Page;
}> {
  const browser = new Browser();
  const used = new Set<string>();
  const seen: string[] = [];
  let secret: string | undefined;
  let page = await open(browser, link, keycloak.baseUrl);
  for (let step = 0; step < 8 && page.status === 200; step += 1) {
    if (hasForm(page, FORMS.totpEnrolment)) {
      seen.push('enrol-totp');
      const enrolment = await totpSecret(browser, page, keycloak.baseUrl);
      secret = enrolment.secret;
      page = await submit(
        browser,
        enrolment,
        FORMS.totpEnrolment,
        { totp: freshTotp(enrolment.secret, used), userLabel: 'test device' },
        keycloak.baseUrl,
      );
    } else if (hasForm(page, FORMS.passwordUpdate)) {
      seen.push('set-password');
      page = await submit(
        browser,
        page,
        FORMS.passwordUpdate,
        { 'password-new': TEST_PASSWORD, 'password-confirm': TEST_PASSWORD },
        keycloak.baseUrl,
      );
    } else {
      const proceed = links(page.html).find((target) =>
        target.includes('/login-actions/action-token'),
      );
      if (!proceed) break;
      seen.push('proceed');
      page = await open(browser, new URL(proceed, keycloak.baseUrl).href, keycloak.baseUrl);
    }
  }
  return { seen, secret, used, last: page };
}

/** Signs in through vertex-web with password and TOTP; returns the final redirect location. */
async function signIn(email: string, secret: string, used: Set<string>): Promise<string | null> {
  const browser = new Browser();
  const state = randomBytes(16).toString('base64url');
  const query = new URLSearchParams({
    client_id: 'vertex-web',
    response_type: 'code',
    scope: 'openid',
    redirect_uri: keycloak.uris.redirect,
    state,
    nonce: randomBytes(16).toString('base64url'),
    code_challenge: randomBytes(32).toString('base64url'),
    code_challenge_method: 'S256',
  });
  const login = await open(
    browser,
    `${keycloak.issuer}/protocol/openid-connect/auth?${query}`,
    keycloak.baseUrl,
  );
  const otp = await submit(
    browser,
    login,
    FORMS.login,
    { username: email, password: TEST_PASSWORD },
    keycloak.baseUrl,
  );
  if (!hasForm(otp, FORMS.otp)) return otp.location;
  const done = await submit(
    browser,
    otp,
    FORMS.otp,
    { otp: freshTotp(secret, used) },
    keycloak.baseUrl,
  );
  return done.location;
}

/** A user provisioned and invited, whose recipient completed the invitation. */
async function activatedIdentity(label: string) {
  const user = await invitedUser(label);
  const result = await provisioning.provision(request(user.id));
  expect(result.invitation.outcome).toBe('sent');
  const message = await keycloak.mail.waitFor(user.email);
  const completed = await completeActions(actionLink(message.text));
  if (!completed.secret) throw new Error('invitation did not enrol a TOTP');
  const subject = (await row(user.id)).identity?.subject ?? '';
  return { ...user, subject, secret: completed.secret, used: completed.used };
}

// ---------------------------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------------------------

describe('provisioning an invited user', () => {
  it('creates, binds and invites the identity, and the invitation establishes every factor', async () => {
    const user = await invitedUser('provision');

    const result = await provisioning.provision(request(user.id));

    expect(result.identity.outcome).toBe('synced');
    expect(result.invitation).toMatchObject({
      outcome: 'sent',
      actions: ['VERIFY_EMAIL', 'UPDATE_PASSWORD', 'CONFIGURE_TOTP'],
    });
    const [identity, ...others] = await identitiesNamed(user.email);
    expect(others).toEqual([]);
    expect(identity).toMatchObject({
      username: user.email,
      email: user.email,
      enabled: true,
      emailVerified: false,
      attributes: { vertexUserId: [user.id] },
    });
    const stored = await row(user.id);
    expect(stored).toMatchObject({
      accessState: 'INVITED',
      identity: { issuer: keycloak.issuer, subject: identity?.id },
      identitySyncState: 'SYNCED',
      invitationDeliveryState: 'SENT',
    });
    expect(stored.invitationSentAt).toBeInstanceOf(Date);
    expect(await auditTrail(user.id)).toEqual([
      'iam.user.identity-bound:SUCCEEDED',
      'iam.user.identity-reconciled:SUCCEEDED',
      'iam.user.invitation-dispatch-started:SUCCEEDED',
      'iam.user.invitation-dispatched:SUCCEEDED',
    ]);

    // The recipient, not Vertex, receives the link and establishes the credentials.
    const message = await keycloak.mail.waitFor(user.email);
    const completed = await completeActions(actionLink(message.text));
    expect(completed.seen).toEqual(expect.arrayContaining(['set-password', 'enrol-totp']));
    const after = await adminJson<KeycloakUser>(`/users/${identity?.id}`);
    expect(after.emailVerified).toBe(true);
    const credentials = await adminJson<{ type: string }[]>(`/users/${identity?.id}/credentials`);
    expect(credentials.map((credential) => credential.type).sort()).toEqual(['otp', 'password']);
    // Completing the link signs nobody in: no Keycloak session bypasses the MFA sign-in.
    expect(await sessionsOf(identity?.id ?? '')).toEqual([]);
    expect(completed.last.location).toBeNull();
  });

  it('links the identity a lost create response left behind instead of creating another', async () => {
    const user = await invitedUser('lost-create');
    let lose = true;
    const lossy = createIdentityProvisioning(config, database, {
      fetch: async (input, init) => {
        const response = await fetch(input, init);
        if (
          lose &&
          init?.method === 'POST' &&
          String(input).endsWith('/admin/realms/vertex/users')
        ) {
          lose = false;
          await response.body?.cancel();
          throw new TypeError('socket hang up');
        }
        return response;
      },
    });

    const first = await lossy.provision(request(user.id));
    expect(first.identity).toMatchObject({ outcome: 'failed', failure: 'provider-unavailable' });
    expect(await identitiesNamed(user.email)).toHaveLength(1);
    expect(await row(user.id)).toMatchObject({
      identity: undefined,
      identitySyncState: 'FAILED',
      invitationDeliveryState: 'NOT_SENT',
    });

    const second = await lossy.provision(request(user.id));

    expect(second.identity.outcome).toBe('synced');
    expect(second.invitation.outcome).toBe('sent');
    const identities = await identitiesNamed(user.email);
    expect(identities).toHaveLength(1);
    expect((await row(user.id)).identity?.subject).toBe(identities[0]?.id);
  });

  it('creates one identity and sends one invitation when provisioning runs four times at once', async () => {
    const user = await invitedUser('concurrent');

    const results = await Promise.all(
      Array.from({ length: 4 }, () => provisioning.provision(request(user.id))),
    );

    for (const result of results) {
      expect(['synced', 'superseded']).toContain(result.identity.outcome);
    }
    expect(await identitiesNamed(user.email)).toHaveLength(1);
    expect(await row(user.id)).toMatchObject({
      identitySyncState: 'SYNCED',
      invitationDeliveryState: 'SENT',
    });
    await keycloak.mail.waitFor(user.email);
    expect(await keycloak.mail.messages(user.email)).toHaveLength(1);
    const trail = await auditTrail(user.id);
    expect(trail.filter((entry) => entry.startsWith('iam.user.identity-bound'))).toHaveLength(1);
    expect(
      trail.filter((entry) => entry.startsWith('iam.user.invitation-dispatched')),
    ).toHaveLength(1);
  });

  it('fails closed with a stable category when Keycloak cannot be reached', async () => {
    const user = await invitedUser('unreachable');
    const unreachable = createIdentityProvisioning(
      { ...config, issuer: 'http://127.0.0.1:1/realms/vertex' },
      database,
    );

    const result = await unreachable.provision(request(user.id));

    expect(result).toMatchObject({
      identity: { outcome: 'failed', failure: 'provider-unavailable' },
      invitation: { outcome: 'not-applicable' },
    });
    expect(await row(user.id)).toMatchObject({
      accessState: 'INVITED',
      identitySyncState: 'FAILED',
      invitationDeliveryState: 'NOT_SENT',
    });
    expect(await auditTrail(user.id)).toEqual(['iam.user.identity-reconciled:FAILED']);
    // The outcome carries the category and the committed user, nothing from the transport.
    expect(Object.keys(result.identity).sort()).toEqual(['failure', 'outcome', 'user']);
  });
});

describe('identity conflicts', () => {
  async function createForeign(body: Record<string, unknown>): Promise<string> {
    const response = await keycloak.admin('/users', { method: 'POST', body: JSON.stringify(body) });
    expect(response.status).toBe(201);
    const location = response.headers.get('location') ?? '';
    return location.slice(location.lastIndexOf('/') + 1);
  }

  it('never links or changes an identity that another Vertex user owns', async () => {
    const user = await invitedUser('foreign-owner');
    const foreign = await createForeign({
      username: user.email,
      email: user.email,
      enabled: false,
      attributes: { vertexUserId: [randomUUID()] },
    });
    const before = await adminJson<KeycloakUser>(`/users/${foreign}`);

    const result = await provisioning.provision(request(user.id));

    expect(result.identity).toMatchObject({ outcome: 'failed', failure: 'identity-conflict' });
    expect(await adminJson<KeycloakUser>(`/users/${foreign}`)).toEqual(before);
    expect(await row(user.id)).toMatchObject({ identity: undefined, identitySyncState: 'FAILED' });
    expect(await keycloak.mail.messages(user.email)).toEqual([]);
  });

  it('reports a conflict when the email belongs to an identity under another username', async () => {
    const user = await invitedUser('email-taken');
    await createForeign({ username: `other-${randomBytes(4).toString('hex')}`, email: user.email });

    const result = await provisioning.provision(request(user.id));

    expect(result.identity).toMatchObject({ outcome: 'failed', failure: 'identity-conflict' });
    expect(await identitiesNamed(user.email)).toEqual([]);
  });

  it('reports a conflict when the bound identity was deleted, and never re-creates it', async () => {
    const user = await invitedUser('deleted');
    await provisioning.provision(request(user.id));
    const subject = (await row(user.id)).identity?.subject ?? '';
    expect((await keycloak.admin(`/users/${subject}`, { method: 'DELETE' })).status).toBe(204);

    const result = await provisioning.reconcile(request(user.id));

    expect(result).toMatchObject({ outcome: 'failed', failure: 'identity-conflict' });
    expect(await identitiesNamed(user.email)).toEqual([]);
    expect((await row(user.id)).identity?.subject).toBe(subject);
  });
});

describe('access-reducing reconciliation', () => {
  it('disables the identity of a suspended user and ends its Keycloak sessions', async () => {
    const user = await activatedIdentity('suspend');
    expect(await signIn(user.email, user.secret, user.used)).toMatch(
      new RegExp(`^${keycloak.uris.redirect.replace(/[.?]/g, '\\$&')}\\?`),
    );
    expect(await sessionsOf(user.subject)).toHaveLength(1);
    await commitAccess(user.id, 'SUSPENDED');

    const result = await provisioning.reconcile(request(user.id));

    expect(result.outcome).toBe('synced');
    const identity = await adminJson<KeycloakUser>(`/users/${user.subject}`);
    expect(identity).toMatchObject({ enabled: false, attributes: { vertexUserId: [user.id] } });
    expect(await sessionsOf(user.subject)).toEqual([]);
    expect(await row(user.id)).toMatchObject({
      accessState: 'SUSPENDED',
      identitySyncState: 'SYNCED',
    });
    expect(await signIn(user.email, user.secret, user.used)).toBeNull();
  });

  it('keeps access denied and records FAILED when Keycloak cannot disable the identity', async () => {
    const user = await invitedUser('disable-fails');
    await provisioning.provision(request(user.id));
    await commitAccess(user.id, 'DISABLED');
    // Same issuer, but every request fails in transit.
    const unreachable = createIdentityProvisioning(config, database, {
      fetch: () => Promise.reject(new TypeError('connect ECONNREFUSED')),
    });

    const result = await unreachable.reconcile(request(user.id));

    expect(result).toMatchObject({ outcome: 'failed', failure: 'provider-unavailable' });
    expect(await row(user.id)).toMatchObject({
      accessState: 'DISABLED',
      identitySyncState: 'FAILED',
    });
    // A later reconciliation completes it.
    expect((await provisioning.reconcile(request(user.id))).outcome).toBe('synced');
    const subject = (await row(user.id)).identity?.subject ?? '';
    expect((await adminJson<KeycloakUser>(`/users/${subject}`)).enabled).toBe(false);
  });

  it('creates nothing for a terminated user without an identity', async () => {
    const user = await invitedUser('terminated');
    await commitAccess(user.id, 'TERMINATED');

    expect((await provisioning.reconcile(request(user.id))).outcome).toBe('synced');
    expect(await identitiesNamed(user.email)).toEqual([]);
  });
});

describe('invitation delivery', () => {
  it('asks a resend only for missing factors, and its link cannot replace a password', async () => {
    const user = await invitedUser('resend-partial');
    await provisioning.provision(request(user.id));
    const subject = (await row(user.id)).identity?.subject ?? '';
    const reset = await keycloak.admin(`/users/${subject}/reset-password`, {
      method: 'PUT',
      body: JSON.stringify({ type: 'password', value: TEST_PASSWORD, temporary: false }),
    });
    expect(reset.status).toBe(204);
    await keycloak.mail.waitFor(user.email);

    const result = await provisioning.resendInvitation(request(user.id));

    expect(result).toMatchObject({ outcome: 'sent', actions: ['VERIFY_EMAIL', 'CONFIGURE_TOTP'] });
    const messages = await keycloak.mail.messages(user.email);
    expect(messages).toHaveLength(2);
    const completed = await completeActions(actionLink(messages[1]?.text ?? ''));
    expect(completed.seen).toContain('enrol-totp');
    expect(completed.seen).not.toContain('set-password');
  });

  it('sends nothing when the invitation has been completed', async () => {
    const user = await activatedIdentity('resend-complete');

    const result = await provisioning.resendInvitation(request(user.id));

    expect(result.outcome).toBe('no-action-required');
    expect(await keycloak.mail.messages(user.email)).toHaveLength(1);
  });

  it('records a disabled identity as out of sync and sends nothing; reconciliation repairs it', async () => {
    const user = await invitedUser('resend-disabled');
    await provisioning.provision(request(user.id));
    const subject = (await row(user.id)).identity?.subject ?? '';
    const current = await adminJson<Record<string, unknown>>(`/users/${subject}`);
    await keycloak.admin(`/users/${subject}`, {
      method: 'PUT',
      body: JSON.stringify({ ...current, enabled: false }),
    });

    const result = await provisioning.resendInvitation(request(user.id));

    expect(result).toMatchObject({ outcome: 'failed', failure: 'identity-out-of-sync' });
    expect(await row(user.id)).toMatchObject({
      identitySyncState: 'FAILED',
      invitationDeliveryState: 'SENT',
    });
    expect(await keycloak.mail.messages(user.email)).toHaveLength(1);
    expect((await provisioning.reconcile(request(user.id))).outcome).toBe('synced');
    expect((await adminJson<KeycloakUser>(`/users/${subject}`)).enabled).toBe(true);
  });

  it('receives Keycloak’s refusal to email a disabled identity as `refused`', async () => {
    const user = await invitedUser('refused');
    await provisioning.provision(request(user.id));
    const subject = (await row(user.id)).identity?.subject ?? '';
    const current = await adminJson<Record<string, unknown>>(`/users/${subject}`);
    await keycloak.admin(`/users/${subject}`, {
      method: 'PUT',
      body: JSON.stringify({ ...current, enabled: false }),
    });
    const adapter = createKeycloakIdentityProvider({
      issuer: config.issuer,
      clientId: config.provisioner.clientId,
      clientSecret: config.provisioner.clientSecret,
    });

    expect(
      await adapter.sendInvitation(subject, { actions: ['VERIFY_EMAIL'], lifespanSeconds: 300 }),
    ).toEqual({ ok: true, value: 'refused' });
    expect(
      await adapter.sendInvitation(randomUUID(), {
        actions: ['VERIFY_EMAIL'],
        lifespanSeconds: 300,
      }),
    ).toEqual({ ok: true, value: 'not-found' });
  });

  it('records an SMTP failure as a failed dispatch without touching the identity', async () => {
    const user = await invitedUser('smtp-down');
    await provisioning.provision(request(user.id));
    const sentAt = (await row(user.id)).invitationSentAt;
    const realm = await adminJson<{ smtpServer: Record<string, string> }>('');
    const setSmtp = (smtp: Record<string, string>) =>
      keycloak.admin('', { method: 'PUT', body: JSON.stringify({ smtpServer: smtp }) });
    expect((await setSmtp({ ...realm.smtpServer, host: 'smtp.invalid' })).status).toBe(204);
    try {
      const result = await provisioning.resendInvitation(request(user.id));

      expect(result).toMatchObject({ outcome: 'failed', failure: 'provider-unavailable' });
      expect(await row(user.id)).toMatchObject({
        accessState: 'INVITED',
        identitySyncState: 'SYNCED',
        invitationDeliveryState: 'FAILED',
        invitationSentAt: sentAt,
      });
    } finally {
      expect((await setSmtp(realm.smtpServer)).status).toBe(204);
    }
    expect((await provisioning.resendInvitation(request(user.id))).outcome).toBe('sent');
  });
});

describe('evidence and secret safety', () => {
  it('records no email, token or secret in Audit evidence', async () => {
    const leaks = await postgres.sql(
      `SELECT count(*) FROM audit_record
       WHERE row_to_json(audit_record)::text ~* '(@example\\.test|sentinel-|bearer)'`,
    );
    expect(Number(leaks)).toBe(0);
    const total = Number(await postgres.sql(`SELECT count(*) FROM audit_record`));
    expect(total).toBeGreaterThan(10);
  });

  it('never writes the provisioner or SMTP secret to the Keycloak log', async () => {
    const output = await keycloak.logs();
    expect(output).not.toContain(keycloak.secrets.provisionerClient);
    expect(output).not.toContain(keycloak.secrets.smtpPassword);
  });
});
