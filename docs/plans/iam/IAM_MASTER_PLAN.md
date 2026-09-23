# Vertex OS — IAM Master Plan

**Status:** ACTIVE  
**Module:** MOD-IAM — Identity, Organization, and Access  
**Canonical target path:** `docs/plans/iam/IAM_MASTER_PLAN.md`  
**Parent specification:** `docs/modules/iam.md`  
**Planning authority:** `docs/PLANNING.md`  
**Baseline branch:** `main`  
**Baseline commit:** `4076a08cabdb39de494474262a05e145f150aa68`  
**Baseline date:** 2026-09-22  
**Repository:** `HussienALfajer/vertex-media-os`  
**Next executable stage:** `IAM-MP-01` — `AUDIT_REQUIRED` (implementation finished 2026-09-23 from `30c02d6`; IAM-MP-02 awaits acceptance)  
**Execution model:** rolling-wave planning; one executable plan, one implementation conversation, one independent audit, one accepted baseline

---

## 1. Purpose

This document is the module-level Master Plan for implementing Vertex OS IAM.

It exists to answer one question:

> What is the safest, most reviewable, and most architecturally coherent sequence for completing IAM from the current repository baseline?

This is intentionally a **roadmap-level plan**, not a monolithic implementation plan.

It follows `docs/PLANNING.md` and therefore:

- defines the complete IAM delivery route;
- defines stage order and dependencies;
- identifies major deliverables and security checkpoints;
- defines stage-level entry and exit criteria;
- identifies audit focus after each stage;
- tracks stage status;
- does **not** prescribe detailed file-by-file implementation for future stages;
- does **not** create all executable plans in advance;
- does **not** duplicate the full normative contents of `docs/modules/iam.md`;
- does **not** authorize work beyond the current executable plan.

Detailed implementation planning is created only for the next eligible stage from the real accepted repository baseline at that time.

---

## 2. Authority and Source-of-Truth Order

This Master Plan is subordinate to the canonical project documents for the concerns they own.

The authoritative order for IAM delivery is:

```text
AGENTS.md
        ↓
docs/PRODUCT.md
docs/ARCHITECTURE.md
docs/MODULES.md
docs/ENGINEERING.md
docs/SECURITY.md
docs/TESTING.md
docs/DESIGN_SYSTEM.md
        ↓
docs/modules/iam.md
        ↓
docs/PLANNING.md
        ↓
this IAM Master Plan
        ↓
current executable IAM plan
        ↓
implemented repository state
        ↓
independent audit evidence
```

If implementation reveals a contradiction between this Master Plan and a higher-authority source, the conflict MUST be surfaced and reconciled deliberately. The plan MUST NOT silently reinterpret architecture, security, ownership, or the IAM specification.

---

## 3. Execution Gate Before IAM Implementation

**Gate status:** CLOSED (2026-09-22)

The repository was technically positioned to begin IAM, but one governance condition had to be closed before the first executable IAM plan could be implemented.

At the Master Plan baseline:

- `docs/modules/iam.md` contained a detailed implementation-ready IAM specification;
- its latest corrections resolved lifecycle, identity synchronization, invitation delivery, bootstrap recovery, and Keycloak profile-policy inconsistencies;
- `docs/plans/DESIGN_SYSTEM_PLAN.md` declares the shared design-system foundation complete and explicitly states `READY FOR IAM IMPLEMENTATION`;
- the `main` head had a successful GitHub Actions CI run;
- nevertheless, the front matter of `docs/modules/iam.md` still stated:

```text
Status: Proposed V1 Implementation Specification
```

`docs/PLANNING.md` requires the module specification to be approved before implementation planning proceeds into execution.

The gate required:

> **Before implementing `IAM-MP-00`, the repository MUST explicitly record that the IAM specification is accepted / ready for implementation, using the repository's chosen status wording and without changing its substantive decisions unless a real audit finding requires it.**

This was a documentation-governance gate, not a request to redesign IAM.

The gate is closed:

- the independent Final Audit of `docs/modules/iam.md` has been accepted outside the repository;
- the canonical status was reconciled with that accepted reality, and the front matter of `docs/modules/iam.md` now states:

```text
Status: Accepted V1 Implementation Specification
```

- the reconciliation changed only that status line; the accepted specification text is otherwise unchanged since its last substantive revision (`101551a`), and no functional, security, architectural, API-contract, domain-model, or implementation decision was altered;
- this Master Plan became `ACTIVE` and `IAM-MP-00` became `READY` in the same governance change.

IAM execution may therefore formally begin with `IAM-MP-00`, under the delivery model in Section 8. Closing this gate authorizes the detailed executable plan for `IAM-MP-00` only; it does not authorize work beyond the current executable plan.

---

## 4. Repository-Wide Baseline Assessment

### 4.1 Overall project posture

The current repository is a clean foundation for the first real business module.

The repository currently contains:

- the completed Phase 0 engineering foundation;
- the completed Vertex Design System Foundation;
- canonical product, architecture, module, engineering, security, testing, design-system, planning, and IAM specifications;
- no production IAM domain implementation;
- no authentication implementation;
- no authorization implementation;
- no business-domain persistence yet.

IAM is therefore the first module that will exercise the full modular-monolith architecture with real domain state, security-sensitive persistence, an external identity provider, protected HTTP behavior, and business-facing administration UI.

This makes IAM both a product module and an architectural proving point for later modules.

### 4.2 Repository architecture

The repository already establishes:

```text
apps/api
apps/web
apps/web-e2e
packages/database
packages/ui
infra
docs
```

The architecture is a TypeScript modular monolith managed by pnpm and Nx.

Important existing boundaries include:

- browser code cannot depend on backend/database infrastructure;
- reusable libraries cannot violate Nx dependency constraints;
- `packages/database` is backend-only infrastructure;
- `packages/ui` is business-neutral UI infrastructure;
- Base UI and related low-level primitives remain behind the Vertex UI public API;
- applications compose capabilities rather than owning business-domain logic;
- business domains are expected to expose explicit public surfaces.

No `domains/*` workspace currently exists. IAM is the first legitimate reason to introduce it.

### 4.3 API/backend baseline

`apps/api` currently provides technical platform behavior only:

- NestJS on Fastify;
- typed configuration;
- database composition;
- liveness/readiness;
- RFC 9457 Problem Details;
- request correlation;
- structured logging;
- OpenAPI generation;
- security-header foundation.

There is currently no:

- authentication area;
- application-session store;
- OIDC client integration;
- CSRF implementation;
- authorization guard;
- IAM controller;
- Keycloak adapter.

The backend therefore has little legacy security behavior to migrate, which reduces compatibility risk but makes protected-by-default transition discipline especially important.

### 4.4 Persistence baseline

`packages/database/prisma/schema.prisma` has no models.

There are currently:

- no business tables;
- no business migration history;
- no IAM tables;
- no application-session tables;
- no Audit tables;
- no seed/reference synchronization for permissions or system roles.

IAM introduces the first production-quality business migration and therefore establishes patterns that later domains are likely to follow.

The first migration work must prove:

- database constraints are authoritative where structural invariants demand them;
- Prisma boundaries do not leak into domain public surfaces;
- custom PostgreSQL constraints are reviewed when Prisma cannot express them safely;
- concurrency-sensitive security rules are not left to UI or best-effort application checks.

### 4.5 Web and design-system baseline

The web application has:

- React + Vite;
- TanStack Router/Query;
- the shared `@vertex-os/ui` package;
- responsive application-shell foundations;
- Arabic/RTL and English/LTR support;
- Light/Dark themes;
- Default/Compact density;
- common form, overlay, navigation, feedback, table, and sensitive-action patterns;
- accessibility and visual-regression foundations.

