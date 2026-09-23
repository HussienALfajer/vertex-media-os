# Vertex OS — IAM Module Specification

**Status:** Accepted V1 Implementation Specification  
**Module:** MOD-IAM — Identity, Organization, and Access  
**Repository:** HussienALfajer/vertex-media-os  
**Baseline date:** 2026-09-22  
**Depends on:** docs/PRODUCT.md, docs/ARCHITECTURE.md, docs/MODULES.md, docs/SECURITY.md, docs/ENGINEERING.md, docs/TESTING.md, docs/DESIGN_SYSTEM.md  
**Supersedes:** No earlier IAM module specification

---

## 1. Document Role

This document is the canonical implementation-level specification for the Vertex OS IAM module.

It refines the ownership already established by docs/MODULES.md without changing that ownership. It defines the IAM domain model, invariants, lifecycles, permission model, public capabilities, HTTP surface, identity-provider integration requirements, application-session integration contract, persistence requirements, security controls, testing obligations, implementation order, and Definition of Done.

This document MUST be read together with the repository-wide canonical documents. In case of conflict, the broader source of truth wins for the concern it owns:

1. docs/PRODUCT.md owns product scope and product invariants.
2. docs/ARCHITECTURE.md owns system topology and architectural boundaries.
3. docs/MODULES.md owns module ownership.
4. docs/SECURITY.md owns security policy.
5. docs/ENGINEERING.md owns implementation rules.
6. docs/TESTING.md owns verification strategy.
7. docs/DESIGN_SYSTEM.md owns the UI and design-system contract.
8. this document owns IAM-specific behavior and implementation detail.

This specification intentionally does not turn IAM into an HR system, a generic policy engine, an identity provider, a client portal, or a multi-tenant platform.

Normative keywords MUST, MUST NOT, SHOULD, SHOULD NOT, and MAY are used deliberately.

---

## 2. Baseline Established by the Existing Repository

At the time this specification is written, Phase 0 is complete and the repository contains:

- NestJS on Fastify in apps/api;
- React, Vite, TanStack Router/Query, and Tailwind in apps/web;
- Playwright in apps/web-e2e;
- PostgreSQL and Prisma 7.10.0 through packages/database;
- RFC 9457-compatible Problem Details with stable application error codes and trace IDs;
- same-origin browser-to-API communication;
- structured Pino logging with request correlation;
- OpenAPI generation;
- Nx module-boundary enforcement;
- local-first development;
- no business tables, migrations, seed data, authentication, authorization, users, roles, permissions, or IAM code yet.

The Prisma schema is intentionally empty before IAM. IAM is therefore the first business/domain persistence introduced after Phase 0.

The accepted authentication architecture is already fixed by docs/ARCHITECTURE.md and docs/SECURITY.md:

- Keycloak is the identity provider.
- OIDC Authorization Code Flow with PKCE S256 is used.
- Vertex OS API acts as a confidential-client backend-for-frontend.
- the browser receives only an opaque application-session cookie;
- Keycloak tokens never reach browser application code;
- authentication does not imply authorization;
- Vertex IAM owns application users, organizational membership, roles, permissions, and application access state;
- business domains retain ownership of resource-level authorization decisions.

IAM implementation MUST preserve this baseline rather than redesign it.

---

## 3. Goals

IAM V1 MUST provide a secure, explicit, auditable foundation for every protected Vertex OS module.

The module MUST enable Vertex OS to:

- represent internal application users independently from Keycloak credentials;
- map exactly one active Vertex application user to the corresponding Keycloak identity;
- manage application access lifecycle;
- represent Vertex Media departments;
- represent user-to-department membership;
- manage application roles;
- maintain the canonical permission catalog;
- assign permissions to roles;
- assign roles to users;
- build a stable authorization context for protected operations;
- deny access by default;
- make privilege removal effective promptly;
- support secure account invitation/provisioning through Keycloak;
- revoke Vertex application sessions when access is removed;
- preserve security-relevant history;
- expose narrow public capabilities to other modules without exposing IAM persistence internals.

---

## 4. Explicit Non-Goals

IAM V1 MUST NOT implement:

- password storage, hashing, verification, or reset;
- MFA secret storage or MFA verification;
- a second credential store;
- browser bearer-token authentication;
- OAuth implicit flow;
- resource-owner-password flow;
- public self-registration;
- social login;
- external client accounts;
- client portal identities;
- machine-to-machine identities;
- API keys;
- arbitrary user impersonation;
- generic policy scripting;
- a generic ABAC expression language;
- a wildcard permission engine;
- organization tenancy or tenant isolation;
- payroll, leave, salary, employment contracts, attendance, or other HR functionality;
- project membership, task assignment, approval assignment, or other domain-owned membership;
- Keycloak roles as the source of Vertex application authorization;
- Keycloak groups as the source of Vertex organizational truth;
- Redis, a message broker, or another cache solely for IAM;
- SCIM provisioning in V1;
- deletion of audit/accountability history through ordinary IAM workflows.

If any of these become required, the relevant canonical documents MUST be changed intentionally before implementation.

---

## 5. Single-Company V1 Model

Vertex OS V1 is an internal operating platform for Vertex Media.

IAM MUST therefore model one company context and MUST NOT introduce Tenant, OrganizationTenant, tenantId, tenant routing, tenant-scoped database schemas, or tenant-aware authorization abstractions.

Departments are organizational subdivisions of the one Vertex Media company.

The architecture MAY evolve later, but speculative multi-tenancy would add complexity to every record and authorization decision without a current product requirement.

---

## 6. Responsibility Split

### 6.1 Keycloak owns

Keycloak is authoritative for:

- credential storage;
- password hashing and password policy;
- password reset and credential recovery;
- MFA factors and required actions;
- the identity-provider enabled state;
- the Keycloak SSO session;
- OIDC tokens;
- protocol-level authentication behavior;
- brute-force protection;
- authentication-factor policy.

Vertex OS MUST NOT duplicate these responsibilities.

### 6.2 BFF authentication infrastructure owns

Backend authentication infrastructure, outside the IAM domain model, owns:

- OIDC login initiation;
- state, nonce, and PKCE correlation;
- OIDC callback processing;
- application-session creation;
- server-side token binding;
- application-session cookie issuance;
- application-session expiry and revocation;
- CSRF protection;
- RP-initiated logout;
- Keycloak back-channel logout handling;
- transient login-attempt state.

These concerns SHOULD live in a focused backend authentication area such as apps/api/src/auth and MUST NOT be represented as IAM business entities merely because IAM is the first protected module.

### 6.3 IAM owns

IAM is authoritative for:

- Vertex application user;
- external identity mapping;
- application access state;
- departments;
- department membership;
- roles;
- permission catalog;
- role-to-permission mapping;
- user-to-role assignment;
- IAM administrative invariants;
- application authorization context derived from those records.

### 6.4 Business modules own

Each business module is authoritative for authorization rules that depend on its own resource state.

Examples:

- Projects decides whether an actor with projects.projects.edit may edit a particular project.
- Finance decides whether an actor with finance.payments.record may record a payment in the relevant context.
- Approvals decides whether an actor is an eligible reviewer for a particular approval request.

IAM provides actor identity, coarse capabilities, and organizational context. IAM MUST NOT absorb domain-specific resource policy.

---

## 7. Keycloak Implementation Baseline

The implementation baseline for this specification is Keycloak 26.7.4, the current official release on the baseline date.

The local-development container MUST be pinned to the exact Keycloak version used by the repository and SHOULD additionally be pinned by image digest when practical. The implementation MUST NOT use a floating latest tag.

Two logically separate Keycloak clients MUST be used.

### 7.1 vertex-web client

Purpose: first-party browser authentication through the Vertex BFF.

Requirements:

- confidential client;
- Authorization Code Flow enabled;
- PKCE S256 required;
- exact redirect URIs;
- exact post-logout redirect URIs;
- no implicit flow;
- no direct-access grants;
- client secret server-side only;
- back-channel logout configured;
- no application authorization roles stored in this client.

### 7.2 vertex-provisioner client

Purpose: least-privilege server-to-server provisioning through the Keycloak Admin REST API.

Requirements:

- service account enabled;
- secret server-side only;
- only the minimum realm-management permissions required to query, create, inspect, enable/disable, and update users, revoke their sessions, and send them required-action email;
- MUST NOT receive realm-admin unless a documented security review proves it necessary;
- MUST NOT be exposed to the browser;
- MUST NOT be reused as the interactive OIDC client.

Vertex application authorization MUST remain in IAM even though Keycloak has its own role system.

---

## 8. Production MFA Decision

Vertex OS V1 production MUST require MFA for all staff accounts.

This intentionally exceeds the minimum repository-wide requirement that privileged accounts use MFA and avoids maintaining two authentication-assurance classes during V1.

At minimum, the production Keycloak realm MUST support a strong second factor such as TOTP. WebAuthn/passkeys SHOULD be enabled where operationally practical.

Local and automated test realms MAY use deterministic test credentials and test MFA seeds, but authentication MUST still execute through the real application authentication boundary. Production authentication MUST never contain a test-only bypass.

---

## 9. Domain Model

IAM V1 introduces the following authoritative domain concepts.

### 9.1 ApplicationUser

ApplicationUser represents a person who may access Vertex OS.

Required properties:

| Field | Meaning |
|---|---|
| id | Opaque Vertex user identifier |
| email | Canonical normalized sign-in/contact email; immutable after creation in V1 |
| displayName | User-facing name; the only mutable profile field in V1 |
| accessState | Current Vertex access lifecycle state (Section 10) |
| identitySubject | Keycloak subject identifier; null until identity reconciliation binds it; immutable once bound |
| identityIssuer | Expected Keycloak issuer identifier |
| identitySyncState | Whether Keycloak is confirmed to match what IAM requires (Section 11.1) |
| invitationDeliveryState | Outcome of the latest invitation dispatch (Section 11.3) |
| invitationSentAt | Time of the latest confirmed invitation dispatch, nullable |
| firstActivatedAt | Time of first activation (Section 10); set once, never changed or cleared; nullable |
| lastAccessStateChangedAt | Last access-state transition time |
| createdAt | Creation time |
| updatedAt | Last authoritative update time |
| version | Optimistic concurrency version |

ApplicationUser MUST NOT contain:

- password hashes;
- password-reset tokens;
- MFA secrets;
- refresh tokens;
- access tokens;
- ID tokens;
- Keycloak session records;
- browser session identifiers.

