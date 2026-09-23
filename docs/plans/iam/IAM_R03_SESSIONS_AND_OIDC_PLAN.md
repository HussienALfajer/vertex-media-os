# IAM-R03 — Application Sessions, OIDC Login, First Activation, CSRF & Logout

**Status:** COMPLETE  
**Master Plan stages:** IAM-MP-05, IAM-MP-06  
**Risk tier:** A (reviewers: security; data and concurrency; architecture and boundaries)  
**Branch:** `iam/r03-sessions-and-oidc`  
**Baseline commit:** `aef601fec11000e6bd4c557b0b5b5427f9c41567`

---

## 1. Objective

Give the API the backend-owned authentication lifecycle of spec Sections 13–15 and 32–33. Opaque, hashed, expiry-bounded and revocable application sessions live in PostgreSQL, owned by a focused authentication area in `apps/api/src/auth` that is not IAM domain state. The API runs the OIDC Authorization Code Flow with PKCE against the real `vertex-web` client, validates every protocol element, resolves the identity through a new IAM sign-in capability (issuer + subject only, concurrency-safe first activation, denial of unmapped and inactive users), and issues only an opaque `__Host-` session cookie. CSRF synchronizer tokens protect every unsafe cookie-authenticated request, logout revokes the session and the API ends the Keycloak session at the end-session endpoint, and a validated back-channel logout revokes the matching sessions. Real PostgreSQL and real Keycloak tests prove it, and the HTTP runtime's logging is made safe for persistence (A2-01) and for OIDC callback URLs.

## 2. Scope

**In scope**

- `auth_session` and `auth_login_attempt` tables, a migration, and a scoped `@vertex-os/database/auth` entry that only `apps/api/src/auth` may import.
- Session service: token generation and hashing, idle and absolute expiry, sliding refresh, revocation (single, per user, per identity-provider session), session rotation on sign-in, the CSRF proof, encrypted ID-token storage for the server-side end of the Keycloak session.
- IAM: `findByIdentity`, a version-checked first-activation write, the public `signIn` and `resolveSessionUser` capabilities with Audit evidence.
- OIDC: `openid-client` for discovery, authorization URL, code exchange and ID-token validation; `jose` for logout-token validation.
- Endpoints of spec Section 25.1: `GET /api/auth/login`, `GET /api/auth/callback`, `GET /api/auth/session`, `GET /api/auth/csrf`, `POST /api/auth/logout`, `POST /api/auth/backchannel-logout`, with Problem Details codes of spec Section 27 and OpenAPI entries.
- A global CSRF guard for unsafe methods, fail-closed with an explicit exemption for the back-channel endpoint.
- Typed auth configuration, `.env.example`, `pnpm env:setup`, README.
- Logging: A2-01 fix; request URLs logged without query strings.
- Boundary lint: A-04 ban of the OIDC libraries in the domain core, the `@vertex-os/database/auth` restriction, probes.
- Integration tests: PostgreSQL (store, expiry, concurrency, first activation races) and real Keycloak (login with TOTP, denials, protocol rejection, logout, back-channel logout).

**Out of scope**

- Protected-by-default routing and the authorization context (IAM-MP-07). This run's guard covers unsafe methods only (CSRF), and `GET /api/auth/session` resolves its own user.
- Suspension, disablement, termination and administrator revoke-sessions (IAM-MP-10); they call the revocation capability this run provides.
- Frontend login and session UX (IAM-MP-12); browser-level cookie behavior in Chromium/Firefox/WebKit.
- Rate limiting of session endpoints (SECURITY Section 37): carried forward to IAM-MP-15.
- Session-row retention and purging of expired sessions: carried forward to IAM-MP-15.

## 3. Inputs

Specification: `docs/modules/iam.md` Sections 6.2, 7.1, 10, 13–15, 24–27, 30–36, 39, 43–44, 46.5–46.6, 50, 55 (IAM-3), 56; `docs/SECURITY.md` Sections 7, 10, 11, 17, 19, 25, 27, 37; `docs/ARCHITECTURE.md` Section 22; `docs/ENGINEERING.md` Sections 6, 14–16; Master Plan Section 7 and the IAM-MP-05 and IAM-MP-06 sections; `IAM_R02_IDENTITY_RECONCILIATION_PLAN.md` Section 10.