The `/dev/ui` IAM screens are **synthetic design proofs only**. They MUST NOT be treated as an implemented IAM frontend, data model, API contract, or authorization mechanism.

The real IAM frontend should reuse the established system and add shared primitives only when a real IAM workflow proves that a missing reusable primitive is required.

### 4.6 Testing and CI baseline

The repository already has a meaningful verification ladder:

- formatting;
- linting and Nx boundary enforcement;
- type checking;
- unit/component/API tests;
- builds;
- Prisma validation/generation;
- PostgreSQL integration tests through Testcontainers;
- Playwright E2E;
- design-system browser checks in Chromium, Firefox, and WebKit;
- dependency vulnerability audit.

The current `main` head has a successful GitHub Actions CI run.

IAM must extend the existing command surface rather than inventing a parallel verification mechanism.

Security-sensitive IAM work must add targeted negative testing, real PostgreSQL integration coverage, real local Keycloak integration coverage where required, and focused browser E2E without turning every lower-level rule into an E2E test.

### 4.7 Infrastructure baseline

`infra/compose.yaml` currently contains PostgreSQL only.

No Keycloak service, realm configuration, SMTP development path, or identity-provider test fixture is present.

IAM therefore owns the first deliberate extension of local infrastructure for authentication.

That extension must remain:

- local-first;
- reproducible;
- loopback-bound where appropriate;
- secret-safe;
- explicitly version-pinned;
- separate from production deployment design.

IAM MUST NOT introduce Redis, a message broker, external object storage, Kubernetes, microservices, or other infrastructure that has no demonstrated IAM requirement.

### 4.8 Security baseline

The canonical security architecture is already fixed:

```text
Browser
    |
    | opaque Secure + HttpOnly Vertex session cookie
    v
Vertex API / BFF
    |
    | OIDC Authorization Code + PKCE S256
    v
Keycloak
```

The most important consequence for implementation is that IAM is not allowed to redesign authentication.

Keycloak owns credentials, password policy, MFA factors, recovery, IdP sessions, and OIDC token issuance.

Backend authentication infrastructure owns login/callback mechanics, application sessions, cookie handling, CSRF, logout, back-channel logout, and server-side token binding.

IAM owns application users, identity mapping, application access state, departments, memberships, roles, permissions, role assignments, and authorization context.

Business modules later own resource-specific authorization.

### 4.9 Documentation/governance baseline

`docs/PLANNING.md` is now committed on `main` and is explicitly routed from repository governance.

That changes how IAM must be delivered:

```text
approved IAM specification
        ↓
IAM Master Plan
        ↓
next executable plan only
        ↓
one implementation conversation
        ↓
independent audit
        ↓
accepted baseline
        ↓
next executable plan
```

A future agent must be able to resume IAM from the repository alone without relying on conversation memory.

### 4.10 Baseline conclusion

The repository has no architectural prerequisite that requires implementing another business module before IAM.

The technical foundations needed before IAM already exist.

The only pre-execution issue at this baseline was governance alignment of the IAM specification status. That issue is closed: the specification is now explicitly accepted (Section 3).

The correct next engineering work is therefore the IAM architecture/domain-package foundation—not direct implementation of login screens, Keycloak provisioning, database models, or admin UI all at once.

---

## 5. Scope of This Master Plan

This Master Plan covers the implementation required to satisfy IAM V1 as defined by `docs/modules/iam.md`, including the required minimum cross-module/platform dependencies necessary to close IAM safely.

It covers, at roadmap level:

- IAM domain/package foundation;
- dependency-boundary enforcement;
- IAM persistence;
- required PostgreSQL invariants;
- permission/reference synchronization;
- protected System Administrator behavior;
- minimal MOD-AUDIT append-only closure dependency;
- Keycloak local/reproducible configuration;
- identity provisioning and reconciliation;
- invitation delivery;
- backend application sessions;
- OIDC login/callback;
- CSRF;
- logout and back-channel logout;
- protected-by-default API behavior;
- authorization context;
- user lifecycle administration;
- department/membership administration;
- role/permission administration;
- bootstrap administration;
- IAM/auth HTTP contracts;
- IAM frontend;
- browser E2E;
- concurrency verification;
- security hardening;
- documentation and final IAM audit.

---

## 6. Explicit Non-Goals

This Master Plan does not authorize:

- full MOD-AUDIT UI/search/reporting;
- full HR or payroll;
- multi-tenancy;
- client identities or a client portal;
- external API authentication;
- API keys;
- machine-to-machine application identities beyond the Keycloak provisioner client required by IAM;
- social login;
- SCIM;
- generic ABAC or policy scripting;
- wildcard permissions;
- direct user permission grants;
- Redis purely for sessions or permission caching;
- a message broker purely for IAM events;
- generic event infrastructure without a real consumer;
- a new deployment architecture;
- Kubernetes;
- microservices;
- production infrastructure design;
- speculative organization hierarchy;
- arbitrary department seed data;
- password, MFA-secret, or credential handling inside Vertex;
- an email-change workflow;
- user impersonation;
- opportunistic implementation of CRM or later modules.

---

## 7. Locked Architectural and Security Invariants

Every executable IAM plan inherits these invariants.

1. **Authentication is not authorization.** Keycloak authentication alone never grants Vertex access.

2. **No browser OIDC tokens.** ID/access/refresh tokens remain server-side and never enter browser application code or persistent browser storage.

3. **Application sessions are backend-owned.** Browser authentication uses an opaque server-side Vertex session.

4. **IAM is not the identity provider.** Vertex never stores or verifies user passwords or MFA secrets.

5. **Identity resolution is issuer + subject only.** Email is not a runtime linking key after identity binding.

6. **IAM access state is authoritative for Vertex access.** SUSPENDED, DISABLED, and TERMINATED users are denied immediately even if Keycloak can still authenticate them.

7. **Authorization is deny-by-default.** Protected routes become protected by default once the authentication foundation is introduced.

8. **Roles aggregate permissions; role names do not authorize business behavior.** Downstream modules consume stable permission-oriented context.

9. **Business-resource policy stays with the owning module.** IAM does not become a generic resource policy engine.

10. **External Keycloak I/O never occurs inside a PostgreSQL transaction.** Local/remote ordering must remain fail-closed.

11. **Privilege removal becomes effective promptly.** No cross-request stale authorization cache is allowed in V1.

12. **No destructive security-history deletion.** Security-critical IAM entities are lifecycle-managed, not ordinarily hard-deleted.

13. **System Administrator lockout prevention is concurrency-safe.** Per-user optimistic concurrency alone is insufficient.

14. **Bootstrap is explicit, operator-run, non-default, idempotent, serialized, and audited.** It is not an HTTP endpoint and never creates credentials.

15. **Audit ownership remains MOD-AUDIT.** IAM may depend on the smallest append-only Audit foundation required for durable accountability, but must not create an IAM-owned generic audit subsystem.

16. **Security-sensitive mutations cannot silently succeed without required durable audit evidence.**

17. **Session identifiers, tokens, authorization codes, PKCE verifiers, secrets, password data, and MFA material never appear in normal logs or API responses.**

18. **No unapproved infrastructure expansion.** Complexity must be justified by a real requirement.

19. **Frontend permission logic is UX only.** Backend authorization remains authoritative.

20. **Repository boundaries remain enforceable.** Cross-domain consumers use IAM's approved public boundary only.

Any implementation proposal that weakens one of these invariants requires explicit reconciliation with the canonical documents before proceeding.

---

## 8. Delivery Model

### 8.1 Stage lifecycle

Each Master Plan stage uses the repository-standard status model:

```text
PLANNED
READY
IN_PROGRESS
AUDIT_REQUIRED
BLOCKED
COMPLETE
```

