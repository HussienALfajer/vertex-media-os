import { randomUUID } from 'node:crypto';
import { createServer } from 'node:net';
import { parseSystemProcess, parseTraceId } from '@vertex-os/audit';
import type { DatabaseClient } from '@vertex-os/database';
import { expect } from 'vitest';
import type { IdentityProvisioning } from '../src/iam/identity-provisioning.js';
import {
  actionLink,
  Browser,
  followInvitation,
  FORMS,
  freshTotp,
  hasForm,
  open,
  submit,
  totpSecret,
  type Page,
} from './keycloak-browser.js';
import type { StartedKeycloak } from './keycloak.js';
import type { MigratedPostgres } from './postgres.js';
import { seedInvitedUser } from './iam-users.js';

/**
 * The browser sign-in journey against the pinned Keycloak, shared by the real-Keycloak API suites
 * (IAM-R03 D-22, IAM-R03F D-10): a Vertex user invited through real provisioning, a fetch-based
 * browser that keeps what the API sent it, and the password and TOTP forms. Every secret the
 * journey handles is collected, so a suite can prove none of them reaches a log line (CP1-02).
 */

export const TEST_PASSWORD = 'correct horse battery staple, local test only';
export const JWT = /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\./;
const SECRET_COOKIE = /^__Host-vertex-(session|login)=([^;]+)/;

