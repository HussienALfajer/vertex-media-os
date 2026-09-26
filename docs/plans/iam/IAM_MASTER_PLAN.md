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
**Next step:** complete [IAM-R12](IAM_R12_PROVIDER_SESSION_CLEANUP_PLAN.md) after merged IAM-R11, then perform the independent Final IAM audit on merged `main`. The audit includes the deferred `IAM-CP2` scope (amendment record 2026-09-24) and IAM-R10–R12.  
**Execution model:** `docs/PLANNING.md` — one stage run per session ending in a reviewed pull request; the owner's merge is the accepted baseline; deep audits at checkpoint `IAM-CP1` and the Final IAM Module Audit, which also covers the deferred `IAM-CP2` scope (Section 8)

> **Owner-directed amendment, 2026-09-25:** The owner replaced the planned Keycloak/OIDC/TOTP
> architecture with local email/password authentication. [ADR-0001](../../adr/0001-local-password-authentication.md)
> and [IAM-R10](IAM_R10_LOCAL_AUTH_PLAN.md) define this new Tier A run. The historical R01–R09B
> records remain delivery history; their provider-specific requirements are superseded for new work.
>
> **Final-audit fix amendment, 2026-09-25:** [IAM-R11](IAM_R11_AUDIT_FIXES_PLAN.md) closes the
> migrated-administrator lockout and current UI/acceptance-evidence findings on the merged R10
> baseline. A focused IAM-R12 removes dormant provider session mechanics and its unused startup
> secret after R11 merges. The Final Audit verdict follows both reviewed, merged fixes.

---

## 1. Purpose

This document is the module-level Master Plan for implementing Vertex OS IAM.

It exists to answer one question:

> What is the safest, most reviewable, and most architecturally coherent sequence for completing IAM from the current repository baseline?

This is intentionally a **roadmap-level plan**, not a monolithic implementation plan.

It follows `docs/PLANNING.md` and therefore:

- defines the complete IAM delivery route;
- defines stage order and dependencies;
- groups stages into runs, assigns each run a risk tier and places the deep-audit checkpoints (Section 8);
- identifies major deliverables and security checkpoints;
- defines stage-level entry and exit criteria;
- identifies the review focus of each stage (its "Audit focus");
- tracks stage status;
- does **not** prescribe detailed file-by-file implementation for future stages;
- does **not** create all run plans in advance;
- does **not** duplicate the full normative contents of `docs/modules/iam.md`;
- does **not** authorize work beyond the current run plan.

Detailed planning is created only for the next eligible run, from the merged `main` at that time.

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
current IAM run plan
        ↓
merged repository state
        ↓
review and audit evidence (pull requests, CI, audit records)
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

- the reconciliation changed only that status line; the accepted specification text was otherwise unchanged since its last substantive revision (`101551a`; later, owner-approved A1-03 corrected the permission-code examples in Sections 6.4, 16.1 and 16.3), and no functional, security, architectural, API-contract, domain-model, or implementation decision was altered;
- this Master Plan became `ACTIVE` and `IAM-MP-00` became `READY` in the same governance change.

IAM execution may therefore formally begin with `IAM-MP-00`, under the delivery model in Section 8. Closing this gate authorizes the detailed executable plan for `IAM-MP-00` only; it does not authorize work beyond the current executable plan.

---

## 4. Repository-Wide Baseline Assessment

This section is a snapshot of the repository at the baseline commit `4076a08` (2026-09-22), before IAM-MP-00. Only Section 4.9 was later updated for the run-based delivery method; the ledger (Section 15) and `README.md` describe the current state.

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

That changes how IAM must be delivered. Since 2026-09-23 (Section 15, amendment "delivery method"), IAM follows the run-based method:

```text
approved IAM specification
        ↓
IAM Master Plan (runs, tiers, checkpoints)
        ↓
next run: plan → implement → verify → in-run review → pull request
        ↓
owner merges = accepted baseline
        ↓
deep audit at IAM-CP1 (IAM-CP2 deferred into the final audit)
        ↓
next run
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

Every IAM run plan inherits these invariants.

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

IAM follows `docs/PLANNING.md`. This section fixes the IAM-specific parts: runs, tiers and checkpoints.

### 8.1 Stage lifecycle

Stages use the status model of `docs/PLANNING.md` Section 2: `PLANNED`, `READY`, `COMPLETE` and, when needed, `BLOCKED` are recorded here. `IN_PROGRESS` and `IN_REVIEW` are the open branch and the open pull request. IAM-MP-00 to IAM-MP-02 were accepted under the previous method; their records are historical.

A stage is `COMPLETE` when the pull request of its run is merged, after in-run review and green CI. A stage covered by a checkpoint also needs the checkpoint's accepted audit before any later run starts.

### 8.2 Rolling-wave rule

Only the next run receives a detailed plan, written from the merged `main`. The run planner may split a run when its diff would not be reviewable in one careful pass, and records the split here. Merging runs, moving a checkpoint or reordering stages is an amendment of this plan.

### 8.3 Runs, tiers and checkpoints

| Run | Stages | Tier | Reviewers (`docs/PLANNING.md` Section 8.2) | After the run |
|---|---|---|---|---|
| `IAM-R01` | IAM-MP-03 | A | security; architecture and boundaries; tests and verification | — |
| `IAM-R02` | IAM-MP-04 | A | security; data and concurrency; architecture and boundaries | — |
| `IAM-R03` | IAM-MP-05, IAM-MP-06 | A | security; data and concurrency; architecture and boundaries | **`IAM-CP1` deep audit** — authentication (MP-03 to MP-06) |
| `IAM-R03F` | fix run for the `IAM-CP1` blocking finding (IAM-MP-05, IAM-MP-06 scope; `docs/PLANNING.md` Section 9) | A | security; data and concurrency; tests and verification | `IAM-CP1` re-check of its blocking finding |
| `IAM-R04` | IAM-MP-07 | A | security; data and concurrency; architecture and boundaries | — |
| `IAM-R05` | IAM-MP-08, IAM-MP-09 | A | security; data and concurrency; architecture and boundaries | — |
| `IAM-R06` | IAM-MP-10 | A | security; data and concurrency; architecture and boundaries | — (`IAM-CP2` deferred into `IAM-FINAL` by owner decision, 2026-09-24) |
| `IAM-R07` | IAM-MP-11 | A | security; architecture and boundaries; tests and verification | — |
| `IAM-R08` | IAM-MP-12 | B | security; tests and verification (swapped by the run planner, R08 D-02) | — |
| `IAM-R08B` | IAM-MP-13 | B | architecture and boundaries; tests and verification | — |
| `IAM-R08C` | IAM-MP-14 | B | architecture and boundaries; tests and verification | — |
| `IAM-R09` | IAM-MP-15 (part 1: backend security, concurrency and operational hardening; test evidence) | A | security; data and concurrency; tests and verification | — |
| `IAM-R09B` | IAM-MP-15 (part 2: real-browser journeys, cross-engine cookies, closeout and Definition of Done map) | A | security; tests and verification; architecture and boundaries | **`IAM-FINAL`** Final IAM Module Audit (Section 17) |
| `IAM-R10` | Owner-directed local password authentication replacement | A | security; data and concurrency; tests and verification | **`IAM-R11`** audit fix run |
| `IAM-R11` | Migrated-administrator recovery and current IAM QA fixes | A | security; data and concurrency; UI/UX and verification | **`IAM-R12`** provider cleanup |
| `IAM-R12` | Dormant external-provider session cleanup | A | security; data and concurrency; tests and verification | **`IAM-FINAL`** Final IAM Module Audit (Section 17) |

Grouping rules behind the table:

- Runs group stages that share one risk surface: sessions with the OIDC flow that creates them (R03), the two privilege-administration cores (R05), and the three frontend stages that consume one accepted HTTP surface (R08).
- IAM-MP-04 and IAM-MP-10 stay alone: identity linking and user lifecycle carry the highest failure cost and the most concurrency.
- `IAM-R08` is Tier B because the backend stays authoritative for every rule it presents. Its planner splits it if the frontend diff would not be reviewable in one pass.
- The `IAM-R08` planner split it into `IAM-R08` (IAM-MP-12), `IAM-R08B` (IAM-MP-13) and `IAM-R08C` (IAM-MP-14): the three stages together would not be reviewable in one pass (plan `IAM_R08_FRONTEND_SESSION_PLAN.md` D-01). Each stays Tier B.
- The `IAM-R09` planner split IAM-MP-15 into `IAM-R09` (backend and test evidence) and `IAM-R09B` (browser journeys and closeout): one pull request with both would not be reviewable in one pass (plan `IAM_R09_SECURITY_HARDENING_PLAN.md` D-01). Both stay Tier A.
- Each stage's "Audit focus" in Section 10 is the review focus of its run and of the checkpoint that covers it.

### 8.4 Scope rule

A run delivers only its stages. It MUST NOT continue into a later stage because adjacent work appears convenient.

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
IAM-MP-03  Keycloak Environment, Realm Contract & Integration Harness      [R01]
      ↓
IAM-MP-04  Identity Reconciliation, Provisioning & Invitation Delivery    [R02]
      ↓
IAM-MP-05  Backend Application Session Foundation                         [R03]
IAM-MP-06  OIDC Login, First Activation, CSRF & Logout                    [R03]
      ↓
IAM-CP1    Deep audit: authentication
      ↓
IAM-MP-07  Protected-by-Default API & Authorization Context               [R04]
      ↓
IAM-MP-08  Department & Membership Administration Core                    [R05]
IAM-MP-09  Role/Permission Administration & Last-Admin Protection         [R05]
      ↓
IAM-MP-10  User Lifecycle, Session Revocation & Bootstrap Core            [R06]
      ↓
IAM-CP2    deferred into the Final IAM Module Audit (owner decision 2026-09-24)
      ↓
IAM-MP-11  IAM/Auth HTTP Administration Surface & OpenAPI                 [R07]
      ↓
IAM-MP-12  Frontend Authentication & Session Experience                   [R08]
IAM-MP-13  Frontend User, Access & Provisioning Administration            [R08]
IAM-MP-14  Frontend Departments, Roles & Permissions Administration       [R08]
      ↓
IAM-MP-15  End-to-End Security, Concurrency & Operational Hardening       [R09, R09B]
      ↓
Final IAM Module Audit
      ↓
IAM CLOSED
```

The stages deliberately separate high-risk concerns instead of reproducing the broad `IAM-0 ... IAM-7` implementation-order headings. Runs (Section 8.3) group stages that share one risk surface, so the separation stays visible in review while one session delivers the group.

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

**Status:** COMPLETE  
**Parent specification area:** IAM-1  
**Depends on:** IAM-MP-00 COMPLETE (satisfied 2026-09-23)  
**Executable plan:** `docs/plans/iam/IAM_01_PERSISTENCE_FOUNDATION_PLAN.md` (implemented in `5056c9f`; audit record `3cc9cd4`)  
**Accepted:** 2026-09-23 — independent audit verdict `IAM-01 ACCEPTED` with no blocking findings (executable plan Section 40A; CI run 35811045334 green); baseline accepted by the owner

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

**Status:** COMPLETE  
**Parent specification area:** IAM-1, Sections 18–21, 34–35, 48–49  
**Depends on:** IAM-MP-01 COMPLETE (satisfied 2026-09-23)  
**Executable plan:** `docs/plans/iam/IAM_02_REFERENCE_DATA_AND_AUDIT_FOUNDATION_PLAN.md` (written from `21f536c`; implemented in `2b7e103`; audit record `a40f5a2`)  
**Accepted:** 2026-09-23 — independent audit verdict `IAM-02 ACCEPTED` with no blocking findings (executable plan Section 46A; CI run 35824072798 green); baseline accepted by the owner

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

### Carried forward from the IAM-MP-01 audit

Details and evidence: `IAM_01_PERSISTENCE_FOUNDATION_PLAN.md` Section 40A.

- **A1-01:** the private-entry restriction covers static imports only. Extend it to dynamic `import()` and `import('…')` type queries of `@vertex-os/iam/persistence` and `@vertex-os/database/persistence`, and add `lint:boundaries` cases, when this stage changes boundary configuration (for example for the Audit package).
- **A1-02:** a rethrown persistence error carries row data (including email) in `meta.driverAdapterError.cause.detail`, and the API error boundary logs unexpected errors unredacted. Whichever stage first composes an IAM (or Audit) persistence adapter into `apps/api` must keep that data out of logs and prove it with a test. Until then, each next executable plan carries this item forward.
- **A1-03 (owner, documentation):** replace the two-segment `projects.edit` examples in `docs/modules/iam.md` Sections 6.4, 16.1 and 16.3 and `docs/SECURITY.md` with three-segment codes; the audit upheld interpretation I-4.
- **A1-05, A1-07 (optional):** make the `updatedAt` advance assertion time-independent, and assert foreign-key referential actions and the lower module-length bound by name, when the adapter tests are next touched.
- Open items passed on by the IAM-01 plan (Section 34): API statement-timeout sizing when IAM persistence is first composed; primary-membership switch ordering (IAM-MP-08); A-02 and A-04 (IAM-MP-03/06).