A stage is not `COMPLETE` merely because code was written.

It becomes `COMPLETE` only after:

1. its executable plan was implemented;
2. required verification passed;
3. an independent audit found no unresolved blocking issue;
4. required fixes were re-verified and re-audited;
5. documentation was synchronized where needed;
6. the resulting repository state was accepted as the next baseline.

### 8.2 Rolling-wave rule

Only the next eligible stage receives a detailed executable plan.

Future stage details MUST be authored from the accepted repository state produced by earlier stages.

This Master Plan may be amended when implementation evidence proves that the stage decomposition should change, but such a change must preserve the canonical IAM specification and be recorded intentionally.

### 8.3 One conversation rule

One executable plan is implemented in one implementation conversation.

If a detailed plan becomes too broad to finish and verify professionally in one conversation, it MUST be split before implementation.

An implementation agent MUST NOT continue into a later Master Plan stage merely because adjacent work appears convenient.

---

## 9. Master Sequence

```text
Governance gate (CLOSED)
      ↓
IAM-MP-00  Architecture & Domain Boundary Foundation
      ↓
IAM-MP-01  IAM Persistence Model & First Business Migration
      ↓
IAM-MP-02  Permission/System-Role Reference Data & Minimal Audit Foundation
      ↓
IAM-MP-03  Keycloak Environment, Realm Contract & Integration Harness
      ↓
IAM-MP-04  Identity Reconciliation, Provisioning & Invitation Delivery
      ↓
IAM-MP-05  Backend Application Session Foundation
      ↓
IAM-MP-06  OIDC Login, First Activation, CSRF & Logout
      ↓
IAM-MP-07  Protected-by-Default API & Authorization Context
      ↓
IAM-MP-08  Department & Membership Administration Core
      ↓
IAM-MP-09  Role/Permission Administration & Last-Admin Protection
      ↓
IAM-MP-10  User Lifecycle, Session Revocation & Bootstrap Core
      ↓
IAM-MP-11  IAM/Auth HTTP Administration Surface & OpenAPI
      ↓
IAM-MP-12  Frontend Authentication & Session Experience
      ↓
IAM-MP-13  Frontend User, Access & Provisioning Administration
      ↓
IAM-MP-14  Frontend Departments, Roles & Permissions Administration
      ↓
IAM-MP-15  End-to-End Security, Concurrency & Operational Hardening
      ↓
Final IAM Module Audit
      ↓
IAM CLOSED
```

The sequence deliberately separates high-risk concerns instead of reproducing the broad `IAM-0 ... IAM-7` implementation-order headings as eight oversized conversations.

The mapping back to the parent specification is recorded in Section 13.

---

# 10. Stage Roadmap

## IAM-MP-00 — Architecture & Domain Boundary Foundation

**Status:** COMPLETE  
**Parent specification area:** IAM-0  
**Depends on:** execution gate in Section 3 (closed)  
**Executable plan:** `docs/plans/iam/IAM_00_ARCHITECTURE_FOUNDATION_PLAN.md` (implemented in `40c5aff`/`54107b0`)  
**Accepted:** 2026-09-23 — independent audit verdict `IAM-00 ACCEPTED` with no blocking findings (executable plan Section 49A); baseline accepted by the owner

### Objective

Establish the first real business-domain package boundary and the platform integration seams required by later IAM work without implementing user-facing IAM behavior.

### Major deliverables

- first-class IAM domain project/package boundary;
- workspace support for `domains/*`;
- explicit IAM public surface convention;
- Nx/ESLint constraints that prevent cross-domain deep imports and preserve backend/domain direction;
- static enforcement of centralized environment access; typed IAM/auth/Keycloak settings remain with the stages that consume them;
- architecture-level separation between:
  - IAM domain,
  - backend authentication/session infrastructure,
  - database infrastructure,
  - Keycloak infrastructure,
  - minimal Audit dependency;
- Keycloak remains outside IAM core; local Keycloak configuration is introduced with `IAM-MP-03`;
- architecture tests or deterministic boundary checks where practical.

### Entry criteria

- IAM specification formally accepted for execution;
- current `main` is the planning baseline;
- Phase 0 and Design System baselines remain accepted.

### Exit criteria

- IAM has an enforceable public/private module boundary;
- future business domains have a reproducible pattern without coupling to IAM internals;
- auth/session infrastructure is not accidentally modeled as IAM domain state;
- no credentials, business records, or unfinished public auth endpoints are introduced;
- repository verification for the affected surface passes.

### Audit focus

- dependency direction;
- public boundary correctness;
- no premature abstractions;
- no hidden Keycloak/IAM ownership mixing;
- no weakened existing UI or database boundaries;
- configuration remains centralized and secret-safe.

---

## IAM-MP-01 — IAM Persistence Model & First Business Migration

**Status:** AUDIT_REQUIRED  
**Parent specification area:** IAM-1  
**Depends on:** IAM-MP-00 COMPLETE (satisfied 2026-09-23)  
**Executable plan:** `docs/plans/iam/IAM_01_PERSISTENCE_FOUNDATION_PLAN.md` (implemented 2026-09-23; independent audit pending)

### Objective

Introduce the authoritative IAM persistence model and prove structural invariants against real PostgreSQL.

### Major deliverables

- IAM persistence for:
  - application users;
  - departments;
  - memberships;
  - roles;
  - permissions;
  - role-permission mappings;
  - user-role assignments;
- first production-quality business migration;
- required enums and stable identifiers;
- unique and referential constraints;
- optimistic concurrency fields;
- user lifecycle database checks;
- one-primary-department enforcement;
- repository interfaces/adapters that remain private to IAM;
- real PostgreSQL integration verification.

### Entry criteria

- domain boundary is accepted;
- persistence ownership is unambiguous;
- migration conventions from existing database infrastructure are understood.

### Carried forward from the IAM-MP-00 audit

- **A-06:** decide deliberately which project owns IAM's private repository adapters, and give it explicit tags and constraints. Today `layer:domain` may depend only on `layer:domain`/`layer:shared`, with `@prisma/*` banned, and `layer:infrastructure` only on `layer:infrastructure`, so "IAM infrastructure → `@vertex-os/iam`" is not yet expressible. Do not loosen the domain-core rule to make persistence fit.
- **A-03:** add `pg` to the domain-core banned external imports when that adapter boundary is defined.
- **A-08:** this stage changes boundary configuration, so prefer a durable, repository-run check of the new rules over temporary probes alone (`docs/ARCHITECTURE.md` Section 39).

The executable plan resolves these at plan level, with authority the owner delegated, in decisions D-01…D-04:

- a separate IAM-owned adapter project `domains/iam-persistence`, tagged `layer:adapter` + `domain:iam`, with the domain-core rule left unchanged;
- lint-restricted private entry points `@vertex-os/iam/persistence` and `@vertex-os/database/persistence`;
- `pg` added to the domain-core ban;
- a `pnpm lint:boundaries` regression check inside `pnpm verify`.

The resolutions become effective when that plan is implemented and audited.

### Exit criteria

- a clean database can migrate reproducibly;
- required structural invariants fail safely at the database boundary;
- Prisma types do not escape IAM's public API;
- migration rollback/failure behavior is understood and tested as applicable;
- no seed user or unapproved department data is introduced.

### Audit focus

- migration SQL;
- check/unique/index semantics;
- nullable identity binding;
- `firstActivatedAt` invariants;
- concurrency/version fields;
- delete behavior;
- domain/database separation.

---

## IAM-MP-02 — Permission/System-Role Reference Data & Minimal Audit Foundation

**Status:** PLANNED  
**Parent specification area:** IAM-1, Sections 18–21, 34–35, 48–49  
**Depends on:** IAM-MP-01 COMPLETE

