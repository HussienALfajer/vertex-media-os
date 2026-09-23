import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { exportJWK, generateKeyPair, SignJWT, type CryptoKey, type JWK } from 'jose';

/**
 * A minimal OpenID provider for tests, reached through the OIDC client's `fetch` hook: discovery,
 * JWKS, and a token endpoint that checks the client secret, the redirect URI and the PKCE
 * verifier. `authorize` plays the user's sign-in at the provider and returns the callback URL.
 * Every token it issues can be bent (claims, key, algorithm) to prove the relying party rejects it.
 */
export const FAKE_ISSUER = 'http://op.test/realms/vertex';
export const FAKE_CLIENT_ID = 'vertex-web';
export const FAKE_CLIENT_SECRET = 'fake-op-client-secret-0000000000';

export interface IssuedCode {
  readonly subject: string;
  readonly sessionId: string | undefined;
  readonly nonce: string;
  readonly challenge: string;
  readonly redirectUri: string;
  readonly idTokenClaims: Readonly<Record<string, unknown>>;
  readonly signWith: 'provider' | 'stranger';
}

export interface AuthorizeOptions {
  readonly subject?: string;
  readonly sessionId?: string;
  /** Replaces or removes (`undefined`) ID-token claims. */
  readonly idTokenClaims?: Readonly<Record<string, unknown>>;
  readonly signWith?: 'provider' | 'stranger';
  /** Overrides the `state` returned to the callback. */
  readonly state?: string;
  /** An authorization error instead of a code (`error=`). */
  readonly error?: string;
  /** Replaces the RFC 9207 `iss` response parameter, or removes it (`null`). */
  readonly iss?: string | null;
}

export class FakeOidcProvider {
  readonly issuer = FAKE_ISSUER;
  readonly requests: string[] = [];
  /** Every token and code this provider issued, so tests can prove none of them leaks. */
  readonly issued: string[] = [];
  /** Answers the next token request with this HTTP status (5xx: provider outage). */
  tokenStatus: number | undefined;
  /** Makes every request fail as a network error. */
  offline = false;
  /** ID tokens presented to the end-session endpoint by the relying party's server. */
  readonly endedSessions: string[] = [];
  /** Answers the next end-session request with this HTTP status, or fails it as a network error. */
  logoutStatus: number | 'network' | undefined;
  private readonly codes = new Map<string, IssuedCode>();

  private constructor(
    private readonly key: CryptoKey,
    private readonly jwk: JWK,
    private readonly strangerKey: CryptoKey,
  ) {}

  static async start(): Promise<FakeOidcProvider> {
    const own = await generateKeyPair('RS256', { extractable: true });
    const stranger = await generateKeyPair('RS256');
    const jwk = {
      ...(await exportJWK(own.publicKey)),
      kid: 'fake-op-key',
      alg: 'RS256',
      use: 'sig',
    };
    return new FakeOidcProvider(own.privateKey, jwk, stranger.privateKey);
  }

  get metadata(): Record<string, unknown> {
    return {
      issuer: this.issuer,
      authorization_endpoint: `${this.issuer}/protocol/openid-connect/auth`,
      token_endpoint: `${this.issuer}/protocol/openid-connect/token`,
      jwks_uri: `${this.issuer}/protocol/openid-connect/certs`,
      end_session_endpoint: `${this.issuer}/protocol/openid-connect/logout`,
      response_types_supported: ['code'],
      subject_types_supported: ['public'],
      id_token_signing_alg_values_supported: ['RS256'],
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['client_secret_basic'],
      authorization_response_iss_parameter_supported: true,
    };
  }