Email MUST be normalized before storage and uniqueness comparison: trim surrounding whitespace and lowercase the entire address with a locale-independent ASCII rule. V1 accepts ASCII addresses only. The normalized value is therefore exactly what Keycloak stores as username and email: Keycloak lowercases both using its JVM default locale, which leaves an already-lowercase ASCII value unchanged, and a Vertex rule that preserved local-part case would let two Vertex users collide on one Keycloak username. The implementation MUST NOT invent provider-specific transformations such as removing dots or plus suffixes.

Email and the identity mapping are immutable in V1:

- email is set at creation and becomes the provisioned identity's Keycloak username and email; no Vertex operation changes it afterwards, and iam.users.update changes displayName only;
- sign-in resolves users by issuer + subject only (Section 13); email is never a sign-in or linking key inside Vertex;
- identityIssuer and identitySubject never change once bound; re-linking a user to a different Keycloak identity is not supported in V1;
- displayName is Vertex presentation data and is not synchronized to Keycloak;
- the Keycloak realm MUST prevent users from changing their username or email (Section 37), and operators MUST NOT change them directly in Keycloak.

Consequently, no profile edit requires a Keycloak update, email re-verification, a sign-in identifier change, or session revocation. A mistyped address on an INVITED user is corrected by terminating that user and creating a new one; the terminated user's address remains reserved. Changing the address of an existing user is deferred (Section 57).

### 9.2 Department

Department represents a Vertex Media organizational unit.

Required properties:

- id;
- code;
- name;
- description, optional;
- state: ACTIVE or INACTIVE;
- createdAt;
- updatedAt;
- version.

Department code MUST be a stable semantic code suitable for references and reporting. Renaming a department MUST NOT silently change its stable code.

V1 does not require department hierarchy. parentDepartmentId MUST NOT be introduced unless an actual operational requirement is approved.

### 9.3 DepartmentMembership

DepartmentMembership represents current organizational membership.

Required properties:

- userId;
- departmentId;
- isPrimary;
- createdAt;
- updatedAt.

Rules:

- a user MAY belong to multiple active departments;
- a user MUST NOT have duplicate membership in the same department;
- a user MUST have at most one primary department;
- inactive departments MUST NOT contribute active organizational scope to authorization context;
- historical audit evidence MUST preserve membership changes even when the current membership row changes.

Department membership is organizational context, not project membership and not task assignment.

### 9.4 Role

Role aggregates coarse application permissions.

Required properties:

- id;
- code;
- name;
- description, optional;
- state: ACTIVE or INACTIVE;
- isSystem;
- createdAt;
- updatedAt;
- version.

Role codes are stable identifiers. Changing a display name MUST NOT change permission semantics.

System roles are repository-defined and protected from unsafe deletion or semantic repurposing.

Custom roles MAY be created by authorized administrators.

### 9.5 Permission

Permission is a stable capability identifier known to application code.

Required properties:

- code;
- owningModule;
- name;
- description;
- state: ACTIVE, DEPRECATED, or RETIRED;
- sensitivity: STANDARD, SENSITIVE, or PRIVILEGED.

Permissions MUST be code-defined and synchronized into persistence from reviewed module manifests or seed definitions.

Administrators MUST NOT create arbitrary permission codes through the UI.

Permission codes MUST use lowercase dot-separated names:

    <module>.<resource>.<action>

Examples:

    iam.users.read
    iam.users.create
    iam.users.update
    iam.users.manage-access
    iam.users.manage-roles
    iam.departments.read
    iam.departments.manage
    iam.roles.read
    iam.roles.manage
    iam.permissions.read
    iam.sessions.revoke

A permission code is a coarse capability. It is not proof of access to every resource of that type.

Wildcard permissions such as iam.* or * MUST NOT be supported in V1.

### 9.6 RolePermission

RolePermission associates one active permission with one role.

Rules:

- duplicate mappings are forbidden;
- retired permissions MUST NOT become effective;
- changes become effective on the next authorization evaluation;
- role-permission changes are security-sensitive and require durable accountability evidence.

### 9.7 UserRoleAssignment

UserRoleAssignment assigns a role directly to a user.

Rules:

- duplicate assignments are forbidden;
- inactive roles MUST NOT contribute effective permissions;
- direct permission assignment to a user is not supported in V1;
- roles MUST NOT be inferred from department names;
- role assignment and department membership remain separate concepts.

This intentionally keeps the V1 model understandable: users receive roles; roles receive permissions; departments provide organizational context.

---

## 10. User Access Lifecycle

UserAccessState is a closed set:

- INVITED
- ACTIVE
- SUSPENDED
- DISABLED
- TERMINATED

Identity synchronization and invitation delivery are tracked separately from access state (Section 11); neither grants access.

First activation is the INVITED → ACTIVE transition performed by the user's first successful eligible sign-in (Section 13). It is the only operation that sets firstActivatedAt, which is never changed or cleared afterwards. firstActivatedAt is therefore null exactly for users who have never completed first activation: every ACTIVE user has it, and no INVITED user has it.

### 10.1 INVITED

The user record exists and may have a provisioned Keycloak identity, but the user has not yet completed first activation.

INVITED users MUST NOT receive an authenticated Vertex application session until the Keycloak authentication flow succeeds and the identity mapping is validated.

The first successful eligible sign-in transitions INVITED to ACTIVE atomically with application-session establishment or immediately before it. No administrative operation can move a user from INVITED to ACTIVE.

### 10.2 ACTIVE

The user may receive application sessions, subject to authentication and authorization. An ACTIVE user has completed first activation.

ACTIVE alone grants no business permission.

### 10.3 SUSPENDED

Temporary administrative suspension. It applies to activated and never-activated users alike.

Effects MUST occur immediately in Vertex:

- new application sessions denied;
- all current Vertex application sessions revoked;
- effective permissions empty for protected operations.

The backend MUST then disable the identity in Keycloak through identity reconciliation (Sections 11.2 and 31.1).

### 10.4 DISABLED

Security or administrative disablement.

It has the same access-denial effect as SUSPENDED but represents a stronger administrative/security state.

Leaving DISABLED requires the explicitly authorized reactivation operation (Section 10.7) and audit evidence.

### 10.5 TERMINATED

The account is no longer permitted to access Vertex OS.

Termination MUST:

- revoke all Vertex sessions immediately;
- disable the Keycloak identity;
- preserve the Vertex user record;
- preserve role/membership history through audit evidence;
- preserve the identity mapping for investigation;
- never hard-delete the user through normal application workflows.

TERMINATED is terminal in V1. Rehire/reinstatement after termination is a future explicit workflow rather than an implicit state reversal.

### 10.6 Allowed transitions

Allowed transitions are:

| From | To | Operation | Guard |
|---|---|---|---|
| INVITED | ACTIVE | first activation at sign-in (Section 13) | sets firstActivatedAt |
| INVITED | SUSPENDED, DISABLED, TERMINATED | administrative | — |
| ACTIVE | SUSPENDED, DISABLED, TERMINATED | administrative | last-System-Administrator rule (Section 20) |
| SUSPENDED | DISABLED, TERMINATED | administrative | — |
| DISABLED | TERMINATED | administrative | — |
| SUSPENDED, DISABLED | ACTIVE | reactivation (Section 10.7) | firstActivatedAt is set |
| SUSPENDED, DISABLED | INVITED | reactivation (Section 10.7) | firstActivatedAt is null |

Any other transition, including DISABLED → SUSPENDED and any transition out of TERMINATED, MUST be rejected with IAM_INVALID_ACCESS_TRANSITION.

### 10.7 Reactivation

Reactivation is one administrative operation for SUSPENDED or DISABLED users. The backend, never the caller, derives its target:

- firstActivatedAt set → ACTIVE;
- firstActivatedAt null → INVITED.

Reactivation restores sign-in eligibility only. It never creates an application session, never sets firstActivatedAt, never changes Keycloak credentials, required actions, or MFA enrollment, and never re-sends an invitation that was already attempted (Section 11.3). Every reactivated user must complete a full Keycloak authentication, including any pending required actions and MFA, before receiving a session; a user returned to INVITED becomes ACTIVE only through first activation.

Reactivation follows the ordering in Section 31.2.

---

## 11. Identity Synchronization and Invitation Delivery

Keycloak identity synchronization and invitation delivery are external I/O and MUST NOT run inside a database transaction. They are different operations with different outcomes and are tracked by two separate states. Neither state grants or denies Vertex access; access is decided by accessState alone (Section 10).

User creation starts with accessState = INVITED, identitySyncState = PENDING, invitationDeliveryState = NOT_SENT, and identitySubject = null. The application commits the Vertex user first, then performs Keycloak work outside the database transaction.

### 11.1 Identity synchronization state

IdentitySyncState is a closed set:

- PENDING — a committed local change requires Keycloak work that is not yet confirmed (in progress or interrupted);
- SYNCED — Keycloak was last confirmed to match what IAM requires;
- FAILED — the latest attempt failed, had an unknown outcome, or found a conflict; retry or administrative resolution is required.

What IAM requires of Keycloak follows from accessState:

| accessState | Required Keycloak identity |
|---|---|
| INVITED, ACTIVE | exists, is linked to this user, and is enabled |
| SUSPENDED, DISABLED, TERMINATED | none is created; an existing owned identity is disabled and its Keycloak sessions are terminated |

Every committed local change that alters this requirement sets identitySyncState = PENDING in the same transaction. SYNCED means only that the identity requirement above is met; it says nothing about invitation delivery or about the user completing required actions.

### 11.2 Identity reconciliation

Identity reconciliation is the single IAM capability that brings Keycloak to the required state. User creation, access changes, reactivation, the sync-identity endpoint (Section 25.3), and bootstrap (Section 21) all use it; no other code path creates, links, enables, or disables Keycloak identities. It reads the committed user and takes the requirement from its accessState; only reactivation substitutes the target state it is about to commit (Section 31.2). It is idempotent and safe to repeat at any time:

1. Locate the identity: by the bound identitySubject, otherwise by exact username equal to the normalized email.
2. Prove ownership before any access-increasing step (link, create, enable): the identity's username equals the normalized email, its vertexUserId attribute equals the Vertex user ID, and, when a subject is bound, the subject matches. Access-reducing steps (disable, session termination) apply to a bound identity without further proof.
3. An identity that cannot be proven owned MUST NOT be linked, modified, or deleted by Vertex; the result is FAILED with IAM_IDENTITY_CONFLICT, resolved by an operator in Keycloak. A bound identity that no longer exists in Keycloak is also a conflict; V1 never replaces or re-links it.
4. If no identity exists, no subject is bound, and the required state is INVITED, create the identity enabled, with username and email equal to the normalized email and the vertexUserId attribute set in the same create request. A duplicate-user rejection (Keycloak 409) returns to step 1, so an identity created by a concurrent or previously lost request is found and linked rather than duplicated.
5. Bind identityIssuer and identitySubject with a version-checked write if they are not yet bound.
6. Apply the required enabled state and, for a denied state, terminate the identity's Keycloak sessions.
7. Record SYNCED; on error or unknown outcome record FAILED without changing accessState.

