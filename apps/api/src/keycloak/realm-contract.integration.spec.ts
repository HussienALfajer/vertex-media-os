import { createHash, randomBytes, randomUUID } from 'node:crypto';
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
import {
  MAIL_FROM,
  REALM,
  type StartedKeycloak,
  startKeycloak,
} from '../../test-support/keycloak.js';

/**
 * The Vertex realm contract (docs/modules/iam.md Sections 7, 8, 37; docs/SECURITY.md Sections
 * 8-11, 28, 30) proven against the real, pinned Keycloak with the committed realm file. These
 * tests exercise Vertex's integration contract, not Keycloak internals.
 */

let keycloak: StartedKeycloak;

beforeAll(async () => {
  keycloak = await startKeycloak();
}, 300_000);

afterAll(async () => {
  await keycloak?.stop();
});

// ---------------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------------

interface TokenResponse {
  readonly access_token?: string;
  readonly error?: string;
}

async function tokenRequest(body: Record<string, string>): Promise<{
  status: number;
  body: TokenResponse;
}> {
  const response = await fetch(`${keycloak.issuer}/protocol/openid-connect/token`, {
    method: 'POST',
    body: new URLSearchParams(body),
  });
  return { status: response.status, body: (await response.json()) as TokenResponse };
}

async function provisionerToken(): Promise<string> {
  const { status, body } = await tokenRequest({
    grant_type: 'client_credentials',
    client_id: 'vertex-provisioner',
    client_secret: keycloak.secrets.provisionerClient,
  });
  if (status !== 200 || !body.access_token) throw new Error(`provisioner token: ${status}`);
  return body.access_token;
}

function claims(token: string): Record<string, unknown> {
  const [, payload] = token.split('.');
  if (!payload) throw new Error('not a JWT');
  return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Record<string, unknown>;
}

async function asProvisioner(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set('authorization', `Bearer ${await provisionerToken()}`);
  if (init.body !== undefined) headers.set('content-type', 'application/json');
  return fetch(`${keycloak.baseUrl}/admin/realms/${path}`, { ...init, headers });
}

async function json<T>(response: Response | Promise<Response>): Promise<T> {
  const resolved = await response;
  if (!resolved.ok) throw new Error(`${resolved.url} answered ${resolved.status}`);
  return (await resolved.json()) as T;
}

interface UserRepresentation {
  readonly id: string;
  readonly username: string;
  readonly email?: string;
  readonly enabled: boolean;
  readonly firstName?: string;
  readonly attributes?: Record<string, string[]>;
}

function uniqueEmail(label: string): string {
  return `${label}-${randomBytes(4).toString('hex')}@example.test`;
}

/** Creates a user through vertex-provisioner, as IAM provisioning will (spec Section 11.2). */
async function provisionUser(
  email: string,
  vertexUserId = randomUUID(),
): Promise<UserRepresentation> {
  const created = await asProvisioner(`${REALM}/users`, {
    method: 'POST',
    body: JSON.stringify({
      username: email,
      email,
      enabled: true,
      attributes: { vertexUserId: [vertexUserId] },
    }),
  });
  expect(created.status).toBe(201);
  const [user] = await json<UserRepresentation[]>(
    asProvisioner(`${REALM}/users?username=${encodeURIComponent(email)}&exact=true`),
  );
  if (!user) throw new Error('provisioned user not found');
  return user;
}

/** Test credential set by the bootstrap administrator (spec Section 8 allows test credentials). */
const TEST_PASSWORD = 'correct horse battery staple, local test only';

async function setTestPassword(userId: string): Promise<void> {
  const response = await keycloak.admin(`/users/${userId}/reset-password`, {
    method: 'PUT',
    body: JSON.stringify({ type: 'password', value: TEST_PASSWORD, temporary: false }),
  });
  expect(response.status).toBe(204);
  // A verified address, so the realm's verify-email policy does not interpose on sign-in.
  const verified = await keycloak.admin(`/users/${userId}`, {
    method: 'PUT',
    body: JSON.stringify({ emailVerified: true }),
  });
  expect(verified.status).toBe(204);
}

function pkcePair(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString('base64url');
  return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') };
}

function authorizationUrl(overrides: Record<string, string | undefined> = {}): string {
  const { challenge } = pkcePair();
  const parameters: Record<string, string | undefined> = {
    client_id: 'vertex-web',
    response_type: 'code',
    scope: 'openid',
    redirect_uri: keycloak.uris.redirect,
    state: randomBytes(16).toString('base64url'),
    nonce: randomBytes(16).toString('base64url'),
    code_challenge: challenge,
    code_challenge_method: 'S256',
    ...overrides,
  };
  const query = new URLSearchParams(
    Object.entries(parameters).filter((entry): entry is [string, string] => entry[1] !== undefined),
  );
  return `${keycloak.issuer}/protocol/openid-connect/auth?${query}`;
}