  /** The `fetch` to give the OIDC client. */
  readonly fetch: typeof fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    this.requests.push(`${init?.method ?? 'GET'} ${url.pathname}`);
    if (this.offline) throw new TypeError('fetch failed');
    const path = url.href.slice(this.issuer.length);
    if (path === '/.well-known/openid-configuration') return json(this.metadata);
    if (path === '/protocol/openid-connect/certs') return json({ keys: [this.jwk] });
    if (path === '/protocol/openid-connect/token') return this.token(init);
    if (path === '/protocol/openid-connect/logout' && init?.method === 'POST') {
      return this.endSession(init);
    }
    return new Response('not found', { status: 404 });
  };

  /** Plays the user's sign-in for an authorization URL the relying party produced. */
  authorize(authorizationUrl: string, options: AuthorizeOptions = {}): string {
    const request = new URL(authorizationUrl);
    const parameters = request.searchParams;
    const redirectUri = parameters.get('redirect_uri') ?? '';
    const callback = new URL(redirectUri);
    const state = options.state ?? parameters.get('state') ?? '';
    const iss =
      options.iss === undefined
        ? { iss: this.issuer }
        : options.iss === null
          ? {}
          : { iss: options.iss };
    if (options.error) {
      callback.search = new URLSearchParams({ error: options.error, state, ...iss }).toString();
      return callback.href;
    }
    const code = randomBytes(24).toString('base64url');
    this.codes.set(code, {
      subject: options.subject ?? randomUUID(),
      sessionId: 'sessionId' in options ? options.sessionId : randomUUID(),
      nonce: parameters.get('nonce') ?? '',
      challenge: parameters.get('code_challenge') ?? '',
      redirectUri,
      idTokenClaims: options.idTokenClaims ?? {},
      signWith: options.signWith ?? 'provider',
    });
    this.issued.push(code);
    callback.search = new URLSearchParams({ code, state, ...iss }).toString();
    return callback.href;
  }

  /** A back-channel logout token; `claims` replaces or removes (`undefined`) claims. */
  async logoutToken(
    claims: Readonly<Record<string, unknown>> = {},
    signWith: 'provider' | 'stranger' = 'provider',
  ): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    return this.sign(
      compact({
        iss: this.issuer,
        aud: FAKE_CLIENT_ID,
        iat: now,
        exp: now + 120,
        jti: randomUUID(),
        sub: randomUUID(),
        sid: randomUUID(),
        events: { 'http://schemas.openid.net/event/backchannel-logout': {} },
        ...claims,
      }),
      signWith,
    );
  }

  private endSession(init: RequestInit): Response {
    if (this.logoutStatus !== undefined) {
      const status = this.logoutStatus;
      this.logoutStatus = undefined;
      if (status === 'network') throw new TypeError('fetch failed');
      return new Response('logout page', { status });
    }
    const body = new URLSearchParams(String(init.body ?? ''));
    this.endedSessions.push(body.get('id_token_hint') ?? '');
    return new Response(null, {
      status: 302,
      headers: { location: body.get('post_logout_redirect_uri') ?? '/' },
    });
  }

  private async token(init: RequestInit | undefined): Promise<Response> {
    if (this.tokenStatus !== undefined) {
      const status = this.tokenStatus;
      this.tokenStatus = undefined;
      return new Response('upstream failure with detail', { status });
    }
    // RFC 6749 Section 2.3.1: both parts are form-urlencoded before Base64, as Keycloak decodes them.
    const [scheme, encoded] = (new Headers(init?.headers).get('authorization') ?? '').split(' ');
    const [id, secret] = Buffer.from(encoded ?? '', 'base64')
      .toString('utf8')
      .split(':')
      .map((part) => decodeURIComponent(part.replaceAll('+', ' ')));
    if (scheme !== 'Basic' || id !== FAKE_CLIENT_ID || secret !== FAKE_CLIENT_SECRET) {
      return json({ error: 'invalid_client' }, 401);
    }
    const body = new URLSearchParams(String(init?.body ?? ''));
    const issued = this.codes.get(body.get('code') ?? '');
    this.codes.delete(body.get('code') ?? '');
    if (!issued) return json({ error: 'invalid_grant' }, 400);
    const verifier = body.get('code_verifier') ?? '';
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    if (challenge !== issued.challenge || body.get('redirect_uri') !== issued.redirectUri) {
      return json({ error: 'invalid_grant' }, 400);
    }
    const now = Math.floor(Date.now() / 1000);
    const idToken = await this.sign(
      compact({
        iss: this.issuer,
        aud: FAKE_CLIENT_ID,
        azp: FAKE_CLIENT_ID,
        sub: issued.subject,
        sid: issued.sessionId,
        nonce: issued.nonce,
        iat: now,
        exp: now + 300,
        auth_time: now,
        ...issued.idTokenClaims,
      }),
      issued.signWith,
    );
    const accessToken = `sentinel-access-${randomBytes(12).toString('base64url')}`;
    const refreshToken = `sentinel-refresh-${randomBytes(12).toString('base64url')}`;
    this.issued.push(idToken, accessToken, refreshToken);
    return json({
      access_token: accessToken,
      refresh_token: refreshToken,
      token_type: 'Bearer',
      expires_in: 300,
      id_token: idToken,
    });
  }

  private sign(
    claims: Record<string, unknown>,
    signWith: 'provider' | 'stranger',
  ): Promise<string> {
    return new SignJWT(claims)
      .setProtectedHeader({ alg: 'RS256', kid: 'fake-op-key', typ: 'JWT' })
      .sign(signWith === 'provider' ? this.key : this.strangerKey);
  }
}

function compact(claims: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(claims).filter(([, value]) => value !== undefined));
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
