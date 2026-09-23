# IAM-R04 — Protected-by-Default API and Authorization Context

**Status:** IN_PROGRESS  
**Master Plan stages:** IAM-MP-07  
**Risk tier:** A (reviewers: security; data and concurrency; architecture and boundaries)  
**Branch:** `iam/r04-authorization-context`  
**Baseline commit:** `18952345c5e3e7b1e2fbac5ba4fecb630e349109`

---

## 1. Objective

Make an application session the default requirement of every API route, with an explicit, minimal and test-pinned set of public routes, and give the API the current IAM authorization context of the signed-in user: the ACTIVE user, the ACTIVE departments with the primary one, and the effective permission codes. A route can require a permission code; a missing code is denied (`403 AUTHORIZATION_DENIED`) with Audit evidence. The context is read from committed IAM state on every request that needs it, in one statement, with request-local memoization only, so a removed privilege stops working on the next request. The run also closes the `IAM-CP1` items carried to this stage: the adapter-import residuals in the authentication area (CP1-03), the lint residuals (CP1-04) and the width of the IAM public root (CP1-05).

## 2. Scope

**In scope**

- One global access guard: session required unless the handler is `@Public()`; CSRF verified wherever a session is resolved for an unsafe method; `@RequirePermission(code)`.
- The authorization context: domain value and rules, reader port, PostgreSQL reader, application capability, the bound capability in `apps/api/src/iam`, `requireAuthorization` for handlers, the denial Audit record.
- The IAM public root narrowed; the private composition entry `@vertex-os/iam/composition`.
- CP1-03 and CP1-04 lint rules with `lint:boundaries` probes.
- Tests at every layer (Section 8); ENGINEERING Section 6 and README updates; the Master Plan ledger.

**Out of scope**

- `GET /api/iam/me` and every other IAM HTTP endpoint (IAM-MP-11, "session/current-user contracts", D-10).
- Department, membership, role and permission administration (IAM-MP-08, IAM-MP-09), including whether custom roles may keep or receive mappings to `DEPRECATED` or `RETIRED` codes.
- User lifecycle and session revocation by administrators (IAM-MP-10).
- Rate limiting of denied requests (IAM-MP-15, with the existing rate-limit item).
- Frontend permission UX (IAM-MP-12 to IAM-MP-14).

## 3. Inputs

Specification: `docs/modules/iam.md` Sections 9.2–9.7, 16, 17, 24, 27, 34–36, 44, 51 and IAM-4 (Section 55); `docs/SECURITY.md` Sections 12–14; `docs/ENGINEERING.md` Section 6; Master Plan Section 7 (invariants 1, 6–8, 11, 16, 17, 19, 20) and the IAM-MP-07 section; `IAM_R03_SESSIONS_AND_OIDC_PLAN.md` Section 10; `IAM_R03F_SESSION_REVALIDATION_PLAN.md` Section 10; `audits/IAM-CP1.md` (CP1-03 to CP1-05).

Carried-forward items and their resolution:

| Item | Resolution |
|---|---|
| IAM-02: whether `DEPRECATED` permissions are effective | Not effective (D-06). Mapping rules for custom roles stay with IAM-MP-09. |
| R03: build on the session boundary, do not duplicate it | The guard calls `requireSession`; CSRF moves into it (D-03); the context builds on the resolved session (D-08). |
| R03: bound capabilities only | `IamAuthorization` is bound in `apps/api/src/iam/authorization.ts`; the authentication area never receives the reader (D-11). |
| CP1-03 (Major): dynamic imports and type queries of adapters pass in `src/auth` | Rejected by syntax selectors outside `auth-runtime.ts` and tests; probes (D-13). |
| CP1-04: lint residuals | Template-literal dynamic imports, `import x = require()`, `require()` and `process.env` destructured by assignment or parameter default are rejected repository-wide; probes (D-14). |
| CP1-05: the IAM root exposes dependency types and `ApplicationUser` | The root is narrowed; dependency-taking use cases move to `@vertex-os/iam/composition` (D-12). |