function formAction(html: string): string {
  const match = /<form[^>]*id="kc-form-login"[^>]*action="([^"]+)"/.exec(html);
  if (!match?.[1]) throw new Error('login form not found');
  return match[1].replaceAll('&amp;', '&');
}

/**
 * Opens the vertex-web sign-in page, submits username and password once, and follows redirects
 * only while they stay on Keycloak. A redirect to the client (with a code or an error) is returned.
 */
async function submitPassword(username: string, password: string): Promise<Response> {
  const browser = new Browser();
  const page = await browser.request(authorizationUrl());
  expect(page.status).toBe(200);
  let response = await browser.request(formAction(await page.text()), {
    method: 'POST',
    body: new URLSearchParams({ username, password, credentialId: '' }),
  });
  for (let hops = 0; hops < 5; hops += 1) {
    const location = response.headers.get('location');
    if (response.status !== 302 || !location?.startsWith(keycloak.baseUrl)) break;
    response = await browser.request(location);
  }
  return response;
}

// ---------------------------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------------------------

describe('OIDC discovery', () => {
  it('publishes the realm issuer, its endpoints and signing keys', async () => {
    const discovery = await json<Record<string, unknown>>(
      fetch(`${keycloak.issuer}/.well-known/openid-configuration`),
    );
    expect(discovery['issuer']).toBe(keycloak.issuer);
    expect(discovery['authorization_endpoint']).toBe(
      `${keycloak.issuer}/protocol/openid-connect/auth`,
    );
    expect(discovery['code_challenge_methods_supported']).toContain('S256');

    const jwks = await json<{ keys: { alg?: string; use?: string; kid?: string }[] }>(
      fetch(String(discovery['jwks_uri'])),
    );
    expect(jwks.keys.some((key) => key.alg === 'RS256' && key.use === 'sig' && key.kid)).toBe(true);
  });
});

describe('vertex-web client', () => {
  it('serves the sign-in page only for the exact registered redirect URI with PKCE S256', async () => {
    const response = await new Browser().request(authorizationUrl());
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('id="kc-form-login"');
  });

  it.each([
    ['a longer path', (uri: string) => `${uri}/extra`],
    ['an added query', (uri: string) => `${uri}?next=/`],
    ['another port', (uri: string) => uri.replace(':4300', ':4301')],
    ['another host', (uri: string) => uri.replace('127.0.0.1', 'evil.example')],
  ])('refuses a redirect URI with %s without redirecting', async (_, change) => {
    const response = await new Browser().request(
      authorizationUrl({ redirect_uri: change(keycloak.uris.redirect) }),
    );
    expect(response.status).toBe(400);
    expect(response.headers.get('location')).toBeNull();
  });

  it.each([
    ['without a code challenge', { code_challenge: undefined, code_challenge_method: undefined }],
    ['with the plain challenge method', { code_challenge_method: 'plain' }],
  ])('rejects an authorization request %s', async (_, overrides) => {
    const response = await new Browser().request(authorizationUrl(overrides));
    expect(response.status).toBe(302);
    const location = new URL(String(response.headers.get('location')));
    expect(`${location.origin}${location.pathname}`).toBe(keycloak.uris.redirect);
    expect(location.searchParams.get('error')).toBe('invalid_request');
    expect(location.searchParams.get('code')).toBeNull();
  });

  it('refuses the implicit flow', async () => {
    const response = await new Browser().request(authorizationUrl({ response_type: 'token' }));
    const location = String(response.headers.get('location'));
    expect(location).toContain('error=unauthorized_client');
    expect(location).not.toContain('access_token');
  });

  it('refuses password and client-credentials grants and a wrong secret', async () => {
    const password = await tokenRequest({
      grant_type: 'password',
      client_id: 'vertex-web',
      client_secret: keycloak.secrets.webClient,
      username: 'nobody@example.test',
      password: 'irrelevant-password-value',
    });
    expect(password.body.error).toBe('unauthorized_client');
    expect(password.body.access_token).toBeUndefined();

    const clientCredentials = await tokenRequest({
      grant_type: 'client_credentials',
      client_id: 'vertex-web',
      client_secret: keycloak.secrets.webClient,
    });
    expect(clientCredentials.body.error).toBe('unauthorized_client');

    const wrongSecret = await tokenRequest({
      grant_type: 'authorization_code',
      client_id: 'vertex-web',
      client_secret: 'not-the-secret',
      code: 'x',
      redirect_uri: keycloak.uris.redirect,
    });
    // Keycloak reports failed client authentication as 401 unauthorized_client.
    expect(wrongSecret.status).toBe(401);
    expect(wrongSecret.body.error).toBe('unauthorized_client');
    expect(wrongSecret.body.access_token).toBeUndefined();
  });

  it('accepts only the registered post-logout redirect URI', async () => {
    const logout = (uri: string) =>
      new Browser().request(
        `${keycloak.issuer}/protocol/openid-connect/logout?${new URLSearchParams({
          client_id: 'vertex-web',
          post_logout_redirect_uri: uri,
        })}`,
      );
    const registered = await logout(keycloak.uris.postLogoutRedirect);
    expect(registered.status).toBe(302);
    expect(registered.headers.get('location')).toBe(keycloak.uris.postLogoutRedirect);
    for (const uri of [`${keycloak.uris.postLogoutRedirect}other`, 'http://evil.example/']) {
      const refused = await logout(uri);
      expect(refused.status).toBe(400);
      expect(refused.headers.get('location')).toBeNull();
    }
  });

  it('is configured for back-channel logout, without roles, full scope or offline access', async () => {
    const [client] = await json<Record<string, unknown>[]>(
      keycloak.admin('/clients?clientId=vertex-web'),
    );
    if (!client) throw new Error('vertex-web missing');
    const attributes = client['attributes'] as Record<string, string>;
    expect(client).toMatchObject({
      publicClient: false,
      standardFlowEnabled: true,
      implicitFlowEnabled: false,
      directAccessGrantsEnabled: false,
      serviceAccountsEnabled: false,
      frontchannelLogout: false,
      fullScopeAllowed: false,
      redirectUris: [keycloak.uris.redirect],
    });
    expect(attributes).toMatchObject({
      'pkce.code.challenge.method': 'S256',
      'post.logout.redirect.uris': keycloak.uris.postLogoutRedirect,
      'backchannel.logout.url': keycloak.uris.backchannelLogout,
      'backchannel.logout.session.required': 'true',
      'oauth2.device.authorization.grant.enabled': 'false',
      'oidc.ciba.grant.enabled': 'false',
      'standard.token.exchange.enabled': 'false',
    });

    const id = String(client['id']);
    expect(await json<unknown[]>(keycloak.admin(`/clients/${id}/roles`))).toEqual([]);
    const optional = await json<{ name: string }[]>(
      keycloak.admin(`/clients/${id}/optional-client-scopes`),
    );
    expect(optional).toEqual([]);
    const defaults = await json<{ name: string }[]>(
      keycloak.admin(`/clients/${id}/default-client-scopes`),
    );
    expect(defaults.map((scope) => scope.name).sort()).toEqual([
      'acr',
      'basic',
      'email',
      'profile',
    ]);
  });
});

