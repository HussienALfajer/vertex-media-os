# IAM-R07 — IAM/Auth HTTP Administration Surface and OpenAPI

**Status:** IN_PROGRESS  
**Master Plan stages:** IAM-MP-11  
**Risk tier:** A (reviewers: security; architecture and boundaries; tests and verification)  
**Branch:** `iam/r07-http-administration`  
**Baseline commit:** `a8bbc1c7fdc26d17aec706d92f831682474efc4b`

---

## 1. Objective

Expose the accepted IAM capabilities over stable, validated, protected HTTP contracts (spec Section 25): the current user, the user directory and detail, user creation and lifecycle actions, memberships, role assignments, departments, roles, role-permission mappings and the permission catalog. Controllers stay thin: they validate transport input, pass the session's own USER actor as the Audit attribution, call one bound capability and map its outcome through one table to a DTO or an RFC 9457 problem with a stable code. Before the reactivate route is mounted, reactivation gets the grant ceiling the owner decided (spec Section 23.1, IAM-R06 review SEC-2). The generated OpenAPI document describes every route, and tests prove each protected operation's allowed actor, unauthenticated and missing-permission denials, invalid-state denials, contract and Audit side effect.

## 2. Scope

**In scope**

- The grant ceiling for reactivation in `reactivateUser` (SEC-2), with a store read of the target's grant.
- Read capabilities: the user directory and detail, departments, roles with their mappings, the permission catalog (a read port, its queries and its PostgreSQL adapter).
- The HTTP surface of spec Sections 25.2 to 25.8 in `apps/api/src/iam/http`, composed by an `IamModule`.
- Transport validation, the IAM outcome → problem mapping, the pagination convention, `GET /api/iam/me`.
- Platform pieces the surface needs: the provisioning configuration in the HTTP runtime, the session-revocation capability exported by the authentication module (AB-1), the mapping of lock-wait and transaction timeouts to a stable error (R05 DC-2), `fields` on validation problems.
- OpenAPI: every new route; CP1-18 (back-channel logout request body and 400 body).
- Carried-forward items listed in Section 3.
- `docs/ENGINEERING.md` Section 6 (where inbound transport lives) and Section 11 (the pagination convention); `README.md` where the API's routes or configuration are described.

**Out of scope**

- Frontend (IAM-MP-12 to IAM-MP-14); `GET /api/auth/session` stays as IAM-R03 built it.
- An administrative credential-recovery action (spec Section 54; IAM-R06 D-17).
- New use-case semantics beyond SEC-2; hardening items attached to IAM-MP-15.

## 3. Inputs

Specification `docs/modules/iam.md`: Sections 9.1, 10.7, 16, 17, 19, 20, 22, 23, 23.1, 24–27, 31.2, 32, 34, 35, 40–42, 44, 46.5, 46.6, 52, 53 and IAM-5 (Section 55). Master Plan Section 7 (invariants 1, 2, 7, 8, 11, 16, 17, 19, 20), the IAM-MP-11 section, and the amendment records of 2026-09-24. Previous hand-off: `IAM_R06_USER_LIFECYCLE_PLAN.md` Section 10 (and R06 Section 5.8, R05 Section 5.6 for the intended mapping). `docs/ENGINEERING.md` Sections 6, 11–13; `docs/SECURITY.md` for data minimization and escalation.

Carried-forward items and their resolution:

| Item | Resolution |
|---|---|
| R02: outcome mapping; responses for `no-action-required` and `superseded` | D-05: the mapping table; `no-action-required` is `200` with `invitation: "NO_ACTION_REQUIRED"`; `superseded` is `409 IAM_OPERATION_SUPERSEDED`. |
| CP1-18: back-channel logout request body and 400 body | D-14. |
| R04: `GET /api/iam/me` on `CurrentActor` | D-12. |
| R05 S-1 (decided): grant ceiling → `403 IAM_GRANT_EXCEEDS_ACTOR`, current actor as attribution | D-05, D-07. |
| R05: routes over `createIamAdministration`, mapping of R05 Section 5.6, codes the specification lacks | D-05. |
| R05 AB-3: root types for DTOs | D-18. |
| R05 DC-2: lock-wait timeouts; S-6: validate every field first | D-15; D-04. |
| R06: routes over `createIamUserAdministration`, mapping of R06 Section 5.8; `UserView` as the DTO without the identity mapping | D-05, D-06. |
| R06 SEC-1: always the session's USER actor, never `systemAttribution`, proven by a test | D-07. |
| R06 AB-1: bind `revokeUserSessions` to `AuthRuntime.sessions` | D-09. |
| R06 SEC-2 (decided): grant ceiling for reactivation before the route is mounted | D-11. |
| R06 AB-9: `createIamUserAdministration` has no production consumer | Resolved: `IamModule` consumes it. |

## 4. Decisions

- **D-01 Where inbound transport lives.** IAM's controllers, request schemas, response DTOs and outcome mapping live in `apps/api/src/iam/http`. `apps/api/src/iam/iam.module.ts` composes the bound capabilities (administration, user administration, directory) and mounts the controllers; the composition files beside it stay the only IAM code that imports adapters or `@vertex-os/iam/composition`. Lint forbids both in `src/iam/http/**`, as it does for the authentication area. The domain projects stay free of NestJS (ENGINEERING Section 6). Recorded in `docs/ENGINEERING.md` Section 6.
- **D-02 Read capabilities.** A read port `IamDirectoryReader` with its queries in `domains/iam` (`application/directory.ts`: they validate the query and return views) and its adapter in `domains/iam-persistence`, bound as `createIamDirectory` in `apps/api/src/iam/directory.ts`. Reads run outside transactions on committed state, and each read is one statement or one short read-only sequence; it never writes. Views: `UserSummary`, `UserDetail`, `DepartmentView`, `RoleDetail` (`RoleView` and its mapped codes), `PermissionView`.
- **D-03 Pagination and search convention.** Collections take `page` (1–10 000, default 1) and `pageSize` (1–100, default 25) and answer `{ items, page, pageSize, total }`. The order is fixed and total: users by display name then ID; departments, roles and permissions by code. `search` (1–100 characters, trimmed) is a case-insensitive literal substring: users on display name and email, departments and roles on code and name, permissions on code and name; wildcard characters match themselves. Filters: users by `accessState`, `departmentId`, `roleId`; departments and roles by `state`; permissions by `state`. This is a bounded page contract (spec Section 26) and becomes the repository convention in `docs/ENGINEERING.md` Section 11.
- **D-04 Transport validation.** Every body, path parameter and query parameter is parsed with a strict Zod schema (already an API dependency) before a capability is called: types, lengths, UUIDs, enums, collection bounds. An unknown body field, including `email` on `PATCH /api/iam/users/{userId}`, is refused. Failures are `400 VALIDATION_FAILED` with `fields` listing each offending field; a use case's own `invalid` outcome maps to the same problem. The use cases keep their own validation (ENGINEERING Section 12.2).
- **D-05 One outcome → problem table.** `apps/api/src/iam/http/iam-problems.ts` maps every refusal outcome to one status and code, so a code has one spelling across controllers (spec Section 27). The specification's codes as R05 Section 5.6 and R06 Section 5.8 intend them, plus the codes it lacks, named once:

  | Outcome | HTTP | Code |
  |---|---|---|
  | `invalid` (and transport validation) | 400 | `VALIDATION_FAILED` |
  | `version-conflict` | 409 | `IAM_VERSION_CONFLICT` |
  | `superseded` | 409 | `IAM_OPERATION_SUPERSEDED` |
  | `code-taken` (department / role) | 409 | `IAM_DEPARTMENT_CODE_CONFLICT` / `IAM_ROLE_CODE_CONFLICT` |
  | `membership-not-found` | 404 | `IAM_MEMBERSHIP_NOT_FOUND` |
  | `assignment-not-found` | 404 | `IAM_ROLE_ASSIGNMENT_NOT_FOUND` |
  | `unknown-permission` | 422 | `IAM_UNKNOWN_PERMISSION` |
  | `permission-not-assignable` | 409 | `IAM_PERMISSION_NOT_ASSIGNABLE` |
  | `identity-failed` with `identity-conflict` | 409 | `IAM_IDENTITY_CONFLICT` |
  | `identity-failed` otherwise | 503 | `IDENTITY_PROVIDER_UNAVAILABLE` |

  Resend's `no-action-required` is a success (`invitation: "NO_ACTION_REQUIRED"`). A committed local change whose follow-up Keycloak step failed succeeds and reports the resulting states (spec Section 27).
