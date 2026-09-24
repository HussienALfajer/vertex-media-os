# IAM-R08 — Frontend Authentication and Session Experience

**Status:** IN PROGRESS  
**Master Plan stages:** IAM-MP-12 (the run is split at planning time, D-01)  
**Risk tier:** B (reviewers: security; tests and verification, D-02)  
**Branch:** `iam/r08-frontend-session`  
**Baseline commit:** `aa6e70b98c9cc481f8d4308ddcf4bb666f4b5bc7`

---

## 1. Objective

The production web application learns its authentication state from the backend and never handles a token. A signed-out visitor sees a sign-in action that starts the backend's OIDC flow; a signed-in user sees the application shell with their identity, a sign-out action, and navigation filtered by their effective permission codes (UX only). A session that ends, expires or loses access, an access refusal and a network failure are presented as distinct states. Protected data held by the browser is removed on sign-out, session loss, user change and permission loss. The HTTP layer gives the later administration runs (IAM-R08B, IAM-R08C) one client with in-memory CSRF handling and the Problem Details contract of IAM-R07.

## 2. Scope

**In scope**

- Session bootstrap from `GET /api/auth/session` and `GET /api/iam/me`; signed-out, session-ended, access-inactive, service-unavailable and signed-in states (spec Sections 40, 41; DESIGN_SYSTEM Section 34).
- Sign-in as a top-level navigation to `/api/auth/login`; presentation of the callback's `authError` codes.
- Sign-out through `POST /api/auth/logout` and the returned `logoutUrl`.
- An HTTP client: same-origin JSON requests, the CSRF token held in memory and sent as `X-CSRF-Token` on unsafe methods, Problem Details parsing (`code`, `fields`, `Retry-After`), and distinct error types for HTTP problems and network failures.
- Protected-state clearing; permission-aware navigation (mechanism and filter); the current-user presentation in the shell.
- Arabic and English copy; accessibility and RTL through the shared components.
- Lint that keeps authentication state out of browser storage in application code.
- Unit/component tests; the Chromium smoke journey updated to the signed-out entry and the failed sign-in path.

**Out of scope**

- IAM-MP-13 and IAM-MP-14 (user, department, role and permission administration UI): runs IAM-R08B and IAM-R08C (D-01).
- Real-Keycloak browser journeys, including the three-engine `__Host-` cookie proof, session rotation across sites and CP1-17: IAM-MP-15 (D-03).
- Any API, schema, realm or UI-package change. None is needed (D-04).

## 3. Inputs

- Spec: `docs/modules/iam.md` Sections 13–15 (flow, session, CSRF), 25.1, 27, 40, 41; Section 55 IAM-6.
- `docs/DESIGN_SYSTEM.md` Sections 22.1, 30, 34, 38, 43; `docs/SECURITY.md` Section 19.
- Master Plan Section 7 invariants 2, 3, 17, 19; IAM-MP-12 section.
- Carried forward to IAM-MP-12:
  - R03 contracts to consume (login, callback `authError`, session, CSRF, logout `logoutUrl`) → consumed here (D-05 to D-09).
  - R03 real-browser cookie behavior in Chromium, Firefox and WebKit → IAM-MP-15 (D-03).
  - R03 review S-02 session rotation across sites → IAM-MP-15 (D-03).
  - CP1-17 back-channel logout through local Compose → IAM-MP-15 (D-03).
  - R07 contracts to consume (`/me`, problem codes, `fields`, `503 SERVICE_BUSY` with `Retry-After`, `409` stale writes, page contract) → the client parses the Problem Details contract here (D-07); the administration views consume the rest in IAM-R08B and IAM-R08C.

## 4. Decisions

