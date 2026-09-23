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
**Next step:** fix run `IAM-R03F` — the `IAM-CP1` deep audit returned `IAM-CP1 FIXES REQUIRED` (record `audits/IAM-CP1.md`); start it with `/stage IAM-R03F`, then re-check with `/audit IAM-CP1`. `IAM-R04` (IAM-MP-07) waits for `IAM-CP1 ACCEPTED`  
**Execution model:** `docs/PLANNING.md` — one stage run per session ending in a reviewed pull request; the owner's merge is the accepted baseline; deep audits at checkpoints `IAM-CP1` and `IAM-CP2` and the Final IAM Module Audit (Section 8)

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
deep audit at IAM-CP1 / IAM-CP2
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
| `IAM-R06` | IAM-MP-10 | A | security; data and concurrency; architecture and boundaries | **`IAM-CP2` deep audit** — authorization and administration core (MP-07 to MP-10) |
| `IAM-R07` | IAM-MP-11 | A | security; architecture and boundaries; tests and verification | — |
| `IAM-R08` | IAM-MP-12, IAM-MP-13, IAM-MP-14 | B | architecture and boundaries; tests and verification | — |
| `IAM-R09` | IAM-MP-15 | A | security; data and concurrency; tests and verification | **`IAM-FINAL`** Final IAM Module Audit (Section 17) |

Grouping rules behind the table:

- Runs group stages that share one risk surface: sessions with the OIDC flow that creates them (R03), the two privilege-administration cores (R05), and the three frontend stages that consume one accepted HTTP surface (R08).
- IAM-MP-04 and IAM-MP-10 stay alone: identity linking and user lifecycle carry the highest failure cost and the most concurrency.
- `IAM-R08` is Tier B because the backend stays authoritative for every rule it presents. Its planner splits it if the frontend diff would not be reviewable in one pass.
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
IAM-CP2    Deep audit: authorization and administration core
      ↓
IAM-MP-11  IAM/Auth HTTP Administration Surface & OpenAPI                 [R07]
      ↓
IAM-MP-12  Frontend Authentication & Session Experience                   [R08]
IAM-MP-13  Frontend User, Access & Provisioning Administration            [R08]
IAM-MP-14  Frontend Departments, Roles & Permissions Administration       [R08]
      ↓
IAM-MP-15  End-to-End Security, Concurrency & Operational Hardening       [R09]
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

**Status:** COMPLETE (run `IAM-R03`, plan `IAM_R03_SESSIONS_AND_OIDC_PLAN.md`)  
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

**Status:** COMPLETE (run `IAM-R03`, plan `IAM_R03_SESSIONS_AND_OIDC_PLAN.md`)  
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

### Carried forward from the IAM-MP-02 plan (open items of `IAM_02_REFERENCE_DATA_AND_AUDIT_FOUNDATION_PLAN.md` Section 40)