The vertexUserId attribute is non-secret ownership evidence. The realm user profile MUST declare it with administrator-only view and edit permissions (Section 37): an attribute a user could edit would let that user claim another user's pending identity.

### 11.3 Invitation delivery

Invitation delivery asks Keycloak, through the Admin API execute-actions email capability, to send the required-action email for at least email verification, password establishment, and the MFA enrollment required by realm policy. Vertex never sees the link it contains.

InvitationDeliveryState is a closed set recorded after every dispatch attempt:

- NOT_SENT — no dispatch has been attempted (initial state);
- SENT — Keycloak confirmed that it sent the email; invitationSentAt records when;
- FAILED — the latest attempt failed or its outcome is unknown; invitationSentAt keeps the latest confirmed dispatch, if any.

NOT_SENT means never attempted; FAILED without invitationSentAt means never delivered; FAILED with invitationSentAt means a resend failed after an earlier success. SENT confirms dispatch only, not receipt or completion; completion is observable only as first activation (Section 13).

Rules:

- dispatch requires accessState = INVITED and identitySyncState = SYNCED; Keycloak itself refuses email actions for disabled identities or identities without an email address;
- the first dispatch is part of provisioning: whenever reconciliation leaves an INVITED user SYNCED with NOT_SENT, the invitation is dispatched next (creation, sync-identity, reactivation to INVITED, and bootstrap);
- once an attempt has been made, further dispatches occur only through an explicit resend (Section 25.3) or a bootstrap resume (Section 21);
- dispatch failure MUST NOT roll back the identity or change accessState; it changes identitySyncState only when Keycloak reports the identity missing or disabled, which is recorded as FAILED;
- a resend is safe to repeat and never alters credentials or required actions;
- after the user leaves INVITED, invitationDeliveryState is retained as history and MUST NOT be presented as an outstanding condition.

---

## 12. Account Creation and Invitation Flow

The canonical creation flow is:

1. Authorized administrator submits email, display name, department memberships, and initial roles.
2. Backend validates permissions and input.
3. Backend normalizes email and checks local uniqueness.
4. Backend validates referenced departments and roles.
5. Backend writes the new ApplicationUser, memberships, and role assignments in one database transaction with the initial states of Section 11.
6. Transaction commits.
7. Provisioning capability obtains a service-account token for vertex-provisioner and runs identity reconciliation (Section 11.2): the Keycloak user is created enabled with the normalized email as username and email and the vertexUserId attribute, and the returned subject is bound; identitySyncState becomes SYNCED, or FAILED.
8. If identitySyncState is SYNCED, the invitation is dispatched (Section 11.3) and invitationDeliveryState is recorded.
9. IAM records security/audit evidence for the creation, reconciliation, and dispatch results.
10. API returns the user representation, including accessState, identitySyncState, and invitationDeliveryState.

Vertex OS MUST NOT generate, display, accept, transmit, or store the user's password.

Creation is never retried by re-submitting POST /api/iam/users: a request whose normalized email already exists fails with IAM_EMAIL_CONFLICT and creates neither a second Vertex user nor a second Keycloak identity. Incomplete provisioning of an existing user is resumed through identity reconciliation (sync-identity, Section 25.3), which also performs the first invitation dispatch if it has never been attempted.

---

## 13. Login and Activation Flow

The login flow belongs to BFF authentication infrastructure, but IAM participates at a defined boundary.

The canonical flow is:

1. Browser requests GET /api/auth/login.
2. Backend creates a short-lived server-side OIDC login attempt containing state, nonce, and PKCE verifier.
3. Browser is redirected to Keycloak.
4. Keycloak authenticates the user and enforces required actions/MFA.
5. Keycloak redirects to the exact Vertex callback URI.
6. Backend verifies state, exchanges the code using PKCE, validates issuer, audience, signature, nonce, expiry, and protocol requirements.
7. Backend extracts issuer and subject from the validated identity.
8. IAM resolves exactly one ApplicationUser by identity issuer + subject. It never resolves or links a user by email or any other claim.
9. IAM denies unmapped, SUSPENDED, DISABLED, or TERMINATED users. A successful Keycloak authentication for a mapped user in a denied state shows that the Keycloak identity is not disabled; IAM MUST also record identitySyncState = FAILED so the mismatch is visible and can be reconciled.
10. If the user is INVITED, IAM performs first activation (Section 10): a conditional update from INVITED at the expected version to ACTIVE that sets firstActivatedAt. If the update loses a race with a concurrent change, such as a suspension or a parallel first sign-in, IAM re-resolves the user and applies steps 9–10 to the current state; firstActivatedAt is never overwritten.
11. Backend creates a server-side application session.
12. Browser receives only the opaque secure HttpOnly application-session cookie.
13. Browser is redirected to the application.

Authentication success in Keycloak MUST NOT create a Vertex user implicitly.

Unknown Keycloak identities receive no Vertex access and MUST produce a security event without revealing unnecessary account detail to the browser.

---

## 14. Application Session Design

Application sessions are platform authentication state, not IAM domain entities.

PostgreSQL MUST be used for the V1 application-session store. Redis MUST NOT be introduced solely for sessions.

A session record SHOULD contain only what is required to enforce the application-session policy, for example:

- hashed opaque session identifier;
- userId;
- createdAt;
- lastSeenAt;
- idleExpiresAt;
- absoluteExpiresAt;
- revokedAt;
- revocationReason;
- identity-provider session identifier where available;
- encrypted server-side token material only when required for OIDC lifecycle behavior;
- CSRF token hash;
- token-encryption key version if token material is persisted.

The raw session identifier MUST NOT be stored in plaintext if a one-way hash can identify the session.

Session IDs MUST be generated with cryptographically secure randomness.

Session cookies MUST follow docs/SECURITY.md:

- Secure;
- HttpOnly;
- SameSite=Strict by default;
- Path=/;
- no Domain attribute unless a documented deployment requirement proves otherwise;
- no sensitive user data in the cookie.

Production SHOULD use the strongest supported host-scoped cookie prefix. Local development MUST preserve Secure-cookie semantics and MUST NOT add an insecure production fallback.

Default session limits are repository policy:

- inactivity timeout ≤ 60 minutes;
- absolute lifetime ≤ 24 hours.

Session authorization MUST NOT embed a long-lived snapshot of roles/permissions. Effective authorization context MUST be resolved from current IAM state for each protected request, with request-local memoization allowed. Cross-request permission caching is forbidden in V1 unless invalidation is proven correct.

This guarantees prompt effect for role removal, permission removal, suspension, and disablement.

---

## 15. CSRF Design

All unsafe cookie-authenticated requests MUST require explicit CSRF proof.

V1 SHOULD use a synchronizer token bound to the server-side application session.

Requirements:

- token generated with cryptographically secure randomness;
- only a hash stored with the session;
- browser obtains the token through an authenticated same-origin endpoint/response;
- browser keeps it in memory rather than persistent browser storage;
- unsafe methods require the token in a dedicated request header;
- server compares it in constant-time where practical;
- missing or invalid proof fails closed;
- logout requires CSRF proof;
- safe methods MUST NOT perform state-changing business work.

OIDC state validation remains mandatory and is separate from ordinary application CSRF protection.

---

## 16. Authorization Model

Vertex OS uses:

**RBAC for capability assignment + contextual/resource authorization for actual resource access.**

### 16.1 Coarse capability

IAM answers whether the actor currently holds a permission code.

Example:

    projects.projects.edit

This does not mean the actor may edit every project.

### 16.2 Organizational context

IAM provides current active department membership and primary department information.

### 16.3 Resource policy

The owning business module combines coarse permission with its own resource state.

Example:

    hasPermission(projects.projects.edit)
    AND ProjectsPolicy.mayEdit(actor, project)

The business module MUST NOT authorize by role name.

Role names are administrative grouping tools; permission codes are the stable coarse capability contract.

### 16.4 Deny by default

If any required authorization input is missing, invalid, inactive, unknown, or cannot be resolved safely, the operation MUST be denied.

### 16.5 No identifier-based access

Knowledge of user IDs, department IDs, role IDs, or later business resource IDs MUST never imply authorization.

---

## 17. Authorization Context Public Contract

IAM MUST expose a narrow public application capability that resolves the current actor.

Conceptual contract:

    AuthorizationContext
      userId
      accessState
      primaryDepartmentId?
      departmentIds
      permissionCodes

Other modules SHOULD depend on capability-oriented methods or this stable value object through IAM's public surface.

IAM internal entities, repositories, Prisma types, role tables, and permission join tables MUST NOT be imported by other modules.

The authorization context SHOULD omit role names for normal business authorization so downstream code is not tempted to authorize by role identity.

Useful public capabilities include:

- resolveActor(userId);
- resolveAuthenticatedIdentity(issuer, subject);
- hasPermission(actor, permissionCode);
- requirePermission(actor, permissionCode);
- listActiveDepartmentIds(userId);
- isActiveUser(userId).

The exact TypeScript shape may evolve during implementation, but its semantics MUST match this document.

---

## 18. Permission Catalog Ownership and Evolution

IAM owns the canonical stored permission catalog and role-permission relationships.

Each owning module defines the permission codes that represent its own coarse capabilities.

A reviewed manifest/synchronization mechanism MUST register those permissions into IAM persistence.

Rules:

- permission codes are stable contracts;
- a code MUST NOT be silently repurposed;
- removing a feature SHOULD deprecate or retire its permission rather than reusing the code for another meaning;
- retired permissions are never effective;
- permission definitions are code-reviewed;
- UI administrators can map existing permissions to roles but cannot invent new codes;
- adding a new permission requires tests proving protected behavior denies users who lack it.

---

## 19. Initial IAM Permission Set

IAM implementation MUST register at least the following permissions:

| Permission | Purpose |
|---|---|
| iam.users.read | View IAM user directory and user details |
| iam.users.create | Create/provision invited users and resend invitations |
| iam.users.update | Update displayName, the only mutable profile field in V1 |
| iam.users.manage-access | Suspend, disable, reactivate, or terminate access; retry identity synchronization |
| iam.users.manage-roles | Grant and remove user roles |
| iam.users.manage-departments | Manage user department memberships |
| iam.roles.read | View roles and their permission mappings |
| iam.roles.manage | Create/update/deactivate custom roles and edit mappings |
| iam.permissions.read | View the permission catalog |
| iam.departments.read | View departments |
| iam.departments.manage | Create/update/activate/deactivate departments |
| iam.sessions.revoke | Revoke application sessions for another user |

The module implementation MAY split a permission when a concrete security requirement requires finer control, but it MUST NOT create dozens of speculative permissions.

---

## 20. System Administrator Role

IAM MUST seed one protected system role:

**Code:** system-administrator  
**Name:** System Administrator

Properties:

- isSystem = true;
- active by default;
- receives every active permission registered in the permission catalog;
- permission synchronization is code-controlled;
- administrators MUST NOT remove individual permission mappings from this role through ordinary UI or API;
- the role MUST NOT be deleted, renamed, or deactivated through ordinary UI or API.

Attempts to change the role in these ways fail with IAM_SYSTEM_ROLE_PROTECTED.

The system MUST protect against administrative lockout.

An ACTIVE System Administrator is a user whose accessState is ACTIVE and who holds the system-administrator role. INVITED, SUSPENDED, and DISABLED holders do not count.

Any operation that would reduce the number of ACTIVE System Administrators from one or more to zero MUST fail atomically with IAM_LAST_SYSTEM_ADMIN. Such operations are:

- removing the role from an ACTIVE user;
- suspending, disabling, or terminating an ACTIVE holder.

Operations on holders that are not ACTIVE do not change the count and are not blocked by this rule.

Bootstrap recovery mode (Section 21.3) removes the System Administrator role assignment from SUSPENDED and DISABLED holders. It runs only when the ACTIVE count is already zero and never touches an ACTIVE holder, so it neither engages nor weakens this rule.

The count check and the mutation MUST commit in one transaction that is serialized against every other operation able to reduce the count and against bootstrap (Section 21), for example by locking the system-administrator role row or by SERIALIZABLE isolation with retry. Per-user optimistic versions alone are insufficient: two concurrent operations on different administrators could each observe a remaining administrator and together remove both.

No default shared System Administrator user may exist.

---

## 21. Bootstrap Administrator

A fresh installation needs an explicit path to its first System Administrator.

IAM implementation MUST provide an intentional, non-default, idempotent, operator-run bootstrap command. It is not an HTTP endpoint.

### 21.1 Command rules

The bootstrap command MUST:

- require explicit operator input for the administrator's email and display name;
- never use a committed default username, email, or password;
- create the user only through the normal creation, identity reconciliation, and invitation capabilities (Sections 11–12), assigning the protected System Administrator role in the same transaction that creates the user;
- never create or set credentials: the administrator establishes password and MFA through the Keycloak invitation;
- never create an application session;
- never print passwords, tokens, client secrets, or session identifiers;
- record audit/security evidence attributed to the bootstrap system process, including the mode and the outcome;
- be documented for local and production operation.

### 21.2 Candidate detection

A bootstrap candidate is any user holding the system-administrator role whose accessState is not TERMINATED. The command decides what to do only from committed IAM state, never from local files or earlier command output:

| Committed state | Normal-mode result |
|---|---|
| No candidate | Create one candidate, then reconcile and invite |
| Exactly one candidate, INVITED, with the operator-supplied normalized email | Resume: reconcile unless SYNCED; dispatch the invitation unless SENT, or re-dispatch a SENT invitation only on explicit operator request; otherwise report completion without change |
| An ACTIVE System Administrator exists | Refuse; further administrators are managed through IAM administration |
| Any other candidate set (different email, several candidates, or only SUSPENDED/DISABLED candidates) | Refuse; recovery mode is required |

Resuming never changes the candidate's stored display name, roles, or memberships. Refusals report a stable, distinguishable reason. A user ceases to be a candidate only when it is terminated or its System Administrator role assignment is removed, and recovery mode (Section 21.3) is the only bootstrap path that does either.

### 21.3 Recovery mode

Recovery mode is an explicit command option that requires an operator-supplied reason and is audited as a distinct action. It is allowed only when no ACTIVE System Administrator exists. In one serialized transaction it supersedes every existing candidate and then creates exactly one new INVITED candidate, so the command always leaves exactly one live candidate:

| Existing candidate | Recovery result |
|---|---|
| INVITED | TERMINATED (Section 10.5); the record, its identity mapping, and its role history are kept |
| SUSPENDED or DISABLED | the ApplicationUser and its accessState are unchanged; only the protected System Administrator role assignment is removed |

No user is deleted, and the INVITED to TERMINATED transition that supersession requires is the only access-state change recovery makes. Removing a role assignment neither restores access nor alters what IAM requires of Keycloak for that user (Section 11.1), so it leaves identitySyncState untouched: a superseded SUSPENDED or DISABLED holder stays denied, keeps its disabled Keycloak identity, and remains visible for review by the recovered administrator. Because recovery runs only when no ACTIVE System Administrator exists, every superseded candidate is non-ACTIVE and the last-System-Administrator rule (Section 20) is not engaged. Each supersession and the creation are audited individually inside the recovery action (Section 34).

If the new candidate's normalized email already belongs to any user, including a terminated one, the transaction fails and nothing changes.

Keycloak work runs only after that transaction commits: identity reconciliation disables the terminated candidates' identities and terminates their Keycloak sessions in the fail-closed order of Section 31.1, and the new candidate is reconciled and invited (Sections 11.2 and 11.3). A failure at that stage records identitySyncState = FAILED for the affected user and restores no access.

An ACTIVE System Administrator who has lost credentials or MFA is recovered in Keycloak (Section 54), not through bootstrap.

### 21.4 Concurrency and failure

- Candidate evaluation, the supersession of existing candidates including its role-assignment removals, and candidate creation run in one database transaction serialized against concurrent bootstrap invocations and against System Administrator count changes (Section 20). A concurrent invocation that loses re-evaluates and then resumes or refuses; at most one candidate is created.
- Keycloak calls happen only after that transaction commits.
- An ambiguous Keycloak failure leaves the candidate PENDING or FAILED. Re-running the command resumes through reconciliation, which finds and links an identity created by the lost request instead of creating another (Section 11.2); Keycloak's realm-unique username is the final backstop against a duplicate identity.
- Concurrent resumes of the same candidate are safe because reconciliation is idempotent; a duplicate invitation email is harmless.

Keycloak's bootstrap master-realm administrator is infrastructure administration and MUST NOT be treated as a Vertex application administrator.

---

## 22. Department Rules

Departments support organizational context, not access by themselves.

Rules:

- only ACTIVE departments appear as active authorization context;
- membership in a department does not automatically grant permissions;
- assigning a user to an INACTIVE department is forbidden;
- one user may belong to multiple departments;
- no more than one membership is primary;
- removing the primary membership MAY select a replacement explicitly; the backend MUST NOT silently guess;
- deactivating a department immediately removes it from effective authorization context;
- historical references and audit evidence MUST remain resolvable;
- ordinary application workflows MUST NOT hard-delete departments.

---

## 23. Role Rules

Rules:

- only ACTIVE roles contribute permissions;
- custom roles may be created, edited, activated, and deactivated by authorized administrators;
- system roles are protected;
- deactivating a role immediately removes its permissions from effective authorization context while preserving assignment history in accountability evidence;
- role codes are unique and stable;
- role names are display data and MUST NOT be used as authorization checks;
- a user may have multiple roles;
- duplicate assignments are forbidden;
- direct user-permission grants are forbidden in V1.

### 23.1 Grant ceiling

No administrator can grant more than they hold (owner decision, 2026-09-24). An actor who is not an ACTIVE System Administrator:

- may assign a role, or activate a custom role, only when every ACTIVE permission mapped to that role is among the actor's own effective permissions;
- may add a permission to a custom role's mappings only when the actor holds that permission effectively;
- may never assign the system-administrator role.

Removing a role, removing a mapping, and deactivating a role are not limited by the ceiling. An ACTIVE System Administrator holds every ACTIVE permission and is therefore not limited. The ceiling is evaluated inside the same serialized transaction as the change, against the actor's committed state; a system process (bootstrap) is not subject to it. A refused grant changes nothing, is recorded as a REFUSED Audit record, and fails with IAM_GRANT_EXCEEDS_ACTOR (403).

---

## 24. Protected-by-Default HTTP Policy

After IAM authentication infrastructure is introduced, API routes MUST be protected by default.

Public routes MUST be explicitly marked and limited to genuine public technical/authentication requirements.

At minimum, these remain public by design:

- liveness endpoint;
- readiness endpoint as currently approved;
- OIDC login initiation;
- OIDC callback;
- Keycloak back-channel logout endpoint, authenticated/validated by protocol rather than browser session.

Interactive API documentation behavior in production remains governed by existing configuration.

A new controller MUST NOT become public merely because a guard annotation was forgotten.

---

## 25. HTTP API Surface

Exact response DTO fields may be refined during implementation, but endpoint responsibility and security semantics MUST remain equivalent.

### 25.1 Authentication/session endpoints

- GET /api/auth/login
- GET /api/auth/callback
- GET /api/auth/session
- GET /api/auth/csrf
- POST /api/auth/logout
- POST /api/auth/backchannel-logout

GET /api/auth/session returns only safe application-session/user context. It MUST NOT expose OIDC tokens.

### 25.2 Current user

- GET /api/iam/me

Returns current user profile, active departments, and UI-useful effective permission codes.

### 25.3 Users

| Endpoint | Permission | Semantics |
|---|---|---|
| GET /api/iam/users | iam.users.read | Directory (Section 42) |
| POST /api/iam/users | iam.users.create | Create and provision (Section 12) |
| GET /api/iam/users/{userId} | iam.users.read | User detail |
| PATCH /api/iam/users/{userId} | iam.users.update | Accepts displayName and the expected version only; any other field, including email, is rejected as invalid input (Section 9.1) |
| POST /api/iam/users/{userId}/suspend | iam.users.manage-access | Section 31.1 |
| POST /api/iam/users/{userId}/disable | iam.users.manage-access | Section 31.1 |
| POST /api/iam/users/{userId}/reactivate | iam.users.manage-access | Backend-derived target (Section 10.7); ordering in Section 31.2 |
| POST /api/iam/users/{userId}/terminate | iam.users.manage-access | Section 31.1 |
| POST /api/iam/users/{userId}/resend-invitation | iam.users.create | INVITED users only (Section 11.3) |
| POST /api/iam/users/{userId}/sync-identity | iam.users.manage-access | Idempotent identity reconciliation (Section 11.2), allowed in any identitySyncState; never changes accessState |
| POST /api/iam/users/{userId}/revoke-sessions | iam.sessions.revoke | Section 32 |