The executable plan resolves these at plan level (its Section 5.1 and decisions D-01…D-17). The owner accepted it on 2026-09-23 and delegated its flagged decisions to the planning agent (plan Section 12.1):

- MOD-AUDIT gets its own core `domains/audit` and adapter `domains/audit-persistence`, with a `domain:audit` boundary that IAM may depend on and that never depends on IAM;
- per-domain database entries `@vertex-os/database/iam` and `/audit` replace `/persistence`, so neither adapter can reach the other's models through the typed client (R-06);
- IAM mutations and their Audit evidence share one transaction through an opaque database transaction handle, an IAM-specific transaction port and composition-root wiring (the first AR-022 case);
- reference synchronization runs only through the operator command `pnpm iam:sync-reference`, serialized by an advisory lock and fully audited;
- `iam_role_system_code_ck` makes the system role unforgeable in the database;
- A1-01 is closed by syntax selectors; A1-02 by logging only an allowlisted description of database errors; A1-03, A1-05 and A1-07 are applied;
- the API statement-timeout item stays open, because the stage composes persistence only into the operator command, not the HTTP runtime.

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

**Status:** COMPLETE (run `IAM-R01`, plan `IAM_R01_KEYCLOAK_ENVIRONMENT_PLAN.md`)  
**Parent specification area:** IAM-2, Sections 7, 37–39, 46.4  
**Depends on:** IAM-MP-02 COMPLETE (satisfied 2026-09-23)

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

### Carried forward from the IAM-MP-02 audit

Details and evidence: `IAM_02_REFERENCE_DATA_AND_AUDIT_FOUNDATION_PLAN.md` Section 46A.

- **A2-02 (boundary configuration):** a dynamic import whose template literal starts with an interpolation, such as ``import(`${'@vertex-os'}/database/iam`)``, and `createRequire(…)('@vertex-os/…/<subpath>')` pass lint. Add `ImportExpression > TemplateLiteral.source[expressions.length>0]` to `restrictedImportSyntax` (validated by the auditor). Optionally forbid `createRequire` in backend production source; `apps/web-e2e` uses it legitimately. Add `lint:boundaries` cases. Do this when this stage changes boundary configuration (A-04).
- **A2-03 (boundary configuration):** bracket-notation and destructured `$queryRawUnsafe`/`$executeRawUnsafe` pass the D-14 ban. Add `property.value` and destructuring selectors (validated by the auditor), or remove the unsafe methods from the production scoped types in favor of a test-only entry. Add `lint:boundaries` cases.
- **A2-01 (forward; must be closed before IAM or Audit persistence enters the HTTP runtime):** `PinoLoggerService` writes an `Error`'s raw `message` as the log `msg`, and a string stack argument as `stack`, outside the sanitized `err`. The auditor proved it with real P2007, validation and P1001 errors through Nest's `Logger`. It is not reachable while the HTTP runtime's only query is the readiness ping. Whichever stage first composes IAM or Audit persistence, or any query beyond `ping`, into the HTTP runtime must fix it and prove it with a test, together with the API statement-timeout item. Until then, each next run plan carries this item forward.
- The other open items passed on by the IAM-02 plan (Section 40) are attached to the stages that resolve them (IAM-MP-04 to IAM-MP-10, under "Carried forward"). The items that no IAM stage owns are listed in Section 15.

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

**Status:** COMPLETE (run `IAM-R02`, plan `IAM_R02_IDENTITY_RECONCILIATION_PLAN.md`)  
**Parent specification area:** IAM-2, Sections 11–13, 31, 50  
**Depends on:** IAM-MP-03 COMPLETE (satisfied by run `IAM-R01`)

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

### Carried forward from the IAM-MP-02 plan (open items of `IAM_02_REFERENCE_DATA_AND_AUDIT_FOUNDATION_PLAN.md` Section 40)

- **Keycloak Admin errors** can contain emails in their messages. Translate them to safe categories before logging (spec Section 36); the generic serializer path logs the messages of non-database errors.

### Carried forward from run IAM-R01 (`IAM_R01_KEYCLOAK_ENVIRONMENT_PLAN.md`)

- **A-04 (IAM-MP-00 audit):** if this stage installs a Keycloak Admin client package, prove that an IAM domain-core import of it is rejected.
- **Typed provisioner configuration (R01 D-11):** map the provisioner values into `AppConfig` through the existing loader, validating secrets without echoing them. The values are the realm issuer URL, the `vertex-provisioner` client ID and `KEYCLOAK_PROVISIONER_CLIENT_SECRET`.
- **Email delivery:** the realm has no SMTP configuration. Add it with credentials supplied as secrets (spec Section 37), and choose how local development and tests receive invitation email. A new local container is a new infrastructure service; get the owner's approval if one is needed.
- **Self-service credential recovery (R01 review S-01):** the realm ships with `resetPasswordAllowed: false`. Keycloak's built-in reset flow lets whoever holds the mailbox enrol a new TOTP and set a new password. Turn reset on again only with a reset-credentials flow that demands the existing OTP (users without one enrol during the flow), proven end to end with the mail sink. Likewise, no invitation or resend may become an email-only way to replace an enrolled user's factors.
- **Provisioner residual (R01 D-14):** `manage-users` can also reset passwords, grant `manage-users`, clear brute-force lockouts and read role mappings. The adapter uses only the operations spec Section 7.2 lists.
- **Harness:** reuse `apps/api/test-support/keycloak.ts`. If the Admin REST adapter lives in a library project, decide where the harness belongs, because a library cannot import from `apps/api`.

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

**Status:** COMPLETE (run `IAM-R03`, plan `IAM_R03_SESSIONS_AND_OIDC_PLAN.md`; session re-validation corrected by fix run `IAM-R03F`, plan `IAM_R03F_SESSION_REVALIDATION_PLAN.md`)  
**Parent specification area:** IAM-3, Sections 14, 32, 39  
**Depends on:** IAM-MP-04 COMPLETE (satisfied by run `IAM-R02`)

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

### Carried forward from the IAM-MP-02 plan (open items of `IAM_02_REFERENCE_DATA_AND_AUDIT_FOUNDATION_PLAN.md` Section 40)

- **A2-01 and API statement-timeout sizing** (see the IAM-MP-03 section): owned by whichever of IAM-MP-05, IAM-MP-06 or IAM-MP-07 first composes IAM or Audit persistence, or any query beyond `ping`, into the HTTP runtime.

### Carried forward from run IAM-R01

- **SSO limits:** the realm sets Keycloak SSO idle to 1800 s and maximum to 36000 s. SECURITY Section 11 forbids the identity-provider limits from exceeding the application-session limits. If this stage chooses a shorter application idle or absolute lifetime, lower the realm values in the same run.

### Carried forward from run IAM-R02 (`IAM_R02_IDENTITY_RECONCILIATION_PLAN.md`)

- **Recovery and Vertex sessions:** self-service reset now works (emailed link, enrolled OTP, new password) and ends in a Keycloak session. Spec Section 32 and SECURITY Section 10 ask that high-risk recovery revoke Vertex sessions when Vertex receives or initiates the signal. Decide with IAM-MP-06 which signal Vertex can observe (for example back-channel logout, or none in V1) and record it.

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

**Status:** COMPLETE (run `IAM-R03`, plan `IAM_R03_SESSIONS_AND_OIDC_PLAN.md`; Keycloak-side logout and recovery reach Vertex for the whole session lifetime since fix run `IAM-R03F`)  
**Parent specification area:** IAM-3, Sections 13–15, 32–33  
**Depends on:** IAM-MP-05 COMPLETE (satisfied by run `IAM-R03`)

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

### Carried forward

- **Security events** (sign-in denials and similar; IAM-02 plan Section 40): Audit records with `REFUSED`/`FAILED`, structured security logs, or both (IAM-MP-05/06, spec Section 34).
- **A-04 (OIDC runtime; IAM-MP-00 audit):** add the chosen OIDC runtime library to the domain-core ban list and prove an IAM import of it is rejected.
- **Request-URL logging** (found by the 2026-09-23 repository documentation audit): the API logger replaces only the `err` serializer, so Fastify's default `req` serializer logs the full URL including the query string. The OIDC callback (`?code=…&state=…`) must not log authorization codes or state (spec Section 36); prove it with a test.
- **From run IAM-R01:**
  - **Typed OIDC configuration (R01 D-11).** Map into `AppConfig` the issuer, the `vertex-web` client ID and secret, and the redirect and post-logout URIs (`KEYCLOAK_*` in `.env.example`).
  - **Audience binding.** Validate `aud`/`azp` against `vertex-web`: other realm clients (the account console) issue tokens for the same users.
  - **Back-channel logout reachability.** Keycloak calls `KEYCLOAK_WEB_BACKCHANNEL_LOGOUT_URL` from inside its container (`host.docker.internal`), while the API listens on 127.0.0.1. Prove that the call arrives locally and in the Testcontainers harness on Linux CI, or change the value.
  - **Cookie scoping.** Keycloak (127.0.0.1:8080) and the web origin (127.0.0.1:4200) share a host, and cookies are not port-scoped. Scope the application-session and login-attempt cookies so they are not sent to Keycloak and cannot collide with Keycloak's cookies.
  - **MFA in browser tests.** The realm's browser flow requires TOTP, so the end-to-end journey needs a deterministic TOTP credential in the ephemeral test realm (for example through the Admin partial-import API). Production gets no bypass. Run IAM-R02 added reusable pieces: `apps/api/test-support/keycloak-browser.ts` (form navigation and an RFC 6238 TOTP generator) and a Mailpit sink in the Keycloak harness, with which a test enrols a TOTP through the real invitation flow.
- **From run IAM-R02:** the identity provisioning composition (`apps/api/src/iam/identity-provisioning.ts`) is not mounted in the HTTP runtime. First activation (spec Section 13) must not treat `identitySyncState` or `invitationDeliveryState` as access conditions; only `accessState` decides.

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

**Status:** COMPLETE (run `IAM-R04`, plan `IAM_R04_AUTHORIZATION_CONTEXT_PLAN.md`)  
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

### Carried forward from the IAM-MP-02 plan (open items of `IAM_02_REFERENCE_DATA_AND_AUDIT_FOUNDATION_PLAN.md` Section 40)