### Objective

Establish deterministic security reference data and the smallest correctly owned Audit capability required before privileged IAM mutations become reachable.

### Major deliverables

- code-defined IAM permission catalog synchronization;
- protected `system-administrator` role synchronization;
- code-controlled system-role permission mappings;
- idempotent reference synchronization;
- minimal MOD-AUDIT package/public boundary;
- immutable append capability sufficient for IAM accountability;
- minimal durable audit persistence owned by MOD-AUDIT, not IAM;
- trace/request attribution contract for future privileged mutations.

### Entry criteria

- IAM persistence model is accepted;
- Audit ownership from `docs/MODULES.md` remains unchanged.

### Exit criteria

- repeated synchronization converges without duplication or semantic repurposing;
- administrators cannot invent permission codes through data alone;
- the protected system role exists by deterministic repository-defined logic;
- IAM has a durable Audit public capability available before privileged administration is exposed;
- no Audit search, reporting, UI, activity feed, or unrelated Audit scope is implemented.

### Audit focus

- cross-domain ownership;
- append-only semantics;
- privilege catalog stability;
- system-role protection;
- idempotence;
- absence of speculative Audit scope.

---

## IAM-MP-03 — Keycloak Environment, Realm Contract & Integration Harness

**Status:** PLANNED  
**Parent specification area:** IAM-2, Sections 7, 37–39, 46.4  
**Depends on:** IAM-MP-02 COMPLETE

### Objective

Create a reproducible, version-pinned local/test Keycloak environment and prove the realm/client security contract before building IAM provisioning behavior on top of it.

### Major deliverables

- exact Keycloak version baseline required by the IAM specification;
- loopback-local development service;
- reproducible non-secret realm/client configuration;
- `vertex-web` and `vertex-provisioner` responsibility separation;
- user-profile restrictions needed for immutable username/email and protected `vertexUserId`;
- password/MFA/brute-force/event policy configuration required by canonical security rules;
- deterministic local health/readiness behavior;
- generated/ignored local secret handling;
- test integration harness using real Keycloak.

### Entry criteria

- the centralized API configuration loader and raw-environment lint boundary exist; this stage adds typed Keycloak configuration when its actual values are defined;
- no material Keycloak dependency choice conflicts with architecture/security;
- local infrastructure behavior is understood.

### Carried forward from the IAM-MP-00 audit

- **A-04:** the domain-core Keycloak bans take effect only once a package is installed. When this stage installs Keycloak packages, prove an IAM import of them is rejected. IAM-MP-06 does the same for the chosen OIDC runtime library, adding it to the ban list.
- **A-02 (optional):** when typed Keycloak configuration is added, consider closing the raw-environment lint bypasses (`env` imported from `node:process`, `globalThis.process.env`).

### Exit criteria

- realm/client configuration is reviewable and reproducible without relying on manual console state;
- credentials are absent from committed configuration;
- Keycloak policy required by the IAM spec is verifiably configured;
- the real Keycloak integration test environment can be started deterministically;
- existing PostgreSQL development behavior remains intact.

### Audit focus

- secret handling;
- version pinning;
- realm/client separation;
- redirect/logout restrictions;
- user-profile edit permissions;
- MFA/password/event policy;
- local-only development exposure.

---

## IAM-MP-04 — Identity Reconciliation, Provisioning & Invitation Delivery

**Status:** PLANNED  
**Parent specification area:** IAM-2, Sections 11–13, 31, 50  
**Depends on:** IAM-MP-03 COMPLETE

### Objective

Implement the single safe IAM path that reconciles committed Vertex user state with Keycloak and separately manages invitation delivery.

### Major deliverables

- narrow Keycloak Admin integration boundary;
- ownership-proof rules for external identities;
- idempotent identity reconciliation;
- create/find/bind behavior without duplicate or unsafe re-linking;
- fail-closed enable/disable behavior;
- Keycloak session termination capability required by access removal;
- invitation dispatch and resend semantics;
- distinct `identitySyncState` and `invitationDeliveryState` handling;
- safe handling of ambiguous external failures;
- real Keycloak integration tests.

### Entry criteria

- real realm contract is accepted;
- IAM persistence and reference data are accepted;
- no remote call occurs inside a database transaction.

### Exit criteria

- an INVITED Vertex user can be provisioned safely without Vertex handling credentials;
- lost/duplicate-create outcomes reconcile without duplicate identity creation;
- identity conflicts do not modify an unproven Keycloak identity;
- access-reducing reconciliation remains fail-closed;
- invitation failure never masquerades as identity rollback;
- external-provider failures produce stable safe outcomes.

### Audit focus

- idempotence;
- ownership proof;
- issuer/subject immutability;
- transaction boundaries;
- ambiguous-result handling;
- log/response secret safety;
- invitation vs identity state separation.

---

## IAM-MP-05 — Backend Application Session Foundation

**Status:** PLANNED  
**Parent specification area:** IAM-3, Sections 14, 32, 39  
**Depends on:** IAM-MP-04 COMPLETE

### Objective

Create backend-owned, PostgreSQL-backed application-session infrastructure without yet broadening the work into complete browser login behavior.

### Major deliverables

- server-side application-session persistence;
- hashed opaque session identifiers;
- idle and absolute expiry enforcement;
- session revocation;
- user/session lookup needed for later authentication;
- safe storage strategy for server-side OIDC lifecycle material where required;
- CSRF proof storage primitive;
- login-attempt persistence/state boundary;
- security-event hooks for session lifecycle.

### Entry criteria

- authentication infrastructure ownership remains outside IAM domain entities;
- configuration for session timeouts and cryptographic material is typed and validated.

### Exit criteria

- sessions are opaque, revocable, expiry-bounded, and unusable after revocation;
- raw session secrets are not stored or logged where a one-way identifier suffices;
- session infrastructure does not embed durable role/permission snapshots;
- persistence and concurrency behavior is verified against PostgreSQL.

### Audit focus

- secret storage;
- cookie/session separation;
- cryptographic material handling;
- expiry;
- revocation;
- no stale authorization snapshot;
- ownership separation from IAM domain state.

---

## IAM-MP-06 — OIDC Login, First Activation, CSRF & Logout

**Status:** PLANNED  
**Parent specification area:** IAM-3, Sections 13–15, 32–33  
**Depends on:** IAM-MP-05 COMPLETE

### Objective

Deliver the complete first-party browser authentication lifecycle against the real Keycloak integration while preserving the backend-for-frontend model.

### Major deliverables

- login initiation;
- state/nonce/PKCE correlation;
- callback/token validation;
- exact identity resolution through IAM;
- first INVITED → ACTIVE activation semantics;
- secure application-session cookie issuance;
- CSRF synchronizer-token behavior for unsafe requests;
- logout;
- RP-initiated logout behavior where approved;
- Keycloak back-channel logout;
- stable authentication/session error semantics.

### Entry criteria

- session foundation is accepted;
- Keycloak OIDC realm/client contract is accepted;
- IAM identity resolution semantics are available.

### Exit criteria

- a real local Keycloak login creates only a Vertex application session;
- browser code never receives IdP tokens;
- wrong state/nonce/issuer/audience/signature/expiry is rejected;
- unmapped or inactive IAM users do not receive a session;
- first activation is concurrency-safe and cannot overwrite a simultaneous access restriction;
- CSRF protects unsafe cookie-authenticated requests including logout;
- back-channel logout revokes applicable Vertex sessions.

### Audit focus

- protocol validation;
- cookie attributes;
- first activation race behavior;
- CSRF;
- back-channel validation;
- session fixation/rotation considerations;
- token leakage;
- safe public-endpoint classification.

---

## IAM-MP-07 — Protected-by-Default API & Authorization Context