### 25.4 Department membership

- POST /api/iam/users/{userId}/departments
- PATCH /api/iam/users/{userId}/departments/{departmentId}
- DELETE /api/iam/users/{userId}/departments/{departmentId}

### 25.5 Role assignment

- POST /api/iam/users/{userId}/roles
- DELETE /api/iam/users/{userId}/roles/{roleId}

### 25.6 Departments

- GET /api/iam/departments
- POST /api/iam/departments
- GET /api/iam/departments/{departmentId}
- PATCH /api/iam/departments/{departmentId}
- POST /api/iam/departments/{departmentId}/activate
- POST /api/iam/departments/{departmentId}/deactivate

### 25.7 Roles

- GET /api/iam/roles
- POST /api/iam/roles
- GET /api/iam/roles/{roleId}
- PATCH /api/iam/roles/{roleId}
- POST /api/iam/roles/{roleId}/activate
- POST /api/iam/roles/{roleId}/deactivate
- PUT /api/iam/roles/{roleId}/permissions

### 25.8 Permissions

- GET /api/iam/permissions

Permissions are read-only through the HTTP administrative surface.

---

## 26. API Contract Rules

All IAM HTTP contracts MUST:

- be represented in OpenAPI;
- use explicit request/response DTOs;
- validate untrusted input;
- reject unknown sensitive-write fields;
- use opaque IDs;
- use RFC 9457 Problem Details for failures;
- include stable error codes;
- never serialize Prisma types directly;
- never expose Keycloak access tokens, refresh tokens, ID tokens, client secrets, session IDs, password data, MFA secrets, or internal stack traces.

Collection endpoints MUST adopt the repository's eventual common pagination/filtering convention. Until a shared convention exists, IAM SHOULD use a simple explicit cursor or bounded page contract rather than unbounded list responses.

---

## 27. Error Codes

At minimum, IAM/auth implementation MUST define stable codes for meaningful client behavior.

Recommended baseline:

| HTTP | Code |
|---|---|
| 401 | AUTHENTICATION_REQUIRED |
| 401 | AUTH_SESSION_INVALID |
| 401 | AUTH_SESSION_EXPIRED |
| 403 | AUTHORIZATION_DENIED |
| 403 | CSRF_VALIDATION_FAILED |
| 403 | IAM_USER_INACTIVE |
| 404 | IAM_USER_NOT_FOUND |
| 404 | IAM_DEPARTMENT_NOT_FOUND |
| 404 | IAM_ROLE_NOT_FOUND |
| 409 | IAM_EMAIL_CONFLICT |
| 409 | IAM_IDENTITY_CONFLICT |
| 409 | IAM_IDENTITY_SYNC_INCOMPLETE |
| 409 | IAM_INVALID_ACCESS_TRANSITION |
| 409 | IAM_INVITATION_NOT_APPLICABLE |
| 409 | IAM_LAST_SYSTEM_ADMIN |
| 409 | IAM_SYSTEM_ROLE_PROTECTED |
| 403 | IAM_GRANT_EXCEEDS_ACTOR |
| 409 | IAM_ROLE_INACTIVE |
| 409 | IAM_DEPARTMENT_INACTIVE |
| 409 | IAM_DUPLICATE_ROLE_ASSIGNMENT |
| 409 | IAM_DUPLICATE_DEPARTMENT_MEMBERSHIP |
| 422 | IAM_PRIMARY_DEPARTMENT_CONFLICT |
| 503 | IDENTITY_PROVIDER_UNAVAILABLE |

IAM_IDENTITY_SYNC_INCOMPLETE means the operation requires a linked identity with identitySyncState = SYNCED (for example resend-invitation); sync-identity resolves it. IAM_INVITATION_NOT_APPLICABLE means an invitation was requested for a user who is not INVITED. IAM_IDENTITY_CONFLICT means reconciliation found an identity it cannot prove it owns (Section 11.2).

Operations report outcomes by one rule. When the authoritative local change committed and only a follow-up Keycloak step failed (create, suspend, disable, terminate), the operation succeeds and returns the resulting identitySyncState and invitationDeliveryState. When remote success is a precondition of the change (reactivation) or is itself the requested effect (resend-invitation, sync-identity), failure returns IDENTITY_PROVIDER_UNAVAILABLE or IAM_IDENTITY_CONFLICT after recording the FAILED state.

Exact naming SHOULD be finalized once in code and tests. Similar errors MUST NOT acquire multiple spellings across controllers.

---

## 28. Persistence Model and Database Invariants

IAM persistence MUST use PostgreSQL through the existing Prisma infrastructure boundary.

The exact Prisma model names may differ from domain names, but the following constraints are mandatory.

### 28.1 User constraints

- primary key on user ID;
- unique normalized email across all users, including TERMINATED users;
- unique identityIssuer + identitySubject when identitySubject is present;
- accessState, identitySyncState, and invitationDeliveryState constrained to their closed enums;
- check constraints: accessState = ACTIVE requires identitySubject and firstActivatedAt; accessState = INVITED requires firstActivatedAt to be null;
- application code never updates email, a bound identityIssuer/identitySubject, or a set firstActivatedAt;
- optimistic concurrency version incremented on protected updates.

### 28.2 Department constraints

- unique department code;
- state enum;
- no hard-delete cascade that could erase historical relationships unexpectedly.

### 28.3 Membership constraints

- unique userId + departmentId;
- at most one primary membership per user, enforced transactionally and preferably with an appropriate database constraint/index where Prisma migration support permits;
- valid foreign keys.

### 28.4 Role constraints

- unique role code;
- protected isSystem semantics;
- state enum.

### 28.5 Permission constraints

- permission code is unique and stable;
- owning module recorded;
- state and sensitivity are controlled values.

### 28.6 Join constraints

- unique roleId + permissionCode;
- unique userId + roleId.

Schema constraints MUST protect structural invariants even when application code already validates them.

Migration SQL MUST be reviewed explicitly when Prisma cannot express a required PostgreSQL constraint declaratively.

---

## 29. No Hard Delete for Security-Critical IAM State

Normal HTTP workflows MUST NOT hard-delete:

- ApplicationUser;
- Department;
- Role;
- Permission.

Lifecycle/state changes preserve referential and accountability history.

Join rows such as current role assignments or department memberships MAY be removed as current-state relationships, provided the required before/after evidence is preserved through the approved audit capability.

---

## 30. Concurrency

Security-sensitive IAM mutations MUST be concurrency-safe.

At minimum:

- user access-state transitions, including first activation and reactivation;
- identity binding during reconciliation;
- System Administrator removal/disablement;
- bootstrap;
- primary-department changes;
- role-permission replacement;
- user-role assignment changes.

The implementation SHOULD use optimistic concurrency versions plus database transactions and constraints. Rules that span several rows, such as the last-System-Administrator rule and bootstrap candidate detection, additionally require the serialization defined in Sections 20 and 21.

A stale administrator screen MUST NOT silently overwrite newer role, permission, or access changes.

Where an API updates a versioned resource, it SHOULD require the expected version in the request or use an equivalent conditional-write mechanism.

---

## 31. External I/O and Transaction Boundaries

Remote Keycloak calls MUST NOT occur while a PostgreSQL transaction is held open.

Operations that combine local security state and Keycloak state MUST be ordered fail-closed.

### 31.1 Removing access

For suspend/disable/terminate:

1. commit local access denial together with identitySyncState = PENDING, applying the Section 20 rule where relevant;
2. revoke local application sessions;
3. run identity reconciliation, which disables the Keycloak identity and terminates its Keycloak sessions;
4. if reconciliation fails, keep local access denied and record identitySyncState = FAILED for retry through sync-identity.

Local security MUST NOT be rolled back merely because the external provider is unavailable. While synchronization is FAILED the Keycloak identity may still authenticate, but IAM denies every such sign-in and flags the mismatch (Section 13), so Vertex access cannot be re-established.

### 31.2 Restoring access

For reactivation:

1. validate authorization, that the user is SUSPENDED or DISABLED, and derive the target state (Section 10.7);
2. record identitySyncState = PENDING with a version-checked write;
3. make Keycloak satisfy the target state's requirement through identity reconciliation: enable the owned identity or, for a never-provisioned user returning to INVITED, create and bind it;
4. commit the target accessState with identitySyncState = SYNCED, conditional on the version written in step 2;
5. if step 3 fails, accessState is unchanged, identitySyncState becomes FAILED, and the operation fails (Section 27);
6. if step 4 fails, for example because of a concurrent change, the identity may be enabled while IAM still denies access; the operation MUST immediately reconcile against the committed state and leave identitySyncState = FAILED if that cannot complete.

Vertex access is never granted before step 4 commits. A user returned to INVITED then receives the first invitation dispatch if invitationDeliveryState is NOT_SENT (Section 11.3).

This ordering prevents an external synchronization failure from granting Vertex access prematurely.

---

## 32. Session Revocation Semantics

Session revocation MUST be server-side.

The following events revoke all Vertex application sessions for the target user:

- suspension;
- disablement;
- termination;
- explicit administrator revoke-sessions action;
- security-critical credential recovery event when Vertex receives/initiates the relevant signal;
- Keycloak back-channel logout for the corresponding identity/session;
- confirmed account compromise response.

Logout revokes the current session at minimum and SHOULD also terminate the associated Keycloak SSO session using the approved OIDC logout mechanism.

A revoked session identifier MUST never become valid again.

---

## 33. Keycloak Back-Channel Logout

The vertex-web client MUST configure a back-channel logout endpoint.

The endpoint MUST:

- validate the logout token according to OIDC requirements;
- verify issuer, audience/client binding, signature, and required claims;
- locate affected session(s) by identity-provider session identifier or subject as allowed by the protocol;
- revoke matching Vertex sessions;
- be idempotent;
- return a protocol-appropriate response without exposing session details;
- record a security event.

It MUST NOT trust arbitrary browser POSTs merely because the path is public.

---

## 34. Security Events and Audit Dependency

IAM is security-sensitive and cannot be considered complete without durable accountability.

IAM MUST record security events for at least:

- successful application-session establishment;
- logout/session revocation;
- unmapped identity sign-in denial;
- inactive-user sign-in denial;
- user creation, identity reconciliation, and invitation dispatch/resend results;
- first activation, suspension, reactivation (with its derived target), disablement, and termination;
- department membership changes;
- role assignment/removal;
- role permission changes;
- role activation/deactivation;
- department activation/deactivation;
- authorization denials at a useful, non-noisy level;
- Keycloak synchronization failures and sign-in mismatches (Section 13);
- System Administrator changes, including bootstrap and recovery invocations and each candidate that recovery supersedes.

Logs are not sufficient audit evidence.

The separate MOD-AUDIT module owns canonical AuditRecord according to docs/MODULES.md. Therefore IAM MUST integrate through an Audit public capability and MUST NOT create a competing generic audit subsystem inside IAM.

Because IAM is the first business module, implementation has one acceptable closure path if the full Audit module has not yet been built:

- implement only the minimal MOD-AUDIT foundation required to append immutable audit evidence through its future public boundary;
- do not build Audit search/UI/reporting scope prematurely;
- keep ownership and package boundaries aligned with MOD-AUDIT so no later migration from an IAM-owned generic audit table is required.

IAM MUST NOT be declared complete while privileged IAM mutations have no durable accountability record.

---

## 35. Audit Evidence Content

For security-sensitive IAM mutations, audit evidence SHOULD include:

- actor Vertex user ID, or the identified system process for bootstrap;
- action code;
- target type and target ID;
- timestamp;
- result;
- request/trace ID;
- relevant before/after state or stable change description;
- reason metadata where the workflow requests an administrative reason;
- source module = IAM.

It MUST NOT contain:

- passwords;
- tokens;
- session IDs;
- client secrets;
- MFA secrets;
- full authorization headers;
- unnecessary sensitive Keycloak payloads.

---

## 36. Logging

Operational logs MUST use the existing structured logger and request correlation.

IAM logs SHOULD include stable identifiers needed for diagnosis, but MUST NOT log:

- raw cookies;
- raw session identifiers;
- OIDC authorization codes;
- access tokens;
- refresh tokens;
- ID tokens;
- PKCE verifiers;
- nonce/state secrets;
- Keycloak client secrets;
- passwords or required-action tokens.

Identity-provider failures MUST be translated to safe categories before logging/returning when the upstream message may contain sensitive detail.

---

## 37. Keycloak Configuration as Code

The Vertex realm configuration MUST be reproducible and reviewable.

Repository configuration SHOULD include non-secret realm/client policy under an infra/keycloak area or equivalent.

Secrets MUST remain in environment/secret management and never in committed realm exports.

At minimum configuration must define:

- realm identity;
- vertex-web client;
- vertex-provisioner service account;
- exact redirect/logout URIs per environment;
- PKCE policy;
- password policy required by docs/SECURITY.md;
- Argon2id hashing policy required by docs/SECURITY.md;
- MFA flow/policy;
- brute-force protection;
- user/admin event logging;
- back-channel logout;
- required actions;
- username and email not changeable by users through any ordinary user-facing route: the realm's "Edit username" setting disabled, the user profile declaring `username` and `email` with `edit` permission for `admin` only, and the Update Email required action left disabled;
- the vertexUserId attribute declared in the user profile with administrator-only view and edit permissions (undeclared attributes are ignored by default);
- email (SMTP) settings for required-action email, with credentials supplied as secrets;
- token/session settings compatible with Vertex application-session limits.

The username and email restriction has four distinct layers, and only the user-profile permission closes it on its own. Verified against the pinned Keycloak 26.7.4 sources:

1. **Server feature.** `update-email` is a supported feature that is on unless explicitly disabled (`Profile.Feature.UPDATE_EMAIL` is declared `Type.DEFAULT`). It was preview in 26.0.0, so this status MUST be read for the pinned patch release rather than for "Keycloak 26" as a whole.
2. **Realm required action.** A realm registers the Update Email required action with `enabled = false` and not as a default action, and the action runs only when the server feature is on and that realm provider is enabled. A Vertex realm therefore starts with it off, and the configuration keeps it off explicitly rather than relying on that default.
3. **User-profile permission.** The Keycloak default user profile grants `edit` on `username` and `email` to both `admin` and `user`. With the Update Email required action disabled and `registrationEmailAsUsername` off, the account route still lets a user edit `email` through the user profile, so disabling the required action is not sufficient by itself. The realm MUST therefore remove `user` from the `email` attribute's `edit` permission. Username has an equivalent realm-level gate in "Edit username", which is off by default; the user-profile restriction is stated for both attributes so that neither depends on a single default. A user profile that makes email read-only additionally causes the Update Email action to be skipped and cleared should it ever be enabled.
4. **Vertex policy.** Email and username are immutable after creation in V1 (Section 9.1), so every ordinary user-facing route to change them is closed. These user-profile permissions deliberately do not restrict the Admin REST API, which is what lets vertex-provisioner set username and email at creation (Section 11.2); operators MUST NOT use that capability to change them afterwards.

Changing a user's email remains a deferred decision (Section 57): V1 defines no email-change workflow in Vertex or in Keycloak.

Manual console-only configuration is not an acceptable production source of truth.

---

## 38. Local Development Infrastructure

IAM implementation MUST extend local development intentionally.

At minimum:

- add a Keycloak 26.7.4 local service bound to loopback only;
- use Keycloak development mode only for local development/test, never production;
- create local Keycloak master-realm bootstrap-admin credentials from ignored/generated environment values, never committed defaults;
- keep Vertex PostgreSQL behavior from Phase 0 intact;
- make realm/client setup reproducible;
- make startup health/readiness deterministic;
- update pnpm env:setup and .env.example with new non-production secrets/configuration without printing secret values;
- document reset behavior clearly.

No production deployment design is implied by the local start-dev configuration.

---

## 39. Configuration

Raw environment access MUST remain centralized through the existing typed configuration loader.

IAM/auth configuration will require typed values equivalent to:

- OIDC issuer URL;
- OIDC client ID;
- OIDC client secret;
- OIDC redirect URI;
- post-logout redirect URI;
- Keycloak admin/provisioner client ID;
- Keycloak admin/provisioner client secret;
- Keycloak realm;
- session idle timeout;
- session absolute timeout;
- login-attempt timeout;
- token-encryption key material;
- invitation/required-action lifespan;
- optional local Keycloak host/port.

Sensitive values MUST be validated without echoing them in startup errors.

Security parameters MUST not be scattered through feature code.

---

## 40. Frontend Requirements

IAM V1 frontend MUST provide an internal administrative experience using the Vertex in-house design system.

At minimum:

- signed-out state with sign-in action;
- authenticated application shell awareness;
- current-user identity display;
- user directory;
- user detail;
- create/invite user;
- access-state actions;
- department management;
- role management;
- role-permission editor;
- user role assignments;
- user department memberships;
- identity synchronization and invitation delivery status, with sync-identity and resend-invitation actions where authorized;
- session revocation action where authorized;
- clear loading, empty, success, conflict, and error states.

Frontend rules:

- no password form in Vertex OS;
- no MFA-secret form in Vertex OS;
- no browser token handling;
- no localStorage/sessionStorage authentication state;
- route visibility may reflect permissions for UX, but server authorization remains authoritative;
- destructive/sensitive actions require explicit confirmation;
- stale-write conflicts must be surfaced rather than silently overwritten;
- access state, identity synchronization, and invitation delivery are three separately labeled facts; invitation delivery is shown only while the user is INVITED;
- the reactivation action and its result state the outcome the backend derives: restored to ACTIVE, or returned to INVITED pending first activation;
- Arabic/RTL-first delivery follows docs/DESIGN_SYSTEM.md;
- shadcn MUST NOT be introduced.

Access-state and identity-synchronization labels follow docs/DESIGN_SYSTEM.md Section 33. InvitationDeliveryState extends that IAM mapping, using the tone icons of the same DESIGN_SYSTEM.md section:

| State | Tone | Arabic / English label |
|---|---|---|
| NOT_SENT | neutral | لم تُرسل الدعوة / Invitation not sent |
| SENT | success | أُرسلت الدعوة / Invitation sent, with invitationSentAt |
| FAILED | danger | تعذّر تأكيد إرسال الدعوة / Invitation not confirmed, with the resend action |

If shared UI primitives are missing, IAM work MAY add the minimum reusable primitives to the approved Vertex UI package rather than creating a private parallel component system.

---

## 41. Frontend Session Bootstrapping

The web application SHOULD obtain its initial authentication state from GET /api/auth/session.

A safe response may include:

- authenticated boolean;
- safe user summary;
- current permission codes needed for navigation/presentation;
- safe department summary;
- CSRF token or a separate CSRF retrieval mechanism.

The response MUST NOT include:

- OIDC tokens;
- session identifier;
- Keycloak client information;
- internal role implementation detail not needed by the UI.

The frontend SHOULD treat 401 as signed-out and 403 as authenticated-but-not-authorized where applicable.

---

## 42. Search, Filtering, and Data Exposure

User-directory search MUST avoid exposing more personal data than required.

V1 user list SHOULD expose only operational fields such as:

- display name;
- email;
- access state;
- departments;
- roles as administrative display information;
- identity synchronization and invitation delivery status when authorized.

Sensitive security metadata MUST remain on more privileged detail endpoints or be omitted entirely.

Search MUST be bounded and parameterized. Unbounded full-table user/role/permission loading SHOULD be avoided even though the initial company size is small.

---

## 43. Repository Structure

Implementation SHOULD grow the repository toward the architecture already documented.

Expected additions include concepts equivalent to:

    domains/iam/
      src/
        domain/
        application/
        infrastructure/
        presentation/
        public.ts

    apps/api/src/auth/
      OIDC/BFF session infrastructure

    infra/keycloak/
      reviewable non-secret Keycloak configuration