describe('vertex-provisioner client', () => {
  it('receives a service-account token scoped to realm-management manage-users only', async () => {
    const token = claims(await provisionerToken());
    expect(token['azp']).toBe('vertex-provisioner');
    expect(token['resource_access']).toEqual({ 'realm-management': { roles: ['manage-users'] } });
    expect(token['realm_access']).toBeUndefined();
  });

  it('can find, create, read, disable, enable and log out users', async () => {
    const email = uniqueEmail('provisioned');
    const vertexUserId = randomUUID();
    const user = await provisionUser(email, vertexUserId);
    expect(user).toMatchObject({ username: email, email, enabled: true });
    expect(user.attributes).toEqual({ vertexUserId: [vertexUserId] });

    const read = await json<UserRepresentation>(asProvisioner(`${REALM}/users/${user.id}`));
    expect(read.attributes?.['vertexUserId']).toEqual([vertexUserId]);

    for (const enabled of [false, true]) {
      const update = await asProvisioner(`${REALM}/users/${user.id}`, {
        method: 'PUT',
        body: JSON.stringify({ enabled }),
      });
      expect(update.status).toBe(204);
      expect(
        (await json<UserRepresentation>(asProvisioner(`${REALM}/users/${user.id}`))).enabled,
      ).toBe(enabled);
    }

    const logout = await asProvisioner(`${REALM}/users/${user.id}/logout`, { method: 'POST' });
    expect(logout.status).toBe(204);
  });

  it('is refused realm, client, event, impersonation and privilege-granting operations', async () => {
    const user = await provisionUser(uniqueEmail('refusals'));
    const [realmManagement] = await json<{ id: string }[]>(
      keycloak.admin('/clients?clientId=realm-management'),
    );
    const realmAdmin = await json<unknown>(
      keycloak.admin(`/clients/${realmManagement?.id}/roles/realm-admin`),
    );

    const refused = [
      await asProvisioner(REALM, {
        method: 'PUT',
        body: JSON.stringify({ registrationAllowed: true }),
      }),
      await asProvisioner(`${REALM}/clients`),
      await asProvisioner(`${REALM}/events`),
      await asProvisioner(`${REALM}/admin-events`),
      await asProvisioner('master/users'),
      await asProvisioner(`${REALM}/users/${user.id}/impersonation`, { method: 'POST' }),
      await asProvisioner(
        `${REALM}/users/${user.id}/role-mappings/clients/${realmManagement?.id}`,
        { method: 'POST', body: JSON.stringify([realmAdmin]) },
      ),
    ];
    expect(refused.map((response) => response.status)).toEqual([403, 403, 403, 403, 403, 403, 403]);
  });

  it('is configured as a confidential service account with every interactive flow off', async () => {
    const [client] = await json<Record<string, unknown>[]>(
      keycloak.admin('/clients?clientId=vertex-provisioner'),
    );
    expect(client).toMatchObject({
      publicClient: false,
      standardFlowEnabled: false,
      implicitFlowEnabled: false,
      directAccessGrantsEnabled: false,
      serviceAccountsEnabled: true,
      fullScopeAllowed: false,
      redirectUris: [],
    });
    expect(client?.['attributes']).toMatchObject({
      'oauth2.device.authorization.grant.enabled': 'false',
      'oidc.ciba.grant.enabled': 'false',
      'standard.token.exchange.enabled': 'false',
    });
  });

  it('has no interactive flow', async () => {
    const browserFlow = await new Browser().request(
      authorizationUrl({ client_id: 'vertex-provisioner' }),
    );
    expect(browserFlow.status).toBe(400);
    expect(await browserFlow.text()).not.toContain('id="kc-form-login"');

    // The device grant is interactive and needs no redirect URI.
    const device = await fetch(`${keycloak.issuer}/protocol/openid-connect/auth/device`, {
      method: 'POST',
      body: new URLSearchParams({
        client_id: 'vertex-provisioner',
        client_secret: keycloak.secrets.provisionerClient,
      }),
    });
    expect(device.ok).toBe(false);
    expect(((await device.json()) as TokenResponse).error).toBe('unauthorized_client');

    const password = await tokenRequest({
      grant_type: 'password',
      client_id: 'vertex-provisioner',
      client_secret: keycloak.secrets.provisionerClient,
      username: 'nobody@example.test',
      password: 'irrelevant-password-value',
    });
    expect(password.body.error).toBe('unauthorized_client');
  });
});

