# IAM-R09B — Real-Browser Journeys and IAM Closeout (IAM-MP-15, part 2)

**Status:** IN_PROGRESS  
**Master Plan stages:** IAM-MP-15 (part 2 of 2; split by the `IAM-R09` planner, R09 D-01)  
**Risk tier:** A (session effort `high`)  
**Branch:** `iam/r09b-browser-journeys`  
**Baseline commit:** `3752046b07c24db3d9cc265acdce42501b4826d3`

## 1. Objective

Prove IAM end to end in real browsers against the pinned Keycloak, PostgreSQL, the built API server entry and the production web build, and close IAM-MP-15. The journeys cover spec Section 46.7 and the items earlier runs carried here: administration through the real API, `__Host-` cookies in three engines, session rotation, and back-channel logout through a running API. The closeout maps the specification's Definition of Done (Section 56) and security gates (Section 47) to evidence, runs the dependency audit and the temporary-code sweep, and synchronizes the documentation. After this run the repository is ready for `IAM-FINAL`.

## 2. Scope

**In scope:** a Playwright suite against a real stack (D-02, D-03); the journeys of Section 3 in Chromium, and the cookie journey in Firefox and WebKit; the IAM-MP-15 items "Carried forward to run IAM-R09B"; the Definition of Done and Keycloak policy map; dependency audit; temporary-code sweep; documentation synchronization; full verification.

**Out of scope:** new product behavior, new permissions, API contract changes, new infrastructure or dependencies, production deployment design (items found here go to Master Plan Section 15). A product defect found by a journey is fixed in this run when it is an ordinary bug; anything larger stops the run (Section 7).

## 3. Inputs

Specification: `docs/modules/iam.md` Sections 21, 32–33, 40, 46.7, 47, 52, 54–56, 59. `docs/SECURITY.md` Sections 11 and 37 (cookie and session policy). Master Plan IAM-MP-15 section, Sections 15 and 17. Previous hand-off: `IAM_R09_SECURITY_HARDENING_PLAN.md` Section 10. No deep audit was merged since `IAM-R09`.

Carried-forward items → resolution:

| Item | Resolution |
|---|---|
| R08B D-15 user administration through the real API | J-03, J-04, J-06, J-07 (D-04) |
| R08C D-14 privilege administration through the real API | J-05, J-08 (D-04) |
| R08C D-08 catalog beyond one page | D-11 |
| R08 D-03 three-engine `__Host-` cookies | J-10, J-11; D-06 |
| R08 D-03 rotation across sites (R03 review S-02) | J-10; D-07 |
| CP1-17 back-channel logout through a running API | J-09; D-08 |
| Major deliverables: journeys, bootstrap and recovery | J-01 to J-13 (D-04, D-15) |
| Keycloak policy and configuration map; Definition of Done map | D-16 |
| Dependency audit; temporary-code sweep; documentation | D-17, D-18, D-19 |
| R09 review S-3 login-attempt volume | D-09 |
| R09 review T-4 housekeeping wiring | J-12; D-10 |
| R09 D-12 reactivated permissions | stays with `IAM-FINAL` (Master Plan Section 17) |

## 4. Decisions

