# IAM-R09 — Security, Concurrency and Operational Hardening (IAM-MP-15, part 1)

**Status:** IN_PROGRESS  
**Master Plan stages:** IAM-MP-15 (part 1 of 2; split by this planner, D-01)  
**Risk tier:** A (session effort `high`)  
**Branch:** `iam/r09-security-hardening`  
**Baseline commit:** `49e0b3344f4d5a6ee6df55d0bf89db5703c85f17`

## 1. Objective

Close the backend security, concurrency and operational items that earlier runs carried to IAM-MP-15, so the integrated system can be proven end to end by the next run. Rate limiting reaches the authentication endpoints, and the unauthenticated inputs that write security evidence are bounded. Session housekeeping stops depending on sign-in traffic, runs on indexed and race-safe statements, and ends with a retention purge. A back-channel logout that races a sign-in cannot leave a live session. The remaining lifecycle, authorization and HTTP items are fixed, and the race, CSRF and secret-scan test evidence is made discriminating. The real-browser journeys and the closeout move to `IAM-R09B`.

## 2. Scope

**In scope:** every IAM-MP-15 carried-forward item that is backend behavior or test evidence (Section 3), the §46.3 race list and the §46.6 CSRF list checked for discriminating tests with gaps filled, and the documentation those changes touch.

**Out of scope (moved to `IAM-R09B`, D-01):** the Playwright journeys against real Keycloak, PostgreSQL and the API (spec Section 46.7; R08B D-15, R08C D-14), three-engine `__Host-` cookies, session rotation across sites, CP1-17 (local Compose back-channel logout), the R08C catalog-bound revisit, the Keycloak policy verification map, the dependency audit, the Definition of Done map (spec Section 56), documentation synchronization across the module, the temporary-code sweep and the full closeout verification. No new permission, no new infrastructure, no change to the authorization model.

## 3. Inputs

Specification: `docs/modules/iam.md` Sections 14, 15, 23.1, 27, 30, 32–36, 39, 46.3, 46.6, 50, 51; `docs/SECURITY.md` Sections 11, 27, 28, 30, 37. Master Plan IAM-MP-15 section and Section 15 open items. Previous hand-off: `IAM_R08C_PRIVILEGE_ADMINISTRATION_PLAN.md` Section 10. Audit record: `audits/IAM-CP1.md`.

Carried-forward items → resolution:

| Item | Resolution |
|---|---|
| R03 rate limiting (S-05: each login stores an attempt) | D-03, D-04 |
| R03 retention of `auth_session` rows; scheduled purge | D-06, D-07 |
| R03 D-3 back-channel logout before session creation | D-08 |
| CP1-08 sweep scans the whole table, swallows failures | D-06, D-07 |
| CP1-09 race tests without a barrier | D-15 |
| CP1-11 no test of `pnpm env:setup` branches | D-17 |
| CP1-14 rejected or no-op back-channel logout leaves only a log line | D-05 |
| CP1-15 realm enables `delete_credential` | D-13 |
| CP1-22 sweep re-checks expiry only in its subquery | D-06 |
| CP1-23, CP1-24 log scans miss logout tokens and two login attempts | D-16 |
| CP1-25 no test that token material never reaches Audit | D-16 |
| CP1-27 expired-session tokens discarded only when next seen | D-07 |
| R04 D-15 unbounded denial evidence | D-04 |
| R06 SEC-5 reactivated permission widens ceiling-checked roles | D-12 |
| R06 SEC-6 revocation failure skips reconciliation | D-10 |
| R06 DC-4 actor authority read in two statements | D-11 |
| R07 SA-2 malformed JSON answers `400 BAD_REQUEST` | D-09 |
| R07 T-8 untested contention classes | D-18 |
| R07 trace IDs from client `X-Request-Id` | D-14 |
| R07 no-store on refusals | D-09 |
| R08B D-15, R08C D-14, R08 D-03 items, CP1-17, R08C D-08 | `IAM-R09B` (D-01) |

## 4. Decisions

