# Vertex OS — Agent Instructions

## Scope

These instructions apply to the entire repository unless a more specific nested `AGENTS.md` applies to the files being changed.

This file is the repository-wide operating contract for coding agents and the router to the canonical documentation.

It does not restate product, architecture, module, engineering, security, or testing rules; those live in their canonical documents (see Documentation Routing).

---

## Mission

Vertex OS is the internal operating platform for Vertex Media.

V1 manages the operational lifecycle

`Lead → Opportunity → Proposal → Contract → Project → Brief → Tasks → Work → Review → Approval → Invoice → Payment → Completion`

and centralizes company operations without becoming a full ERP. Product scope and terminology: `docs/PRODUCT.md`.

---

## Source of Truth

Canonical documentation defines the intended architecture, policy, ownership, and product behavior.

Executable repository state (configuration, schemas, migrations, contracts, tests, code) defines what currently exists.

Neither category is always correct. If they disagree, the mismatch is a defect or a stale documentation/code condition: surface it and reconcile it deliberately. Do not resolve it silently by assuming one side wins, and do not "fix" it by editing whichever side is easier.

When deciding how to act, apply in order:

1. The explicit current task and its requirements.
2. The most specific applicable `AGENTS.md`.
3. Accepted Architecture Decision Records under `docs/adr/`.
4. The canonical documents under `docs/`, each for its own scope.
5. General README files and code comments.

If a conflict could affect architecture, data integrity, security, public contracts, or irreversible changes, identify it before making the conflicting change.

`docs/PLANS.md`, `docs/adr/`, and `docs/modules/*.md` are canonical only once they exist; do not assume or invent their content.

---

## Technical Baseline

The authoritative constraint list, including version baselines, is `docs/ARCHITECTURE.md` (Section 4). In brief:

* TypeScript; pnpm workspace managed with Nx; modular monolith.
* Backend: NestJS on Fastify; REST with OpenAPI; Zod for contracts/validation where appropriate.
* Persistence: PostgreSQL with Prisma (major-version baseline pinned in `docs/ARCHITECTURE.md`).
* Frontend: React with Vite, TanStack Router/Query/Table, Tailwind CSS, and the in-house Vertex UI design system. No shadcn.
* Authentication: Keycloak via OIDC Authorization Code Flow with PKCE, integrated by the backend as a confidential client acting as BFF. The browser holds only an opaque `Secure`/`HttpOnly` application session cookie, never identity-provider tokens. Keycloak owns credentials, MFA, and recovery; Vertex IAM owns application users, roles, permissions, and access state. Details: `docs/ARCHITECTURE.md` Section 22 and `docs/SECURITY.md`.
* Temporal only where durable, long-running orchestration is genuinely required. No message broker, cache, queue, or search infrastructure without a demonstrated need.

Development is local-first. Production deployment for the Vertex Media Contabo server is designed separately.

Do not introduce cloud infrastructure, S3-compatible or external object storage, Kubernetes, or microservices.

---

## Architecture Guardrails

* Preserve the modular monolith. Business domains (IAM, CRM, Services, Sales, Projects, Tasks, Briefs, Assets, Approvals, Content, Time, Finance, Collaboration, Notifications, Automation, Reporting, Audit) and their ownership are defined in `docs/MODULES.md`.
* Cross-module writes go through the owning module's public capability, never through another module's internals, repositories, Prisma models, or tables.
* Prefer explicit application interfaces; use events for independent reactions, not to hide dependencies.
* Business-critical rules belong on the backend. The frontend may enforce UX constraints but is never the sole enforcement of business invariants; do not move authoritative calculations into React components.
* Audit is accountability evidence, not a generic activity feed or event store. Outstanding balance is derived from authoritative financial records, never independently written.
* Complexity must earn abstraction: no speculative abstractions, layers, or infrastructure.

---

## V1 Scope Guardrails

Do not opportunistically expand V1.

Deferred capabilities (full accounting, payroll, HR, inventory, procurement, social and ads integrations, an external client portal, autonomous AI business logic, and others) are listed in `docs/PRODUCT.md` Section 13.2. A useful future feature is not a current requirement.

---

## Engineering Invariants

Detailed rules: `docs/ENGINEERING.md` and `docs/SECURITY.md`. Non-negotiable for every agent:

