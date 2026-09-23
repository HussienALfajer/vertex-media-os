# Vertex OS — IAM-01 Persistence Model & First Business Migration Plan

**Repository path:** `docs/plans/iam/IAM_01_PERSISTENCE_FOUNDATION_PLAN.md`  
**Master Plan item:** `IAM-MP-01` — IAM Persistence Model & First Business Migration  
**Status:** READY — written 2026-09-23 from the accepted IAM-00 baseline; not yet implemented  
**Plan type:** Living execution plan  
**Prepared:** 2026-09-23  
**Planning baseline:** `main` at `a1e087f9c467028cedc34d8066efcaa14bc09d37`, clean working tree  
**Parent specification:** `docs/modules/iam.md` (Accepted V1 Implementation Specification), chiefly Sections 9–11, 28–30, 46.1, 46.3 and 49  
**Parent Master Plan:** `docs/plans/iam/IAM_MASTER_PLAN.md`, stage IAM-MP-01  
**Planning authority:** `docs/PLANNING.md`  
**Decision authority:** On 2026-09-23 the owner delegated the resolution of the carried-forward audit items A-03, A-06 and A-08, and every design decision in this plan, to the planning agent. The decisions are locked in Section 11. An executing agent does not reopen them except through a stop condition (Section 32).  
**Execution target:** One Claude Code conversation operating from the repository root  
**Required follow-up:** Independent audit (Section 40), then the IAM-MP-02 executable plan

> IAM-01 gives IAM its authoritative PostgreSQL model and the repository its first business migration. It proves the structural invariants against real PostgreSQL and establishes, with tooling rather than convention, how a domain owns persistence without Prisma entering its core. It is deliberately **not** reference-data synchronization, Audit, Keycloak, sessions, lifecycle behavior, administration, API or UI work. The IAM tables exist at the end of this stage, but no IAM behavior is reachable from the running application.

---

## 1. Purpose / Big Picture

IAM-MP-00 created `@vertex-os/iam` (`domains/iam`) as a closed, behavior-free domain core with enforceable dependency boundaries. The Prisma schema has no models, and no migration exists.

IAM-MP-01 adds the persistence foundation that every later IAM stage builds on:

1. the seven IAM tables and their closed enums;
2. the database constraints that protect IAM's structural invariants even when application code is wrong;
3. the first production-quality migration, reproducible from an empty database and atomic on failure;
4. an IAM-owned persistence adapter project that keeps Prisma out of the IAM core, with the boundary enforced by Nx/ESLint and guarded by a durable regression check;
5. the smallest repository contract with an immediate, specified purpose: atomic user creation, lookup by ID, and one version-checked update that proves optimistic concurrency;
6. real-PostgreSQL evidence for all of the above.

This stage sets precedent. Later domains will copy what IAM-01 does with tables, constraint names, migrations and adapter boundaries (Master Plan risk IAM-R02). Correctness and explicitness therefore matter more than speed.

---

## 2. Position in the IAM Program

```text
IAM-MP-00  Architecture & Domain Boundary Foundation     COMPLETE (accepted 2026-09-23)
IAM-MP-01  IAM Persistence Model & First Migration       ← this plan
IAM-MP-02  Permission/System-Role Reference Data & Minimal Audit Foundation
IAM-MP-03  Keycloak Environment, Realm Contract & Integration Harness
...
```

The specification's broad phase IAM-1 is split across two stages: IAM-MP-01 (this plan: model, migration, repositories, integration tests) and IAM-MP-02 (permission catalog and system-role synchronization, minimal Audit). This plan MUST NOT pull IAM-MP-02 or later work forward.

Rolling-wave rule: implement this plan, verify it, audit it independently, accept the baseline, and only then write the IAM-MP-02 plan.

---

## 3. Execution Contract

This file is a living execution plan. During execution the implementing agent MUST keep these sections current: `Progress` (Section 37), `Surprises & Discoveries` (Section 36), `Decision Log` (Section 35) and `Outcomes & Retrospective` (Section 38).

The agent MUST:

- execute from the repository root and inspect the live repository before changing it;
- follow repository conventions instead of generic templates;
- record observed evidence, never intended results;
- stop on the conditions in Section 32 instead of improvising around them.

The agent MUST NOT commit, push, merge, change GitHub settings, or touch remote infrastructure unless the user separately authorizes it for the execution conversation.

The agent MUST NOT start, stop, reset or modify any Docker container, volume or compose project other than:

- ephemeral Testcontainers containers started by the test suites;
- the repository's own compose project `vertexos`, and only through `pnpm infra:up` / `pnpm infra:down`.

Other containers on the development host belong to unrelated projects.

Routine decisions that this plan already bounds need no further confirmation. Architecture-significant contradictions do.

**Reference convention:**

- `spec Section N` means `docs/modules/iam.md`.
- References to other documents name the document.
- An unqualified `Section N`, `D-NN`, `P-NN`, `I-N`, `M-N` or `R-NN` refers to this plan.

---

## 4. Mandatory Read Order Before Any Modification

1. `AGENTS.md`, `CLAUDE.md`
2. `docs/PLANNING.md`
3. `docs/modules/iam.md`: Sections 1–11, 20–23, 28–31, 44, 46, 48, 49, 55–59
4. `docs/plans/iam/IAM_MASTER_PLAN.md`: Sections 7, 8, 10 (IAM-MP-01, IAM-MP-02), 14 and 15
5. `docs/plans/iam/IAM_00_ARCHITECTURE_FOUNDATION_PLAN.md`: Sections 15–16, 44 and 49A (audit findings A-01…A-08)
6. `docs/ARCHITECTURE.md`: Sections 4 (AC-05, AC-06), 9–13, 28, 35, 38 and 39
7. `docs/ENGINEERING.md`: Sections 4.3, 6–8, 13–16, 20, 21 and 32
8. `docs/TESTING.md`: Sections 12–17, 33, 38, 39 and 42–45
9. `docs/SECURITY.md`: Section 26
10. this plan
11. root `package.json`, `pnpm-workspace.yaml`, `nx.json`, `tsconfig.base.json`, `tsconfig.json`, `eslint.config.mjs`
12. `packages/database/**` (every tracked file; there are few)
13. `domains/iam/**`
14. `apps/api/src/database/database.module.ts`, `apps/api/src/config/app-config.ts`, `apps/api/eslint.config.mjs`
15. `.github/workflows/ci.yml`, `README.md`

---

## 5. Dependencies and Entry Criteria

| Entry criterion (Master Plan IAM-MP-01) | State at planning | Evidence |
|---|---|---|
| IAM-MP-00 COMPLETE; domain boundary accepted | Satisfied | Master Plan Section 15; IAM-00 plan Section 49A (`IAM-00 ACCEPTED`, owner acceptance 2026-09-23) |
| Persistence ownership is unambiguous | Satisfied by this plan | `docs/MODULES.md` MOD-IAM owns the seven concepts; D-01/D-02 fix the adapter project and entry points (A-06) |
| Migration conventions of the existing database infrastructure are understood | Satisfied by this plan | Section 6.3 (planning-time evidence P-02…P-10); D-08…D-10 |
| Phase 0 and Design System baselines remain accepted | Satisfied | `main` at `a1e087f`; A-01 fixed in `ea8b16c` |

Carried forward to this stage from the IAM-00 audit (Master Plan IAM-MP-01):

| Item | Resolution in this plan |
|---|---|
| A-06 — which project owns IAM's private repository adapters, with explicit tags and constraints; do not loosen the domain-core rule | D-01, D-02, D-03 |
| A-03 — ban `pg` in the domain core once the adapter boundary is defined | D-03 |
| A-08 — a durable, repository-run check of the new boundary rules | D-04 |

Items carried to other stages and **not** handled here: A-02 (raw-environment lint bypasses, IAM-MP-03, optional), A-04 (Keycloak/OIDC bans, IAM-MP-03/06), A-05 (design-system lint configuration, outside IAM).

---

## 6. Current Repository Baseline

### 6.1 Relevant facts at `a1e087f`

- **Workspace.** pnpm 12.5.1 workspace with globs `apps/*`, `domains/*` and `packages/*`. Nx 23.2.1, with the `@nx/js/typescript`, `@nx/eslint`, `@nx/vite` and `@nx/playwright` plugins. Root `tsconfig.base.json` is strict, uses `nodenext`, and sets `customConditions: ["@vertex-os/source"]`. `nx sync` manages project references.
- **Projects and tags.**

  | Project | Path | Tags |
  |---|---|---|
  | `@vertex-os/api` | `apps/api` | `type:app`, `scope:backend` |
  | `@vertex-os/web` | `apps/web` | `type:app`, `scope:web` |
  | `@vertex-os/web-e2e` | `apps/web-e2e` | `type:e2e`, `scope:web` |
  | `@vertex-os/database` | `packages/database` | `type:lib`, `scope:backend`, `layer:infrastructure` |
  | `@vertex-os/ui` | `packages/ui` | `type:lib`, `scope:web`, `layer:ui` |
  | `@vertex-os/iam` | `domains/iam` | `type:lib`, `scope:backend`, `layer:domain`, `domain:iam` |

- **Boundary rules** (`eslint.config.mjs`):
  - `layer:domain` may depend only on `layer:domain`/`layer:shared` and bans `@nestjs/*`, `@prisma/*`, `prisma`, `fastify`, `@fastify/*`, `react`, `react-dom`, `@tanstack/*`, `vite`, `@vitejs/*`, `@keycloak/*`, `keycloak-*`. It does **not** ban `pg` (A-03).
  - `layer:infrastructure` may depend only on `layer:infrastructure`.
  - `no-restricted-imports` rejects `@vertex-os/iam/*` and `**/domains/iam/src/**`.
  - `no-restricted-syntax` rejects `process.env` in production `src`; only `apps/api/src/main.ts` is exempt.
- **IAM core.** `domains/iam` has a closed root export (`src/index.ts` exports nothing), `types: []`, and no `test` target or test configuration.
- **Database package.** `packages/database` has:
  - the Prisma 7.10.0 CLI, `@prisma/client` 7.10.0 and `@prisma/adapter-pg` 7.10.0;
  - a single `prisma/schema.prisma` with no models; generator `prisma-client`, output `../src/generated/prisma` (ignored by Git, ESLint and Prettier);
  - `prisma.config.ts` with schema `prisma/schema.prisma`, migrations path `prisma/migrations` (no directory yet), and an optional datasource from `DATABASE_URL` after loading the root `.env`;
  - a root export of `createDatabaseClient`, `DatabaseClient` (`ping`/`disconnect` only; Prisma is hidden) and `DatabaseUnavailableError`;
  - Nx targets `prisma-validate`, `prisma-generate` and `test:integration`; typecheck, build and lint depend on `prisma-generate`;
  - one Testcontainers suite (`postgres:18.6-alpine`, the same image as `infra/compose.yaml`).
- **API composition.** `apps/api` creates one process-wide `DatabaseClient`, with statement timeout 1 s and connect timeout 2 s sized for the readiness ping. The code comment says to revisit these values "when a module adds real queries".
- **Commands.** `db:validate` and `db:generate` exist. There is no command that applies migrations. `verify` = format check → lint → typecheck → test → build. `verify:full` adds Prisma validate/generate, integration tests and E2E. CI runs `verify:full` and `deps:audit` on `ubuntu-24.04`.
- **Ignore files.** `docs/` is in `.prettierignore`, so documentation-only changes produce Nx cache hits locally; CI runs the tasks fresh.

### 6.2 What does not exist yet (and must not be assumed)

- IAM models, enums, tables or migrations.
- Seed or reference data.
- Any IAM repository or adapter.
- Any consumer of IAM in `apps/api`.
- Audit or session tables.
- Keycloak.
- A shared pagination/filtering convention.

### 6.3 Planning-time evidence