Carried-forward items and their resolution:

| Item | Resolution |
|---|---|
| A2-01 (Nest `Logger` writes raw `Error` messages and stack strings) and API statement-timeout sizing | Fixed and proven with real P2007 and validation errors (D-20). Statement timeout stays 1 s (D-21). |
| Security events (sign-in denials; IAM-02 Section 40) | Audit records with `SUCCEEDED`/`REFUSED`, plus structured log lines with categories only (D-14). |
| A-04 (ban the OIDC runtime library in the domain core) | `openid-client`, `oauth4webapi` and `jose` banned for `layer:domain`; probe proves it (D-19). |
| Request-URL logging (`?code=…&state=…`) | Custom `req` serializer logs the path only; a test proves no code or state in logs (D-20). |
| Typed OIDC configuration (R01 D-11) | `loadAuthConfig` (D-16). |
| Audience binding | `aud` must contain and `azp`, when present, must equal `vertex-web` for ID and logout tokens (D-08, D-12). |
| Back-channel logout reachability | Testcontainers exposes the test API to Keycloak (`host.testcontainers.internal`), proven on Linux CI; the local Compose value is proven with a manual probe on Docker Desktop (D-13). |
| Cookie scoping | Decided in D-06: cookie names cannot collide; the local-only sharing with Keycloak is recorded. |
| MFA in browser tests | The Keycloak journey enrols TOTP through the real invitation flow with the R02 helpers; no bypass (D-22). |
| Identity provisioning not mounted; first activation decides by `accessState` only | `signIn` reads `accessState` only (D-09). Provisioning stays unmounted. |
| SSO limits (realm idle 1800 s, max 36000 s) | Application defaults equal them; no realm change (D-05). |
| Recovery and Vertex sessions (R02) | The observable signal is Keycloak's back-channel logout when the reset ends the user's other sessions (D-15). |

## 4. Decisions

