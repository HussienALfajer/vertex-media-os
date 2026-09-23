# SECURITY.md

> Canonical security policy for Vertex OS.
>
> This document defines repository-wide security invariants, trust boundaries,
> authentication and authorization requirements, session rules, data-protection
> requirements, security review triggers, and production security gates.
>
> Product scope belongs in `docs/PRODUCT.md`.
> System shape, including the authentication topology, belongs in `docs/ARCHITECTURE.md`.
> Module ownership belongs in `docs/MODULES.md`.
> Engineering rules belong in `docs/ENGINEERING.md`.
> Test strategy belongs in `docs/TESTING.md`.
> IAM implementation details belong in `docs/modules/iam.md` once that specification exists.

---

## 1. Security Baseline

Vertex OS security is designed as a system constraint, not a release-stage feature.

The default assurance target is:

- **OWASP ASVS 5.0.0 Level 2** for production readiness.
- Stronger controls MAY be applied to privileged, financial, identity, export, and other high-risk operations.
- OWASP Top 10 is treated as risk-awareness guidance, not as the complete security specification.
- Current NIST digital identity guidance SHOULD inform authentication, session, password, and recovery controls.
- The Keycloak/OIDC integration MUST follow current OAuth 2.0 and OpenID Connect security best practice, including RFC 9700 (OAuth 2.0 Security BCP) and RFC 10017 (OAuth 2.0 for Browser-Based Applications, backend-for-frontend pattern).

Security controls MUST be proportionate to risk and MUST NOT introduce architectural complexity without a concrete threat or requirement.

---

## 2. Normative Language

Normative terms follow `docs/ENGINEERING.md`.

- **MUST / MUST NOT** — mandatory.
- **SHOULD / SHOULD NOT** — strong default; deviations require a documented reason.
- **MAY** — optional when appropriate.

A MUST-level security exception requires an accepted architectural/security decision.

---

## 3. Core Security Principles

1. Security MUST be enforced server-side.
2. Protected access MUST default to deny.
3. Public access MUST be explicit.
4. Authentication MUST NOT imply authorization.
5. Authorization MUST evaluate applicable permission and resource scope.
6. Knowledge of a resource identifier MUST NOT grant access.
7. Security-sensitive state MUST fail closed.
8. Privilege MUST follow least-privilege principles.
9. Sensitive actions MUST be auditable.
10. Secrets MUST NOT appear in source code, frontend bundles, API responses, or logs.
11. User input, uploaded files, external content, and external responses are untrusted by default.
12. Security controls that can reasonably be automated SHOULD be enforced by tooling and CI.

---

## 4. Threat Model and Trust Boundaries

### Protected assets

Vertex OS protects, at minimum:

- user identities and authentication factors;
- sessions and recovery mechanisms;
- roles, permissions, scopes, and security configuration;
- client and contact data;
- contracts, proposals, and commercial records;
- projects, briefs, tasks, and internal operational data;
- invoices, payments, balances, and other financial data;
- files and media assets;
- audit and security-event history;
- application secrets and cryptographic material;
- databases, backups, and deployment credentials.

### Primary threat actors

The system MUST account for:

- unauthenticated external attackers;
- compromised user accounts;
- malicious or over-privileged insiders;
- users attempting horizontal or vertical privilege escalation;
- malicious uploaded content;
- compromised third-party dependencies;
- leaked credentials or secrets;
- insecure configuration;
- vulnerable external integrations.

### Trust boundaries

At minimum, the following are trust boundaries:

```text
Browser / Client
        |
        v
Public HTTP Boundary
        |
        v
API / Application (BFF) <-----> Identity Provider (Keycloak)
        |
        v
Domain Modules
        |
        +----> Database
        |
        +----> File Storage
        |
        +----> External Services / Integrations
```

The browser is also redirected to the identity provider's sign-in interface; that interaction is governed by the identity-provider configuration and the OIDC protocol requirements in Section 7.

Every transition across a trust boundary MUST validate, authorize, and constrain data as appropriate.

---

## 5. Data Classification

Vertex OS uses four default data classes.

### Public

Information intentionally approved for public disclosure.

Examples:
- published marketing content;
- public service descriptions.

### Internal