**Status:** PLANNED  
**Parent specification area:** IAM-4, Sections 16–17, 24  
**Depends on:** IAM-MP-06 COMPLETE

### Objective

Make authenticated protection the default API posture and expose the narrow, current IAM authorization context later modules can safely consume.

### Major deliverables

- authenticated request principal;
- active application-user resolution;
- current effective permission projection;
- active department context;
- explicit public-route mechanism;
- protected-by-default controller policy;
- permission requirement capability/guard;
- request-local memoization only where safe;
- current-user IAM capability.

### Entry criteria

- real application sessions function correctly;
- IAM role/permission persistence exists;
- the public/private route set is explicitly known.

### Exit criteria

- forgetting a protection annotation does not silently make a new controller public;
- liveness/readiness and required auth protocol endpoints remain intentionally public;
- inactive/unmapped users are denied despite valid IdP authentication;
- retired permissions, inactive roles, and inactive departments do not become effective;
- authorization context contains stable coarse capability and organizational data without leaking persistence internals;
- privilege removal is reflected on subsequent protected requests without cross-request stale caching.

### Audit focus

- deny-by-default behavior;
- accidental public routes;
- role-name authorization leakage;
- N+1 permission queries;
- stale privilege risk;
- public IAM surface;
- downstream-domain compatibility.

---

## IAM-MP-08 — Department & Membership Administration Core

**Status:** PLANNED  
**Parent specification area:** IAM-5, Sections 22, 28, 30  
**Depends on:** IAM-MP-07 COMPLETE

### Objective

Implement authoritative application-layer behavior for departments and organizational membership before exposing the complete administrative HTTP surface.

### Major deliverables

- department lifecycle behavior;
- membership add/update/remove behavior;
- primary-membership invariants;
- inactive-department restrictions;
- optimistic concurrency for versioned department changes;
- durable audit evidence for security-relevant changes;
- application tests and persistence/concurrency coverage.

### Entry criteria

- authorization context is accepted;
- Audit append capability is available.

### Exit criteria

- department state immediately affects authorization context correctly;
- one-primary-membership behavior is safe under concurrent change;
- backend never silently chooses a primary replacement;
- ordinary workflows do not hard-delete departments;
- before/after accountability evidence exists where required.

### Audit focus

- primary membership concurrency;
- inactive department behavior;
- audit atomicity/ordering;
- no domain-policy leakage into frontend.

---

## IAM-MP-09 — Role/Permission Administration & Last-Admin Protection

**Status:** PLANNED  
**Parent specification area:** IAM-5, Sections 18–20, 23, 30  
**Depends on:** IAM-MP-08 COMPLETE

### Objective

Implement application-layer role and permission administration with concurrency-safe protection against privilege corruption and administrative lockout.

### Major deliverables

- custom role lifecycle;
- role-permission replacement;
- user-role assignment/removal;
- system-role mutation protection;
- inactive-role behavior;
- permission lifecycle semantics;
- serialized last-active-System-Administrator invariant;
- durable Audit evidence;
- competing-operation concurrency tests.

### Entry criteria

- permission/system-role synchronization is accepted;
- authorization context consumes the current persisted role/permission state;
- Audit capability is available.

### Exit criteria

- system role cannot be renamed, deactivated, deleted, or manually stripped of code-controlled permissions;
- direct user-permission grants remain unsupported;
- two concurrent administrator-reducing operations cannot remove the last ACTIVE System Administrator;
- stale expected versions cannot silently overwrite newer privilege state;
- permission changes affect subsequent authorization evaluation promptly.

### Audit focus

- serialization mechanism;
- lockout race scenarios;
- system-role protection;
- permission code stability;
- audit evidence;
- no wildcard/direct-permission shortcuts.

---

## IAM-MP-10 — User Lifecycle, Session Revocation & Bootstrap Core

**Status:** PLANNED  
**Parent specification area:** IAM-5, Sections 10–13, 20–21, 31–32, 48, 53–54  
**Depends on:** IAM-MP-09 COMPLETE

### Objective

Implement the highest-risk IAM administrative workflows as application services before exposing them through the final administrative transport.

### Major deliverables

- user creation orchestration;
- immutable email behavior;
- display-name update;
- suspend/disable/terminate;
- backend-derived reactivation;
- sync-identity;
- resend invitation;
- explicit session revocation;
- role/department validation during creation;
- operator-run bootstrap command;
- bootstrap recovery mode;
- fail-closed local/Keycloak ordering;
- required administrative reason handling;
- security events and durable Audit evidence.

### Entry criteria

- department and role administration cores are accepted;
- last-admin invariant is available;
- Keycloak reconciliation is accepted;
- sessions can be revoked;
- Audit capability is available.

### Exit criteria

- every allowed/forbidden lifecycle transition matches the canonical state machine;
- removal of access is locally effective before remote synchronization;
- reactivation never grants local access before successful required remote state and final local commit;
- terminated users cannot be restored in V1;
- bootstrap is serialized, idempotent, non-default, non-HTTP, secret-safe, and leaves a valid candidate set;
- bootstrap recovery cannot bypass last-admin semantics or resurrect access;
- no user is seeded as administrator.

### Audit focus

- lifecycle transitions;
- remote/local failure ordering;
- reactivation compensation;
- first-activation interaction;
- bootstrap concurrency;
- session revocation;
- audit/security events;
- no secret disclosure.

---

## IAM-MP-11 — IAM/Auth HTTP Administration Surface & OpenAPI

**Status:** PLANNED  
**Parent specification area:** IAM-5, Sections 24–27, 40–42  
**Depends on:** IAM-MP-10 COMPLETE

### Objective

Expose the accepted IAM application capabilities through stable, validated, protected HTTP contracts without moving business rules into controllers.

### Major deliverables

- session/current-user contracts required by the web application;
- users administration endpoints;
- access/provisioning actions;
- department membership endpoints;
- department endpoints;
- role and permission endpoints;
- session-revocation action;
- stable RFC 9457 error codes;
- bounded search/filter/pagination behavior;
- explicit request/response DTOs;
- generated OpenAPI synchronization;
- API integration/security-negative coverage.

### Entry criteria

- underlying application services are accepted;
- protected-by-default behavior is accepted;
- stable error semantics are ready to expose.

### Exit criteria

- every meaningful protected operation proves:
  - allowed actor;
  - unauthenticated denial;
  - missing-permission denial;
  - invalid-state/resource denial where relevant;
  - stable contract;
  - required audit/security side effect;
- unknown sensitive write fields are rejected;
- user update cannot modify email or other protected fields;
- no Prisma, Keycloak token, session ID, credential, or internal implementation type leaks through the API;
- OpenAPI matches executable routes.

### Audit focus

- controller thinness;
- authorization coverage;
- error-code consistency;
- over-posting rejection;
- data minimization;
- pagination bounds;
- OpenAPI drift;
- sensitive response leakage.

---

## IAM-MP-12 — Frontend Authentication & Session Experience

**Status:** PLANNED  
**Parent specification area:** IAM-6, Sections 40–41  
**Depends on:** IAM-MP-11 COMPLETE

### Objective

Integrate the real web application shell with backend-owned authentication/session state without introducing browser token handling or parallel security logic.

### Major deliverables

- initial session bootstrap;
- signed-out state and sign-in action;
- authenticated current-user presentation;
- session-expired/revoked handling;
- CSRF proof handling in memory;
- permission-aware navigation presentation;
- safe protected-data clearing on sign-out/permission loss;
- localized Arabic/English auth/session states.

### Entry criteria

- `/api/auth/session` and CSRF/session contracts are accepted;
- application shell uses the completed Vertex UI foundation.

### Exit criteria