- **Whether `DEPRECATED` permissions are effective** for custom roles (decided together with IAM-MP-09's mapping rules).

### Carried forward from run IAM-R03 (`IAM_R03_SESSIONS_AND_OIDC_PLAN.md`)

- **Build on the session boundary, do not duplicate it.** `requireSession` (`apps/api/src/auth/request-session.ts`) resolves the cookie, the live session and the ACTIVE user on every request (request-local memoization only) and revokes a session whose user is no longer ACTIVE. The global `CsrfGuard` already rejects every unsafe request without a valid session (`401`) or CSRF token (`403`), with `@CsrfExempt()` only on back-channel logout. This stage adds the protected-by-default rule for safe methods, the explicit public-route marker (health, login, callback, back-channel logout) and the authorization context on top.
- **Bound capabilities only.** The authentication area reaches IAM through `apps/api/src/iam/sign-in.ts` (bound functions); lint keeps adapters in `apps/api/src/auth/auth-runtime.ts`. The authorization-context composition follows the same pattern.

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

### Carried forward from the IAM-MP-02 plan (open items of `IAM_02_REFERENCE_DATA_AND_AUDIT_FOUNDATION_PLAN.md` Section 40)

- **`DEPRECATED`/`RETIRED` mappings:** whether custom roles may keep or receive mappings to `DEPRECATED` or `RETIRED` codes.
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

### Carried forward from run IAM-R02 (`IAM_R02_IDENTITY_RECONCILIATION_PLAN.md`)

- **Outcome mapping:** map the provisioning outcomes to spec Section 27 once: `identity-conflict` → `IAM_IDENTITY_CONFLICT`, `provider-unavailable`/`provider-rejected` → `IDENTITY_PROVIDER_UNAVAILABLE`, `sync-incomplete` → `IAM_IDENTITY_SYNC_INCOMPLETE`, `not-invited` → `IAM_INVITATION_NOT_APPLICABLE`, `not-found` → `IAM_USER_NOT_FOUND`. Decide the response for `no-action-required` (resend to a user whose invitation is complete) and `superseded`.

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

### Carried forward from run IAM-R03 (`IAM_R03_SESSIONS_AND_OIDC_PLAN.md`)

- **Contracts to consume:** `/api/auth/login` (top-level navigation); the callback returns to `/` or `/?authError=` with `AUTH_ACCESS_DENIED`, `AUTH_LOGIN_FAILED` or `IDENTITY_PROVIDER_UNAVAILABLE`; `GET /api/auth/session`; `GET /api/auth/csrf` (hold the token in memory, send `X-CSRF-Token` on every unsafe request); `POST /api/auth/logout` returns `logoutUrl`, which the browser opens.
- **Real-browser cookie behavior:** prove that Chromium, Firefox and WebKit accept the `__Host-` cookies on `http://127.0.0.1` locally (only a fetch-based browser was used so far).
- **Session rotation across sites (R03 review S-02):** the rotation of an existing session at the callback reads the `SameSite=Strict` session cookie on a navigation from Keycloak. It works while Keycloak and the web app share a site (locally, and a production subdomain of the same registrable domain); verify it for the deployed topology, or rotate differently.

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

### Carried forward from run IAM-R03 (`IAM_R03_SESSIONS_AND_OIDC_PLAN.md`)

- **Rate limiting** of the session-establishment and logout endpoints (SECURITY Section 37); every `GET /api/auth/login` stores a login attempt (R03 review S-05).
- **Retention:** expired and revoked `auth_session` rows are kept; decide their retention and purge. ID tokens of expired sessions are discarded when the session is next seen and by a bounded sweep on each sign-in; a scheduled purge would remove the dependency on sign-in activity.
- **Back-channel logout before session creation (R03 review D-3):** a logout token for a Keycloak session that arrives between the code exchange and the session insert revokes nothing, and the new session lives until its deadline. Consider remembering recently logged-out `sid` values briefly, or re-checking the Keycloak session.

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
at IAM-CP1 / IAM-CP2 / final: deep audit in a separate session
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
| IAM-RISK-16 | Main-branch governance relies only on convention | security-sensitive changes may bypass intended review discipline | every run lands through a reviewed pull request with green CI; deep audits at IAM-CP1, IAM-CP2 and the Final IAM Module Audit; repository protection policy may be hardened separately from IAM scope |
| IAM-RISK-17 | Lighter per-run review misses a defect a full audit would catch | a security defect reaches `main` between checkpoints | three fresh-context reviewers on every Tier A run; checkpoints placed directly after the authentication and privilege clusters; later runs cannot start before the checkpoint is accepted |

---

## 15. Stage Status Ledger

This Master Plan is `ACTIVE`. IAM-MP-00 to IAM-MP-02 are `COMPLETE` under the previous method: each was independently audited (`IAM-00`, `IAM-01`, `IAM-02 ACCEPTED`, no blocking findings) and accepted by the owner on 2026-09-23.

Run `IAM-R01` delivered IAM-MP-03 (plan `IAM_R01_KEYCLOAK_ENVIRONMENT_PLAN.md`). It is `COMPLETE` once its pull request is merged. It closed A-02, A2-02 and A2-03. A-04 was not triggered, because no Keycloak package was installed, and passes to IAM-MP-04 and IAM-MP-06. A2-01 passes on under the condition stated in the IAM-MP-03 section.

Run `IAM-R02` delivered IAM-MP-04 (plan `IAM_R02_IDENTITY_RECONCILIATION_PLAN.md`). It is `COMPLETE` once its pull request is merged. It closed the Keycloak Admin error item, typed provisioner configuration (R01 D-11; a separate `loadIdentityProvisioningConfig` beside `AppConfig`, so the HTTP runtime needs no Keycloak value before a stage consumes it there, R02 D-13), email delivery (Mailpit, owner decision OD-1), self-service recovery (R01 S-01), the provisioner residual (R01 D-14, operation set pinned by a test) and the harness location (R01 AB-5). A-04 was again not triggered (no Keycloak package; the adapter uses `fetch`) and stays with IAM-MP-06. A2-01 passes on unchanged. Its new carried-forward items are attached to IAM-MP-05, IAM-MP-06, IAM-MP-10 and IAM-MP-11.

Run `IAM-R03` delivered IAM-MP-05 and IAM-MP-06 (plan `IAM_R03_SESSIONS_AND_OIDC_PLAN.md`). It is `COMPLETE` once its pull request is merged. It closed A2-01 and the API statement-timeout item (R03 D-20, D-21), A-04 (OIDC libraries banned in the domain core and in web code, subpaths included), the request-URL logging item, typed OIDC configuration, audience binding, back-channel reachability (Testcontainers host exposure on Linux CI; locally only a container-to-loopback probe on Docker Desktop, the end-to-end Compose probe was not run, `IAM-CP1` CP1-17), MFA in browser tests (TOTP through the real invitation flow), security events (Audit records), the SSO limits (application defaults equal the realm's) and the recovery signal (Keycloak's back-channel logout, R03 D-15; `IAM-CP1` CP1-01 found that it reaches Vertex only while the Keycloak SSO session lives, about 30 minutes after sign-in, and fix run `IAM-R03F` owns it). Cookie scoping was decided by R03 D-06: spec Section 14 fixes `Path=/` and the host prefix, so the cookies also reach a Keycloak on the same host locally; production must give Keycloak its own host (listed below). Its new carried-forward items are attached to IAM-MP-07, IAM-MP-10, IAM-MP-12 and IAM-MP-15.

The `IAM-CP1` deep audit of `48ff7cc` (record `audits/IAM-CP1.md`) returned `IAM-CP1 FIXES REQUIRED`. It found one blocking finding, CP1-01: logout, recovery and disablement on the Keycloak side stop reaching the Vertex session once the Keycloak SSO session idles out (SECURITY Section 11). Fix run `IAM-R03F` resolves it together with the non-blocking items the record assigns to it; `/audit IAM-CP1` then re-checks CP1-01. The record's other non-blocking findings name their owner stages (IAM-MP-07, IAM-MP-10, IAM-MP-11, IAM-MP-12, IAM-MP-15) and are attached to those stages when the re-check accepts `IAM-CP1`. `IAM-R04` (IAM-MP-07) starts only after `IAM-CP1 ACCEPTED`.

Open items that no IAM stage owns (IAM-02 plan Section 40), each resolved when its trigger occurs:

- database-level Audit immutability, runtime/migration role separation and schema per domain (ADR-0008): production deployment design or a third domain adapter, whichever comes first;
- `docs/modules/audit.md`: when MOD-AUDIT is fully specified; it adopts or deliberately migrates the foundation contract (IAM-02 D-05). Until then `docs/modules/iam.md` Sections 34–35 specify the implemented foundation;
- a shared test-support package: decided when a fourth copy of the PostgreSQL test harness would be needed;
- production identity provider (run IAM-R01): production deployment design. It covers:
  - the realm's production form (hostname, TLS, database, no `start-dev`);
  - never importing `vertex-realm.json` without every placeholder set, because Keycloak imports an unset `${NAME}` literally (verified on 26.7.4);
  - Argon2id benchmarking on production hardware;
  - WebAuthn/passkeys and a compromised-password list (SHOULD items);
  - event retention;
  - narrowing `vertex-provisioner` with fine-grained admin permissions (also reviewed by the Final IAM Module Audit);
  - production SMTP (run IAM-R02): the realm's `KEYCLOAK_SMTP_*` values, TLS (`starttls`/`ssl`) and trust, and a real sender domain. Mailpit is local and test only.
  - Keycloak on its own host (run IAM-R03 D-06): the `__Host-vertex-*` cookies use `Path=/`, so a Keycloak on the web app's host would receive them. Keycloak must also reach the API's back-channel logout URL; locally only Docker Desktop forwards `host.docker.internal` to a loopback API.

| Stage | Run | Status | Required before the run starts |
|---|---|---|---|
| IAM-MP-00 Architecture & Domain Boundary Foundation | — | COMPLETE | IAM spec execution gate (closed) |
| IAM-MP-01 IAM Persistence & First Migration | — | COMPLETE | MP-00 COMPLETE (satisfied) |
| IAM-MP-02 Reference Data & Minimal Audit Foundation | — | COMPLETE | MP-01 COMPLETE (satisfied) |
| IAM-MP-03 Keycloak Environment & Realm Contract | R01 | COMPLETE | MP-02 COMPLETE (satisfied) |
| IAM-MP-04 Identity Reconciliation & Invitations | R02 | COMPLETE | R01 merged (satisfied) |
| IAM-MP-05 Application Session Foundation | R03 | COMPLETE | R02 merged (satisfied) |
| IAM-MP-06 OIDC / Activation / CSRF / Logout | R03 | COMPLETE | R02 merged (satisfied) |
| `IAM-R03F` Fix run for the `IAM-CP1` blocking finding | R03F | READY | `IAM-CP1` record merged |
| `IAM-CP1` Deep audit: authentication | — | READY | R03 merged (audited: FIXES REQUIRED); re-check after R03F merged |
| IAM-MP-07 Default Protection & Authorization Context | R04 | PLANNED | `IAM-CP1 ACCEPTED` |
| IAM-MP-08 Department & Membership Core | R05 | PLANNED | R04 merged |
| IAM-MP-09 Role/Permission & Last-Admin Core | R05 | PLANNED | R04 merged |
| IAM-MP-10 User Lifecycle & Bootstrap Core | R06 | PLANNED | R05 merged |
| `IAM-CP2` Deep audit: authorization and administration core | — | PLANNED | R06 merged |
| IAM-MP-11 HTTP Administration Surface | R07 | PLANNED | `IAM-CP2 ACCEPTED` |
| IAM-MP-12 Frontend Authentication & Session UX | R08 | PLANNED | R07 merged |
| IAM-MP-13 Frontend User & Access Admin | R08 | PLANNED | R07 merged |
| IAM-MP-14 Frontend Department/Role/Permission Admin | R08 | PLANNED | R07 merged |
| IAM-MP-15 E2E & Hardening | R09 | PLANNED | R08 merged |
| `IAM-FINAL` Final IAM Module Audit | — | PLANNED | R09 merged |

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

The records below were written under the previous method and are kept as history. Under the current method, a record is added only when the roadmap changes.

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

After the `IAM-R09` pull request (IAM-MP-15) is merged, perform a dedicated Final Module Audit with `/audit IAM-FINAL`.

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
- every stage completion is backed by a reviewed, merged pull request with green CI (IAM-MP-00 to IAM-MP-02: by their independent audits), and checkpoints `IAM-CP1` and `IAM-CP2` are accepted;
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

IAM-MP-00 to IAM-MP-06 are complete (Section 15); IAM-MP-03 through run `IAM-R01`, IAM-MP-04 through run `IAM-R02`, and IAM-MP-05 and IAM-MP-06 through run `IAM-R03`, accepted when its pull request is merged. Their plans, audit records and amendment records are history.

The `IAM-CP1` deep audit returned `IAM-CP1 FIXES REQUIRED` (`docs/plans/iam/audits/IAM-CP1.md`). The next step is fix run `IAM-R03F`. Start it in a new Claude Code session after the audit's pull request is merged:

```text
/stage IAM-R03F
```

Its plan is built from the audit record. After it merges, a new session re-checks the blocking finding with `/audit IAM-CP1`. Run `IAM-R04` (IAM-MP-07) starts only after `IAM-CP1 ACCEPTED`.

Do **not** plan later runs in detail now.

---

## 20. Core Rule for IAM Delivery

> **One IAM Master Plan → one run at a time → a reviewed pull request → the owner's merge is the accepted baseline → deep audits at IAM-CP1 and IAM-CP2 → Final IAM Module Audit.**

No stage is complete because it "looks finished."  
No run is planned from an unmerged baseline.  
No security invariant is deferred merely to preserve schedule.  
The repository, not conversational memory, carries IAM forward.
