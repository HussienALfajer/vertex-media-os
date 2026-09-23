# IAM-CP1 — Deep Audit: Authentication (IAM-MP-03 to IAM-MP-06)

**Current verdict:** `IAM-CP1 FIXES REQUIRED` (re-check 1, Section 5): CP1-01 is resolved; the fix run introduced blocking finding CP1-21.  
**Audited commits:** `48ff7ccaa12b88d89e0a4142e0a1f3f68cfd0222` (audit); `cd82811b04767b06800f9eb51d5e3b0c3c62d1f7` (re-check 1)  
**Range:** `1af351a..48ff7cc`: from the last accepted baseline before run `IAM-R01` to the merge of `IAM-R03`; re-check 1: `fbd607d..cd82811` (fix run `IAM-R03F`)  
**Pull requests:** #5 (`IAM-R01`, IAM-MP-03), #6 (`IAM-R02`, IAM-MP-04), #7 (`IAM-R03`, IAM-MP-05 and IAM-MP-06); re-check 1: #9 (`IAM-R03F`)  
**Method:** `docs/PLANNING.md` Section 9. Five fresh-context reviewers (one per concern), each reviewer's evidence checked, and the auditor's own probes; the same for re-check 1.  
**Fix runs:** `IAM-R03F` (CP1-01; merged as #9). `IAM-R03F2` (CP1-21 and the items Section 5 attaches to it). After it merges, `/audit IAM-CP1` re-checks CP1-21.

---

## 1. CI evidence

Each pull request's required check ran `pnpm verify:full` and `pnpm deps:audit` on its final commit, and both steps succeeded:

| Pull request | Run | Head | Integration tasks |
|---|---|---|---|
| #5 | 35871588512 | `e45b5b4` | 4 `test:integration` tasks executed (7/11 cache hits were builds from the same job); Playwright 130 passed |
| #6 | 35884264509 | `b03f096` | 4 executed (8/12 hits, builds); Playwright 130 passed |
| #7 | 35894447082 | `0756a4c` | 4 executed (8/12 hits, builds); Playwright 130 passed |
| push to `main` | 35895297417 | `48ff7cc` | 4 executed (8/12 hits, builds); Playwright 130 passed |

CI restores no cache from other runs, so the integration suites (PostgreSQL, Keycloak and Mailpit through Testcontainers) ran for real. The logs show task success only, not per-file results; the reviewers ran the suites locally (Section 3). No gate was re-run locally, because the CI evidence is complete.

## 2. Findings

Severity follows `docs/PLANNING.md` Section 8.3. Findings the reviewers reported are named in brackets (S security, D data, AB architecture, T tests, SD scope and documentation). The auditor checked each one's evidence.

| ID | Severity | File:line | Finding | Evidence | Owner |
|---|---|---|---|---|---|
| CP1-01 | **Blocking** | `apps/api/src/auth/oidc.ts:235`; `apps/api/src/auth/sessions.ts:127-162`; `infra/keycloak/import/vertex-realm.json:36-37` | [S-1] **After about 30 minutes, logout or recovery on the Keycloak side no longer reaches the Vertex session.** The API discards the access and refresh tokens at the callback and never contacts Keycloak again. The Keycloak SSO session therefore ends silently after its 1800 s idle timeout, and Keycloak sends no back-channel logout for an expired session. Meanwhile the Vertex session keeps sliding, up to 36000 s. From that point on, none of these reach Vertex: an administrator's logout in Keycloak, a self-service reset with "sign out from other devices" (the recovery signal of R03 D-15), and Keycloak-side disablement. This breaks the SECURITY Section 11 MUST, which requires identity-provider-side disablement or logout to propagate to application sessions through back-channel logout "or an equivalent re-validation mechanism". It also makes the ledger's "recovery signal closed" true only for the first half hour of a session. The D-15 test resets right after sign-in, so it cannot see this. | The reviewer probed a real Keycloak 26.7.4. The auditor reproduced it on the pinned image with a throwaway realm (SSO idle 60 s). **Control:** logout right after sign-in → 1 back-channel call. **Session never refreshed** (what the API does), checked 200 s later → the Keycloak session is gone, and a Keycloak logout sends 0 calls for it. **Session refreshed every 40 s** (5 refreshes, all 200) → still alive, and it receives 1 call. The code has no refresh, userinfo or introspection call after the callback. | `IAM-R03F` |
| CP1-02 | Major | `apps/api/src/auth/auth-flow.integration.spec.ts:55-57, 482`; `apps/api/src/auth/keycloak-login.integration.spec.ts:467-475` | [T-1] The suite-wide log-leak scan for session secrets, CSRF tokens, login handles and provider tokens cannot fail. The last test runs `lines.length = 0`, which empties the array that `afterAll` scans. The Keycloak journey's scan covers JWTs, `code`/`state` parameters, the client secret and cookie names, but not bare session secrets, CSRF tokens, nonces, PKCE verifiers or the encryption secret. The behavior itself is clean today (R03 Done means 8), which is why this is Major rather than the reviewer's Blocking. The regression guard is missing. | The reviewer added `leak: secret, csrfLeak: csrfToken(secret)` to the log call at `auth.controller.ts:177`: the suite still passed 17/17. With the capture kept, it failed on the secret. The unmutated code with full capture passed 17/17. The auditor's API probe (Section 3, P4) found no secret in any log line. | `IAM-R03F` |
| CP1-03 | Major | `apps/api/eslint.config.mjs:55-71`; `scripts/check-architecture-boundaries.mjs` (V83, V84) | [AB-1] R03 review F1 limits adapter imports in `apps/api/src/auth` to `auth-runtime.ts`. That rule is `no-restricted-imports`, which a dynamic import (`await import('@vertex-os/iam-persistence')`) and a type query of an adapter's root entry both get past. The imports would also run, because `apps/api` declares those packages. No current code uses either form. | The auditor's `lintText` probe with the `apps/api` configuration: the static import is rejected; the dynamic import and the type query of `@vertex-os/iam-persistence`, and the dynamic import of `@vertex-os/audit-persistence`, are accepted. | IAM-MP-07 |
| CP1-04 | Minor | `eslint.config.mjs:84-126` | [AB-2, AB-3, R02 AB-4] Remaining lint residuals. A dynamic import written as a template literal without placeholders, and `import x = require('…')`, get past the tag and external-package bans, including the A-04 OIDC bans. A CommonJS `require()` of a private entry passes. `process.env` destructured by assignment, or through a parameter default, passes. A bypass of the package bans also needs a declared dependency, which review would see. R02 recorded AB-4, but it never reached the Master Plan. | Reviewer `lintText` probes; the auditor confirmed that none of `jose`, `openid-client`, `oauth4webapi` or `@prisma/client` resolves from `domains/iam`. | IAM-MP-07 |
| CP1-05 | Minor | `domains/iam/src/index.ts:31-48` | [AB-5] The public root exports `SignInDependencies` and `IdentityProvisioningDependencies`. Their types carry `Pick<ApplicationUserRepository, …>`, `IamTransactionRunner` and `IdentityProvider`. The root also exports the whole `ApplicationUser`. Spec Section 44 says the public surface MUST NOT expose repositories, internal services or mutable internal entities. R02 D-18 and R03 D-09 chose this so that `apps/api` can compose. Reconcile the specification or the surface. | Reading of the index and the dependency interfaces. | IAM-MP-07 |
| CP1-06 | Minor | `packages/database/prisma/migrations/20260923190000_auth_sessions/migration.sql:67-81` | [D1, D2] The database does not keep revocation monotonic: a revoked row can be updated back to unrevoked, and `revoked_at` can be rewritten. Several structural checks are also missing: idle deadline before creation, a zero-length session, `revoked_at` before `created_at`, and an empty ciphertext, state, nonce or verifier. Every application path enforces these today. | Reviewer probes on a freshly migrated database: each such update or insert succeeded. | IAM-MP-10 |
| CP1-07 | Minor | `apps/api/src/auth/sessions.integration.spec.ts:117-155` | [D4, T-2] No test names the auth constraints, unlike the IAM and Audit suites. The behavioural cases use a bare `.rejects.toThrow()`, which would also pass on an unrelated error. The CSRF-hash, IdP-session, handle-hash and attempt-expiry checks, and the key-version branch, are never exercised. | `grep` finds the constraint names only in the migration and schema. | IAM-MP-10 |
| CP1-08 | Minor | `apps/api/src/auth/session-store.ts:196-207`; `apps/api/src/database/database.module.ts:12-13` | [D3] The ID-token sweep on each sign-in writes at most 200 rows, but it scans the whole `auth_session` table: no index covers it, and rows are never purged. Its `catch` also swallows a statement timeout without a log line. R03 D-21 and the `DatabaseModule` comment overstate the bound. | Reviewer `EXPLAIN ANALYZE` over 500,050 rows: sequential scan, 68 ms. | IAM-MP-15 |
| CP1-09 | Minor | `domains/iam-persistence/src/user-identity-store.integration.spec.ts:134-160, 194-208, 287-324`; `apps/api/src/auth/sessions.integration.spec.ts:300-342` | [D5] The race tests use `Promise.all` without a barrier or a held lock. Their assertions also hold when the calls run one after another. The SQL is correct: the forced-interleave probes of the reviewer and the auditor (P3) show each write is one conditional statement that PostgreSQL re-checks after the lock. | Probes: `touch` waiting on a held revocation, and first activation against a held suspension, both write nothing. | IAM-MP-15 |
| CP1-10 | Minor | `apps/api/src/keycloak/realm-contract.integration.spec.ts:757-760` | [T-3] The realm SSO limits are asserted as `<= 3600` and `<= 86400`, not as the pinned 1800 and 36000 that R03 D-05 matches. A drift to 3600 would outlive the default application idle timeout, and no test would fail. | Reading; `vertex-realm.json:36-37`. | `IAM-R03F` |
| CP1-11 | Minor | `scripts/setup-env.mjs` | [T-4] No automated test covers the upgrade, append and refusal branches of `pnpm env:setup`. | No spec references the script; a reviewer scratch run behaved correctly. | IAM-MP-15 |
| CP1-12 | Minor | `apps/api/src/auth/auth-flow.integration.spec.ts:54-61`; `keycloak-login.integration.spec.ts:467-475`; `apps/api/src/iam/identity-provisioning.integration.spec.ts:566-575` | [T-5] The evidence scans depend on test order (TESTING Section 67). In `auth-flow`, `afterAll` asserts before closing the app and stopping the container, so a failing scan leaves them running. | A failed reviewer run left its container to Ryuk. | `IAM-R03F` |
| CP1-13 | Minor | `apps/api/src/iam/identity-provisioning.integration.spec.ts:379-387` | [T-6] R02 Done means 3 says conflicting identities stay byte-for-byte unchanged. Against real Keycloak this is asserted only for the foreign-owner case. It is not asserted for the identity holding the email, and "subject bound elsewhere" is proven only with fakes and at the store level. | Reading. | IAM-MP-10 |
| CP1-14 | Minor | `apps/api/src/auth/auth.controller.ts:282-288, 313` | [S-2] A rejected logout token, or a valid one that revokes nothing, leaves only a log line. Spec Section 33 asks the endpoint to record a security event, and Section 34 says logs are not sufficient; R03 D-12 chose a log line. Writing Audit records for unauthenticated input needs the rate limiting already carried to IAM-MP-15. | Reading. | IAM-MP-15 |
| CP1-15 | Minor | `infra/keycloak/import/vertex-realm.json:243-248` | [SD-3] The R02 hand-off item "the realm's `delete_credential` required action is enabled" was never attached to a stage. A user can delete their own OTP. Because the browser flow requires OTP, the next sign-in then enrols a new TOTP with the password alone. | `grep` of the Master Plan finds nothing; the realm has `"enabled": true`. | IAM-MP-15 |
| CP1-16 | Minor | `README.md:150, 204`; `IAM_R03_SESSIONS_AND_OIDC_PLAN.md:114` | [SD-1, SD-2] The README lists the `lint:boundaries` probes as V1–V62 and C1–C8; the script and CI run V1–V87 and C1–C11. The README and R03 Done means 7 say that logout returns the Keycloak end-session URL. Since the S-01 fix (D-17), it returns the post-logout URI once the API has ended the Keycloak session, and the end-session URL only as a fallback. | `oidc.ts:250-295`; CI log of run 35894447082. | `IAM-R03F` |
| CP1-17 | Minor | `IAM_MASTER_PLAN.md` Section 15 (R03 paragraph) | [SD-4] The ledger recorded local back-channel reachability through Docker Desktop as closed. R03 Section 8 required a local end-to-end probe (a real login, then a Keycloak-side logout). PR #7 "Not verified" says that probe did not run; only a container-to-loopback reachability probe did. The Linux CI half is proven. | PR #7 description. This record's pull request corrects the ledger wording. | IAM-MP-12 |
| CP1-18 | Minor | generated OpenAPI; `auth.controller.ts:265-269` | [SD-9] `POST /api/auth/backchannel-logout` declares form consumption, but has no `requestBody` schema (`logout_token`) and no 400 body. | Reviewer regenerated the document. | IAM-MP-11 |
| CP1-19 | Info | `migration.sql:60-62` | The migration comment says the 43-character checks make it impossible to store a raw secret by mistake. A raw session secret (32 bytes, base64url) has the same shape, so it passes. The guarantee comes from the code hashing every secret. Applied migrations are not edited, because Prisma checks their checksums. The security reviewer's "enforced by database CHECK constraints" and "revocation can never be undone" (see CP1-06) are corrected here. | Auditor probe P2: `INSERT 0 1` with a raw secret as `token_hash`. | — |
| CP1-20 | Info | various | No action: [S-3] logout by a no-longer-ACTIVE user gets 403 and leaves the Keycloak session, which reconciliation ends; [S-4] Fastify's `text/plain` parser is still on, without CSRF impact; [S-5] `jti` is not remembered, and revocation is idempotent; [AB-4] the auth-scoped client's tagged raw SQL can reach other tables, as in the IAM and Audit scopes (covered by the ADR-0008 item that no IAM stage owns); [AB-6, AB-7]; [D6] is R02 DC-2, already on IAM-MP-10; [T-7] harness notes; [SD-5] dates, counts and versions in historical plans; [SD-6] the sign-in redirect codes are consumed by IAM-MP-12, which already lists them; [SD-7, SD-8]; [SD-10] `AGENTS.md` does not mention that the integration suites also start Keycloak and Mailpit; type queries of the OIDC libraries or Prisma from `domains/iam` pass lint, but none of those packages resolves from `domains/iam`, so the type check fails. | Reports and reading. | — |

**Rejected or re-classified:** T-1 was reported as Blocking and is CP1-02, Major. The behavior it guards is correct, as shown by the reviewer's full-capture run and probe P4. What is missing is regression evidence, which the fix run restores before IAM-MP-07 builds on the same area. No finding was rejected for lack of evidence.

**Non-blocking findings** are attached to their owner stages in the Master Plan when the re-check accepts IAM-CP1. Until then this table is where they are tracked.

### What the fix run must deliver

- **CP1-01.** Identity-provider-side logout, recovery and disablement must reach application sessions for their whole lifetime (SECURITY Section 11), proven against real Keycloak after the SSO idle timeout has passed.
  - The canonical documents allow back-channel logout "or an equivalent re-validation mechanism".
  - One design fits them: keep the refresh token encrypted server-side, as spec Section 14 permits for OIDC lifecycle needs. Refresh it within the realm's SSO idle window while the session is used, and revoke the session when Keycloak refuses. This design has to settle refresh-token rotation under concurrent requests, behavior when Keycloak is unavailable, and invariant 10 (no Keycloak I/O inside a transaction). It revises R03 D-17 ("the ID token is the only token kept").
  - A design that instead makes the realm's SSO idle exceed 60 minutes needs a documented risk decision (SECURITY Section 11), which is an owner decision.
- **CP1-02, CP1-10, CP1-12 and CP1-16**, in the same files the fix touches. The R03 D-15 and D-05 texts and the ledger's recovery-signal claim must match the result.

## 3. Probes run by the auditor

Throwaway containers `cp1-audit-pg` (PostgreSQL 18.6) and `cp1-audit-kc` (the pinned Keycloak 26.7.4 digest), both removed afterwards.

| # | Probe | Result |
|---|---|---|
| P1 | Every migration applied from empty with the repository's Prisma CLI; `prisma migrate diff --from-config-datasource --to-schema prisma/schema --exit-code`; catalog of the auth tables | 4 migrations applied. "No difference detected", exit 0. 8 named checks, 2 primary keys, 2 unique indexes, 3 plain indexes, no trigger. |
| P2 | A raw 43-character session secret inserted as `token_hash` and `csrf_token_hash` | Accepted (`INSERT 0 1`) → CP1-19 |
| P3 | The built session store against PostgreSQL with `log_statement=all` | `touch` blocked for 2013 ms by a held revocation, then wrote nothing (row stays revoked). 8 concurrent revocations → 1 success and 1 Audit record. 8 concurrent consumptions of a login attempt → 1 `found`, 7 `missing`. Idle-expired session: `touch` false, `revoke` false, ID token discarded. Failing Audit append → throws, row unchanged. The PostgreSQL log shows every write as a single conditional `UPDATE`/`DELETE`. |
| P4 | The built API (clean rebuild at `48ff7cc`) against a fake identity provider whose error bodies carry an email and the request body, at log level `trace`, with real failures | Refused code exchange, replayed attempt and wrong state → `303 /?authError=AUTH_LOGIN_FAILED`. Provider 500 → `IDENTITY_PROVIDER_UNAVAILABLE`. Logout without a session → `401 AUTHENTICATION_REQUIRED`. Forged session → `401 AUTH_SESSION_INVALID`, cookie cleared. Form body on logout → 415. Duplicated session cookie → treated as absent. Back-channel with a JSON body or a forged token → `400 {"error":"invalid_request"}`. Database stopped: login → `AUTH_LOGIN_FAILED`, session and logout → 500 Problem Details. The log (64 lines) contains none of: the code, the states, the provider error body or email, the client secret, the encryption secret, the database password, the login handle, the forged secret, the logout token. The database error appears only as its allowlisted P1001 description. The authorization request carries `S256`, `state`, `nonce`, `scope=openid` and the exact redirect URI. |
| P5 | 16 boundary cases through ESLint `lintText`, each with its project's own configuration; then AB-1 reproduced | 14 behaved as intended, including OIDC subpaths and dynamic imports in the IAM core and web code, `@vertex-os/database/auth` outside `src/auth`, private entries and raw environment access. The 2 type-query cases are recorded in CP1-20. AB-1: static adapter import rejected; dynamic import and type query accepted → CP1-03. |
| P6 | CP1-01 reproduced on the pinned Keycloak, throwaway realm with SSO idle 60 s, local back-channel receiver | Control 1 call; unrefreshed session after 200 s: gone, 0 calls; session refreshed every 40 s: alive, 1 call. |

The reviewers also ran, locally:
- `@vertex-os/api:test:integration`: 7 files, 103 tests passed.
- `@vertex-os/iam-persistence:test:integration`: 97 passed.
- `@vertex-os/database:test:integration`: 27 passed.
- Unit suites: api 105, iam 155, iam-keycloak 23.
- `pnpm lint:boundaries`: V1–V87 and C1–C11 pass.
- Lint of the affected projects with `--skip-nx-cache`: clean.
- Migration upgrade path and atomicity: proven on a throwaway database.

## 4. Not verified

- **Back-channel logout through the local Compose Keycloak and a running API** (CP1-17). The audit did not touch the developer's `vertexos` Compose project.
- **Real browsers accepting `__Host-` cookies on `http://127.0.0.1`.** Carried to IAM-MP-12.
- **The mutation claims in the R01 and R02 plans** (email editability, PKCE, the OTP step, factor actions in links). Not reproduced.
- **`pnpm infra:up`, `infra:down` and `infra:reset`.** Their behavior on the developer's volumes was not exercised.
- **Leftover volume.** The anonymous data volume of `cp1-audit-pg` (`3609213c4ec0…`) could not be removed from this session, because permission was denied. The owner can remove it with `docker volume rm`.

---

## 5. Re-check 1 — after fix run `IAM-R03F` (2026-09-23)

**Verdict:** `IAM-CP1 FIXES REQUIRED`. CP1-01 is resolved. The fix run's own review fix S-01 introduced CP1-21, which violates the fix run's Done means 3 and decision D-05.  
**Scope:** `fbd607d..cd82811` (PR #9). The blocking finding CP1-01 and the items assigned to `IAM-R03F` (CP1-02, CP1-10, CP1-12, CP1-16), plus anything the fix itself broke. Five reviewers, one per concern.

### 5.1 CI evidence

| Pull request | Run | Head | Result |
|---|---|---|---|
| #9 | 35910432355 | `8b877fe` (same tree as `cd82811`) | `pnpm verify:full` and `pnpm deps:audit` succeeded; 4 `test:integration` tasks executed (8/12 cache hits were builds); Playwright 130 passed |
| push to `main` | 35911733442 | `cd82811` | `pnpm verify:full` and `pnpm deps:audit` succeeded |

No gate was re-run locally. The tests reviewer ran `@vertex-os/api:test:integration --skip-nx-cache` (8 files, 114 tests passed) and `@vertex-os/api:test` (115 passed); the data reviewer ran `@vertex-os/database:test:integration` (5 files, 28 passed).

### 5.2 Earlier findings

| ID | Result | Evidence |
|---|---|---|
| CP1-01 | **Resolved.** A used session keeps its Keycloak session alive and receives Keycloak's logout after the SSO idle timeout; a silently ended Keycloak session, a Keycloak logout without back-channel delivery and a disabled identity are refused at the next re-validation, which runs before any request that comes 60 s or more after the previous claim; every failure mode that does not refresh leaves at most one idle period, because the idle deadline slides only after a successful refresh. | Probes R1 and R2; the real-Keycloak spec fails without re-validation (R3); code reading of `sessions.ts:153-243` by the security and data reviewers. |
| CP1-02 | Resolved, with the gaps CP1-23 and CP1-24. | Both scans assert over the full capture after cleanup. |
| CP1-10 | Resolved. | `realm-contract.integration.spec.ts` asserts 1800 and 36000 exactly. |
| CP1-12 | Resolved in the two auth suites; the third file the finding cites is unchanged (CP1-26). | `git diff --quiet fbd607d cd82811 -- apps/api/src/iam/identity-provisioning.integration.spec.ts` |
| CP1-16 | Resolved. | README ranges V1–V87 and C1–C11 match the script; the logout text matches `oidc.ts`. |

### 5.3 New findings

| ID | Severity | File:line | Finding | Evidence | Owner |
|---|---|---|---|---|---|
| CP1-21 | **Blocking** | `apps/api/src/auth/oidc.ts:399-402` | [SEC-R1] **A Keycloak timeout is classed `rejected`, not `unavailable`.** openid-client reports a timeout as `ClientError` with code `OAUTH_TIMEOUT` and the `TimeoutError` as its cause. The `OAUTH_*` short-circuit added by review fix S-01 returns before the cause is examined. When Keycloak hangs for more than 10 s, every session that comes due is revoked with reason `PROVIDER_SESSION_ENDED`, so Audit records a provider decision that never happened. This is the "end them all at once" outcome that D-05 rules out, and it breaks Done means 3 ("a Keycloak outage keeps the session until its current idle deadline"). The same path turns a timed-out sign-in into `AUTH_LOGIN_FAILED` instead of `IDENTITY_PROVIDER_UNAVAILABLE`, which `IAM-R03` returned. No test covers a timeout. The reviewer rated it Major because it fails closed; it is Blocking because it violates the run's Done means and decision. | Probe R4: a paused Keycloak gives `rejected OAUTH_TIMEOUT` after 10 s, and the same token still refreshes after unpause. Probe R5: against a provider that never answers, the built client returns `rejected OAUTH_TIMEOUT` for login start and refresh; the same file without the S-01 lines returns `unavailable OAUTH_TIMEOUT`. The security reviewer reproduced it with a fake provider. | `IAM-R03F2` |
| CP1-22 | Minor | `apps/api/src/auth/session-store.ts:242-247` | [DATA-01] The sweep tests expiry only inside its `id IN (SELECT … LIMIT 200)` subquery. After a lock wait, PostgreSQL re-checks only the outer `WHERE`, so a sweep that meets an in-flight `applyRevalidation` clears the tokens of a row the apply has just made live. That session then cannot re-validate until its new idle deadline (up to 30 min), and Keycloak-side disablement does not reach it in that time. It fails closed and needs a claim within one Keycloak round trip of the idle deadline. | Reviewer's two-session `psql` probe on PostgreSQL 18.6: the slid row ends with both ciphertexts NULL; the same sweep with the expiry predicate repeated in the outer `WHERE` updates 0 rows. The auditor read the script: it uses the store's exact statements. | `IAM-R03F2` |
| CP1-23 | Minor | `apps/api/test-support/fake-oidc-provider.ts:153-172`; `apps/api/src/auth/auth-flow.integration.spec.ts:73-82` | [T-R1] The auth-flow scan does not collect the back-channel logout tokens the suite posts (valid and forged), and it has no JWT pattern. A logout token logged on the rejection path (`auth.controller.ts:292-295`) would pass. R03F Done means 6 names every token. | `logoutToken()` never pushes to `issued` (only lines 147 and 270 do). | `IAM-R03F2` |
| CP1-24 | Minor | `apps/api/src/auth/keycloak-login.integration.spec.ts:183, 234` | [T-R2] Two login attempts call `/api/auth/login` directly, so their state, nonce and PKCE verifier are not collected; one of them is the replayed-callback rejection path. | Reading; only `journey.signIn` reads `auth_login_attempt`. | `IAM-R03F2` |
| CP1-25 | Minor | `apps/api/src/auth/sessions.integration.spec.ts` | [T-R3] R03F Done means 4 says the refresh token never reaches an Audit record; no test reads `audit_record.change` or `reason` for token material. The code is clean today (the payload is `{ reason }`). | `grep audit_record apps/api/src/auth/*.spec.ts`. | `IAM-R03F2` |
| CP1-26 | Minor | `apps/api/src/iam/identity-provisioning.integration.spec.ts:566-580` | [SD-R3] The remainder of CP1-12: the provisioning suite's evidence checks are still ordinary tests that depend on earlier tests (`total > 10`). `IAM-R03F` reported CP1-12 closed and carried nothing forward. | Unchanged in the range. | IAM-MP-10 |
| CP1-27 | Minor | `docs/SECURITY.md:377`; `apps/api/src/auth/sessions.ts:158-165` | [SD-R8] SECURITY Section 11 says identity-provider tokens MUST be discarded when the session ends. Tokens of an expired session are discarded when the row is next seen or swept (R03 D-17, R03F DC-02); the refresh token now follows that path. Expired refresh tokens are dead at Keycloak (probe R1, case H), so the risk is low. Reconcile the canonical text or the code. | Reading. | IAM-MP-15 |
| CP1-28 | Minor | `IAM_MASTER_PLAN.md` Section 19 | [SD-R1] Section 19 still named `/stage IAM-R03F` as the next step. | Resolved by this record's pull request. | — |
| CP1-29 | Info | `IAM_R03F_SESSION_REVALIDATION_PLAN.md:138` | [SD-R2] Checklist item M8 is unticked on `main`. Commit `b7cceef` ticks it, but it was pushed after the merge and re-created `origin/iam/r03f-session-revalidation`. | `git merge-base --is-ancestor b7cceef cd82811` fails. | `IAM-R03F2` ticks it; the owner may delete the remote branch |
| CP1-30 | Info | various | No action: [SEC-R2] a session without a usable refresh token can outlive its Keycloak session when the application idle is configured above the realm's (bounded, legacy rows or a rotated secret only); [SEC-R3] a refresh without an ID token skips the `sid`/`sub` binding (Keycloak always returns one for `scope=openid`); [DATA-02] no test isolates the apply's claim guard (the token guard covers the property); [T-R4] the Audit evidence of Done means 2 is proven one layer down; [T-R5] the `handled.length > 10` guard cannot fail per category; [SD-R4] "recovery reaches Vertex for the whole session lifetime" is inferred, not tested after the idle timeout, but both paths are proven (back-channel after the idle timeout; a removed Keycloak session is refused at refresh, probe R1 case B); [SD-R5] PR #9's "113 passing tests" is not reproducible (114 passed in the reviewer's run); [SD-R6] README omits the discovery-failure fallback; [SD-R7] the plan understates `auth_session_refresh_token_ck`. | Reports and reading. | — |

**Re-classified:** SEC-R1 from Major to Blocking (reason in CP1-21). SD-R2, SD-R4 and SD-R5 from Minor to Info. No finding was rejected for lack of evidence.

### 5.4 What the fix run must deliver

- **CP1-21.** A timeout of any identity-provider call is `unavailable`, with a unit test that times out through openid-client itself (for example a fetch that waits for the abort signal), for refresh and sign-in. Validation failures stay `rejected` (S-01).
- **CP1-22 to CP1-25** and the M8 tick of CP1-29, in the files the fix touches.

### 5.5 Probes run by the auditor

Throwaway container `cp1r-audit-kc` (the pinned Keycloak 26.7.4 digest) with a copy of the committed realm: SSO idle 60 s and direct grants on `vertex-web`, for the probe only. The container was removed afterwards. The built API was checked current (`tsc --build` reported it up to date at `cd82811`).

| # | Probe | Result |
|---|---|---|
| R1 | The built `refreshSession` against real Keycloak | Live session: refreshed, rotated, same `sid`. Reused replaced token: `rejected`, and the newest token is refused afterwards too (Keycloak ends the session). After an Admin logout: `rejected`. Disabled identity: `rejected`. Admin password reset without logout: refreshed (D-09). Wrong client secret: `rejected` (fails closed). Unreachable issuer: `unavailable`. Session unused for 200 s (idle 60 s plus grace): `rejected`. Session refreshed every 40 s for 200 s: still refreshed. |
| R2 | A second sign-in in the same browser (same Keycloak session) while the previous session is due, reproducing the callback's refresh of the previous session | Both variants (with and without that refresh) leave the new session's first refresh `ok`. No defect. |
| R3 | Mutation: re-validation disabled (`sessions.ts:182`), then `keycloak-revalidation.integration.spec.ts` | Both tests fail (Keycloak session gone; `200` instead of `401`). File restored; tree clean. |
| R4 | Keycloak paused with `docker pause` during a refresh | `rejected OAUTH_TIMEOUT` after 10 s → CP1-21. |
| R5 | Built `oidc.js` and a copy without the S-01 lines, against a TCP server that never answers | Built: `rejected OAUTH_TIMEOUT` for login start and refresh. Without S-01: `unavailable OAUTH_TIMEOUT` for both. |

The reviewers also ran: `pnpm lint:boundaries` (pass, C1–C11 included); `@vertex-os/api:lint --skip-nx-cache` (clean); 11 ESLint `lintText` boundary probes (all as intended); `prisma migrate diff` both directions (no difference); concurrency probes against PostgreSQL 18.6 of claim, apply, revoke and discard (1 winner, 1 Audit record, never revived); a mutant claim without its `last_seen_at` predicate makes the race test fail.

### 5.6 Not verified

- The mutation claims of the R03F plan (DC-01, S-01 to S-03, the log-scan mutations); only R3 was run.
- Self-service reset after the SSO idle timeout through the browser (CP1-30, SD-R4); covered by inference from two proven paths.
- A dangling anonymous volume `a5bcd540…` created at 19:57:09Z, most likely by the data reviewer's `cp1r-data-pg`, was not removed: its origin could not be confirmed.