describe('user profile', () => {
  it('rejects a malformed vertexUserId and drops undeclared attributes', async () => {
    const malformed = await asProvisioner(`${REALM}/users`, {
      method: 'POST',
      body: JSON.stringify({
        username: uniqueEmail('malformed'),
        enabled: true,
        attributes: { vertexUserId: ['not-a-uuid'] },
      }),
    });
    expect(malformed.status).toBe(400);

    const email = uniqueEmail('undeclared');
    const created = await asProvisioner(`${REALM}/users`, {
      method: 'POST',
      body: JSON.stringify({
        username: email,
        email,
        enabled: true,
        attributes: { vertexUserId: [randomUUID()], undeclared: ['x'] },
      }),
    });
    expect(created.status).toBe(201);
    const [user] = await json<UserRepresentation[]>(
      asProvisioner(`${REALM}/users?username=${encodeURIComponent(email)}&exact=true`),
    );
    expect(Object.keys(user?.attributes ?? {})).toEqual(['vertexUserId']);
  });

  it('keeps username, email and vertexUserId out of reach of the user-facing account route', async () => {
    const email = uniqueEmail('account');
    const vertexUserId = randomUUID();
    const user = await provisionUser(email, vertexUserId);
    await setTestPassword(user.id);

    // A throwaway direct-grant client, created only inside this ephemeral test realm, obtains a
    // user token for the account route. It never exists in the committed configuration.
    const probeClientId = `contract-probe-${randomBytes(4).toString('hex')}`;
    const probe = await keycloak.admin('/clients', {
      method: 'POST',
      body: JSON.stringify({
        clientId: probeClientId,
        publicClient: true,
        standardFlowEnabled: false,
        directAccessGrantsEnabled: true,
      }),
    });
    expect(probe.status).toBe(201);
    const probeLocation = String(probe.headers.get('location'));
    const { body } = await tokenRequest({
      grant_type: 'password',
      client_id: probeClientId,
      username: email,
      password: TEST_PASSWORD,
    });
    if (!body.access_token) throw new Error(`user token: ${body.error}`);
    const account = (init: RequestInit = {}) =>
      fetch(`${keycloak.issuer}/account/`, {
        ...init,
        headers: {
          authorization: `Bearer ${body.access_token}`,
          accept: 'application/json',
          'content-type': 'application/json',
        },
      });

    const own = await json<Record<string, unknown>>(account());
    expect(own['username']).toBe(email);
    expect(JSON.stringify(own)).not.toContain(vertexUserId);

    // The route itself works: a user-editable attribute changes.
    const allowed = await account({
      method: 'POST',
      body: JSON.stringify({ username: email, email, firstName: 'Changed' }),
    });
    expect(allowed.status).toBe(204);

    // Each protected field is attempted alone, so one refusal cannot mask another change.
    const other = uniqueEmail('takeover');
    const attempts = [
      { username: other, email },
      { username: email, email: other },
      { username: email, email, attributes: { vertexUserId: [randomUUID()] } },
    ];
    for (const attempt of attempts) {
      await account({ method: 'POST', body: JSON.stringify({ ...attempt, firstName: 'Changed' }) });
      const after = await json<UserRepresentation>(keycloak.admin(`/users/${user.id}`));
      expect(after).toMatchObject({ username: email, email, firstName: 'Changed' });
      expect(after.attributes?.['vertexUserId']).toEqual([vertexUserId]);
    }

    const probeId = probeLocation.slice(probeLocation.lastIndexOf('/') + 1);
    expect((await keycloak.admin(`/clients/${probeId}`, { method: 'DELETE' })).status).toBe(204);
  });

  it('declares the restrictions and keeps every username or email change route closed', async () => {
    const profile = await json<{
      attributes: { name: string; permissions?: { view?: string[]; edit?: string[] } }[];
      unmanagedAttributePolicy?: string;
    }>(keycloak.admin('/users/profile'));
    const permissions = Object.fromEntries(
      profile.attributes.map((attribute) => [attribute.name, attribute.permissions]),
    );
    expect(permissions['username']?.edit).toEqual(['admin']);
    expect(permissions['email']?.edit).toEqual(['admin']);
    expect(permissions['vertexUserId']).toEqual({ view: ['admin'], edit: ['admin'] });
    expect(profile.unmanagedAttributePolicy).toBeUndefined();

    const updateEmail = await json<{ enabled: boolean }>(
      keycloak.admin('/authentication/required-actions/UPDATE_EMAIL'),
    );
    expect(updateEmail.enabled).toBe(false);
    const realm = await json<Record<string, unknown>>(keycloak.admin(''));
    expect(realm).toMatchObject({ editUsernameAllowed: false, registrationEmailAsUsername: false });
  });
});