All probes ran against Prisma CLI 7.10.0 (the repository's own) and a throwaway `postgres:18.6-alpine` container named `iam01-plan-probe-pg` on a loopback port. The container was removed afterwards, and no repository file was changed. The executing agent re-verifies what it relies on, but may treat these as the reasons behind the locked decisions.

| ID | Observation | Consequence |
|---|---|---|
| P-01 | Baseline `a1e087f`; working tree clean; the schema has no models; there is no `prisma/migrations` directory; the IAM root exports nothing. | The plan starts from an empty persistence state. |
| P-02 | Prisma 7.10's known preview features are `fullTextSearchPostgres`, `nativeDistinct`, `partialIndexes`, `postgresqlExtensions`, `relationJoins`, `schemaEngineDriverAdapters`, `shardKeys`, `strictUndefinedChecks`, `typedSql` and `views`. A partial unique index is expressible only under the `partialIndexes` preview. Prisma has no CHECK-constraint syntax at all. | D-08 |
| P-03 | A database containing hand-written CHECK constraints and a partial unique index, compared by `prisma migrate diff --from-config-datasource --to-schema <schema>` with a schema that does not model them, produced an **empty** diff. The same comparison with the preview modeling the partial index was also empty. | Hand-written constraints are neither reported as drift nor dropped by later diffs. Drift checks cannot detect their removal, so behavioral tests must (D-08). |
| P-04 | A multi-file schema folder validates and diffs. `migrate diff --from-empty` renders `@@map`/`@map` names, explicit constraint names, `ON DELETE RESTRICT ON UPDATE RESTRICT`, `DEFAULT gen_random_uuid()` and `TIMESTAMPTZ(3)` as intended. Its output **starts with `CREATE SCHEMA IF NOT EXISTS "public";`**. A field with `@updatedAt` alone gets no database default. | D-05, D-06, D-07, D-09 |
| P-05 | `prisma migrate deploy` does **not** apply a migration atomically. A script failing on its third statement left the objects of statements one and two in place and recorded a failed migration (P3018); subsequent deploys refused with P3009. The same script wrapped in `BEGIN;` … `COMMIT;` left **no** objects behind, only the failed `_prisma_migrations` row. A wrapped script that succeeds applies normally, and re-running deploy reports "No pending migrations". The cost of the wrapper: Prisma reports `current transaction is aborted…` instead of the root cause, and the row's `logs` stays empty. Deploying onto a non-empty schema without migration history is refused with P3005. | D-09 and the recovery procedure in Section 16.5 |
| P-06 | `CREATE SCHEMA IF NOT EXISTS "public";` executed by a role that holds `USAGE, CREATE` on schema `public` but no database-level `CREATE` fails with `permission denied for database`, even though `public` exists. | D-09 removes the statement, so migrations do not need database-level privileges (`docs/SECURITY.md` Section 26). |
| P-07 | `prisma migrate diff … --exit-code` returns 0 for identical sources and 2 for a difference. | D-10: a deterministic schema/migration drift gate. |
| P-08 | ESLint run via stdin with a virtual `--stdin-filename` inside a project directory applies that project's configuration and attributes the file to the right Nx project. Nx maps an **exported** package subpath (`@vertex-os/database/package.json`) to its project and applies tag constraints. `import 'pg'` inside `domains/iam/src` passes lint today (A-03 confirmed); `process.env` there is rejected. | D-02, D-03, D-04 |
| P-09 | With Node 24.21.0, `process.loadEnvFile()` does not override a variable that is already set. | An explicit `DATABASE_URL` passed to a Prisma CLI child process wins over the developer's root `.env` (used by D-10's test harness). The harness still asserts its target (Section 22). |
| P-10 | The Prisma schema engine binary exists locally under `node_modules/.pnpm/@prisma+engines@7.10.0/…`, although `pnpm-workspace.yaml` denies `@prisma/engines`' install script. How a fresh CI runner obtains it for `migrate deploy` was **not** verified. | Risk R-07; verified by the first CI run of the implementation. |

---

## 7. Objective

At the end of IAM-01:

- a clean PostgreSQL database migrates reproducibly to the IAM schema through the repository's own command;
- IAM's structural invariants fail safely at the database boundary with stable, named constraints;
- a failed migration leaves no partial schema;
- IAM core contains the domain types and the private persistence contract, with no Prisma, `pg` or framework dependency;
- `@vertex-os/iam-persistence` implements that contract with Prisma behind the database package, and nothing outside IAM can reach either the contract or the Prisma surface;
- every new boundary rule is proven by a check that runs in `pnpm verify`;
- no seed data, no reference data, no user and no IAM behavior reachable from the API exist.

---

## 8. In Scope

1. Domain value types, closed state sets and validation rules for the IAM persistence model (Section 17).
2. The IAM private persistence contract: `ApplicationUserRepository` and its result types (Section 17.4).
3. A unit-test target for `@vertex-os/iam`, plus the domain unit tests (Section 27.1).
4. Prisma schema layout change to a schema folder, with an IAM-owned model file (D-05).
5. Seven IAM models and seven enums (Section 15).
6. The first migration: generated DDL plus reviewed hand-written constraints, wrapped atomically (Section 16).
7. `packages/database` additions: the restricted `@vertex-os/database/persistence` entry, the migrate target, the root `db:migrate` command, and migration tests (Section 19).
8. The new `@vertex-os/iam-persistence` project and its `ApplicationUserRepository` adapter (Section 18).
9. Boundary configuration: tags, constraints, restricted imports and the A-03 ban (D-03).
10. The durable boundary regression check `pnpm lint:boundaries`, wired into `pnpm verify` (D-04).
11. PostgreSQL integration tests for constraints, repository behavior, concurrency and migration (Section 27).
12. Synchronized documentation: README, the ESLint tag header, the ENGINEERING migration rule, the Master Plan ledger, and this plan (Section 20.4).

---

## 9. Out of Scope

| Excluded here | Belongs to |
|---|---|
| Permission catalog, the `system-administrator` role and their synchronization, and any reference data | IAM-MP-02 |
| Audit tables, the Audit package, and audit evidence | IAM-MP-02 |
| Keycloak runtime, configuration, adapters, identity binding and reconciliation, and invitation dispatch | IAM-MP-03/04 |
| Application sessions, login attempts and CSRF storage | IAM-MP-05 |
| First activation (INVITED → ACTIVE) and the login flow | IAM-MP-06 |
| Authorization context and effective-permission queries | IAM-MP-07 |
| Department and membership administration operations, including the primary switch | IAM-MP-08 |
| Role and permission administration; last-System-Administrator serialization | IAM-MP-09 |
| Access-state transitions, reactivation, bootstrap and session revocation | IAM-MP-10 |
| HTTP endpoints, DTOs, OpenAPI and Problem Details codes | IAM-MP-11 |
| Any frontend work | IAM-MP-12–14 |
| Wiring IAM persistence into `apps/api` (NestJS providers) | The first stage with a runtime consumer |
| Separate migration and runtime database roles (`docs/SECURITY.md` Section 26, SHOULD) | Production deployment design |
| A PostgreSQL schema per domain; ADR-0008 | Revisit when a second domain adds persistence (see Section 34) |
| Seeding any user or department | Never (spec Section 48); the first administrator comes from bootstrap in IAM-MP-10 |
| Triggers, stored procedures, and Prisma preview features | Not introduced (D-08) |
| Opportunistic refactors, dependency upgrades, and new infrastructure | Never |

If an excluded item appears necessary to make IAM-01 "feel complete", it is not necessary.

---

# Part II — Decisions

## 10. Locked Architectural Decisions Inherited

These come from higher-authority sources and are not reopened here:

1. PostgreSQL through Prisma ORM 7.x is the persistence mechanism (AC-05, AC-06; spec Section 28).
2. IAM owns ApplicationUser, Department, DepartmentMembership, Role, Permission, RolePermission and UserRoleAssignment (`docs/MODULES.md` MOD-IAM; spec Section 6.3).
3. Prisma types never enter domain code or public contracts (ENGINEERING Section 14; spec Section 44).
4. Transaction handles never appear in domain code or public surfaces, and no generic unit-of-work is introduced (ENGINEERING Section 15; ARCHITECTURE AR-022).
5. Database constraints protect structural invariants even when application code already validates them (spec Section 28).
6. Security-critical IAM entities are not hard-deleted by ordinary workflows (spec Section 29).
7. Hidden workflow logic in triggers or stored procedures requires an ADR (ENGINEERING Section 4.3).
8. No seed user or unapproved department data, ever (spec Section 48).
9. Single-company model: no tenant columns or tenant abstractions (spec Section 5).
10. Application startup performs no schema or data mutation; migrations are explicit commands (spec Section 48).

---

## 11. Plan Decisions

Each decision is locked for execution. The implementing agent records deviations in the Decision Log (Section 35) only when a stop condition justified them.

### D-01 — IAM persistence lives in its own adapter project (resolves A-06)

**Decision.** Create the Nx project `domains/iam-persistence`, package `@vertex-os/iam-persistence`, private, ESM, with a closed root export. It implements IAM's private persistence contract with Prisma. The IAM core (`domains/iam`) stays free of Prisma, `pg` and `@vertex-os/database`.

**Why.** Nx boundary constraints are per project, not per folder. An adapter inside `domains/iam` would force the domain-core project to accept Prisma and database dependencies, which is exactly the loosening the audit ruled out. The IAM-00 plan already anticipated "future IAM infrastructure → `@vertex-os/iam`" (Sections 15.1 and 16). Spec Section 43 describes the layers as "concepts equivalent to" `domains/iam/src/infrastructure`, so a separate project satisfies it.

**Alternatives rejected.**

- *Adapter inside `domains/iam`.* It requires lifting the domain-core bans for the whole project.
- *Adapter inside `apps/api`.* It puts business persistence in the composition root (AR-008) and moves IAM-owned code out of IAM.
- *Nested project `domains/iam/persistence`.* The parent project's inputs, lint run and ESLint configuration would overlap the child's, and `domains/*` does not match it.
- *Moving the core to `domains/iam/core`.* It churns an accepted baseline for no gain.

**Consequences.** A reusable pattern: a domain core at `domains/<domain>` plus an optional `domains/<domain>-persistence` adapter. Later IAM stages (for example the Keycloak adapter in IAM-MP-04) decide separately whether they join this project or get their own. The name states what the project is today.

### D-02 — Private, lint-restricted entry points instead of public exports

**Decision.**

1. The `@vertex-os/iam` root export stays empty in IAM-01. Nothing consumes an IAM public capability yet (spec Section 44 lists what MAY be exposed, once needed).
2. `@vertex-os/iam` gains one named subpath, **`@vertex-os/iam/persistence`** → `domains/iam/src/persistence.ts`. It is IAM's persistence contract: the repository port, its result types, and the domain types the adapter maps. Only `domains/iam-persistence` may import it.
3. `@vertex-os/database` gains one named subpath, **`@vertex-os/database/persistence`** → `packages/database/src/persistence.ts`. It gives domain-owned adapters Prisma-typed access to the *same* pooled client that `createDatabaseClient` created:
   - `persistenceClientOf(database: DatabaseClient)`;
   - a `PersistenceClient` type that omits connection-lifecycle methods (`$connect`, `$disconnect`), because the composition root owns the pool;
   - the generated types needed for row mapping and error classification.

   Only adapter projects may import it; today that is only `domains/iam-persistence`.
4. `DatabaseClient` and the database root export are unchanged, so `apps/api` never sees Prisma. `persistenceClientOf` resolves the client through a module-private registry (for example a `WeakMap`) and throws for a handle it did not create.
5. The root `no-restricted-imports` configuration additionally rejects:
   - `@vertex-os/database/*`;
   - `@vertex-os/iam-persistence/*`;
   - `**/domains/iam-persistence/src/**`.
6. `domains/iam-persistence/eslint.config.mjs` re-declares `no-restricted-imports` with the same pattern list, adding exactly two negations: `!@vertex-os/iam/persistence` and `!@vertex-os/database/persistence`. The pattern list is exported once from the root configuration (a named export next to the default export) and reused, so the two lists cannot drift. The adapter configuration MUST NOT switch the rule off (compare A-05).

**Why.** The adapter must see the port and Prisma, while other domains, the API and the browser must not. Nx maps an exported subpath to its project (P-08), so tag constraints still apply to it. The path rule adds the "which project may use this entry" restriction that tags cannot express.

**Alternatives rejected.**

- *Export the port from the IAM root.* This violates spec Section 44 ("MUST NOT expose repositories").
- *Expose `PrismaClient` on `DatabaseClient`.* This leaks Prisma into the API composition code.
- *A second connection pool per domain.* It wastes connections, splits the timeout policy, and breaks the "one client per process" composition.

### D-03 — Tag vocabulary and dependency constraints (resolves A-06 tagging and A-03)

**Decision.** `@vertex-os/iam-persistence` carries the tags `type:lib`, `scope:backend`, `layer:adapter` and `domain:iam`. The root ESLint configuration changes additively:

```text
layer:domain   bannedExternalImports += 'pg'                                  (A-03)

layer:adapter  (new) onlyDependOnLibsWithTags: layer:domain, layer:infrastructure, layer:shared
               bannedExternalImports: @prisma/*, prisma, pg, @nestjs/*, fastify, @fastify/*,
                                      react, react-dom, @tanstack/*, vite, @vitejs/*

domain:iam     (new) onlyDependOnLibsWithTags: domain:iam, layer:infrastructure, layer:shared
```

The tag header comment in `eslint.config.mjs` is updated:

- `layer:adapter` means domain-owned infrastructure that implements a domain's private ports, reaches generic infrastructure through its approved entry points, and never depends on another adapter;
- `layer:shared` is reserved for a future domain-neutral shared kernel, and no project carries it yet (audit A-06 noted it was undescribed);
- `domain:iam` marks every IAM-owned project.

**Why.** The existing `layer:infrastructure → layer:infrastructure` rule stays exactly as it is, so `packages/database` still cannot depend on any domain. Nx applies every constraint whose source tag matches, so:

- the IAM core stays bound by `layer:domain`;
- the adapter can reach IAM (through `domain:iam`) and the database (through `layer:infrastructure`), but no other adapter, since `layer:adapter` is not in its allowed list;
- a future domain's adapter cannot reach IAM's adapter.

Banning `@prisma/*` and `pg` in adapters forces all Prisma access through `@vertex-os/database/persistence`, which keeps Prisma client creation, timeouts and error classification in one place (ENGINEERING Section 14). Banning NestJS keeps dependency-injection wiring in the composition root.

**Alternatives rejected.**

- *Tagging the adapter `layer:infrastructure`.* This would force widening the existing infrastructure rule, which would also let `packages/database` depend on domains.
- *Renaming existing tags.* Churn (IAM-00 Section 14).

### D-04 — Durable boundary regression check (resolves A-08)

**Decision.** Add `scripts/check-architecture-boundaries.mjs` and the root script `"lint:boundaries": "node scripts/check-architecture-boundaries.mjs"`, and insert it into `verify` immediately after `pnpm lint`:

```text
pnpm format:check && pnpm lint && pnpm lint:boundaries && pnpm typecheck && pnpm test && pnpm build
```

The script:

1. ensures the Nx project graph exists before linting, using `createProjectGraphAsync` from `@nx/devkit` (a root devDependency). This makes it work on a fresh clone as well as after `pnpm lint`;
2. lints *virtual* files with the ESLint Node API. For each case it runs `new ESLint({ cwd: <project root> })` and `lintText(code, { filePath: '<project root>/src/__boundary_probe__.ts' })`, the mechanism shown in P-08. It writes nothing to disk;
3. evaluates a declared case table (Section 27.5). Each **violation case** must produce a message from the expected rule, and for Nx cases a message naming the violated tag or banned import. Each **positive control** must produce no message from `@nx/enforce-module-boundaries`, `no-restricted-imports` or `no-restricted-syntax`. The controls stop the check from passing vacuously (the IAM-00 surprise S-002 shows how a rule can silently stop matching);
4. prints one line per case and exits non-zero on any mismatch, listing every mismatch.

**Why.** IAM-01 adds non-trivial rules: a new tag, subpath negations with gitignore-style semantics, and new bans. Temporary probes alone would leave them unguarded against later edits (A-08; ARCHITECTURE Section 39 AF-02).

**Alternatives rejected.**

- *A new Nx "architecture tests" project.* It needs a new tag, a workspace glob and five configuration files for one script.
- *Committed failing fixture files.* They would break the normal lint run, or need ignore gymnastics.

### D-05 — Prisma schema folder with an IAM-owned model file

**Decision.** Move `packages/database/prisma/schema.prisma` to `packages/database/prisma/schema/schema.prisma`, keeping the generator and datasource with the output adjusted to `../../src/generated/prisma`. Add `packages/database/prisma/schema/iam.prisma` holding every IAM model and enum. In `prisma.config.ts`, set `schema: 'prisma/schema'` and keep the migrations path `prisma/migrations`.

**Why.** One Prisma client per schema forces all domains into one schema. Separate files make IAM's ownership visible and keep future domain files, such as MOD-AUDIT's in IAM-MP-02, apart. Verified in P-04. The existing Nx inputs (`{projectRoot}/prisma/**/*`) already cover the folder.

**Alternative rejected.** One growing `schema.prisma` with comment sections: ownership by convention only.

### D-06 — Physical naming: `public` schema, `iam_` prefix, snake_case, explicit names

**Decision.**

- **Tables** are `iam_<entity>` in the default `public` schema. **Columns** are snake_case via `@map`. **Prisma models** are `Iam<Entity>` with camelCase fields. **PostgreSQL enum types** are `iam_<name>`, and Prisma enums are `Iam<Name>`.
- **Every constraint and index has an explicit name:**
  - primary keys `<table>_pkey`;
  - unique constraints and indexes `<table>_<purpose>_key`;
  - foreign keys `<table>_<column>_fkey`;
  - checks `<table>_<purpose>_ck`;
  - plain indexes `<table>_<column>_idx`.
- **Names must fit PostgreSQL's 63-byte identifier limit.** Longer names are silently truncated, so the test in Section 27.2 asserts the exact names.

**Why.** The prefix and model names namespace IAM inside the single database and the single generated client, making ownership visible to readers, reviews and any future tooling. snake_case keeps the hand-written SQL and test SQL free of quoting. Explicit names give error classification (Section 22) and tests a stable key.

**Alternative deferred.** A PostgreSQL schema per domain (`iam.*`). It is attractive for ownership and privilege separation, but it sets a precedent for every domain and brings multi-schema migration behavior into the first migration. It belongs to ADR-0008 ("Domain-Owned Data in a Shared PostgreSQL Platform", expected by ARCHITECTURE Section 40), to be decided when a second domain adds persistence. Moving prefixed tables into a schema later is a mechanical `ALTER TABLE … SET SCHEMA`.

### D-07 — Identifiers and time

**Decision.**

- **Surrogate keys.** User, department and role IDs are PostgreSQL `uuid` with `DEFAULT gen_random_uuid()`: random (v4), core PostgreSQL since version 13, no extension, and no embedded creation time.
- **Permission key.** Permissions use their stable `code` as primary key, as in the specification (Sections 9.5 and 28.6: `roleId + permissionCode`).
- **Instants.** Every instant is `timestamptz(3)`, matching JavaScript `Date` precision (ENGINEERING Section 20).
- **Technical timestamps.** `created_at` defaults to `CURRENT_TIMESTAMP`. `updated_at` defaults to `CURRENT_TIMESTAMP` and is maintained by Prisma `@updatedAt`; the default makes raw SQL inserts valid (P-04).
- **`last_access_state_changed_at`** defaults to `CURRENT_TIMESTAMP`, so at creation it equals `created_at`. Later transitions write it explicitly from the application clock.
- **Business instants** (`first_activated_at`, `invitation_sent_at`) have no default and are written only by the later stages that own them.

**Why.** IDs are opaque (ENGINEERING Section 21), deterministic across PostgreSQL versions, and generated even for SQL written by operators or tests. `uuidv7()` exists only from PostgreSQL 18, and the production PostgreSQL version is not yet decided (ARCHITECTURE Section 37).

### D-08 — Constraints Prisma cannot express: reviewed SQL, no preview features, no triggers

**Decision.** Author CHECK constraints and the partial unique index as reviewed, hand-written SQL in the same migration, after the generated DDL. Do not enable `partialIndexes` or any other preview feature. Add no trigger or function. In `iam.prisma`, each model carries a `///` documentation comment naming its database-only constraints, so readers of the schema can see them.

**Why.** Prisma has no CHECK syntax. The partial index needs a preview feature, whose semantics may change in minor releases. P-03 shows unmodeled constraints are stable under Prisma diffs. Immutability of `email`, a bound identity and a set `first_activated_at` (spec Section 28.1) would need triggers (ENGINEERING Section 4.3). It stays an adapter guarantee: update statements never write those columns, and the Section 27.3 tests prove it.

**Consequence.** The drift gate (D-10) cannot see these constraints, so behavioral tests that assert constraint names are their regression guard (Section 27.2).

### D-09 — Migrations are atomic and need no database-level privilege

**Decision.**

1. Every migration file is wrapped in exactly one explicit `BEGIN;` … `COMMIT;`, with no other transaction control statements.
2. Migrations MUST NOT contain `CREATE INDEX CONCURRENTLY` or any other statement that cannot run inside a transaction block. A future migration that genuinely needs one requires an explicit exception recorded in its own header and plan.
3. Remove the `CREATE SCHEMA IF NOT EXISTS "public";` line that `migrate diff --from-empty` emits.
4. A repository test enforces all three over every migration file (Section 27.4).
5. Add one short rule to `docs/ENGINEERING.md` Section 14 so the convention binds future migrations. It cites P-05 as the reason.

**Why.** P-05 shows that Prisma 7.10 leaves a partially applied schema on failure, and that the explicit wrapper makes failure all-or-nothing. P-06 shows that the schema line would require database-level `CREATE` for no benefit.

**Accepted cost.** With the wrapper, Prisma reports the secondary "current transaction is aborted" error instead of the root cause. Section 16.5 documents how an operator finds the root cause and recovers.

### D-10 — Migration authoring, application and drift gate

**Decision.**

- **Authoring.** Author the first migration offline and deterministically:

  ```text
  prisma migrate diff --from-empty --to-schema prisma/schema --script
  ```

  Wrap the generated output with the hand-written section per Section 16. This needs no development database, no shadow database, and no reset prompt. Later migrations choose their authoring method when they are planned.
- **Folder.** `packages/database/prisma/migrations/<UTC yyyymmddHHMMSS>_iam_persistence_foundation/migration.sql`, plus `packages/database/prisma/migrations/migration_lock.toml` containing `provider = "postgresql"`, the file Prisma Migrate itself maintains.
- **Application.**
  - New Nx target `@vertex-os/database:prisma-migrate-deploy` (`prisma migrate deploy`, `cache: false`, `dependsOn: []`).
  - New root script `"db:migrate": "nx run @vertex-os/database:prisma-migrate-deploy"`.
  - No `migrate dev`, `migrate reset` or `db push` script is added. Destructive reset stays `pnpm infra:reset` (spec Section 49: "No destructive reset may be hidden inside normal migration commands").
  - The API does not migrate on startup.
- **Drift gate.** An integration test in `packages/database` applies all migrations with the real `prisma migrate deploy` to an empty Testcontainers database. It then requires this command to exit 0:

  ```text
  prisma migrate diff --from-config-datasource --to-schema prisma/schema --exit-code
  ```

  So the schema and the migration history can never diverge (P-07; ARCHITECTURE AF-06).
- **Test harness.** Integration tests apply migrations only through the real `prisma migrate deploy` of `@vertex-os/database`, never by executing SQL files themselves. This exercises the `_prisma_migrations` bookkeeping and the production application path.

### D-11 — Repository scope: one aggregate, three operations, typed outcomes

**Decision.** IAM-01 defines a single private port, `ApplicationUserRepository`, with three operations whose semantics are fully fixed by the specification:

| Operation | Specification basis | Why now |
|---|---|---|
| `create(draft)` | spec Section 12 step 5 and spec Section 21.1: the user, memberships and role assignments are written in one transaction with the initial states of spec Section 11 | Proves transaction atomicity, email uniqueness mapping and the join constraints. Consumed by IAM-MP-04 (provisioning tests) and IAM-MP-10 (creation, bootstrap). |
| `findById(id)` | spec Section 17 `resolveActor` and every later user operation | The minimal read that proves the mapping round-trip. |
| `updateDisplayName(change)` | spec Sections 9.1 and 30: `displayName` is the only mutable profile field; versioned writes must not silently overwrite | Proves the optimistic-concurrency mechanism with the least-risky specified write. |

Departments, roles, permissions and the join tables get **tables, constraints and database-level tests** now, but **no repository operations**. Their writes belong to IAM-MP-02 (reference synchronization), IAM-MP-08 (departments and memberships) and IAM-MP-09 (roles and mappings), and each of those stages adds the adapter operations it needs. Tests seed these rows through test-only SQL or Prisma inside the adapter project.

Expected failures are **typed results, not exceptions** (ENGINEERING Section 13):