- **D-01 Split.** The three frontend stages would form one diff of several thousand lines across three screens families, not reviewable in one pass (Master Plan Section 8.3 asks the planner to split then). `IAM-R08` delivers IAM-MP-12; `IAM-R08B` delivers IAM-MP-13; `IAM-R08C` delivers IAM-MP-14. Each stays Tier B. The Master Plan records the split in Section 8.3 and the ledger.
- **D-02 Reviewers.** The IAM-MP-12 audit focus is token/session leakage, CSRF handling, state clearing and the 401/403 distinction, so this run swaps "architecture and boundaries" for "security"; the other is "tests and verification". Architecture is checked by lint (module boundaries, UI rules) and by the run's self-review. IAM-R08B and IAM-R08C keep the reviewers the Master Plan named.
- **D-03 Real-Keycloak browser evidence moves to IAM-MP-15.** Proving `__Host-` cookie acceptance in three engines, rotation across sites and CP1-17 needs a real Keycloak, PostgreSQL and API behind the Playwright suite. IAM-MP-15 owns "focused real-Keycloak browser journeys" and the login/logout/revocation journeys; building that harness here would duplicate it. IAM-MP-12's exit criteria do not depend on it.
- **D-04 No backend change.** `/api/auth/session` returns the user and deadlines; `/api/iam/me` returns the ACTIVE departments and effective permission codes (R07 D-12). Together they satisfy spec Section 41, so the session response is not widened.
- **D-05 Bootstrap.** One query (`['auth']`) reads the session, then `/me`, and resolves to a state, not an exception: `signed-in` (user, deadlines, departments, permission codes), `signed-out` with a reason (`required`, `expired`, `ended`), or `inactive` (`403 IAM_USER_INACTIVE`, the session is revoked by the API). A network failure or another status is a query error: service unavailable with retry, never signed-out. A background refetch that fails keeps the signed-in state (DESIGN_SYSTEM Section 34: background refresh keeps authorized content).
- **D-06 No session timers.** The browser never polls the session and never schedules a request at the idle deadline, because every session read is a use that slides the deadline (R03F); a timer in several tabs would keep an idle session alive. The session state is refreshed on window focus and after any `401` or `403 AUTHORIZATION_DENIED`; the next request after expiry answers `401` and moves the app to signed-out.
- **D-07 HTTP client.** Relative `/api/...` paths only, `credentials: 'same-origin'`, JSON bodies. Unsafe methods carry `X-CSRF-Token`; the token is fetched from `/api/auth/csrf` on first need and held in a module variable (never storage, never the query cache). A `403 CSRF_VALIDATION_FAILED` drops the token and is reported, not retried (the next action fetches a new one). Errors: `ApiProblem` (status, `code`, `fields`, `retryAfterSeconds`) and `NetworkFailure`. Response bodies are checked by small type guards; no validation library is added to the web app.
- **D-08 Sign-in.** A real link to `/api/auth/login` (top-level navigation, spec Section 13). The callback's `authError` (`AUTH_ACCESS_DENIED`, `AUTH_LOGIN_FAILED`, `IDENTITY_PROVIDER_UNAVAILABLE`) is shown on the signed-out page; unknown values are ignored; the parameter is removed from the address with a history replacement once read.
- **D-09 Sign-out.** `POST /api/auth/logout`; on success clear protected state and navigate to `logoutUrl` (only `http:`/`https:` URLs are followed). A `401` means the session is already gone: clear and show signed-out. A network failure keeps the state and reports the error.
- **D-10 Protected-state clearing.** One function removes every query except the liveness check, and the CSRF token. It runs when the auth state leaves `signed-in`, when the signed-in user ID changes (another tab signed in as someone else), on sign-out, and on any `401` from any query or mutation. A query that answers `403 AUTHORIZATION_DENIED` loses its data (the error stays), and the auth state is refetched. Queries may declare `meta.permission`; when the refreshed permission codes no longer include it, the query is removed.
- **D-11 Navigation.** Navigation items declare the permission codes that make them visible (any of); a pure filter drops the rest and empty groups (DESIGN_SYSTEM Section 30). Only destinations that exist are listed: this run has Home only; IAM-R08B adds the first administration item. The filter is UX; the backend decides (invariant 19).
- **D-12 Route structure.** A pathless `_app` layout owns the session gate and the shell; `/` moves under it. The design-system lab (`/dev/ui`) stays outside the gate. The not-found page stays public and uses the shell with the navigation the current state allows.
- **D-13 Signed-out page.** Title, explanation, the sign-in action and the existing system-status region (the liveness check is public and helps when sign-in fails because a service is down). No password or MFA field anywhere (spec Section 40).
- **D-14 Storage lint.** Application code under `apps/web/src` (tests excepted) must not reference `localStorage`, `sessionStorage`, `indexedDB` or `document.cookie`; UI preferences stay inside `@vertex-os/ui`.

