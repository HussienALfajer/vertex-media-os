# IAM-R10 — Local password authentication

**Status:** COMPLETE — PR #23 merged; audit-discovered recovery gap is handled by the follow-up fix run  
**Master Plan stage:** Owner-directed IAM-R10 amendment  
**Risk tier:** A — Critical  
**Branch:** `codex/local-auth`  
**Pull request:** [#23](https://github.com/HussienALfajer/vertex-media-os/pull/23)  
**Merged baseline:** `b4031af9492831ac7f9cef366fa966c1a25b4ec7`  
**Baseline commit:** `a5c8e633512afb1f16e06881adb0fb55bf5cc3fb`

## 1. Objective

Replace the external identity-provider login with email and password inside Vertex OS. The
administrator must be able to create staff accounts with passwords and assign roles and
permissions through the existing IAM controls. Preserve access-state enforcement, opaque
application sessions, CSRF protection, and Audit evidence. Remove the Keycloak service, adapter,
configuration and browser journey from the active system.

## 2. Scope

In scope: local credential persistence and migration, login UI/API, staff creation, administrator
bootstrap, authorization, browser and API tests, local infrastructure, canonical docs. Out of
scope: self-service registration, password recovery email, MFA, production deployment.

## 3. Inputs

The owner's explicit 2026-09-25 request, [ADR-0001](../../adr/0001-local-password-authentication.md),
`docs/ARCHITECTURE.md` Section 22, `docs/SECURITY.md` Sections 6–11, and the existing IAM
specification's authorization and lifecycle invariants. Prior provider-specific requirements are
superseded by the owner decision.

## 4. Decisions

- **D-01:** Use salted scrypt hashes stored in IAM. The backend verifies the password and issues
  the existing opaque application session.
- **D-02:** Keep existing IAM roles, grant ceiling and access-state checks. The administrator
  chooses roles when creating a staff account.
- **D-03:** Preserve legacy identity values in a mapping table and reject old provider sessions.
- **D-04:** Bootstrap the first administrator from an environment-supplied password, with no
  credential in source control or command arguments.

**Owner decisions:** The owner explicitly authorized the authentication replacement and no MFA.

## 5. Design notes

Unknown email, wrong password and inaccessible account share one failure response. Login is
rate-limited by address and normalized email. Existing users retain their records; their old
credentials do not become local passwords. An administrator with manage-access permission can
initialize a migrated account's password once through an audited, CSRF-protected API route.
Replacing an already configured password requires a separate future recovery workflow.

## 6. Done means

- [x] Local password hashes, migration and bootstrap are implemented.
- [x] The UI signs in and creates staff with email, password and role selection.
- [x] Keycloak application and local service are removed.
- [x] API, architecture and PostgreSQL integration checks pass.
- [x] Browser end-to-end gate passes.
- [x] Canonical documentation and OpenAPI route definitions reflect the new behavior.
- [x] Tier A review findings are resolved.
- [x] A pull request is opened.

## 7. Stop conditions

The Run Contract in `AGENTS.md` applies. Production database or server operations require a
separate explicit deployment request.