- **Whether `DEPRECATED` permissions are effective** for custom roles (decided together with IAM-MP-09's mapping rules).

### Carried forward from run IAM-R03 (`IAM_R03_SESSIONS_AND_OIDC_PLAN.md`)

- **Build on the session boundary, do not duplicate it.** `requireSession` (`apps/api/src/auth/request-session.ts`) resolves the cookie, the live session and the ACTIVE user on every request (request-local memoization only) and revokes a session whose user is no longer ACTIVE. The global `CsrfGuard` already rejects every unsafe request without a valid session (`401`) or CSRF token (`403`), with `@CsrfExempt()` only on back-channel logout. This stage adds the protected-by-default rule for safe methods, the explicit public-route marker (health, login, callback, back-channel logout) and the authorization context on top.
- **Bound capabilities only.** The authentication area reaches IAM through `apps/api/src/iam/sign-in.ts` (bound functions); lint keeps adapters in `apps/api/src/auth/auth-runtime.ts`. The authorization-context composition follows the same pattern.

### Carried forward from the `IAM-CP1` audit (`audits/IAM-CP1.md`)

- **CP1-03 (Major):** adapter imports in `apps/api/src/auth` are confined to `auth-runtime.ts` by `no-restricted-imports` only; a dynamic import or a type query of `@vertex-os/iam-persistence` or `@vertex-os/audit-persistence` passes lint. Close both forms and prove them with `lintText` probes.
- **CP1-04:** lint residuals: template-literal dynamic imports, `import x = require(…)`, CommonJS `require()` of private entries, and `process.env` destructured by assignment or through a parameter default pass the bans (R02 AB-4).
- **CP1-05:** the IAM root exports `SignInDependencies`, `IdentityProvisioningDependencies` (repository and transaction-runner types) and the whole `ApplicationUser`; spec Section 44 forbids exposing repositories and mutable internal entities. Reconcile the specification or the surface.

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

**Status:** COMPLETE (run `IAM-R05`, plan `IAM_R05_PRIVILEGE_ADMINISTRATION_PLAN.md`)  
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

### Carried forward from the IAM-MP-02 plan (open items of `IAM_02_REFERENCE_DATA_AND_AUDIT_FOUNDATION_PLAN.md` Section 40)

- **Primary-membership switch ordering** (IAM-01 plan Section 34).

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

**Status:** COMPLETE (run `IAM-R05`, plan `IAM_R05_PRIVILEGE_ADMINISTRATION_PLAN.md`)  
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

### Carried forward from the IAM-MP-02 plan (open items of `IAM_02_REFERENCE_DATA_AND_AUDIT_FOUNDATION_PLAN.md` Section 40)

- **`DEPRECATED`/`RETIRED` mappings:** whether custom roles may keep or receive mappings to `DEPRECATED` or `RETIRED` codes. Such mappings are never effective (IAM-R04 D-06), so the question is administrative clarity, not access.

### Carried forward from run IAM-R04 (`IAM_R04_AUTHORIZATION_CONTEXT_PLAN.md`)

- **Use the authorization boundary, do not duplicate it.** Protected routes need no annotation; a permission requirement is `@RequirePermission(code)` (one code per handler, enforced at load), and a handler that needs the actor injects `CURRENT_ACTOR` (`CurrentActor.require`). Resource and state rules stay in the IAM application services. Every new permission code needs a test proving that a user without it is denied (spec Section 18).
- **Composition entry.** New use cases that take ports go into `@vertex-os/iam/composition` and are bound in `apps/api/src/iam`; the public root stays free of repositories, dependency types and `ApplicationUser` (IAM-R04 D-12).
- **Custom-role version semantics** for mapping replacement, aligned with interpretation I-6 or explicitly different.
- **System-role mappings stay unwritable** by administrative operations.

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

**Status:** COMPLETE (run `IAM-R06`)  
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

### Carried forward from the IAM-MP-02 plan (open items of `IAM_02_REFERENCE_DATA_AND_AUDIT_FOUNDATION_PLAN.md` Section 40)

- **Bootstrap refuses** when reference data is not synchronized.

### Carried forward from run IAM-R02 (`IAM_R02_IDENTITY_RECONCILIATION_PLAN.md`)

- **Use the capabilities, do not re-implement them:** user creation, sync-identity, resend and bootstrap call `provisionIdentity`, `reconcileIdentity` and `resendInvitation` through `createIdentityProvisioning`, with the acting administrator's `AuditAttribution`. Every local change that alters the identity requirement sets `identitySyncState = PENDING` in its own transaction (spec Section 11.1).
- **Reactivation variant:** spec Section 31.2 lets reactivation substitute its target state before the final commit. `reconcileIdentity` reconciles against the committed state only; this stage extends it (target override, compensation on a failed final commit).
- **Recovery action and invitation links (R02 review S-06, S-07):** invitation links carry `VERIFY_EMAIL` only and are reusable until they expire; any factor action pending on the identity runs through them. An administrative recovery action (spec Section 54) that re-adds `UPDATE_PASSWORD` or `CONFIGURE_TOTP` to an enrolled identity must not be runnable through an unexpired invitation link (for example, refuse it while a link may still be valid).
- **Concurrent bind (R02 review DC-2):** two concurrent binds of one identity to two users surface as a thrown unique violation instead of `identity-taken`. This is unreachable because of ownership proof. If the use cases change that, map it, and make the store test check the loser.
- **Refusal evidence:** the capabilities return `not-invited`, `sync-incomplete`, `no-action-required` and `superseded` without Audit records. Decide which administrative refusals are audited (spec Section 34) and how `superseded` (competing changes kept winning) is reported.

### Carried forward from run IAM-R03 (`IAM_R03_SESSIONS_AND_OIDC_PLAN.md`)

- **Session revocation capability.** Suspension, disablement, termination and the administrator revoke-sessions action call `SessionService.revokeUserSessions` (one Audit record per revoked session, same transaction) after the access change commits; add their reasons to `auth_session_revocation_reason` in a migration. Every session use already re-checks `accessState`, so a restriction takes effect on the next request even before revocation runs.

### Carried forward from the `IAM-CP1` audit (`audits/IAM-CP1.md`)

- **CP1-06:** the database does not keep session revocation monotonic (a revoked row can be un-revoked, `revoked_at` rewritten), and structural checks are missing (idle deadline before creation, zero-length session, `revoked_at` before `created_at`, empty ciphertext, state, nonce or verifier).
- **CP1-07:** no test names the auth constraints; behavioural cases use a bare `.rejects.toThrow()`; the CSRF-hash, IdP-session, handle-hash, attempt-expiry checks and the key-version branch are never exercised.
- **CP1-13:** R02 Done means 3 (conflicting identities byte-for-byte unchanged) is asserted against real Keycloak only for the foreign-owner case.
- **CP1-26:** the evidence checks of `apps/api/src/iam/identity-provisioning.integration.spec.ts` depend on earlier tests (`total > 10`); make them order-independent and run them after cleanup (remainder of CP1-12).

### Carried forward from run IAM-R05 (`IAM_R05_PRIVILEGE_ADMINISTRATION_PLAN.md`)

- **System Administrator lock.** Suspension, disablement and termination of an ACTIVE user, and bootstrap, lock the `system-administrator` role row `FOR UPDATE` before the user row (R05 D-05, D-06), then count ACTIVE holders under it; the rule is `decideRoleRemoval`'s. Look the row up by the reserved code.
- **User creation with memberships and roles** must apply the R05 rules (ACTIVE department locked `FOR SHARE`, ACTIVE role, System Administrator lock when the role is assigned) instead of `createApplicationUserRepository.create` inserting them unchecked.
- **Lock order across both stores** (review AB-5): an operation that uses `OrganizationStore` and `RoleStore` together keeps role → user → department/permission.
- **Grant ceiling (owner decision 2026-09-24, spec Section 23.1).** Enforce it in the R05 use cases `assignRole`, `activateRole` and `replaceRolePermissions` (added codes), and in user creation with initial roles: a USER actor who is not an ACTIVE System Administrator cannot grant a permission they do not hold effectively, nor assign the system role. Evaluate the actor's committed permissions inside the same transaction, after the D-05 locks (read the actor's user row without locking it, so no lock-order cycle forms); refuse with outcome `grant-exceeds-actor` and a REFUSED Audit record. Removals and deactivation stay unlimited; SYSTEM actors are exempt. Tests: self-escalation to the system role, mapping a privileged code into one's own role, activating an inactive privileged role, and a System Administrator unaffected. It lands in IAM-R06 so that a deep audit covers it with the rest of the administration core (`IAM-CP2`, deferred into `IAM-FINAL`).

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

**Status:** COMPLETE (run `IAM-R07`, plan `IAM_R07_HTTP_ADMINISTRATION_PLAN.md`)  
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

### Carried forward from run IAM-R02 (`IAM_R02_IDENTITY_RECONCILIATION_PLAN.md`)

- **Outcome mapping:** map the provisioning outcomes to spec Section 27 once: `identity-conflict` → `IAM_IDENTITY_CONFLICT`, `provider-unavailable`/`provider-rejected` → `IDENTITY_PROVIDER_UNAVAILABLE`, `sync-incomplete` → `IAM_IDENTITY_SYNC_INCOMPLETE`, `not-invited` → `IAM_INVITATION_NOT_APPLICABLE`, `not-found` → `IAM_USER_NOT_FOUND`. Decide the response for `no-action-required` (resend to a user whose invitation is complete) and `superseded`.

### Carried forward from the `IAM-CP1` audit (`audits/IAM-CP1.md`)

- **CP1-18:** `POST /api/auth/backchannel-logout` declares form consumption but has no `requestBody` schema (`logout_token`) and no 400 body in the generated OpenAPI.

### Carried forward from run IAM-R04 (`IAM_R04_AUTHORIZATION_CONTEXT_PLAN.md`)

- **`GET /api/iam/me`** (spec Section 25.2) is this stage's: build it on `CurrentActor` (`CURRENT_ACTOR`), which already yields the current actor's authorization context (R04 D-10). Department names and profile fields for the UI are this stage's contract decision.

### Carried forward from run IAM-R05 (`IAM_R05_PRIVILEGE_ADMINISTRATION_PLAN.md`)

- **Grant ceiling (review S-1): decided by the owner on 2026-09-24** — option 1, spec Section 23.1. IAM-R06 implements it in the use cases (see IAM-MP-10); this stage maps `grant-exceeds-actor` to `403 IAM_GRANT_EXCEEDS_ACTOR` and passes the current actor as the Audit attribution.
- **Routes over the bound capability** `createIamAdministration` (`apps/api/src/iam/administration.ts`), each with `@RequirePermission` and an Audit attribution from `CurrentActor`; the outcome → error-code mapping of R05 Section 5.6, naming once the codes the specification lacks (`version-conflict`, `code-taken`, `membership-not-found`, `assignment-not-found`, `unknown-permission`, `permission-not-assignable`, `invalid`).
- **Root types for DTOs** (review AB-3): `DepartmentCode`, `RoleCode`, `EntityName`, `Description`, `DepartmentState`, `RoleState` are not on the root yet.
- **Lock-wait timeouts** (review DC-2) surface as unclassified errors; map them to a stable error. Validate every request field before the use cases (review S-6).

### Carried forward from run IAM-R06 (`IAM_R06_USER_LIFECYCLE_PLAN.md`)

- **Routes over** `createIamUserAdministration` (`apps/api/src/iam/user-administration.ts`) with the outcome → error-code mapping of R06 Section 5.8, naming once the codes the specification lacks (`version-conflict`, `superseded`, `invalid`). `UserView` is the user DTO; it omits the identity mapping.
- **Actor (review SEC-1).** The grant ceiling exempts every `SYSTEM` actor. Administration routes must pass the session's USER actor as the attribution, never `systemAttribution`; prove it with a test.
- **Session revocation binding (review AB-1).** In the HTTP runtime bind `revokeUserSessions` to `AuthRuntime.sessions`, not to the session store.
- **Grant ceiling for reactivation (review SEC-2): decided by the owner on 2026-09-24** — option 1, spec Section 23.1. Before `POST /api/iam/users/{userId}/reactivate` is mounted, `reactivateUser` refuses with `grant-exceeds-actor` (`403 IAM_GRANT_EXCEEDS_ACTOR`, REFUSED Audit record, nothing written) when a USER actor who is not an ACTIVE System Administrator reactivates a holder of the system role, or a user whose ACTIVE roles map an ACTIVE permission the actor does not hold effectively. Evaluate it in the PENDING transaction of step 2 (spec Section 31.2), under the target's user-row lock, so no Keycloak call precedes a refusal. Tests: a non-administrator reactivating a suspended System Administrator, a holder of a role the actor lacks, a user within the actor's permissions, and a System Administrator unaffected.

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

**Status:** COMPLETE (run `IAM-R08`)  
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

### Carried forward from run IAM-R03 (`IAM_R03_SESSIONS_AND_OIDC_PLAN.md`)

- **Contracts to consume:** `/api/auth/login` (top-level navigation); the callback returns to `/` or `/?authError=` with `AUTH_ACCESS_DENIED`, `AUTH_LOGIN_FAILED` or `IDENTITY_PROVIDER_UNAVAILABLE`; `GET /api/auth/session`; `GET /api/auth/csrf` (hold the token in memory, send `X-CSRF-Token` on every unsafe request); `POST /api/auth/logout` returns `logoutUrl`, which the browser opens.
- **Real-browser cookie behavior** and **session rotation across sites (R03 review S-02):** moved to IAM-MP-15 by run `IAM-R08` (plan D-03); both need the real-Keycloak browser harness that stage builds.

### Carried forward from the `IAM-CP1` audit (`audits/IAM-CP1.md`)

- **CP1-17:** moved to IAM-MP-15 by run `IAM-R08` (plan D-03).

### Carried forward from run IAM-R07 (`IAM_R07_HTTP_ADMINISTRATION_PLAN.md`)

- **Contracts to consume (IAM-MP-12 to IAM-MP-14):** `GET /api/iam/me` for the profile, ACTIVE departments and effective permission codes (navigation is UX only); the named `Iam*` OpenAPI components for client typing; the problem codes of R07 D-05, `fields` on `400 VALIDATION_FAILED`, `503 SERVICE_BUSY` with `Retry-After`, and `409 IAM_VERSION_CONFLICT` / `IAM_OPERATION_SUPERSEDED` for stale writes; the page contract `page`, `pageSize` (at most 100), `search` (`docs/ENGINEERING.md` Section 11).

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

**Status:** COMPLETE (run `IAM-R08B`)  
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

### Carried forward from run IAM-R07 (`IAM_R07_HTTP_ADMINISTRATION_PLAN.md`)

- **Reason for removing a role (review SA-4):** `DELETE /api/iam/users/{userId}/roles/{roleId}` takes no body and no reason (R07 D-08), also when it removes the System Administrator role, which spec Sections 52–53 list as a high-risk change for which the API SHOULD accept a reason. If the confirmation UI asks for one, the run adds a way to carry it (for example an optional body or a `reason` query parameter kept out of logs) or records why not.

