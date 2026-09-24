# IAM — Definition of Done and Security Gate Map

**Written by:** run `IAM-R09B` (IAM-MP-15 part 2; plan `IAM_R09B_BROWSER_JOURNEYS_PLAN.md`, D-16)  
**Audited by:** `IAM-FINAL` (Master Plan Section 17)  
**Specification:** `docs/modules/iam.md` Sections 47 and 56

This map names, for each statement of the specification's Definition of Done (Section 56) and each security gate (Section 47), the evidence in the repository and its classification. It is an index for the Final IAM Module Audit, not a substitute for it: the audit checks each piece of evidence and may reclassify it.

**Classification.** **Satisfied**: the named evidence proves the statement in the committed code and configuration. **Satisfied, production item**: proven for the committed local realm and code; the production form is an open item of Master Plan Section 15 (production deployment design). **Blocker**: not satisfied; none is recorded.

**Where the evidence runs.** Unit and API tests: `pnpm test`. Integration tests (PostgreSQL, real Keycloak 26.7.4): `pnpm test:integration`. Browser journeys against the real stack (J-nn): `pnpm test:e2e`, Nx target `@vertex-os/web-e2e:e2e-iam` (Playwright projects `iam-chromium`, `iam-firefox`, `iam-webkit`; specs in `apps/web-e2e/iam/`). All three run in CI through `pnpm verify:full`. Paths below are relative to the repository root; `api` is `apps/api/src`, `persistence` is `domains/iam-persistence/src`, `realm` is `api/keycloak/realm-contract.integration.spec.ts`.

## 1. Definition of Done (spec Section 56)

### Domain and persistence

| Statement | Evidence | Classification |
|---|---|---|
| ApplicationUser, Department, membership, Role, Permission, mappings and assignments are implemented | `packages/database/prisma/schema/iam.prisma`; `persistence/constraints.integration.spec.ts`; `api/iam/administration.integration.spec.ts` | Satisfied |
| Required uniqueness, referential and concurrency constraints exist | `persistence/constraints.integration.spec.ts` (named constraint catalog); `packages/database/src/migrations.integration.spec.ts` | Satisfied |
| The user access lifecycle is enforced exactly | `domains/iam/src/domain/user-lifecycle.spec.ts` ("access transitions"); `api/iam/user-administration.integration.spec.ts` ("access lifecycle"); J-06 | Satisfied |
| Only first activation moves INVITED to ACTIVE; reactivation derives its target; Section 28.1 checks exist | `user-lifecycle.spec.ts` ("reactivation"); `persistence/constraints.integration.spec.ts` ("requires bound identity and first activation for ACTIVE…"); `api/auth/auth-flow.integration.spec.ts` ("never activates twice"); J-03 | Satisfied |
| No security-critical entity is hard-deleted through ordinary workflows | `persistence/constraints.integration.spec.ts` ("rejects deleting referenced user, department, role and permission"); no delete route exists for them (`api/iam/http/iam-http.api.spec.ts`, route catalog) | Satisfied |
| System Administrator lockout protection counts only ACTIVE holders, protects the role, and is concurrency-safe | `domains/iam/src/domain/administration-rules.spec.ts`; `api/iam/administration.integration.spec.ts` ("last ACTIVE System Administrator", concurrent removals); `api/iam/user-administration.integration.spec.ts` (concurrent suspensions); J-13 | Satisfied |
| Permission catalog synchronization is deterministic and idempotent | `persistence/reference-sync.integration.spec.ts`; `api/commands/iam-sync-reference.integration.spec.ts`; the stack setup runs it (J-01 precondition) | Satisfied |

### Identity provider