- **D-01 Ownership and layout.** Sessions and login attempts are platform authentication state in `apps/api/src/auth` (spec Sections 6.2, 14, 43; MODULES). Their tables use the prefix `auth_` and the Prisma models `Auth*`; `@vertex-os/database/auth` exposes a client scoped to `auth*` models, lint-restricted to `apps/api/src/auth/**`. IAM gains only identity resolution and first activation. No new Nx project: the area is one consumer inside the application.
- **D-02 No foreign keys to IAM.** `auth_session.user_id` is a plain UUID. Users are never hard-deleted (invariant 12), and a cross-owner foreign key would couple the platform table to IAM's schema. The session never stores roles, permissions or access state.
- **D-03 Secrets.** The session secret is 32 bytes from `crypto.randomBytes`, base64url in the cookie; the row stores its SHA-256 (unique). Login-attempt handles are the same. A fast hash is sufficient for 256-bit random values. Raw values never reach a log, a response body, an Audit record or the database.
- **D-04 Expiry.** `idle_expires_at = min(now + idle, absolute_expires_at)`, `absolute_expires_at = created_at + absolute`. A session is valid when not revoked and both deadlines are in the future. Validation slides the idle deadline only when at least 60 s have passed since `last_seen_at`, with a conditional update that never revives an expired or revoked row. Time comes from an injected clock (tests) that defaults to the system clock.
- **D-05 Limits.** Defaults: idle 1800 s (allowed 300–3600), absolute 36000 s (3600–86400, at least idle), login attempt 600 s (60–1800). The defaults equal the realm's SSO idle and maximum, so SECURITY Section 11 holds without a realm change. `.env.example` states that lowering them below the realm values requires lowering the realm.
- **D-06 Cookies.** Session: `__Host-vertex-session`, `Secure; HttpOnly; SameSite=Strict; Path=/`, no `Domain`, no `Max-Age` (server-side expiry is authoritative). Login attempt: `__Host-vertex-login`, `Secure; HttpOnly; SameSite=Lax; Path=/; Max-Age=<attempt timeout>`. Spec Section 14 fixes `Path=/` and prefers the host prefix, so the cookies cannot be narrowed to `/api`. Their names cannot collide with Keycloak's (`KEYCLOAK_*`, `KC_*`, `AUTH_SESSION_ID`). Locally, Keycloak (127.0.0.1:8080) shares the host with the web origin, so the browser also sends these cookies to the local Keycloak, which ignores them; production deployment design must give Keycloak its own host. Cookies are parsed and serialized by a small helper for these two names; no cookie plugin.
- **D-07 OIDC library.** `openid-client` 6 (built on `oauth4webapi` and `jose`, maintained, certified) runs discovery (lazy, cached, retried on the next request after a failure), builds the authorization URL (`scope=openid`, S256 challenge, `state`, `nonce`), exchanges the code with the client secret and validates the ID token (signature, `iss`, `aud`, `exp`, `iat`, `nonce`, `state`, the RFC 9207 `iss` response parameter). Plain `http` issuers are allowed only outside production. Every request has a 10 s timeout. It is a production dependency of `apps/api` only; the architecture (AC-13) already mandates OIDC, so the library does not change architecture.
- **D-08 Callback validation.** Beyond the library: `aud` contains `vertex-web`, `azp` absent or `vertex-web`, `sub` non-empty, `iss` equals the configured issuer. The callback URL is rebuilt from the configured redirect URI plus the request's query string, never from `Host`. The ID token's `sid` is kept as the identity-provider session ID.
- **D-09 IAM sign-in capability.** `signIn(deps, { issuer, subject, traceId })` resolves exactly one user by issuer + subject, never by email. Unmapped: `unmapped`, Audit `REFUSED` with a system actor. `SUSPENDED`, `DISABLED`, `TERMINATED`: `inactive`; records `identitySyncState = FAILED` (version-checked; skipped when already `FAILED`) with an Audit `REFUSED` record in the same transaction (spec Section 13 step 9). `INVITED`: a version-checked `INVITED → ACTIVE` write setting `firstActivatedAt` and `lastAccessStateChangedAt`, with Audit evidence; a lost race re-reads and re-applies steps 9–10 to the committed state, at most three attempts, then `conflict` (deny). `ACTIVE`: `signed-in`. `identitySyncState` and `invitationDeliveryState` never decide access. `resolveSessionUser` (D-11) and `resolveIdentityUser` (back-channel logout by subject, D-12) complete the public surface. The API composes them in `apps/api/src/iam/sign-in.ts` and hands the authentication area bound functions only, never IAM's repository or transaction runner (*revised after review F1*).
- **D-10 Session establishment ordering.** The callback runs: consume the login attempt (one statement, single use), code exchange (no transaction open), `signIn` (IAM transaction), create the session with its Audit record (auth transaction). A restriction committed between `signIn` and the session insert is caught because every session use re-checks the user (D-11).
- **D-11 Session use.** Resolving a request's session checks the row (D-04) and then the user through IAM `resolveSessionUser`: only `ACTIVE` continues. Any other state revokes the session (`ACCESS_REVOKED`, Audited) and answers `403 IAM_USER_INACTIVE`. No authorization snapshot is cached across requests (invariant 11).
- **D-12 Back-channel logout.** `POST /api/auth/backchannel-logout` (form body, `logout_token`) verifies with `jose` against the realm JWKS: signature (RS256), `iss`, `aud` = `vertex-web`, `azp` if present, `iat` within 5 min (30 s tolerance), `jti`, the back-channel `events` member, no `nonce`, and `sid` or `sub`. It revokes sessions by `sid` when present, otherwise every session of the user bound to `iss` + `sub`. It is idempotent, answers `200` with an empty body, `400 {"error":"invalid_request"}` for any invalid token, `Cache-Control: no-store`, and records one Audit entry per revoked session (reason `BACKCHANNEL_LOGOUT`) and a structured log line for rejected tokens. A form-body parser accepts `application/x-www-form-urlencoded` for this route only; every other route answers `415`, and the route itself refuses a JSON body (*review S-04*).
- **D-13 Back-channel reachability.** Local Compose keeps `http://host.docker.internal:3000/…` (Docker Desktop forwards it to host loopback; proven by a manual probe and recorded). Tests expose the API's port with `TestContainers.exposeHostPorts` and pass `http://host.testcontainers.internal:<port>/…` to the realm import, so the call arrives on Linux CI without binding the API beyond loopback.
- **D-14 Audit and security events.** Source module `iam`, target `iam.user`/user ID, never a session ID, token, cookie or email. Actions: `iam.session.established` (SUCCEEDED), `iam.session.revoked` (SUCCEEDED; after: `reason`), `iam.user.first-activated` (SUCCEEDED; access state before/after), `iam.user.sign-in-refused` (REFUSED; access state, identity sync state before/after). Unmapped identities: `iam.identity.sign-in-refused` (REFUSED), actor `SYSTEM` `iam.sign-in`, target `iam.identity`/subject when it matches the target-ID grammar, else `invalid`. The user is the actor of the events they cause (sign-in, activation, logout, replacement); revocations the system decides use a system actor: `iam.backchannel-logout` for logout tokens, `iam.session-check` when a session's user is no longer ACTIVE (D-11). Each record commits in the transaction of the state change it describes. Structured logs carry outcome categories only.
- **D-15 Recovery signal.** When a self-service reset ends the user's other Keycloak sessions (the reset form's "sign out from other devices", on by default), Keycloak sends back-channel logout for them, which revokes the Vertex sessions. That is the only recovery signal Vertex can observe in V1; a user who clears that option keeps their sessions. An integration test proves the default path.
- **D-16 Configuration.** `loadAuthConfig(source)` in `apps/api/src/config` maps `KEYCLOAK_ISSUER_URL`, `KEYCLOAK_WEB_CLIENT_ID` (default `vertex-web`), `KEYCLOAK_WEB_CLIENT_SECRET`, `KEYCLOAK_WEB_REDIRECT_URI`, `KEYCLOAK_WEB_POST_LOGOUT_REDIRECT_URI`, the three timeouts (D-05) and `AUTH_TOKEN_ENCRYPTION_SECRET`. `https` is required for every URI in production. `createApp(config, auth, options)` receives it; `loadAppConfig` and the reference-sync command stay unchanged. Errors name variables, never values.
- **D-17 ID-token storage and the end of the Keycloak session.** *Revised after review S-01*: returning an end-session URL with `id_token_hint` handed the ID token to browser code (invariant 2). The API instead posts `id_token_hint`, `client_id` and `post_logout_redirect_uri` to the end-session endpoint itself, after the revocation committed, and returns the post-logout URI; Keycloak ends the session without asking (proven against the real realm). When that call fails, the browser receives the end-session URL without any token, where Keycloak asks for confirmation; without discovery, the post-logout URI. The ID token is the only token kept; access and refresh tokens are discarded at the callback. It is stored AES-256-GCM encrypted with a key derived by HKDF-SHA256 from `AUTH_TOKEN_ENCRYPTION_SECRET` (purpose-bound `info`), a random 96-bit IV, the session row ID as additional data and a key version (`1`). It is cleared when the session is revoked, when an expired session is next seen, and by a bounded sweep on each new sign-in (SECURITY Section 11; *review D-2*). Decryption failure (a rotated secret) makes logout proceed without the hint. PKCE verifiers and nonces in login attempts are stored in plain form: they live at most 10 minutes, are deleted on use, and a verifier is useless without the authorization code and the client secret.
- **D-18 CSRF.** The token is `base64url(HMAC-SHA256(session secret, "vertex-os/csrf/v1"))`: random through the session secret, bound to the session, stable across tabs, and rotated with the session. The row stores its SHA-256. `GET /api/auth/csrf` (valid session) returns it; unsafe methods require it in `X-CSRF-Token`, compared by hash with `timingSafeEqual`. A global guard rejects every unsafe request without a valid session (`401`) or proof (`403 CSRF_VALIDATION_FAILED`), except routes marked `@CsrfExempt()` (only back-channel logout). Safe methods never change state other than the sliding idle refresh.
- **D-19 Boundaries.** A-04: `openid-client`, `oauth4webapi` and `jose` join `layer:domain`'s banned imports, with a probe. `@vertex-os/database/auth` joins the restricted patterns; `apps/api` allows it only under `src/auth/**`; probes prove a rejection elsewhere in `apps/api` and in `domains/iam`.
- **D-20 Logging.** `PinoLoggerService` logs an `Error` as `err` with `safeErrorSerializer(error).message` as the message, and drops the raw stack string of Nest's `error(message, stack)` form (`stackOmitted: true`). `main.ts` writes startup failures through `safeErrorSerializer`. Fastify's `req` serializer logs method, path without query, and request ID only. Tests prove it with real P2007 and validation errors and with a callback URL carrying code and state sentinels.
- **D-21 Statement timeout.** Every auth and sign-in statement is a primary-key or unique-index lookup, a single-row write, or a housekeeping batch bounded to 200 rows outside any transaction (*revised after review D-1*: an unbounded purge in the attempt's transaction could exceed the bound and block every sign-in), so the API's 1 s statement bound and 2 s connect bound stay; the comment in `DatabaseModule` records why. Reporting-type queries revisit it.
- **D-22 Test placement.** Session store and service tests run against PostgreSQL in `apps/api` (`test:integration`), IAM sign-in store operations in `domains/iam-persistence`, the capability with fakes in `domains/iam`. The full journey runs in `apps/api` with real PostgreSQL, Keycloak and Mailpit, the application listening on loopback, and the fetch-based `Browser` helper standing in for the browser (it records every response body and URL the browser receives, so token absence is asserted).
- **D-23 Callback outcomes.** The callback always ends in `303` to the web origin: `/` on success, `/?authError=<code>` otherwise, with codes `AUTH_ACCESS_DENIED` (unmapped or inactive; one code, so the browser learns nothing about the account), `AUTH_LOGIN_FAILED` (missing, expired or mismatched attempt, IdP error response, token validation failure, sign-in conflict) and `IDENTITY_PROVIDER_UNAVAILABLE`. The login cookie is always cleared. An unexpected failure (database, Audit) is logged and also ends in `AUTH_LOGIN_FAILED`, never a 500 page (*review*). A sign-in in a browser that holds a valid session revokes the old one (`REPLACED`) after the new one is created.
- **D-24 JSON contracts.** `GET /api/auth/session` → `{ user: { id, email, displayName }, session: { idleExpiresAt, absoluteExpiresAt } }`. `GET /api/auth/csrf` → `{ token }`. `POST /api/auth/logout` → `{ logoutUrl }`, never carrying a token (D-17). OpenAPI declares the session cookie scheme and the `X-CSRF-Token` header (*review F9*). Failures: `401 AUTHENTICATION_REQUIRED` (no cookie), `401 AUTH_SESSION_INVALID` (unknown or revoked), `401 AUTH_SESSION_EXPIRED`, `403 IAM_USER_INACTIVE`, `403 CSRF_VALIDATION_FAILED`; an invalid session cookie is cleared. All auth responses carry `Cache-Control: no-store`.

No owner decision is needed: every item follows the specification or the accepted architecture.

## 5. Design notes

- **`auth_session`:** `id` (uuid), `token_hash` (text, unique), `csrf_token_hash`, `user_id` (uuid, indexed), `idp_session_id` (text, nullable, indexed), `created_at`, `last_seen_at`, `idle_expires_at`, `absolute_expires_at`, `revoked_at`, `revocation_reason` (enum `LOGOUT`, `BACKCHANNEL_LOGOUT`, `ACCESS_REVOKED`, `REPLACED`; later stages add values), `id_token_ciphertext`, `id_token_key_version`. Checks: revoked pair both null or both set; `idle_expires_at <= absolute_expires_at`; hashes are 43-character base64url; ciphertext and key version together.
- **`auth_login_attempt`:** `id`, `handle_hash` (unique), `state`, `nonce`, `code_verifier`, `created_at`, `expires_at`. Consumption is `DELETE … WHERE handle_hash = $1 RETURNING`, so concurrent callbacks consume it at most once; expired rows are deleted when a new attempt starts.
- **Revocation capability** (for IAM-MP-10): `revokeUserSessions(userId, reason, attribution)` revokes every live session of a user in one statement and appends one Audit record per revoked session in the same transaction; revocation is monotonic (`revoked_at` is set once).
- **IAM store additions:** `ApplicationUserRepository.findByIdentity(issuer, subject)`; `UserIdentityStore.recordFirstActivation({ id, expectedVersion })` succeeds only from `INVITED` at that version.
- **Error safety:** openid-client and jose errors are mapped to `unavailable` (network, timeout, 5xx) or `rejected`; only the category and a library error code matching a safe grammar are logged.

### Discoveries during the run

- **openid-client does not check the ID token's signature by default.** For an ID token from the token endpoint it relies on TLS (OIDC Core 3.1.3.7). The specification requires the signature check, so discovery enables `enableNonRepudiationChecks`; the unit test with a token signed by another key fails without it.
- **Nest registered its own body parsers for every route.** `FastifyAdapter` adds JSON and form parsers (1 MiB) at start-up, so every route parsed form bodies. The application now passes `bodyParser: false`: Fastify's built-in JSON parser (prototype-poisoning checks on) stays, and the form parser accepts only the back-channel route (D-12).
- **Fastify appends `set-cookie`.** A second `reply.header('set-cookie', …)` adds a value instead of replacing it, so each answer sets its cookies once.
- **Client credentials are form-encoded.** openid-client percent-encodes the Basic credentials (RFC 6749 Section 2.3.1), as Keycloak expects; the fake provider decodes them the same way.
- **Local back-channel reachability.** On Docker Desktop 4.65 (Windows) a container reached a server bound to `127.0.0.1` through `host.docker.internal` (probe with the pinned Keycloak image). Docker Engine on Linux has no such name by default; the README says so.
- **Recovery signal.** The reset form's "sign out from other devices" checkbox is on by default; a submission with it makes Keycloak send back-channel logout for the user's other sessions, which revokes the Vertex session (test). Without it, no signal reaches Vertex (D-15).
- **Nest's `error(message, stack)` form.** The stack string is dropped; the message string is the caller's own text and is kept, so application code logs errors as `err` objects only.

## 6. Done means

1. A real local Keycloak login (password and TOTP) through `/api/auth/login` and `/api/auth/callback` ends with only the `__Host-vertex-session` cookie; no response the browser receives contains an ID, access or refresh token, and the session row stores only hashes and the encrypted ID token. *(MP-06 exit 1, 2; MP-05 exit 1, 2.)*
2. A wrong or replayed state, a missing or foreign login cookie, an expired attempt, and ID tokens with a wrong nonce, issuer, audience, signature or expiry are rejected, with no session created. *(MP-06 exit 3.)*
3. An unmapped identity and SUSPENDED, DISABLED and TERMINATED users receive no session, and the inactive ones are recorded `identitySyncState = FAILED` with Audit evidence. *(MP-06 exit 4.)*
4. First activation sets ACTIVE and `firstActivatedAt` once; concurrent first sign-ins activate once; a restriction committed concurrently is never overwritten. *(MP-06 exit 5.)*
5. Sessions expire at the idle and absolute deadlines, slide only while valid, are unusable after revocation, and a revoked session never becomes valid again; a request whose user is no longer ACTIVE revokes the session. *(MP-05 exit 1, 3, 4.)*
6. Unsafe requests without a valid session or CSRF token, with a wrong token or a token of another session are rejected; logout requires the token. *(MP-06 exit 6; spec Section 46.6.)*
7. Logout revokes the session, clears the cookie and returns an end-session URL that ends the Keycloak session; a back-channel logout from Keycloak revokes the matching Vertex sessions, and an invalid logout token revokes nothing. *(MP-06 exit 7.)*
8. No log line contains a session secret, CSRF token, authorization code, state, nonce, PKCE verifier, token, client secret or the encryption secret; Nest `Logger` output of database errors contains no row data (A2-01).
9. Boundary lint rejects the OIDC libraries in `domains/iam` and `@vertex-os/database/auth` outside `apps/api/src/auth`; positive controls pass.
10. README, `.env.example`, `pnpm env:setup`, OpenAPI and the Master Plan are accurate.

## 7. Stop conditions

- Keycloak 26.7.4 cannot deliver back-channel logout to the test API through the Testcontainers host exposure, and no loopback-preserving alternative exists.
- Any design here would need identity-provider tokens in the browser or a relaxation of cookie security.

## 8. Verification

- `pnpm nx run @vertex-os/iam:test`, `@vertex-os/api:test`.
- `pnpm nx run @vertex-os/iam-persistence:test:integration`, `@vertex-os/database:test:integration`, `@vertex-os/api:test:integration`.
- `pnpm lint:boundaries`; `pnpm verify`; `pnpm openapi:generate`.
- Local probe: Compose Keycloak and the running API, a real login and a Keycloak-side logout reach the back-channel endpoint.
- CI: `verify:full` and `deps:audit` on the pull request.

## 9. Checklist

- [x] M1 Plan committed
- [x] M2 Database: `auth` schema, migration, scoped entry, lint restriction, migration and constraint tests
- [x] M3 IAM: `findByIdentity`, first-activation write, `signIn`, `resolveSessionUser`; unit and persistence tests
- [x] M4 Auth core: configuration, session store and service, cookies, CSRF, token cipher; PostgreSQL tests
- [x] M5 OIDC adapter, endpoints, guard, form parser, logging fixes (A2-01, request URL); API tests
- [x] M6 Real Keycloak journeys: login, activation, denials, protocol rejections, logout, back-channel, recovery
- [x] M7 Boundaries and probes, env setup, README, OpenAPI; `pnpm verify` and integration suites green
- [x] M8 In-run review (three reviewers); findings resolved
- [x] M9 Master Plan ledger, hand-off, pull request, CI green

## 10. Hand-off

**In-run review.** Three fresh-context reviewers checked `main...HEAD`: security; data and concurrency; architecture and boundaries. The implementer checked each finding's evidence before accepting it. The security reviewer re-checked the fix of its blocking finding.

- **Fixed in the run:**
  - S-01 (blocking): logout returned an end-session URL whose `id_token_hint` handed the ID token to browser code (invariant 2). The API now ends the Keycloak session itself (D-17); the real-Keycloak test shows the Keycloak session gone and no token in any API response.
  - F1, F2 (major): the authentication area held IAM's write-capable transaction runner; it now receives bound sign-in functions, and lint keeps adapters in `auth-runtime.ts` (probes V83, V84, C11). The OIDC library bans now cover subpath exports and web code (V85–V87).
  - D-1, D-2 (major): the expired-attempt purge was unbounded inside the attempt's transaction; expired sessions kept their ID token. Both are bounded sweeps now, and an expired session loses its ID token when seen (D-17, D-21).
  - S-03, S-04, D-4, D-5, D-6, D-7, F3, F4, F6, F7, F8, F9 and the callback's 500 on an unexpected failure (D-23).
  - From the security re-check: R-01 (a test for the end-session POST failing after discovery); the API counts the Keycloak session as ended only on a redirect to the post-logout URI; revoking the replaced session is best-effort once the new session exists.
- **Recorded, not changed:** S-02 (session rotation across sites) and D-3 (back-channel logout just before session creation), carried forward; S-05 (login attempts without rate limiting) joins the rate-limit item; F5 (Keycloak on its own host) is recorded in the Master Plan's production list; F10 (the added `resolveIdentityUser`) is recorded in D-09; F11 is fixed with F2.

**Carried forward** (attached to the Master Plan stages):

- **IAM-MP-07:** protected-by-default routing and the authorization context build on `requireSession` and the global `CsrfGuard`; bound capabilities only.
- **IAM-MP-10:** suspension, disablement, termination and administrator revoke-sessions call `revokeUserSessions` and add their revocation reasons.
- **IAM-MP-12:** the sign-in contracts; real-browser acceptance of the `__Host-` cookies on `http://127.0.0.1`; session rotation across sites (S-02).
- **IAM-MP-15:** rate limiting of session endpoints; session-row retention and a scheduled purge; the back-channel race before session creation (D-3).
- **Production deployment design:** Keycloak on its own host; the back-channel logout URL reachable from Keycloak (Docker Engine on Linux has no `host.docker.internal` by default).

**Local environment note.** `pnpm env:setup` appends the new `AUTH_*` keys and `KEYCLOAK_WEB_CLIENT_ID` to an existing `.env` without touching other keys and needs no volume reset. `pnpm db:migrate` applies `20260923190000_auth_sessions`. A local sign-in ends in `AUTH_ACCESS_DENIED` until a Vertex user exists for the identity, because nothing creates users yet (IAM-MP-10/11).
