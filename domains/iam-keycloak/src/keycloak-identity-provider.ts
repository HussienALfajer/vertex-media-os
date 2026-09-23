import type {
  ExternalIdentity,
  IdentityProvider,
  IdentityProviderFailure,
  InvitationAction,
  NormalizedEmail,
  ProviderResult,
  UserId,
} from '@vertex-os/iam/identity-provider';

export interface KeycloakIdentityProviderOptions {
  /** The realm issuer, `<origin>[/<path>]/realms/<realm>`; bound to every identity. */
  readonly issuer: string;
  /** The `vertex-provisioner` service-account client. */
  readonly clientId: string;
  /** Secret: never logged, returned or placed in an error. */
  readonly clientSecret: string;
  /** Upper bound of every request, token requests included. */
  readonly requestTimeoutMs?: number;
  /** Replaces the global `fetch`, for tests that fake the transport. */
  readonly fetch?: typeof fetch;
}

const DEFAULT_TIMEOUT_MS = 10_000;
/** A token is renewed this long before Keycloak says it expires. */
const TOKEN_RENEWAL_MARGIN_MS = 30_000;
const ISSUER_PATH = /^(.*)\/realms\/([^/]+)$/;

type Failure = { readonly ok: false; readonly failure: IdentityProviderFailure };
type Answer = { readonly ok: true; readonly status: number; readonly response: Response } | Failure;

const unavailable: Failure = { ok: false, failure: 'unavailable' };
const rejected: Failure = { ok: false, failure: 'rejected' };

/** 5xx and 429 leave the outcome unknown; any other unexpected status is a definite refusal. */
function unexpected(status: number): Failure {
  return status >= 500 || status === 429 ? unavailable : rejected;
}

function field(value: unknown, name: string): unknown {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)[name]
    : undefined;
}

/** The fields IAM reads from a Keycloak UserRepresentation, or undefined when it is malformed. */
function toIdentity(representation: unknown): ExternalIdentity | undefined {
  const subject = field(representation, 'id');
  const username = field(representation, 'username');
  const enabled = field(representation, 'enabled');
  const emailVerified = field(representation, 'emailVerified') ?? false;
  const owners = field(field(representation, 'attributes'), 'vertexUserId') ?? [];
  if (
    typeof subject !== 'string' ||
    subject === '' ||
    typeof username !== 'string' ||
    typeof enabled !== 'boolean' ||
    typeof emailVerified !== 'boolean' ||
    !Array.isArray(owners) ||
    !owners.every((owner) => typeof owner === 'string')
  ) {
    return undefined;
  }
  return { subject, username, enabled, emailVerified, vertexUserIds: [...owners] };
}

/** `…/admin/realms/<realm>/users/<id>` → `<id>`; anything else is undefined. */
function createdSubject(location: string | null, realm: string): string | undefined {
  if (location === null || !URL.canParse(location)) return undefined;
  const segments = new URL(location).pathname.split('/');
  const id = segments.at(-1);
  const expected = ['admin', 'realms', encodeURIComponent(realm), 'users'];
  return id && segments.slice(-5, -1).join('/') === expected.join('/')
    ? decodeURIComponent(id)
    : undefined;
}

async function discard(response: Response): Promise<void> {
  try {
    await response.body?.cancel();
  } catch {
    // Nothing to release.
  }
}

async function readJson(response: Response): Promise<{ ok: true; value: unknown } | Failure> {
  try {
    return { ok: true, value: await response.json() };
  } catch {
    return unavailable;
  }
}

/**
 * IAM's identity-provider adapter over the Keycloak Admin REST API, acting as the
 * `vertex-provisioner` service account. It performs exactly the operations of the
 * `IdentityProvider` port (spec Section 7.2) and nothing else, although the account's
 * `manage-users` role would allow more (IAM-R01 D-14).
 *
 * No result or error carries a response body, request URL, header or email: Keycloak messages and
 * `fetch` errors (which name the URL, and so the searched email) are replaced by the categories of
 * IAM-R02 D-05 (spec Section 36).
 */