- **D-01 Split.** IAM-MP-15 is split into `IAM-R09` (this run: backend and test evidence) and `IAM-R09B` (real-browser journeys, cross-engine cookies, closeout and the Definition of Done map), both Tier A. One pull request with both would not be reviewable in one careful pass (`docs/PLANNING.md` Section 5). `IAM-R09B` runs against the hardened endpoints, and `IAM-FINAL` follows it. Reviewers for `IAM-R09B`: security; tests and verification; architecture and boundaries.
- **D-02 Reviewers.** As the Master Plan names for `IAM-R09`: security; data and concurrency; tests and verification.
- **D-03 Rate limiting.** An in-process fixed-window limiter in `apps/api/src/auth`, keyed per client address, with a bounded key table (the oldest key is evicted first). No dependency and no shared store: V1 runs one API process (Master Plan Section 15, R03F DC-04). Buckets: `sign-in` counts `GET /api/auth/login` and `GET /api/auth/callback`; `logout` counts `POST /api/auth/logout`. Values are configuration (SECURITY Section 30): `AUTH_RATE_LIMIT_WINDOW_SECONDS` (default 60), `AUTH_RATE_LIMIT_SIGN_IN` (default 60 per window), `AUTH_RATE_LIMIT_LOGOUT` (default 30). The defaults leave room for an office behind one address. A limited login stores no attempt. Login and callback answer `303 /?authError=AUTH_RATE_LIMITED`, which the web app explains like the other sign-in failures. Logout answers `429 RATE_LIMITED` Problem Details with `Retry-After`. Back-channel logout is never limited for valid tokens (D-05).
- **D-04 Client address and evidence bound.** Fastify `trustProxy: 'loopback'`. The API listens on loopback behind the local reverse proxy, so `request.ip` is the address the proxy appended; a client cannot spoof it through a prepended `X-Forwarded-For`. `AUTH_EVIDENCE_LIMIT` (default 30 per window) bounds the Audit records written for input that anyone can repeat: authorization denials per user (R04 D-15) and rejected back-channel logout tokens per address (D-05). Beyond the bound, the request outcome is unchanged. The event stays in the log, and the first suppression in each window logs `evidence-limited`, which is the alert signal for SECURITY Section 28.3 ("unusual volumes of authorization denials").
- **D-05 Back-channel logout evidence (CP1-14).** Spec Section 33 asks for a security event. The endpoint records `iam.session.backchannel-logout`: SYSTEM actor `iam.backchannel-logout`, target `{ type: 'iam.oidc-client', id: <web client id> }`. A rejected or unverifiable token is recorded as `REFUSED` with `{ failure }`, within the D-04 bound. A valid token that matched no session is recorded as `SUCCEEDED` with `{ matched: 'none' }`. A valid token that revoked sessions is already evidenced by one `iam.session.revoked` record per session. No session identifier, subject or token enters the record (spec Section 35).
- **D-06 Race-safe sweep (CP1-22, CP1-08).** `idle_expires_at <= absolute_expires_at` is a table check, so a session has expired exactly when `idle_expires_at <= now`. Every sweep statement repeats its predicate in the outer `WHERE`, because PostgreSQL re-checks only that after a lock wait. A new index `auth_session_idle_expires_at_idx` serves the token sweep and the purge; the attempt sweep already has `auth_login_attempt_expires_at_idx`. The migration is additive and index-only. A failed sweep logs a warning with the safe database description, and the next run retries.
- **D-07 Scheduled housekeeping and retention (R03, CP1-27).** Housekeeping runs once a minute in the API process, independent of sign-in traffic. The server entry starts it; tests call it directly. Each run handles bounded batches: it deletes expired login attempts, discards the tokens of expired sessions, and deletes session rows whose idle deadline passed `AUTH_SESSION_RETENTION_DAYS` ago (default 30, range 1–365). Sessions are authentication infrastructure, not IAM entities (spec Sections 14, 29). Their establishment and revocation evidence stays in Audit, which is never purged. The sweep on each sign-in is removed. CP1-27 is reconciled in code and text together: a revocation discards tokens in its own statement (unchanged), and an expiry discards them within one housekeeping interval. SECURITY Section 11 is updated to state this bound.
- **D-08 Logout racing a sign-in (R03 D-3).** Back-channel logout remembers each verified `sid` in memory before it revokes. The memory expires after the login-attempt timeout and is bounded. `establish` checks the memory after its insert has committed; a remembered `sid` revokes the new session at once (`BACKCHANNEL_LOGOUT`), and the callback answers `AUTH_LOGIN_FAILED` without a session cookie. Proof of ordering: either the logout's `UPDATE` starts after the insert commits and sees the row, or it started before, so the `sid` was remembered before the check. A subject-only logout token is not remembered, because that would block the user's next sign-ins. The realm always sends `sid` (`backchannel.logout.session.required`), and R03F re-validation ends such a session within one interval of use.
- **D-09 HTTP refusals (SA-2, no-store).** A body the JSON parser refuses (malformed, empty with a JSON content type, or poisoned) answers `400 VALIDATION_FAILED` with `fields: ['body']` and echoes no value. Every Problem Details response carries `Cache-Control: no-store`, so the guard's 401 and 403 answers are never cached.
- **D-10 Restriction reconciles after a failed revocation (SEC-6).** The restriction commits first and denies access. If revoking the sessions then fails, reconciliation still disables the identity in Keycloak, and the revocation failure is rethrown afterwards. This is strictly more fail-closed; the sessions are already refused by the per-request access-state check.
- **D-11 One snapshot for actor authority (DC-4).** `readActorAuthority` reads the authorization facts and the System Administrator holding in one statement, the facts query with an `EXISTS` column.
- **D-12 Reactivated permissions (SEC-5).** No code change. A permission moves from `DEPRECATED` back to `ACTIVE` only through a released catalog change, applied by `pnpm iam:sync-reference`. That command writes an Audit record for the change. The grant ceiling correctly evaluates current ACTIVE state (spec Section 23.1). Whoever reactivates a permission reviews the roles that map it. This residual is recorded for `IAM-FINAL`.
- **D-13 Credential deletion (CP1-15).** The realm disables the `delete_credential` required action. A realm-contract test proves it is disabled. Against the pinned Keycloak it also proves that a signed-in user cannot delete their OTP credential through the account routes. The local Compose realm picks the change up only after the owner re-imports it (`Found`).
- **D-14 Trace IDs (R07).** No code change. A well-formed inbound `X-Request-Id` remains the correlation ID, and Audit `trace_id` is correlation, never attribution (`actor_user_id` comes from the session). The production proxy must set a fresh `X-Request-Id`, which is added to the production deployment open items in Master Plan Section 15.
- **D-15 Race evidence (CP1-09, spec Section 46.3).** Each race test named by CP1-09 is rebuilt so that it discriminates: one operation holds the contested row lock in a separate transaction while the other is provably waiting on it (`pg_stat_activity`), using the harness pattern of R05/R06. A mutation check, removing the guarding predicate or lock, shows the test failing. The rest of the Section 46.3 race list is mapped to existing discriminating tests in Section 8, and any gap found is filled.
- **D-16 Secret and evidence scans (CP1-23 to CP1-25, spec Section 46.6).** The fake-provider auth-flow scan collects every logout token it issues or forges and gains the JWT pattern. The two direct login attempts in `keycloak-login.integration.spec.ts` are collected. A test reads every `audit_record.change` and `reason` written by the session suites and finds no token material. The Section 46.6 CSRF list is mapped to tests, with any gap filled (Section 8).
- **D-17 `pnpm env:setup` tests (CP1-11).** A test in `apps/api/src/config/` runs a copy of the script in a temporary directory against a controlled `.env.example`. The `docker` call is replaced through a Node `--import` preload that patches `child_process` (`syncBuiltinESMExports`), so the script itself has no test seam. The test covers create, complete, append, shared-value refusal, volume-exists refusal and Docker-unavailable refusal.
- **D-18 Contention classes (T-8).** The database contention suite provokes lock-timeout (55P03), deadlock (40P01), serialization failure (40001) and Prisma's P2034 on real PostgreSQL, and asserts `isDatabaseContention`. If a class cannot be produced through the stack, the plan records why and a synthetic-shape test covers it.