describe('credential policy', () => {
  it('enforces the password policy and hashes with the configured Argon2id', async () => {
    const realm = await json<Record<string, unknown>>(keycloak.admin(''));
    expect(realm['passwordPolicy']).toBe(
      'length(15) and maxLength(128) and notUsername and notEmail and hashAlgorithm(argon2) and hashIterations(2)',
    );

    const email = uniqueEmail('password-policy');
    const user = await provisionUser(email);
    const reset = (value: string) =>
      keycloak.admin(`/users/${user.id}/reset-password`, {
        method: 'PUT',
        body: JSON.stringify({ type: 'password', value, temporary: false }),
      });

    const tooShort = await reset('fourteen-chars');
    expect(tooShort.status).toBe(400);
    expect(await tooShort.text()).toContain('invalidPasswordMinLengthMessage');
    const tooLong = await reset('p'.repeat(129));
    expect(tooLong.status).toBe(400);
    expect(await tooLong.text()).toContain('invalidPasswordMaxLengthMessage');
    // The username is the email address, so this also covers notEmail.
    const sameAsUsername = await reset(email);
    expect(sameAsUsername.status).toBe(400);
    expect(await sameAsUsername.text()).toMatch(/invalidPasswordNot(Username|Email)Message/);
    // No composition rule: a long lower-case passphrase of 64 characters or more is accepted.
    expect((await reset(`${'long passphrase '.repeat(6)}ok`)).status).toBe(204);

    const [credential] = await json<{ type: string; credentialData: string }[]>(
      keycloak.admin(`/users/${user.id}/credentials`),
    );
    expect(credential?.type).toBe('password');
    expect(JSON.parse(String(credential?.credentialData))).toEqual({
      algorithm: 'argon2',
      hashIterations: 2,
      additionalParameters: {
        type: ['id'],
        version: ['1.3'],
        memory: ['19456'],
        parallelism: ['1'],
        hashLength: ['32'],
      },
    });
  });

  it('requires TOTP enrolment before a sign-in can complete', async () => {
    const email = uniqueEmail('mfa');
    const user = await provisionUser(email);
    await setTestPassword(user.id);

    const response = await submitPassword(email, TEST_PASSWORD);
    // Keycloak stops at the enrolment form instead of redirecting to the client with a code.
    expect(response.status).toBe(200);
    expect(response.headers.get('location')).toBeNull();
    expect(await response.text()).toContain('id="kc-totp-settings-form"');

    const realm = await json<Record<string, unknown>>(keycloak.admin(''));
    expect(realm).toMatchObject({
      browserFlow: 'vertex browser',
      otpPolicyType: 'totp',
      otpPolicyAlgorithm: 'HmacSHA1',
      otpPolicyDigits: 6,
      otpPolicyPeriod: 30,
      otpPolicyLookAheadWindow: 1,
      otpPolicyCodeReusable: false,
    });
    const executions = await json<{ providerId?: string; requirement: string }[]>(
      keycloak.admin(`/authentication/flows/${encodeURIComponent('vertex browser')}/executions`),
    );
    expect(
      executions.find((execution) => execution.providerId === 'auth-otp-form')?.requirement,
    ).toBe('REQUIRED');
  });
});