Operational data intended for authorized company staff.

Examples:
- internal task metadata;
- non-sensitive operational notes.

### Confidential

Business information requiring explicit authorization.

Examples:
- client records;
- contracts;
- proposals;
- invoices;
- payment records;
- internal files;
- project content.

### Secret

Credentials or cryptographic material that MUST never be exposed to ordinary users.

Examples:
- passwords;
- session secrets;
- API keys;
- signing keys;
- OIDC client secrets;
- identity-provider ID, access, and refresh tokens;
- MFA secrets;
- reset tokens;
- private encryption keys.

Security controls SHOULD become stricter as data classification increases.

---

## 6. Identity Lifecycle

Every Vertex OS user has two linked representations:

- an identity in Keycloak, which holds credentials, authentication factors, and the identity-provider enabled state;
- a Vertex application user owned by IAM, which holds the identity mapping, access state, roles, and permissions.

Access requires both: a successfully authenticated identity-provider identity AND an active Vertex application user mapped to it. Disabling either side MUST prevent access.

Vertex OS V1 MUST NOT provide public self-registration.

Accounts MUST be created, invited, or activated only through an authorized workflow. A Keycloak identity MUST NOT obtain Vertex OS access merely because it can authenticate.

The identity lifecycle MUST support:

- creation;
- invitation;
- activation;
- suspension;
- disablement;
- recovery;
- termination.

Disabling or terminating an account MUST invalidate its active Vertex application sessions immediately and MUST also terminate or block its identity-provider sessions so that access cannot be silently re-established.

Security-impacting identity changes MUST take effect without requiring the user to wait for stale authorization state to expire.

Role, permission, scope, or privilege removal MUST become effective promptly.

Default/shared privileged accounts MUST NOT exist in production.

---

## 7. Authentication

Protected endpoints MUST require authentication by default.

Public endpoints MUST be explicitly declared and SHOULD be minimized.

Vertex OS uses one authentication architecture for the first-party web application:

> **Keycloak is the identity provider. The Vertex OS backend integrates with it as a confidential OIDC client using the Authorization Code Flow with PKCE and acts as the browser-facing backend-for-frontend (BFF). The browser authenticates to Vertex OS only through an opaque, server-side application session delivered as a secure cookie.**

The topology and the full responsibility split are defined in `docs/ARCHITECTURE.md` (Section 22). In security terms:

- Keycloak owns credentials, password policy, MFA factors, credential recovery, the identity-provider session, and OIDC token issuance.
- The Vertex OS backend owns the application session, its cookie, the server-side binding of that session to OIDC state and tokens, CSRF defense, logout, and the mapping of the authenticated identity into the Vertex application context.
- Vertex IAM owns the application user, its identity mapping, access state, roles, permissions, and application-level authorization primitives.
- Business modules own resource-level authorization decisions.

### 7.1 Browser constraints

Browser application code MUST NOT receive, hold, or persist OIDC ID tokens, OAuth access tokens, or refresh tokens.

Identity-provider tokens MUST remain server-side, bound to the application session.

Authentication tokens and session secrets MUST NOT be stored in browser `localStorage`, `sessionStorage`, IndexedDB, or non-`HttpOnly` cookies.

Bearer-token authentication from the browser MUST NOT be introduced merely because the frontend and backend are separate applications.

### 7.2 Protocol requirements

The OIDC integration MUST:

- use the Authorization Code Flow with PKCE (`S256`);
- act as a confidential client whose client secret is held only by the backend;
- validate `state` on every callback and `nonce` on every ID token;
- validate ID tokens (issuer, audience, signature, expiry) according to the OpenID Connect specification;
- use exact-match, pre-registered redirect URIs;
- follow RFC 9700 and RFC 10017.

The implicit flow and the resource-owner password credentials grant MUST NOT be used.

Vertex OS MUST NOT collect user passwords through its own interfaces; credential entry happens only in identity-provider interfaces.

### 7.3 Authentication is not authorization

Successful Keycloak authentication establishes identity only.

Access to Vertex OS additionally requires an active Vertex application user mapped to that identity with an access state that permits sign-in.

Permission to perform any business operation is decided by Vertex authorization (Sections 12–14), never by authentication success alone.