- `create` → `created` | `email-conflict` | `unknown-reference`, where `unknown-reference` means a referenced department or role does not exist;
- `updateDisplayName` → `updated` | `not-found` | `version-conflict`.

Unexpected database failures propagate as errors.

**Why.** "Complexity must earn abstraction". Speculative department, role or permission repositories would be designed without their use cases and redesigned later. The Master Plan's "repository interfaces/adapters" deliverable is met by the one aggregate that later stages need first, while the database invariants of all seven entities are proven now.

### D-12 — Specification interpretations and data-contract details

The specification leaves the following open or implicit. This plan fixes them. None changes a specified semantic, so `docs/modules/iam.md` stays unchanged. The auditor should confirm the classification.

| # | Topic | Resolution | Basis |
|---|---|---|---|
| I-1 | `identityIssuer` nullability | `identity_issuer` and `identity_subject` are both NULL or both NOT NULL; both are bound together by reconciliation | spec Section 11.2 step 5 binds both together; spec Section 28.1 uniqueness applies "when identitySubject is present" |
| I-2 | Invitation fields | `invitation_delivery_state = 'SENT'` ⇒ `invitation_sent_at` NOT NULL; `'NOT_SENT'` ⇒ `invitation_sent_at` NULL; `'FAILED'` allows either | spec Section 11.3 definitions |
| I-3 | System role state | `is_system` ⇒ `state = 'ACTIVE'` | spec Section 20: the system role "MUST NOT be … deactivated"; spec Section 28.4 "protected isSystem semantics". Renaming and deletion protection stays application-enforced (IAM-MP-09). |
| I-4 | Permission code shape | Exactly three segments, `<module>.<resource>.<action>`; the first segment equals `owning_module` | spec Section 9.5 normative rule. The two-segment `projects.edit` in spec Sections 6.4 and 16 is read as illustrative; the owner or auditor MUST flag this if the reading is wrong. |
| I-5 | `lastAccessStateChangedAt` at creation | Equals the creation instant; NOT NULL | spec Section 9.1 ("last access-state transition time"); creation establishes INVITED |
| I-6 | Initial states | No database defaults for `access_state`, `identity_sync_state`, `invitation_delivery_state` or `is_system`. The domain draft fixes `INVITED`/`PENDING`/`NOT_SENT` (spec Section 11), and every write states its state explicitly. | Explicitness; spec Section 11 |
| I-7 | Version | Integer starting at 1 and incremented by exactly 1 on every protected update; CHECK `version >= 1` on versioned tables (users, departments, roles). Memberships, join rows and permissions carry no version: the specification lists none, and permissions are code-synchronized. | spec Sections 9, 28.1 and 30 |
| I-8 | Formats and lengths | See Section 17.2. The domain validates, and the database mirrors the rules as that section describes: exact equivalence for email, codes and identifiers, a structural backstop for free text. | Data-contract detail the specification leaves open |
| I-9 | Several migrations | spec Section 49's list is fulfilled by the IAM stage sequence: IAM tables now; Audit tables in IAM-MP-02; session tables in IAM-MP-05, each as its own migration | `IAM_MASTER_PLAN.md` Section 13 decomposition |
| I-10 | Join-row metadata | Memberships carry `created_at`/`updated_at` (spec Section 9.3); role assignments and role-permission rows carry `created_at` only | spec Sections 9.3, 9.6 and 9.7 |

---

## 12. Security Invariants for This Stage

1. No credential, secret, token or session material is modeled or stored (spec Section 9.1, "MUST NOT contain").
2. Email uniqueness covers every user, TERMINATED included, and is enforced on the normalized value, which the database also requires to be normalized.
3. Issuer + subject uniqueness is enforced by the database. Nothing in IAM-01 resolves a user by email.
4. The database rejects an ACTIVE user without a bound identity and first activation, and an INVITED user with a first-activation time.
5. No hard-delete path is added. All foreign keys are `ON DELETE RESTRICT ON UPDATE RESTRICT`, so deleting a referenced user, department, role or permission fails.
6. The repository contract and Prisma are unreachable from outside IAM (D-02, D-03), and each restriction is regression-tested (D-04).
7. Typed repository outcomes carry no driver text and no email or other row values (Section 22).
8. No seed data or default account exists.
9. Migrations need no database-level `CREATE` privilege (D-09) and never reset data.
10. Test harnesses assert that they migrate only the ephemeral container, never the developer database (Section 22).

---

## 13. Module Boundaries After IAM-01

| Source → target | Status | Enforced by |
|---|---|---|
| `apps/api` → `@vertex-os/iam` (root) | Allowed | tags |
| `apps/api` → `@vertex-os/iam-persistence` (root) | Allowed for future composition; unused in IAM-01 | tags |
| `apps/api` → `@vertex-os/iam/persistence` | Forbidden | `no-restricted-imports` |
| `apps/api` → `@vertex-os/database/persistence` | Forbidden | `no-restricted-imports` |
| any project → `@vertex-os/iam-persistence/<subpath>`, `domains/iam-persistence/src/**` | Forbidden | `no-restricted-imports`, export map |
| `apps/web`, `packages/ui` → any IAM project | Forbidden | `scope:web`, `layer:ui` |
| `@vertex-os/iam` → `@vertex-os/database` (any entry), `@vertex-os/iam-persistence` | Forbidden | `layer:domain` |
| `@vertex-os/iam` → `pg`, `@prisma/*`, frameworks | Forbidden | `layer:domain` banned imports (now including `pg`) |
| `@vertex-os/iam-persistence` → `@vertex-os/iam` root and `/persistence` | Allowed | tags + adapter `no-restricted-imports` negation |
| `@vertex-os/iam-persistence` → `@vertex-os/database` root and `/persistence` | Allowed | tags + adapter negation |
| `@vertex-os/iam-persistence` → `@prisma/*`, `pg`, `@nestjs/*`, `fastify`, browser stack | Forbidden | `layer:adapter` banned imports |
| `@vertex-os/iam-persistence` → another adapter | Forbidden | `layer:adapter` allowed list |
| `packages/database` → any IAM project | Forbidden | `layer:infrastructure` (unchanged) |
| future domain core → `@vertex-os/iam-persistence` | Forbidden | `layer:domain` |
| future domain adapter → `@vertex-os/iam-persistence` | Forbidden | `layer:adapter` |
| any project other than `iam-persistence` → `@vertex-os/iam/persistence` or `@vertex-os/database/persistence` | Forbidden | root `no-restricted-imports` |

**Known residual gap (accepted, Risk R-06).** An adapter that holds the shared generated client can technically query another domain's models, for example `iamApplicationUser` from a future CRM adapter. No second adapter exists yet. The model-name prefix (D-06) makes such access greppable. Enforcing it is part of ADR-0008 when a second domain adapter appears.

---

# Part III — Target Design

## 14. Target Architecture

```text
            apps/api  (composition root; no IAM wiring in IAM-01)
               │  may later import roots of:
               ├──────────────► @vertex-os/iam-persistence  (layer:adapter, domain:iam)
               │                    │ @vertex-os/iam/persistence ──► port + domain types
               │                    │ @vertex-os/database/persistence ──► PersistenceClient
               │                    ▼
               ├──────────────► @vertex-os/iam  (layer:domain, domain:iam)
               │                    domain/ value types, states, validation, drafts
               │                    application/ports/ ApplicationUserRepository
               │                    index.ts (public, empty)   persistence.ts (private entry)
               ▼
            @vertex-os/database  (layer:infrastructure)
               prisma/schema/{schema,iam}.prisma  prisma/migrations/
               src/index.ts (DatabaseClient, unchanged)   src/persistence.ts (private entry)
                               │
                               ▼
                          PostgreSQL 18  (public.iam_* tables)
```

Dependencies point inward to the IAM core. The core knows neither Prisma nor the adapter. The adapter knows the core's private contract and the database's private entry, and nothing else.

---

## 15. Database Changes

### 15.1 Enums

| Prisma enum | PostgreSQL type | Values (closed sets, spec) |
|---|---|---|
| `IamUserAccessState` | `iam_user_access_state` | `INVITED`, `ACTIVE`, `SUSPENDED`, `DISABLED`, `TERMINATED` (spec Section 10) |
| `IamIdentitySyncState` | `iam_identity_sync_state` | `PENDING`, `SYNCED`, `FAILED` (spec Section 11.1) |
| `IamInvitationDeliveryState` | `iam_invitation_delivery_state` | `NOT_SENT`, `SENT`, `FAILED` (spec Section 11.3) |
| `IamDepartmentState` | `iam_department_state` | `ACTIVE`, `INACTIVE` (spec Section 9.2) |
| `IamRoleState` | `iam_role_state` | `ACTIVE`, `INACTIVE` (spec Section 9.4) |
| `IamPermissionState` | `iam_permission_state` | `ACTIVE`, `DEPRECATED`, `RETIRED` (spec Section 9.5) |
| `IamPermissionSensitivity` | `iam_permission_sensitivity` | `STANDARD`, `SENSITIVE`, `PRIVILEGED` (spec Section 9.5) |

### 15.2 `iam_application_user` (model `IamApplicationUser`)

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | `uuid` | no | `gen_random_uuid()` | PK `iam_application_user_pkey` |
| `email` | `text` | no | — | normalized; unique `iam_application_user_email_key`; immutable (adapter) |
| `display_name` | `text` | no | — | the only mutable profile field |
| `access_state` | `iam_user_access_state` | no | — | |
| `identity_issuer` | `text` | yes | — | bound together with subject; immutable once bound |
| `identity_subject` | `text` | yes | — | immutable once bound |
| `identity_sync_state` | `iam_identity_sync_state` | no | — | |
| `invitation_delivery_state` | `iam_invitation_delivery_state` | no | — | |
| `invitation_sent_at` | `timestamptz(3)` | yes | — | |
| `first_activated_at` | `timestamptz(3)` | yes | — | set once, never cleared (later stages) |
| `last_access_state_changed_at` | `timestamptz(3)` | no | `CURRENT_TIMESTAMP` | |
| `created_at` | `timestamptz(3)` | no | `CURRENT_TIMESTAMP` | |
| `updated_at` | `timestamptz(3)` | no | `CURRENT_TIMESTAMP` | Prisma `@updatedAt` |
| `version` | `integer` | no | `1` | |

Unique `iam_application_user_identity_key` on (`identity_issuer`, `identity_subject`). PostgreSQL's default `NULLS DISTINCT` lets any number of unbound users coexist, and the pair check guarantees both are NULL together.

Checks (hand-written):

| Name | Predicate (semantics; exact SQL in the migration) | Basis |
|---|---|---|
| `iam_application_user_email_normalized_ck` | `char_length(email) BETWEEN 3 AND 254` AND `octet_length(email) = char_length(email)` (ASCII only) AND no `[[:space:][:cntrl:]]` AND `email = lower(email)` AND `email ~ '^[^@]+@[^@]+$'` | spec Sections 9.1 and 28.1; uniqueness is only meaningful over normalized values. The ASCII precondition makes `lower()` locale-safe: uppercase `I` never equals its lowercase form in any locale. |
| `iam_application_user_display_name_ck` | `char_length BETWEEN 1 AND 200` AND `display_name = btrim(display_name)` AND no `[[:cntrl:]]` | I-8 |
| `iam_application_user_identity_pair_ck` | `(identity_issuer IS NULL) = (identity_subject IS NULL)` AND (`identity_issuer IS NULL` OR both non-empty) | I-1 |
| `iam_application_user_active_ck` | `access_state <> 'ACTIVE' OR (identity_subject IS NOT NULL AND first_activated_at IS NOT NULL)` | spec Section 28.1 |
| `iam_application_user_invited_ck` | `access_state <> 'INVITED' OR first_activated_at IS NULL` | spec Section 28.1 |
| `iam_application_user_invitation_sent_ck` | `(invitation_delivery_state <> 'SENT' OR invitation_sent_at IS NOT NULL) AND (invitation_delivery_state <> 'NOT_SENT' OR invitation_sent_at IS NULL)` | I-2 |
| `iam_application_user_version_ck` | `version >= 1` | I-7 |

### 15.3 `iam_department` (model `IamDepartment`)

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | `uuid` | no | `gen_random_uuid()` | PK `iam_department_pkey` |
| `code` | `text` | no | — | unique `iam_department_code_key`; stable |
| `name` | `text` | no | — | |
| `description` | `text` | yes | — | |
| `state` | `iam_department_state` | no | — | |
| `created_at`, `updated_at` | `timestamptz(3)` | no | `CURRENT_TIMESTAMP` | |
| `version` | `integer` | no | `1` | |

