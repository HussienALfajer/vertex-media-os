import { describe, expect, it } from 'vitest';
import type { NormalizedEmail, UserId } from '@vertex-os/iam/identity-provider';
import { createKeycloakIdentityProvider } from './keycloak-identity-provider.js';

const ORIGIN = 'http://keycloak.test:8080';
const ISSUER = `${ORIGIN}/realms/vertex`;
const ADMIN = `${ORIGIN}/admin/realms/vertex`;
const EMAIL = 'ada.sentinel@example.test' as NormalizedEmail;
const USER_ID = '0d6f7a52-8f7e-4c2a-9a55-1f2b3c4d5e6f' as UserId;
const SECRET = 'sentinel-client-secret-value';

interface Call {
  readonly method: string;
  readonly url: string;
  readonly body: string | undefined;
  readonly authorization: string | null;
}

type Handler = (call: Call) => Response | Promise<Response>;

function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

const empty = (status: number, headers: Record<string, string> = {}) =>
  new Response(null, { status, headers });

const tokenResponse = (value = 'token-1') =>
  json(200, { access_token: value, expires_in: 300, token_type: 'Bearer' });

/** A fake transport: token requests succeed unless `admin` handles them. */
function transport(admin: Handler, token: Handler = () => tokenResponse()) {
  const calls: Call[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const call: Call = {
      method: init?.method ?? 'GET',
      url: String(input),
      body: typeof init?.body === 'string' ? init.body : init?.body?.toString(),
      authorization: new Headers(init?.headers).get('authorization'),
    };
    calls.push(call);
    if (init?.signal?.aborted) throw init.signal.reason;
    return call.url.endsWith('/protocol/openid-connect/token') ? token(call) : admin(call);
  };
  const provider = createKeycloakIdentityProvider({
    issuer: ISSUER,
    clientId: 'vertex-provisioner',
    clientSecret: SECRET,
    fetch: fetchImpl,
  });
  return { provider, calls, adminCalls: () => calls.filter((call) => call.url.startsWith(ADMIN)) };
}

const representation = {
  id: 'subject-1',
  username: EMAIL,
  email: EMAIL,
  enabled: true,
  emailVerified: false,
  firstName: 'kept',
  attributes: { vertexUserId: [USER_ID] },
};