| Statement | Evidence | Classification |
|---|---|---|
| The Keycloak version is pinned | `api/keycloak/realm-configuration.spec.ts` ("is pinned by tag and digest, identically in Compose and the test harness"); the e2e stack reads the same Compose reference | Satisfied |
| vertex-web and vertex-provisioner responsibilities are separated | `realm` ("vertex-web client", "vertex-provisioner client") | Satisfied, production item (fine-grained narrowing of the provisioner) |
| User provisioning is safe and retryable | `api/iam/identity-provisioning.integration.spec.ts` (lost create response, four concurrent runs, unreachable Keycloak) | Satisfied |
| Reconciliation proves ownership, never duplicates or re-links, and is the only path that changes identities | `identity-provisioning.integration.spec.ts` ("identity conflicts"); `domains/iam/src/application/identity-provisioning.spec.ts` | Satisfied |
| Invitation uses Keycloak required actions | `identity-provisioning.integration.spec.ts` ("the invitation establishes every factor"); J-03 and every journey user | Satisfied |
| Identity synchronization and invitation delivery are tracked, reported and displayed separately | `identity-provisioning.integration.spec.ts` ("invitation delivery"); `apps/web/src/features/iam/users/users.spec.tsx`; J-03 (Account status region) | Satisfied |
| Email and username are immutable and cannot be changed by users in Keycloak | `realm` ("keeps username, email and vertexUserId out of reach of the user-facing account route", "keeps every username or email change route closed"); `iam-http.integration.spec.ts` ("updates only the display name, refusing every other field") | Satisfied |
| Vertex never handles passwords | `users.spec.tsx` ("has no password or verification field"); J-01 to J-13 enter passwords only on Keycloak pages; D-12 token check | Satisfied |
| Disable and reactivation synchronization fails closed | `user-administration.integration.spec.ts` ("keeps access removed when Keycloak is unreachable", "grants nothing when Keycloak is unreachable during reactivation"); J-06 | Satisfied |
| Production MFA policy satisfies the specification | `realm` ("requires TOTP enrolment before a sign-in can complete", "lets no user delete their own OTP credential"); every journey enrols TOTP | Satisfied, production item (production realm form; WebAuthn is a SHOULD) |
| Realm configuration is reviewable and reproducible | `infra/keycloak/import/vertex-realm.json`; `api/keycloak/realm-configuration.spec.ts`; every real-Keycloak suite and the e2e stack import it | Satisfied, production item (never import with unset placeholders) |

### Authentication and session