The workspace configuration MUST add domains/* only when the first domain project is introduced.

IAM-MP-00 to IAM-MP-02 realized the domain part as the core project `domains/iam` (`domain/`, `application/`, public entry `src/index.ts`) and the adapter project `domains/iam-persistence`; `docs/ENGINEERING.md` Section 6 describes that layout.

The IAM package SHOULD use tags that preserve backend and domain boundaries, and ESLint/Nx constraints SHOULD be extended so future domains cannot import IAM internals.

Only IAM public.ts or an equivalent explicit public entry point may be imported cross-module.

---

## 44. Public Module Surface

The IAM public surface MAY expose:

- UserId;
- DepartmentId;
- PermissionCode;
- AuthorizationContext;
- user/identity resolution capabilities;
- authorization context resolution;
- permission-check capabilities;
- stable IAM integration events required by other modules.

It MUST NOT expose:

- Prisma client/types;
- repositories;
- internal services;
- database models;
- Keycloak Admin client;
- OIDC token types;
- application-session persistence;
- mutable internal entities.

---

## 45. Integration Events

IAM MAY publish meaningful post-commit facts when a real consumer exists.

Potential facts include:

- iam.user.activated (first activation);
- iam.user.reactivated (with the derived target state);
- iam.user.suspended;
- iam.user.disabled;
- iam.user.terminated;
- iam.user.role-assigned;
- iam.user.role-removed;
- iam.user.department-added;
- iam.user.department-removed.

Events MUST represent facts that already occurred, not disguised commands.

IAM MUST NOT introduce a message broker solely to publish these events.

Until a durable asynchronous consumer exists, synchronous public capabilities and durable audit evidence are sufficient.

---

## 46. Test Strategy

IAM is high-risk infrastructure and MUST receive explicit positive and negative verification.

### 46.1 Domain/unit tests

Cover at minimum:

- allowed and forbidden access-state transitions;
- reactivation target derivation from firstActivatedAt, and no administrative path to ACTIVE for a never-activated user;
- invitation delivery state transitions, including a failed resend after an earlier success;
- last-System-Administrator invariant, counting only ACTIVE holders;
- effective permission calculation;
- inactive role behavior;
- retired permission behavior;
- active/inactive department behavior;
- primary department invariant;
- email normalization, including whole-address lowercasing and rejection of non-ASCII addresses;
- permission-code validation;
- system-role protection, including deactivation of the System Administrator role;
- bootstrap candidate classification (Section 21.2).

### 46.2 Application tests

Cover:

- create/provision orchestration;
- identity reconciliation: ownership proof, conflict without modification, 409 re-lookup, and access-reducing steps on a bound identity;
- reconciliation after ambiguous Keycloak failure;
- invitation dispatch and resend outcomes, and their independence from identitySyncState;
- suspend/disable/terminate fail-closed ordering;
- reactivation ordering, including compensation when the final commit fails;
- operation outcome reporting (Section 27);
- bootstrap create, resume, refusal, and recovery modes, including that recovery terminates INVITED candidates, removes the System Administrator role from SUSPENDED and DISABLED holders without changing their accessState or identitySyncState, and leaves exactly one live candidate;
- role assignment/removal;
- department membership changes;
- role permission replacement;
- session revocation requests;
- audit capability invocation;
- typed error mapping.

External Keycloak calls SHOULD be represented by narrow test doubles at application-test level.

### 46.3 Persistence integration tests

Use real PostgreSQL/Testcontainers.

Cover:

- unique email;
- unique external identity;
- membership uniqueness;
- role-assignment uniqueness;
- permission mapping uniqueness;
- primary-department constraint;
- access-state/firstActivatedAt/identitySubject check constraints;
- optimistic concurrency;
- transaction rollback;
- last-admin concurrency with competing operations on different administrators;
- first activation racing a suspension;
- concurrent bootstrap invocations leaving at most one live candidate;
- session revocation persistence where session infrastructure uses PostgreSQL.

### 46.4 Keycloak integration tests

Use a real Keycloak 26.7.4 test container/realm for integration coverage of:

- user provisioning;
- external subject binding;
- recovery of a lost create response without a duplicate identity;
- vertexUserId attribute present at creation and not user-editable;
- username and email not user-editable through the account/user-profile route, with the Update Email required action disabled (Section 37);
- required-action invitation, and Vertex's handling of Keycloak refusing it for a disabled identity;
- enable/disable;
- session termination;
- OIDC discovery/JWKS validation;
- authorization code + PKCE callback;
- wrong state/nonce rejection;
- wrong issuer/audience rejection;
- back-channel logout;
- MFA/test-realm policy as applicable.

Do not test Keycloak internals; test Vertex's integration contract.

### 46.5 API integration tests

For every meaningful protected operation test:

1. allowed actor;
2. unauthenticated denial;
3. missing-permission denial;
4. invalid state/resource denial where relevant;
5. stable response/error contract;
6. audit/security side effect.

PATCH /api/iam/users/{userId} MUST additionally prove that email and every other non-displayName field are rejected.

### 46.6 CSRF tests

Must prove:

- unsafe request without token rejected;
- wrong token rejected;
- token from another session rejected;
- valid token accepted;
- logout protected;
- safe method does not mutate state;
- OIDC callback rejects mismatched state.

### 46.7 Browser E2E

High-value E2E journeys:

- real login through local Keycloak;
- first invitation activation;
- logout;
- expired/revoked session behavior;
- administrator creates/invites user;
- administrator assigns role;
- permission change affects UI and backend access without stale privilege;
- suspended user loses access;
- last-System-Administrator protection;
- key authorization denial.

The E2E suite SHOULD remain focused rather than duplicating every domain test.

---

## 47. Security Verification Gates

IAM cannot be closed until verification demonstrates:

- browser code never receives OIDC tokens;
- credentials exist only in Keycloak;
- application session is opaque and revocable;
- cookie attributes meet policy;
- session expiry meets policy;
- CSRF defense works;
- state/nonce/PKCE checks work;
- unmapped Keycloak identity is denied;
- inactive Vertex user is denied;
- privilege removal is promptly effective;
- resource authorization architecture remains available for business modules;
- Keycloak realm password hashing/policy matches docs/SECURITY.md;
- MFA is enforced for production staff;
- brute-force protection enabled;
- security/admin event logging enabled;
- secrets absent from logs;
- sensitive IAM changes have durable accountability evidence;
- supply-chain audit remains within repository policy.

---

## 48. Seed and Reference Data

IAM implementation MUST have deterministic seed/synchronization logic for:

- system roles;
- IAM permission catalog;
- System Administrator role-to-permission mappings;
- initial Vertex Media departments only if the actual department list is explicitly approved as product data.

The implementation MUST NOT invent department names from memory or seed unapproved organizational data.

No user, including a System Administrator, is ever seeded; the first administrator is created only by the bootstrap command (Section 21).

Reference synchronization MUST be idempotent.

Application startup SHOULD NOT perform uncontrolled schema/data mutation. Explicit migration/seed commands are preferred.

---

## 49. Migration Strategy

IAM introduces the first business database migration.

The initial migration MUST be treated as production-quality even though the system has no production business data yet.

It MUST:

- create IAM tables and required enums/constraints;
- create application-session/auth infrastructure tables separately from IAM ownership where required;
- create minimal Audit foundation tables only if the closure dependency in Section 34 requires them;
- use explicit names for important indexes/constraints where practical;
- include any custom PostgreSQL constraint needed for one-primary-department behavior and the Section 28.1 check constraints;
- be reproducible from an empty database;
- pass Prisma validate/generate and integration tests.

No destructive reset may be hidden inside normal migration commands.

---

## 50. Operational Failure Behavior

IAM/auth MUST fail closed.

Examples:

- Keycloak discovery/JWKS unavailable during a new login: no new session;
- Keycloak Admin API unavailable during user creation: the user remains INVITED with identitySyncState FAILED and invitationDeliveryState NOT_SENT; sync-identity resumes provisioning;
- invitation dispatch fails, including SMTP failure: the identity is unaffected, invitationDeliveryState becomes FAILED, and resend remains available;
- Keycloak disable call fails after local disablement: local access remains denied and identitySyncState becomes FAILED;
- Keycloak enable call fails during reactivation: accessState is unchanged;
- IAM database unavailable: protected access is denied rather than using stale cached privileges;
- session store unavailable: request is not treated as authenticated;
- audit write required for a privileged mutation fails: the privileged mutation MUST fail or use an explicitly approved atomic/outbox design; it MUST NOT silently succeed without required accountability;
- malformed external identity claims: deny and record safe security evidence.

---

## 51. Performance Expectations

IAM V1 is for an internal company-scale workload, so correctness is more important than speculative scale.

Nevertheless:

- protected requests SHOULD resolve session + current authorization context with a bounded number of indexed queries;
- N+1 permission lookups are forbidden;
- role/permission relations SHOULD be fetched in a compact query/projection;
- request-local memoization MAY avoid duplicate IAM resolution within one request;
- no cross-request authorization cache is introduced in V1;
- list endpoints are bounded;
- Keycloak Admin API is never called on every ordinary protected request.

---

## 52. Security-Sensitive Administrative UX

The UI MUST distinguish routine profile changes from security-sensitive actions.

At minimum the following require deliberate confirmation:

- suspend;
- disable;
- terminate;
- revoke sessions;
- assign/remove System Administrator;
- edit role permissions;
- deactivate a role;
- deactivate a department when it changes effective scope.

The confirmation UI MUST display the target identity and action clearly.

The backend MUST still enforce every invariant independently.

---

## 53. Reasons for Administrative Actions

For suspend, disable, terminate, and high-risk privilege changes, the API SHOULD accept a short administrative reason.

The reason:

- is accountability metadata, not business state;
- SHOULD be length-limited;
- MUST be treated as untrusted text;
- MUST be included in audit evidence when supplied;
- MUST NOT contain secrets.

A reason MUST NOT be required if doing so would prevent urgent security revocation during an incident; the UI may still prompt for one.

---

## 54. Recovery and Identity-Provider Administration

Password reset, MFA reset, and credential recovery are initiated and completed in Keycloak.

Vertex OS MAY provide a safe administrative action that asks Keycloak to send/require an approved recovery action, but:

- Vertex never asks for the new password;
- Vertex never receives the new password;
- Vertex never stores recovery tokens;
- the action must be authorized and audited;
- high-risk recovery SHOULD revoke Vertex sessions.

Direct access to the Keycloak Admin Console SHOULD be limited to infrastructure/security operators, not used as the normal Vertex user-management interface.

---

## 55. Implementation Order

IAM SHOULD be implemented as vertical slices with verification after each slice.

### IAM-0 — Architecture and package foundation

- add domains/* workspace support;
- create IAM package with public boundary;
- extend Nx/ESLint boundary tags;
- add typed auth/IAM configuration;
- add local Keycloak configuration baseline;
- add minimal Audit closure dependency design.

Exit: architecture tests and existing Phase 0 verification remain green.

### IAM-1 — Persistence foundation

- Prisma models/enums;
- migration;
- repositories;
- permission/system-role seed synchronization;
- persistence integration tests.

Exit: schema/invariants proven against real PostgreSQL.

### IAM-2 — Keycloak integration

- vertex-web client configuration;
- vertex-provisioner service account;
- Admin REST adapter;
- identity reconciliation (Section 11.2);
- invitation dispatch and delivery state (Section 11.3);
- enable/disable/session termination;
- realm user-profile restrictions (Section 37);
- real Keycloak integration tests.

Exit: Vertex can safely provision an invited identity without handling passwords.

### IAM-3 — BFF authentication and sessions

- login attempt store;
- OIDC login/callback;
- token validation;
- application-session store;
- cookie policy;
- CSRF;
- logout;
- back-channel logout.

Exit: real local Keycloak login/logout works and browser never sees IdP tokens.

### IAM-4 — IAM authorization context

- authentication guard protected-by-default;
- current user resolution;
- effective permission projection;
- requirePermission capability/guard integration;
- prompt privilege removal behavior.

Exit: protected APIs deny correctly and current authorization state is authoritative.

### IAM-5 — Administration API

- users, including resend-invitation and sync-identity;
- access lifecycle, including reactivation target derivation;
- bootstrap command (Section 21);
- departments;
- memberships;
- roles;
- role mappings;
- session revocation;
- OpenAPI;
- stable error contracts;
- audit/security evidence.

Exit: API integration/security tests green.

### IAM-6 — Frontend

- signed-out/authenticated states;
- user directory/detail;
- invite user;
- access actions;
- department administration;
- role/permission administration;
- session-revocation UX;
- permission-aware navigation/action controls.

Exit: component/feature tests and accessibility checks green.

### IAM-7 — E2E, hardening, and closeout

- critical browser journeys against real local Keycloak;
- concurrency tests;
- security review;
- dependency audit;
- documentation updates;
- full repository verification;
- no temporary bypass/TODO/debugging code.

Exit: IAM Definition of Done satisfied.

The phases are sequencing boundaries, not permission to leave security gaps in merged production behavior. Incomplete slices MUST remain inaccessible or clearly development-only until their security prerequisites exist.

---

## 56. Definition of Done

IAM V1 is complete only when all applicable statements below are true.

### Domain and persistence

- [ ] ApplicationUser, Department, membership, Role, Permission, mappings, and assignments are implemented.
- [ ] Required database uniqueness/referential/concurrency constraints exist.
- [ ] User access lifecycle is enforced exactly.
- [ ] Only first activation moves a user from INVITED to ACTIVE; reactivation derives its target from firstActivatedAt, and the Section 28.1 check constraints exist.
- [ ] No IAM security-critical entity is hard-deleted through ordinary workflows.
- [ ] System Administrator lockout protection counts only ACTIVE holders, protects the role from deactivation, and is concurrency-safe.
- [ ] Permission catalog synchronization is deterministic and idempotent.

### Identity provider

- [ ] Keycloak version is pinned.
- [ ] vertex-web and vertex-provisioner responsibilities are separated.
- [ ] user provisioning is safe and retryable.
- [ ] identity reconciliation proves ownership, never duplicates or re-links identities, and is the only path that changes Keycloak identities.
- [ ] invitation uses Keycloak required actions.
- [ ] identity synchronization and invitation delivery are tracked, reported, and displayed separately.
- [ ] email and username are immutable in V1 and cannot be changed by users in Keycloak.
- [ ] Vertex never handles passwords.
- [ ] disable/reactivate synchronization fails closed.
- [ ] production MFA policy satisfies this document.
- [ ] realm configuration is reviewable and reproducible.

### Authentication/session

- [ ] authorization code + PKCE S256 works.
- [ ] state and nonce are validated.
- [ ] issuer/audience/signature/expiry are validated.
- [ ] browser never receives Keycloak tokens.
- [ ] opaque application sessions are server-side and revocable.
- [ ] cookies satisfy repository policy.
- [ ] inactivity and absolute expiry satisfy repository policy.
- [ ] CSRF defense protects unsafe requests.
- [ ] logout revokes server-side session.
- [ ] back-channel logout revokes applicable sessions.
- [ ] protected endpoints are deny-by-default.

### Authorization

- [ ] active mapped Vertex user required in addition to Keycloak authentication.
- [ ] effective permission context is current and not stale-cached across requests.
- [ ] role names are not used as business authorization checks.
- [ ] business modules can consume stable authorization context without IAM persistence coupling.
- [ ] inactive roles/departments/retired permissions behave correctly.

### API and frontend

- [ ] OpenAPI covers IAM/auth endpoints.
- [ ] Problem Details and stable error codes are consistent.
- [ ] IAM administration UI is functional.
- [ ] no password/MFA/token UI exists in Vertex.
- [ ] permission-aware UI is present but not security-authoritative.
- [ ] accessibility expectations are met.
- [ ] sensitive actions have clear confirmation and conflict handling.

### Audit/security

- [ ] required IAM security events are recorded.
- [ ] privileged IAM mutations produce durable Audit evidence through MOD-AUDIT ownership.
- [ ] secrets/tokens/session IDs are absent from logs and API responses.
- [ ] security-negative tests exist.
- [ ] dependency/security audit passes under repository policy.
- [ ] no default/shared privileged production account exists.
- [ ] bootstrap is idempotent, serialized, and non-duplicating; its recovery mode is explicit, audited, and leaves exactly one live System Administrator candidate.

### Verification

- [ ] format check passes.
- [ ] lint and architecture-boundary checks pass.
- [ ] typecheck passes.
- [ ] unit/application tests pass.
- [ ] PostgreSQL integration tests pass.
- [ ] Keycloak integration tests pass.
- [ ] API integration tests pass.
- [ ] Playwright critical IAM journeys pass.
- [ ] Prisma validate/generate pass.
- [ ] build passes.
- [ ] pnpm verify:full passes.
- [ ] pnpm deps:audit passes under reviewed repository policy.
- [ ] CI is green when GitHub Actions account execution is available.

IAM MUST NOT be called complete merely because login works.

---

## 57. Decisions Intentionally Deferred

The following decisions are intentionally not generalized in IAM V1:

- multi-company/multi-tenant authorization;
- branch-level organization;
- department hierarchy;
- direct user permissions;
- generic scoped-role DSL;
- arbitrary ABAC rules;
- client/external identities;
- service accounts and API keys;
- impersonation;
- changing a user's email/sign-in identifier, reusing a terminated user's address, and re-linking a user to a different Keycloak identity;
- internationalized (non-ASCII) email addresses;
- SCIM;
- directory/LDAP federation;
- social identity providers;
- automated HR-driven joiner/mover/leaver integration;
- Redis-backed sessions;
- distributed authorization cache.

A concrete requirement must justify each addition.

---

## 58. Review Checklist for Any IAM Change

Before merging an IAM change, reviewers MUST ask:

1. Does this belong to IAM, Keycloak, BFF auth infrastructure, Audit, or another business module?
2. Does it weaken the rule that authentication is not authorization?
3. Can a browser obtain an IdP token or secret through this change?
4. Does privilege removal take effect promptly?
5. Does the operation fail closed under database or Keycloak failure?
6. Is external network I/O outside database transactions?
7. Is a security-sensitive mutation auditable?
8. Are concurrency and stale-admin-write cases handled?
9. Are permission checks server-side?
10. Is a role name being used where a permission should be used?
11. Is resource-level policy being incorrectly centralized in IAM?
12. Does the change introduce speculative tenancy, HR, cache, broker, or policy-engine complexity?
13. Are negative security tests present?
14. Are secrets excluded from logs, source, browser state, and error payloads?
15. Do architecture boundaries remain enforceable by tooling?

If any answer reveals ambiguity, the change is not ready to merge.

---

## 59. Final Module Invariants

The following invariants summarize IAM V1 and MUST remain true:

1. A Keycloak identity is not automatically a Vertex user.
2. A Vertex user is not automatically authorized for any business action.
3. Passwords and MFA belong to Keycloak, never Vertex application code.
4. Browser code never handles identity-provider tokens.
5. Vertex application sessions are opaque, server-side, revocable, and short-lived.
6. IAM authorization is deny-by-default.
7. Permissions express coarse capabilities; business modules decide resource-level access.
8. Roles aggregate permissions; business code does not authorize by role name.
9. Departments provide organizational context and do not grant capabilities by themselves.
10. Privilege removal is promptly effective.
11. Suspension, disablement, and termination revoke application sessions immediately.
12. Only first successful sign-in activates an INVITED user; reactivation never bypasses first activation, Keycloak required actions, or MFA.
13. Identity synchronization and invitation delivery are separate states, and neither grants Vertex access.
14. Email and the bound Keycloak identity are immutable in V1; sign-in maps users by issuer and subject only.
15. External Keycloak failure never causes Vertex to fail open.
16. Remote Keycloak calls do not run inside database transactions.
17. Security-sensitive IAM mutations have durable accountability evidence.
18. IAM internals and Prisma models are not cross-module APIs.
19. No public self-registration exists in V1.
20. No shared/default privileged Vertex account exists, and bootstrap never leaves more than one live System Administrator candidate: recovery supersedes the existing candidates before creating the single new one.
21. No wildcard permission exists in V1.
22. No speculative tenant/HR/policy-engine infrastructure is introduced.
23. IAM is not complete until domain, API, frontend, integration, E2E, security, and audit verification are all green.

---

## 60. Implementation Reference Notes

As of 2026-09-22, the reviewed external baseline is Keycloak 26.7.4.

The official Keycloak documentation confirms the current Admin REST capability to create users and send required-action email flows, and documents the current bootstrap-admin environment-variable names. The implementation MUST still verify the exact API/configuration behavior against the pinned Keycloak release when code is written.

The 26.7.4 sources and documentation were reviewed on 2026-09-22 for the behavior this specification relies on: user creation returns 201 with the new user's location, and a duplicate username or email returns 409; users can be searched by exact username and by attribute (q=key:value); execute-actions email is refused for users without an email address or that are disabled, and an email-sending failure returns an error; the user logout action terminates all of a user's sessions; usernames and emails are lowercased with the JVM default locale; unmanaged user attributes are ignored unless declared in the user profile or allowed by policy. The Update Email layers recorded in Section 37 were verified in the same review: the server feature is declared `Type.DEFAULT` in 26.7.4 after being `Type.PREVIEW` in 26.0.0; a realm registers the Update Email required action with `enabled = false`; the action runs only when the feature and that realm provider are both enabled; the default user profile grants `email` edit to both `admin` and `user`; and the action is skipped and cleared when the user profile makes email read-only.

Repository security policy remains authoritative if an external default differs from Vertex OS requirements.

This file is an implementation specification, not a substitute for reviewing the pinned provider documentation during upgrades.