### 7.4 Other clients

Bearer-token authentication for native applications, external APIs, third-party integrations, or machine-to-machine access is not part of the V1 baseline.

Introducing any such mechanism MUST receive an explicit security design review and MUST NOT introduce a second identity provider or a parallel user-credential store.

---

## 8. Passwords and Credentials

The configured identity provider MUST satisfy the credential-storage and password-security policy in this section.

When Keycloak is the active identity provider, password hashing, credential storage, password policy, MFA credentials, and credential recovery are configured and verified in Keycloak rather than reimplemented in Vertex OS application code.

Vertex OS application code MUST NOT store, hash, verify, or accept user passwords and MUST NOT implement a user-credential store parallel to the identity provider.

Passwords MUST be treated as authentication secrets.

Passwords MUST:

- be hashed with a memory-hard algorithm — **Argon2id** is the approved baseline;
- use unique salts;
- support parameter upgrades over time;
- never be logged;
- never be returned by any API;
- never be stored in plaintext or reversibly encrypted.

The identity provider's Argon2id parameters (memory, iterations, parallelism) MUST be explicitly configured and verified against current OWASP guidance, not assumed from defaults.

The password policy SHOULD follow current NIST guidance.

Default baseline:

- minimum length: **15 characters** when password may function as a single factor;
- the identity provider MUST accept passwords of at least **64 characters**;
- arbitrary composition rules such as mandatory symbol/uppercase/lowercase combinations SHOULD NOT be required;
- periodic forced password rotation SHOULD NOT be required without evidence of compromise;
- new passwords SHOULD be checked against known weak/common/compromised password lists;
- password pasting SHOULD be allowed.

Password hashing parameters MUST be benchmarked against production hardware before launch.

The identity-provider configuration implementing this policy SHOULD be maintained as reviewable, reproducible configuration rather than manual console changes, and MUST be verified as part of security verification (Section 34).

---

## 9. Multi-Factor Authentication

MFA is provided and enforced by Keycloak.

Vertex OS application code MUST NOT implement its own authentication factors or store MFA secrets.

MFA requirements MUST be enforced through identity-provider policy (authentication flows and required actions). Vertex OS MAY additionally verify authentication-context claims (`acr`/`amr`) delivered through the OIDC integration to require step-up authentication for sensitive operations (Section 15).

Before production use:

- MFA MUST be required for privileged/administrative accounts.
- MFA SHOULD be available to all internal users.

For mature production use, MFA SHOULD be required for all staff unless a documented risk decision states otherwise.

Preferred authentication-factor order:

1. WebAuthn / passkeys where practical;
2. TOTP;
3. single-use recovery codes.

Email alone SHOULD NOT be treated as a strong second factor.

MFA enrollment, removal, reset, and recovery MUST be recorded as security events; because these occur in Keycloak, identity-provider event logging for them MUST be enabled and retained (Section 28).

Disabling or replacing MFA MAY require recent authentication or step-up authentication.

---

## 10. Account Recovery

Credential recovery (password reset, MFA reset, recovery codes) is performed in Keycloak.

Vertex OS application code MUST NOT implement parallel password-reset or recovery-token flows.

Recovery mechanisms MUST NOT be weaker than necessary.

The identity-provider recovery configuration MUST ensure recovery tokens and links are:

- cryptographically random;
- single-use;
- short-lived;
- invalidated after use;
- stored securely;
- resistant to account enumeration.

Recovery responses exposed publicly SHOULD avoid revealing whether a specific account exists.

High-risk recovery events SHOULD revoke other active sessions, including Vertex application sessions (Section 11).

Recovery events MUST be auditable through identity-provider event logging.

---

## 11. Session Security

Two sessions exist: the Vertex application session, owned by the backend acting as BFF, and the Keycloak SSO session, owned by the identity provider.

This section governs the application session. Identity-provider session parameters are configured in Keycloak and MUST NOT undermine the application-session policy below.

Application sessions MUST use opaque identifiers.

Application session cookies MUST:

- use `Secure`;
- use `HttpOnly`;
- use `SameSite=Strict`, or `Lax` only with a documented reason; `SameSite=None` MUST NOT be used for the application session cookie;
- use the narrowest practical domain/path scope;
- contain no sensitive user information.