export function createKeycloakIdentityProvider(
  options: KeycloakIdentityProviderOptions,
): IdentityProvider {
  const match = ISSUER_PATH.exec(new URL(options.issuer).href.replace(/\/$/, ''));
  if (!match?.[1] || !match[2]) {
    throw new Error('The Keycloak issuer must have the form <origin>/realms/<realm>.');
  }
  const issuer = match[0];
  const realm = match[2];
  const adminBase = `${match[1]}/admin/realms/${match[2]}`;
  const tokenEndpoint = `${issuer}/protocol/openid-connect/token`;
  const fetchImpl = options.fetch ?? fetch;
  const timeoutMs = options.requestTimeoutMs ?? DEFAULT_TIMEOUT_MS;

  let cachedToken: { readonly value: string; readonly renewAt: number } | undefined;

  async function send(url: string, init: RequestInit): Promise<Response | undefined> {
    try {
      return await fetchImpl(url, {
        ...init,
        redirect: 'manual',
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      // Network error, abort or timeout: the outcome is unknown. The error names the URL.
      return undefined;
    }
  }

  async function token(): Promise<{ ok: true; value: string } | Failure> {
    if (cachedToken && cachedToken.renewAt > Date.now())
      return { ok: true, value: cachedToken.value };
    const response = await send(tokenEndpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: options.clientId,
        client_secret: options.clientSecret,
      }),
    });
    if (!response) return unavailable;
    if (response.status !== 200) {
      await discard(response);
      return unexpected(response.status);
    }
    const body = await readJson(response);
    if (!body.ok) return body;
    const value = field(body.value, 'access_token');
    const expiresIn = field(body.value, 'expires_in');
    if (typeof value !== 'string' || typeof expiresIn !== 'number') return unavailable;
    cachedToken = { value, renewAt: Date.now() + expiresIn * 1000 - TOKEN_RENEWAL_MARGIN_MS };
    return { ok: true, value };
  }

  /** One Admin API request. A 401 with a cached token renews the token and retries once. */
  async function admin(
    method: 'GET' | 'POST' | 'PUT',
    path: string,
    body?: unknown,
    retried = false,
  ): Promise<Answer> {
    const bearer = await token();
    if (!bearer.ok) return bearer;
    const headers: Record<string, string> = { authorization: `Bearer ${bearer.value}` };
    if (body !== undefined) headers['content-type'] = 'application/json';
    const response = await send(`${adminBase}${path}`, {
      method,
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (!response) return unavailable;
    if (response.status === 401 && !retried) {
      await discard(response);
      cachedToken = undefined;
      return admin(method, path, body, true);
    }
    return { ok: true, status: response.status, response };
  }

  const userPath = (subject: string) => `/users/${encodeURIComponent(subject)}`;

  /** Reads the full representation of one user: 404 is `undefined`. */
  async function readUser(
    subject: string,
  ): Promise<{ ok: true; value: Record<string, unknown> | undefined } | Failure> {
    const answer = await admin('GET', userPath(subject));
    if (!answer.ok) return answer;
    if (answer.status === 404) {
      await discard(answer.response);
      return { ok: true, value: undefined };
    }
    if (answer.status !== 200) {
      await discard(answer.response);
      return unexpected(answer.status);
    }
    const body = await readJson(answer.response);
    if (!body.ok) return body;
    if (typeof body.value !== 'object' || body.value === null || Array.isArray(body.value)) {
      return unavailable;
    }
    return { ok: true, value: body.value as Record<string, unknown> };
  }

  /** An operation whose success is 204 and whose target may be gone (404). */
  async function command(
    method: 'POST' | 'PUT',
    path: string,
    body: unknown,
  ): Promise<{ ok: true; value: 'done' | 'not-found' | 'bad-request' } | Failure> {
    const answer = await admin(method, path, body);
    if (!answer.ok) return answer;
    await discard(answer.response);
    if (answer.status === 204) return { ok: true, value: 'done' };
    if (answer.status === 404) return { ok: true, value: 'not-found' };
    if (answer.status === 400) return { ok: true, value: 'bad-request' };
    return unexpected(answer.status);
  }

  return Object.freeze({
    issuer,

    async findBySubject(subject: string): Promise<ProviderResult<ExternalIdentity | undefined>> {
      const user = await readUser(subject);
      if (!user.ok) return user;
      if (user.value === undefined) return { ok: true, value: undefined };
      const identity = toIdentity(user.value);
      return identity ? { ok: true, value: identity } : unavailable;
    },

    async findByUsername(
      username: NormalizedEmail,
    ): Promise<ProviderResult<ExternalIdentity | undefined>> {
      const query = new URLSearchParams({
        username,
        exact: 'true',
        briefRepresentation: 'false',
        max: '2',
      });
      const answer = await admin('GET', `/users?${query.toString()}`);
      if (!answer.ok) return answer;
      if (answer.status !== 200) {
        await discard(answer.response);
        return unexpected(answer.status);
      }
      const body = await readJson(answer.response);
      if (!body.ok) return body;
      if (!Array.isArray(body.value)) return unavailable;
      const identities = body.value.map(toIdentity);
      if (identities.some((identity) => identity === undefined)) return unavailable;
      const matches = identities.filter((identity) => identity?.username === username);
      return { ok: true, value: matches[0] };
    },

    async create(identity: { readonly username: NormalizedEmail; readonly vertexUserId: UserId }) {
      const answer = await admin('POST', '/users', {
        username: identity.username,
        email: identity.username,
        enabled: true,
        emailVerified: false,
        attributes: { vertexUserId: [identity.vertexUserId] },
      });
      if (!answer.ok) return answer;
      await discard(answer.response);
      if (answer.status === 409)
        return { ok: true as const, value: { outcome: 'duplicate' as const } };
      if (answer.status !== 201) return unexpected(answer.status);
      // The new user's ID is the last segment of the Location header. Keycloak builds its origin
      // from its own hostname setting, so only the path is checked.
      const subject = createdSubject(answer.response.headers.get('location'), realm);
      if (subject === undefined) return unavailable;
      return { ok: true as const, value: { outcome: 'created' as const, subject } };
    },

    async setEnabled(subject: string, enabled: boolean) {
      // A full-representation update, so attributes such as vertexUserId are kept.
      const user = await readUser(subject);
      if (!user.ok) return user;
      if (user.value === undefined) return { ok: true as const, value: 'not-found' as const };
      const result = await command('PUT', userPath(subject), { ...user.value, enabled });
      if (!result.ok) return result;
      if (result.value === 'bad-request') return rejected;
      return {
        ok: true as const,
        value: result.value === 'done' ? ('updated' as const) : ('not-found' as const),
      };
    },

    async terminateSessions(subject: string) {
      const result = await command('POST', `${userPath(subject)}/logout`, undefined);
      if (!result.ok) return result;
      if (result.value === 'bad-request') return rejected;
      return {
        ok: true as const,
        value: result.value === 'done' ? ('terminated' as const) : ('not-found' as const),
      };
    },

    async enrolledFactors(subject: string) {
      const answer = await admin('GET', `${userPath(subject)}/credentials`);
      if (!answer.ok) return answer;
      if (answer.status === 404) {
        await discard(answer.response);
        return { ok: true as const, value: 'not-found' as const };
      }
      if (answer.status !== 200) {
        await discard(answer.response);
        return unexpected(answer.status);
      }
      const body = await readJson(answer.response);
      if (!body.ok) return body;
      if (!Array.isArray(body.value)) return unavailable;
      const types = body.value.map((credential) => field(credential, 'type'));
      return {
        ok: true as const,
        value: { password: types.includes('password'), otp: types.includes('otp') },
      };
    },

    async sendInvitation(
      subject: string,
      request: { readonly actions: readonly InvitationAction[]; readonly lifespanSeconds: number },
    ) {
      const query = new URLSearchParams({ lifespan: String(request.lifespanSeconds) });
      const result = await command(
        'PUT',
        `${userPath(subject)}/execute-actions-email?${query.toString()}`,
        request.actions,
      );
      if (!result.ok) return result;
      const value =
        result.value === 'done'
          ? ('sent' as const)
          : result.value === 'not-found'
            ? ('not-found' as const)
            : ('refused' as const);
      return { ok: true as const, value };
    },
  });
}