* Inspect the existing implementation, tests, configuration, and applicable documentation before changing behavior.
* Do not invent repository state, APIs, files, commands, packages, migrations, test results, or successful executions.
* Do not weaken authorization, validation, auditability, transactional integrity, or domain boundaries to make implementation easier.
* Never remove, disable, skip, or weaken a valid test merely to make the suite pass.
* Do not modify unrelated files, perform opportunistic refactors, or silently replace established libraries, frameworks, patterns, or infrastructure.
* Reuse an established repository capability before adding a dependency or abstraction; do not hand-edit generated artifacts.
* Never commit secrets, credentials, private keys, tokens, or production-sensitive configuration.
* Do not use real customer or employee data in tests, fixtures, examples, or seed data unless explicitly authorized.
* Money never relies on binary floating point; currency, rounding, dates, timestamps, time zones, and business-day boundaries are explicit domain concerns.
* Database changes preserve data integrity, prefer backward-compatible migration strategies, and are safe for the intended environment.
* Security-sensitive and financially significant state transitions remain attributable and auditable.
* Preserve existing user changes and unrelated working-tree changes.
* Do not commit, push, force-push, rebase shared history, or rewrite Git history unless the task explicitly requires it.

---

## Working Protocol

1. Understand the requested outcome and its boundaries.
2. Determine which repository instructions apply.
3. Inspect the relevant implementation, contracts, tests, configuration, and documentation.
4. Identify affected domain and architectural boundaries.
5. Plan proportionally to scope and risk; use the repository's execution-planning process when one exists.
6. Implement the smallest coherent change that fully solves the task, following established local patterns and fixing root causes.
7. Keep implementation, contracts, tests, schemas, and documentation synchronized.
8. Validate the affected behavior.
9. Report what changed and what was actually verified.

Do not leave known partially migrated behavior behind unless the task explicitly requires staged delivery.

---

## Verification

Policy: `docs/TESTING.md`.

* Never claim a check passed unless it was actually executed successfully.
* Use repository-defined scripts and tooling; do not invent verification commands. The root commands are defined in `package.json` and described in `README.md`:
  * `pnpm verify` — fast gate: format check, lint (including Nx module boundaries), typecheck, unit/API/frontend tests, builds.
  * `pnpm verify:full` — `pnpm verify` plus Prisma validate/generate, Testcontainers PostgreSQL integration tests and the Playwright smoke test (Docker required).
  * `pnpm deps:audit` — dependency vulnerability audit; reviewed exceptions live in `pnpm-workspace.yaml`.
  * Narrower checks: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm test:integration`, `pnpm test:e2e`, or `pnpm nx run <project>:<target>`.
* In non-interactive shells, run Nx with `NX_DAEMON=false` when capturing or piping its output; on Windows the daemon it spawns otherwise keeps the output pipe open.
* Run the narrowest relevant checks while implementing, then the required checks for the affected surface before completion.
* If a required check cannot be run, state explicitly what was not verified and why.

A change is complete only when the requested behavior is implemented, relevant tests and checks pass, contracts, schemas, and documentation are synchronized, no unrelated changes were introduced, and remaining risks are disclosed.

---

## Documentation Routing

Read only the documentation relevant to the task.

* `docs/PRODUCT.md` — product purpose, users, workflows, V1 scope and exclusions, product invariants, terminology.
* `docs/ARCHITECTURE.md` — system structure, technical constraints and version baselines, dependency rules, authentication topology, transactions, audit vs. activity.
* `docs/MODULES.md` — module ownership, public capabilities, cross-module rules, open ownership questions.
* `docs/ENGINEERING.md` — implementation rules, transactions, validation, concurrency, idempotency, Definition of Done, forbidden patterns.
* `docs/SECURITY.md` — authentication and session security, authorization policy, credentials/MFA/recovery, web security, secrets, logging and alerting.
* `docs/TESTING.md` — verification policy, test layers, migration/concurrency/idempotency/security testing, CI gates.
* `docs/modules/*.md` — module-specific behavior, created when a module approaches implementation.
* `docs/PLANS.md` — execution-plan format for substantial work (canonical once created).
* `docs/adr/` — accepted architectural decisions and their rationale (canonical once accepted records exist).
* `README.md` — local setup, commands, and URLs that currently work.

Do not copy sections of these documents into `AGENTS.md`.

---

## Changes Requiring Explicit Approval

Do not independently make a change that materially alters any of the following unless it is explicitly required by the current task or supported by an accepted architectural decision:

* Core system architecture.
* Modular-monolith strategy.
* Domain ownership or domain boundaries.
* Primary programming language.
* Backend or frontend framework.
* Primary database.
* ORM or its major-version baseline.
* Authentication architecture.
* Authorization model.
* Public API compatibility.
* Financial data semantics.
* Destructive database migrations.
* New infrastructure services.
* Deployment architecture.
* Introduction of microservices.
* Introduction of a major production dependency with architectural impact.
* Moving intentionally deferred functionality into V1.

When such a change appears necessary, document:

* the problem,
* the proposed change,
* alternatives considered,
* consequences,
* migration impact,
* and validation strategy.

Do not disguise an architectural decision as a routine refactor.