Transient cookies used to correlate an in-progress OIDC sign-in (`state`, PKCE verifier) MUST be short-lived and single-purpose, MAY use `SameSite=Lax` as the redirect flow requires, and MUST NOT carry the application session.

Identity-provider tokens bound to a session MUST be stored server-side only and MUST be discarded when the session ends; associated tokens SHOULD be revoked at the identity provider on logout.

Session identifiers MUST rotate after successful authentication and other privilege-establishing events where appropriate.

Sessions MUST support explicit server-side revocation.

Sessions MUST be revoked on:

- logout;
- account disablement;
- account termination;
- credential reset where appropriate;
- security-critical compromise response.

Application logout MUST terminate the application session server-side and SHOULD perform OIDC RP-initiated logout so the identity-provider session does not silently re-establish access.

Vertex OS MUST support identity-provider-initiated termination (OIDC back-channel logout or an equivalent re-validation mechanism) so that identity-provider-side disablement or logout propagates to application sessions.

Default application-session baseline:

- inactivity timeout: **no more than 60 minutes**;
- absolute session lifetime: **no more than 24 hours** for ordinary authenticated sessions.

Identity-provider SSO idle and maximum lifetimes MUST NOT exceed these limits unless a documented risk decision accepts silent re-authentication.

More sensitive or privileged sessions MAY use shorter limits.

"Remember me" behavior MUST NOT silently bypass the approved session-security model.

---

## 12. Authorization

Authorization MUST be server-side.

Authorization MUST be deny-by-default.

Vertex OS uses:

> **RBAC for capability assignment + contextual/resource-scoped authorization for actual resource access.**

A role or permission MAY establish a coarse capability, but sensitive access decisions MUST also evaluate applicable context.

Examples of scope/context include:

- company;
- department;
- branch if later introduced;
- ownership;
- project membership;
- resource state;
- approval relationship;
- financial limits.

A permission such as:

```text
projects.projects.edit
```

MUST NOT automatically mean access to every project in the system.

---

## 13. Resource-Level Authorization

Every protected resource operation MUST evaluate access to the specific resource where applicable.

The following MUST NOT confer authorization:

- possession of an ID;
- guessing a URL;
- observing another user's request;
- receiving a frontend-generated link.

Object-level access control MUST protect against horizontal and vertical privilege escalation.

Frontend permission checks are UX behavior only.

Hidden buttons, disabled controls, route guards, or frontend state MUST NOT be considered security boundaries.

---

## 14. Authorization Architecture

Coarse access checks MAY occur in framework guards or middleware.

Resource-specific authorization SHOULD occur in application/domain authorization policies when decisions depend on business context.

Example:

```text
HTTP Guard
    |
    +--> valid application session?
    +--> active application user?
    +--> broad permission?
            |
            v
Application Policy
    |
    +--> may this actor operate on THIS resource?
```

Authorization rules MUST NOT be duplicated inconsistently across controllers.

The owning module remains authoritative for access rules tied to its domain state.

---

## 15. Sensitive Operations

Sensitive operations MAY require stronger controls than ordinary authenticated actions.

Examples include:

- granting or removing privileged roles;
- disabling MFA;
- changing credentials;
- revoking security controls;
- exporting confidential data;
- changing security settings;
- recording or reversing high-risk financial actions;
- rotating secrets;
- impersonation, if ever introduced.

Depending on risk, sensitive operations MAY require:

- recent authentication;
- step-up MFA;
- explicit confirmation;
- four-eyes approval;
- additional audit detail.

Security-sensitive workflows MUST fail closed.

Where a sensitive operation is performed inside the identity provider (credential change, MFA reset, recovery), the identity-provider configuration MUST apply equivalent controls.

---

## 16. API and Input Security

All externally supplied input MUST be considered untrusted.

Server-side validation MUST be authoritative.

Client-side validation MAY improve UX but MUST NOT be relied upon for security or correctness.

Input handling MUST distinguish:

- syntactic validation;
- semantic/domain validation;
- authorization.

Validation SHOULD use allowlists and bounded input wherever practical.

Unexpected fields SHOULD be rejected or ignored according to an explicit API contract.