No `parent_department_id` (spec Section 9.2).

Every code check in this and the following sections combines its regular expression with the ASCII precondition used for email (`octet_length(x) = char_length(x)`). The check therefore never depends on how PostgreSQL's regular-expression ranges treat non-ASCII characters under the database locale.

Checks:

- `iam_department_code_ck` (Section 17.2 code format);
- `iam_department_name_ck` (as display name);
- `iam_department_description_ck` (`description IS NULL` or 1–2000 characters, trimmed, no control characters);
- `iam_department_version_ck`.

### 15.4 `iam_role` (model `IamRole`)

The columns are those of the department table plus `is_system boolean NOT NULL`, with no default (I-6). The primary key is `iam_role_pkey` and the code is unique through `iam_role_code_key`.

Checks:

- `iam_role_code_ck`;
- `iam_role_name_ck`;
- `iam_role_description_ck`;
- `iam_role_system_active_ck` (`NOT is_system OR state = 'ACTIVE'`, I-3);
- `iam_role_version_ck`.

### 15.5 `iam_permission` (model `IamPermission`)

| Column | Type | Null | Notes |
|---|---|---|---|
| `code` | `text` | no | PK `iam_permission_pkey`; stable and never repurposed |
| `owning_module` | `text` | no | |
| `name` | `text` | no | |
| `description` | `text` | no | required (spec Section 9.5) |
| `state` | `iam_permission_state` | no | |
| `sensitivity` | `iam_permission_sensitivity` | no | |
| `created_at`, `updated_at` | `timestamptz(3)` | no | defaults as above |

Checks:

- `iam_permission_code_ck` (three-segment format, at most 128 characters);
- `iam_permission_owning_module_ck` (module-code format);
- `iam_permission_code_module_ck` (`split_part(code, '.', 1) = owning_module`, I-4);
- `iam_permission_name_ck`;
- `iam_permission_description_ck` (1–2000 characters, trimmed, no control characters).

### 15.6 Join tables

| Table (model) | Columns | Keys and indexes |
|---|---|---|
| `iam_department_membership` (`IamDepartmentMembership`) | `user_id uuid`, `department_id uuid`, `is_primary boolean` (no default), `created_at`, `updated_at` | PK `iam_department_membership_pkey` (`user_id`, `department_id`); index `iam_department_membership_department_id_idx`; **partial unique `iam_department_membership_one_primary_key` ON (`user_id`) WHERE `is_primary`** (hand-written) |
| `iam_user_role_assignment` (`IamUserRoleAssignment`) | `user_id uuid`, `role_id uuid`, `created_at` | PK `iam_user_role_assignment_pkey` (`user_id`, `role_id`); index `iam_user_role_assignment_role_id_idx` |
| `iam_role_permission` (`IamRolePermission`) | `role_id uuid`, `permission_code text`, `created_at` | PK `iam_role_permission_pkey` (`role_id`, `permission_code`); index `iam_role_permission_permission_code_idx` |

Foreign keys are named `<table>_<column>_fkey` and are all `ON DELETE RESTRICT ON UPDATE RESTRICT`:

- membership → user and department;
- assignment → user and role;
- role permission → role and permission.

The secondary indexes serve the RESTRICT checks and the reverse lookups later stages need: the count of System Administrator holders in IAM-MP-09, and the permissions of a role in IAM-MP-07.

### 15.7 What the database deliberately does not enforce

The following stay application-enforced in their owning stages, because no declarative constraint can express them without triggers:

- the transition graph (spec Section 10.6);
- immutability of `email`, a bound identity and a set `first_activated_at`;
- system-role rename and deletion protection;
- "assign only to ACTIVE departments and roles";
- "retired permissions are never effective";
- the last-System-Administrator rule.

The Section 27.3 tests prove immutability at the adapter level.

---

## 16. Migration Specification

### 16.1 Location and name

- `packages/database/prisma/migrations/migration_lock.toml`, containing `provider = "postgresql"`.
- `packages/database/prisma/migrations/<yyyymmddHHMMSS>_iam_persistence_foundation/migration.sql`. Use the UTC time of authoring.

### 16.2 Structure

```text
-- Header comment: owner MOD-IAM; plan IAM-MP-01; why the file is wrapped in a transaction
--   (D-09, P-05); why the CREATE SCHEMA line is absent (P-06); where the hand-written
--   section starts; the recovery procedure pointer (this plan, Section 16.5).
BEGIN;

-- Generated by: prisma migrate diff --from-empty --to-schema prisma/schema --script
--   (Prisma 7.10.0), minus the leading CREATE SCHEMA statement. Not edited by hand.
<generated DDL: enums, tables, generated unique/plain indexes, foreign keys>

-- Hand-written, reviewed: constraints Prisma cannot express (D-08).
<ALTER TABLE … ADD CONSTRAINT … CHECK (…) for every check in Section 15>
<CREATE UNIQUE INDEX iam_department_membership_one_primary_key … WHERE is_primary>

COMMIT;
```

### 16.3 Review checklist (the implementer records it; the auditor re-checks it)

- [ ] The generated section equals the fresh `migrate diff --from-empty` output apart from the removed `CREATE SCHEMA` line.
- [ ] Every name in Section 15 appears exactly as written; none exceeds 63 bytes.
- [ ] Every foreign key is `ON DELETE RESTRICT ON UPDATE RESTRICT`.
- [ ] Every check predicate matches Section 15 and Section 17.2, and none relies on locale-dependent behavior beyond what Section 15.2 justifies.
- [ ] There is exactly one `BEGIN;` and one `COMMIT;`, and no `CONCURRENTLY`, `CREATE SCHEMA`, `DROP`, `TRUNCATE`, `DELETE` or `INSERT`.
- [ ] There are no seed or reference rows.
- [ ] The drift gate (D-10) passes.

### 16.4 Forward-only

Prisma migrations are forward-only. This migration is never edited after it reaches `main`. Later corrections are new migrations.

### 16.5 Failure and recovery procedure

This goes in the README and in the migration header pointer.

1. `pnpm db:migrate` fails with P3018. Because of the wrapper, nothing from the failed migration was applied; only a failed row in `_prisma_migrations` remains.
2. If the message is `current transaction is aborted…`, reproduce the root cause against a disposable database, **never production**:

   ```text
   psql -v ON_ERROR_STOP=1 -f <migration.sql>
   ```

3. Fix the cause (environment, privilege or data), not the committed migration.
4. Mark the attempt rolled back:

   ```text
   pnpm --filter @vertex-os/database exec prisma migrate resolve --rolled-back <migration_name>
   ```

5. Re-run `pnpm db:migrate`.

---

## 17. IAM Core Changes (`domains/iam`)

### 17.1 Layout

Create only the files that real code in this stage needs.

```text
domains/iam/src/
  index.ts                         public entry — unchanged, still exports nothing
  persistence.ts                   private entry for the IAM adapter (D-02)
  domain/
    identifiers.ts                 UserId, DepartmentId, RoleId (branded) + parse functions
    states.ts                      the seven closed sets (const tuples + literal-union types)
    email.ts                       NormalizedEmail + normalizeEmail()
    text.ts                        display name / name / description validation
    codes.ts                       department, role, module and permission code validation
    application-user.ts            ApplicationUser record, NewApplicationUser draft + factory
  application/ports/
    application-user-repository.ts ApplicationUserRepository + result types
```

The file names above are guidance. The separation of domain and application-port concerns is required, and so is the rule that `persistence.ts` re-exports only what the adapter needs.

### 17.2 Validation rules (domain and database MUST agree)

| Value | Rule |
|---|---|
| Email | Input is trimmed (`String.prototype.trim`). The result MUST be 3–254 characters, every character printable ASCII U+0021–U+007E (so no internal whitespace and no non-ASCII), and contain exactly one `@` with non-empty local and domain parts. It is stored lowercased with `toLowerCase()` (locale-independent), applied after the ASCII check. No provider-specific transformations: dots and `+` suffixes are preserved. |
| Display name, entity name | Trimmed; 1–200 **Unicode code points**, counted as code points (`[...value].length`) to match PostgreSQL `char_length`, not UTF-16 units; no control characters. Arabic and other non-Latin text is allowed. |
| Description | Absent, or trimmed with 1–2000 code points and no control characters. Permission descriptions are required. |
| Department and role code | `^[a-z0-9]+(-[a-z0-9]+)*$`, 2–64 characters |
| Module code | `^[a-z][a-z0-9]*(-[a-z0-9]+)*$`, 2–32 characters |
| Permission code | Three `.`-separated segments, each `^[a-z][a-z0-9]*(-[a-z0-9]+)*$`; at most 128 characters; the first segment is the owning module |
| Identifier | Canonical lowercase UUID text (`8-4-4-4-12` hex); any version |

Every validator returns a typed result (`{ ok: true, value } | { ok: false, reason }`) with stable reason codes. It never throws for invalid input.

The database checks are the structural backstop for these rules. For email, codes and identifiers they are exactly equivalent, and the parity tests (Section 27.2) prove it. For free text they enforce length, surrounding spaces and ASCII control characters. Whether PostgreSQL's `[[:cntrl:]]` also matches the C1 range (U+0080–U+009F) depends on the database locale, so the domain validator is the authority there and the parity tests use ASCII control characters only.

### 17.3 Domain types

- `ApplicationUser` is a `readonly` record of every spec Section 9.1 field, using the domain types. Instants are `Date`, optional instants are `Date | undefined`, and the identity is either `undefined` or `{ issuer, subject }`. It is data, not an active record.
- `NewApplicationUser` is the draft. The factory `newApplicationUser({ email, displayName, memberships, roleIds })`:
  - validates email and display name;
  - fixes `accessState: 'INVITED'`, `identitySyncState: 'PENDING'`, `invitationDeliveryState: 'NOT_SENT'` as literal types (spec Section 11), so the port cannot create a user in any other state;
  - takes `memberships` as a readonly list of `{ departmentId, isPrimary }`, rejecting a duplicate department or more than one primary (spec Section 9.3). An empty list is allowed, because bootstrap supplies no department (spec Section 21.1);
  - takes `roleIds` as a readonly list, rejecting duplicates; an empty list is allowed.

  Existence and ACTIVE-state checks of the referenced departments and roles belong to the creating use case (IAM-MP-10). The port reports unknown references (D-11).

### 17.4 Port contract (sketch; the exact TypeScript is the implementer's)

```ts
export interface ApplicationUserRepository {
  create(draft: NewApplicationUser): Promise<CreateApplicationUserResult>;
  findById(id: UserId): Promise<ApplicationUser | undefined>;
  updateDisplayName(change: {
    readonly id: UserId;
    readonly expectedVersion: number;
    readonly displayName: DisplayName;
  }): Promise<UpdateDisplayNameResult>;
}

export type CreateApplicationUserResult =
  | { readonly outcome: 'created'; readonly user: ApplicationUser }
  | { readonly outcome: 'email-conflict' }
  | { readonly outcome: 'unknown-reference' };

export type UpdateDisplayNameResult =
  | { readonly outcome: 'updated'; readonly user: ApplicationUser }
  | { readonly outcome: 'not-found' }
  | { readonly outcome: 'version-conflict' };
```

Contract semantics:

- **Atomicity.** `create` is all-or-nothing, covering the user, all memberships and all assignments.
- **Returned user.** `updated` returns exactly the row this update wrote, with version `expectedVersion + 1`.
- **Unchanged columns.** `updateDisplayName` never writes any column other than `display_name`, `version` and `updated_at`.
- **No transaction handles** appear in the contract.

### 17.5 Test infrastructure for the core

Add `domains/iam/vitest.config.mts` (Node environment, `src/**/*.spec.ts`, retry 0), `domains/iam/tsconfig.spec.json`, a reference to it from `domains/iam/tsconfig.json`, and a `test` target entry mirroring `apps/api`, so the Nx `targetDefaults.test` applies. `tsconfig.lib.json` keeps `types: []` and continues to exclude spec files.

---

## 18. Adapter Changes (`domains/iam-persistence`)

### 18.1 Project

