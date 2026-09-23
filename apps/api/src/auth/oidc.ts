import {
  createRemoteJWKSet,
  customFetch as joseCustomFetch,
  decodeJwt,
  jwtVerify,
  type JWTPayload,
  type JWTVerifyGetKey,
} from 'jose';
import * as client from 'openid-client';
import type { AuthConfig } from '../config/auth-config.js';

/**
 * The `vertex-web` OIDC relying party (IAM-R03 D-07, D-08, D-12). `openid-client` performs
 * discovery, the authorization request, the code exchange and ID-token validation; `jose` validates
 * back-channel logout tokens against the realm's keys. Nothing here logs, and no failure carries
 * an upstream body, URL or token: callers see a category and, at most, a library error code.
 */
export interface OidcClient {
  /** The authorization URL and the secrets the login attempt must keep (spec Section 13 step 2). */
  authorizationRequest(): Promise<OidcResult<AuthorizationRequest>>;
  /** Validates the authorization response and exchanges the code (spec Section 13 step 6). */
  completeAuthorization(input: {
    /** The callback's query string, without `?`. */
    readonly query: string;
    readonly state: string;
    readonly nonce: string;
    readonly codeVerifier: string;
  }): Promise<OidcResult<AuthenticatedIdentity>>;
  /**
   * Ends the Keycloak session of a logged-out application session (spec Section 32). The API posts
   * the ID token to the end-session endpoint itself, so the token never reaches the browser
   * (invariant 2). Returns where the browser goes next: the post-logout URI when Keycloak ended
   * its session; otherwise the end-session URL without any token, where Keycloak asks the user to
   * confirm; or the post-logout URI when Keycloak cannot be reached at all.
   */
  endProviderSession(idTokenHint: string | undefined): Promise<ProviderLogout>;
  /**
   * Refreshes the Keycloak session behind an application session (IAM-R03F D-01): keeps it alive
   * while the application session is used, and proves it still exists. A refreshed ID token must
   * pass the D-08 claim checks, name the same identity-provider session, and name the subject of
   * the session's current ID token (OpenID Connect Core Section 12.2).
   */
  refreshSession(input: {
    readonly refreshToken: string;
    readonly idpSessionId: string | undefined;
    /** The session's current ID token, already validated when it was stored. */
    readonly idToken: string | undefined;
  }): Promise<OidcResult<RefreshedSession>>;
  verifyLogoutToken(token: string): Promise<OidcResult<LogoutTarget>>;
}

export interface AuthorizationRequest {
  readonly url: string;
  readonly state: string;
  readonly nonce: string;
  readonly codeVerifier: string;
}

/**
 * A validated identity. `idToken` is kept only encrypted, for `id_token_hint` (D-17), and
 * `refreshToken` only encrypted, for re-validation (IAM-R03F D-06).
 */
export interface AuthenticatedIdentity {
  readonly issuer: string;
  readonly subject: string;
  readonly idpSessionId: string | undefined;
  readonly idToken: string;
  readonly refreshToken: string | undefined;
}

/** The tokens of a refreshed session: the rotated refresh token and, when issued, a new ID token. */
export interface RefreshedSession {
  readonly refreshToken: string;
  readonly idToken: string | undefined;
}

export interface ProviderLogout {
  /** Whether Keycloak confirmed the end of its session to the API. */
  readonly ended: boolean;
  /** Where the browser navigates next; it never carries a token. */
  readonly browserUrl: string;
}

/** What a valid logout token asks to end: a Keycloak session, or every session of a subject. */
export type LogoutTarget =
  | { readonly sessionId: string; readonly subject: string | undefined }
  | { readonly sessionId: undefined; readonly subject: string };

/** `unavailable`: the identity provider could not be reached; `rejected`: anything invalid. */
export type OidcFailure = 'unavailable' | 'rejected';

export type OidcResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly failure: OidcFailure; readonly code?: string };

export interface OidcClientOptions {
  /** Replaces `fetch` for every identity-provider request; tests run a fake provider through it. */
  readonly fetch?: typeof fetch;
}