## 4. Decisions

- **D-01 Protected by default.** One global `AccessGuard` replaces `CsrfGuard`. Every Nest route requires a valid application session unless its handler carries `@Public()`. The guard reads the marker on the handler only, never on the controller class, so a method added to a public controller is protected. Reason: spec Section 24 ("a new controller MUST NOT become public merely because a guard annotation was forgotten").
- **D-02 The public set.** Exactly `GET /api/health/live`, `GET /api/health/ready`, `GET /api/auth/login`, `GET /api/auth/callback` and `POST /api/auth/backchannel-logout` (spec Section 24). A route-inventory test built from the application's own OpenAPI document pins the set: every other route answers `401 AUTHENTICATION_REQUIRED` without a session. Swagger UI and its JSON (`/api/docs`, only when `API_DOCS_ENABLED`) are Fastify routes outside the Nest guard and stay governed by existing configuration (spec Section 24).
- **D-03 CSRF inside session resolution.** `requireSession` verifies the CSRF token whenever it resolves a session for an unsafe method (anything but `GET`, `HEAD`, `OPTIONS`). `@CsrfExempt()` is removed; back-channel logout is `@Public()` and never resolves a session. So no code path can use a session on an unsafe request without its token. Status codes and error codes are unchanged (spec Section 15).
- **D-04 Permission requirement.** `@RequirePermission(code)` on a handler: the guard resolves the context and answers `403 AUTHORIZATION_DENIED` (spec Section 27) when the code is not effective. One code per handler; resource decisions stay with the owning module's policy (spec Section 16.3). A handler marked both `@Public()` and `@RequirePermission()` is a programming error: the guard fails closed with `500` and an error log line.
- **D-05 Context shape.** `AuthorizationContext = { userId, accessState: 'ACTIVE', primaryDepartmentId?, departmentIds, permissionCodes }`, frozen, codes and departments de-duplicated and sorted. No role code, role name, role ID, email or persistence type. `hasPermission(context, code)` is a pure function. Both are public (spec Sections 17, 44). Reason: the spec's conceptual contract, and no role identity for downstream code.
- **D-06 Effectiveness.** A permission is effective only when it is held through at least one `ACTIVE` role assigned to the user and its own state is `ACTIVE`; `DEPRECATED` and `RETIRED` are never effective. Only `ACTIVE` departments contribute; `primaryDepartmentId` is present only when the primary membership's department is `ACTIVE`, and no other department replaces it. A user who is not `ACTIVE` has no context. Reason: spec Sections 9.3, 9.6 ("associates one active permission"), 9.7, 16.4; least privilege; IAM-02 I-1 parity with the System Administrator role.
- **D-07 One consistent read.** The PostgreSQL reader returns the user's access state, memberships with department state, and grants with role and permission state in one tagged `$queryRaw` statement: one round trip and one snapshot, whatever the number of roles and permissions (spec Section 51, no N+1). The reader returns facts; the domain applies D-06, so the rules are unit-tested.
- **D-08 Lazy, request-local.** The context is resolved only when a route requires a permission or a handler calls `requireAuthorization`, after `requireSession`, and memoized per request object. No cross-request cache (invariant 11).
- **D-09 Inactive at context time.** When the context read finds the user missing or not `ACTIVE` (a restriction between session check and context read), the session is revoked with reason `ACCESS_REVOKED` and the request answers `403 IAM_USER_INACTIVE`, exactly as `requireSession` does.
- **D-10 Current-user capability.** The capability is `requireAuthorization(runtime, request, reply)`: any handler obtains the current actor's context. The HTTP contract `GET /api/iam/me` (spec Section 25.2) is IAM-MP-11's deliverable ("session/current-user contracts required by the web application") and is not added here.
- **D-11 Composition.** `createIamAuthorization(database, { auditRecorderFor })` in `apps/api/src/iam/authorization.ts` binds the reader and the transaction runner and exposes only `resolveAuthorizationContext(userId)` and `recordAuthorizationDenial(...)`. `AuthRuntime` receives it as `authorization`.
- **D-12 Public root (CP1-05).** Use cases that take dependencies (`signIn`, `resolveSessionUser`, `resolveIdentityUser`, `provisionIdentity`, `reconcileIdentity`, `resendInvitation`, `synchronizeIamReferenceData`, and this run's `resolveAuthorizationContext`, `recordAuthorizationDenial`) and their dependency types move to a private entry `@vertex-os/iam/composition`. Only `apps/api` composition files (`src/iam/**`, `src/commands/**`) and test files may import it (lint). The root keeps identifiers, codes, value and result types, the permission manifest, `AuthorizationContext` and `hasPermission`; `ApplicationUser` leaves it (it stays in `/persistence`). ENGINEERING Section 6 records the entry. Reason: spec Section 44 forbids repositories and mutable internal entities on the public surface; composition is the only legitimate consumer of those types.
- **D-13 Adapter imports in the authentication area (CP1-03).** In `apps/api/src/auth/**`, except `auth-runtime.ts` and tests, dynamic imports and `import()` type queries of `@vertex-os/iam-persistence`, `@vertex-os/audit-persistence` and `@vertex-os/iam-keycloak` are rejected by `no-restricted-syntax`, and `@vertex-os/iam/composition` by the import patterns.
- **D-14 Lint residuals (CP1-04).** Repository-wide: every template-literal dynamic import is rejected, so each dynamic import is a string literal that the Nx tag and package bans see (control C7 becomes a string literal); every `import x = require('…')` and every `require()` call are rejected (the repository is ESM; none exists); `process.env` destructured by assignment or through a parameter default is rejected with the other environment selectors.
- **D-15 Denial evidence.** Spec Section 34 asks for "authorization denials at a useful, non-noisy level". A permission denial of an authenticated, `ACTIVE` user is appended as `iam.authorization.denied`, result `REFUSED`, actor the user, target `iam.permission` with the code, the request's trace ID. `401`, CSRF failures and inactive users are not recorded here (anonymous or already recorded elsewhere). A failed append does not turn the denial into success: the request still answers `403` and the failure is logged. Volume control belongs to the IAM-MP-15 rate-limit item.
- **D-16 Logging.** A denial logs `{ auth: 'authorization-denied', permission }`; no user attribute beyond the request ID correlation, no cookie or session material (spec Section 36).

No owner decisions: nothing here changes an item under "Changes Requiring Explicit Approval", and the specification leaves none of these questions to the owner.

## 5. Design notes

- **Guard order.** `@Public()` → allow (misconfiguration check of D-04 first). Otherwise `requireSession` (cookie → live session → re-validation → ACTIVE user → CSRF for unsafe methods), then, when a permission is required, `requireAuthorization` and the check. Nest runs the guard for HEAD requests Fastify derives from GET routes, so HEAD is protected too.
- **Reader contract.** `readAuthorizationFacts(userId)` returns `undefined` for an unknown user; otherwise `{ accessState, memberships: [{ departmentId, isPrimary, departmentState }], grants: [{ roleState, permissionCode, permissionState }] }`. Unknown enum text from the database throws (fail closed). The statement reads `iam_application_user`, `iam_department_membership` ⋈ `iam_department`, and `iam_user_role_assignment` ⋈ `iam_role` ⋈ `iam_role_permission` ⋈ `iam_permission` through existing primary-key and foreign-key indexes; no migration.
- **Capability outcomes.** `resolveAuthorizationContext(userId)`: `active` with the context, `inactive`, or `not-found`. `recordAuthorizationDenial({ userId, permissionCode, traceId })` appends in one IAM transaction through the runner.
- **Public surface after D-12.** Root: `UserId`, `DepartmentId`, `PermissionCode`, `AuthorizationContext`, `hasPermission`, `SessionUser`, the request and result types of the capabilities, `iamPermissionManifest` with its types, `ReferenceSyncResult` and `ReferenceSyncRefusalReason`. Composition entry: the use cases and `SignInDependencies`, `IdentityProvisioningDependencies`, `AuthorizationDependencies`.

## 6. Done means

1. A route without any annotation requires a session: `401 AUTHENTICATION_REQUIRED` without one, for safe and unsafe methods and for HEAD. *(Exit 1; spec Section 24.)*
2. The route inventory of the running application has exactly the five public routes of D-02; every other route answers `401` without a session. *(Exit 2.)*
3. Unmapped identities never obtain a session, and a user who is not `ACTIVE` is denied on protected routes (`403 IAM_USER_INACTIVE`, session revoked) even with a valid session, including between session check and context read. *(Exit 3; invariants 1, 6.)*
4. `RETIRED` and `DEPRECATED` permissions, permissions held only through `INACTIVE` roles, and `INACTIVE` departments are not in the context; the primary department is absent when its department is `INACTIVE`. *(Exit 4; D-06.)*
5. The context contains only `userId`, `accessState`, `primaryDepartmentId`, `departmentIds` and `permissionCodes`; no role identity or persistence type reaches it or the IAM root declaration. *(Exit 5; spec Sections 17, 44.)*
6. After a mapping removal, an assignment removal, a role deactivation, a permission retirement or deprecation, or a user suspension, the next request is denied with the same session, with no restart and no cache. *(Exit 6; invariant 11.)*
7. A permission denial answers `403 AUTHORIZATION_DENIED` and appends one `iam.authorization.denied` Audit record; an unsafe request with a session but without its CSRF token is refused on every protected route. *(D-03, D-15.)*
8. The context of one request is resolved at most once, by one SQL statement; a second request resolves it again. *(Spec Section 51; D-07, D-08.)*
9. `lint:boundaries` proves CP1-03 and CP1-04 closed and the composition entry restricted; the IAM root no longer exports dependency types or `ApplicationUser`. *(CP1-03, CP1-04, CP1-05.)*

## 7. Stop conditions

- Protected-by-default cannot be made to cover a route class that Nest or Fastify registers outside the guard (other than the documented Swagger routes).
- Narrowing the IAM root would change a public API used outside `apps/api` composition.

## 8. Verification

- `@vertex-os/iam:test`: context projection rules, `hasPermission`, capability outcomes, denial record.
- `@vertex-os/iam-persistence:test:integration`: the reader against PostgreSQL (states, empty sets, unknown user, one statement).
- `@vertex-os/api:test`: guard unit tests (memoization, misconfiguration), route inventory, un-annotated probe controller, CSRF on unsafe probe route.
- `@vertex-os/api:test:integration`: permission allow and deny over HTTP with real PostgreSQL, the privilege-removal sequence of Done means 6, inactive-user race, denial Audit record, existing auth suites unchanged.
- `pnpm lint:boundaries` (new probes), `pnpm verify`.
- CI: `verify:full` and `deps:audit` on the pull request.

## 9. Checklist

- [x] M1 Plan committed
- [ ] M2 Lint residuals and adapter-import rules (CP1-03, CP1-04) with probes
- [ ] M3 IAM root narrowed; composition entry; import sites and lint allowances (CP1-05)
- [ ] M4 Domain context, rules, reader port, capability, denial record; unit tests
- [ ] M5 PostgreSQL reader; integration tests
- [ ] M6 Access guard, `@Public()`, `@RequirePermission()`, CSRF in `requireSession`, `requireAuthorization`, bound capability; API and integration tests
- [ ] M7 Documentation (ENGINEERING Section 6, README); `pnpm verify` and integration suites green
- [ ] M8 In-run review (three reviewers); findings resolved
- [ ] M9 Master Plan ledger, hand-off, pull request, CI green

## 10. Hand-off

Written at the end of the run.