- **D-01 Reviewers.** As the Master Plan names for `IAM-R09B`: security; tests and verification; architecture and boundaries.
- **D-02 A second Playwright configuration.** `apps/web-e2e/playwright.iam.config.mts` runs the IAM journeys through a new `e2e-iam` target; `pnpm test:e2e` runs `e2e` then `e2e-iam`, so `verify:full` and CI include it. The existing smoke stack deliberately never connects to a database or identity provider, and lab and visual runs should not pay a Keycloak start. The IAM stack uses its own fixed ports (API `3110`, web `4320`).
- **D-03 A black-box stack started in global setup.** The global setup starts PostgreSQL, Mailpit and Keycloak with Testcontainers, applies the migrations with the Prisma CLI, runs the built operator commands (`iam-sync-reference`, `iam-bootstrap`), then starts the built API server entry (`apps/api/dist/main.js`) and the production web preview as child processes with an explicit environment (no `.env` is read). Its teardown stops everything. Images and the realm come from `infra/compose.yaml` and `infra/keycloak/`, never copied. Global setup, not `webServer`, because container ports and generated secrets exist only after the containers start, and Testcontainers ties containers to the runner process that started them. The e2e project imports no workspace code (Nx tag `type:e2e`), so it cannot share `apps/api/test-support`; the Section 15 open item on a shared test-support package is not affected.
- **D-04 Journeys (spec Section 46.7).** In Chromium: J-01 sign-in through Keycloak and the signed-in shell; J-02 sign-out ends the Vertex and Keycloak sessions; J-03 an administrator invites a user and the invitee completes the invitation and first activation; J-04 an administrator assigns a role and the holder gains access on the next request; J-05 a custom role's permission edit through the review step removes access on the holder's next request, in the UI and the API, without stale privilege; J-06 suspension ends the user's session and Keycloak refuses their next sign-in; J-07 revoked and expired sessions reach their signed-out states; J-08 department deactivation with its confirmation leaves the member's organizational context; J-09 a Keycloak-side logout ends the Vertex session through back-channel logout; J-12 housekeeping runs from the server entry; J-13 last System Administrator protection and a key authorization denial, in the UI and the API. In Chromium and Firefox: J-10 cookies, rotation and sign-out. In WebKit: J-11 (D-06). Every journey uses its own synthetic users (`@example.test`).
- **D-05 Administrator session.** The bootstrap administrator's invitation and first sign-in run in the global setup in Chromium, which is J-01's precondition and evidence of the bootstrap path. Journeys reuse that session's storage state; they never sign it out and never grant System Administrator to anyone, so J-13's "last" holder is deterministic under parallel workers. Journeys that end sessions use their own users.
- **D-06 WebKit refuses `Secure` cookies over plain HTTP.** Probed before planning: Chromium and Firefox keep and send the `__Host-` cookies on `http://127.0.0.1`; Playwright's WebKit on Windows stores them without sending them, and on Linux (the pinned image) does not store them. The cookie policy stays (SECURITY Section 11: `Secure`, `__Host-`). J-10 proves the cookies in Chromium and Firefox. J-11 proves WebKit's outcome precisely: sign-in over plain HTTP ends signed out with a sign-in failure and no session. The README states that local development supports Chromium and Firefox, and WebKit over the production HTTPS origin becomes a production deployment item.
- **D-07 Rotation.** J-10 signs in again while signed in and proves the old session is refused and a new cookie value is set. Locally Keycloak and the web app share a site (`127.0.0.1`), so the `SameSite=Strict` session cookie reaches the callback. The deployed topology is not designed yet: its item in Master Plan Section 15 states that Keycloak must share the web app's registrable domain, because otherwise the callback cannot see the session cookie and the previous session stays live, unreachable by the browser, until it expires.
- **D-08 Back-channel path (CP1-17).** The realm's back-channel URL reaches the loopback API the way the Compose realm does on Docker Desktop hosts (`host.docker.internal`), and through `host.testcontainers.internal` on Linux, where that name does not reach a loopback port. A local run on Windows therefore proves the local Compose path; CI proves the Linux path.
- **D-09 Login-attempt volume (R09 review S-3).** No process-wide sign-in ceiling: one flood could then deny sign-in to every staff member, trading bounded storage growth for an outage. Per-address limits and housekeeping stay. The residual (many addresses under the limit) is recorded for the production deployment design: the reverse proxy applies a global request limit to the sign-in endpoints.
- **D-10 Housekeeping wiring (R09 review T-4).** J-12 inserts an expired login attempt and waits for the running server to delete it. Since `IAM-R09` nothing but housekeeping deletes another attempt, so this proves the server entry schedules it through `AuthModule`.
- **D-11 Catalog bound (R08C D-08).** The registered catalog holds 12 codes. No change; the revisit trigger (a catalog approaching 100 codes) passes to later modules as a Master Plan Section 15 open item.
- **D-12 No token reaches the browser.** Every journey collects the bodies and headers of the `/api` responses its pages receive and asserts that none holds a JWT or a token field; `document.cookie` and web storage hold no Vertex secret (spec Section 47).
- **D-13 API log scan.** The API's output is written to a file under the operating system's temporary directory (not `test-output`, which CI uploads on failure). The teardown fails the run if the file holds a JWT, a `__Host-vertex-*` value the setup handled, the administrator's TOTP secret, the test password or a configured secret.
- **D-14 Expiry.** J-07 moves the session's idle deadline into the past in PostgreSQL; waiting out the configured minimum is not practical. The API's expiry handling is proven by integration tests; the journey proves the browser's state.
- **D-15 Bootstrap and recovery.** The first administrator is created by the operator command (D-05). J-13 also runs the command again for another address, and in recovery mode, and both are refused (exit code 2) while an ACTIVE System Administrator exists, with no user created. Recovery's own modes are proven by `user-administration.integration.spec.ts`; the map cites them.
- **D-16 Definition of Done map.** `docs/plans/iam/IAM_DEFINITION_OF_DONE_MAP.md` maps each spec Section 56 statement, each Section 47 gate and the Keycloak policy (realm contract) to its evidence, and classifies each statement as satisfied, satisfied for the committed realm with a production item, or a blocker. `IAM-FINAL` audits it.
- **D-17 Dependency audit.** `pnpm deps:audit` runs locally before review and in CI; exceptions stay only in `pnpm-workspace.yaml` with their review notes.
- **D-18 Temporary-code sweep.** Search production and test sources for focused or skipped tests, `debugger`, stray console output, TODO/FIXME/HACK markers and bypass switches; fix what is found or record why it stays.
- **D-19 Documentation.** README (commands, e2e stacks, supported local browsers), AGENTS.md (`verify:full` description), the CI workflow comment, and the Master Plan (ledger, IAM-MP-15, Sections 15, 17, 19).