describe('brute-force protection and events', () => {
  it('is configured with the D-09 temporary lockout policy', async () => {
    const realm = await json<Record<string, unknown>>(keycloak.admin(''));
    expect(realm).toMatchObject({
      bruteForceProtected: true,
      bruteForceStrategy: 'MULTIPLE',
      permanentLockout: false,
      maxTemporaryLockouts: 0,
      failureFactor: 5,
      waitIncrementSeconds: 60,
      maxFailureWaitSeconds: 900,
      maxDeltaTimeSeconds: 43_200,
      quickLoginCheckMilliSeconds: 1000,
      minimumQuickLoginWaitSeconds: 60,
    });
  });

  const lockout = (userId: string) =>
    json<{ disabled: boolean; numFailures: number }>(
      keycloak.admin(`/attack-detection/brute-force/users/${userId}`),
    );

  /**
   * The brute-force status once Keycloak has recorded `failures` failures and, when given, reached
   * `settled`. Keycloak answers the login form first and records the failure afterwards on its
   * `bruteforce` executor (`DefaultBruteForceProtector.processLogin`), so an immediate read can see
   * the previous state (IAM-R03F D-12). Gives up after 10 s and returns the last status read.
   */
  async function lockoutAfter(
    userId: string,
    failures: number,
    settled: (status: { disabled: boolean; numFailures: number }) => boolean = () => true,
  ) {
    const deadline = Date.now() + 10_000;
    for (;;) {
      const status = await lockout(userId);
      if ((status.numFailures >= failures && settled(status)) || Date.now() > deadline) {
        return status;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  it('locks an identity after the fifth spaced failure, not before, and records the failures', async () => {
    const email = uniqueEmail('brute');
    const user = await provisionUser(email);
    await setTestPassword(user.id);

    // Failures spaced beyond the quick-login window (1000 ms) count only towards failureFactor.
    // Each is recorded before the next wait starts, so Keycloak's own spacing matches the test's.
    const beyondQuickLoginWindow = 1_200;
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, beyondQuickLoginWindow));
      expect((await submitPassword(email, `wrong password attempt ${attempt}`)).status).toBe(200);
      const status = await lockoutAfter(user.id, attempt, (current) =>
        attempt === 5 ? current.disabled : true,
      );
      expect(status.numFailures).toBe(attempt);
      expect(status.disabled).toBe(attempt === 5);
    }

    // Temporary lockout: the identity itself stays enabled (no permanent lockout).
    expect((await json<UserRepresentation>(keycloak.admin(`/users/${user.id}`))).enabled).toBe(
      true,
    );

    const events = await json<{ type: string; userId?: string }[]>(
      keycloak.admin(`/events?type=LOGIN_ERROR&user=${user.id}`),
    );
    expect(events.length).toBeGreaterThanOrEqual(5);
  }, 60_000);

  it('locks an identity at once when failures arrive faster than the quick-login window', async () => {
    const email = uniqueEmail('quick');
    const user = await provisionUser(email);
    await setTestPassword(user.id);

    await submitPassword(email, 'wrong password, first');
    await submitPassword(email, 'wrong password, second');
    const status = await lockoutAfter(user.id, 2, (current) => current.disabled);
    expect(status.numFailures).toBe(2);
    expect(status.disabled).toBe(true);
  });

  it('records administrative changes made by the provisioner without their payloads', async () => {
    const user = await provisionUser(uniqueEmail('admin-event'));
    const [provisioner] = await json<{ id: string }[]>(
      keycloak.admin('/clients?clientId=vertex-provisioner'),
    );
    const adminEvents = await json<
      {
        operationType: string;
        resourcePath: string;
        representation?: string;
        authDetails: { clientId: string };
      }[]
    >(keycloak.admin('/admin-events?operationTypes=CREATE&resourceTypes=USER'));
    const creation = adminEvents.find((event) => event.resourcePath === `users/${user.id}`);
    expect(creation?.authDetails.clientId).toBe(provisioner?.id);
    expect(creation?.representation).toBeUndefined();
  });

  it('keeps user and admin events for the security event types', async () => {
    const config = await json<{
      eventsEnabled: boolean;
      eventsExpiration: number;
      enabledEventTypes: string[];
      adminEventsEnabled: boolean;
      adminEventsDetailsEnabled: boolean;
    }>(keycloak.admin('/events/config'));
    expect(config).toMatchObject({
      eventsEnabled: true,
      eventsExpiration: 7_776_000,
      adminEventsEnabled: true,
      adminEventsDetailsEnabled: false,
    });
    expect(config.enabledEventTypes).toEqual(
      expect.arrayContaining([
        'LOGIN',
        'LOGIN_ERROR',
        'LOGOUT',
        'UPDATE_PASSWORD',
        'RESET_PASSWORD',
        'SEND_RESET_PASSWORD',
        'UPDATE_TOTP',
        'REMOVE_TOTP',
        'UPDATE_CREDENTIAL',
        'REMOVE_CREDENTIAL',
        'EXECUTE_ACTIONS',
        'USER_DISABLED_BY_TEMPORARY_LOCKOUT',
      ]),
    );
    const realm = await json<{ attributes: Record<string, string> }>(keycloak.admin(''));
    expect(realm.attributes['adminEventsExpiration']).toBe('7776000');
  });
});

