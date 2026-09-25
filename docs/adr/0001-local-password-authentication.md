# ADR 0001: Local password authentication

**Status:** Accepted by the owner in the current authentication change request.

## Problem

Vertex OS previously required Keycloak, OIDC, MFA and invitation email to authenticate staff. The owner requires sign-in inside Vertex OS using email and password alone, with administrators creating employee accounts and assigning roles and permissions in the application.

## Decision

Vertex OS owns credential verification in the IAM boundary. The browser posts email and password to `POST /api/auth/login`. The API stores a salted, memory-hard scrypt hash on the IAM user row and issues the existing opaque, `Secure`, `HttpOnly`, `SameSite=Strict` application session cookie. The browser never stores the password or session secret. IAM access state and roles remain authoritative for every request. There is no MFA, TOTP, OIDC, SSO or external identity provider in the active sign-in flow.

An administrator creates an employee with email, password and selected roles. The existing role-permission catalog and grant ceiling continue to decide which permissions may be assigned. An account becomes active at its first successful sign-in. The operator creates the first administrator through an explicit bootstrap command; no default password is committed.

## Alternatives considered

- Retaining Keycloak with password-only policy would still require a separate service and identity-provider interface, contrary to the owner's requirement.
- Moving credentials to the browser would expose them to client-side storage and undermine the server-owned session boundary.
- Adding another identity service would increase infrastructure without meeting the requested simplicity.

## Consequences and migration

The API, not Keycloak, now protects password hashes. TLS, password hashing, rate limiting, generic failed-login responses, session expiry, CSRF protection and audit evidence are required. Existing IAM users and audit records are retained; former issuer and subject values are copied to a legacy mapping table before the active identity becomes local. Existing sessions backed by identity-provider tokens are rejected. Legacy users without a local password require an administrator-set password before they can sign in. The Keycloak development service and dependency are removed.

## Validation

Verify database migration and Prisma generation; unit tests for password hashing and login validation; integration tests for failed and successful login, administrator creation of a role-bearing employee, session and CSRF behavior, suspension and session revocation; browser tests of the login and employee forms; and repository build, lint and typecheck gates.