describe('createKeycloakIdentityProvider', () => {
  it('derives the issuer and rejects a URL that is not a realm issuer', () => {
    expect(transport(() => empty(204)).provider.issuer).toBe(ISSUER);
    expect(() =>
      createKeycloakIdentityProvider({ issuer: ORIGIN, clientId: 'c', clientSecret: 's' }),
    ).toThrow('<origin>/realms/<realm>');
  });

  it('authenticates with client credentials and reuses the token', async () => {
    const { provider, calls } = transport(() => json(200, representation));

    await provider.findBySubject('subject-1');
    await provider.findBySubject('subject-1');

    const tokenCalls = calls.filter((call) => call.url.endsWith('/token'));
    expect(tokenCalls).toHaveLength(1);
    expect(new URLSearchParams(tokenCalls[0]?.body)).toEqual(
      new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: 'vertex-provisioner',
        client_secret: SECRET,
      }),
    );
    expect(calls.filter((call) => call.authorization === 'Bearer token-1')).toHaveLength(2);
  });

  it('renews the token once when the Admin API answers 401', async () => {
    let tokens = 0;
    let first = true;
    const { provider } = transport(
      () => {
        if (first) {
          first = false;
          return empty(401);
        }
        return json(200, representation);
      },
      () => tokenResponse(`token-${(tokens += 1)}`),
    );

    const result = await provider.findBySubject('subject-1');

    expect(result.ok).toBe(true);
    expect(tokens).toBe(2);
  });

  it('reads an identity and its ownership evidence, and maps 404 to undefined', async () => {
    const { provider } = transport((call) =>
      call.url.endsWith('/users/subject-1') ? json(200, representation) : json(404, {}),
    );

    expect(await provider.findBySubject('subject-1')).toEqual({
      ok: true,
      value: {
        subject: 'subject-1',
        username: EMAIL,
        enabled: true,
        emailVerified: false,
        vertexUserIds: [USER_ID],
      },
    });
    expect(await provider.findBySubject('missing')).toEqual({ ok: true, value: undefined });
  });

  it('searches by exact username and ignores inexact matches', async () => {
    const { provider, adminCalls } = transport(() =>
      json(200, [{ ...representation, id: 'other', username: `x${EMAIL}` }, representation]),
    );

    const result = await provider.findByUsername(EMAIL);

    expect(result).toMatchObject({ ok: true, value: { subject: 'subject-1' } });
    const query = new URL(adminCalls()[0]?.url ?? '').searchParams;
    expect(Object.fromEntries(query)).toEqual({
      username: EMAIL,
      exact: 'true',
      briefRepresentation: 'false',
      max: '2',
    });
  });

  it('creates the identity with username, email and vertexUserId in one request', async () => {
    const { provider, adminCalls } = transport(() =>
      empty(201, { location: `http://public.example/admin/realms/vertex/users/new-subject` }),
    );

    const result = await provider.create({ username: EMAIL, vertexUserId: USER_ID });

    expect(result).toEqual({ ok: true, value: { outcome: 'created', subject: 'new-subject' } });
    expect(JSON.parse(adminCalls()[0]?.body ?? '')).toEqual({
      username: EMAIL,
      email: EMAIL,
      enabled: true,
      emailVerified: false,
      attributes: { vertexUserId: [USER_ID] },
    });
  });

  it('reports a duplicate for 409 and an unknown outcome for a created user without a location', async () => {
    expect(
      await transport(() => empty(409)).provider.create({ username: EMAIL, vertexUserId: USER_ID }),
    ).toEqual({ ok: true, value: { outcome: 'duplicate' } });
    expect(
      await transport(() => empty(201)).provider.create({ username: EMAIL, vertexUserId: USER_ID }),
    ).toEqual({ ok: false, failure: 'unavailable' });
    expect(
      await transport(() => empty(201, { location: `${ADMIN}/groups/x` })).provider.create({
        username: EMAIL,
        vertexUserId: USER_ID,
      }),
    ).toEqual({ ok: false, failure: 'unavailable' });
  });

  it('changes only the enabled flag of the full representation', async () => {
    const { provider, adminCalls } = transport((call) =>
      call.method === 'GET' ? json(200, representation) : empty(204),
    );

    expect(await provider.setEnabled('subject-1', false)).toEqual({ ok: true, value: 'updated' });

    const put = adminCalls().find((call) => call.method === 'PUT');
    expect(JSON.parse(put?.body ?? '')).toEqual({ ...representation, enabled: false });
  });

  it('reads enrolled factor kinds only', async () => {
    const { provider } = transport(() =>
      json(200, [
        { id: 'c1', type: 'password', createdDate: 1 },
        { id: 'c2', type: 'otp', userLabel: 'phone' },
      ]),
    );

    expect(await provider.enrolledFactors('subject-1')).toEqual({
      ok: true,
      value: { password: true, otp: true },
    });
  });

  it('sends required-action email with the lifespan and no client or redirect', async () => {
    const { provider, adminCalls } = transport(() => empty(204));

    const result = await provider.sendInvitation('subject-1', {
      actions: ['VERIFY_EMAIL', 'CONFIGURE_TOTP'],
      lifespanSeconds: 3600,
    });

    expect(result).toEqual({ ok: true, value: 'sent' });
    const call = adminCalls()[0];
    const url = new URL(call?.url ?? '');
    expect(url.pathname).toBe('/admin/realms/vertex/users/subject-1/execute-actions-email');
    expect(Object.fromEntries(url.searchParams)).toEqual({ lifespan: '3600' });
    expect(JSON.parse(call?.body ?? '')).toEqual(['VERIFY_EMAIL', 'CONFIGURE_TOTP']);
  });

  it.each([
    [400, { ok: true, value: 'refused' }],
    [404, { ok: true, value: 'not-found' }],
    [500, { ok: false, failure: 'unavailable' }],
    [403, { ok: false, failure: 'rejected' }],
  ])(
    'maps a %s answer to a dispatch refusal, a missing identity or a failure',
    async (status, expected) => {
      const { provider } = transport(() =>
        json(status, { errorMessage: `User ${EMAIL} is disabled` }),
      );
      expect(
        await provider.sendInvitation('subject-1', {
          actions: ['VERIFY_EMAIL'],
          lifespanSeconds: 60,
        }),
      ).toEqual(expected);
    },
  );

  it('uses exactly the operations of spec Section 7.2', async () => {
    const { provider, adminCalls } = transport((call) => {
      if (call.method === 'POST' && call.url.endsWith('/users')) {
        return empty(201, { location: `${ADMIN}/users/s` });
      }
      if (call.method === 'GET' && call.url.includes('/users?')) return json(200, []);
      if (call.method === 'GET' && call.url.endsWith('/credentials')) return json(200, []);
      if (call.method === 'GET') return json(200, representation);
      return empty(204);
    });

    await provider.findBySubject('s');
    await provider.findByUsername(EMAIL);
    await provider.create({ username: EMAIL, vertexUserId: USER_ID });
    await provider.setEnabled('s', true);
    await provider.terminateSessions('s');
    await provider.enrolledFactors('s');
    await provider.sendInvitation('s', { actions: ['VERIFY_EMAIL'], lifespanSeconds: 60 });

    const operations = new Set(
      adminCalls().map(
        (call) =>
          `${call.method} ${new URL(call.url).pathname.replace(ADMIN.replace(ORIGIN, ''), '')}`,
      ),
    );
    expect([...operations].sort()).toEqual(
      [
        'GET /users',
        'GET /users/s',
        'GET /users/s/credentials',
        'POST /users',
        'POST /users/s/logout',
        'PUT /users/s',
        'PUT /users/s/execute-actions-email',
      ].sort(),
    );
  });

  describe('failure translation', () => {
    const operations = (provider: ReturnType<typeof transport>['provider']) => [
      provider.findBySubject('subject-1'),
      provider.findByUsername(EMAIL),
      provider.create({ username: EMAIL, vertexUserId: USER_ID }),
      provider.setEnabled('subject-1', false),
      provider.terminateSessions('subject-1'),
      provider.enrolledFactors('subject-1'),
      provider.sendInvitation('subject-1', { actions: ['VERIFY_EMAIL'], lifespanSeconds: 60 }),
    ];

    it('turns network errors that name the URL into `unavailable`, never an exception', async () => {
      const { provider } = transport(() => {
        throw new TypeError(`fetch failed for ${ADMIN}/users?username=${EMAIL}`);
      });

      const results = await Promise.all(operations(provider));

      expect(results).toEqual(Array(7).fill({ ok: false, failure: 'unavailable' }));
    });

    it('never carries a Keycloak body, URL or email in a result', async () => {
      for (const status of [400, 403, 409, 422, 500, 503]) {
        const { provider } = transport(() =>
          json(status, { errorMessage: `conflict for ${EMAIL}`, url: `${ADMIN}/users/x` }),
        );
        const serialized = JSON.stringify(await Promise.all(operations(provider)));
        expect(serialized).not.toContain(EMAIL);
        expect(serialized).not.toContain(ORIGIN);
        expect(serialized).not.toContain('conflict for');
      }
    });

    it.each([
      [401, 'rejected'],
      [400, 'rejected'],
      [503, 'unavailable'],
      [429, 'unavailable'],
    ])('reports a token answer of %s as %s', async (status, failure) => {
      const { provider, adminCalls } = transport(
        () => json(200, representation),
        () => json(status, { error: 'unauthorized_client', error_description: SECRET }),
      );

      const result = await provider.findBySubject('subject-1');

      expect(result).toEqual({ ok: false, failure });
      expect(adminCalls()).toEqual([]);
    });

    it('treats a malformed success body as an unknown outcome', async () => {
      const { provider } = transport(() => new Response('<html>', { status: 200 }));
      expect(await provider.findBySubject('subject-1')).toEqual({
        ok: false,
        failure: 'unavailable',
      });
      const { provider: other } = transport(() => json(200, { ...representation, enabled: 'yes' }));
      expect(await other.findBySubject('subject-1')).toEqual({ ok: false, failure: 'unavailable' });
    });

    it('bounds every request with the timeout', async () => {
      const provider = createKeycloakIdentityProvider({
        issuer: ISSUER,
        clientId: 'vertex-provisioner',
        clientSecret: SECRET,
        requestTimeoutMs: 50,
        fetch: (_input, init) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
          }),
      });

      const started = Date.now();
      expect(await provider.findBySubject('subject-1')).toEqual({
        ok: false,
        failure: 'unavailable',
      });
      expect(Date.now() - started).toBeLessThan(5_000);
    });
  });
});