### Carried forward from run IAM-R08 (`IAM_R08_FRONTEND_SESSION_PLAN.md`)

- **Foundation to build on:** `apiRequest` (in-memory CSRF, `ApiProblem` with `code`, `fields`, `retryAfterSeconds`; `NetworkFailure`), the query client's refusal handling, and `meta.permission` on every protected query so permission loss removes its data (plan D-07, D-10). Protected views live under the `_app` layout, which remounts them when the user or the permission set changes.
- **Navigation wiring (review T-11):** the first administration item is the first to carry `anyOf`; test that the shell shows or hides it by the user's permission codes.
- **Every protected query declares `meta.permission` (review S-11):** a query without it keeps its rows after permission loss until its own `403`; a typed query helper can make the declaration mandatory.
- **Remount on permission change (IAM-R08 re-check):** the session gate remounts protected views whenever the user or the permission set changes, so a permission added to an administrator resets an open form. Keep it, or narrow the key, once forms exist.
- **CSRF refusal message (review S-5):** after a sign-in in another tab replaces the same user's session, the next unsafe request fails once with `403 CSRF_VALIDATION_FAILED` (the stale token is dropped). Mutation errors should present it as "try again", not as a connectivity problem.

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

**Status:** COMPLETE (run `IAM-R08C`)  
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

### Carried forward from run IAM-R08B (`IAM_R08B_USER_ADMINISTRATION_PLAN.md`)

- **Foundation to build on:** `protectedQuery` (`apps/web/src/lib/protected-query.ts`) for every protected read, `describeMutationFailure` for refusals, `ReasonField`, the status mapping in `features/iam/iam-states.tsx`, and `useAccess` for presentation-only visibility. Department and role reads already exist as ACTIVE pickers (`iam-queries.ts`).
- **Directory filters by department and role (R08B D-03):** the API supports `departmentId` and `roleId` on `GET /api/iam/users`; the directory offers search and access state only. Add them when the department and role lists exist, or record why not.
- **Route search validation (R08B discovery):** TanStack Router can expose raw address parameters next to a route's validated search; a page must apply its own validation to what it reads (see `routes/_app/users/index.tsx`).

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

**Status:** COMPLETE (part 1 run `IAM-R09`, part 2 run `IAM-R09B`)  
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

### Carried forward from run IAM-R03 (`IAM_R03_SESSIONS_AND_OIDC_PLAN.md`)

- **Rate limiting** of the session-establishment and logout endpoints (SECURITY Section 37); every `GET /api/auth/login` stores a login attempt (R03 review S-05).
- **Retention:** expired and revoked `auth_session` rows are kept; decide their retention and purge. ID tokens of expired sessions are discarded when the session is next seen and by a bounded sweep on each sign-in; a scheduled purge would remove the dependency on sign-in activity.
- **Back-channel logout before session creation (R03 review D-3):** a logout token for a Keycloak session that arrives between the code exchange and the session insert revokes nothing, and the new session lives until its deadline. Consider remembering recently logged-out `sid` values briefly, or re-checking the Keycloak session.

### Carried forward from the `IAM-CP1` audit (`audits/IAM-CP1.md`)

- **CP1-08:** the sign-in sweep scans the whole `auth_session` table (no covering index, rows never purged) and swallows a statement timeout without a log line.
- **CP1-09:** the older race tests use `Promise.all` without a barrier or held lock; their assertions also hold sequentially.
- **CP1-11:** no automated test covers the upgrade, append and refusal branches of `pnpm env:setup`.
- **CP1-14:** a rejected or no-op back-channel logout leaves only a log line; spec Sections 33–34 ask for a security event (needs the rate limiting of this stage).
- **CP1-15:** the realm enables the `delete_credential` required action, so a user can delete their OTP and re-enrol with the password alone.
- **CP1-22:** the sweep tests expiry only inside its `id IN (SELECT … LIMIT 200)` subquery; a sweep meeting an in-flight `applyRevalidation` clears the tokens of a row that was just made live. Repeat the expiry predicate in the outer `WHERE` and prove it with a forced interleaving.
- **CP1-23, CP1-24:** the auth-flow log scan does not collect back-channel logout tokens (and has no JWT pattern); two login attempts in `keycloak-login.integration.spec.ts` (lines 183 and 234) are not collected.
- **CP1-25:** no test shows that refresh or ID token material never reaches `audit_record.change` or `reason`.
- **CP1-27:** SECURITY Section 11 says identity-provider tokens MUST be discarded when the session ends; tokens of an expired session are discarded when the row is next seen or swept. Reconcile the canonical text or the code (with CP1-08).

### Carried forward from run IAM-R04 (`IAM_R04_AUTHORIZATION_CONTEXT_PLAN.md`)

- **Denial evidence volume (R04 D-15; review DC-03, S-4):** every permission denial of an authenticated user appends one `iam.authorization.denied` Audit record in its own transaction, without a limit. Bound it together with the rate-limiting item above.

### Carried forward from run IAM-R06 (`IAM_R06_USER_LIFECYCLE_PLAN.md`)

- **SEC-5:** the grant ceiling counts only ACTIVE mappings; a DEPRECATED permission that reference synchronization makes ACTIVE again widens roles assigned under the ceiling (needs a code release).
- **SEC-6:** if session revocation throws after a committed restriction, reconciliation is skipped and the user stays `PENDING` (access stays denied); decide whether the use case should still reconcile.
- **DC-4:** `readActorAuthority` reads the actor's facts and System Administrator holding in two statements; one statement would give one snapshot.

### Carried forward from run IAM-R07 (`IAM_R07_HTTP_ADMINISTRATION_PLAN.md`)

- **SA-2:** a body that is not valid JSON (with `content-type: application/json`) is refused by Fastify's parser before the session check, as `400 BAD_REQUEST` instead of `VALIDATION_FAILED`; map the parser's errors to the stable code (no value is echoed).
- **T-8:** `isDatabaseContention` is proven for SQLSTATE 57014 and Prisma P2028 only; 55P03, 40P01, 40001 and P2034 are classified but untested.
- **Trace IDs:** a well-formed client `X-Request-Id` becomes the Audit `trace_id` (pre-existing); a client can make its records share a trace ID with others. `actor_user_id` is unaffected.
- **No-store on refusals:** guard refusals (401, 403) of IAM routes do not carry `Cache-Control: no-store`; their Problem Details hold no personal data.

### Carried forward from run IAM-R08B (`IAM_R08B_USER_ADMINISTRATION_PLAN.md`, D-15)

- **Signed-in user administration through the real API:** the R08B browser journey answers `/api` in the page. Prove create/invite, a lifecycle action with its confirmation and a role change end to end with Keycloak, PostgreSQL and the API.

### Carried forward from run IAM-R08C (`IAM_R08C_PRIVILEGE_ADMINISTRATION_PLAN.md`, D-14)

- **Signed-in privilege administration through the real API:** the R08C browser journey answers `/api` in the page. Prove a department deactivation, a custom role's permission edit through the review step, and its effect on a holder's next request (the privilege-change verification above), end to end with Keycloak, PostgreSQL and the API.
- **Catalog beyond one page (R08C D-08):** the permission editor and the role detail read the catalog as one bounded page of 100 and say so when `total` exceeds it. Revisit if the registered catalog approaches 100 codes.

### Carried forward from run IAM-R08 (`IAM_R08_FRONTEND_SESSION_PLAN.md`, D-03)

- **Real-browser cookie behavior (from IAM-R03):** prove that Chromium, Firefox and WebKit accept the `__Host-` cookies on `http://127.0.0.1` locally (only a fetch-based browser was used so far).
- **Session rotation across sites (IAM-R03 review S-02):** the rotation of an existing session at the callback reads the `SameSite=Strict` session cookie on a navigation from Keycloak. It works while Keycloak and the web app share a site (locally, and a production subdomain of the same registrable domain); verify it for the deployed topology, or rotate differently.
- **CP1-17:** back-channel logout through the local Compose Keycloak and a running API (a real login, then a Keycloak-side logout) was never probed end to end; only the Linux CI path is proven.

### Resolved by run IAM-R09 (`IAM_R09_SECURITY_HARDENING_PLAN.md`)

Rate limiting and the denial evidence bound (R03, R04 D-15), retention and scheduled housekeeping (R03, CP1-08, CP1-22, CP1-27), back-channel logout before session creation (R03 D-3), CP1-09, CP1-11, CP1-14, CP1-15, CP1-23 to CP1-25, SEC-5 (no code change, D-12), SEC-6, DC-4, SA-2, T-8, trace IDs (no code change; production item in Section 15, D-14) and no-store on refusals. The required concurrency races and the CSRF and security-negative coverage are mapped to discriminating tests (plan Section 8).

### Carried forward to run IAM-R09B

- Every item above under "Carried forward from run IAM-R08B", "from run IAM-R08C" and "from run IAM-R08" (browser journeys through the real API, the catalog bound revisit, three-engine `__Host-` cookies, rotation across sites, CP1-17).
- The remaining major deliverables: the real-Keycloak browser journeys (invitation and first activation; login, logout, expiry and revocation; privilege-change effect; suspended-user access loss; last System Administrator; bootstrap and recovery), the Keycloak policy and configuration verification map, the dependency audit, documentation synchronization, the temporary-code sweep, the Definition of Done map (spec Section 56) and full repository verification.
- **Login-attempt volume beyond housekeeping (R09 review S-3):** each admitted login still stores an attempt, and housekeeping deletes at most 2,000 expired attempts per minute. Clients spread over many addresses under the sign-in limit can grow `auth_login_attempt` for as long as they keep it up. Decide whether a process-wide sign-in ceiling is needed, or record the residual for the production deployment design.
- **Housekeeping wiring (R09 review T-4):** no test shows that the server entry schedules housekeeping through `AuthModule`; the scheduler class itself is tested. Cover it with the closeout verification.
- **Reactivated permissions (R09 D-12, SEC-5):** whoever reactivates a DEPRECATED permission reviews the roles that map it; for `IAM-FINAL`.

### Resolved by run IAM-R09B (`IAM_R09B_BROWSER_JOURNEYS_PLAN.md`)