No owner decisions. The run adds bounded behavior inside the accepted authentication architecture. It adds no infrastructure, no dependency and no authorization change. Its only public-contract changes are additive: a new `authError` value, a `429` answer on logout, and a new Audit action.

## 5. Design notes

- **Configuration.** The new `AUTH_*` values are optional with defaults, validated in `loadAuthConfig`, and listed in `.env.example`. The Playwright API environment needs none of them.
- **Limiter semantics.** `take(key)` answers allowed, or refused with the seconds left in the window. Keys are `<bucket>:<address>` and `<bucket>:<userId>`; nothing else is stored. The key table holds at most 10,000 entries.
- **Housekeeping result.** Each run returns its counts (attempts deleted, sessions whose tokens were discarded, rows purged) and logs one `info` line when any count is non-zero. Batches are 200 rows, with at most 10 batches per statement per run.
- **Audit actions.** `iam.session.backchannel-logout` is new. The existing `iam.session.revoked` and `iam.authorization.denied` are unchanged.
- **OpenAPI.** The login and callback descriptions list `AUTH_RATE_LIMITED`. Logout documents `429`. Every route's Problem Details answers document the no-store header only through the shared filter; no schema changes.

## 6. Done means

1. A client address beyond the sign-in or logout limit is refused as D-03 describes, and no login attempt is stored for a refused login. Values come from configuration. Proven by unit and API tests. (Master Plan: rate limiting; SECURITY Sections 30, 37.)
2. Denial and rejected-logout Audit records stop at the evidence bound while the answers stay the same; the suppression is logged. Proven by tests. (R04 D-15; CP1-14.)
3. A rejected token and a no-match token each leave one `iam.session.backchannel-logout` record without session identifiers, subjects or tokens. Proven against the fake provider. (CP1-14; spec Section 33.)
4. The sweep never clears the tokens of a session that a concurrent re-validation made live. A forced interleaving proves it, and a mutation (the outer predicate removed) fails the test. (CP1-22.)
5. Housekeeping runs without sign-in activity, uses the new indexes (checked with `EXPLAIN`), logs failures, discards expired tokens, and purges rows past retention. The retention boundary is proven by an integration test. (R03 retention; CP1-08; CP1-27.)
6. A back-channel logout that arrives between the code exchange and the session insert leaves no live session and no session cookie. Proven by a forced interleaving. (R03 D-3.)
7. Malformed JSON answers `400 VALIDATION_FAILED`, and every Problem Details answer carries `Cache-Control: no-store`. Proven by API tests. (SA-2; no-store.)
8. A revocation failure after a committed restriction still reconciles the identity. The actor's authority is one statement. Proven by tests. (SEC-6; DC-4.)
9. The realm's `delete_credential` is disabled, and the pinned Keycloak refuses OTP deletion by the user. Proven by the realm contract. (CP1-15.)
10. The CP1-09 race tests fail under their mutations. The Section 46.3 race list and the Section 46.6 CSRF list each map to a discriminating test. (CP1-09; spec Sections 46.3, 46.6.)
11. The log scans collect logout tokens and every login attempt, and no Audit `change` or `reason` holds token material. (CP1-23 to CP1-25.)
12. The `pnpm env:setup` branches and the four contention classes are covered by tests. (CP1-11; T-8.)
13. SECURITY Section 11 matches the implementation. The Master Plan records the split, the `IAM-R09B` stage items and the new production open items. `pnpm verify` and the integration suites of every touched project pass.

