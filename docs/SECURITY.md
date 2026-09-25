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
> IAM implementation details belong in `docs/modules/iam.md`.

---

## 1. Security Baseline

Vertex OS security is designed as a system constraint, not a release-stage feature.

The default assurance target is:

- **OWASP ASVS 5.0.0 Level 2** for production readiness.
- Stronger controls MAY be applied to privileged, financial, identity, export, and other high-risk operations.
- OWASP Top 10 is treated as risk-awareness guidance, not as the complete security specification.
- Current NIST digital identity guidance SHOULD inform authentication, session, password, and recovery controls.
- Local email/password authentication and application sessions MUST follow the accepted [ADR-0001](adr/0001-local-password-authentication.md).

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
API / Application (local authentication and sessions)
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

The browser submits credentials only to the same-origin Vertex API over HTTPS in production.

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
- password hashes and password reset material, if a reset workflow is later introduced;
- private encryption keys.

Security controls SHOULD become stricter as data classification increases.

---

## 6. Identity Lifecycle

Each Vertex OS user is an IAM application user with a local password hash, access state, roles, and permissions. Access requires a valid password and an account permitted to sign in. Disabled and terminated accounts cannot create or use sessions.

Vertex OS V1 MUST NOT provide public self-registration.

Accounts MUST be created and activated only through an authorized workflow. Knowing a password MUST NOT grant access to a disabled account.

The identity lifecycle MUST support:

- creation;
- activation;
- suspension;
- disablement;
- authorized password replacement;
- termination.

Disabling or terminating an account MUST invalidate its active application sessions immediately and prevent a new sign-in.

Security-impacting identity changes MUST take effect without requiring the user to wait for stale authorization state to expire.

Role, permission, scope, or privilege removal MUST become effective promptly.

Default/shared privileged accounts MUST NOT exist in production.

---

## 7. Authentication

Protected endpoints require authentication by default. The public login endpoint is explicitly declared. The architecture is defined in [ADR 0001](adr/0001-local-password-authentication.md) and `docs/ARCHITECTURE.md` Section 22.

The Vertex OS interface collects email and password and submits them to the same-origin API. The API verifies the local IAM credential and issues an opaque application session in a `Secure`, `HttpOnly`, `SameSite=Strict` cookie. The browser does not store a credential hash, token or session secret in web storage. Authorization remains a separate backend decision based on access state and effective permissions.

The login endpoint must respond generically to an unknown email, wrong password or inaccessible account. Rate limits apply per client address and normalized email. Request and audit logging must never contain passwords or credential hashes. Unsafe authenticated requests require CSRF proof.

## 8. Passwords and Credentials

IAM stores only a salted scrypt hash of a password. Each hash uses an independent random 32-byte salt and fixed reviewed work factors. The raw password is accepted only for account creation and login, is never returned by an API, and is never included in logs, audit records, fixtures or source control.

Passwords must be 15–128 Unicode characters and at most 512 UTF-8 bytes. Pasting is allowed. There is no arbitrary character-class requirement or periodic forced rotation. The user-provided password must not be sent to any external identity provider. Before production launch, benchmark the scrypt parameters on the actual server and add a check for known compromised passwords.

An administrator with `iam.users.create` may create an employee with email, password, and selected roles. IAM enforces the grant ceiling and commits user, roles and audit evidence together. An administrator with `iam.users.manage-access` can initialize a migrated account's missing password once, subject to the grant ceiling, optimistic version check, CSRF protection and Audit evidence. This revokes any retained sessions. A password replacement workflow for accounts that already have a local password is not yet implemented.

## 9. Multi-Factor Authentication

The owner has explicitly selected single-factor email and password sign-in for Vertex OS. The application does not request, store or verify TOTP, one-time codes, passkeys or other second factors. Any later change to this policy requires a new accepted security decision.

## 10. Account Recovery

There is no public self-service recovery endpoint. The existing one-time initial-password route refuses an account that already has a local password. Any future replacement flow must authenticate and authorize the administrator, hash the new password, audit the change and revoke the target's sessions. Responses must not reveal credential material.

---

## 11. Session Security

The Vertex backend owns and validates the only authentication session.

Application sessions MUST use opaque identifiers.

Application session cookies MUST:

- use `Secure`;
- use `HttpOnly`;
- use `SameSite=Strict`, or `Lax` only with a documented reason; `SameSite=None` MUST NOT be used for the application session cookie;
- use the narrowest practical domain/path scope;
- contain no sensitive user information.