No owner decisions: the split is the planner's call (`docs/PLANNING.md` Section 5); no item under "Changes Requiring Explicit Approval" is touched.

## 5. Design notes

### 5.1 States and presentation

| Auth state | Trigger | Presentation |
|---|---|---|
| loading | first bootstrap | shell-free loading state, named region |
| signed-out `required` | `401 AUTHENTICATION_REQUIRED` | sign-in page |
| signed-out `expired` | `401 AUTH_SESSION_EXPIRED` | sign-in page with "session expired" notice |
| signed-out `ended` | `401 AUTH_SESSION_INVALID` | sign-in page with "session ended" notice |
| inactive | `403 IAM_USER_INACTIVE` | sign-in page with "access not active, contact an administrator" notice |
| unavailable | network failure, 5xx, unexpected body | error state with retry; no sign-in claim |
| signed-in | both reads succeed | shell with account area and filtered navigation |

A `401` on `/me` after a successful session read is signed-out; `403 IAM_USER_INACTIVE` on either is inactive.

### 5.2 Account area

The shell's sidebar footer shows the display name, the primary department name when there is one, and a sign-out button. Email and IDs stay out of the always-visible shell.

## 6. Done means

1. Browser code stores no token or session identifier: the only credential is the `HttpOnly` cookie; no application code touches browser storage or `document.cookie` (lint, D-14), and a test shows a full bootstrap and sign-out leave storage without authentication data. (Exit: no token or raw session ID; no storage.)
2. `401`, `403 IAM_USER_INACTIVE`, `403 AUTHORIZATION_DENIED`, session expiry and network failure lead to distinct states, each proven by a component test. (Exit: semantically distinct.)
3. Unsafe requests carry the in-memory CSRF token from `/api/auth/csrf`; a CSRF refusal drops it; proven by tests.
4. Protected queries are removed on sign-out, on `401`, on user change and on permission loss, and lose their data on `403 AUTHORIZATION_DENIED`; proven by tests. (Exit: stale protected data removed.)
5. Navigation shows only items whose permission the user holds; the filter is a presentation helper and the backend authorizes every request. (Exit: visibility is UX only.)
6. Sign-in is a link to `/api/auth/login`; `authError` codes are shown in Arabic and English and removed from the address.
7. Sign-out calls the API with the CSRF token, clears state and follows `logoutUrl`.
8. Arabic and English copy exist for every state; the pages use shared components only (lint `vertex-ui/no-raw-styling`).
9. The Chromium smoke journey shows the signed-out entry in Arabic and English and the failed sign-in path (`IDENTITY_PROVIDER_UNAVAILABLE`) end to end through the real API.

## 7. Stop conditions

Only those of the Run Contract. A needed API or UI-package change would be a scope change: record it and stop only if it touches an approval item.

## 8. Verification

- `pnpm nx run @vertex-os/web:test`, `:lint`, `:typecheck` while working (`NX_DAEMON=false`).
- `pnpm verify` before review.
- `pnpm test:e2e` (smoke journeys changed). No integration suite is touched (no API or persistence change).

## 9. Checklist

- [x] M1 Plan committed; Master Plan split recorded
- [x] M2 HTTP client, CSRF holder, error types, tests
- [x] M3 Auth state: bootstrap query, clearing, query-cache handlers, tests
- [x] M4 Routes, gate, signed-out page, account area, navigation filter, messages, tests
- [x] M5 Storage lint; smoke journeys
- [ ] M6 `pnpm verify`, `pnpm test:e2e`
- [ ] M7 In-run review and fixes
- [ ] M8 Master Plan ledger, hand-off, pull request, CI

## 10. Hand-off

Written at the end of the run.
