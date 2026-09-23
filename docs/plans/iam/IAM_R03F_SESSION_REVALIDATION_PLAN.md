# IAM-R03F — Session Re-validation Against the Identity Provider (IAM-CP1 fix run)

**Status:** IN_PROGRESS  
**Master Plan stages:** fix run for the `IAM-CP1` blocking finding (IAM-MP-05, IAM-MP-06 scope)  
**Risk tier:** A (reviewers: security; data and concurrency; tests and verification)  
**Branch:** `iam/r03f-session-revalidation`  
**Baseline commit:** `fbd607dbaf60ae980dcef32d34822bb030abc47d`

---

## 1. Objective

Close `IAM-CP1` CP1-01: identity-provider-side logout, recovery and disablement must reach a Vertex application session for its whole lifetime (SECURITY Section 11), not only while the Keycloak SSO session happens to survive its 1800 s idle timeout. The API keeps the refresh token of each session encrypted server-side and, whenever the session's idle deadline would slide, refreshes the Keycloak session with it. A successful refresh keeps the Keycloak session alive, so back-channel logout keeps reaching Vertex; a refused refresh revokes the Vertex session. The run also restores the regression evidence the audit found missing (CP1-02, CP1-12), pins the realm's SSO limits in the contract test (CP1-10), corrects the documentation the audit named (CP1-16), and makes the R03 decisions and the Master Plan ledger match the result.

## 2. Scope

**In scope**

- Refresh-token storage (encrypted, purpose-bound key), a migration adding its columns and a revocation reason.
- Re-validation in the session service: claim, refresh at Keycloak outside any transaction, apply the result; revocation when Keycloak refuses.
- The OIDC client's refresh operation, the fake provider's refresh grant, and the tests at every layer that prove the behavior, including real Keycloak after its SSO idle timeout has passed.
- CP1-02, CP1-10, CP1-12, CP1-16; the realm-contract brute-force flake found in preflight (D-12).
- R03 plan revision notes (D-05, D-15, D-17, Done means 7), README, `.env.example` wording, OpenAPI if a contract changes, and the Master Plan ledger.

**Out of scope**

- Every other `IAM-CP1` finding: they stay with the owner stages the audit record names.
- Protected-by-default routing and the authorization context (IAM-MP-07).
- Suspension, disablement and termination in Vertex (IAM-MP-10); rate limiting and session-row retention (IAM-MP-15).
- Changing the realm's SSO limits (D-01 rejects that route).

## 3. Inputs

Specification: `docs/modules/iam.md` Sections 13, 14, 27, 31, 32, 33, 34–36, 39; `docs/SECURITY.md` Sections 10 and 11; `docs/TESTING.md` Section 67; Master Plan Section 7 (invariants 2, 10, 17) and the IAM-MP-05 and IAM-MP-06 sections; `IAM_R03_SESSIONS_AND_OIDC_PLAN.md` Sections 4–5 and 10; the audit record `audits/IAM-CP1.md`.

Carried-forward items and their resolution:

| Item | Resolution |
|---|---|
| CP1-01 (Blocking): Keycloak-side logout, recovery and disablement stop reaching Vertex once the SSO session idles out | Re-validation by refresh (D-01 to D-08); proven against real Keycloak after the SSO idle timeout and its grace window have passed (D-10). |
| CP1-02 (Major): the auth-flow log scan cannot fail; the Keycloak journey's scan misses bare secrets | Both scans collect every secret the suite handles and assert over the full capture (D-11). |
| CP1-10 (Minor): realm SSO limits asserted as upper bounds | Asserted as exactly 1800 and 36000 (D-11). |
| CP1-12 (Minor): evidence scans depend on test order; `afterAll` asserts before cleanup | Scans run in `afterAll` after cleanup, over the whole suite's capture (D-11). |
| CP1-16 (Minor): README probe ranges and logout description; R03 Done means 7 | Corrected (D-13). |
| Audit record: "the R03 D-15 and D-05 texts and the ledger's recovery-signal claim must match the result" | Revision notes in the R03 plan and the ledger text (D-13). |
| Preflight discovery: `realm-contract.integration.spec.ts` brute-force test failed once on CI (PR #8 run 35900698174) | Root-caused and fixed in the same file as CP1-10 (D-12). |

## 4. Decisions

- **D-01 Mechanism: refresh, not a longer SSO idle.** SECURITY Section 11 accepts back-channel logout "or an equivalent re-validation mechanism". Raising the realm's SSO idle above the application limits needs a documented risk decision (an owner decision) and would still leave a gap for a session unused past it. Userinfo or introspection would detect a dead Keycloak session but would not keep it alive, so back-channel logout would still stop arriving. Refreshing does both: it keeps the SSO session alive while the Vertex session is used, and a refusal proves the Keycloak session or identity is gone. Spec Section 14 permits "encrypted server-side token material only when required for OIDC lifecycle behavior"; this is that case.
- **D-02 The idle deadline slides only on a successful refresh.** A session's idle deadline moves only when Keycloak has just refreshed its session, so the Vertex session can never be valid while its Keycloak session is idle-expired. The effective idle limit is the smaller of the application's and the realm's; the two stay equal by default (R03 D-05), and a mismatch fails closed. A session with no refresh token (a row created before this run, or a provider that returned none) never slides and ends at its current idle deadline.
- **D-03 Refresh interval = touch interval (60 s).** The existing sliding interval becomes the re-validation interval: at most one Keycloak refresh per active session per minute. It also bounds how long a Keycloak-side change that sends no back-channel logout (for example disabling the identity) takes to reach an active session. The cost is one token-endpoint call per active user per minute, negligible for an internal tool.
- **D-04 One refresher per interval (claim, refresh, apply).** A single conditional statement claims the touch by moving `last_seen_at` (live row, last seen before the interval). Only the winner calls Keycloak; concurrent requests use the stored deadlines. The realm rotates refresh tokens (`revokeRefreshToken: true`, reuse 0), so two refreshers with one token would kill the session; the claim prevents that. The result is applied by a second conditional statement that never revives, extends or writes token material into a revoked or expired row.
- **D-05 Outcomes of a refresh.**
  - *Refreshed:* slide the idle deadline from the claim time, store the rotated refresh token and the refreshed ID token. A refreshed ID token must pass the R03 D-08 claim checks and carry the session's stored `sid`, otherwise the refresh counts as refused.
  - *Refused* (any answer other than unavailability, such as `invalid_grant` for an ended or expired session, a disabled identity, or a reused token): revoke the session with the new reason `PROVIDER_SESSION_ENDED`, system actor `iam.session-check`, Audit evidence in the revocation's transaction, and answer `401 AUTH_SESSION_INVALID` with the cookie cleared. No new error code (spec Section 27 already covers it).
  - *Unavailable* (network, timeout, 5xx, 429): the session stays valid until its current idle deadline, which does not move; a structured log line records the category; the next interval retries. A Keycloak outage therefore ends sessions within one idle period instead of ending them all at once, and during the outage Keycloak cannot end sessions either.
  - A refresh that succeeded at Keycloak but whose apply failed (database error, process stop) leaves the old token, so the next refresh is refused and the session ends: fail-closed, recorded as a residual.
- **D-06 Storage.** New nullable columns `refresh_token_ciphertext` and `refresh_token_key_version`, set together (check constraint), encrypted like the ID token (R03 D-17: AES-256-GCM, random IV, row ID as additional data) with a key derived under its own HKDF `info` (`vertex-os/auth/refresh-token/v1`), so one token's ciphertext never decrypts as the other. Discarded wherever the ID token is: revocation, an expired session when seen, and the bounded sweep. The migration is additive: two columns, one check, one enum value.
- **D-07 No Keycloak I/O inside a transaction (invariant 10).** Claim and apply are single statements; revocation runs its own transaction after the refresh call returned.
- **D-08 Logout.** Logout still ends the Keycloak session through the end-session endpoint with the (now refreshed) ID token (R03 D-17); the refresh token is discarded with the revocation. SECURITY Section 11's "associated tokens SHOULD be revoked at the identity provider" is met by ending the Keycloak session, which invalidates its refresh tokens.
- **D-09 Recovery signal (revises R03 D-15).** A self-service reset with "sign out from other devices" now reaches Vertex for the whole session lifetime, because the Keycloak session stays alive while the Vertex session is used. A Keycloak session that ended without a back-channel call is detected at the next refresh. A reset without that option still keeps both sessions (unchanged).
- **D-10 Real-Keycloak evidence.** A dedicated integration spec with its own Keycloak container lowers that realm's SSO idle through the Admin API (test only; the committed realm is unchanged), because Keycloak's idle expiry follows Keycloak's clock and adds a fixed grace window (about 120 s) before it treats a session as expired. It proves: (a) a Vertex session used across more than the SSO idle plus the grace window keeps its Keycloak session, and a Keycloak-side logout then revokes it; (b) a Keycloak session that ended silently (left unused past its idle timeout while the Vertex session is still within its own) is detected at the next request and revoked; (c) disabling the Keycloak identity revokes an active session at the next refresh. The API's clock is injected to cross the 60 s interval; waiting on Keycloak's clock is the behavior under test, so the waits are justified under TESTING Section 67, and they poll where possible.
- **D-11 Evidence scans (CP1-02, CP1-10, CP1-12).** Each suite captures every log line it produces and collects every secret it handles: session secrets, CSRF tokens, login handles, state, nonce and PKCE verifier (from the fake provider or the authorization URL), refresh and ID tokens, the client and encryption secrets. `afterAll` first closes the app and stops the containers (in `finally`), then asserts over the whole capture, so no test can empty it and the result does not depend on which tests ran first. The A2-01 test inspects its own slice of the capture instead of clearing it. The realm contract asserts `ssoSessionIdleTimeout` 1800 and `ssoSessionMaxLifespan` 36000 exactly.
- **D-12 The brute-force flake.** The failure showed `numFailures` 5 with `disabled` false at the fifth spaced failure. Root cause and fix are recorded in Section 5 once found; the fix must not weaken the assertion that the fifth spaced failure locks the identity and earlier ones do not.
- **D-13 Documentation.** README: the `lint:boundaries` ranges come from the script; logout returns the post-logout URI when the API ended the Keycloak session and the end-session URL only as a fallback; the re-validation behavior. The R03 plan gains revision notes on D-05, D-15, D-17 and Done means 7 (history stays readable, the text stays true). `.env.example` explains that the effective idle limit is the smaller of the application's and the realm's.

No owner decision is needed: D-01 takes the route the canonical documents already allow and does not change any item under "Changes Requiring Explicit Approval" (the migration is additive; the authentication architecture stays the BFF of ARCHITECTURE Section 22).

## 5. Design notes

- **Session row additions:** `refresh_token_ciphertext text NULL`, `refresh_token_key_version int NULL`, check `auth_session_refresh_token_ck` (both null or both set); enum value `PROVIDER_SESSION_ENDED`.
- **Store operations:** `claimRevalidation({ id, now, seenBefore })` → boolean (sets `last_seen_at` only); `applyRevalidation({ id, now, idleExpiresAt, refreshToken, idToken })` → boolean, conditional on the row being live at `now`. They replace `touch`: no session slides without a refresh.
- **OIDC client:** `refreshSession(refreshToken)` → `OidcResult<{ refreshToken, idToken, idpSessionId }>` using `openid-client`'s refresh-token grant with the discovery configuration of R03 D-07 (signature checks on the returned ID token); failures map through the existing `unavailable`/`rejected` categories. `completeAuthorization` also returns the refresh token.
- **Failure semantics:** see D-05. Structured log fields carry categories only (`auth: 'session-revalidated' | 'session-revalidation-refused' | 'session-revalidation-unavailable'`), never a token, session identifier or subject.

### Discoveries during the run

(recorded as they happen)

## 6. Done means

1. A Vertex session that is used keeps its Keycloak session alive past the SSO idle timeout and its grace window, and a Keycloak-side logout then revokes it through back-channel logout (real Keycloak). *(CP1-01; SECURITY Section 11; MP-06 exit 7.)*
2. A Keycloak session that ended without a back-channel call, and a disabled Keycloak identity, end the Vertex session at its next re-validation, with reason `PROVIDER_SESSION_ENDED`, Audit evidence and `401 AUTH_SESSION_INVALID` (real Keycloak). *(CP1-01.)*
3. The idle deadline slides only after a successful refresh; concurrent requests cause one refresh; a Keycloak outage keeps the session until its current idle deadline without sliding it; a revoked or expired session never receives token material or a new deadline (PostgreSQL and fake provider). *(MP-05 exit 1, 3.)*
4. The refresh token is stored only encrypted under its own key purpose, never reaches the browser, a log line or an Audit record, and is discarded when the session is revoked or expires. *(Invariants 2, 17; SECURITY Section 11.)*
5. No Keycloak call runs inside a PostgreSQL transaction. *(Invariant 10.)*
6. Both log-leak scans fail when a session secret, CSRF token, login handle, state, nonce, PKCE verifier, token, client secret or encryption secret is logged, and pass on the unmutated code; they run after cleanup and independently of test order. *(CP1-02, CP1-12.)*
7. The realm contract pins the SSO limits to 1800 and 36000; the brute-force test is deterministic. *(CP1-10; D-12.)*
8. README, `.env.example`, the R03 plan's revised decisions and the Master Plan ledger state what the code does. *(CP1-16.)*

## 7. Stop conditions

- Keycloak 26.7.4 cannot keep an SSO session alive through the refresh-token grant, or refuses a refresh in a way that cannot be told apart from unavailability.
- The fix would need an identity-provider token in the browser, a realm SSO limit above the application limits, or a destructive migration.

## 8. Verification

- `pnpm nx run @vertex-os/api:test` (session service, OIDC client, cipher) and `@vertex-os/api:test:integration` (session store and the flow against PostgreSQL and the fake provider; the Keycloak journeys; the new re-validation spec; the realm contract), repeated for the new real-Keycloak spec and the realm contract.
- `@vertex-os/database:test:integration` (migration and constraints).
- Mutation checks for Done means 6: a logged session secret and a logged refresh token each make the scans fail; the unmutated code passes.
- `pnpm lint:boundaries`; `pnpm verify`; `pnpm openapi:generate` if a contract changes.
- CI: `verify:full` and `deps:audit` on the pull request.

## 9. Checklist

- [ ] M1 Plan committed
- [ ] M2 Migration, schema, store (claim, apply, token discard), cipher purpose; PostgreSQL tests
- [ ] M3 OIDC refresh operation, session-service re-validation, `requireSession` outcome; unit and fake-provider tests
- [ ] M4 Real-Keycloak re-validation spec (D-10)
- [ ] M5 Evidence scans (CP1-02, CP1-12), realm SSO limits (CP1-10), brute-force flake (D-12)
- [ ] M6 Documentation (CP1-16, R03 revision notes, README, `.env.example`); `pnpm verify` and integration suites green
- [ ] M7 In-run review (three reviewers); findings resolved
- [ ] M8 Master Plan ledger, hand-off, pull request, CI green

## 10. Hand-off

(written at the end of the run)