No owner decisions. The run adds tests, a test harness and documentation. It changes no product behavior, contract, dependency or infrastructure.

## 5. Design notes

- **Stack environment.** The API receives every variable it reads, explicitly: the sign-in limit is raised so parallel journeys from one address are not limited (rate limiting is proven by API tests); other `AUTH_*` values keep their defaults. The web preview proxies `/api` to `127.0.0.1:3110`.
- **Hand-over to workers.** The setup publishes the Keycloak issuer, Mailpit URL, database access and the administrator's storage-state path through `process.env`, which Playwright passes to its workers. Generated secrets never enter `test-output`.
- **Keycloak pages.** Journeys drive Keycloak's own login, OTP, TOTP enrolment and password pages as a user would, reading the TOTP secret from the manual-entry view. TOTP codes follow the realm policy (SHA-1, 6 digits, 30 s) and are never reused.
- **Language.** Journeys run in English through the stored UI preference; the Arabic screens are covered by the existing in-page journeys.

## 6. Done means

1. `pnpm test:e2e` runs the smoke, lab and visual suites and then the IAM suite against a real stack; CI runs it through `verify:full`. (Master Plan: real browser E2E; spec Section 46.7.)
2. J-01 to J-13 pass in the engines D-04 names, each with the D-12 token check. (Spec Section 46.7; R08B D-15; R08C D-14.)
3. Chromium and Firefox keep the `__Host-` cookies with `Secure`, `HttpOnly`, `Path=/`, the policy's `SameSite`, and no `Domain`; rotation replaces the session; WebKit's outcome is proven and documented. (R08 D-03; S-02.)
4. Back-channel logout through Keycloak ends a live Vertex session in the stack. (CP1-17.)
5. Housekeeping runs from the server entry. (T-4.)
6. The API log of the whole run holds no token or handled secret. (Spec Section 47.)
7. The Definition of Done map classifies every Section 56 statement and Section 47 gate; nothing is left unclassified. (Master Plan exit: Definition of Done.)
8. `pnpm deps:audit` passes; the sweep leaves no focused test, bypass or unexplained marker. (Exit: no temporary bypass.)
9. README, AGENTS.md and the Master Plan match the repository; S-3, D-08 of R08C and the rotation and WebKit items are recorded. `pnpm verify`, the touched integration suites and `pnpm test:e2e` pass. (Exit: documentation truthful; required verification.)

## 7. Stop conditions

Only those of the Run Contract. If a journey shows that a locked invariant does not hold, or that fixing a defect needs an architecture, contract or policy change, stop and present it.

## 8. Verification

- Narrow: `pnpm nx run @vertex-os/web-e2e:e2e-iam` (with `--project` per engine), `pnpm nx run @vertex-os/web-e2e:lint`, `:typecheck`.
- Before review: `pnpm verify`, `pnpm test:e2e`, `pnpm deps:audit`, and the integration suites of any project whose source changes.
- Probes: a mutation of the D-12 check (a JWT injected into a response) and of the D-13 scan (a known secret written to the log) must fail them; J-05 fails if the permission removal is skipped.

## 9. Checklist

- [x] M0 Plan committed
- [x] M1 Stack: configuration, global setup and teardown, `e2e-iam` target, root script
- [ ] M2 Session journeys: J-01, J-02, J-07, J-09, J-10, J-11
- [ ] M3 Administration journeys: J-03 to J-06, J-08, J-12, J-13
- [ ] M4 Closeout: Definition of Done map, sweep, dependency audit, documentation
- [ ] M5 `pnpm verify`, `pnpm test:e2e`, mutation probes
- [ ] M6 In-run review; fixes
- [ ] M7 Master Plan ledger and hand-off; pull request; CI

### 9.1 Deviations and discoveries

## 10. Hand-off

Written at the end of the run.