A second Playwright configuration (`e2e-iam`, part of `pnpm test:e2e`) runs the spec Section 46.7 journeys against PostgreSQL, Mailpit, the pinned Keycloak, the built API server entry and the production web build (D-02 to D-05). Resolved: administration and privilege administration through the real API (R08B D-15, R08C D-14: J-03 to J-06, J-08), the privilege-change effect without stale privilege (J-04, J-05), suspended-user access loss (J-06), revocation and expiry (J-07), last System Administrator and a key denial (J-13), bootstrap through the operator command and its refusals (D-05, D-15), the `__Host-` cookies and rotation in Chromium and Firefox (J-10), WebKit failing closed over plain HTTP (J-11, D-06), rotation across sites (D-07, production item in Section 15), CP1-17 (J-09 through Docker Desktop's `host.docker.internal` locally, D-08), the login-attempt volume (D-09, production item), the housekeeping wiring (J-12, D-10), the catalog bound (D-11, open item in Section 15), the Definition of Done and Keycloak policy map (`IAM_DEFINITION_OF_DONE_MAP.md`, D-16), the dependency audit, the temporary-code sweep and documentation synchronization (D-17 to D-19). The reactivated-permissions residual passes to `IAM-FINAL` (Section 17).

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

Every run selects the smallest meaningful subset during implementation, runs the gate required by `docs/PLANNING.md` Section 6.4 before review, and relies on CI for `pnpm verify:full` and `pnpm deps:audit` on its pull request.

A check MUST NOT be reported as passed unless it actually ran successfully.

---

## 12. Review and Audit Contract

Every run is reviewed; the checkpoints are audited in depth (`docs/PLANNING.md` Sections 8 and 9).

```text
run implemented and verified
        ↓
in-run review by fresh-context reviewers (concerns: Section 8.3)
        ↓
blocking findings fixed and re-verified in the run
        ↓
pull request + green CI  →  owner merges  =  stage COMPLETE
        ↓
at IAM-CP1 / final: deep audit in a separate session
        ↓
ACCEPTED → next run READY        FIXES REQUIRED → fix run → re-check
```

Reviews and audits evaluate the change against:

- the run plan;
- `docs/modules/iam.md`;
- architecture and module ownership;
- the locked invariants of Section 7;
- testing policy;
- the actual diff and code;
- actual verification evidence (local runs, CI).

The implementing run's report is a claim, not evidence of acceptance. No run is planned from an unmerged baseline, and no run after a checkpoint starts before that checkpoint is accepted.

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

This decomposition keeps each high-risk concern separately reviewable. Section 8.3 groups the stages into runs, each delivered by one session and reviewed as one pull request.

The broad IAM-0 specification also mentions typed auth/IAM configuration and a local Keycloak baseline. The approved IAM-MP-00 executable plan limits that first stage to package and static boundaries; the configuration shapes and Keycloak files are delivered by the later stages that consume them. This is sequencing within the accepted IAM architecture, not a change of ownership or topology.

---

## 14. Master Risk Register

Risk IDs were `IAM-R01`…`IAM-R17` until run IDs took the `IAM-Rnn` form (Section 8.3); the historical IAM-01 and IAM-02 plans cite risks by those earlier IDs (for example `IAM-R02` is `IAM-RISK-02`).

| ID | Risk | Why it matters | Master-level mitigation |
|---|---|---|---|
| IAM-RISK-01 | IAM specification status remains `Proposed` | execution could begin without canonical acceptance | closed — Section 3 gate closed; specification status is `Accepted` |
| IAM-RISK-02 | First business migration establishes poor precedent | later domains may copy weak constraints/patterns | isolate MP-01 and audit migration/invariants deeply |
| IAM-RISK-03 | IAM creates its own generic audit table | violates MOD-AUDIT ownership and causes later migration debt | build only minimal MOD-AUDIT append boundary in MP-02 |
| IAM-RISK-04 | Keycloak manual configuration drifts | security behavior becomes non-reproducible | configuration-as-code + real integration verification |
| IAM-RISK-05 | Ambiguous Keycloak failures duplicate/re-link identities | identity takeover or duplicate account risk | one idempotent reconciliation path with ownership proof |
| IAM-RISK-06 | Remote I/O inside DB transactions | long locks and inconsistent distributed outcomes | explicit fail-closed ordering; no remote call in transaction |
| IAM-RISK-07 | Session/token leakage | critical credential compromise | opaque sessions, server-side tokens, log/response negative tests |
| IAM-RISK-08 | Default-public API transition misses a route | silent authorization bypass | protected-by-default stage with explicit public route mechanism |
| IAM-RISK-09 | Last-admin race across two users | total administrative lockout | serialized invariant + competing-operation integration tests |
| IAM-RISK-10 | Privilege changes remain stale | removed permissions continue to work | no cross-request auth cache; current context per protected request |
| IAM-RISK-11 | Frontend becomes authorization authority | bypass through alternate clients/routes | backend enforcement tests for every meaningful operation |
| IAM-RISK-12 | Bootstrap becomes a backdoor/default account | persistent privileged access risk | operator-run command only; no defaults; serialized, audited |
| IAM-RISK-13 | IAM frontend invents a second component system | UI fragmentation and accessibility regression | consume `@vertex-os/ui`; add only justified reusable primitives |
| IAM-RISK-14 | E2E absorbs all verification | slow/flaky suite hides lower-level defects | risk-based test layering; focused E2E only |
| IAM-RISK-15 | Scope expands into HR/multi-tenancy/client identities | delays first business module and weakens architecture | enforce explicit non-goals and PLANNING scope discipline |
| IAM-RISK-16 | Main-branch governance relies only on convention | security-sensitive changes may bypass intended review discipline | every run lands through a reviewed pull request with green CI; deep audits at IAM-CP1 and the Final IAM Module Audit (which also covers the deferred IAM-CP2 scope); repository protection policy may be hardened separately from IAM scope |
| IAM-RISK-17 | Lighter per-run review misses a defect a full audit would catch | a security defect reaches `main` between checkpoints | three fresh-context reviewers on every Tier A run; checkpoints placed directly after the authentication and privilege clusters; later runs cannot start before the checkpoint is accepted |

---

## 15. Stage Status Ledger

The provider-specific carry-forward entries below are delivery history from R01–R09B. ADR-0001
and IAM Section 61 supersede them; current open launch gates are in
`IAM_DEFINITION_OF_DONE_MAP.md` Section 5.

This Master Plan is `ACTIVE`. IAM-MP-00 to IAM-MP-02 are `COMPLETE` under the previous method: each was independently audited (`IAM-00`, `IAM-01`, `IAM-02 ACCEPTED`, no blocking findings) and accepted by the owner on 2026-09-23.

Run `IAM-R01` delivered IAM-MP-03 (plan `IAM_R01_KEYCLOAK_ENVIRONMENT_PLAN.md`). It is `COMPLETE` once its pull request is merged. It closed A-02, A2-02 and A2-03. A-04 was not triggered, because no Keycloak package was installed, and passes to IAM-MP-04 and IAM-MP-06. A2-01 passes on under the condition stated in the IAM-MP-03 section.

Run `IAM-R02` delivered IAM-MP-04 (plan `IAM_R02_IDENTITY_RECONCILIATION_PLAN.md`). It is `COMPLETE` once its pull request is merged. It closed the Keycloak Admin error item, typed provisioner configuration (R01 D-11; a separate `loadIdentityProvisioningConfig` beside `AppConfig`, so the HTTP runtime needs no Keycloak value before a stage consumes it there, R02 D-13), email delivery (Mailpit, owner decision OD-1), self-service recovery (R01 S-01), the provisioner residual (R01 D-14, operation set pinned by a test) and the harness location (R01 AB-5). A-04 was again not triggered (no Keycloak package; the adapter uses `fetch`) and stays with IAM-MP-06. A2-01 passes on unchanged. Its new carried-forward items are attached to IAM-MP-05, IAM-MP-06, IAM-MP-10 and IAM-MP-11.

Run `IAM-R03` delivered IAM-MP-05 and IAM-MP-06 (plan `IAM_R03_SESSIONS_AND_OIDC_PLAN.md`). It is `COMPLETE` once its pull request is merged. It closed A2-01 and the API statement-timeout item (R03 D-20, D-21), A-04 (OIDC libraries banned in the domain core and in web code, subpaths included), the request-URL logging item, typed OIDC configuration, audience binding, back-channel reachability (Testcontainers host exposure on Linux CI; locally only a container-to-loopback probe on Docker Desktop, the end-to-end Compose probe was not run, `IAM-CP1` CP1-17), MFA in browser tests (TOTP through the real invitation flow), security events (Audit records), the SSO limits (application defaults equal the realm's) and the recovery signal (Keycloak's back-channel logout, R03 D-15; `IAM-CP1` CP1-01 found that it reached Vertex only while the Keycloak SSO session lived, about 30 minutes after sign-in; fix run `IAM-R03F` keeps the Keycloak session alive while the Vertex session is used, R03F D-09). Cookie scoping was decided by R03 D-06: spec Section 14 fixes `Path=/` and the host prefix, so the cookies also reach a Keycloak on the same host locally; production must give Keycloak its own host (listed below). Its new carried-forward items are attached to IAM-MP-07, IAM-MP-10, IAM-MP-12 and IAM-MP-15.

The `IAM-CP1` deep audit of `48ff7cc` (record `audits/IAM-CP1.md`) returned `IAM-CP1 FIXES REQUIRED`. It found one blocking finding, CP1-01: logout, recovery and disablement on the Keycloak side stop reaching the Vertex session once the Keycloak SSO session idles out (SECURITY Section 11). Fix run `IAM-R03F` resolves it together with the non-blocking items the record assigns to it; `/audit IAM-CP1` then re-checks CP1-01. The record's other non-blocking findings name their owner stages (IAM-MP-07, IAM-MP-10, IAM-MP-11, IAM-MP-12, IAM-MP-15) and are attached to those stages when the re-check accepts `IAM-CP1`. `IAM-R04` (IAM-MP-07) starts only after `IAM-CP1 ACCEPTED`.

Fix run `IAM-R03F` (plan `IAM_R03F_SESSION_REVALIDATION_PLAN.md`) resolved CP1-01. It is `COMPLETE` once its pull request is merged. The API keeps each session's refresh token encrypted server-side (its own key purpose) and refreshes the Keycloak session at most once a minute while the Vertex session is used; the idle deadline slides only after a successful refresh, a refusal revokes the session (reason `PROVIDER_SESSION_ENDED`, Audit evidence), and an outage keeps the current deadline without sliding it (R03F D-01 to D-09). Real-Keycloak tests show a used session surviving the SSO idle timeout and its grace window and still receiving Keycloak's logout, and a silently ended Keycloak session or a disabled identity ending the Vertex session at its next re-validation (R03F D-10). It also closed CP1-02, CP1-10, CP1-12 and CP1-16 and the realm-contract brute-force flake (R03F D-11 to D-13). `/audit IAM-CP1` re-checks CP1-01 next.

The `IAM-CP1` re-check 1 of `cd82811` (record `audits/IAM-CP1.md` Section 5) returned `IAM-CP1 FIXES REQUIRED`. CP1-01 is resolved, and so are CP1-02, CP1-10 and CP1-16; CP1-12 is resolved in the auth suites, and its remainder in the provisioning suite is CP1-26. The fix run introduced one blocking finding, CP1-21: review fix S-01 classes an identity-provider timeout as `rejected`, so a hung Keycloak revokes every session that comes due (reason `PROVIDER_SESSION_ENDED`) and a timed-out sign-in answers `AUTH_LOGIN_FAILED`. This contradicts R03F D-05 and Done means 3. By owner decision, CP1-21 was fixed in a follow-up pull request instead of a separate fix run and re-check (record Section 5.7): openid-client's `OAUTH_TIMEOUT` and `OAUTH_ABORT` are `unavailable` again, proven by unit tests that fail without the fix and by a probe against a provider that never answers. `IAM-CP1` is accepted on that decision. Its non-blocking findings are attached to IAM-MP-07, IAM-MP-10, IAM-MP-11, IAM-MP-12 and IAM-MP-15 ("Carried forward from the `IAM-CP1` audit"); CP1-22 to CP1-25, first assigned to a fix run, go to IAM-MP-15.

Run `IAM-R04` delivered IAM-MP-07 (plan `IAM_R04_AUTHORIZATION_CONTEXT_PLAN.md`). It is `COMPLETE` once its pull request is merged. Every API route requires an application session unless its handler is one of the five `@Public()` routes of spec Section 24, pinned by a route inventory; CSRF is verified wherever a session is used on an unsafe method; `@RequirePermission()` checks the authorization context (ACTIVE user, ACTIVE departments with the primary, effective permission codes), read in one statement from committed state on every request that needs it and memoized per request only, and records denials as Audit evidence (R04 D-01 to D-16). `DEPRECATED` permissions are not effective (D-06). It closed CP1-03, CP1-04 and CP1-05: the IAM root exposes no repository, dependency type or user entity, and use cases that take ports sit behind the private `@vertex-os/iam/composition` entry (D-12). `GET /api/iam/me` stays with IAM-MP-11 (D-10). Its carried-forward items are attached to IAM-MP-09, IAM-MP-11 and IAM-MP-15.

Run `IAM-R05` delivered IAM-MP-08 and IAM-MP-09 (plan `IAM_R05_PRIVILEGE_ADMINISTRATION_PLAN.md`). It is `COMPLETE` once its pull request is merged. Departments, memberships, custom roles, role-permission mappings and user-role assignments are administered by application use cases behind `@vertex-os/iam/composition`, bound in `apps/api/src/iam/administration.ts` and not yet mounted in HTTP (R05 D-01, D-03). Each change commits with one Audit record; departments and roles are version-checked; row locks in one order (role → user → department or permission) serialize competing operations, and the `system-administrator` role row is the lock that keeps at least one ACTIVE System Administrator (D-05 to D-08). The system role is protected, a custom role never newly maps a non-ACTIVE code (D-13, D-15), and every change reaches the next authorization context. It closed the primary-membership switch ordering (IAM-01) and the `DEPRECATED`/`RETIRED` mapping question (IAM-02), and the R04 items attached to IAM-MP-09. Review S-1 raised an owner decision on a grant ceiling, attached to IAM-MP-11; its other carried-forward items are attached to IAM-MP-10 and IAM-MP-11.

Run `IAM-R06` delivered IAM-MP-10 (plan `IAM_R06_USER_LIFECYCLE_PLAN.md`). It is `COMPLETE` once its pull request is merged. User creation with memberships and roles, display-name update, suspension, disablement, termination, backend-derived reactivation, sync-identity, resend-invitation and the administrator's revoke-sessions action are application use cases behind `@vertex-os/iam/composition`, bound in `apps/api/src/iam/user-administration.ts` and not yet mounted in HTTP (R06 D-01). Access removal commits the denial with `PENDING` under the System Administrator and user row locks, then revokes every application session, then reconciles the identity; reactivation grants access only in a version-checked final commit after Keycloak is ready, and reconciles at once when that commit loses (D-06 to D-08). The grant ceiling decided by the owner (spec Section 23.1) is enforced in role assignment, role activation, mapping replacement and user creation (D-12). `pnpm iam:bootstrap` creates, resumes or recovers the first System Administrator from committed state in one transaction serialized by the reference-synchronization lock and the System Administrator row, and refuses unless reference data is synchronized (D-15, D-16). A migration adds four session revocation reasons, the `auth_session` checks of CP1-06 and a trigger that keeps a revocation final. It closed the IAM-02 bootstrap item, the R02 and R03 items, CP1-06, CP1-07, CP1-13, CP1-26 and the R05 items attached to IAM-MP-10. Review SEC-2 raised an owner decision (a grant ceiling for reactivation, decided on 2026-09-24: option 1), attached to IAM-MP-11; its other carried-forward items are attached to IAM-MP-11 and IAM-MP-15.

Run `IAM-R07` delivered IAM-MP-11 (plan `IAM_R07_HTTP_ADMINISTRATION_PLAN.md`). It is `COMPLETE` once its pull request is merged. `/api/iam` exposes spec Section 25: the current user, the user directory and lifecycle, memberships, role assignments, departments, roles and mappings, and the permission catalog, in `apps/api/src/iam/http` over the bound capabilities of `IamModule` (R07 D-01). Every route declares its specification permission; request bodies and queries are strict Zod schemas that also generate the OpenAPI components; every refusal maps through one table to a stable code; every change is attributed to the session's USER actor, which lint and a test over every mutating route enforce (D-04 to D-07). A read-only directory adds bounded, literally searched pages (D-02, D-03). Reactivation checks the grant ceiling under the target's row lock before Keycloak is called and again in its final commit (D-11, review SA-1). The authentication module exports the session revocation bound to `AuthRuntime.sessions` (D-09); lock-wait and transaction timeouts answer `503 SERVICE_BUSY`, and the driver's query timeout now trails the statement timeout (D-15). It closed the R02, R04, R05 and R06 items attached to IAM-MP-11, the owner decisions S-1 and SEC-2 over HTTP, and CP1-18. Its carried-forward items are attached to IAM-MP-12, IAM-MP-13 and IAM-MP-15.

Run `IAM-R08` delivered IAM-MP-12 (plan `IAM_R08_FRONTEND_SESSION_PLAN.md`); its planner split the frontend run into `IAM-R08`, `IAM-R08B` and `IAM-R08C` (D-01). It is `COMPLETE` once its pull request is merged. The web app reads its authentication state from `/api/auth/session` and `/api/iam/me` and never handles a token: signed out, expired, ended, inactive, unavailable and signed in are distinct states; sign-in is a top-level navigation to the API and the callback's `authError` is explained once; sign-out uses the in-memory CSRF token and follows `logoutUrl` (D-05 to D-09). Protected data is removed on sign-out, on a session refusal (whose reason is kept, because the API clears the cookie with it), on a user change and on permission loss, and the protected views remount on those changes (D-10; review S-1, S-2). Lint and boundary probes keep application code away from browser storage and cookies (D-14). The real-Keycloak browser items (three-engine cookies, rotation across sites, CP1-17) moved to IAM-MP-15 (D-03). Its carried-forward items are attached to IAM-MP-13 and IAM-MP-15.

Run `IAM-R08B` delivered IAM-MP-13 (plan `IAM_R08B_USER_ADMINISTRATION_PLAN.md`). It is `COMPLETE` once its pull request is merged. The web app has a bounded, searchable user directory, user creation (invitation), and a user detail with the display-name edit, memberships, role assignments, the access lifecycle, identity synchronization, invitation resend and session revocation. Access, identity synchronization and invitation delivery are three labeled facts; invitation delivery shows only while INVITED (D-06). Security-sensitive actions confirm with the exact target, consequence and an optional reason; the reactivation result states the backend's target (D-08, D-09). Stale writes keep the draft, and unconfirmed results reload the user (D-11, D-17). Every protected read declares its permission through `protectedQuery` (D-04). `DELETE /api/iam/users/{userId}/roles/{roleId}` accepts an optional body reason that reaches Audit, which supersedes R07 D-08's "DELETE routes take no reason" for role removal (D-02). Its carried-forward items are attached to IAM-MP-14 and IAM-MP-15.

Run `IAM-R08C` delivered IAM-MP-14 (plan `IAM_R08C_PRIVILEGE_ADMINISTRATION_PLAN.md`). It is `COMPLETE` once its pull request is merged. The web app has department and role lists and details, the read-only permission catalog, and a permission editor for custom roles that builds the requested set from ACTIVE catalog entries only and saves through an explicit review of additions and removals (D-08). The system role's protection follows the API's `isSystem` flag, never a name or code (D-07). Department and role deactivation, role activation and permission edits confirm with the target, consequence and reach (D-05, D-06). Stale writes keep the draft; unconfirmed results and refused codes reload the record and the catalog (D-11, D-16). The user directory filters by department and role (D-09). No API change. Its carried-forward items are attached to IAM-MP-15.

Run `IAM-R09` delivered IAM-MP-15 part 1 (plan `IAM_R09_SECURITY_HARDENING_PLAN.md`); its planner split IAM-MP-15 into `IAM-R09` and `IAM-R09B` (D-01). It is `COMPLETE` once its pull request is merged. Login, callback and logout are rate limited per client address (IPv6 per /64) with configured values; a refused login stores no attempt and answers `AUTH_RATE_LIMITED` (D-03, D-04). Denials and rejected back-channel logout tokens write Audit evidence up to a bound, and a back-channel logout that revokes nothing is now recorded (D-04, D-05). Housekeeping runs once a minute independent of sign-in: race-safe, indexed statements delete expired login attempts, discard expired sessions' tokens and purge session rows past `AUTH_SESSION_RETENTION_DAYS` (D-06, D-07; SECURITY Section 11 updated). A back-channel logout that races a sign-in ends the new session (D-08). Malformed JSON answers `VALIDATION_FAILED`, Problem Details are `no-store`, a failed revocation after a restriction still reconciles, the actor's authority is one statement, and the realm disables `delete_credential` (D-09 to D-13). The race, secret-scan, `env:setup` and contention evidence is discriminating (D-15 to D-18). Its carried-forward items are attached to IAM-MP-15 ("Carried forward to run IAM-R09B") and to the production open items below.

Run `IAM-R09B` delivered IAM-MP-15 part 2 (plan `IAM_R09B_BROWSER_JOURNEYS_PLAN.md`). It is `COMPLETE` once its pull request is merged. `pnpm test:e2e` now also runs the IAM journeys (`apps/web-e2e/playwright.iam.config.mts`): a global setup starts PostgreSQL, Mailpit and the pinned Keycloak through the Docker CLI, runs the migrations and the operator commands, and serves the built API and the production web build (D-02, D-03). Thirteen journeys cover spec Section 46.7 in Chromium, the cookies and rotation also in Firefox, and WebKit's refusal of `Secure` cookies over plain HTTP (D-04 to D-06). Every journey checks that no token reaches the browser, and the teardown scans the API log (D-12, D-13). `IAM_DEFINITION_OF_DONE_MAP.md` maps spec Sections 47 and 56 to evidence and classifies every statement; none is a blocker (D-16). Its carried-forward items are attached to `IAM-FINAL` (Section 17) and to the open items below.

Open items that no IAM stage owns (IAM-02 plan Section 40), each resolved when its trigger occurs:

- database-level Audit immutability, runtime/migration role separation and schema per domain (ADR-0008): production deployment design or a third domain adapter, whichever comes first;
- `docs/modules/audit.md`: when MOD-AUDIT is fully specified; it adopts or deliberately migrates the foundation contract (IAM-02 D-05). Until then `docs/modules/iam.md` Sections 34–35 specify the implemented foundation;
- a shared test-support package: decided when a fourth copy of the PostgreSQL test harness would be needed;
- the permission catalog in the web app (IAM-R08C D-08, IAM-R09B D-11): the permission editor and the role detail read one page of 100 codes and say so when `total` exceeds it; 12 codes are registered. Whoever registers a module's permissions that bring the catalog near 100 pages it;
- an administrative credential-recovery action (spec Section 54 MAY; not built, IAM-R06 D-17): whoever adds one must make it not runnable through an unexpired invitation link (IAM-R02 review S-06, S-07);
- production identity provider (run IAM-R01): production deployment design. It covers:
  - the realm's production form (hostname, TLS, database, no `start-dev`);
  - never importing `vertex-realm.json` without every placeholder set, because Keycloak imports an unset `${NAME}` literally (verified on 26.7.4);
  - Argon2id benchmarking on production hardware;
  - WebAuthn/passkeys and a compromised-password list (SHOULD items);
  - event retention;
  - narrowing `vertex-provisioner` with fine-grained admin permissions (also reviewed by the Final IAM Module Audit);
  - production SMTP (run IAM-R02): the realm's `KEYCLOAK_SMTP_*` values, TLS (`starttls`/`ssl`) and trust, and a real sender domain. Mailpit is local and test only.
  - Keycloak on its own host (run IAM-R03 D-06): the `__Host-vertex-*` cookies use `Path=/`, so a Keycloak on the web app's host would receive them. Keycloak must also reach the API's back-channel logout URL; locally only Docker Desktop forwards `host.docker.internal` to a loopback API.
  - The reverse proxy (run IAM-R09 D-04, D-14; review S-4): the API trusts `X-Forwarded-For` from loopback only, so the production proxy must be the only way in, append the client address (`$remote_addr`) and set a fresh `X-Request-Id` on every request. The local Vite proxies pass both headers through unchanged.
  - Per-process authentication state (run IAM-R09 D-03, D-08): the rate limits, the evidence bound and the memory of recent back-channel logouts live in the API process. More than one API process needs a shared store for them.
  - Browsers over HTTPS (run IAM-R09B D-06): WebKit keeps no `Secure` cookie for plain HTTP, so local sign-in works in Chromium and Firefox only. Verify sign-in in WebKit/Safari over the production HTTPS origin.
  - Keycloak's site (run IAM-R09B D-07; IAM-R03 review S-02): the callback sees the `SameSite=Strict` session cookie only when Keycloak shares the web app's registrable domain. Otherwise a sign-in over an existing session does not rotate it, and the previous session stays live, unreachable by the browser, until it expires. Put Keycloak on the same registrable domain, or rotate differently.
  - Sign-in volume (run IAM-R09B D-09; IAM-R09 review S-3): clients spread over many addresses under the per-address sign-in limit can grow `auth_login_attempt` faster than housekeeping deletes it (2,000 per minute). Choose per-address limits at the reverse proxy with an alert on that table's growth, or accept the trade-off explicitly; a global ceiling would let one flood lock every staff member out.
  - Session re-validation across API processes (run IAM-R03F review DC-04): one Keycloak refresh per session and interval relies on one clock and a refresh shorter than the 60 s interval. More than one API process, or clocks skewed by tens of seconds, could refresh one session twice and revoke it through Keycloak's refresh-token reuse detection. Keep one API process, or re-check the claim when scaling out.

| Stage | Run | Status | Required before the run starts |
|---|---|---|---|
| IAM-MP-00 Architecture & Domain Boundary Foundation | — | COMPLETE | IAM spec execution gate (closed) |
| IAM-MP-01 IAM Persistence & First Migration | — | COMPLETE | MP-00 COMPLETE (satisfied) |
| IAM-MP-02 Reference Data & Minimal Audit Foundation | — | COMPLETE | MP-01 COMPLETE (satisfied) |
| IAM-MP-03 Keycloak Environment & Realm Contract | R01 | COMPLETE | MP-02 COMPLETE (satisfied) |
| IAM-MP-04 Identity Reconciliation & Invitations | R02 | COMPLETE | R01 merged (satisfied) |
| IAM-MP-05 Application Session Foundation | R03 | COMPLETE | R02 merged (satisfied) |
| IAM-MP-06 OIDC / Activation / CSRF / Logout | R03 | COMPLETE | R02 merged (satisfied) |
| `IAM-R03F` Fix run for the `IAM-CP1` blocking finding | R03F | COMPLETE | `IAM-CP1` record merged (satisfied) |
| `IAM-CP1` Deep audit: authentication | — | COMPLETE | R03 merged (audited: FIXES REQUIRED); R03F merged (re-check 1: FIXES REQUIRED; CP1-21 fixed in a follow-up pull request, accepted by owner decision) |
| IAM-MP-07 Default Protection & Authorization Context | R04 | COMPLETE | `IAM-CP1 ACCEPTED` (satisfied) |
| IAM-MP-08 Department & Membership Core | R05 | COMPLETE | R04 merged (satisfied) |
| IAM-MP-09 Role/Permission & Last-Admin Core | R05 | COMPLETE | R04 merged (satisfied) |
| IAM-MP-10 User Lifecycle & Bootstrap Core | R06 | COMPLETE | R05 merged (satisfied) |
| `IAM-CP2` Deep audit: authorization and administration core | — | DEFERRED into `IAM-FINAL` | owner decision 2026-09-24 |
| IAM-MP-11 HTTP Administration Surface | R07 | COMPLETE | R06 merged (satisfied) |
| IAM-MP-12 Frontend Authentication & Session UX | R08 | COMPLETE | R07 merged (satisfied) |
| IAM-MP-13 Frontend User & Access Admin | R08B | COMPLETE | R08 merged (satisfied) |
| IAM-MP-14 Frontend Department/Role/Permission Admin | R08C | COMPLETE | R08B merged (satisfied) |
| IAM-MP-15 E2E & Hardening, part 1 (backend and test evidence) | R09 | COMPLETE | R08C merged (satisfied) |
| IAM-MP-15 E2E & Hardening, part 2 (browser journeys and closeout) | R09B | COMPLETE | R09 merged (satisfied) |
| `IAM-R10` Local password authentication | R10 | COMPLETE | PR #23 merged (satisfied) |
| `IAM-R11` Final-audit blocking fixes | R11 | COMPLETE (accepted on merge) | R10 merged (satisfied) |
| `IAM-R12` Dormant provider session cleanup | R12 | COMPLETE (accepted on merge) | R11 reviewed and merged |
| `IAM-FINAL` Final IAM Module Audit | — | WAITING | R12 reviewed and merged |

The ledger changes only through the pull request of the run or audit that produced the evidence (`docs/PLANNING.md` Section 2).

### Amendment record — delivery method (2026-09-23)

- **What changed:** IAM moves to the run-based method of `docs/PLANNING.md`. Stages IAM-MP-03 to IAM-MP-15 are grouped into runs `IAM-R01` to `IAM-R09` with risk tiers (Section 8.3). Per-stage separate audits are replaced by in-run review and deep audits at `IAM-CP1`, `IAM-CP2` and the Final IAM Module Audit. Acceptance becomes the owner's merge of each run's pull request. Stage order, stage content, ownership, invariants and carried-forward items are unchanged.
- **Why:** evidence from IAM-MP-00 to IAM-MP-02. Every stage took three separate sessions: plan, implementation, and audit with acceptance. All three audits returned ACCEPTED with no blocking finding and no implementation fix. The full verification gate ran three times per stage (implementer, auditor, CI). Documentation added in IAM-01 and IAM-02 was about 2.8 times the production code by size. The owner delegated the flagged plan decisions to the planning agent, so the separate planning session added a cold start without adding an owner decision.
- **Stages affected:** IAM-MP-03 to IAM-MP-15 (run grouping only).
- **Accepted baselines:** IAM-MP-00, IAM-MP-01 and IAM-MP-02 remain valid.

### Amendment record — `IAM-CP1` fix run (2026-09-23)

- **What changed:** run `IAM-R03F` (Tier A) was added between `IAM-R03` and the `IAM-CP1` re-check (Section 8.3 and the ledger).
- **Why:** `IAM-CP1 FIXES REQUIRED` (`audits/IAM-CP1.md`, blocking finding CP1-01). `docs/PLANNING.md` Section 9 requires a dedicated fix run, and `/stage` starts only runs listed here.
- **Stages affected:** IAM-MP-05 and IAM-MP-06 stay `COMPLETE` (merged); their session behavior is corrected by `IAM-R03F`. IAM-MP-07 still waits for `IAM-CP1 ACCEPTED`. Stage order and ownership are unchanged.
- **Accepted baselines:** unchanged. `IAM-CP1` is not accepted.

### Amendment record — `IAM-CP1` accepted by owner decision (2026-09-23)

- **What changed:** `IAM-CP1` → `COMPLETE` and IAM-MP-07 (`IAM-R04`) → `READY`. The `IAM-CP1` non-blocking findings are attached to IAM-MP-07, IAM-MP-10, IAM-MP-11, IAM-MP-12 and IAM-MP-15.
- **Why:** re-check 1 returned `IAM-CP1 FIXES REQUIRED` for CP1-21, a small defect introduced by `IAM-R03F`. The owner decided to fix it directly in a follow-up pull request, without the separate fix run and re-check that `docs/PLANNING.md` Section 9 prescribes. This is a one-time exception, not a change of method.
- **Evidence:** `audits/IAM-CP1.md` Section 5.7; the pull request's CI.
- **Accepted baselines:** IAM-MP-05 and IAM-MP-06 with the `IAM-R03F` correction and the CP1-21 fix.

The records below were written under the previous method and are kept as history. Under the current method, a record is added only when the roadmap changes.

### Amendment record — `IAM-CP2` deferred into the Final IAM Module Audit (2026-09-24)

- **What changed:** the `IAM-CP2` deep audit (authorization and administration core, IAM-MP-07 to IAM-MP-10) no longer runs after `IAM-R06`. Its scope moves into `IAM-FINAL` (Section 17, "Deferred `IAM-CP2` scope"). IAM-MP-11 (`IAM-R07`) is `READY` after the `IAM-R06` merge instead of after `IAM-CP2 ACCEPTED`.
- **Why:** owner decision (2026-09-24), to save a separate audit session. `docs/PLANNING.md` lets the Master Plan place its checkpoints; moving one is an amendment of this plan.
- **Consequences:** the administration core is exposed over HTTP (IAM-MP-11) and used by the frontend (IAM-MP-12 to IAM-MP-14) before any independent deep audit of it. A defect a deep audit would have found in MP-07 to MP-10 is found later, and fixing it may also touch the HTTP and frontend layers built on it. Until then the evidence is the in-run reviews of `IAM-R04` to `IAM-R06` (three reviewers each, no blocking finding). Mitigation: `IAM-R07` is Tier A with three reviewers, and its security reviewer checks every administration route against the grant ceiling, the last-System-Administrator rule and the actor attribution (IAM-R06 review SEC-1).
- **Stages affected:** no stage changes content or order; `IAM-R07` no longer waits for a checkpoint.
- **Accepted baselines:** IAM-MP-07 to IAM-MP-10 remain accepted by their merges; their independent audit is `IAM-FINAL`.

### Amendment record — grant ceiling for reactivation (2026-09-24)

- **What changed:** the owner chose option 1 for review finding SEC-2 of run `IAM-R06`: an actor who is not an ACTIVE System Administrator may reactivate a user only when they hold every ACTIVE permission of that user's ACTIVE roles, and never a System Administrator. Spec Section 23.1 now says so. Implementation is attached to IAM-MP-11 (run `IAM-R07`), before the reactivate route is mounted.
- **Why:** without it, `iam.users.manage-access` alone could restore privileges the actor does not hold, including a System Administrator suspended as compromised; `docs/SECURITY.md` requires protection against vertical privilege escalation. It changes the authorization model, so it was the owner's decision.
- **Placement:** in `IAM-R07`, because IAM-MP-10 is merged and the use case is not reachable over HTTP until that run mounts it.

### Amendment record — grant ceiling (2026-09-24)

- **What changed:** the owner chose option 1 for review finding S-1 of run `IAM-R05`: an administrator who is not an ACTIVE System Administrator cannot grant a role, activate a role or map a permission beyond their own effective permissions, and cannot assign the system role. The rule is spec Section 23.1 with error code `IAM_GRANT_EXCEEDS_ACTOR`. Implementation is attached to IAM-MP-10 (run `IAM-R06`), the HTTP mapping to IAM-MP-11.
- **Why:** spec Section 19 gave `iam.users.manage-roles` and `iam.roles.manage` no limit, which allowed self-escalation to System Administrator; `docs/SECURITY.md` requires protection against vertical privilege escalation. It changes the authorization model, so it was the owner's decision (`AGENTS.md`, "Changes Requiring Explicit Approval").
- **Placement:** in IAM-R06 rather than IAM-R07 so that the `IAM-CP2` deep audit covers it with the administration core it constrains.

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

### Amendment record — IAM-MP-01 independent audit (2026-09-23)

- **What changed:** the independent audit returned `IAM-01 ACCEPTED` with no blocking finding and no implementation fix. IAM-MP-01 stays `AUDIT_REQUIRED` until the owner accepts the baseline. Non-blocking items A1-01, A1-02, A1-03, A1-05 and A1-07 are attached to IAM-MP-02 as "Carried forward from the IAM-MP-01 audit". R-07 is resolved: the Prisma CLI downloads its schema engine on first use, the same path CI has exercised through `prisma generate` since the workflow was added, and the `pnpm-workspace.yaml` comment now says so (A1-04).
- **Evidence:** `IAM_01_PERSISTENCE_FOUNDATION_PLAN.md` Section 40A: line-by-line migration review against a fresh `migrate diff`, a constraint catalog derived from a freshly migrated database, a reproduction of migration atomicity and recovery, the auditor's own boundary probes, D-12 rulings (I-4 upheld), uncached lint/typecheck/test/build, all integration suites, Playwright 130/130, three consecutive adapter runs and `pnpm deps:audit`.
- **Stages affected:** IAM-MP-02 (carried-forward items). Stage order and ownership are unchanged.
- **Accepted baselines:** unchanged until the owner's acceptance.

### Amendment record — IAM-MP-01 acceptance (2026-09-23)

- **What changed:** IAM-MP-01 `AUDIT_REQUIRED` → `COMPLETE`, and IAM-MP-02 `PLANNED` → `READY`. The owner accepted the audited IAM-01 state on `main` (`5056c9f`, audit record `3cc9cd4`) as the baseline for IAM-MP-02 planning.
- **Evidence:** `IAM_01_PERSISTENCE_FOUNDATION_PLAN.md` Section 40A (verdict `IAM-01 ACCEPTED`, no blocking findings, no implementation fix), and CI run 35811045334 on `3cc9cd4`: frozen install, `pnpm verify:full` including `lint:boundaries`, fresh-container migration and drift tests and the adapter suite on `ubuntu-24.04`, Playwright 130/130 with no flaky test, and `pnpm deps:audit`.
- **Stages affected:** IAM-MP-02 becomes eligible for detailed planning and carries A1-01, A1-02, A1-03, A1-05 and A1-07 plus the IAM-01 plan's Section 34 open items. Stage order and ownership are unchanged.
- **Accepted baselines:** IAM-MP-00 and IAM-MP-01.

### Amendment record — IAM-MP-02 executable plan written (2026-09-23)

- **What changed:** `docs/plans/iam/IAM_02_REFERENCE_DATA_AND_AUDIT_FOUNDATION_PLAN.md` was written from `main` at `21f536c`. IAM-MP-02 remains `READY` until its implementation conversation starts. The IAM-MP-02 section now links the plan and summarizes how it resolves the carried-forward items.
- **Evidence:** the plan's Section 6.3 records planning-time probes against the repository's own Prisma 7.10.0 CLI, a throwaway PostgreSQL 18.6 container and the repository's ESLint/Nx configuration. The most important finding: an unexpected database error puts personal data into logs through two paths, the driver's `detail` (a whole row, email included) and, for invalid input, the error message itself. A1-02 therefore needs an allowlisted description, not the removal of one property.
- **Stages affected:** none reordered. The stage was checked for a split into "Audit foundation" and "reference synchronization" and kept whole: an Audit capability without a consumer would be speculative, and a synchronization without Audit would break spec Section 9.6 (plan Section 2.1).
- **Owner acceptance:** the owner accepted the plan on 2026-09-23 and delegated its flagged decisions. The rulings (D-03 and D-04 confirmed, D-04 recorded in `docs/ENGINEERING.md` rather than an ADR, I-1, I-3 and I-5 confirmed, A1-03 wording fixed, no `docs/modules/audit.md` yet) are in plan Section 12.1.
- **Accepted baselines:** remain valid.

### Amendment record — IAM-MP-02 implementation ready for independent audit (2026-09-23)

- **What changed:** IAM-MP-02 `READY` → `IN_PROGRESS` → `AUDIT_REQUIRED`. The stage delivered the minimal MOD-AUDIT foundation (`domains/audit`, `domains/audit-persistence`, append-only `audit_record` with database-assigned `occurred_at`), per-domain database entries `@vertex-os/database/iam|audit` replacing `/persistence`, the first cross-module atomic write (opaque `DatabaseTransaction`, `runInTransaction`, `IamTransactionRunner`, composition-root `auditRecorderFor`), the code-defined IAM permission catalog and protected `system-administrator` role with an audited, serialized, idempotent synchronization (`pnpm iam:sync-reference`), `iam_role_system_code_ck`, and the carried-forward items A1-01, A1-02, A1-03, A1-05 and A1-07. IAM-MP-03 remains `PLANNED` and cannot start until audit and owner acceptance.
- **Evidence:** `IAM_02_REFERENCE_DATA_AND_AUDIT_FOUNDATION_PLAN.md` Sections 41–44: unit tests (IAM 86, Audit 111, API 29); `lint:boundaries` V1–V40/C1–C5 with three observed sanity breaks; database integration 27; Audit adapter 99, IAM adapter 84 and command 10, each three consecutive times (first run 12 permissions, 1 role, 12 mappings, 14 Audit records; converged run writes nothing; refusals, custom-role isolation, cross-adapter atomicity with the real Audit adapter, four-way concurrency and lock ordering proven); upgrade-path test for the new constraint; A1-02 proven with real P2039/P2010/P2007/P2002/P1001 errors and end to end through both loggers; local `db:migrate` + two synchronization runs; OpenAPI output unchanged; `pnpm verify`, uncached `pnpm verify`, `pnpm verify:full` (Playwright 130/130) and `pnpm deps:audit` pass. The root gates used a temporary local `.prettierignore` exclusion for two sibling worktrees, restored after each run. The HTTP runtime changed only by the log serializer.
- **Stages affected:** IAM-MP-02 only; no stage order or ownership change. Open items passed on are unchanged from the plan's Section 40 (API statement-timeout sizing, `DEPRECATED` effectiveness, custom-role version semantics, unwritable system-role mappings for IAM-MP-09, bootstrap requiring synchronized reference data, security-event recording, database-level Audit immutability and role separation, `docs/modules/audit.md`).
- **Remaining audit focus:** the `transaction_timestamp()` spelling of the `occurred_at` default (Prisma fills `now()` on the client), Nx's cycle diagnostic for V20, the `P3018`-less CLI output of a failed wrapped migration, the exit-code normalization through `pnpm`/Nx, and the interpretations I-1…I-8. Independent audit determines acceptance.
- **Accepted baselines:** unchanged; IAM-MP-02 is not yet accepted.

### Amendment record — IAM-MP-02 independent audit (2026-09-23)

- **What changed:** the independent audit of the uncommitted IAM-02 tree on `9e9e464` returned `IAM-02 ACCEPTED`. There is no blocking finding and no implementation fix. IAM-MP-02 stays `AUDIT_REQUIRED` until the owner accepts the baseline. The non-blocking items are attached to IAM-MP-03 as "Carried forward from the IAM-MP-02 audit":
  - A2-01: the Nest `Logger` path of `PinoLoggerService` logs raw error messages. It is latent, and must be closed before IAM or Audit persistence enters the HTTP runtime.
  - A2-02 and A2-03: narrow lint residuals for interpolated dynamic imports or `createRequire`, and for bracket-notation or destructured unsafe raw SQL.

  The header's next-stage line and Section 19 still described the pre-implementation state and were corrected (A2-04, status text only). A2-05 and A2-06 are local-environment notes.
- **Evidence:** `IAM_02_REFERENCE_DATA_AND_AUDIT_FOUNDATION_PLAN.md` Section 46A:
  - migrations and catalog: line-by-line review of both migrations; the Audit DDL regenerated from the `9e9e464` schema, byte-identical; the IAM-01 migration unchanged; the `audit_record` and `iam_role` catalogs derived from the auditor's own freshly migrated PostgreSQL 18.6 (no foreign key, secondary index, trigger or function); the tightening failure reproduced (atomic, row kept, P3009 on redeploy);
  - synchronization, run as the built command on fresh databases: the first run gave 12 permissions, 1 role, 12 mappings and 14 Audit records; the second run left every row byte-identical; both refusals exited 2 with nothing written; eight concurrent processes, observed waiting on the advisory lock, produced exactly one creator and 14 Audit records;
  - real adapters: I-1 observed, custom roles untouched, and full rollback when the real Audit adapter fails;
  - logging: real database errors inside the composed command logged only allowlisted descriptions;
  - boundaries: 74 auditor ESLint probes, and D-03 proven by two restored type-level breaks;
  - OpenAPI: regenerated at `9e9e464` and on the IAM-02 tree, byte-identical;
  - verification: uncached lint/typecheck/test/build, `pnpm test:integration`, the three new or changed suites three times each, Playwright 130/130, `pnpm verify:full` (with a temporary, restored sibling-worktree exclusion) and `pnpm deps:audit` all pass.
- **Stages affected:** IAM-MP-03 receives the carried-forward items. A2-01 is owned by the first stage that composes IAM into the HTTP runtime (IAM-MP-05/06/07). Stage order and ownership are unchanged.
- **Accepted baselines:** unchanged until the owner's acceptance.

### Amendment record — IAM-MP-02 acceptance (2026-09-23)

- **What changed:** IAM-MP-02 `AUDIT_REQUIRED` → `COMPLETE`, and IAM-MP-03 `PLANNED` → `READY`. The owner accepted the audited IAM-02 state on `main` (implementation `2b7e103`, audit record `a40f5a2`) as the baseline for IAM-MP-03 planning.
- **Evidence:** `IAM_02_REFERENCE_DATA_AND_AUDIT_FOUNDATION_PLAN.md` Section 46A (verdict `IAM-02 ACCEPTED`, no blocking findings, no implementation fix), and CI run 35824072798 on `a40f5a2`: frozen install, `pnpm verify:full` including `lint:boundaries` V1–V40/C1–C5, fresh-container migration, upgrade-path and drift tests, the Audit adapter, IAM adapter and command integration suites on `ubuntu-24.04`, Playwright 130/130, and `pnpm deps:audit`.
- **Stages affected:** IAM-MP-03 becomes eligible for detailed planning. It carries A2-02 and A2-03, passes A2-01 on until IAM or Audit persistence enters the HTTP runtime, and carries the IAM-02 plan's Section 40 open items, together with the IAM-MP-00 items A-04 and A-02. Stage order and ownership are unchanged.
- **Accepted baselines:** IAM-MP-00, IAM-MP-01 and IAM-MP-02.

---

## 16. Master Plan Change Discipline

This roadmap may change when the actual repository makes a change necessary, but updates must preserve the distinction between roadmap and implementation plan.

Acceptable reasons to amend this Master Plan include:

- a completed stage reveals a new dependency that changes safe ordering;
- an executable stage proves too large and must be split;
- a review or deep audit finds a cross-stage risk;
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

After IAM-R09B and the owner-directed IAM-R10–R12 local-auth changes are merged, perform a dedicated Final Module Audit. The current authentication criteria are ADR-0001 and the IAM specification Section 61. Historical provider-specific checks below are replaced by the local-credential checks in this section.

Inputs include the current `IAM_DEFINITION_OF_DONE_MAP.md`, the IAM specification Section 61, the R10 plan and these carried items:

- **Reactivated permissions (IAM-R09 D-12, SEC-5):** a DEPRECATED permission made ACTIVE again by a released catalog change widens roles that map it; whoever reactivates it reviews those roles.
- **Module boundaries for `.mts` files (IAM-R09B review A-2, pre-existing):** `@nx/enforce-module-boundaries` is configured for `.ts`, `.tsx`, `.js` and `.jsx` only, so a `.mts` file (for example a Playwright configuration) escapes the project and import bans.
- **Local identity compatibility layer (IAM-R12 inventory):** IAM administration still binds an
  in-process adapter to the historical identity-provider port. It makes no external request but
  retains provider-era reconciliation and invitation semantics. Classify its current effect on
  lifecycle, Audit and API behavior against Section 61; a closure blocker requires a focused
  reviewed fix run, not a silent change inside the audit record.

This is not another implementation stage.

The Final Audit evaluates IAM as one integrated system and must verify, at minimum:

### Deferred `IAM-CP2` scope

By owner decision (2026-09-24) the Final Audit also carries the checkpoint audit that `IAM-CP2` would have performed on IAM-MP-07 to IAM-MP-10, against their run plans (`IAM_R04`, `IAM_R05`, `IAM_R06`) and each stage's "Audit focus": protected-by-default routing and the authorization context; department, membership, role and mapping administration; the last-System-Administrator rule and its lock order; the grant ceiling; the user lifecycle and reactivation; bootstrap and migrated-admin recovery; session revocation and the auth-session database guarantees; and the carried-forward findings of those runs. Historical external-provider ordering is superseded by ADR-0001. Findings in this scope are classified as they would have been at the checkpoint.

### Specification coverage

- every applicable requirement in `docs/modules/iam.md` has implementation evidence;
- intentionally deferred items remain deferred;
- no undocumented substitute semantics were introduced.

### Architecture

- IAM owns only its documented domain concepts;
- auth/session infrastructure remains outside IAM business entities;
- IAM holds salted local credential hashes and the API verifies them; no external identity provider participates in sign-in;
- Audit ownership remains MOD-AUDIT;
- cross-module consumers have only the approved IAM public surface;
- no forbidden dependency or persistence shortcut exists.

### Security

- the browser never stores a password or session secret;
- salted scrypt hashes are verified only on the backend; no MFA or provider token is required;
- application sessions are opaque, server-side, revocable, and expiry-bounded;
- CSRF, password verification, generic login refusal, rate limiting and session expiry are correct;
- inactive/unmapped users are denied;
- protected endpoints are deny-by-default;
- privilege removal is prompt;
- last-System-Administrator protection is race-safe;
- bootstrap and one-time migrated-admin recovery are operator-only, locked, audited and cannot overwrite a credential;
- sensitive logs/responses contain no secrets.

### Data integrity

- IAM migrations reproduce from an empty database;
- constraints match domain invariants;
- optimistic/serialized concurrency behavior is correct;
- access and identity mappings cannot be silently corrupted;
- no ordinary hard-delete path destroys required security history.

### Local credentials and migration

- existing user, role and Audit records survive the migration; former identity values are retained;
- old provider-backed sessions are rejected and no migrated password is inferred;
- an authorized administrator can initialize a legacy account password once;
- an inaccessible ACTIVE System Administrator can be recovered once by explicit operator command only when no administrator can sign in;
- password initialization and its Audit evidence commit or roll back together;
- disablement, suspension and reactivation remain fail closed.

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
- full required repository verification succeeds on the audit/fix pull request;
- dependency/security audit satisfies repository policy;
- no temporary bypass, focused test, debug code, or undocumented workaround remains;
- documentation and README/current limitations are reconciled with the local-auth reality.

The Final IAM Module Audit result must be one of (`docs/PLANNING.md` Section 9):

```text
IAM-FINAL ACCEPTED
```

or:

```text
IAM-FINAL FIXES REQUIRED
```

IAM is not complete until the audit is accepted and every blocking finding is resolved/re-audited.

---

## 18. IAM Completion Definition

IAM may be marked complete only when:

- every stage IAM-MP-00 through IAM-MP-15 is `COMPLETE`;
- every stage completion is backed by a reviewed, merged pull request with green CI (IAM-MP-00 to IAM-MP-02: by their independent audits), checkpoint `IAM-CP1` is accepted, and the deferred `IAM-CP2` scope is covered by `IAM-FINAL`;
- the parent IAM specification Definition of Done is satisfied;
- the dedicated Final IAM Module Audit returns `IAM-FINAL ACCEPTED`;
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

IAM-MP-00 to IAM-MP-15 are complete (Section 15); IAM-MP-03 through run `IAM-R01`, IAM-MP-04 through run `IAM-R02`, IAM-MP-05 and IAM-MP-06 through run `IAM-R03`, IAM-MP-07 through run `IAM-R04`, IAM-MP-08 and IAM-MP-09 through run `IAM-R05`, IAM-MP-10 through run `IAM-R06`, IAM-MP-11 through run `IAM-R07`, IAM-MP-12 through run `IAM-R08`, IAM-MP-13 through run `IAM-R08B`, IAM-MP-14 through run `IAM-R08C`, and IAM-MP-15 through runs `IAM-R09` and `IAM-R09B`, each accepted when its pull request is merged. Their plans, audit records and amendment records are history.

`IAM-CP1` is accepted (`docs/plans/iam/audits/IAM-CP1.md` Section 5.7). `IAM-CP2` is deferred into the Final IAM Module Audit (amendment record 2026-09-24). IAM-R10 merged in PR #23, and the audit of that baseline identified the migrated-administrator lockout fixed in merged PR #24. The current run is the focused [IAM-R12 cleanup](IAM_R12_PROVIDER_SESSION_CLEANUP_PLAN.md) of dormant provider session mechanics and the unused token-encryption startup requirement. Then run the independent Final IAM Module Audit (Section 17) on that merged baseline:

```text
/audit IAM-FINAL
```

It reads Section 17, including the revised `IAM_DEFINITION_OF_DONE_MAP.md`, ADR-0001, IAM-R11–R12 evidence and the deferred `IAM-CP2` scope.
Do **not** plan later runs in detail now.

---

## 20. Core Rule for IAM Delivery

> **One IAM Master Plan → one run at a time → a reviewed pull request → the owner's merge is the accepted baseline → deep audit at IAM-CP1 → Final IAM Module Audit (with the deferred IAM-CP2 scope).**

No stage is complete because it "looks finished."  
No run is planned from an unmerged baseline.  
No security invariant is deferred merely to preserve schedule.  
The repository, not conversational memory, carries IAM forward.
