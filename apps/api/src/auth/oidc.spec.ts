import { beforeEach, describe, expect, it } from 'vitest';
import {
  FAKE_CLIENT_ID,
  FAKE_CLIENT_SECRET,
  FAKE_ISSUER,
  FakeOidcProvider,
} from '../../test-support/fake-oidc-provider.js';
import type { AuthConfig } from '../config/auth-config.js';
import { checkIdTokenClaims, createOidcClient, type OidcClient } from './oidc.js';

const REDIRECT_URI = 'http://127.0.0.1:4300/api/auth/callback';

function oidcConfig(overrides: Partial<AuthConfig['oidc']> = {}): AuthConfig['oidc'] {
  return {
    issuer: FAKE_ISSUER,
    clientId: FAKE_CLIENT_ID,
    clientSecret: FAKE_CLIENT_SECRET,
    redirectUri: REDIRECT_URI,
    postLogoutRedirectUri: 'http://127.0.0.1:4300/',
    allowInsecureRequests: true,
    ...overrides,
  };
}

describe('OIDC client against a fake provider', () => {
  let provider: FakeOidcProvider;
  let oidc: OidcClient;

  beforeEach(async () => {
    provider = await FakeOidcProvider.start();
    oidc = createOidcClient(oidcConfig(), { fetch: provider.fetch });
  });

  async function signIn(options: Parameters<FakeOidcProvider['authorize']>[1] = {}) {
    const request = await oidc.authorizationRequest();
    if (!request.ok) throw new Error('authorization request failed');
    const callback = new URL(provider.authorize(request.value.url, options));
    return oidc.completeAuthorization({
      query: callback.search.slice(1),
      state: request.value.state,
      nonce: request.value.nonce,
      codeVerifier: request.value.codeVerifier,
    });
  }

  it('builds an authorization request with PKCE S256, state, nonce and the exact redirect URI', async () => {
    const request = await oidc.authorizationRequest();
    expect(request.ok).toBe(true);
    if (!request.ok) return;
    const url = new URL(request.value.url);
    expect(`${url.origin}${url.pathname}`).toBe(`${FAKE_ISSUER}/protocol/openid-connect/auth`);
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      client_id: FAKE_CLIENT_ID,
      response_type: 'code',
      scope: 'openid',
      redirect_uri: REDIRECT_URI,
      code_challenge_method: 'S256',
      state: request.value.state,
      nonce: request.value.nonce,
    });
    expect(url.searchParams.get('code_challenge')).not.toBe(request.value.codeVerifier);
    expect(url.searchParams.has('client_secret')).toBe(false);
  });

  it('returns the validated identity and the ID token, and drops access and refresh tokens', async () => {
    const result = await signIn({ subject: 'subject-1', sessionId: 'kc-session-1' });
    expect(result).toMatchObject({
      ok: true,
      value: { issuer: FAKE_ISSUER, subject: 'subject-1', idpSessionId: 'kc-session-1' },
    });
    expect(JSON.stringify(result)).not.toMatch(/sentinel-(access|refresh)/);
  });

  it.each([
    ['a wrong nonce', { idTokenClaims: { nonce: 'another-nonce' } }],
    ['a wrong issuer', { idTokenClaims: { iss: 'http://op.test/realms/other' } }],
    ['a foreign audience', { idTokenClaims: { aud: 'account-console', azp: 'account-console' } }],
    ['a foreign authorized party', { idTokenClaims: { aud: [FAKE_CLIENT_ID, 'x'], azp: 'x' } }],
    ['an expired token', { idTokenClaims: { exp: Math.floor(Date.now() / 1000) - 3600 } }],
    ['a signature by another key', { signWith: 'stranger' as const }],
    ['a missing nonce', { idTokenClaims: { nonce: undefined } }],
    ['an empty subject', { idTokenClaims: { sub: '' } }],
  ])('rejects an ID token with %s', async (_label, options) => {
    await expect(signIn(options)).resolves.toMatchObject({ ok: false, failure: 'rejected' });
  });

  it('rejects a callback whose state does not match the login attempt', async () => {
    await expect(signIn({ state: 'forged-state' })).resolves.toMatchObject({
      ok: false,
      failure: 'rejected',
    });
  });

  it('rejects an error response from the provider', async () => {
    await expect(signIn({ error: 'access_denied' })).resolves.toMatchObject({
      ok: false,
      failure: 'rejected',
    });
  });

  it('rejects a replayed authorization code', async () => {
    const request = await oidc.authorizationRequest();
    if (!request.ok) throw new Error('authorization request failed');
    const callback = new URL(provider.authorize(request.value.url));
    const input = {
      query: callback.search.slice(1),
      state: request.value.state,
      nonce: request.value.nonce,
      codeVerifier: request.value.codeVerifier,
    };
    await expect(oidc.completeAuthorization(input)).resolves.toMatchObject({ ok: true });
    await expect(oidc.completeAuthorization(input)).resolves.toMatchObject({
      ok: false,
      failure: 'rejected',
    });
  });

  it('reports provider outages and network failures as unavailable, without upstream detail', async () => {
    provider.tokenStatus = 503;
    const outage = await signIn();
    expect(outage).toMatchObject({ ok: false, failure: 'unavailable' });
    expect(JSON.stringify(outage)).not.toContain('upstream failure');

    const offline = createOidcClient(oidcConfig(), {
      fetch: async () => {
        throw new TypeError('fetch failed');
      },
    });
    await expect(offline.authorizationRequest()).resolves.toMatchObject({
      ok: false,
      failure: 'unavailable',
    });
  });

  it('retries discovery after a failure', async () => {
    provider.offline = true;
    await expect(oidc.authorizationRequest()).resolves.toMatchObject({ ok: false });
    provider.offline = false;
    await expect(oidc.authorizationRequest()).resolves.toMatchObject({ ok: true });
  });

  it('builds the end-session URL with the hint, the client and the post-logout URI', async () => {
    const url = new URL((await oidc.endSessionUrl('id-token-hint')) ?? '');
    expect(`${url.origin}${url.pathname}`).toBe(`${FAKE_ISSUER}/protocol/openid-connect/logout`);
    expect(Object.fromEntries(url.searchParams)).toEqual({
      client_id: FAKE_CLIENT_ID,
      post_logout_redirect_uri: 'http://127.0.0.1:4300/',
      id_token_hint: 'id-token-hint',
    });
    provider.offline = true;
    const offline = createOidcClient(oidcConfig(), { fetch: provider.fetch });
    await expect(offline.endSessionUrl(undefined)).resolves.toBeUndefined();
  });

  describe('logout tokens', () => {
    it('accepts a valid token and returns its session and subject', async () => {
      const token = await provider.logoutToken({ sid: 'kc-session-9', sub: 'subject-9' });
      await expect(oidc.verifyLogoutToken(token)).resolves.toEqual({
        ok: true,
        value: { sessionId: 'kc-session-9', subject: 'subject-9' },
      });
    });

    it('accepts a subject-only token', async () => {
      const token = await provider.logoutToken({ sid: undefined, sub: 'subject-9' });
      await expect(oidc.verifyLogoutToken(token)).resolves.toEqual({
        ok: true,
        value: { sessionId: undefined, subject: 'subject-9' },
      });
    });

    it.each([
      ['no events claim', { events: undefined }],
      ['the wrong event', { events: { 'http://example.test/other': {} } }],
      ['a nonce', { nonce: 'n' }],
      ['neither sid nor sub', { sid: undefined, sub: undefined }],
      ['a foreign audience', { aud: 'account-console' }],
      ['a foreign authorized party', { azp: 'account-console' }],
      ['a wrong issuer', { iss: 'http://op.test/realms/other' }],
      ['an old iat', { iat: Math.floor(Date.now() / 1000) - 3600, exp: undefined }],
      ['no jti', { jti: undefined }],
    ])('rejects a token with %s', async (_label, claims) => {
      const token = await provider.logoutToken(claims);
      await expect(oidc.verifyLogoutToken(token)).resolves.toMatchObject({
        ok: false,
        failure: 'rejected',
      });
    });

    it('rejects a token signed by another key, and garbage', async () => {
      await expect(
        oidc.verifyLogoutToken(await provider.logoutToken({}, 'stranger')),
      ).resolves.toMatchObject({ ok: false, failure: 'rejected' });
      await expect(oidc.verifyLogoutToken('not-a-jwt')).resolves.toMatchObject({
        ok: false,
        failure: 'rejected',
      });
    });
  });
});

describe('checkIdTokenClaims', () => {
  const expected = { issuer: FAKE_ISSUER, clientId: FAKE_CLIENT_ID };
  const valid = { iss: FAKE_ISSUER, aud: FAKE_CLIENT_ID, sub: 'subject' };

  it('binds issuer, audience, authorized party and subject', () => {
    expect(checkIdTokenClaims(valid, expected)).toBe(true);
    expect(
      checkIdTokenClaims(
        { ...valid, aud: [FAKE_CLIENT_ID, 'other'], azp: FAKE_CLIENT_ID },
        expected,
      ),
    ).toBe(true);
    expect(checkIdTokenClaims({ ...valid, iss: `${FAKE_ISSUER}/` }, expected)).toBe(false);
    expect(checkIdTokenClaims({ ...valid, aud: 'other' }, expected)).toBe(false);
    expect(checkIdTokenClaims({ ...valid, azp: 'other' }, expected)).toBe(false);
    expect(checkIdTokenClaims({ ...valid, sub: 'x'.repeat(256) }, expected)).toBe(false);
  });
});