Raw database queries MUST use parameterized inputs.

String-built queries containing untrusted data are forbidden.

Dynamic code execution from user-controlled input is forbidden.

---

## 17. Browser Security

Production browser traffic MUST use HTTPS.

Production responses SHOULD implement an approved security-header baseline including:

- HSTS;
- Content-Security-Policy;
- `X-Content-Type-Options: nosniff`;
- frame-embedding protection;
- `Referrer-Policy`;
- other appropriate modern browser protections.

Production debug behavior MUST be disabled.

Stack traces, internal paths, SQL details, internal IP addresses, or secrets MUST NOT be exposed to end users.

---

## 18. CORS

CORS MUST use explicit trusted origins.

Wildcard origins MUST NOT be combined with credentialed requests.

The preferred production deployment SHOULD minimize cross-origin complexity when practical.

New origins MUST be reviewed before being added to the allowlist.

---

## 19. CSRF

Cookie-authenticated state-changing requests MUST have an explicit CSRF defense.

This includes the backend's own session endpoints, such as logout.

SameSite cookies MAY contribute to defense-in-depth but MUST NOT be treated as the only CSRF design decision.

The OIDC callback MUST validate `state` bound to the initiating browser so that an attacker cannot complete a sign-in in the victim's browser (login CSRF / session fixation).

Safe HTTP methods MUST NOT perform state-changing business operations.

---

## 20. XSS and HTML Content

Untrusted HTML MUST NOT be rendered directly.

Features requiring rich HTML input MUST use an approved sanitizer with an explicit allowlist.

Use of dangerous rendering primitives such as direct HTML injection MUST be rare, reviewed, and justified.

Frontend rendering MUST rely on framework-safe escaping by default.

---

## 21. SSRF and Outbound Requests

User-controlled URLs MUST NOT trigger unrestricted server-side network requests.

Features such as:

- webhooks;
- remote imports;
- URL previews;
- integration callbacks;
- automation HTTP actions;

MUST implement appropriate protections, which MAY include:

- scheme allowlists;
- hostname/destination validation;
- blocked internal/private destinations;
- redirect restrictions;
- request timeouts;
- response-size limits;
- network-level egress controls.

---

## 22. File Uploads

Uploaded files MUST be treated as hostile by default.

File acceptance SHOULD enforce:

- authenticated and authorized upload;
- allowed type/extension policy;
- actual content/type validation where practical;
- size limits;
- internally generated storage names;
- path traversal protection;
- safe storage outside directly public web roots;
- malware/quarantine processing when risk warrants it.

Original filenames are metadata only and MUST NOT determine storage paths.

Executable uploads SHOULD be rejected unless a documented feature explicitly requires them.

Files MUST be accessed through authorization-aware application behavior.

Business modules SHOULD reference files by stable asset/file IDs, not by storage paths.

---

## 23. Exports

Exports MUST enforce authorization independently from the UI.

Exports MUST respect resource scope and data classification.

Spreadsheet-compatible exports MUST mitigate formula injection.

Large or sensitive exports SHOULD be auditable.

Highly sensitive exports MAY require recent authentication or stronger authorization.

---

## 24. Secrets Management

Secrets include, at minimum:

- database credentials;
- session secrets;
- signing keys;
- encryption keys;
- API credentials;
- OIDC client secrets and identity-provider administrative credentials;
- SMTP credentials;
- webhook secrets.

Secrets MUST NOT be:

- committed to Git;
- embedded in frontend code;
- included in `.env.example`;
- returned to clients;
- logged;
- copied into test fixtures unless they are explicitly fake.

Local development MAY use ignored environment files.

Production secrets MUST be injected through an approved protected deployment mechanism.

Secrets SHOULD support rotation.

Compromised secrets MUST be rotated promptly.

---

## 25. Cryptography

Custom cryptographic algorithms or protocols are forbidden.

Cryptography MUST use established, maintained libraries and approved algorithms.

Secure random values MUST come from cryptographically secure randomness.

Key material SHOULD be separated by purpose.

Application-level encryption MUST only be introduced when a concrete threat model requires it.

Passwords MUST use one-way password hashing, not encryption.

---

## 26. Data and Database Protection