const TIMEOUT_SECONDS = 10;
const BACKCHANNEL_EVENT = 'http://schemas.openid.net/event/backchannel-logout';
const SAFE_CODE = /^[A-Z][A-Z0-9_]{2,63}$/;

/** Claims every ID token must satisfy beyond the library's checks (D-08). */
export function checkIdTokenClaims(
  claims: Readonly<Record<string, unknown>>,
  expected: { readonly issuer: string; readonly clientId: string },
): boolean {
  const audience = claims['aud'];
  const audiences = Array.isArray(audience) ? audience : [audience];
  const authorizedParty = claims['azp'];
  const subject = claims['sub'];
  return (
    claims['iss'] === expected.issuer &&
    audiences.includes(expected.clientId) &&
    (authorizedParty === undefined || authorizedParty === expected.clientId) &&
    typeof subject === 'string' &&
    subject.length > 0 &&
    subject.length <= 255
  );
}

/**
 * The OIDC Back-Channel Logout 1.0 rules (Section 2.6) that remain after the signature, `iss`,
 * `aud`, `iat` and required-claim checks: the event member, no `nonce`, `azp` bound to this
 * client, and a `sid` or `sub`.
 */
export function logoutTargetOf(payload: JWTPayload, clientId: string): LogoutTarget | undefined {
  const events = payload['events'];
  if (typeof events !== 'object' || events === null || Array.isArray(events)) return undefined;
  const event = (events as Record<string, unknown>)[BACKCHANNEL_EVENT];
  if (typeof event !== 'object' || event === null || Array.isArray(event)) return undefined;
  if ('nonce' in payload) return undefined;
  if (payload['azp'] !== undefined && payload['azp'] !== clientId) return undefined;
  const sessionId = bounded(payload['sid']);
  const subject = bounded(payload.sub);
  if (sessionId !== undefined) return { sessionId, subject };
  if (subject !== undefined) return { sessionId: undefined, subject };
  return undefined;
}

/** Verifies a logout token's signature and registered claims with `keys`, then its logout rules. */
export async function verifyLogoutTokenWith(
  token: string,
  keys: JWTVerifyGetKey,
  expected: { readonly issuer: string; readonly clientId: string },
): Promise<OidcResult<LogoutTarget>> {
  try {
    const { payload } = await jwtVerify(token, keys, {
      issuer: expected.issuer,
      audience: expected.clientId,
      algorithms: ['RS256'],
      requiredClaims: ['iat', 'jti', 'events'],
      maxTokenAge: 300,
      clockTolerance: 30,
    });
    const target = logoutTargetOf(payload, expected.clientId);
    return target === undefined ? { ok: false, failure: 'rejected' } : { ok: true, value: target };
  } catch (error) {
    return failureOf(error);
  }
}