- **D-06 Explicit DTOs.** Request and response contracts are Zod schemas; the same schema validates a request and generates its named OpenAPI component (`z.toJSONSchema`, OpenAPI 3.0 target), and response mappers are typed by the response schemas; instants as ISO 8601 strings; an absent description or optional instant is `null`. No response carries the identity mapping, a token, a session identifier or a persistence type. The directory list omits security metadata (`invitationSentAt`, `firstActivatedAt`, `lastAccessStateChangedAt`, `version`), which the detail carries (spec Section 42). Every IAM response is `Cache-Control: no-store`.
- **D-07 The actor is the session's user.** Every mutation builds its attribution from `CurrentActor` (the authorization context the guard resolved): USER actor = the session's user, trace ID = the request ID, and the optional reason. `src/iam/http` never builds a SYSTEM attribution. A test proves that successful and REFUSED Audit records written through the routes name the session's user (SEC-1).
- **D-08 Reasons.** An optional `reason` (Audit's rule: trimmed, 1–500 code points, no control characters) on suspend, disable, terminate, reactivate, revoke-sessions, role assignment, role deactivation and mapping replacement; never required (spec Section 53). `DELETE` routes take no body and no reason.
- **D-09 Session revocation binding (AB-1).** The authentication module exports a second capability, `USER_SESSION_REVOCATION`, bound to `AuthRuntime.sessions.revokeUserSessions`; `IamModule` injects it into `createIamUserAdministration`. `AuthRuntime` stays private. The bootstrap command keeps the session store.
- **D-10 Provisioning configuration in the HTTP runtime.** `createApp` takes the `IdentityProvisioningConfig`; `main.ts` loads it; OpenAPI generation uses placeholders that are never contacted. `CreateAppOptions.identityFetch` replaces the Keycloak adapter's `fetch` for tests, like `oidcFetch`.
- **D-11 Grant ceiling for reactivation (SEC-2, spec Section 23.1).** Reactivation's step-2 transaction locks the target's user row, then decides under that lock: not found, invalid transition, version, then the ceiling. For a USER actor who is not an ACTIVE System Administrator, a target holding the system role is refused, and so is a target whose ACTIVE roles map an ACTIVE permission the actor does not hold effectively (`exceedsGrantCeiling` with the target's grant). The target's assignments are stable under its row lock, because every assignment change takes that lock (R05 D-05). A refusal writes only a REFUSED `iam.user.reactivated` record and returns `grant-exceeds-actor`; no Keycloak call precedes it. `RoleStore` gains `readUserGrant(userId)`: whether the user holds the system role and the ACTIVE codes of its ACTIVE roles.
- **D-12 `GET /api/iam/me`.** Any ACTIVE session, no permission. The authorization context from `CurrentActor` is the authority for the permission codes, the ACTIVE departments and the primary; the directory adds the profile and department names. Response: `user { id, email, displayName }`, `departments [{ id, code, name, isPrimary }]` (ACTIVE only), `permissionCodes` (sorted). No role names (spec Section 41).
- **D-13 Statuses.** Creation `201`; actions and updates `200` with the resulting view or result; `DELETE /users/{userId}/roles/{roleId}` `204`; `DELETE /users/{userId}/departments/{departmentId}` `200` with the resulting primary (its optional `replacementPrimaryDepartmentId` is a query parameter). Membership and assignment results return what the use case reports, not a re-read of the user.
- **D-14 CP1-18.** The back-channel logout operation documents its `application/x-www-form-urlencoded` body (`logout_token`, required string) and its `400` body `{ "error": "invalid_request" }`. Behavior unchanged.
- **D-15 Contention is a stable error (DC-2).** `@vertex-os/database` classifies lock-wait and statement timeouts, lock-not-available, deadlocks, serialization failures and Prisma's interactive-transaction timeout as contention (`isDatabaseContention`), from structured fields only. The global Problem Details filter answers them `503 SERVICE_BUSY` with `Retry-After: 1` on every route, and still logs them through the safe serializer. The exact error shapes are taken from an integration test, not assumed. The driver's `query_timeout` is the statement bound plus 1 s, so the server's cancellation (SQLSTATE 57014) ends a lock wait, not the driver (Section 8.1).
- **D-16 Evidence of each protected operation (spec Section 46.5).** Table-driven over the IAM route inventory: every route needs a session (the existing inventory test covers new routes automatically), every route declares exactly its specification permission, a user without it gets `403 AUTHORIZATION_DENIED` with a denial record, every unsafe route refuses a missing CSRF token. Per operation: the allowed actor, the invalid-state or resource refusals that apply, the contract and the Audit record.
- **D-17 OpenAPI matches routes.** A test pins the generated IAM paths and methods to spec Section 25, requires `401` and `403` problem responses on every protected IAM operation, and `additionalProperties: false` on every request body schema. OpenAPI is generated from the same decorators the routes run on.
- **D-18 Root types.** The root exports the value and state types the DTOs name (R05 AB-3), the read views and the directory query types; no store, reader or dependency type.

No owner decisions. The reactivation ceiling was decided by the owner (2026-09-24). The error codes and the pagination convention are left to implementation by spec Sections 26 and 27. No infrastructure, dependency, migration or authorization-model change is added.

## 5. Design notes

### 5.1 Routes and permissions

| Route | Permission | Capability |
|---|---|---|
| `GET /api/iam/me` | session only | context + directory |
| `GET /api/iam/users`, `GET /api/iam/users/{userId}` | `iam.users.read` | directory |
| `POST /api/iam/users`, `POST …/{userId}/resend-invitation` | `iam.users.create` | user administration |
| `PATCH /api/iam/users/{userId}` | `iam.users.update` | user administration |
| `POST …/{userId}/suspend`, `/disable`, `/reactivate`, `/terminate`, `/sync-identity` | `iam.users.manage-access` | user administration |
| `POST …/{userId}/revoke-sessions` | `iam.sessions.revoke` | user administration |
| `POST …/{userId}/departments`, `PATCH`/`DELETE …/departments/{departmentId}` | `iam.users.manage-departments` | administration |
| `POST …/{userId}/roles`, `DELETE …/roles/{roleId}` | `iam.users.manage-roles` | administration |
| `GET /api/iam/departments`, `GET …/{departmentId}` | `iam.departments.read` | directory |
| `POST /api/iam/departments`, `PATCH …/{departmentId}`, `POST …/activate`, `/deactivate` | `iam.departments.manage` | administration |
| `GET /api/iam/roles`, `GET …/{roleId}` | `iam.roles.read` | directory |
| `POST /api/iam/roles`, `PATCH …/{roleId}`, `POST …/activate`, `/deactivate`, `PUT …/permissions` | `iam.roles.manage` | administration |
| `GET /api/iam/permissions` | `iam.permissions.read` | directory |

### 5.2 Request bodies

- Create user: `email`, `displayName`, optional `memberships [{ departmentId, isPrimary }]` and `roleIds` (at most 100 each).
- Update user: `expectedVersion`, `displayName`, nothing else.
- Suspend, disable, terminate, revoke-sessions: optional `reason`. Reactivate: `expectedVersion`, optional `reason`. Resend-invitation, sync-identity: no body (an empty object is accepted).
- Add membership: `departmentId`, `isPrimary`. Change membership: `isPrimary`. Assign role: `roleId`, optional `reason`.
- Create department or role: `code`, `name`, optional `description`. Update: `expectedVersion`, optional `name`, optional `description` (`null` clears). Activate: `expectedVersion`. Deactivate: `expectedVersion`, and for roles an optional `reason`. Replace mappings: `expectedVersion`, `permissionCodes` (at most 500), optional `reason`.

### 5.3 Responses

- `User`: the `UserView` fields (D-06). `UserDetail`: `User` plus `departments [{ id, code, name, state, isPrimary }]` and `roles [{ id, code, name, state, isSystem }]`. `UserSummary`: `id`, `email`, `displayName`, the three states, `departments`, `roles`.
- Create user: `201 { user }`. Restrictions: `{ user, sessionsRevoked }`. Reactivate: `{ user, target }`. Sync-identity: `{ user, invitation }`. Resend: `{ user, invitation }`. Revoke-sessions: `{ sessionsRevoked, providerSessions: "TERMINATED" | "NO_IDENTITY" | "FAILED" }`. `invitation` values: `SENT`, `FAILED`, `NO_ACTION_REQUIRED`, `NOT_APPLICABLE`, `SUPERSEDED`.
- `Department`: the view with `description: null` when absent. `Role`: the view; `RoleDetail` adds `permissionCodes`. `Permission`: `code`, `owningModule`, `name`, `description`, `state`, `sensitivity`.

### 5.4 Problem Details

`ProblemDetails` gains an optional `fields` (the invalid request field names, never their values). Every IAM refusal is thrown as an `HttpException` carrying `errorCode`, so the existing global filter renders it.

## 6. Done means

1. Every route of spec Sections 25.2 to 25.8 exists, requires a session, declares exactly its permission of Section 5.1 (or none for `/me`), refuses a missing permission with `403 AUTHORIZATION_DENIED` and a denial record, and refuses an unsafe request without a valid CSRF token. *(Exit: allowed actor, unauthenticated and missing-permission denial.)*
2. Every refusal outcome maps through one table to one status and code (D-05); invalid-state and resource refusals are proven per operation. *(Exit: invalid-state denial, stable contract, error-code consistency.)*
3. Every mutation writes its Audit record attributed to the session's USER actor; grant-ceiling refusals over HTTP are `403 IAM_GRANT_EXCEEDS_ACTOR` with a REFUSED record naming that actor and nothing else written. *(Exit: audit side effect; SEC-1.)*
4. Reactivation refuses a non-administrator actor for a System Administrator target and for a target whose ACTIVE roles map an ACTIVE permission the actor lacks, before any Keycloak call; it allows a target within the actor's permissions and is not limited for a System Administrator actor. *(SEC-2.)*
5. Unknown body fields are refused; `PATCH /api/iam/users/{userId}` refuses `email` and every field except `displayName` and `expectedVersion`. *(Exit: over-posting, protected fields.)*
6. No response carries a token, session identifier, identity mapping, credential, Prisma type or stack trace; list responses omit security metadata. *(Exit: data minimization, leakage.)*
7. Collections are bounded by the page contract of D-03 with a total order; search treats wildcards literally. *(Exit: pagination bounds.)*
8. The generated OpenAPI document lists exactly the routes of spec Section 25 under `/api/iam`, with their bodies, success responses and problem responses; CP1-18 is closed. *(Exit: OpenAPI matches routes.)*
9. Revoke-sessions and the restrictions end the target's sessions through `AuthRuntime.sessions` (a revoked session's next request is `401`). *(AB-1.)*
10. A lock wait that exceeds the statement timeout answers `503 SERVICE_BUSY`. *(DC-2.)*
11. `pnpm verify` and the integration suites of every touched project are green; no new dependency.

## 7. Stop conditions

- A route cannot be served without changing a use case's semantics beyond D-11, or without a new authorization rule.
- The pagination or validation contract would need a new dependency.

## 8. Verification

- `@vertex-os/iam:test`: the reactivation ceiling with fakes (ordering: no identity call before a refusal), directory query validation.
- `@vertex-os/iam-persistence:test:integration`: the directory reader (filters, order, search with wildcards, pagination bounds) and `readUserGrant`.
- `@vertex-os/database:test:integration`: contention classification of a real lock wait and a transaction timeout.
- `@vertex-os/api:test`: the outcome table, DTO mappers, request schemas, the route and permission inventory, OpenAPI pins, the public-route inventory (unchanged set).
- `@vertex-os/api:test:integration`: the HTTP suites (PostgreSQL for organization, roles, directory, `/me`, permissions and denials; PostgreSQL with the pinned Keycloak for user routes), the reactivation ceiling in `user-administration.integration.spec.ts`, the contention mapping.
- `pnpm lint:boundaries`, `pnpm verify`, the integration suites of `database`, `audit-persistence`, `iam-persistence` and `api`.
- CI: `verify:full` and `deps:audit` on the pull request.

### 8.1 Deviations and discoveries

- **Prisma `contains` passes LIKE wildcards through.** A search for `100%` also matched `1000`. The directory adapter escapes `\`, `%` and `_`; the reader test pins literal matching of all three.
- **Equal server and driver timeouts raced.** With `statement_timeout` and the driver's `query_timeout` both at 5 s, a probe of six lock waits at the default bounds ended five times with SQLSTATE 57014 and once with a bare driver error ("Query read timeout") that no classifier can recognize; the API contention test failed once with `500` for that reason. The driver bound is now the statement bound plus 1 s (D-15). At short bounds (400 ms) the race did not reproduce even with the margin removed (12 of 12 attempts ended in 57014), so no test discriminates the margin; the API contention test at the default bounds exercises it.
- **Removing the primary membership without a replacement is allowed.** R05's `decideMembershipRemoval` leaves the user without a primary unless a replacement is named; `IAM_PRIMARY_DEPARTMENT_CONFLICT` answers a replacement that is not another membership (spec Section 22: the backend never guesses). The first version of the HTTP test assumed otherwise and was corrected.
- **`createApp` takes the provisioning configuration** (D-10), so every caller changed; tests use `test-support/provisioning-config.ts`. The route inventory of spec Section 25 lives in `test-support/iam-routes.ts`, shared by the contract and integration suites.
- **Test fixtures.** An ACTIVE user needs a bound, synchronized identity (`iam_application_user_active_ck`); the HTTP fixtures bind one under the unreachable test issuer, so revoke-sessions answers `providerSessions: "FAILED"` there and `"TERMINATED"` in the Keycloak suite.

## 9. Checklist

- [x] M1 Plan committed
- [x] M2 Reactivation grant ceiling (use case, store read, unit and integration tests)
- [x] M3 Directory: views, port, queries, adapter, tests; root exports
- [x] M4 Platform: provisioning configuration in `createApp`, session-revocation capability, contention mapping, `fields` on problems, lint rule for `src/iam/http`
- [x] M5 `IamModule`, validation and problem mapping, `/me` and user routes
- [x] M6 Department, membership, role, assignment and permission routes
- [x] M7 OpenAPI pins, CP1-18, `docs/ENGINEERING.md` Sections 6 and 11, README
- [x] M8 HTTP integration suites
- [ ] M9 `pnpm verify` and integration suites green
- [ ] M10 In-run review (three reviewers); findings resolved
- [ ] M11 Master Plan ledger, hand-off, pull request, CI green

## 10. Hand-off

(Written at the end of the run.)