```text
domains/iam-persistence/
  package.json                 name @vertex-os/iam-persistence, private, "type": "module",
                               closed root export (same shape as @vertex-os/iam),
                               dependencies: @vertex-os/database, @vertex-os/iam (workspace:*),
                               nx.tags: type:lib, scope:backend, layer:adapter, domain:iam,
                               nx.targets: test:integration {}  (targetDefaults supply the command)
  eslint.config.mjs            base config + restricted-imports re-declaration (D-02)
                               + @nx/dependency-checks mirroring packages/database
  tsconfig.json                references lib + spec
  tsconfig.lib.json            rootDir src, outDir dist, excludes specs; types [] unless the
                               generated client's declarations genuinely require node types
  tsconfig.spec.json           includes src/**/*.spec.ts, test-support/**/*.ts, vitest config
  vitest.integration.config.mts  node env, src/**/*.integration.spec.ts, retry 0,
                               testTimeout/hookTimeout as packages/database
  src/index.ts                 export { createApplicationUserRepository }
  src/application-user-repository.ts
  src/…                        mapping and error classification, split as the code warrants
  src/*.integration.spec.ts
  test-support/                Testcontainers + migrate-deploy harness; outside src/, so the
                               production env-access rule and the lib build do not apply
```

The target `test:integration` depends on `^build`, which builds `@vertex-os/database` (and therefore runs `prisma-generate`) and `@vertex-os/iam` first.

### 18.2 Factory

`createApplicationUserRepository(database: DatabaseClient): ApplicationUserRepository` obtains the shared client through `persistenceClientOf(database)`. It opens no pool of its own and never disconnects.

### 18.3 Implementation requirements

- **Queries** select explicit columns. They never use `include` chains that load unrelated relations (ENGINEERING Section 14).
- **`create`** writes the user, its memberships and its role assignments in one atomic Prisma operation: a nested create or an interactive transaction, as the implementer chooses. The Section 27.3 atomicity test decides.
- **`updateDisplayName`** is one conditional write on `id` and `version` that returns the written row, for example Prisma `update` with `where: { id, version }` and `data: { displayName, version: { increment: 1 } }`. A zero-row outcome is then classified by one read of the ID: absent means `not-found`, present means `version-conflict`. The classification read never feeds a write.
- **Mapping** between Prisma enum values and domain literals is explicit and exhaustive in both directions, using `satisfies Record<…>` or an equivalent, so that adding an enum value breaks compilation until it is mapped. Rows are mapped into fresh domain objects, and Prisma objects never escape.
- **Error classification** (Section 22) uses the driver-adapter classification that Phase 0 already relies on (`meta.driverAdapterError.cause`, see `packages/database/src/database-client.ts`) plus the explicit constraint names. The exact shape of a unique and a foreign-key violation under Prisma 7.10 + `@prisma/adapter-pg` MUST be observed in the integration tests before code relies on it, and recorded in Surprises. Never parse error messages. An unrecognized shape is rethrown, not guessed.
- **No logging**, no NestJS, and no environment access.

---

## 19. Database Package Changes (`packages/database`)

1. Schema folder and IAM models (D-05, Section 15); format the files with `prisma format`.
2. `migration_lock.toml` and the migration (Section 16).
3. `src/persistence.ts` and the `./persistence` export (D-02). Its production code MUST NOT read the environment.
4. `persistenceClientOf` backed by a module-private registry in `database-client.ts`. `createDatabaseClient` registers the Prisma client it creates.
5. Nx target `prisma-migrate-deploy` and root script `db:migrate` (D-10).
6. `src/migrations.integration.spec.ts`. The test cases are in Section 27.4.
7. Check that the `@nx/dependency-checks` configuration still passes. `src/persistence.ts` only re-exports generated code.
8. Correct the `pnpm-workspace.yaml` comment on `@prisma/engines` if it no longer describes reality: migrate commands need the schema engine, which validate and generate do not. Record in Surprises how CI obtains it (R-07). Do not change the `allowBuilds` value unless CI proves it necessary. If CI does prove it necessary, that is a reviewed supply-chain decision recorded in the Decision Log.

`DatabaseModule` in `apps/api` is **not** changed. Its 1 s statement timeout is revisited by the first stage that composes IAM persistence into the API process (Section 34).

---

## 20. Tooling, Workspace and Documentation Changes

### 20.1 Workspace

- The new project is picked up by the existing `domains/*` glob.
- Run `pnpm install` to add the lockfile importer. The only expected change is `domains/iam-persistence` with two `workspace:` links.
- Run `nx sync`; `nx sync:check` must pass. Root `tsconfig.json` references are updated by sync, not by hand.

### 20.2 ESLint

Apply D-02 and D-03, and update the tag header comment. No existing constraint is removed or widened.

### 20.3 Root scripts

- `db:migrate` (D-10).
- `lint:boundaries` (D-04), inserted into `verify`.

`verify:full` inherits it through `verify`. CI needs no workflow change (AGENTS.md: change what the root commands verify, not the workflow).

### 20.4 Documentation

- **`README.md`.** Add `pnpm db:migrate` and the Section 16.5 recovery procedure to "Database and infrastructure". Replace "no models and there are no migrations yet". Add `lint:boundaries` to the Verification table. Add `domains/iam-persistence` to "Repository layout". Update "Current limitations": IAM tables exist, but no IAM behavior is reachable and the API does not use them.
- **`docs/ENGINEERING.md` Section 14.** Add the migration-atomicity rule (D-09), two or three sentences.
- **`docs/plans/iam/IAM_MASTER_PLAN.md`.** Set IAM-MP-01 to `IN_PROGRESS` at start and to `AUDIT_REQUIRED` at completion, with evidence, and add an amendment record. Do **not** mark it `COMPLETE`; that follows the independent audit and owner acceptance.
- **This plan.** Keep the living sections current.
- **No change** to `docs/modules/iam.md`, `docs/ARCHITECTURE.md`, `docs/MODULES.md` or `AGENTS.md`, unless execution exposes a genuine contradiction. That is recorded in Surprises and surfaced, never silently resolved.

---

## 21. API, Frontend and Integration Changes

None.

- No controller, provider, module, OpenAPI change or web change.
- No Keycloak and no Audit work.
- `apps/api` source is untouched.

The boundary check and the ESLint changes are the only files that mention `apps/*`, and they only as lint targets.

---

## 22. Failure Handling

| Failure | Required behavior |
|---|---|
| Duplicate email on `create`, including a concurrent duplicate | `email-conflict`; nothing written |
| A referenced department or role does not exist | `unknown-reference`; nothing written |
| A draft violating membership rules reaches the database anyway (programming error) | The database rejects it with the named constraint; the adapter rethrows (not a typed outcome); nothing written |
| Stale `expectedVersion` | `version-conflict`; no column changes |
| Unknown ID | `findById` → `undefined`; `updateDisplayName` → `not-found` |
| Any other database error | Propagates unchanged to the caller; no partial writes |
| Migration failure | All-or-nothing (D-09); recovery per Section 16.5 |
| Deploy against a non-empty schema without history | Prisma refuses (P3005); documented, not worked around |
| Test harness pointed at a non-container database | The harness refuses before migrating. It asserts that the URL it passes is the Testcontainers URL it created, and always passes `DATABASE_URL` explicitly (P-09). |

Typed outcomes MUST NOT carry driver messages, SQL, constraint details or row values. Tests assert that the serialized outcome does not contain the email used.

---

## 23. Concurrency Considerations

- **Optimistic versioning.** Protected updates are one conditional `UPDATE … WHERE id = $1 AND version = $2`. Of two writers holding the same version, exactly one succeeds, and the other receives `version-conflict` (spec Section 30). This is proven with truly concurrent operations (TESTING Section 16), not sequential simulation.
- **Unique allocation.** Two concurrent `create` calls with one email produce exactly one user. PostgreSQL makes the second insert wait on the first and then fail with a unique violation, which is mapped to `email-conflict`.
- **One primary membership.** The partial unique index is immediate, and PostgreSQL cannot make a unique *index* deferrable. Switching a user's primary department must therefore clear the old primary before setting the new one inside one transaction. Recorded for IAM-MP-08; not implemented here.
- **Later serialization.** Last-System-Administrator and bootstrap serialization (spec Sections 20 and 21.4) are not implemented, but the schema does not preclude them. The protected role is a single `iam_role` row that later stages can lock (`SELECT … FOR UPDATE`), and holders are reachable through `iam_user_role_assignment_role_id_idx`.
- **Pool sharing.** The adapter shares the composition root's pool (D-02). Tests create their own `DatabaseClient` with the package defaults.

---

## 24. Observability and Audit Requirements

- No IAM mutation is reachable by any actor in IAM-01, so no security event or audit record is required (spec Section 34 applies from the stages that expose mutations).
- The adapter logs nothing.
- Nothing in the new code writes emails, identity values or connection strings to logs or error messages it creates. Unexpected Prisma errors are rethrown unchanged. How they are logged is owned by the API error boundary when IAM is first composed (IAM-MP-11 audit focus: data minimization).

---

## 25. Expected Files and Areas

```text
new       domains/iam-persistence/**                                   (Section 18)
new       domains/iam/src/{persistence.ts, domain/**, application/ports/**}, specs
new       domains/iam/{vitest.config.mts, tsconfig.spec.json}
changed   domains/iam/{package.json (exports ./persistence, nx test target), tsconfig.json}
moved     packages/database/prisma/schema.prisma → prisma/schema/schema.prisma
new       packages/database/prisma/schema/iam.prisma
new       packages/database/prisma/migrations/{migration_lock.toml, <ts>_iam_persistence_foundation/migration.sql}
new       packages/database/src/{persistence.ts, migrations.integration.spec.ts}
changed   packages/database/{prisma.config.ts, package.json, src/database-client.ts}
new       scripts/check-architecture-boundaries.mjs
changed   eslint.config.mjs, package.json (scripts), pnpm-lock.yaml (importer only),
          tsconfig.json (via nx sync), pnpm-workspace.yaml (comment only, if inaccurate)
docs      README.md, docs/ENGINEERING.md §14, docs/plans/iam/IAM_MASTER_PLAN.md, this plan
```

Any change outside this list is recorded and justified in the Decision Log, or reverted.

---

# Part IV — Execution

## 26. Implementation Workstreams / Milestones

Boundaries come first, so every later file is checked by the rules it must obey.

### M0 — Preflight and baseline freeze

Record `git status --short`, `git rev-parse HEAD` and `git log -5 --oneline`. Compare against `a1e087f` and inspect any intervening commits. Confirm P-01. Confirm Docker is available (`docker info`), because integration evidence is required. Set IAM-MP-01 to `IN_PROGRESS` in the Master Plan.

**Stop** if intervening commits changed persistence, the boundaries or IAM.

### M1 — Projects, entry points and boundary rules

- Create the `domains/iam-persistence` project, the IAM `./persistence` export and the database `./persistence` export. Entry files whose content arrives in later milestones start as `export {};`, as IAM-00 did. No stub behavior.
- Apply D-02 and D-03.
- Write `scripts/check-architecture-boundaries.mjs` with the full Section 27.5 table and wire `lint:boundaries`.
- Run `pnpm install`, `nx sync`.
- **Acceptance:** `pnpm lint` and `pnpm lint:boundaries` pass; `nx show project @vertex-os/iam-persistence --json` shows the four tags; `nx graph --file` shows `iam-persistence → iam` and `iam-persistence → database`, and no edge into either adapter or domain from `packages/database`, `apps/web` or `packages/ui`.
- **Sanity check:** temporarily break one rule (for example remove `'pg'` from the domain ban) and observe `lint:boundaries` fail on the matching case. Restore it and record the evidence.

### M2 — IAM core domain types, validation and port

- Implement Section 17 and the core test infrastructure (Section 17.5).
- Write the Section 27.1 unit tests.
- **Acceptance:** `nx run @vertex-os/iam:test`, `:typecheck`, `:lint` and `:build` pass; no Prisma/`pg`/framework import; the root `index.ts` still exports nothing.

### M3 — Prisma schema folder and IAM models

- Apply D-05 and write Section 15 in `iam.prisma` with every `@map`/`@@map`/`map:` name, all `onDelete`/`onUpdate: Restrict`, and `///` comments listing each model's database-only constraints.
- **Acceptance:** `pnpm db:validate` and `pnpm db:generate` pass, and the generated client compiles in `@vertex-os/database:build`.

### M4 — Migration

- Assemble the migration per Section 16 and complete the Section 16.3 checklist in Surprises or Progress.
- **Acceptance:** applying it with `prisma migrate deploy` to a fresh Testcontainers database succeeds; the drift gate exits 0; re-running deploy is a no-op.