describe('sessions, tokens and realm entry points', () => {
  it('keeps the SSO session within the application-session limits and rotates refresh tokens', async () => {
    const realm = await json<Record<string, number | boolean>>(keycloak.admin(''));
    expect(realm).toMatchObject({
      // Pinned to the application-session defaults (IAM-R03 D-05; IAM-CP1 CP1-10): a longer SSO
      // idle would outlive the application's idle limit.
      ssoSessionIdleTimeout: 1800,
      ssoSessionMaxLifespan: 36_000,
      accessTokenLifespan: 300,
      actionTokenGeneratedByAdminLifespan: 43_200,
      actionTokenGeneratedByUserLifespan: 300,
      duplicateEmailsAllowed: false,
      revokeRefreshToken: true,
      refreshTokenMaxReuse: 0,
      rememberMe: false,
      registrationAllowed: false,
      verifyEmail: true,
      bruteForceProtected: true,
      permanentLockout: false,
    });
  });

  it('lets no client obtain a token through a password or implicit grant', async () => {
    const clients = await json<
      { clientId: string; directAccessGrantsEnabled: boolean; implicitFlowEnabled: boolean }[]
    >(keycloak.admin('/clients'));
    const permissive = clients
      .filter((client) => !client.clientId.startsWith('contract-probe-'))
      .filter((client) => client.directAccessGrantsEnabled || client.implicitFlowEnabled)
      .map((client) => client.clientId);
    expect(permissive).toEqual([]);

    const email = uniqueEmail('admin-cli');
    const user = await provisionUser(email);
    await setTestPassword(user.id);
    const adminCli = await tokenRequest({
      grant_type: 'password',
      client_id: 'admin-cli',
      username: email,
      password: TEST_PASSWORD,
    });
    expect(adminCli.body.error).toBe('unauthorized_client');
    expect(adminCli.body.access_token).toBeUndefined();
  });
});

/** A user with the test password and an enrolled TOTP, enrolled through the real sign-in flow. */
async function enrolledUser(label: string): Promise<{
  email: string;
  id: string;
  secret: string;
  used: Set<string>;
}> {
  const email = uniqueEmail(label);
  const user = await provisionUser(email);
  await setTestPassword(user.id);
  const browser = new Browser();
  const login = await open(browser, authorizationUrl(), keycloak.baseUrl);
  const enrolment = await submit(
    browser,
    login,
    FORMS.login,
    { username: email, password: TEST_PASSWORD },
    keycloak.baseUrl,
  );
  expect(hasForm(enrolment, FORMS.totpEnrolment)).toBe(true);
  const { secret, ...page } = await totpSecret(browser, enrolment, keycloak.baseUrl);
  const used = new Set<string>();
  const done = await submit(
    browser,
    page,
    FORMS.totpEnrolment,
    { totp: freshTotp(secret, used), userLabel: 'test device' },
    keycloak.baseUrl,
  );
  expect(done.location?.startsWith(`${keycloak.uris.redirect}?`)).toBe(true);
  return { email, id: user.id, secret, used };
}

/** Requests a reset for `username` from the sign-in page; returns the emailed link, if any. */
async function requestReset(username: string): Promise<string | undefined> {
  const browser = new Browser();
  const login = await open(browser, authorizationUrl(), keycloak.baseUrl);
  const resetLink = links(login.html).find((link) =>
    link.includes('/login-actions/reset-credentials'),
  );
  expect(resetLink).toBeDefined();
  const form = await open(
    browser,
    new URL(resetLink ?? '', keycloak.baseUrl).href,
    keycloak.baseUrl,
  );
  const sent = await submit(browser, form, FORMS.resetRequest, { username }, keycloak.baseUrl);
  expect(sent.status).toBe(200);
  return sent.html;
}

async function resetLinkFor(email: string): Promise<string> {
  const message = await keycloak.mail.waitFor(email);
  const link = /(https?:\/\/\S+\/login-actions\/action-token\S+)/.exec(message.text)?.[1];
  if (!link) throw new Error('reset message without an action link');
  return link;
}

/** Opens a link from an email in a fresh browser, as the mailbox holder would. */
async function followMailLink(link: string): Promise<{ browser: Browser; page: Page }> {
  const browser = new Browser();
  return { browser, page: await open(browser, link, keycloak.baseUrl) };
}