Production databases MUST NOT be publicly exposed unless explicitly justified and protected.

Application runtime database credentials MUST follow least privilege.

Production applications SHOULD NOT run as database superusers.

Migration/admin privileges SHOULD be separated from ordinary runtime privileges where practical.

Environment separation MUST prevent development and test systems from implicitly using production databases or production credentials.

Backups containing production data MUST be access-controlled.

Production backups SHOULD be encrypted.

Restore capability MUST be tested operationally.

---

## 27. Logging

Production logging MUST be structured.

Logs MUST NOT include:

- plaintext passwords;
- password hashes;
- session IDs or session secrets;
- authorization headers;
- identity-provider ID, access, and refresh tokens, and authorization codes;
- API keys;
- MFA secrets;
- password-reset tokens;
- private cryptographic keys.

Request/response bodies MUST NOT be logged indiscriminately.

Logging SHOULD preserve useful correlation identifiers without leaking credentials or confidential payloads.

---

## 28. Security Events, Monitoring, and Alerting

Logging, monitoring, alerting, and incident response are distinct responsibilities: logging records what happened, monitoring reviews it, alerting brings defined conditions to a responder, and incident response (Section 36) acts on them. Logging alone is not sufficient.

### 28.1 Event sources

Security-relevant events MUST be recorded when applicable.

Events that occur in the identity provider are recorded by Keycloak. Identity-provider user and admin event logging MUST be enabled and retained for at least:

- login success/failure;
- logout;
- password change/reset;
- MFA enrollment/removal/recovery;
- identity-provider account enablement changes;
- administrative configuration changes.

Vertex OS MUST record its own security events, including:

- application session establishment, refresh, and revocation;
- identity-mapping failures and sign-in denials for disabled or unmapped application users;
- account disablement/reactivation;
- role/permission/scope changes;
- authorization denials;
- security-setting changes;
- suspicious upload rejection;
- sensitive exports;
- privileged security operations.

Where practical, Vertex events SHOULD carry identifiers that allow correlation with identity-provider events for the same session.

### 28.2 Event content

Security-event logs SHOULD record:

- actor;
- event type;
- relevant target/resource;
- timestamp;
- result;
- correlation/trace context;
- appropriate reason metadata.

Secrets MUST NOT be included.

### 28.3 Monitoring and alerting

Security events MUST be collected where they can be reviewed, and alert-worthy conditions MUST produce an actionable alert to a defined responder before production use.

Alert-worthy conditions include, at minimum:

- repeated authentication failures against one account or from one source, and brute-force lockouts;
- privilege changes, especially grants of administrative roles;
- unusual volumes of authorization denials for one actor;
- MFA removal/reset and account-recovery abuse indicators;
- security-sensitive configuration changes in Vertex OS or the identity provider;
- suspicious administrative behavior such as bulk or off-hours privileged changes;
- integrity failures, including audit write failures and security-configuration validation failures;
- suspicious export or download activity.

Alert thresholds and routing MUST be configurable and SHOULD be reviewed periodically.

The specific monitoring tooling is a deployment decision; this policy does not select a vendor or a SIEM platform.

---

## 29. Audit

Security logging and business audit are distinct concerns.

Audit records provide business accountability.

Sensitive state changes SHOULD capture:

- who performed the action;
- what action occurred;
- target resource;
- timestamp;
- result;
- relevant before/after state or state identifiers when appropriate.

Audit records MUST NOT be editable or deletable through ordinary application workflows.

Highly sensitive administrative or financial operations MUST be auditable.

---

## 30. Rate Limiting and Abuse Protection

Rate limiting MUST be applied where abuse is realistic.

At minimum, review:

- identity-provider login, password reset, and MFA verification (Keycloak brute-force detection and rate limiting MUST be enabled);
- Vertex OS session-establishment (OIDC callback) and logout endpoints;
- invite acceptance;
- public endpoints;
- expensive searches;
- expensive reports/exports;
- integration callbacks.

Rate-limit values belong in configuration and MUST be tunable.

Security controls SHOULD avoid leaking account existence through materially different responses where practical.

---

## 31. Dependency and Supply-Chain Security

The dependency graph is part of the attack surface.

The repository MUST:

- commit its lockfile;
- use deterministic/frozen dependency installation in CI;
- scan dependencies for known vulnerabilities;
- avoid unnecessary dependencies;
- review high-risk or security-sensitive dependencies carefully.

Dependency updates SHOULD be timely.

Production releases SHOULD generate or retain an SBOM when the release process matures enough to support it.

Unreviewed execution of arbitrary install/build scripts SHOULD be avoided.

---

## 32. Production Security Baseline

Production MUST use secure configuration defaults.

At minimum:

- debug mode off;
- development-only tooling disabled or protected;
- trusted origins explicit;
- secure cookies enabled;
- security headers enabled;
- production secrets separated from source;
- default credentials absent;
- unnecessary services disabled;
- database access restricted;
- sensitive administration surfaces protected;
- identity provider hardened: TLS enforced, administrative console and API not publicly exposed, and the parameters in Section 37 applied.

API documentation such as Swagger/OpenAPI UI MUST NOT be publicly exposed in production without an explicit decision.

Security configuration MUST be validated at startup.

Invalid security-critical configuration MUST cause startup failure rather than insecure fallback.

---

## 33. Error Handling

Security-sensitive errors MUST use the repository-standard API error model.

Client-facing errors MUST NOT disclose sensitive implementation details.

Internal logs MAY contain additional diagnostics when they remain non-secret and access-controlled.

Authorization failures SHOULD avoid revealing confidential resource existence when that distinction creates unnecessary information disclosure.

---

## 34. Security Verification

Security-sensitive behavior MUST be tested.

At minimum, the test strategy MUST cover:

- authentication at the application-session boundary;
- application session creation/revocation/expiry;
- CSRF protection on cookie-authenticated endpoints;
- identity-to-application-user mapping;
- access denial for disabled or unmapped application users despite successful identity-provider authentication;
- authorization allow/deny paths;
- object/resource-level access control;
- account disablement;
- role/permission changes;
- privileged operations;
- identity-provider configuration for password, MFA, and recovery policy (verified as configuration, not reimplemented);
- file authorization where applicable.

CI SHOULD include:

- secret scanning;
- dependency vulnerability scanning;
- type/lint/build enforcement;
- security-focused automated tests.

Production readiness SHOULD be evaluated against OWASP ASVS 5.0.0 Level 2.

A full ASVS checklist MUST NOT be duplicated inside this file.

---

## 35. Security Review Triggers

A focused security review MUST occur when a change introduces or materially modifies:

- authentication;
- sessions;
- password or MFA behavior;
- authorization or scope semantics;
- public endpoints;
- privileged roles;
- external integrations;
- outbound server-side network requests;
- file processing;
- financial or payment behavior;
- sensitive data exports;
- cryptography;
- secrets handling;
- recovery flows;
- impersonation;
- identity federation;
- OAuth/OIDC;
- machine-to-machine credentials.

A security review SHOULD ask:

1. What new asset is exposed?
2. Which trust boundary changed?
3. Who may perform the operation?
4. On which resources?
5. What happens on replay or duplication?
6. What data leaves the system?
7. What must be audited?
8. How can access be revoked?
9. What happens when the security dependency fails?

---

## 36. Incident-Response Baseline

The system SHOULD support rapid containment of suspected account or credential compromise.

Required capabilities SHOULD include:

- disable account;
- revoke active application sessions and identity-provider sessions;
- revoke or rotate credentials;
- rotate compromised secrets;
- preserve security/audit evidence;
- identify affected identities and resources.

Operational incident procedures MAY later live in dedicated runbooks.

---

## 37. Security Parameters

Central security parameters MUST be configurable and SHOULD NOT be scattered across feature code.

Default policy baseline:

| Parameter | Baseline | Enforced in |
|---|---|---|
| Password minimum | 15 characters when password may be single-factor | Keycloak password policy |
| Accepted password length | at least 64 characters | Keycloak password policy |
| Password hashing | Argon2id, parameters verified against OWASP guidance | Keycloak |
| Application session inactivity | ≤ 60 minutes | Vertex OS backend |
| Application session absolute lifetime | ≤ 24 hours | Vertex OS backend |
| IdP SSO session idle / max | not exceeding the application-session limits | Keycloak realm settings |
| Recovery tokens | short-lived, single-use | Keycloak |
| MFA recovery codes | single-use | Keycloak |
| Login / MFA attempts | rate-limited, brute-force detection enabled | Keycloak |
| Session-establishment / logout endpoints | rate-limited | Vertex OS backend |
| Privileged actions | recent auth / step-up where risk requires | Vertex OS, using IdP step-up where required |