export function createOidcClient(
  config: AuthConfig['oidc'],
  options: OidcClientOptions = {},
): OidcClient {
  const discoveryOptions: client.DiscoveryRequestOptions = {
    timeout: TIMEOUT_SECONDS,
    // By default openid-client trusts an ID token from the token endpoint on the strength of TLS
    // (OIDC Core 3.1.3.7) and does not check its signature. The specification requires the
    // signature check (spec Section 13 step 6), so it is enabled against the realm's JWKS.
    execute: [
      client.enableNonRepudiationChecks,
      ...(config.allowInsecureRequests ? [client.allowInsecureRequests] : []),
    ],
  };
  const customFetch = options.fetch;
  if (customFetch !== undefined) {
    discoveryOptions[client.customFetch] = (url, init) => customFetch(url, init as RequestInit);
  }
  const fetchImplementation: typeof fetch = customFetch ?? fetch;
  let discovered: Promise<client.Configuration> | undefined;
  let keys: JWTVerifyGetKey | undefined;

  /** Discovery once, cached; a failed discovery is retried by the next request. */
  function configuration(): Promise<client.Configuration> {
    discovered ??= client
      .discovery(
        new URL(config.issuer),
        config.clientId,
        undefined,
        client.ClientSecretBasic(config.clientSecret),
        discoveryOptions,
      )
      .catch((error: unknown) => {
        discovered = undefined;
        throw error;
      });
    return discovered;
  }

  async function logoutKeys(): Promise<JWTVerifyGetKey> {
    if (keys) return keys;
    const jwksUri = (await configuration()).serverMetadata().jwks_uri;
    if (jwksUri === undefined) throw new client.ClientError('The provider publishes no JWKS.');
    keys = createRemoteJWKSet(new URL(jwksUri), {
      timeoutDuration: TIMEOUT_SECONDS * 1000,
      ...(options.fetch === undefined ? {} : { [joseCustomFetch]: options.fetch }),
    });
    return keys;
  }

  const oidcClient: OidcClient = {
    async authorizationRequest(): Promise<OidcResult<AuthorizationRequest>> {
      try {
        const oidc = await configuration();
        const codeVerifier = client.randomPKCECodeVerifier();
        const state = client.randomState();
        const nonce = client.randomNonce();
        const url = client.buildAuthorizationUrl(oidc, {
          redirect_uri: config.redirectUri,
          scope: 'openid',
          response_type: 'code',
          code_challenge: await client.calculatePKCECodeChallenge(codeVerifier),
          code_challenge_method: 'S256',
          state,
          nonce,
        });
        return { ok: true, value: { url: url.href, state, nonce, codeVerifier } };
      } catch (error) {
        return failureOf(error);
      }
    },

    async completeAuthorization({ query, state, nonce, codeVerifier }) {
      try {
        const oidc = await configuration();
        // Rebuilt from the registered redirect URI, never from the request's Host header (D-08).
        const callback = new URL(config.redirectUri);
        callback.search = query;
        const tokens = await client.authorizationCodeGrant(oidc, callback, {
          pkceCodeVerifier: codeVerifier,
          expectedState: state,
          expectedNonce: nonce,
          idTokenExpected: true,
        });
        const claims = tokens.claims();
        const idToken = tokens.id_token;
        if (
          claims === undefined ||
          idToken === undefined ||
          !checkIdTokenClaims(claims, { issuer: config.issuer, clientId: config.clientId })
        ) {
          return { ok: false, failure: 'rejected', code: 'ID_TOKEN_CLAIMS' };
        }
        // The access token is dropped here: the API never uses it (D-17). The refresh token is kept
        // for re-validation (IAM-R03F D-01).
        return {
          ok: true,
          value: {
            issuer: claims.iss,
            subject: claims.sub,
            idpSessionId: bounded(claims['sid']),
            idToken,
            refreshToken: tokens.refresh_token,
          },
        };
      } catch (error) {
        return failureOf(error);
      }
    },

    async endProviderSession(idTokenHint: string | undefined): Promise<ProviderLogout> {
      let oidc: client.Configuration;
      try {
        oidc = await configuration();
      } catch {
        return { ended: false, browserUrl: config.postLogoutRedirectUri };
      }
      const endpoint = oidc.serverMetadata().end_session_endpoint;
      if (endpoint === undefined) return { ended: false, browserUrl: config.postLogoutRedirectUri };
      if (idTokenHint !== undefined) {
        try {
          // A form POST (OIDC RP-Initiated Logout 1.0 Section 2) keeps the token out of URLs.
          const response = await fetchImplementation(endpoint, {
            method: 'POST',
            headers: { 'content-type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
              id_token_hint: idTokenHint,
              client_id: config.clientId,
              post_logout_redirect_uri: config.postLogoutRedirectUri,
            }).toString(),
            redirect: 'manual',
            signal: AbortSignal.timeout(TIMEOUT_SECONDS * 1000),
          });
          await response.body?.cancel();
          // Keycloak confirms by redirecting to the registered post-logout URI; any other answer
          // (an error or a page for the user) leaves the session to the browser fallback.
          const location = response.headers.get('location');
          if (
            (response.status === 302 || response.status === 303) &&
            location !== null &&
            location.startsWith(config.postLogoutRedirectUri)
          ) {
            return { ended: true, browserUrl: config.postLogoutRedirectUri };
          }
        } catch {
          // Fall through: the browser ends the Keycloak session itself, with confirmation.
        }
      }
      return {
        ended: false,
        browserUrl: client.buildEndSessionUrl(oidc, {
          client_id: config.clientId,
          post_logout_redirect_uri: config.postLogoutRedirectUri,
        }).href,
      };
    },

    async refreshSession({ refreshToken, idpSessionId, idToken: current }) {
      try {
        const oidc = await configuration();
        const tokens = await client.refreshTokenGrant(oidc, refreshToken);
        const idToken = tokens.id_token;
        if (idToken !== undefined) {
          const claims = tokens.claims();
          const subject = subjectOf(current);
          if (
            claims === undefined ||
            !checkIdTokenClaims(claims, { issuer: config.issuer, clientId: config.clientId }) ||
            bounded(claims['sid']) !== idpSessionId ||
            subject === undefined ||
            claims.sub !== subject
          ) {
            return { ok: false, failure: 'rejected', code: 'ID_TOKEN_CLAIMS' };
          }
        }
        return {
          ok: true,
          // A provider that does not rotate refresh tokens leaves the current one valid (RFC 6749
          // Section 6); Keycloak rotates them (the realm's revokeRefreshToken).
          value: { refreshToken: tokens.refresh_token ?? refreshToken, idToken },
        };
      } catch (error) {
        return failureOf(error);
      }
    },

    async verifyLogoutToken(token: string) {
      let verifier: JWTVerifyGetKey;
      try {
        verifier = await logoutKeys();
      } catch (error) {
        return failureOf(error);
      }
      return verifyLogoutTokenWith(token, verifier, {
        issuer: config.issuer,
        clientId: config.clientId,
      });
    },
  };
  return Object.freeze(oidcClient);
}