| Statement | Evidence | Classification |
|---|---|---|
| Authorization code + PKCE S256 works | `realm` ("serves the sign-in page only for the exact registered redirect URI with PKCE S256"); `api/auth/keycloak-login.integration.spec.ts`; J-01 | Satisfied |
| State and nonce are validated | `auth-flow.integration.spec.ts` ("rejects a forged state, a replayed callback and a missing login cookie", "rejects ID tokens with a wrong nonce…"); J-11 (a missing login cookie fails closed) | Satisfied |
| Issuer, audience, signature and expiry are validated | `api/auth/oidc.spec.ts` (wrong issuer, an expired token); `auth-flow.integration.spec.ts` ("rejects ID tokens with a wrong nonce, audience or signature") | Satisfied |
| The browser never receives Keycloak tokens | `keycloak-login.integration.spec.ts` ("gives the browser only the opaque session cookie"); D-12 check on every journey (`/api` headers and bodies, `document.cookie`, web storage); boundary probes V125–V133 (`scripts/check-architecture-boundaries.mjs`) | Satisfied |
| Opaque application sessions are server-side and revocable | `api/auth/sessions.integration.spec.ts` ("stores only hashes and the encrypted tokens"); J-02, J-06, J-07, J-09 | Satisfied |
| Cookies satisfy repository policy | `api/auth/primitives.spec.ts`; J-10 in Chromium and Firefox (host-only, `Secure`, `HttpOnly`, `SameSite=Strict`, no `Max-Age`); J-11 (WebKit keeps no `Secure` cookie over plain HTTP and fails closed; its Linux run is this pull request's CI) | Satisfied when CI is green; production item (WebKit over the production HTTPS origin) |
| Inactivity and absolute expiry satisfy repository policy | `api/config/auth-config.spec.ts` (bounds); `sessions.integration.spec.ts` ("expires at the idle deadline", "never past the absolute deadline"); J-07 expiry | Satisfied |
| CSRF defense protects unsafe requests | `auth-flow.integration.spec.ts` ("CSRF (spec Section 46.6)"); `iam-http.integration.spec.ts` ("refuses every unsafe route without the session CSRF token, or with another session token") | Satisfied |
| Logout revokes the server-side session | `keycloak-login.integration.spec.ts` ("requires the CSRF token, revokes the session and ends the Keycloak session"); J-02, J-10 | Satisfied |
| Back-channel logout revokes applicable sessions | `auth-flow.integration.spec.ts` ("back-channel logout"); `keycloak-login.integration.spec.ts`; J-09 (Docker Desktop path locally; the Linux path is this pull request's CI; CP1-17) | Satisfied when CI is green |
| Protected endpoints are deny-by-default | `api/auth/access.api.spec.ts` ("protected by default") | Satisfied |

### Authorization

| Statement | Evidence | Classification |
|---|---|---|
| An active mapped Vertex user is required in addition to Keycloak authentication | `keycloak-login.integration.spec.ts` ("denies an identity no Vertex user is bound to", "denies a suspended user whose Keycloak identity still works"); J-06 | Satisfied |
| The effective permission context is current and not cached across requests | `api/auth/authorization.integration.spec.ts` ("reflects each privilege removal on the next request of the same session"); `administration.integration.spec.ts` ("changes the next authorization context for every privilege change"); J-04, J-05 | Satisfied |
| Role names are not used as business authorization checks | Routes declare permission codes only (`iam-http.api.spec.ts`, "declares on every IAM handler exactly the permission…"); `domains/iam/src/application/authorization.spec.ts` | Satisfied |
| Business modules can consume stable authorization context without IAM persistence coupling | Nx module boundaries and `pnpm lint:boundaries` probes; `authorization.integration.spec.ts` ("returns only the contract fields") | Satisfied |
| Inactive roles, departments and retired permissions behave correctly | `administration-rules.spec.ts`; `administration.integration.spec.ts`; `authorization.integration.spec.ts` ("keeps inactive departments out of the context"); J-08 | Satisfied |

### API and frontend

| Statement | Evidence | Classification |
|---|---|---|
| OpenAPI covers IAM and auth endpoints | `iam-http.api.spec.ts` ("describes the session, the CSRF header, the body and every problem of each operation"); `api/app.spec.ts` | Satisfied |
| Problem Details and stable error codes are consistent | `api/http/problem-details.spec.ts`; `iam-http.integration.spec.ts`; `apps/web/src/features/iam/iam-problems.spec.ts`; J-13 (`AUTHORIZATION_DENIED`) | Satisfied |
| The IAM administration UI is functional | `users.spec.tsx`, `organization.spec.tsx`; J-03 to J-08, J-13 through the real API | Satisfied |
| No password, MFA or token UI exists in Vertex | `users.spec.tsx`; `apps/web/src/features/auth/signed-out-page.tsx` (no credential field); D-12 | Satisfied |
| Permission-aware UI is present but not security-authoritative | `apps/web/src/app-navigation.spec.ts`; `users.spec.tsx` ("offers only the actions the permission codes and the access state admit"); J-05 and J-13 prove the API refuses independently | Satisfied |
| Accessibility expectations are met | `apps/web-e2e/src/users-admin.spec.ts`, `privileges-admin.spec.ts` (axe, Arabic RTL and English LTR); design-system lab suites | Satisfied |
| Sensitive actions have clear confirmation and conflict handling | `users.spec.tsx` (confirmations, stale writes); `organization.spec.tsx`; J-05 (review step), J-06, J-07, J-08, J-13 (target named in the dialog) | Satisfied |

### Audit and security

| Statement | Evidence | Classification |
|---|---|---|
| Required IAM security events are recorded | `authorization.integration.spec.ts` (denials); `auth-flow.integration.spec.ts` (back-channel logout evidence); `sessions.integration.spec.ts` (session evidence); `administration.integration.spec.ts` and `user-administration.integration.spec.ts` (refusals recorded) | Satisfied |
| Privileged mutations produce durable Audit evidence through MOD-AUDIT | `domains/audit-persistence/src/audit-recorder.integration.spec.ts`; `administration.integration.spec.ts` ("rolls the change back when its Audit evidence cannot be appended"); `sessions.integration.spec.ts` ("rolls the session back when its Audit append fails") | Satisfied, production item (database-level immutability, ADR-0008) |
| Secrets, tokens and session IDs are absent from logs and API responses | Log scans in `auth-flow.integration.spec.ts`, `keycloak-login.integration.spec.ts`, `identity-provisioning.integration.spec.ts`; `realm` ("never writes a generated secret to the Keycloak log"); the e2e teardown scan of the API log (D-13); D-12 | Satisfied |
| Security-negative tests exist | Sections 2 and 3 of this map; `access.api.spec.ts`; J-06, J-11, J-13 | Satisfied |
| The dependency audit passes under repository policy | `pnpm deps:audit` (CI; reviewed exceptions in `pnpm-workspace.yaml`) | Satisfied |
| No default or shared privileged production account exists | No user is seeded (`migrations.integration.spec.ts`, "creates no IAM reference data"); `realm-configuration.spec.ts` ("keeps no credential in the shared server options or the environment template") | Satisfied |
| Bootstrap is idempotent, serialized and non-duplicating; recovery is explicit, audited and leaves one candidate | `user-administration.integration.spec.ts` ("pnpm iam:bootstrap"); `user-lifecycle.spec.ts` ("bootstrap classification"); the stack setup bootstraps the first administrator; J-13 (refusal while one is ACTIVE) | Satisfied |

### Verification

| Statement | Evidence | Classification |
|---|---|---|
| Format, lint and architecture-boundary checks, typecheck, unit tests, build | `pnpm verify` (CI) | Satisfied when CI is green |
| PostgreSQL, Keycloak and API integration tests; Prisma validate and generate | `pnpm verify:full` (CI) | Satisfied when CI is green |
| Playwright critical IAM journeys pass | `pnpm test:e2e` → `e2e-iam` (J-01 to J-13) | Satisfied when CI is green |
| `pnpm verify:full` and `pnpm deps:audit` pass; CI is green | The `Verify (verify:full, deps:audit)` check of the pull request | Satisfied when CI is green |

## 2. Security verification gates (spec Section 47)

| Gate | Evidence (Section 1 rows) | Classification |
|---|---|---|
| Browser code never receives OIDC tokens | "The browser never receives Keycloak tokens" | Satisfied |
| Credentials exist only in Keycloak | "Vertex never handles passwords"; `realm` ("hashes with the configured Argon2id") | Satisfied |
| The application session is opaque and revocable | "Opaque application sessions…" | Satisfied |
| Cookie attributes meet policy | "Cookies satisfy repository policy" | Satisfied, production item |
| Session expiry meets policy | "Inactivity and absolute expiry…" | Satisfied |
| CSRF defense works | "CSRF defense protects unsafe requests" | Satisfied |
| State, nonce and PKCE checks work | Authentication rows 1–3 | Satisfied |
| An unmapped Keycloak identity is denied | "An active mapped Vertex user is required…" | Satisfied |
| An inactive Vertex user is denied | Same row; J-06 | Satisfied |
| Privilege removal is promptly effective | "The effective permission context is current…"; J-05 | Satisfied |
| Resource authorization remains available for business modules | "Business modules can consume stable authorization context…"; the permission-oriented guard leaves resource policy to owning modules (spec Section 16.3) | Satisfied |
| Realm password hashing and policy match `docs/SECURITY.md` | `realm` ("enforces the password policy and hashes with the configured Argon2id") | Satisfied, production item (Argon2id benchmarking on production hardware) |
| MFA is enforced for production staff | "Production MFA policy…" | Satisfied, production item |
| Brute-force protection is enabled | `realm` ("brute-force protection and events") | Satisfied |
| Security and admin event logging is enabled | `realm` ("keeps user and admin events for the security event types", "records administrative changes…") | Satisfied, production item (event retention) |
| Secrets are absent from logs | "Secrets, tokens and session IDs are absent…" | Satisfied |
| Sensitive IAM changes have durable accountability evidence | "Privileged mutations produce durable Audit evidence…" | Satisfied, production item |
| The supply-chain audit remains within repository policy | "The dependency audit passes…" | Satisfied |

## 3. Keycloak policy and configuration map

Each realm setting the specification or `docs/SECURITY.md` requires, and the test that holds it against the pinned Keycloak (`realm` unless named).

| Requirement | Test |
|---|---|
| Discovery publishes the issuer, endpoints and signing keys | "OIDC discovery" |
| Only the exact redirect URI, with PKCE S256 | "serves the sign-in page only for the exact registered redirect URI with PKCE S256" |
| No implicit, password or client-credentials grant for vertex-web; a wrong secret fails | "refuses the implicit flow"; "refuses password and client-credentials grants and a wrong secret"; "lets no client obtain a token through a password or implicit grant" |
| Only the registered post-logout redirect URI | "accepts only the registered post-logout redirect URI" |
| Back-channel logout configured; no roles, full scope or offline access | "is configured for back-channel logout, without roles, full scope or offline access" |
| Provisioner limited to `manage-users`, no interactive flow, refused privileged operations | "vertex-provisioner client" (four tests) |
| User profile: `vertexUserId` validated; username and email not user-editable | "user profile" (three tests) |
| Password policy and Argon2id hashing | "enforces the password policy and hashes with the configured Argon2id" |
| OTP required and not deletable by the user (CP1-15) | "requires TOTP enrolment before a sign-in can complete"; "lets no user delete their own OTP credential (CP1-15)" |
| Brute-force lockout | "brute-force protection and events" (three tests) |
| User and admin events kept for security event types, without payloads | "records administrative changes made by the provisioner without their payloads"; "keeps user and admin events for the security event types" |
| SSO session within the application-session limits; refresh-token rotation | "keeps the SSO session within the application-session limits and rotates refresh tokens" |
| Self-service recovery demands the enrolled OTP and removes no factor | "self-service credential recovery" (five tests) |
| Realm email through the configured SMTP settings | "sends realm email from the configured sender through the SMTP settings" |
| No generated secret in the Keycloak log | "never writes a generated secret to the Keycloak log" |
| Image pinned identically in Compose and harnesses; ports on loopback; placeholders without defaults | `api/keycloak/realm-configuration.spec.ts` |

## 4. Residuals carried to `IAM-FINAL`

- **Reactivated permissions (IAM-R09 D-12).** A DEPRECATED permission made ACTIVE again by a released catalog change widens roles that map it; whoever reactivates it reviews those roles.
- Every "production item" above is listed in Master Plan Section 15 under the production deployment design.