Exact technical values MAY be tightened after implementation benchmarking and production risk review.

---

## 38. Security Ownership

Security is a shared responsibility, but ownership MUST remain explicit.

- Keycloak (identity provider) owns credentials, authentication factors, identity-provider sessions, and OIDC protocol security.
- The Vertex OS backend (BFF) owns application-session security, CSRF defense, and identity mapping into the application context.
- IAM owns application users, access state, roles, permissions, and application-level authorization primitives.
- Each domain module owns authorization decisions tied to its business state.
- Infrastructure owns secure deployment/runtime configuration, including identity-provider configuration and its security parameters.
- File/asset capability owns storage security boundaries.
- Audit capability owns audit persistence behavior.
- CI/repository tooling enforces automatable security policy.

No module may bypass another module's security boundary through direct database access.

---

## 39. Forbidden Security Patterns

The following are forbidden unless an accepted security decision explicitly states otherwise:

- client-authoritative authorization;
- public-by-default protected APIs;
- relying on hidden/disabled UI controls as security;
- authorization based only on possession of a resource ID;
- cross-module security bypass through direct persistence access;
- plaintext passwords;
- reversibly encrypted passwords;
- a Vertex-owned user password or user-credential store parallel to the identity provider;
- Vertex OS interfaces that collect user passwords, including the resource-owner password credentials grant;
- the OAuth implicit flow;
- granting application access on identity-provider authentication alone, without an active mapped Vertex application user;
- secrets in source control;
- secrets in frontend bundles;
- secrets or credentials in logs;
- identity-provider tokens or session secrets in browser-accessible storage or browser-readable cookies for first-party web authentication;
- long-lived unrevocable browser authentication;
- wildcard credentialed CORS;
- direct rendering of untrusted HTML;
- string-built database queries using untrusted input;
- dynamic code execution from untrusted input;
- unrestricted server-side requests to user-provided URLs;
- user-controlled filesystem paths;
- directly public storage of confidential uploads;
- ordinary users modifying/deleting audit history;
- insecure fallback when security configuration is missing;
- default/shared privileged production accounts.

---

## 40. Enforcement

Security rules SHOULD be automated wherever practical.

Potential enforcement mechanisms include:

- TypeScript/compiler constraints;
- ESLint/static analysis;
- architecture tests;
- authentication/authorization integration tests;
- secret scanning;
- dependency scanning;
- startup configuration validation;
- CI release gates.

Documentation defines policy.

Tooling SHOULD enforce policy wherever reliable automation is possible.

---

## 41. Agent Reading Order

Before security-sensitive work, coding agents SHOULD read only the minimum relevant context:

1. `docs/ENGINEERING.md`
2. `docs/SECURITY.md`
3. `docs/MODULES.md`
4. the affected `docs/modules/<module>.md`
5. relevant ADRs only when referenced

Agents SHOULD NOT load unrelated module specifications by default.

This keeps context small while preserving security correctness.

---

## 42. Exceptions

Security exceptions MUST be:

- explicit;
- narrowly scoped;
- justified by a concrete requirement;
- reviewed for impact;
- documented;
- time-bounded when appropriate.

MUST-level exceptions require an accepted ADR or equivalent security decision.

"We need to move fast" is not sufficient justification for bypassing a security invariant.

---

## 43. External Baselines

Vertex OS security policy is informed by:

- OWASP ASVS 5.0.0 — target Level 2;
- OWASP Cheat Sheet Series;
- OWASP Top 10:2025;
- NIST SP 800-63B-4;
- RFC 9700 — Best Current Practice for OAuth 2.0 Security;
- RFC 10017 — OAuth 2.0 for Browser-Based Applications;
- OpenID Connect Core 1.0.

External standards guide verification.

This document remains the canonical Vertex OS security policy.