Master Plan IAM-MP-15 exit criteria served here: required concurrency races, CSRF and security-negative coverage, operational failure paths, secret and log review for the touched paths. The rest go to `IAM-R09B`.

## 7. Stop conditions

Only those of the Run Contract. If a Keycloak behavior makes D-13 or D-08 impossible as written, record the evidence and choose the closest fail-closed option. If that option changes the authentication architecture, stop.

## 8. Verification

- Narrow: `pnpm nx run @vertex-os/api:test`, `:test:integration`; `@vertex-os/iam:test`; `@vertex-os/iam-persistence:test:integration`; `@vertex-os/database:test:integration`; `@vertex-os/web:test`.
- Before review: `pnpm verify` plus the integration suites of `@vertex-os/api`, `@vertex-os/iam-persistence`, `@vertex-os/database` and `@vertex-os/audit-persistence`.
- Probes: `EXPLAIN` of each sweep statement shows the new index. Mutation checks for D-06, D-08 and D-15 show the tests failing without the fix.
- Section 46.3 map. Unique email, identity, membership, assignment and mapping, the primary department and the state checks: `domains/iam-persistence/src/constraints.integration.spec.ts`. Optimistic concurrency and rollback: `user-identity-store.integration.spec.ts` (rebuilt with held writes, D-15) and `apps/api/src/iam/administration.integration.spec.ts`. Last admin across administrators: `administration.integration.spec.ts` ("two concurrent removals from the last two ACTIVE holders") and `user-administration.integration.spec.ts` ("two concurrent suspensions of the last two holders", held user rows). First activation against a suspension: `user-identity-store.integration.spec.ts`, both orders, held (D-15). Concurrent bootstrap: `user-administration.integration.spec.ts` ("at most one candidate", held System Administrator row). Session revocation persistence: `apps/api/src/auth/sessions.integration.spec.ts`, including a revocation that meets an uncommitted revocation (D-15).
- Section 46.6 map: `apps/api/src/auth/auth-flow.integration.spec.ts`. Missing, wrong and foreign tokens, the valid token and the protected logout: "CSRF (spec Section 46.6)". Safe methods: "never changes state on safe methods". Callback state mismatch: "rejects a forged state, a replayed callback and a missing login cookie". Every mutating IAM route: `apps/api/src/iam/http/iam-http.integration.spec.ts` and `apps/api/src/auth/access.api.spec.ts`. No gap found.
- Contention classes (D-18): all four SQLSTATEs and both Prisma codes are produced on real PostgreSQL in `packages/database/src/database-contention.integration.spec.ts`. A raw statement reports 40P01 and 40001 under P2010; a typed query reports P2034.