- browser code stores no OIDC token or raw application session identifier;
- localStorage/sessionStorage is not used for authentication state;
- 401, 403, session expiry, and network failures remain semantically distinct;
- frontend visibility improves UX but does not replace backend authorization;
- protected stale data is removed when it is no longer authorized.

### Audit focus

- token/session leakage;
- CSRF handling;
- state clearing;
- 401/403 distinction;
- accessibility/RTL;
- frontend-only authorization assumptions.

---

## IAM-MP-13 — Frontend User, Access & Provisioning Administration

**Status:** PLANNED  
**Parent specification area:** IAM-6, Sections 40, 42, 52–54  
**Depends on:** IAM-MP-12 COMPLETE

### Objective

Deliver the primary IAM administrator workflows for users and access state using the shared Vertex design system.

### Major deliverables

- user directory and detail;
- create/invite user;
- role and department assignment within user workflows;
- access-state actions;
- sync-identity;
- resend-invitation;
- revoke-sessions;
- separate presentation for access, identity synchronization, and invitation delivery;
- conflict/stale-write handling;
- sensitive-action confirmation;
- administrative reason input where supported.

### Entry criteria

- authenticated frontend foundation is accepted;
- user/admin HTTP contracts are stable.

### Exit criteria

- no password, MFA-secret, recovery-token, or IdP-token UI exists in Vertex;
- destructive/security-sensitive actions identify exact target and consequence;
- backend-derived reactivation outcome is presented correctly;
- invitation delivery is not confused with identity synchronization or activation;
- stale-write and conflict outcomes preserve safe user context;
- accessibility and Arabic/RTL behavior are verified.

### Audit focus

- dangerous-action UX;
- data exposure;
- state-label correctness;
- optimistic concurrency UX;
- unauthorized action visibility vs backend enforcement;
- use of shared UI rather than local parallel components.

---

## IAM-MP-14 — Frontend Departments, Roles & Permissions Administration

**Status:** PLANNED  
**Parent specification area:** IAM-6, Sections 40, 52  
**Depends on:** IAM-MP-13 COMPLETE

### Objective

Complete the IAM administration UI for organizational and privilege management while preserving the canonical security model.

### Major deliverables

- department administration;
- membership administration;
- role administration;
- role-permission editor;
- permission-catalog read experience;
- system-role protections in UX;
- clear role/department inactive states;
- sensitive confirmation for role-permission and access-scope changes;
- conflict/version handling.

### Entry criteria

- corresponding backend contracts are accepted;
- shared table/form/overlay patterns are available.

### Exit criteria

- administrators can map existing permissions but cannot invent permission codes;
- System Administrator protections are visible without pretending UI is the security boundary;
- role names are not used as application authorization logic;
- department deactivation consequences are clearly communicated;
- shared Vertex UI, localization, keyboard, RTL, and responsive behavior meet the design-system contract.

### Audit focus

- privilege-management UX;
- accidental permission creation;
- system-role representation;
- stale mutation handling;
- accessibility;
- no duplication of backend policy in React.

---

## IAM-MP-15 — End-to-End Security, Concurrency & Operational Hardening

**Status:** PLANNED  
**Parent specification area:** IAM-7, Sections 46–60  
**Depends on:** IAM-MP-14 COMPLETE

### Objective

Verify IAM as an integrated system, close cross-stage defects, and produce an auditable repository state suitable for the dedicated Final Module Audit.

### Major deliverables

- focused real-Keycloak browser journeys;
- invitation/first-activation journey;
- login/logout/session-expiry/revocation journeys;
- privilege-change effect verification;
- suspended-user access-loss verification;
- last-System-Administrator protection;
- bootstrap/recovery verification;
- required concurrency races;
- CSRF/security-negative coverage;
- Keycloak policy/config verification;
- dependency audit;
- operational failure-path review;
- secret/log review;
- documentation synchronization;
- removal of temporary debugging/bypass/TODO security code;
- full repository verification.

### Entry criteria

- all functional backend and frontend stages are independently accepted;
- no earlier stage has unresolved blocking findings.

### Exit criteria

- the IAM specification Definition of Done is satisfied or every remaining item is explicitly classified as a blocker;
- required repository verification succeeds;
- Keycloak/browser/PostgreSQL critical paths have evidence;
- no temporary security bypass remains;
- canonical documentation matches executable reality;
- repository is ready for the Final IAM Module Audit.

### Audit focus

- integrated end-to-end semantics;
- security invariants;
- race conditions;
- failure recovery;
- observability/auditability;
- UI/API consistency;
- repository cleanliness;
- documentation truthfulness.

---

# 11. Cross-Stage Verification Strategy

Verification grows with implementation rather than being postponed to the end.

The expected evidence progression is:

| Stage group | Primary evidence |
|---|---|
| MP-00 | lint/Nx architecture checks, typecheck, existing regression gate |
| MP-01 | Prisma validate/generate, migration review, PostgreSQL integration tests |
| MP-02 | idempotent reference sync tests, Audit append/persistence tests, boundary tests |
| MP-03 | real Keycloak realm/config integration verification |
| MP-04 | Keycloak Admin/reconciliation/invitation integration tests |
| MP-05 | PostgreSQL session persistence, expiry/revocation/security tests |
| MP-06 | OIDC/PKCE/state/nonce/cookie/CSRF/logout/back-channel integration tests |
| MP-07 | protected-route and authorization-context negative/positive tests |
| MP-08–10 | domain/application/persistence/concurrency/audit tests |
| MP-11 | API integration, contract, Problem Details, OpenAPI verification |
| MP-12–14 | frontend feature, accessibility, RTL, conflict-state tests |
| MP-15 | real browser E2E, concurrency, dependency/security, full repository gates |

Every executable plan must select the smallest meaningful subset during implementation and then run the full gate required by the affected surface before requesting audit.

A check MUST NOT be reported as passed unless it actually ran successfully.

---

## 12. Independent Audit Contract

After every executable plan:

```text
implementation complete
        ↓
stage status = AUDIT_REQUIRED
        ↓
independent read-only audit
        ↓
┌───────────────────────┬───────────────────────────┐
│ no blocking findings │ blocking findings         │
│        ↓              │        ↓                  │
│ accept baseline       │ targeted fixes            │
│ stage COMPLETE        │ re-verification            │
│        ↓              │ re-audit                  │
│ plan next stage       │ accept baseline only then │
└───────────────────────┴───────────────────────────┘
```

The independent audit should evaluate the stage against:

- its executable plan;
- `docs/modules/iam.md`;
- architecture/module ownership;
- security invariants;
- testing policy;
- actual repository diff;
- actual verification evidence.

The implementation agent's completion report is evidence, not acceptance.

No later executable plan may be authored from an unaccepted baseline.

---

## 13. Mapping to `docs/modules/iam.md` Implementation Order

The parent specification intentionally describes eight broad implementation phases. This Master Plan decomposes them into smaller execution/audit units without changing their semantics.

| IAM specification phase | Master Plan stages |
|---|---|
| IAM-0 — Architecture and package foundation | IAM-MP-00 |
| IAM-1 — Persistence foundation | IAM-MP-01, IAM-MP-02 |
| IAM-2 — Keycloak integration | IAM-MP-03, IAM-MP-04 |
| IAM-3 — BFF authentication and sessions | IAM-MP-05, IAM-MP-06 |
| IAM-4 — IAM authorization context | IAM-MP-07 |
| IAM-5 — Administration API | IAM-MP-08, IAM-MP-09, IAM-MP-10, IAM-MP-11 |
| IAM-6 — Frontend | IAM-MP-12, IAM-MP-13, IAM-MP-14 |
| IAM-7 — E2E, hardening, and closeout | IAM-MP-15 + Final IAM Module Audit |