### M5 — Database package entry, migrate command, migration tests

- Implement Section 19 items 3–8 and the Section 27.4 tests.
- **Acceptance:** `nx run @vertex-os/database:test:integration` passes. `pnpm db:migrate` against the local compose database (`pnpm infra:up`; the `vertexos` project only) applies the migration, a second run reports nothing pending, and `prisma migrate status` is up to date.

### M6 — Adapter implementation

- Implement Section 18.
- **Acceptance:** build, typecheck and lint of `@vertex-os/iam-persistence` pass; `dist/index.d.ts` references no `@prisma` or generated-client types (search gate, Section 29).

### M7 — Persistence integration tests

- Implement Sections 27.2 and 27.3, including the concurrency tests.
- **Acceptance:** `nx run @vertex-os/iam-persistence:test:integration` passes three times consecutively with no retry (flake check; TESTING Section 56). Record the timings.

### M8 — Documentation

- Section 20.4.
- **Acceptance:** README commands exist and work as documented, and the ENGINEERING rule matches the test that enforces it.

### M9 — Full verification

- Section 28, in order.
- **Acceptance:** every required command passes, or an environmental blocker is proven and recorded without weakening anything.

### M10 — Closeout

- Complete the living sections and set the Master Plan status to `AUDIT_REQUIRED` with the evidence summary.
- Produce the Section 39 report.
- Stop. Do not begin IAM-MP-02.

---

## 27. Required Tests

Test names state behavior (TESTING Section 46). Values central to a case stay explicit, and small builders cover the rest (TESTING Section 43). There are no sleeps and no retries.

### 27.1 Domain unit tests (`domains/iam`, Vitest)

| Area | Cases |
|---|---|
| Email | Trims surrounding whitespace. Lowercases the whole address, local part included. Preserves dots and `+` suffixes. Rejects: non-ASCII (for example `é`, and Turkish dotless `ı`); internal space or tab; control characters; zero or two `@`; empty local or domain part; more than 254 characters. Accepts exactly 254 characters. |
| Display and entity names | Trims. Accepts Arabic text. Enforces 1–200 **code points**, including an astral-plane character counted once. Rejects control characters and whitespace-only input. |
| Codes | Department/role, module and permission formats with valid and invalid fixtures (uppercase, non-ASCII letters such as `é` and `ı`, leading hyphen, double hyphen, two or four segments, wrong module prefix, length bounds). The fixture sets are exported from a test-support module, so Section 27.2 reuses them. |
| Identifiers | Accepts canonical lowercase UUID text. Rejects uppercase, braces and wrong lengths. |
| `newApplicationUser` | Initial states exactly `INVITED`/`PENDING`/`NOT_SENT`. Rejects a duplicate department, two primaries and duplicate roles. Accepts empty memberships and roles. Surfaces typed email and display-name failures. |
| Closed sets | Each state tuple equals the specification's list, in order. |

### 27.2 Database constraint tests (`domains/iam-persistence`, real PostgreSQL, raw SQL)

These prove that the database enforces each invariant independently of application code. Each case asserts the SQLSTATE (`23505`, `23514`, `23503`, `22P02` or `23502`) **and the constraint name**, so a dropped or renamed constraint fails.

| Invariant | Cases |
|---|---|
| Email unique | A duplicate is rejected by `iam_application_user_email_key`, also when the holder is TERMINATED. |
| Email normalized | Uppercase, surrounding space, non-ASCII, and no or two `@` are all rejected by `…_email_normalized_ck`. The Section 27.1 valid fixtures are accepted, and the invalid email fixtures that survive trimming are rejected, which is the format-parity test. |
| Identity pair | Issuer without subject and subject without issuer are rejected. Two unbound users coexist. A duplicate bound (issuer, subject) is rejected by `…_identity_key`. |
| Lifecycle checks | ACTIVE without subject, or without `first_activated_at`, is rejected by `…_active_ck`. INVITED with `first_activated_at` is rejected by `…_invited_ck`. SUSPENDED, DISABLED and TERMINATED are each accepted with and without `first_activated_at`. |
| Invitation consistency | SENT without `sent_at` and NOT_SENT with `sent_at` are rejected. FAILED is accepted with and without. |
| Enums | An unknown literal is rejected (`22P02`) for every enum column. |
| Codes and texts | Department, role, permission and module fixtures behave as in Section 27.1. `split_part` module mismatch, over-long names, and descriptions that are empty or too long are rejected. |
| System role | `is_system = true` with `INACTIVE` is rejected by `iam_role_system_active_ck`. |
| Membership | A duplicate (user, department) is rejected by the PK. A second primary for one user is rejected by `iam_department_membership_one_primary_key`. Many non-primary rows, and primaries of different users, are accepted. |
| Joins | Duplicate role assignment and duplicate role-permission rows are rejected by their PKs. |
| Foreign keys | Rows referencing missing users, departments, roles or permissions are rejected. Deleting a referenced user, department, role or permission is rejected (RESTRICT). |
| Version | `version = 0` is rejected on each versioned table. |
| Names | One test reads `pg_constraint`/`pg_indexes` for the IAM tables and asserts the complete set of expected names: no truncation and nothing missing. |

### 27.3 Repository tests (`domains/iam-persistence`, real PostgreSQL)

| Behavior | Cases |
|---|---|
| Create and round trip | Every spec Section 9.1 field maps correctly. The ID is a UUID. Version is 1. `created_at = updated_at = last_access_state_changed_at`. Memberships and roles are persisted as given (verified by SQL). |
| Create atomicity | An unknown department ID gives `unknown-reference`, and **no** user, membership or assignment row exists afterwards. The same holds for an unknown role ID. |
| Email conflict | `email-conflict`; the existing user is unchanged; none of the second draft's memberships or roles exist. |
| Concurrent create, same email | Several simultaneous calls give exactly one `created`; the rest are `email-conflict`. |
| `findById` | Existing ID gives the user; unknown ID gives `undefined`. |
| `updateDisplayName` | Success returns the written row: version + 1, `updated_at` advanced, `display_name` changed. Email, identity, states, `first_activated_at`, `invitation_*`, `last_access_state_changed_at` and `created_at` are byte-for-byte unchanged, which is the adapter-level immutability test. |
| Stale version | `version-conflict`, with the row unchanged. |
| Unknown ID | `not-found`. |
| Concurrent update, same version | Truly concurrent calls give exactly one `updated` and the rest `version-conflict`; the final version is + 1. |
| Outcome hygiene | Serialized non-success outcomes contain neither the email nor driver text. |
| Pool ownership | The repository never disconnects the shared client: after repository use, the same `DatabaseClient` still pings. |

### 27.4 Migration tests (`packages/database`, real PostgreSQL)

| Behavior | Cases |
|---|---|
| Reproducible from empty | A fresh container plus `prisma migrate deploy` applies every migration; every `_prisma_migrations` row is finished and not rolled back. |
| Idempotent application | A second deploy applies nothing and changes nothing. |
| No drift | `migrate diff --from-config-datasource --to-schema prisma/schema --exit-code` exits 0. |
| Convention | For every migration directory: `migration.sql` exists; after comments, the first statement is `BEGIN;` and the last is `COMMIT;`; there is no other `BEGIN`/`COMMIT`/`ROLLBACK`, no `CONCURRENTLY`, and no `CREATE SCHEMA`; `migration_lock.toml` names `postgresql`. |
| No reference data | After migration, every `iam_*` table is empty. |
| Private entry | `persistenceClientOf` returns a working client for a handle from `createDatabaseClient` and throws for a foreign object. |

### 27.5 Boundary regression cases (`pnpm lint:boundaries`, D-04)

**Violations.** Each must be rejected by the stated rule.

| # | Virtual file in | Import or code | Rule |
|---|---|---|---|
| V1 | `apps/web` | `@vertex-os/iam` | Nx: `scope:web` |
| V2 | `apps/web` | `@vertex-os/iam-persistence` | Nx: `scope:web` |
| V3 | `packages/ui` | `@vertex-os/iam` | Nx: `layer:ui` |
| V4 | `packages/database` | `@vertex-os/iam` | Nx: `layer:infrastructure` |
| V5 | `packages/database` | `@vertex-os/iam-persistence` | Nx: `layer:infrastructure` |
| V6 | `domains/iam` | `@vertex-os/database` | Nx: `layer:domain` |
| V7 | `domains/iam` | `@vertex-os/iam-persistence` | Nx: `layer:domain` |
| V8 | `domains/iam` | `pg` | Nx banned import (A-03) |
| V9 | `domains/iam` | `@prisma/client` | Nx banned import |
| V10 | `domains/iam-persistence` | `@prisma/client` | Nx banned import (`layer:adapter`) |
| V11 | `domains/iam-persistence` | `pg` | Nx banned import (`layer:adapter`) |
| V12 | `domains/iam-persistence` | `@nestjs/common` | Nx banned import (`layer:adapter`) |
| V13 | `apps/api` | `@vertex-os/iam/persistence` | `no-restricted-imports` |
| V14 | `apps/api` | `@vertex-os/database/persistence` | `no-restricted-imports` |
| V15 | `apps/api` | `@vertex-os/iam-persistence/src/index.js` | `no-restricted-imports` |
| V16 | `apps/api` | `../../../domains/iam-persistence/src/index.js` | `no-restricted-imports` and/or the Nx relative-path rule |
| V17 | `packages/database` | `@vertex-os/iam/persistence` | Nx and/or `no-restricted-imports` |
| V18 | `domains/iam` | `process.env['X']` | `no-restricted-syntax` |
| V19 | `domains/iam-persistence` | `process.env['X']` | `no-restricted-syntax` |

**Positive controls.** None may produce a boundary-rule message.

| # | Virtual file in | Imports |
|---|---|---|
| C1 | `domains/iam-persistence` | `@vertex-os/iam`, `@vertex-os/iam/persistence`, `@vertex-os/database`, `@vertex-os/database/persistence` |
| C2 | `apps/api` | `@vertex-os/iam`, `@vertex-os/iam-persistence`, `@vertex-os/database` |

A violation case that also yields unrelated messages still passes if the expected rule message is present. A control fails only on the three boundary rules, so incidental rules such as unused imports never decide a result.

---

## 28. Verification Commands

On Windows, run Nx with `NX_DAEMON=false` when capturing output. Use `export PATH="/c/Program Files/nodejs:$PATH"` and `builtin cd` in the Bash tool (repository-state memory). Run in this order and record every command with PASS, FAIL or BLOCKED:

```text
git status --short ; git rev-parse HEAD
pnpm install                       # lockfile importer for the new project
pnpm nx sync:check
pnpm db:validate
pnpm db:generate
pnpm nx run @vertex-os/iam:test
pnpm nx run-many -t lint,typecheck,build -p @vertex-os/iam @vertex-os/iam-persistence @vertex-os/database
pnpm lint:boundaries
pnpm nx run @vertex-os/database:test:integration
pnpm nx run @vertex-os/iam-persistence:test:integration      # ×3, flake check
pnpm infra:up && pnpm db:migrate && pnpm db:migrate          # local compose project vertexos only
pnpm nx show project @vertex-os/iam-persistence --json
pnpm nx graph --file=.nx/iam-01-graph.json
pnpm verify
NX_SKIP_NX_CACHE=true pnpm verify                            # uncached evidence
pnpm verify:full
pnpm deps:audit
```

If a sibling worktree exists under `.claude/worktrees/`, `pnpm format:check` in the main checkout also scans it. Use `prettier --check . '!.claude/**'` and say so (known machine quirk).

A check that did not run is reported as not run, never as passed. CI on the implementation commit (if the user authorizes a push) is the first proof on Linux and of R-07.

---

## 29. Required Search Gates

Before closeout, search the tree and interpret the matches:

| Search | Expected |
|---|---|
| `@prisma`, `generated/prisma`, `pg'` in `domains/iam/**` | none |
| `@prisma`, `from 'pg'` in `domains/iam-persistence/src/**` | none (Prisma only via `@vertex-os/database/persistence`) |
| `@prisma`, `generated` in `domains/iam-persistence/dist/index.d.ts` and `domains/iam/dist/index.d.ts` | none |
| `@vertex-os/iam/persistence`, `@vertex-os/database/persistence` across the repository | only in `domains/iam-persistence/**`, the boundary script and the ESLint configuration |
| `process.env` in new production `src` | none |
| `$disconnect` in `domains/iam-persistence/src` | none |
| `previewFeatures`, `CREATE TRIGGER`, `CREATE FUNCTION`, `CONCURRENTLY` | none |
| `INSERT INTO`, `seed` in `packages/database/prisma/**` | none |
| `@Injectable`, `@Module`, `@Controller` in `domains/**` | none |
| `keycloak`, `session`, `audit`, `oidc` in new executable code | none |
| `.only(`, `.skip(`, `retry:` greater than 0 in new tests | none |