describe('self-service credential recovery', () => {
  it('uses a reset flow that demands the enrolled OTP and removes no factor', async () => {
    const realm = await json<Record<string, unknown>>(keycloak.admin(''));
    expect(realm).toMatchObject({
      resetPasswordAllowed: true,
      resetCredentialsFlow: 'vertex reset credentials',
      actionTokenGeneratedByUserLifespan: 300,
    });
    const executions = await json<{ providerId?: string; requirement: string }[]>(
      keycloak.admin(
        `/authentication/flows/${encodeURIComponent('vertex reset credentials')}/executions`,
      ),
    );
    expect(executions.map((execution) => [execution.providerId, execution.requirement])).toEqual([
      ['reset-credentials-choose-user', 'REQUIRED'],
      ['reset-credential-email', 'REQUIRED'],
      ['auth-otp-form', 'REQUIRED'],
      ['reset-password', 'REQUIRED'],
    ]);
  });

  it('asks the mailbox holder for the enrolled OTP before a new password, and rejects a wrong code', async () => {
    const user = await enrolledUser('reset-otp');
    await requestReset(user.email);

    const { browser, page } = await followMailLink(await resetLinkFor(user.email));
    // The link alone leads to the OTP form, not to a password form or a new enrolment.
    expect(hasForm(page, FORMS.otp)).toBe(true);
    expect(hasForm(page, FORMS.passwordUpdate)).toBe(false);
    expect(hasForm(page, FORMS.totpEnrolment)).toBe(false);

    const wrong = await submit(browser, page, FORMS.otp, { otp: '000000' }, keycloak.baseUrl);
    expect(hasForm(wrong, FORMS.otp)).toBe(true);
    expect(hasForm(wrong, FORMS.passwordUpdate)).toBe(false);

    const passwordPage = await submit(
      browser,
      wrong,
      FORMS.otp,
      { otp: freshTotp(user.secret, user.used) },
      keycloak.baseUrl,
    );
    expect(hasForm(passwordPage, FORMS.passwordUpdate)).toBe(true);
    const newPassword = 'a brand new passphrase, local test only';
    await submit(
      browser,
      passwordPage,
      FORMS.passwordUpdate,
      { 'password-new': newPassword, 'password-confirm': newPassword },
      keycloak.baseUrl,
    );

    // The OTP credential survived the reset.
    const credentials = await json<{ type: string }[]>(
      keycloak.admin(`/users/${user.id}/credentials`),
    );
    expect(credentials.map((credential) => credential.type).sort()).toEqual(['otp', 'password']);
  });

  it('makes a user without OTP enrol one before the reset completes', async () => {
    const email = uniqueEmail('reset-enrol');
    const user = await provisionUser(email);
    await setTestPassword(user.id);
    await requestReset(email);

    const { browser, page } = await followMailLink(await resetLinkFor(email));
    const seen: string[] = [];
    let current = page;
    const used = new Set<string>();
    for (let step = 0; step < 4 && current.status === 200; step += 1) {
      if (hasForm(current, FORMS.totpEnrolment)) {
        seen.push('enrol');
        const { secret, ...enrolment } = await totpSecret(browser, current, keycloak.baseUrl);
        current = await submit(
          browser,
          enrolment,
          FORMS.totpEnrolment,
          { totp: freshTotp(secret, used), userLabel: 'test device' },
          keycloak.baseUrl,
        );
      } else if (hasForm(current, FORMS.passwordUpdate)) {
        seen.push('password');
        const password = 'another new passphrase, local test only';
        current = await submit(
          browser,
          current,
          FORMS.passwordUpdate,
          { 'password-new': password, 'password-confirm': password },
          keycloak.baseUrl,
        );
      } else {
        break;
      }
    }

    expect(seen).toContain('enrol');
    const credentials = await json<{ type: string }[]>(
      keycloak.admin(`/users/${user.id}/credentials`),
    );
    expect(credentials.map((credential) => credential.type)).toContain('otp');
  });

  it('answers a reset request for an unknown account like a known one and sends nothing', async () => {
    const known = await enrolledUser('reset-known');
    const unknown = uniqueEmail('nobody');

    const knownAnswer = await requestReset(known.email);
    const unknownAnswer = await requestReset(unknown);
    await keycloak.mail.waitFor(known.email);

    const message = (html: string) => /<[^>]*kc-feedback-text[^>]*>([^<]*)</.exec(html)?.[1];
    expect(message(unknownAnswer ?? '')).toBe(message(knownAnswer ?? ''));
    expect(await keycloak.mail.messages(unknown)).toEqual([]);
  });

  it('sends realm email from the configured sender through the SMTP settings', async () => {
    const realm = await json<{ smtpServer: Record<string, string> }>(keycloak.admin(''));
    expect(realm.smtpServer).toMatchObject({
      host: 'mailpit',
      port: '1025',
      from: MAIL_FROM,
      auth: 'true',
      user: 'keycloak',
      starttls: 'false',
      ssl: 'false',
    });
    expect(JSON.stringify(realm.smtpServer)).not.toContain(keycloak.secrets.smtpPassword);
  });
});

describe('secret handling', () => {
  it('never writes a generated secret to the Keycloak log', async () => {
    const output = await keycloak.logs();
    expect(output).toContain("Realm 'vertex' imported");
    for (const secret of [
      keycloak.secrets.webClient,
      keycloak.secrets.provisionerClient,
      keycloak.secrets.adminPassword,
      keycloak.secrets.smtpPassword,
    ]) {
      expect(output).not.toContain(secret);
    }
  });
});