export async function freePort(): Promise<number> {
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

/** Polls `check` until it holds; fails after `timeoutMs`. */
export async function eventually(
  check: () => Promise<boolean>,
  what: string,
  timeoutMs = 15_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!(await check())) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

export interface JourneyContext {
  readonly keycloak: StartedKeycloak;
  readonly postgres: MigratedPostgres;
  readonly database: DatabaseClient;
  readonly provisioning: IdentityProvisioning;
  readonly apiOrigin: string;
}

export interface JourneyUser {
  readonly id: string;
  readonly email: string;
  readonly subject: string;
  readonly secret: string;
  readonly used: Set<string>;
}

/** A browser that keeps what the Vertex API sent it, so tests can prove no token reached it. */
export class VertexBrowser extends Browser {
  readonly fromApi: string[] = [];

  constructor(
    private readonly apiOrigin: string,
    private readonly secrets: string[],
  ) {
    super();
  }

  async api(path: string, init: RequestInit = {}): Promise<Response> {
    const response = await this.request(`${this.apiOrigin}${path}`, init);
    const body = await response.clone().text();
    this.fromApi.push(JSON.stringify([...response.headers]), body);
    for (const line of response.headers.getSetCookie()) {
      const value = SECRET_COOKIE.exec(line)?.[2];
      if (value) this.secrets.push(value);
    }
    if (path === '/api/auth/csrf' && response.ok) {
      this.secrets.push((JSON.parse(body) as { token: string }).token);
    }
    return response;
  }
}

export function keycloakJourney(context: JourneyContext) {
  const { keycloak, postgres, provisioning } = context;
  /** Every secret the journey handled, for the suite's log scan. */
  const secrets: string[] = [];

  function attribution() {
    const process = parseSystemProcess('iam.test-provisioning');
    const traceId = parseTraceId('trace-keycloak-login');
    if (!process.ok || !traceId.ok) throw new Error('attribution fixture');
    return { actor: { type: 'SYSTEM' as const, process: process.value }, traceId: traceId.value };
  }

  /** A Vertex user invited through real provisioning whose recipient completed the invitation. */
  async function invitedIdentity(label: string): Promise<JourneyUser> {
    const email = `${label}-${randomUUID()}@example.invalid`;
    const created = { user: { id: await seedInvitedUser(postgres, email) } };
    const provisioned = await provisioning.provision({
      userId: created.user.id,
      attribution: attribution(),
    });
    expect(provisioned.invitation.outcome).toBe('sent');
    const message = await keycloak.mail.waitFor(email);
    const invitation = await followInvitation(
      actionLink(message.text),
      keycloak.baseUrl,
      TEST_PASSWORD,
    );
    if (!invitation.secret) throw new Error('the invitation enrolled no TOTP');
    secrets.push(invitation.secret);
    const subject = await postgres.sql(
      `SELECT identity_subject FROM iam_application_user WHERE id = '${created.user.id}'`,
    );
    return {
      id: created.user.id,
      email,
      subject,
      secret: invitation.secret,
      used: invitation.used,
    };
  }

  function browser(): VertexBrowser {
    return new VertexBrowser(context.apiOrigin, secrets);
  }

  /**
   * Signs in at /api/auth/login: Keycloak's password and OTP forms (or TOTP enrolment for an
   * identity without one), then the callback on the API. Returns the API's final answer.
   */
  async function signIn(
    vertex: VertexBrowser,
    user: { email: string; secret?: string; used?: Set<string> },
  ): Promise<{ callback: Response; enrolledSecret?: string }> {
    const login = await vertex.api('/api/auth/login');
    expect(login.status).toBe(302);
    const authorization = login.headers.get('location') ?? '';
    expect(authorization.startsWith(`${keycloak.issuer}/protocol/openid-connect/auth?`)).toBe(true);
    // The login attempt's secrets, straight from its row: none of them may be logged.
    const attempts = await postgres.sql(
      "SELECT state || ' ' || nonce || ' ' || code_verifier FROM auth_login_attempt",
    );
    secrets.push(...attempts.split(/\s+/).filter((value) => value !== ''));

    let page: Page = await open(vertex, authorization, keycloak.baseUrl);
    let enrolledSecret: string | undefined;
    if (hasForm(page, FORMS.login)) {
      page = await submit(
        vertex,
        page,
        FORMS.login,
        { username: user.email, password: TEST_PASSWORD },
        keycloak.baseUrl,
      );
    }
    if (hasForm(page, FORMS.otp)) {
      if (!user.secret || !user.used) throw new Error('OTP requested for a user without a secret');
      page = await submit(
        vertex,
        page,
        FORMS.otp,
        { otp: freshTotp(user.secret, user.used) },
        keycloak.baseUrl,
      );
    } else if (hasForm(page, FORMS.totpEnrolment)) {
      const enrolment = await totpSecret(vertex, page, keycloak.baseUrl);
      enrolledSecret = enrolment.secret;
      secrets.push(enrolment.secret);
      page = await submit(
        vertex,
        enrolment,
        FORMS.totpEnrolment,
        { totp: freshTotp(enrolment.secret, new Set()), userLabel: 'test device' },
        keycloak.baseUrl,
      );
    }
    const redirect = page.location ?? '';
    expect(redirect.startsWith(`${keycloak.uris.redirect}?`)).toBe(true);
    // The registered redirect URI names the web origin; the API behind it is on another port here.
    const target = new URL(redirect);
    const callback = await vertex.api(`${target.pathname}${target.search}`);
    return { callback, ...(enrolledSecret ? { enrolledSecret } : {}) };
  }

  async function sessionStatus(vertex: VertexBrowser): Promise<{ status: number; code?: string }> {
    const response = await vertex.api('/api/auth/session');
    const body = (await response.json()) as { code?: string };
    return { status: response.status, ...(body.code ? { code: body.code } : {}) };
  }

  async function keycloakSessions(subject: string): Promise<unknown[]> {
    const response = await keycloak.admin(`/users/${subject}/sessions`);
    expect(response.status).toBe(200);
    return (await response.json()) as unknown[];
  }

  /**
   * Every secret handled so far plus the test-only configuration secrets. Captured log output must
   * contain none of them.
   */
  function handledSecrets(configured: readonly string[]): string[] {
    return [
      ...secrets,
      ...configured,
      keycloak.secrets.webClient,
      keycloak.secrets.provisionerClient,
      keycloak.secrets.adminPassword,
      TEST_PASSWORD,
    ].filter((value) => value.length >= 8);
  }

  return {
    invitedIdentity,
    browser,
    signIn,
    sessionStatus,
    keycloakSessions,
    handledSecrets,
  };
}