This decomposition exists to satisfy `docs/PLANNING.md`: each executable plan should remain small enough for one professional implementation conversation and one confident audit.

The broad IAM-0 specification also mentions typed auth/IAM configuration and a local Keycloak baseline. The approved IAM-MP-00 executable plan limits that first stage to package and static boundaries; the configuration shapes and Keycloak files are delivered by the later stages that consume them. This is sequencing within the accepted IAM architecture, not a change of ownership or topology.

---

## 14. Master Risk Register

| ID | Risk | Why it matters | Master-level mitigation |
|---|---|---|---|
| IAM-R01 | IAM specification status remains `Proposed` | execution could begin without canonical acceptance | closed — Section 3 gate closed; specification status is `Accepted` |
| IAM-R02 | First business migration establishes poor precedent | later domains may copy weak constraints/patterns | isolate MP-01 and audit migration/invariants deeply |
| IAM-R03 | IAM creates its own generic audit table | violates MOD-AUDIT ownership and causes later migration debt | build only minimal MOD-AUDIT append boundary in MP-02 |
| IAM-R04 | Keycloak manual configuration drifts | security behavior becomes non-reproducible | configuration-as-code + real integration verification |
| IAM-R05 | Ambiguous Keycloak failures duplicate/re-link identities | identity takeover or duplicate account risk | one idempotent reconciliation path with ownership proof |
| IAM-R06 | Remote I/O inside DB transactions | long locks and inconsistent distributed outcomes | explicit fail-closed ordering; no remote call in transaction |
| IAM-R07 | Session/token leakage | critical credential compromise | opaque sessions, server-side tokens, log/response negative tests |
| IAM-R08 | Default-public API transition misses a route | silent authorization bypass | protected-by-default stage with explicit public route mechanism |
| IAM-R09 | Last-admin race across two users | total administrative lockout | serialized invariant + competing-operation integration tests |
| IAM-R10 | Privilege changes remain stale | removed permissions continue to work | no cross-request auth cache; current context per protected request |
| IAM-R11 | Frontend becomes authorization authority | bypass through alternate clients/routes | backend enforcement tests for every meaningful operation |
| IAM-R12 | Bootstrap becomes a backdoor/default account | persistent privileged access risk | operator-run command only; no defaults; serialized, audited |
| IAM-R13 | IAM frontend invents a second component system | UI fragmentation and accessibility regression | consume `@vertex-os/ui`; add only justified reusable primitives |
| IAM-R14 | E2E absorbs all verification | slow/flaky suite hides lower-level defects | risk-based test layering; focused E2E only |
| IAM-R15 | Scope expands into HR/multi-tenancy/client identities | delays first business module and weakens architecture | enforce explicit non-goals and PLANNING scope discipline |
| IAM-R16 | Main-branch governance relies only on convention | security-sensitive changes may bypass intended review discipline | keep independent audit mandatory; repository protection policy may be hardened separately from IAM scope |

---

## 15. Stage Status Ledger

The Section 3 execution gate is closed and this Master Plan is `ACTIVE`. IAM-MP-00 is `COMPLETE`: its independent audit returned `IAM-00 ACCEPTED` with no blocking findings, and the owner accepted the baseline on 2026-09-23. IAM-MP-01 awaits independent audit; no subsequent IAM stage has started.

The next executable stage is `IAM-MP-01`, which is `AUDIT_REQUIRED`. Its executable plan, `docs/plans/iam/IAM_01_PERSISTENCE_FOUNDATION_PLAN.md`, was written on 2026-09-23 from `main` at `a1e087f`; implementation began from `30c02d6` with a clean working tree and finished as uncommitted changes for independent review.

| Stage | Status | Accepted baseline required before planning |
|---|---|---|
| IAM-MP-00 Architecture & Domain Boundary Foundation | COMPLETE | IAM spec execution gate (closed) |
| IAM-MP-01 IAM Persistence & First Migration | AUDIT_REQUIRED | MP-00 COMPLETE (satisfied) |
| IAM-MP-02 Reference Data & Minimal Audit Foundation | PLANNED | MP-01 COMPLETE |
| IAM-MP-03 Keycloak Environment & Realm Contract | PLANNED | MP-02 COMPLETE |
| IAM-MP-04 Identity Reconciliation & Invitations | PLANNED | MP-03 COMPLETE |
| IAM-MP-05 Application Session Foundation | PLANNED | MP-04 COMPLETE |
| IAM-MP-06 OIDC / Activation / CSRF / Logout | PLANNED | MP-05 COMPLETE |
| IAM-MP-07 Default Protection & Authorization Context | PLANNED | MP-06 COMPLETE |
| IAM-MP-08 Department & Membership Core | PLANNED | MP-07 COMPLETE |
| IAM-MP-09 Role/Permission & Last-Admin Core | PLANNED | MP-08 COMPLETE |
| IAM-MP-10 User Lifecycle & Bootstrap Core | PLANNED | MP-09 COMPLETE |
| IAM-MP-11 HTTP Administration Surface | PLANNED | MP-10 COMPLETE |
| IAM-MP-12 Frontend Authentication & Session UX | PLANNED | MP-11 COMPLETE |
| IAM-MP-13 Frontend User & Access Admin | PLANNED | MP-12 COMPLETE |
| IAM-MP-14 Frontend Department/Role/Permission Admin | PLANNED | MP-13 COMPLETE |
| IAM-MP-15 E2E & Hardening | PLANNED | MP-14 COMPLETE |
| Final IAM Module Audit | PLANNED | MP-15 COMPLETE |

The ledger MUST be updated only from real implementation/audit evidence.

### Amendment record — IAM-MP-00 acceptance (2026-09-23)

- **What changed:** IAM-MP-00 `AUDIT_REQUIRED` → `COMPLETE`, and IAM-MP-01 `PLANNED` → `READY`. Non-blocking audit items A-02, A-03, A-04, A-06 and A-08 were attached to IAM-MP-01 and IAM-MP-03 as "Carried forward from the IAM-MP-00 audit".
- **Evidence:** `IAM_00_ARCHITECTURE_FOUNDATION_PLAN.md` Section 49A: independent audit of `40c5aff`/`54107b0` with the auditor's own negative boundary probes, `pnpm verify:full`, uncached `pnpm verify`, `pnpm deps:audit` and Nx graph/sync checks, followed by the owner's acceptance.
- **Stages affected:** IAM-MP-01 and IAM-MP-03 (and IAM-MP-06 for the OIDC runtime ban). Stage order and ownership are unchanged.
- **Findings outside IAM scope:** A-01 (a design-system E2E test that was flaky under CPU contention and hidden by CI retries) was fixed in `ea8b16c`; CI now fails on flaky tests. A-05 (`packages/ui` switches off `no-restricted-imports` entirely) belongs to design-system configuration. Neither blocks IAM planning.
- **Accepted baselines:** remain valid.

### Amendment record — IAM-MP-01 executable plan written (2026-09-23)

- **What changed:** `docs/plans/iam/IAM_01_PERSISTENCE_FOUNDATION_PLAN.md` was written. IAM-MP-01 remains `READY` until its implementation conversation starts. The IAM-MP-01 section now links the plan and summarizes how it resolves the carried-forward audit items A-03, A-06 and A-08.
- **Evidence:** the plan's Section 6.3 records planning-time probes against the repository's own Prisma 7.10.0 CLI and a throwaway PostgreSQL 18.6 container. One notable finding: `prisma migrate deploy` does not apply a migration atomically, so the plan requires an explicit transaction wrapper.
- **Stages affected:** none reordered. Within the stage's own scope, IAM-MP-01 delivers repository operations for the user aggregate only; department, role and permission write operations arrive with IAM-MP-02, IAM-MP-08 and IAM-MP-09, while all seven tables and their constraints are created in IAM-MP-01.
- **Accepted baselines:** remain valid.