---

## 30. Definition of Done

### Persistence model

- [ ] Seven IAM tables and seven enums exist exactly as in Section 15, with explicit names.
- [ ] Every Section 15 check, unique constraint, partial unique index and RESTRICT foreign key exists and is proven by a named-constraint test.
- [ ] No database default exists for lifecycle states or `is_system`.
- [ ] No trigger, function, preview feature or seed row exists.

### Migration

- [ ] One migration, wrapped `BEGIN;`/`COMMIT;`, without `CREATE SCHEMA`, generated section faithful.
- [ ] `migration_lock.toml` present.
- [ ] Reproducible from empty, idempotent, and drift-free (tests).
- [ ] `pnpm db:migrate` works locally and has no destructive mode.
- [ ] Recovery procedure documented; ENGINEERING Section 14 rule added.

### IAM core

- [ ] Domain types, validators, draft factory and port per Section 17; root export still empty.
- [ ] Validation rules identical to the database checks (parity tests).
- [ ] No Prisma, `pg`, framework or environment access.
- [ ] Unit-test target exists and passes.

### Adapter

- [ ] `@vertex-os/iam-persistence` with the four tags, a closed root export and only the factory exported.
- [ ] Shares the pool through `persistenceClientOf`; never disconnects.
- [ ] Typed outcomes; exhaustive enum mapping; constraint-name-based classification with observed shapes recorded.
- [ ] Prisma types absent from its public declarations.

### Boundaries

- [ ] D-02/D-03 rules active; A-03 `pg` ban active.
- [ ] `pnpm lint:boundaries` in `pnpm verify`; all Section 27.5 cases pass; sanity break observed failing.

### Verification

- [ ] Section 28 commands pass, including `pnpm verify:full` and `pnpm deps:audit`.
- [ ] Integration suites pass three consecutive runs without retry.
- [ ] Search gates are clean; no probe or scratch file remains; the working tree contains only Section 25 changes.

### Documentation

- [ ] README, ENGINEERING Section 14, the Master Plan (`AUDIT_REQUIRED` plus an amendment record) and this plan's living sections are synchronized.

### Scope control

- [ ] No IAM-MP-02+ work: no reference data, Audit, Keycloak, sessions, lifecycle transitions, administration, API or UI; no `apps/api` source change.

---

## 31. Exit Criteria (Master Plan IAM-MP-01)

| Master Plan exit criterion | Evidence in this plan |
|---|---|
| A clean database can migrate reproducibly | Section 27.4 (reproducible, idempotent, no drift) + `pnpm db:migrate` |
| Required structural invariants fail safely at the database boundary | Section 27.2 (named constraints, SQLSTATE) |
| Prisma types do not escape IAM's public API | D-02/D-03, Section 27.5 V9–V14, Section 29 search gates |
| Migration rollback/failure behavior is understood and tested as applicable | D-09 (P-05 evidence), Section 27.4 convention test, Section 16.5 procedure |
| No seed user or unapproved department data is introduced | Section 27.4 "no reference data" + Section 29 search gates |

Master Plan audit focus, and where each item is addressed:

| Audit focus | Addressed in |
|---|---|
| Migration SQL | Section 16.3 |
| Check, unique and index semantics | Sections 15 and 27.2 |
| Nullable identity binding | I-1 |
| `firstActivatedAt` invariants | `…_active_ck`, `…_invited_ck` |
| Concurrency and version fields | Sections 23 and 27.3 |
| Delete behavior | RESTRICT foreign keys; Section 27.2 |
| Domain/database separation | D-01…D-03, Section 27.5 |

---

## 32. Stop Conditions

Stop and report instead of improvising if:

1. intervening commits since `a1e087f` changed persistence, boundaries or IAM in a way that invalidates this plan;
2. Nx does not attribute `@vertex-os/iam/persistence` or `@vertex-os/database/persistence` to their projects, so that an unintended project could use them without a lint error the check can observe, and no restriction that stays within D-02/D-03 closes the gap;
3. making any rule pass would require widening `layer:domain` or `layer:infrastructure`, or switching `no-restricted-imports` off anywhere;
4. a required constraint cannot be expressed without a trigger, a function or a preview feature;
5. Prisma 7.10 rejects the schema folder or the migration wrapper, or its generated DDL differs materially from Section 15 in a way that `@map`/`map:` cannot fix;
6. `prisma migrate deploy` cannot run in the test harness without reaching a non-container database;
7. a specification contradiction affects a constraint's meaning, beyond the interpretations already fixed in D-12;
8. `pnpm install` would change any dependency version rather than only adding the new importer;
9. CI cannot obtain the schema engine (R-07) and the only fix is a supply-chain policy change. Record the options for the owner; do not decide unilaterally.

A normal implementation bug is not a stop condition. Fix it within this plan.

---

## 33. Risk Register

| ID | Risk | Mitigation |
|---|---|---|
| R-01 | First-migration precedent is weak (IAM-R02) | Explicit names, a review checklist, named-constraint tests, a drift gate, and the atomicity convention enforced by a test |
| R-02 | Hand-written constraints silently disappear in a later migration (invisible to drift, P-03) | Section 27.2 asserts every constraint by name and behavior; the names-catalog test |
| R-03 | Domain and database validation diverge | Shared fixtures drive both the unit tests and the SQL tests (parity) |
| R-04 | The subpath restriction is bypassed by a new project | Root-level ban plus per-project opt-in; `lint:boundaries` cases V13–V17 |
| R-05 | Wrapper hides the root cause of a migration failure | The Section 16.5 procedure; the wrapper's benefit (no partial schema) outweighs it |
| R-06 | Another domain's adapter queries IAM models through the shared client | Model prefix makes it greppable; ADR-0008 decision when a second adapter appears (Section 34) |
| R-07 | CI cannot obtain the Prisma schema engine for `migrate deploy` (P-10) | Observed on the first CI run; stop condition 9 |
| R-08 | Integration tests migrate the developer database | Explicit `DATABASE_URL`, a harness assertion (Section 22), P-09 |
| R-09 | Concurrency tests are flaky under load | No sleeps, real competing operations, assertions on final outcomes, three-run flake check, retry 0 |
| R-10 | The 1 s API statement timeout is too short once IAM runs in the API | Deferred explicitly to the first composing stage (Section 34) |
| R-11 | Scope creep into IAM-MP-02+ (IAM-R15) | Sections 9, 29 and 30 scope gates |

---

## 34. Repository State Required by the Next Plan (IAM-MP-02)

At acceptance, the next planner can rely on:

- the tables `iam_permission`, `iam_role` and `iam_role_permission`, with the three-segment code check, the module-prefix check and the "system role is ACTIVE" check, into which IAM-MP-02 synchronizes the spec Section 19 catalog and `system-administrator`;
- a working migration history and command (`pnpm db:migrate`), the atomic-migration convention and its enforcing test. IAM-MP-02 adds its own new migration, for Audit;
- the adapter pattern (D-01…D-03) and the boundary check (D-04), which IAM-MP-02's Audit persistence either reuses as is or promotes to ADR-0008. That choice is recorded in the IAM-MP-02 plan, with R-06 as input;
- `ApplicationUserRepository` (create, find, versioned display-name update) and the core validators;
- the observed Prisma 7.10 error shapes (Surprises), for further typed outcomes;
- open items passed on:
  - the API statement-timeout sizing when IAM persistence is first composed into `apps/api`;
  - the primary-membership switch ordering for IAM-MP-08 (Section 23);
  - interpretation I-4 (permission-code segments), confirmed by the audit;
  - A-02 and A-04, which stay with IAM-MP-03/06.

---

# Part V — Living Sections

## 35. Decision Log

Planning decisions D-01…D-12 are in Section 11 and locked. The executing agent records here only decisions taken during execution (implementation choices the plan left open, or deviations forced by a stop condition). Use the format: Date / Decision / Why / Evidence / Consequences / Revisit trigger.

*(none yet)*

---

## 36. Surprises & Discoveries

Record every observation that differs from this plan or that a later reader needs, especially the observed Prisma 7.10 error shapes (Section 18.3) and how CI obtained the schema engine (R-07). Use the format: Observed / Evidence / Impact / Action.

*(none yet)*

---

## 37. Progress

- [ ] M0 Preflight and baseline freeze
- [ ] M1 Projects, entry points and boundary rules
- [ ] M2 IAM core domain types, validation and port
- [ ] M3 Prisma schema folder and IAM models
- [ ] M4 Migration
- [ ] M5 Database package entry, migrate command, migration tests
- [ ] M6 Adapter implementation
- [ ] M7 Persistence integration tests
- [ ] M8 Documentation
- [ ] M9 Full verification
- [ ] M10 Closeout

---

## 38. Outcomes & Retrospective

*(completed at closeout: delivered, deliberately not delivered, verification evidence (command → result), deviations, remaining risks, final working tree)*

---

## 39. Required Final Execution Report

The implementing agent's final response contains:

1. **Executive result.** Exactly `IAM-01 COMPLETE — READY FOR INDEPENDENT AUDIT` or `IAM-01 NOT COMPLETE`.
2. **Baseline.** The starting commit, the ending working-tree state, and any difference from `a1e087f`.
3. **Files and areas changed**, grouped by purpose, and matched against Section 25.
4. **Persistence established.** The tables, enums, constraints (by name) and the migration name.
5. **Boundaries established.** Tags, constraints, restricted entry points, and the `lint:boundaries` case results.
6. **Explicit scope confirmation.** No IAM-MP-02+ work and no `apps/api` source change.
7. **Verification.** Every command run: PASS, FAIL or BLOCKED. "Not run" is never reported as "pass".
8. **Deviations and discoveries**, including the Prisma error shapes and R-07.
9. **Remaining blockers**, concrete ones only.
10. **Exact next step:**

```text
Perform an independent read-only audit of IAM-01 against docs/modules/iam.md,
IAM_MASTER_PLAN.md (IAM-MP-01), this plan, and the resulting repository state.
Do not begin IAM-MP-02 during that audit.
```

Then stop.

---

## 40. Independent Audit Gate

A separate conversation performs a read-only audit. It does not rely on the implementation report. It MUST at least:

- re-run the verification in Section 28 (at least `pnpm verify:full`, the uncached `pnpm verify`, `pnpm deps:audit` and `pnpm lint:boundaries`);
- review `migration.sql` line by line against Section 16.3 and Section 15;
- re-derive the constraint catalog from a freshly migrated database (`pg_constraint`, `pg_indexes`) and compare it with Section 15;
- run its own negative probes beyond Section 27.5, including a relative deep import into `domains/iam/src` from the adapter, and a subpath import from `packages/ui`;
- confirm that D-12 interpretations I-1…I-10 do not change specified semantics, and specifically rule on I-4;
- confirm that typed outcomes and new errors carry no personal data;
- confirm that no scope from Section 9 slipped in.

The verdict is exactly one of:

```text
IAM-01 ACCEPTED
```

or

```text
IAM-01 REJECTED — FIXES REQUIRED
```

Only `IAM-01 ACCEPTED`, followed by the owner's baseline acceptance, marks IAM-MP-01 `COMPLETE` and unlocks the IAM-MP-02 plan.

---

## 41. Plan Quality and Completion Rules

- Describe observed reality, not intention. Do not mark completion because files exist.
- Add no abstraction without a current consumer: one port, three operations.
- Prefer a database constraint over a comment, a test over a probe, and a named rule over an implicit one.
- Never weaken an existing rule or test to get green checks. Never disable a rule wholesale.
- Keep the plan self-contained for IAM-01. Link to canonical sources instead of copying them.

This plan becomes `COMPLETE` only when every Definition of Done item holds, the evidence is recorded, the probes are removed, canonical documentation agrees with executable reality, and the implementing agent has issued `IAM-01 COMPLETE — READY FOR INDEPENDENT AUDIT`. The next action is then an independent audit, not IAM-MP-02.
