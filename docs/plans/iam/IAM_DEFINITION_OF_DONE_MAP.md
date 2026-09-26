# IAM — Current Definition of Done and Security Evidence Map

**Decision:** [ADR-0001](../../adr/0001-local-password-authentication.md)  
**Specification:** [IAM Section 61](../../modules/iam.md#61-local-credential-amendment--current-normative-contract) and the provider-independent invariants of the earlier sections  
**Audit owner:** `IAM-FINAL`

This is an evidence index, not an audit verdict. The former map described Keycloak, OIDC, TOTP,
invitation email and tests removed by IAM-R10. Git history preserves that historical map. Current
acceptance must inspect the executable evidence below and the Final Audit record. An item marked
**launch gate** is required before production deployment, but is outside the local module closure.

## 1. Domain, persistence and migration

| Required behavior | Executable evidence | Audit focus |
| --- | --- | --- |
| Users, departments, memberships, roles, permissions and assignments have owned persistence and constraints | `packages/database/prisma/schema/iam.prisma`; `domains/iam-persistence/src/constraints.integration.spec.ts` | Rebuild from an empty PostgreSQL database; check uniqueness, references and no ordinary hard delete |
| Reference permission synchronization and protected System Administrator role are deterministic | `domains/iam-persistence/src/reference-sync.integration.spec.ts`; `apps/api/src/commands/iam-sync-reference.integration.spec.ts` | Repeat synchronization and inspect concurrent role changes |
| The local-auth migration keeps user, role and Audit data, and copies former issuer/subject values | `packages/database/prisma/migrations/20260925060000_local_password_credentials/migration.sql`; `packages/database/src/migration-upgrade.integration.spec.ts` | Check an upgrade, not only a fresh database |
| The first administrator is explicit, serialized and audited | `domains/iam/src/application/bootstrap.ts`; `apps/api/src/commands/iam-bootstrap.ts`; `apps/api/src/iam/local-login.integration.spec.ts` | No default password, second bootstrap refusal, lock order and Audit rollback |
| A migrated ACTIVE administrator with no usable local credential can be recovered once | `recoverMigratedAdministratorCredential` in `domains/iam/src/application/bootstrap.ts`; `apps/api/src/iam/local-login.integration.spec.ts` | Exact operator email and reason, no login-capable administrator, no password overwrite, two competing attempts, Audit rollback |

## 2. Authentication and authorization

| Required behavior | Executable evidence | Audit focus |
| --- | --- | --- |
| Password bounds, salted scrypt hash and verification are backend-owned | `apps/api/src/auth/passwords.ts` and `passwords.spec.ts`; `domains/iam-persistence/src/local-credentials.ts` | Invalid and missing credentials, no hash returned to browser or normal logs |
| Email/password login has generic refusal and bounded attempts | `apps/api/src/iam/sign-in.ts`; `apps/api/src/auth/auth.api.spec.ts`; `apps/api/src/auth/rate-limit.spec.ts`; `apps/api/src/iam/local-login.integration.spec.ts` | Unknown email, bad password, inaccessible user and rate-limit outcomes |
| Opaque, revocable server sessions enforce idle and absolute expiry | `apps/api/src/auth/sessions.ts`; `sessions.integration.spec.ts`; `apps/api/src/auth/primitives.spec.ts` | Cookie flags, old provider sessions rejected, revocation and expiry |
| Protected routes deny by default and unsafe writes require CSRF | `apps/api/src/auth/access.api.spec.ts`; `apps/api/src/iam/http/iam-http.integration.spec.ts`; `apps/api/src/iam/local-login.integration.spec.ts` | No unauthenticated write or permission bypass |
| Current roles and permissions decide every request; access restriction promptly removes access | `apps/api/src/auth/authorization.integration.spec.ts`; `apps/api/src/iam/administration.integration.spec.ts`; `apps/web-e2e/iam/local-login.spec.ts` | Grant ceiling, role removal and suspended session behavior |
| Last ACTIVE System Administrator cannot be removed concurrently | `domains/iam/src/domain/administration-rules.spec.ts`; `apps/api/src/iam/administration.integration.spec.ts` | Lock ordering and competing restrictions |
| Privileged changes have durable MOD-AUDIT evidence | `domains/audit-persistence/src/audit-recorder.integration.spec.ts`; IAM integration tests | Roll back changes when Audit append fails; exclude credential values |

## 3. API, browser and UI

| Required behavior | Executable evidence | Audit focus |
| --- | --- | --- |
| IAM and authentication API contracts match OpenAPI and Problem Details | `apps/api/src/iam/http/iam-http.api.spec.ts`; `apps/api/src/auth/auth.api.spec.ts`; `apps/api/src/openapi/generate-openapi.ts` | Routes, statuses, validation and stable codes |
| Staff creation accepts email, password and selected roles in the Vertex UI | `apps/web/src/features/iam/users/users.spec.tsx`; `apps/web-e2e/iam/local-login.spec.ts` | Arabic and English copy, grant warning, validation and successful sign-in |
| Administration UI respects permissions and handles conflicts and failures | `apps/web/src/features/iam/organization/organization.spec.tsx`; `apps/web/src/features/iam/users/users.spec.tsx`; `apps/web-e2e/src/users-admin.spec.ts`; `apps/web-e2e/src/privileges-admin.spec.ts` | No stale protected data on permission loss; failed refresh is visible; sensitive confirmation states scope and consequences |
| Browser and design system work across supported sizes and engines | `apps/web-e2e/src/lab/`; `apps/web-e2e/src/visual/`; manual QA observations in the Final Audit record | RTL/LTR, mobile layout, keyboard focus, axe and reviewed visual baselines |

## 4. Verification and boundaries

- `pnpm verify` checks formatting, lint including Nx boundaries, boundary probes, types, unit/API/UI
  tests and builds. `pnpm verify:full` adds Prisma validation/generation, PostgreSQL integration
  tests, production/design-system Playwright and the local IAM browser journey.
- `pnpm deps:audit` enforces the reviewed dependency policy. The pull request and merged `main`
  CI runs provide the authoritative full-gate results; the Final Audit cites their links.
- Only IAM, Audit, their persistence adapters, the API composition and the Vertex UI are currently
  implemented domain surfaces. The other V1 modules in `docs/MODULES.md` are ownership plans, not
  features that this IAM audit can declare operational.

## 5. Open launch gates and intentionally deferred behavior

- Before Final IAM acceptance: IAM-R12 removes dormant provider session methods and the unused
  token-encryption startup requirement while preserving legacy migration data. The active local
  sign-in runtime already has no external provider; this item closes literal full-removal scope.
- Before production deployment: benchmark scrypt on the actual server; check new passwords
  against known compromised passwords; configure HTTPS, security alerts and the Contabo deployment
  topology (`docs/SECURITY.md` Sections 8, 28 and `docs/ARCHITECTURE.md` deployment section).
- General password replacement and self-service recovery are deferred; the operator-only
  migrated-administrator recovery cannot serve as a general reset. A legacy user's first password
  is currently initialized through an authenticated API route; no user-detail form exists for it.
- No MFA, TOTP, OIDC, Keycloak, external identity provisioning or invitation email is an active
  requirement after ADR-0001. Historical tests or realm settings are not acceptance evidence.