### Amendment record — IAM-MP-01 implementation ready for independent audit (2026-09-23)

- **What changed:** IAM-MP-01 `IN_PROGRESS` → `AUDIT_REQUIRED`. The stage delivered seven IAM tables/enums with named database constraints, an atomic first business migration, a private IAM repository adapter and enforced boundary probes. IAM-MP-02 remains `PLANNED` and cannot start until audit and owner acceptance.
- **Evidence:** `IAM_01_PERSISTENCE_FOUNDATION_PLAN.md` Sections 36–38: fresh migration and drift tests, 51 IAM unit tests, 10 database integration tests, three consecutive 73-test adapter integration runs, V1–V19/C1–C2 boundary probes, uncached `pnpm verify`, `pnpm verify:full` with 130 Playwright tests, and `pnpm deps:audit`. The root gates used a temporary local exclusion for two existing sibling worktrees; it was restored after each run. No source under `apps/api` changed.
- **Stages affected:** IAM-MP-01 only; no stage order or ownership change.
- **Remaining audit focus:** Nx cycle diagnostics for reverse-edge probes V5/V7, Prisma's missing structured CHECK names, and R-07's clean Linux schema-engine acquisition. Independent audit determines acceptance.
- **Accepted baselines:** unchanged; IAM-MP-01 is not yet accepted.

---

## 16. Master Plan Change Discipline

This roadmap may change when the actual repository makes a change necessary, but updates must preserve the distinction between roadmap and implementation plan.

Acceptable reasons to amend this Master Plan include:

- a completed stage reveals a new dependency that changes safe ordering;
- an executable stage proves too large and must be split;
- an independent audit finds a cross-stage risk;
- a canonical specification is deliberately amended;
- a required external integration constraint changes materially.

The Master Plan MUST NOT be expanded merely because:

- a future feature seems useful;
- a new library is attractive;
- a later domain could theoretically reuse extra abstraction;
- an implementation agent prefers a different architecture without canonical approval.

When amended, record:

- what changed;
- why the repository evidence justified it;
- which stages are affected;
- whether already accepted baselines remain valid.

---

## 17. Final IAM Module Audit

After `IAM-MP-15` is accepted, perform a dedicated Final Module Audit.

This is not another implementation stage.

The Final Audit evaluates IAM as one integrated system and must verify, at minimum:

### Specification coverage

- every applicable requirement in `docs/modules/iam.md` has implementation evidence;
- intentionally deferred items remain deferred;
- no undocumented substitute semantics were introduced.

### Architecture

- IAM owns only its documented domain concepts;
- auth/session infrastructure remains outside IAM business entities;
- Keycloak remains the identity provider;
- Audit ownership remains MOD-AUDIT;
- cross-module consumers have only the approved IAM public surface;
- no forbidden dependency or persistence shortcut exists.

### Security

- browser never receives IdP tokens;
- credentials/MFA stay in Keycloak;
- application sessions are opaque, server-side, revocable, and expiry-bounded;
- CSRF, state, nonce, PKCE, issuer/audience/signature/expiry validation are correct;
- inactive/unmapped users are denied;
- protected endpoints are deny-by-default;
- privilege removal is prompt;
- last-System-Administrator protection is race-safe;
- bootstrap is not a privileged backdoor;
- sensitive logs/responses contain no secrets.

### Data integrity

- IAM migrations reproduce from an empty database;
- constraints match domain invariants;
- optimistic/serialized concurrency behavior is correct;
- access and identity mappings cannot be silently corrupted;
- no ordinary hard-delete path destroys required security history.

### External identity integration

- provisioning is retryable/idempotent;
- ownership proof prevents unsafe linking;
- ambiguous failures are recoverable;
- realm configuration is reproducible;
- identity and invitation state are not conflated;
- disable/reactivation ordering fails closed.

### Authorization

- effective permissions come from current active role/permission state;
- departments contribute organizational context but not permission by themselves;
- role names are not business authorization checks;
- resource-specific policy remains available for later owning modules.

### API/frontend

- OpenAPI matches executable behavior;
- stable Problem Details codes are consistent;
- frontend never becomes security-authoritative;
- sensitive actions have deliberate confirmation;
- stale/conflict outcomes are explicit;
- Arabic/RTL, accessibility, responsive behavior, and shared UI contracts hold.

### Accountability

- required security events exist;
- privileged IAM mutations produce durable immutable Audit evidence;
- audit failures cannot silently discard required accountability.

### Verification and operations

- targeted test layers provide meaningful evidence;
- full required repository verification succeeds;
- dependency/security audit satisfies repository policy;
- no temporary bypass, focused test, debug code, or undocumented workaround remains;
- documentation and README/current limitations are reconciled with the new reality.

The Final IAM Module Audit result must be one of:

```text
IAM ACCEPTED
```

or:

```text
IAM NOT ACCEPTED
```

IAM is not complete until the audit is accepted and every blocking finding is resolved/re-audited.

---

## 18. IAM Completion Definition

IAM may be marked complete only when:

- every stage IAM-MP-00 through IAM-MP-15 is `COMPLETE`;
- every stage completion is backed by an accepted independent audit;
- the parent IAM specification Definition of Done is satisfied;
- the dedicated Final IAM Module Audit returns `IAM ACCEPTED`;
- canonical documentation matches the final repository;
- the next module can depend on IAM's public authorization contract without reading IAM persistence internals.

The expected end state is:

```text
Phase 0 Foundation                    COMPLETE
Design System Foundation              COMPLETE
IAM Specification                     ACCEPTED
IAM Master Plan                       COMPLETE
IAM implementation stages             COMPLETE
IAM Final Module Audit                ACCEPTED
MOD-IAM                               CLOSED
        ↓
next module planned from the new accepted baseline
```

---

## 19. Exact Next Step

The governance steps that had to precede execution are complete:

- `docs/modules/iam.md` has been reconciled from `Proposed V1 Implementation Specification` to `Accepted V1 Implementation Specification`, after its independent Final Audit was accepted;
- this file is placed at `docs/plans/iam/IAM_MASTER_PLAN.md` and is `ACTIVE`;
- these governance changes are recorded on `main`.

IAM-MP-00 has been completed through that cycle: plan written, implemented (`40c5aff`, `54107b0`), independently audited (`IAM-00 ACCEPTED`, executable plan Section 49A) and accepted by the owner on 2026-09-23.

The executable plan for IAM-MP-01 now exists:

```text
docs/plans/iam/IAM_01_PERSISTENCE_FOUNDATION_PLAN.md
```

It was written from `main` at `a1e087f` using the structure required by `docs/PLANNING.md`, and it resolves the carried-forward items A-03, A-06 and A-08 (its decisions D-01…D-04).

The next steps are:

1. implement that plan in one implementation conversation, then stop;
2. perform an independent audit and accept the resulting baseline only after blocking findings are closed;
3. then create the executable plan for IAM-MP-02.

Do **not** create detailed implementation plans for IAM-MP-02 through IAM-MP-15 now.

That would defeat the rolling-wave planning method that `docs/PLANNING.md` was added to enforce.

---

## 20. Core Rule for IAM Delivery

> **One IAM Master Plan → one executable IAM plan at a time → one implementation conversation → one independent audit → one accepted repository baseline → next IAM plan.**

Repeat until all IAM stages are complete, then perform the Final IAM Module Audit.

No stage is complete because it “looks finished.”  
No future plan is detailed from an unaccepted baseline.  
No security invariant is deferred merely to preserve schedule.  
The repository—not conversational memory—carries IAM forward.