## 9. Checklist

- [x] M0 Plan committed; Master Plan split recorded
- [x] M1 Limiter, configuration, trust proxy; login, callback and logout limits; web `AUTH_RATE_LIMITED`
- [x] M2 Evidence bound for denials; back-channel logout evidence (D-05)
- [x] M3 Migration (indexes); race-safe sweep; housekeeping with retention; sign-in sweep removed; SECURITY Section 11
- [x] M4 Back-channel logout racing a sign-in (D-08)
- [x] M5 SA-2 and no-store; SEC-6; DC-4
- [x] M6 Realm `delete_credential` and realm contract
- [x] M7 Test evidence: CP1-09, CP1-23 to CP1-25, CP1-11, T-8; Section 46.3 and 46.6 maps
- [x] M8 `pnpm verify` and integration suites; mutation checks
- [ ] M9 In-run review; fixes
- [ ] M10 Master Plan ledger and hand-off; pull request; CI

### 9.1 Deviations and discoveries

- **Token-sweep window (review DATA-1).** Retention keeps expired rows whose tokens are already gone, so `idle_expires_at <= now` matches almost the whole table in the steady state and the planner scans it; the first `EXPLAIN` test used data that cannot occur then. The session service now remembers the time of its last complete sweep and later runs read only the idle deadlines after it, less one hour against clock steps. A deadline only moves forward while the session is live, so nothing is skipped. A run that stops at its batch bound keeps the previous window, and a restarted process sweeps the whole retention window once. A partial index would express this without state, but the Prisma schema cannot declare it, and the migration drift check compares the two. The test now builds the steady state (many expired rows without tokens) and checks the plan of the windowed statement and of the purge.
- **Back-channel refusal evidence has one budget (review S-1).** D-04 keyed rejected logout tokens per address; anyone with many addresses could then append Audit records without bound. The budget is now process-wide; every refusal is still logged.
- **Client-address key (review S-3).** Rate limits key an IPv6 client by its /64 and an IPv4-mapped address as its IPv4 address. The local Vite proxies pass `X-Forwarded-For` through unchanged; the production proxy must append the client address and be the only way in (Master Plan Section 15, review S-4).
- **Denials beyond the evidence bound stay attributable (review S-2).** The denial log line and the evidence-limited line name the user.
- **Shutdown waits for a housekeeping run in progress** before the database pool closes (review DATA-4).
- **D-08 without a database.** `apps/api/src/auth/sessions.spec.ts` holds each side of the race open in turn; moving the memory check before the insert, or remembering after the revocation, each fails one test (review S-5).
- **Suspension against an in-flight activation** now runs the lifecycle store's lock-then-write path instead of raw SQL, so removing the lock fails the test (review DATA-2).
- **DC-4 evidence (review DATA-3).** The one-statement read is established by reading `readActorAuthority`; its tests prove the behavior, not the single snapshot, which no deterministic test can separate.

## 10. Hand-off

Written at the end of the run.