/** The subject of a stored ID token; `undefined` when there is none or it cannot be read. */
function subjectOf(idToken: string | undefined): string | undefined {
  if (idToken === undefined) return undefined;
  try {
    return bounded(decodeJwt(idToken).sub);
  } catch {
    return undefined;
  }
}

function bounded(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 && value.length <= 255 ? value : undefined;
}

/**
 * Network failures, timeouts and provider 5xx answers are `unavailable`; everything else, including
 * every validation failure, is `rejected`. Only a code matching a strict grammar survives.
 */
function failureOf(error: unknown): { ok: false; failure: OidcFailure; code?: string } {
  const code = (error as { code?: unknown } | null)?.code;
  const safeCode = typeof code === 'string' && SAFE_CODE.test(code) ? { code } : {};
  return { ok: false, failure: isUnavailable(error) ? 'unavailable' : 'rejected', ...safeCode };
}

function isUnavailable(error: unknown): boolean {
  if (error instanceof TypeError) return true; // fetch: network failure
  if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
    return true;
  }
  const status = (error as { status?: unknown; cause?: { status?: unknown } } | null) ?? {};
  const statusCode = typeof status.status === 'number' ? status.status : status.cause?.status;
  if (typeof statusCode === 'number' && (statusCode >= 500 || statusCode === 429)) return true;
  const code = (error as { code?: unknown } | null)?.code;
  // openid-client reports a request that timed out or was aborted with these codes and the
  // `DOMException` as its cause: the provider did not answer, so nothing was refused (IAM-CP1
  // CP1-21). A refusal here would revoke every session that re-validates while Keycloak hangs.
  if (code === 'OAUTH_TIMEOUT' || code === 'OAUTH_ABORT') return true;
  // oauth4webapi's processing errors (other `OAUTH_*` codes) are validation failures, even when
  // their cause is a `TypeError` from decoding a malformed response (IAM-R03F review S-01).
  if (typeof code === 'string' && code.startsWith('OAUTH_')) return false;
  const cause = (error as { cause?: unknown } | null)?.cause;
  return cause !== undefined && cause !== error && cause instanceof Error && isUnavailable(cause);
}