Expired and revoked session secrets MUST be refused. Scheduled housekeeping deletes expired authentication state.

Session identifiers MUST rotate after successful authentication and other privilege-establishing events where appropriate.

Sessions MUST support explicit server-side revocation.

Sessions MUST be revoked on:

- logout;
- account disablement;
- account termination;
- credential reset where appropriate;
- security-critical compromise response.

Application logout MUST terminate the application session server-side. Account restriction and password replacement MUST revoke the affected user's sessions.

Default application-session baseline:

- inactivity timeout: **no more than 60 minutes**;
- absolute session lifetime: **no more than 24 hours** for ordinary authenticated sessions.

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
- changing credentials;
- revoking security controls;
- exporting confidential data;
- changing security settings;
- recording or reversing high-risk financial actions;
- rotating secrets;
- impersonation, if ever introduced.

Depending on risk, sensitive operations MAY require:

- recent authentication;
- explicit confirmation;
- four-eyes approval;
- additional audit detail.

Security-sensitive workflows MUST fail closed.

Credential replacement MUST be authorized, audited, and followed by session revocation.

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

The login endpoint MUST accept credentials only through a same-origin POST and MUST rotate any existing session on success.

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
- local credential hashes and session secrets;
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
- password hashes and session secrets;
- API keys;
- password-reset tokens;
- private cryptographic keys.

Request/response bodies MUST NOT be logged indiscriminately.

Logging SHOULD preserve useful correlation identifiers without leaking credentials or confidential payloads.

---

## 28. Security Events, Monitoring, and Alerting

Logging, monitoring, alerting, and incident response are distinct responsibilities: logging records what happened, monitoring reviews it, alerting brings defined conditions to a responder, and incident response (Section 36) acts on them. Logging alone is not sufficient.

### 28.1 Event sources

Security-relevant events MUST be recorded when applicable.

Vertex OS MUST record relevant local authentication and administration events, including:

- login success/failure;
- logout;
- password change/reset;
- account access-state changes;
- administrative configuration changes.

Vertex OS MUST record its own security events, including:

- application session establishment, refresh, and revocation;
- sign-in denials for inaccessible application users;
- account disablement/reactivation;
- role/permission/scope changes;
- authorization denials;
- security-setting changes;
- suspicious upload rejection;
- sensitive exports;
- privileged security operations.

Security events SHOULD carry the application session and request trace identifiers where safe.

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
- suspicious password replacement and account-recovery abuse indicators;
- security-sensitive configuration changes in Vertex OS;
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

- local password login and session establishment;
- logout endpoints;
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
- HTTPS enforced for the application origin, and the parameters in Section 37 applied.

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
- local credential lookup and verification;
- access denial for disabled or terminated users despite a correct password;
- authorization allow/deny paths;
- object/resource-level access control;
- account disablement;
- role/permission changes;
- privileged operations;
- password hashing, validation and rate limiting;
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
- password or login behavior;
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
- local credential and session handling;
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
- revoke active application sessions;
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
| Password minimum | 15 characters | Vertex OS IAM |
| Accepted password length | 15–128 Unicode characters, at most 512 UTF-8 bytes | Vertex OS IAM |
| Password hashing | Salted scrypt with reviewed work factors | Vertex OS IAM |
| Application session inactivity | ≤ 60 minutes | Vertex OS backend |
| Application session absolute lifetime | ≤ 24 hours | Vertex OS backend |
| Login attempts | rate-limited by client address and normalized email | Vertex OS backend |
| Session-establishment / logout endpoints | rate-limited | Vertex OS backend |
| Privileged actions | authorization and attributable audit evidence | Vertex OS IAM |

Exact technical values MAY be tightened after implementation benchmarking and production risk review.

---

## 38. Security Ownership

Security is a shared responsibility, but ownership MUST remain explicit.

- IAM owns application users, local password hashes, access state, roles, permissions, and authorization primitives.
- The Vertex OS backend owns credential verification, application-session security and CSRF defense through IAM capabilities.
- Each domain module owns authorization decisions tied to its business state.
- Infrastructure owns secure deployment/runtime configuration and TLS termination.
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
- a second password store outside the IAM ownership boundary;
- granting application access to a disabled or terminated account;
- secrets in source control;
- secrets in frontend bundles;
- secrets or credentials in logs;
- session secrets in browser-accessible storage or browser-readable cookies;
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
- OpenID Connect Core 1.0.

External standards guide verification.

This document remains the canonical Vertex OS security policy.
