# Vertex OS — Phase 0 Foundation Execution Plan

**Repository path:** `docs/plans/PHASE_0_PLAN.md`  
**Status:** COMPLETE  
**Plan type:** Living execution plan  
**Last updated:** 2026-09-22 05:35  
**Scope owner:** Vertex OS repository  
**Execution target:** Claude Code or Codex operating from the repository root

> This plan is the implementation contract for Phase 0 only. It must be kept current while Phase 0 is executed. It does not replace `AGENTS.md` or the canonical documents under `docs/`; it turns their accepted decisions into a bounded, verifiable implementation sequence.

---

## 1. Purpose / Big Picture

Phase 0 turns the current documentation-only Vertex OS repository into a real, runnable, testable software foundation without implementing any business module.

At the end of this phase, a developer must be able to clone the repository, install the pinned toolchain and dependencies, start the required local development infrastructure, run the backend and frontend, open the web application, and observe a minimal technical vertical slice working through the approved architecture:

    Browser
      -> React/Vite web application
      -> same-origin /api request
      -> NestJS/Fastify backend
      -> PostgreSQL readiness check

The repository must also have enforceable package boundaries, strict TypeScript, reproducible dependency management, Prisma 7.x configured against PostgreSQL, Fastify-aware tests, a minimal Playwright smoke path, structured verification commands, and CI-ready quality gates.

Phase 0 is successful when the foundation is demonstrably working and boring: there is one obvious way to install, run, test, validate, and build the repository, and no business behavior has been invented prematurely.

Phase 0 must stop before IAM implementation.

---

## 2. How to Use This Plan

This file is a living execution plan.

The executing agent MUST keep these sections current as work proceeds:

- `Progress`
- `Surprises & Discoveries`
- `Decision Log`
- `Outcomes & Retrospective`

Before modifying the repository, the agent MUST read:

- `AGENTS.md`
- `CLAUDE.md`
- `docs/PRODUCT.md`
- `docs/ARCHITECTURE.md`
- `docs/MODULES.md`
- `docs/ENGINEERING.md`
- `docs/SECURITY.md`
- `docs/TESTING.md`
- this file in full

Canonical documents continue to own architecture, product, security, engineering, module ownership, and testing policy. This plan owns only the Phase 0 execution sequence and Phase 0-specific implementation choices.

If this plan conflicts with a canonical document, the agent MUST NOT silently choose one. It MUST:

1. identify the conflict;
2. determine whether it is a stale-plan issue or an architecture-significant contradiction;
3. update this plan when the canonical document clearly resolves the question; or
4. stop before the conflicting change if resolving it would alter an architecture-significant decision requiring explicit approval under `AGENTS.md`.

The executing agent MUST NOT ask for routine “next step” approval between milestones. Once the user explicitly starts execution of this approved plan, proceed milestone by milestone until Phase 0 is complete or a genuine stop condition in this plan is reached.

The agent MUST NOT commit, push, deploy, create remote resources, or mutate external production systems unless separately authorized.

---

## 3. Current Repository State

At plan authoring time the repository is documentation-only.

The relevant tracked source set is:

    AGENTS.md
    CLAUDE.md
    docs/
      ARCHITECTURE.md
      ENGINEERING.md
      MODULES.md
      PRODUCT.md
      SECURITY.md
      TESTING.md

No application workspace, package manifest, source code, Prisma schema, migration history, Docker/Compose configuration, CI workflow, or business-domain implementation exists yet.

This matters because Phase 0 is not a refactor. It is the first executable foundation. Generator defaults therefore MUST NOT be allowed to make architectural decisions by accident.

---

## 4. Canonical Constraints Carried Into Phase 0

The following constraints are already decided and are not reopened by this plan.

### 4.1 Architecture

Vertex OS is a TypeScript modular monolith in a pnpm workspace managed by Nx.

The backend is NestJS on Fastify.

The external API style is REST with OpenAPI.

PostgreSQL is the primary transactional database.

Prisma ORM 7.x is the V1 ORM/migration baseline.

The frontend is React + Vite.

The frontend uses TanStack Router and TanStack Query where they provide actual value.

Tailwind CSS is the styling foundation.

Vertex OS uses its own custom UI/design system. `shadcn` MUST NOT be introduced.

Development is local-first.

No microservices, Kubernetes, message broker, Redis/cache, general background queue, Temporal runtime, search service, S3-compatible storage, or production deployment topology is introduced in Phase 0.

### 4.2 Business boundaries

Phase 0 MUST NOT create or implement any business domain.

No `domains/iam`, CRM, Sales, Projects, Tasks, Finance, Audit, or other domain package is created merely to match the conceptual architecture tree.

No fake entities, fake repositories, fake services, or placeholder domain interfaces are permitted.

### 4.3 Authentication

The accepted future authentication architecture is Keycloak + OIDC Authorization Code Flow with PKCE, with the Vertex backend acting as a confidential-client BFF and the browser holding only an opaque secure application-session cookie.

Phase 0 MUST preserve this architecture but MUST NOT implement IAM or the login/session flow.

A Keycloak runtime, realm, client, application session store, credential flow, authorization model, login endpoint, or authentication guard MUST NOT be introduced solely to make the architecture look complete.

Keycloak becomes an actual required local dependency when the IAM specification and implementation introduce an authentication journey.

### 4.4 Security

No credentials or secrets are committed.

Browser application code never stores IdP access, refresh, or ID tokens.

CORS is not opened broadly for development convenience.

The preferred local browser topology is same-origin from the browser’s perspective, using the Vite development proxy for `/api`.

Production API documentation UI must not become public by default.

Security controls added in Phase 0 must be real controls, not placeholder comments.

### 4.5 Engineering

Backend business truth remains backend-authoritative.

Business logic must not live in React components, controllers, Prisma queries, database triggers, or generic shared utilities.

Prisma is an infrastructure concern and generated Prisma types must not become public application/domain contracts.

Complexity must earn abstraction.

No generic unit-of-work, repository framework, event bus, outbox framework, service locator, or “enterprise base class” is introduced.

### 4.6 Testing

Testing is risk-based, not test-pyramid or coverage-percentage driven.

Vitest is the default TypeScript test runner.

React Testing Library is used for frontend behavior.

Persistence/API integration tests use real PostgreSQL, preferably through Testcontainers.

Nest/Fastify API tests use Fastify injection by default.

Playwright is used for browser E2E.

No Jest stack is introduced accidentally by generator defaults.

---

## 5. Phase 0 Scope

Phase 0 includes only the foundation necessary to make the repository executable and enforce the already-approved architecture.

It includes:

- root pnpm/Nx workspace setup;
- runtime/package-manager pinning;
- strict TypeScript baseline;
- ESLint and formatting;
- real `apps/api`;
- real `apps/web`;
- real `packages/database`;
- PostgreSQL local-development support;
- Prisma ORM 7.x configuration;
- configuration validation;
- NestJS/Fastify application bootstrap;
- minimal liveness and readiness endpoints;
- consistent RFC 9457-compatible HTTP problem responses;
- development-safe OpenAPI generation;
- security headers and conservative CORS behavior;
- request correlation and structured logging baseline;
- React/Vite application bootstrap;
- TanStack Router + Query foundation actually used by the technical shell;
- Tailwind foundation;
- same-origin `/api` development proxy;
- one minimal web-to-API technical status interaction;
- Nx/ESLint dependency-boundary enforcement for projects that actually exist;
- Vitest/RTL/Testcontainers/API integration test harnesses;
- one small Playwright smoke journey;
- deterministic build and verification scripts;
- provider-neutral CI commands;
- a provider-specific CI workflow only when the live repository proves which provider is in use;
- root developer documentation reflecting commands that actually work;
- small updates to agent documentation only where the new executable commands need to be routed.

---

## 6. Explicit Non-Goals

Phase 0 does NOT include:

- `docs/modules/iam.md`;
- IAM implementation;
- Keycloak runtime integration;
- login/logout/session behavior;
- RBAC or resource authorization;
- application users, memberships, roles, permissions, or scopes;
- business database tables;
- business migrations;
- seed data;
- CRM or any other business module;
- custom Vertex UI component library implementation;
- design-token system implementation;
- `packages/ui` unless a genuinely reusable Phase 0 UI abstraction becomes necessary, which is not currently expected;
- `packages/contracts` merely for a health endpoint;
- `packages/api-client` merely for a health endpoint;
- `packages/shared` as a dumping ground;
- `packages/config` if configuration is only consumed by one application;
- `packages/testing` before there are real reusable testing utilities;
- domain events;
- outbox;
- workers;
- queues;
- Redis;
- Temporal;
- email;
- notifications;
- file persistence;
- object storage;
- S3;
- search infrastructure;
- production deployment design;
- Kubernetes;
- microservices;
- full observability backend;
- a SIEM;
- a generalized feature-flag system;
- full localization infrastructure;
- full design-system work;
- coverage thresholds;
- artificial demo business features.

If a generator creates any of these concepts by default, remove or disable them unless another Phase 0 requirement actually uses them.

---

## 7. Phase 0 Success Criteria

Phase 0 is complete only when all of the following are true.

A fresh developer environment can install from the committed lockfile without inventing dependency versions.

The repository pins a supported Node.js LTS line and an exact package-manager version.

`apps/api`, `apps/web`, and `packages/database` are real, used projects rather than placeholders.

The API runs on NestJS with the Fastify adapter.

The web app runs on React/Vite and reaches the API through `/api` without requiring permissive browser CORS.

`GET /api/health/live` proves the API process is live without requiring PostgreSQL.

`GET /api/health/ready` proves PostgreSQL connectivity and returns a non-ready result when the database is unavailable.

Prisma ORM 7.x validates and generates successfully against a PostgreSQL configuration without fake business models.

At least one persistence/API integration test uses a real ephemeral PostgreSQL instance through Testcontainers or an equally reproducible mechanism.

A browser smoke test proves the real web application can load and observe the API liveness state.

No authentication or business-domain implementation exists.

No committed secret exists.

No `shadcn`, Jest, Express HTTP platform, SQLite substitution, Redis, message broker, Temporal, S3, or placeholder business package has slipped into the repository.

Project boundaries prevent the frontend from importing backend/database-only implementation code.

Formatting, linting, type checking, architecture checks, unit/application tests, builds, integration tests, and smoke E2E have explicit repository commands.

The exact commands documented in `README.md` and `AGENTS.md` have been executed successfully before Phase 0 is declared complete.

---

## 8. Version Resolution Policy

Do not let scaffolding commands choose major versions implicitly.

The approved implementation lines for Phase 0 are:

- Node.js: 24 LTS line.
- Nx: 23.x stable line.
- NestJS: 12.x stable line.
- React: 19.x stable line.
- Vite: 8.x stable line.
- Tailwind CSS: 4.x stable line.
- Vitest: 5.x stable line.
- Prisma ORM / Prisma Client: 7.x stable line.
- PostgreSQL: a currently supported stable major suitable for local development and Testcontainers.
- TanStack Router / Query: current stable releases compatible with React 19.
- Playwright: current stable release compatible with the selected Node line.
- Testcontainers for Node.js: current stable release compatible with the selected Node line.

Before installing dependencies, verify current stable releases from official sources.

Patch/minor releases may be newer than those known when this plan was authored. Select the latest stable compatible release within the approved major line unless a compatibility issue requires a lower stable release.

Do not use alpha, beta, RC, canary, nightly, experimental package-manager engines, or preview framework releases unless this plan is explicitly amended and the user approves the architecture-significant change.

Record the exact resolved versions in the `Decision Log`.

The committed manifest and lockfile, not prose in this plan, become the executable version truth after installation.

---

## 9. Target Repository Shape at Phase 0 Completion

The repository should grow only where Phase 0 has real content.

A likely shape is:

    vertex-os/
      AGENTS.md
      CLAUDE.md
      README.md
      package.json
      pnpm-lock.yaml
      pnpm-workspace.yaml
      nx.json
      tsconfig.base.json
      eslint.config.*
      prettier.config.*
      .editorconfig
      .gitignore
      .node-version or equivalent runtime pin
      .env.example
      apps/
        api/
          ...
        web/
          ...
      packages/
        database/
          ...
      infra/
        compose.yaml
      docs/
        PRODUCT.md
        ARCHITECTURE.md
        MODULES.md
        ENGINEERING.md
        SECURITY.md
        TESTING.md
        plans/
          PHASE_0_PLAN.md

Additional files are allowed when required by the chosen official tooling.

Do not create empty directories merely so the tree visually matches `docs/ARCHITECTURE.md`.

In particular, the following SHOULD NOT exist at the end of Phase 0 unless they contain genuinely required, used implementation:

    domains/
    packages/ui/
    packages/contracts/
    packages/shared/
    packages/config/
    packages/testing/
    packages/api-client/

---

## 10. Progress

The executing agent MUST update this checklist as work proceeds. Use actual timestamps. Never mark an item complete merely because files were written; mark it complete only after its acceptance checks pass.

- [x] M0 — Repository preflight and version freeze. *(2026-09-22 03:11 — repository confirmed docs-only and not a Git repository; Node 24.21.0, Docker 29.2.1 daemon reachable, Compose v5.1.0; exact versions frozen in D-009…D-016.)*
- [x] M1 — Root workspace and toolchain foundation. *(2026-09-22 03:20 — `pnpm install` and `pnpm install --frozen-lockfile` succeed with one `pnpm-lock.yaml`; `nx report` lists nx/@nx/* 23.2.1 and TypeScript 6.0.3 with the four registered plugins; `prettier --check .` and the ESLint flat config load cleanly; `pnpm verify` runs end-to-end on the still-empty workspace. No generator was used.)*
- [x] M2 — Real projects and enforceable dependency boundaries. *(2026-09-22 05:05 — `nx show projects` lists `@vertex-os/api`, `@vertex-os/web`, `@vertex-os/database`, `@vertex-os/web-e2e` with `type:*`/`scope:*`/`layer:*` tags; each builds or typechecks; temporary probe files proved that `nx run <project>:lint` rejects web → `@vertex-os/database` ("scope:web can only depend on libs tagged scope:web"), web → `@prisma/*`/`@nestjs/*` (banned external imports) and relative cross-project imports; lockfile/source searches found no Jest runner, shadcn, Express platform, Redis, broker, Temporal, S3 or domain package. Execution resumed in a second session at 04:42 after the first session ended mid-M2; M0/M1/M3 evidence was re-verified first.)*
- [x] M3 — PostgreSQL + Prisma 7 database foundation. *(2026-09-22 03:36 — model-free `schema.prisma` validates and generates with Prisma 7.10.0 and denied engine downloads; `packages/database` builds/typechecks/lints; Testcontainers integration test (2 tests, real `postgres:18.6-alpine`) passes and cleans up; `infra:up`/`infra:down` are repeatable with the named volume surviving `down`; `.env` is generated idempotently and ignored.)*
- [x] M4 — NestJS/Fastify API foundation. *(2026-09-22 05:00 — `createApp()` factory shared by `main.ts`, inject tests and OpenAPI generation; 20 fast tests (Fastify inject, no PostgreSQL) and 1 Testcontainers integration test pass; the built server answered live 200, ready 200 against local PostgreSQL, ready 503 `NOT_READY` problem after `pnpm infra:down` (live stayed 200) and ready 200 again after `infra:up`; `pnpm openapi:generate` emits both health routes, byte-identical on regeneration.)*
- [x] M5 — React/Vite web foundation and technical vertical slice. *(2026-09-22 05:15 — `pnpm dev` served the shell at `http://127.0.0.1:4200`; the browser showed "Vertex OS" / "API connection available" with the request going to the web origin `http://127.0.0.1:4200/api/health/live` (Vite proxy); after the API process was stopped the page switched to "API connection unavailable" without reload and without JS errors; 5 RTL tests pass, including automatic recovery; production bundle 322 kB with React's production runtime.)*
- [x] M6 — Testing and end-to-end verification harness. *(2026-09-22 05:20 — Vitest is the only unit/application runner; `pnpm verify` exit 0 and `pnpm verify:full` exit 0 (Prisma validate/generate, 3 Testcontainers tests, Playwright smoke `1 passed`); integration containers cleaned up; stopping the API turned the browser status to "unavailable" without a crash.)*
- [x] M7 — CI/security-quality integration appropriate to the live repository. *(2026-09-22 05:25 — the working tree is not a Git repository and has no remote, so no CI provider is provable and no provider workflow was created (D-007); provider-neutral `pnpm verify`, `pnpm verify:full` and `pnpm deps:audit` (D-019) exist and pass; secret scanning awaits a provider.)*
- [x] M8 — Documentation synchronization and final Phase 0 acceptance. *(2026-09-22 05:33 — `README.md` created with only observed commands; `AGENTS.md` Verification/Routing updated (CRLF preserved); canonical documents reviewed, no contradiction found, unchanged; stale-technology, secret and tracked-set checks done.)*
- [x] Phase 0 final verification completed with observed evidence. *(2026-09-22 05:30 — from a cleaned tree: frozen install and every Section 21 command exit 0; see "Final acceptance evidence".)*
- [x] Plan status changed to `COMPLETE`.
- [x] Execution stopped before IAM work. *(No `docs/modules/iam.md`, no domain package, no authentication code or Keycloak runtime.)*

---

## 11. Surprises & Discoveries

Record material facts discovered during implementation that were not known when this plan was authored.

Use entries in this form:

- **YYYY-MM-DD HH:MM — Discovery:** concise fact.
  **Evidence:** command/file/output that proves it.
  **Impact:** what changed, or why no plan change was required.

At authoring time:

- None.

During execution:

- **2026-09-22 02:40 — Discovery:** The npm `latest` dist-tag of the `prisma` CLI package points at a prerelease (`8.0.0-rc.15`); the latest stable 7.x is `7.10.0` (`prev` tag). `@prisma/client` and `@prisma/adapter-pg` `latest` are `7.10.0`.
  **Evidence:** `npm view prisma dist-tags --json` → `"latest": "8.0.0-rc.15"`, `"prev": "7.10.0"`.
  **Impact:** All Prisma packages are pinned to exact `7.10.0`; an unpinned `pnpm add prisma` would have silently violated the Prisma 7.x baseline (AC-06). The public Prisma docs site now defaults to 8.x content, so Prisma 7 behaviour is verified against the Prisma 7 upgrade guide and the installed CLI rather than the default docs pages.
- **2026-09-22 02:45 — Discovery:** TypeScript `latest` is `7.0.2` (native compiler), but `typescript-eslint@8.70.1` declares `typescript >=4.8.4 <6.1.0`. TypeScript 6.0 is the final JS-based line; it changes several defaults (`types` → `[]`, `rootDir` → tsconfig directory, `module` → `esnext`, `strict` → `true`) but keeps `experimentalDecorators`/`emitDecoratorMetadata`, which NestJS requires.
  **Evidence:** `npm view typescript-eslint@8.70.1 peerDependencies`; TypeScript 6.0 release notes.
  **Impact:** TypeScript is pinned to `6.0.3`. The affected defaults are set explicitly in `tsconfig.base.json`.
- **2026-09-22 02:50 — Discovery:** `@nx/nest@23.2.1` peer-depends on `@nestjs/core >=10 <12`, and `@nx/node@23.2.1` depends on `@nx/jest` (which pulls Jest 30 libraries). `@nx/vitest@23.2.1` declares `vitest ^3 || ^4` only.
  **Evidence:** `npm view @nx/nest@23.2.1 peerDependencies`; `npm view @nx/node@23.2.1 dependencies`; `npm view @nx/vitest@23.2.1 peerDependencies`.
  **Impact:** Nx 23 and NestJS 12 are not mutually incompatible (Nx core has no Nest constraint), so this is not a stop condition. The API project is authored directly instead of via `@nx/nest`/`@nx/node`, and Vitest 5 runs through explicit Nx targets instead of the `@nx/vitest` inference plugin (D-010, D-012).
- **2026-09-22 02:55 — Discovery:** NestJS 12 ships ESM-only packages (CommonJS consumers rely on `require(esm)`).
  **Evidence:** NestJS 12 migration guide.
  **Impact:** `apps/api` is an ESM project (`"type": "module"`, `module: nodenext`); relative imports use `.js` extensions.
- **2026-09-22 03:00 — Discovery:** `eslint-plugin-react`, `eslint-plugin-jsx-a11y` and `eslint-plugin-import` (required by `@nx/eslint-plugin`'s React flat config) do not declare ESLint 10 support.
  **Evidence:** `npm view eslint-plugin-react@7.37.5 peerDependencies` etc.
  **Impact:** ESLint stays on the 9.x line (`9.39.5`), matching the current Nx generator output (D-013).
- **2026-09-22 03:05 — Discovery:** pnpm 11+ replaced `onlyBuiltDependencies` with the `allowBuilds` map in `pnpm-workspace.yaml`; `strictDepBuilds` defaults to `true`, so unapproved build scripts fail installation.
  **Evidence:** pnpm settings reference (`/settings/build`); `ERR_PNPM_IGNORED_BUILDS` observed in the scratch reference workspace for `@parcel/watcher`, `@swc/core`, `nx`, `unrs-resolver`.
  **Impact:** Build scripts are approved per package with `allowBuilds` (D-014).
- **2026-09-22 03:08 — Discovery:** The Docker Desktop daemon was not running at preflight; the CLI (29.2.1) and Compose (v5.1.0) were installed. Starting Docker Desktop made the Linux engine reachable (`docker info` → `29.2.1 linux`).
  **Impact:** Real-PostgreSQL verification is possible; no SQLite/mocks substitution is needed.
- **2026-09-22 03:18 — Discovery:** Starting Docker Desktop created an empty directory `docker/postgres/init-databases.sh/` inside the repository. The daemon recreated a missing bind-mount path belonging to a stale container (`vertex-media-os-postgres-1`) from an earlier, now-deleted `D:\vertex-media-os\docker-compose.yml`. The machine also holds other stale artifacts of earlier iterations of this product (compose projects/containers named `vertex-media-os-*`, `vertex-os-*`, `vertex-media-core-*`, including MinIO, Redis and Mailpit containers, and a `vertex-media-os_postgres-data` volume), and host port `127.0.0.1:5432` is occupied by an unrelated container.
  **Evidence:** directory timestamp `02:48` equals the Docker Desktop start; `docker inspect vertex-media-os-postgres-1` shows the bind mount `.../d/vertex-media-os/docker/postgres/init-databases.sh -> /docker-entrypoint-initdb.d/10-init-databases.sh`; `docker compose ls -a`; `docker ps`.
  **Impact:** The empty daemon-created directory was removed (it contained nothing and was not user content). The Phase 0 Compose project uses the distinct project name `vertexos` so it can never adopt or remove those stale containers as "orphans", and the local PostgreSQL host port is configurable through `POSTGRES_PORT` in the ignored `.env`. No pre-existing container, volume or compose project is touched.

- **2026-09-22 03:40 — Discovery:** pnpm 12 enforces a default one-day `minimumReleaseAge` non-strictly: while adding `@nestjs/*@12.0.4` (published 16 h earlier) it installed the version anyway and silently wrote a `minimumReleaseAgeExclude` block into `pnpm-workspace.yaml`.
  **Evidence:** `pnpm-workspace.yaml` after the install contained `minimumReleaseAgeExclude: ['@nestjs/common@12.0.4', …]`; `pnpm update` under the strict policy reported "…was published at 2026-09-21T08:05:39Z, within the minimumReleaseAge cutoff".
  **Impact:** The policy was made explicit and strict (D-017), the lockfile was rebuilt (`pnpm clean --lockfile && pnpm install`), and NestJS resolved to 12.0.3. The only other resolution change was the transitive `yaml` 2.9.0 → 2.9.1.

- **2026-09-22 04:42 — Discovery:** The first execution session ended mid-M2 (only `apps/api/src/config/*` existed for the API). A second session resumed from the recorded state after re-reading all canonical documents and re-verifying the M0/M1/M3 evidence (`pnpm install --frozen-lockfile`, Nx project graph, local PostgreSQL healthy).
  **Impact:** No rework; execution continued at M2. Non-interactive scripted Nx runs use `NX_DAEMON=false`: on Windows the daemon spawned by the Nx client inherits the output pipe, so piping `nx …` output (for example into `tail`) never reaches EOF. Interactive use is unaffected.
- **2026-09-22 04:50 — Discovery:** `@nestjs/platform-fastify@12.0.3` pins `fastify@5.12.4`, which is affected by GHSA-4mh8-r7rc-xpvc (moderate; HTTP/2 + `reply.trailer()` DoS, fixed in 5.12.5). D-009's note that 5.12.5 is "bundled by platform-fastify" was true only for the cooldown-excluded 12.0.4. Two `fastify` copies also broke the API's type check (`app.register(helmet)`).
  **Evidence:** `pnpm-lock.yaml` (`@nestjs/platform-fastify@12.0.3` → `fastify: 5.12.4`); `npm view @nestjs/platform-fastify@12.0.4 dependencies` → `fastify: 5.12.5`; fastify v5.12.5 release notes.
  **Impact:** D-018 (patch-level override to 5.12.5). Not exploitable here (HTTP/1.1, no trailers), but the runtime now carries the patch and a single `fastify` copy.
- **2026-09-22 04:55 — Discovery:** Vite 8's Oxc transformer honours `experimentalDecorators`/`emitDecoratorMetadata` from the project tsconfig, so Vitest emits the `design:paramtypes` metadata Nest dependency injection needs without SWC or another plugin.
  **Evidence:** a throwaway probe test resolving a class-typed constructor dependency through `@nestjs/testing` passed and was deleted; NestJS's own starter uses a plain `vitest.config.ts`.
  **Impact:** No additional test tooling. The Phase 0 API still injects its two dependencies through explicit tokens.
- **2026-09-22 04:58 — Discovery:** ESLint 9.x reached end-of-life on 2026-08-06 (pnpm prints `deprecated eslint@9.39.5`). `eslint-plugin-react@7.37.5`, `eslint-plugin-jsx-a11y@6.10.2` and `eslint-plugin-import@2.32.0` (latest; required by Nx's React flat preset) still declare no ESLint 10 support.
  **Evidence:** https://eslint.org/version-support; `npm view <plugin> peerDependencies.eslint`.
  **Impact:** D-013 retained and amended; recorded as a residual risk (development-only tool, not in any runtime path).
- **2026-09-22 04:58 — Discovery:** `@tanstack/react-query@5.103.2` (D-009) was published less than 24 h before resolution and was rejected by the strict cooldown (D-017) with `ERR_PNPM_NO_MATURE_MATCHING_VERSION`.
  **Impact:** `^5.103.1` (newest mature release) is used; the cooldown worked as designed.
- **2026-09-22 05:00 — Discovery:** `pnpm audit` reports four advisories, all in packages pinned exactly by tools: `smol-toml@1.6.1` (by `nx`), `mysql2@3.15.3` ×2 (by the `prisma` CLI) and `deepmerge-ts@7.1.5` (by `@prisma/config`, fixed only in 8.x). None is in the API runtime path or reachable the way its advisory requires.
  **Impact:** D-019 (reviewed, documented audit exceptions; `pnpm deps:audit` fails on any other advisory).
- **2026-09-22 05:05 — Discovery:** The installed graph contains `@jest/diff-sequences` (an algorithm package used by `nx` core) and `@radix-ui/*` (used by Prisma Studio inside the `prisma` CLI).
  **Evidence:** `pnpm why -r @jest/diff-sequences`; `pnpm why -r @radix-ui/react-slot`.
  **Impact:** None: no Jest runner/configuration exists, Radix is not a web dependency and is not in the web bundle, and no shadcn package exists.
- **2026-09-22 05:10 — Discovery:** Nx loads the workspace `.env` into the environment of every task. The M3-era `.env.example` set `NODE_ENV=development` for the API, so `nx run @vertex-os/web:build` produced a "production" bundle containing React's development runtime (553 kB, React DevTools banner). An earlier `loadEnv()` in the Vite config had the same effect.
  **Evidence:** bundle source-map analysis (`react-dom-client.development.js`); `nx/dist/src/tasks-runner/task-env.js`.
  **Impact:** D-020. `NODE_ENV` was removed from `.env.example` and from the local `.env` (only that line); the Vite config refuses a production build with a non-production `NODE_ENV`; the bundle is now 322 kB with React's production runtime.
- **2026-09-22 05:13 — Discovery:** TanStack Query pauses `refetchInterval` while the document is hidden and re-checks on focus; the desktop app's browser pane reported `visibilityState: hidden`, so the manual recovery observation could not complete in that pane.
  **Impact:** Automatic recovery is proven by a fake-timer RTL test (which fails when the interval is removed) instead of by manual observation.
- **2026-09-22 05:16 — Discovery:** The M3 sources had never been run through Prettier (M1's format check predates them), and most differences were 80-column wraps.
  **Impact:** `printWidth: 100` set explicitly; `pnpm format` applied (line wrapping only).

Routine package installation output does not belong here. Record only discoveries that change implementation, risk, or understanding.

---

## 12. Decision Log

Keep this section current.

### D-001 — Phase 0 is a technical foundation, not the first business module

**Decision:** No business domain is created in Phase 0.

**Reason:** Canonical architecture explicitly requires incremental growth and forbids placeholder packages. IAM behavior requires its own module specification.

**Consequence:** Phase 0 ends with infrastructure/application shells only.

### D-002 — Prove a narrow technical vertical slice

**Decision:** The demonstrable Phase 0 path is browser -> web -> API liveness plus API -> PostgreSQL readiness, rather than a fake business CRUD feature.

**Reason:** This proves the important foundation without inventing domain behavior.

### D-003 — Keycloak is deferred until IAM

**Decision:** Preserve the approved Keycloak/BFF architecture in configuration boundaries and documentation, but do not run or configure Keycloak in Phase 0.

**Reason:** No Phase 0 behavior consumes authentication. Adding an unused IdP would violate the “complexity earns abstraction” and no-placeholder principles.

**Revisit:** `docs/modules/iam.md` and IAM implementation.

### D-004 — Only create packages with real consumers

**Decision:** Phase 0 creates `packages/database` because the API readiness path and integration tests consume it. Other conceptual packages are deferred.

### D-005 — Same-origin browser development path

**Decision:** Browser requests use relative `/api` URLs and the Vite dev proxy routes them to the local API.

**Reason:** This avoids opening broad CORS policy solely for local development and resembles the intended browser/BFF topology more closely.

### D-006 — No fake Prisma model or empty business migration

**Decision:** Configure Prisma 7.x and prove PostgreSQL connectivity without inventing a domain model.

**Reason:** A fake `User`, `Example`, or `Health` table would become accidental domain/schema debt.

### D-007 — Provider-specific CI is evidence-driven

**Decision:** Root verification commands are mandatory. A provider-specific workflow is created only if the live repository identifies its source-control/CI provider.

**Reason:** A ZIP snapshot does not prove GitHub, GitLab, or another CI host.

### D-008 — No generalized shared UI package in Phase 0

**Decision:** Keep the minimal technical shell inside `apps/web`.

**Reason:** The custom Vertex UI system is an architectural direction, but Phase 0 has no real reusable component set yet. A package containing one invented primitive would be a placeholder.

### D-009 — Exact version freeze (2026-09-22)

**Decision:** The following exact versions were selected after checking the npm registry `dist-tags`, release dates and peer ranges on 2026-09-22. All are stable (non-prerelease) releases in the approved lines.

| Concern | Selection |
| --- | --- |
| Node.js | 24.21.0 (installed; `.node-version`), engines `>=24.0.0 <25` |
| pnpm | 12.5.1 (`packageManager`) |
| Nx | 23.2.1 (`nx`, `@nx/js`, `@nx/eslint`, `@nx/eslint-plugin`, `@nx/vite`, `@nx/playwright`, `@nx/devkit`) |
| TypeScript | 6.0.3 |
| NestJS | 12.0.3 (`core`, `common`, `platform-fastify`, `testing`; 12.0.4 is excluded by the one-day release cooldown, D-017), `@nestjs/swagger` 12.0.1, `fastify` 5.12.5 (the version bundled by `platform-fastify`), `reflect-metadata` 0.2.2, `rxjs` 7.8.2 |
| Fastify security | `@fastify/helmet` 13.1.1, `@fastify/static` 10.1.4 (Swagger UI in development only) |
| Validation | `zod` 4.6.5 |
| React | 19.3.0 (`react`, `react-dom`, `@types/react`, `@types/react-dom`) |
| Vite | 8.3.0, `@vitejs/plugin-react` 6.1.1 |
| Tailwind CSS | 4.3.3 (`tailwindcss`, `@tailwindcss/vite`) |
| TanStack | `@tanstack/react-router` 1.170.38, `@tanstack/router-plugin` 1.168.40, `@tanstack/react-query` 5.103.2 |
| Vitest | 5.0.1 (`vitest`, `@vitest/coverage-v8`), `jsdom` 30.1.0 |
| Testing Library | `@testing-library/react` 16.3.3, `@testing-library/dom` 10.4.2, `@testing-library/jest-dom` 7.0.1 |
| Prisma | 7.10.0 (`prisma`, `@prisma/client`, `@prisma/adapter-pg`) |
| PostgreSQL | `postgres:18.6-alpine` for both Compose and Testcontainers |
| Playwright | `@playwright/test` 1.63.0 |
| Testcontainers | `testcontainers` 12.1.0, `@testcontainers/postgresql` 12.1.0 |
| ESLint | 9.39.5, `typescript-eslint` 8.70.0, `eslint-config-prettier` 10.1.8, `eslint-plugin-react` 7.37.5, `eslint-plugin-react-hooks` 7.1.1, `eslint-plugin-jsx-a11y` 6.10.2, `eslint-plugin-import` 2.32.0, `eslint-plugin-playwright` 2.12.0, `jsonc-eslint-parser` 3.3.0 |
| Prettier | 3.9.8 |

**Reason:** Section 8 requires explicit, verified stable selections. Prisma's `latest` tag is a prerelease and TypeScript's `latest` is unsupported by the lint stack, so implicit resolution would have violated the baseline (see Surprises & Discoveries).

**Consequence:** The committed manifests and `pnpm-lock.yaml` become the executable truth after installation.

**Corrections (2026-09-22, second session):** `@nestjs/platform-fastify@12.0.3` pins `fastify@5.12.4`, not 5.12.5; the runtime is forced to 5.12.5 by D-018. `@tanstack/react-query` resolved to 5.103.1 because 5.103.2 was inside the cooldown (D-017). `@testing-library/jest-dom` was not installed (D-021). `@playwright/test` 1.63.0 was added at the workspace root next to `@nx/playwright`.

### D-010 — API project is authored directly, not through `@nx/nest` / `@nx/node`

**Decision:** `apps/api` is a package-based Nx project with explicit `build`/`serve`/`test` targets (TypeScript `tsc -b` build; Node runs the emitted ESM output). No `@nx/nest` or `@nx/node` plugin is installed.

**Reason:** `@nx/nest@23.2.1` does not support NestJS 12 and `@nx/node@23.2.1` pulls Jest libraries through `@nx/jest`. The plan treats generators as file producers, not architectural authorities; the same compiler (`tsc`) is used for development and production, avoiding drift between a dev transpiler and the production build.

### D-011 — TypeScript 6.0.x, not 7.x

**Decision:** Pin `typescript@6.0.3`.

**Reason:** `typescript-eslint@8.70.1` supports `<6.1.0`; TypeScript 7 is unsupported by the lint stack. TypeScript 6.0 keeps the decorator options NestJS requires. Defaults changed in 6.0 (`types`, `rootDir`, `module`) are set explicitly.

### D-012 — Vitest 5 through explicit Nx targets

**Decision:** Unit/application tests run through explicit `nx:run-commands` targets (`vitest run`) defined once in `nx.json` `targetDefaults`; `@nx/vitest` is not installed.

**Reason:** `@nx/vitest@23.2.1` declares `vitest ^3 || ^4`; Vitest 5.0.1 is the approved line and is compatible with Vite 8. Explicit targets keep Nx caching and orchestration without a peer mismatch.

### D-013 — ESLint 9.x line

**Decision:** ESLint `9.39.5` with flat config and `@nx/eslint-plugin` flat presets.

**Reason:** React/a11y/import plugins required by the Nx React preset do not declare ESLint 10 support.

**Amendment (2026-09-22 04:58):** ESLint 9.x reached end-of-life on 2026-08-06. The decision is kept because the alternative (ESLint 10 without the React, accessibility and import plugins) would drop real static checks, and ESLint runs only on repository source during development and CI, never in a runtime path. **Revisit** as soon as those plugins declare ESLint 10 support.

### D-014 — Build-script approval via `allowBuilds`

**Decision:** `pnpm-workspace.yaml` lists only the packages whose install scripts are required, with `strictDepBuilds` left at its default (`true`). `dangerouslyAllowAllBuilds` is not used.

**Reason:** Section 14 forbids globally allowing arbitrary dependency build scripts; `allowBuilds` is the current supported pnpm mechanism (the `onlyBuiltDependencies` family is deprecated since pnpm 11).

### D-015 — PostgreSQL 18.6

**Decision:** `postgres:18.6-alpine` for local Compose and Testcontainers.

**Reason:** PostgreSQL 18 is the current supported stable major; the exact patch tag keeps local and test environments reproducible.

### D-016 — Single structured logger: Fastify's built-in pino

**Decision:** Structured JSON logging uses Fastify's bundled pino logger, exposed to Nest through a small `LoggerService` adapter; request correlation uses Fastify's request-id facility with validated inbound `x-request-id` values echoed on responses.

**Reason:** Section 17 asks for structured logging without adding a logging framework. pino ships with Fastify, so no additional dependency is needed and there is one log stream.

### D-017 — Explicit, strict one-day dependency release cooldown

**Decision:** `pnpm-workspace.yaml` sets `minimumReleaseAge: 1440` and `minimumReleaseAgeStrict: true`. Versions published less than one day before resolution cannot be resolved; the latest stable release that satisfies both the manifest range and the cooldown is used (this selected NestJS 12.0.3 instead of the sixteen-hour-old 12.0.4).

**Reason:** pnpm 12 already applies the 1440-minute cooldown by default, but in its non-strict default it installs a too-new version anyway and silently appends a `minimumReleaseAgeExclude` entry to the workspace file (observed for `@nestjs/*@12.0.4`). A silent policy bypass written into configuration is worse than an explicit failure; `docs/SECURITY.md` Section 31 asks for deliberate supply-chain handling.

**Consequence:** Adding a package published within the last 24 hours fails resolution with a clear message until it ages or is explicitly excluded in a reviewed change.

### D-018 — Patch-level override `fastify@5.12.5`

**Decision:** `pnpm-workspace.yaml` `overrides: { fastify: 5.12.5 }`, with its reason and removal condition in place.

**Reason:** `@nestjs/platform-fastify@12.0.3` pins `fastify@5.12.4` (GHSA-4mh8-r7rc-xpvc). The alternatives were shipping a known-vulnerable runtime and aligning the API's type-only `fastify` dependency down to it, or excluding the sixteen-hour-old NestJS 12.0.4 packages from the cooldown. A same-minor patch override is the narrowest change and also leaves a single `fastify` copy, so the API's `fastify` type imports match the adapter's instance.

**Revisit:** remove the override when `@nestjs/platform-fastify` ≥ 12.0.4 is adopted.

### D-019 — Dependency audit command with reviewed exceptions

**Decision:** `pnpm deps:audit` runs `pnpm audit --audit-level=moderate`. The four current advisories are listed in `pnpm-workspace.yaml` `auditConfig.ignoreGhsas`, each with its package, the tool that pins it and why it is not reachable.

**Reason:** `docs/SECURITY.md` Section 31 requires dependency scanning. All four affected packages are exact pins inside Nx or the Prisma CLI; overriding tooling internals (one fix is a major version) risks breaking the tools for no reachable benefit. A gate that is permanently red is not a gate, while explicit, narrowly scoped exceptions (Section 42) keep every new advisory failing the command.

**Revisit:** on every Nx or Prisma upgrade; delete an entry once its upstream pin is patched.

### D-020 — `NODE_ENV` is decided by the command, not by the shared `.env`

**Decision:** `.env.example` no longer sets `NODE_ENV` (the API's configuration defaults to `development`; deployments set `production` explicitly). The web Vite config refuses a production build when `NODE_ENV` is set to anything other than `production`, and reads only `API_HOST`/`API_PORT` from the workspace `.env` (via `node:util` `parseEnv`, not Vite's `loadEnv`) to target its proxy.

**Reason:** Nx injects the workspace `.env` into every task, and Vite honours an inherited `NODE_ENV`; a shared development value silently shipped React's development build (Surprises, 05:10).

### D-021 — No `@testing-library/jest-dom`

**Decision:** Frontend tests assert through Testing Library queries and plain Vitest matchers.

**Reason:** The extra matchers are a convenience only, and avoiding the package keeps the dependency graph smaller and the "no Jest stack" search unambiguous.

### D-022 — Formatting width

**Decision:** `.prettierrc` sets `printWidth: 100`.

**Reason:** Formatter detail; it matches how the TypeScript sources were written and avoids noisy wrapping. Documentation stays excluded from Prettier.

### D-023 — Nx Cloud explicitly disabled

**Decision:** `nx.json` sets `neverConnectToCloud: true` (analytics were already off).

**Reason:** Without it, Nx contacts the Nx Cloud API during long runs once a GitHub remote exists. Vertex OS development is local-first and introduces no external services.

### D-024 — End-to-end topology

**Decision:** `pnpm test:e2e` runs `@vertex-os/web-e2e` (Playwright, Chromium only). Its `webServer` entries start `nx run @vertex-os/api:serve` on `127.0.0.1:3100` (with `NODE_ENV=test` and a syntactically valid, never-connected database URL) and `nx run @vertex-os/web:preview` on `127.0.0.1:4300`, whose proxy targets that API. Retries are 0 locally and 1 in CI; traces and screenshots are kept only on failure.

**Reason:** The smoke journey needs only liveness (Section 19). Dedicated ports never collide with or reuse a developer's `pnpm dev` servers, and the preview serves the real production build.

### D-025 — API tests use the production application factory

**Decision:** API tests create the application with the same `createApp()` used by `main.ts` and send requests through Fastify injection after `app.init()` and the Fastify instance's `ready()`. `@nestjs/testing` (declared by the first session but never imported) was removed.

**Reason:** `docs/TESTING.md` Section 18 asks for a real Nest application with production-like middleware on the Fastify adapter. No Phase 0 test needs provider overrides, which are what the testing module adds; the package is added back when a test genuinely needs one.

---

## 13. Milestone 0 — Repository Preflight and Version Freeze

### Goal

Establish the exact live repository facts before any scaffold command mutates state.

### Work

From the repository root, inspect the tree recursively and read all canonical documentation listed in Section 2.

Determine whether the live working tree is a Git repository. If it is, inspect:

    git status --short
    git branch --show-current
    git remote -v

Do not initialize Git if it is absent merely because Phase 0 is being executed.

Do not clean, reset, discard, or overwrite pre-existing user changes.

Record the installed runtime/tooling versions that can affect scaffolding:

    node --version
    corepack --version
    pnpm --version
    docker --version
    docker compose version

If pnpm is not available, install/activate it through a supported official method without changing the selected version policy silently.

Confirm Docker is available before relying on Testcontainers or Compose. If Docker is unavailable, this is a genuine environment blocker for the real-PostgreSQL acceptance path; report it rather than substituting SQLite or mocks.

Research the current stable releases for the approved version lines in Section 8 using official project sources.

Record the exact selections in the Decision Log before installing.

Inspect current official Nx generators and options before invoking them. Generator CLI flags change over time; use current supported syntax rather than copying stale commands from this plan.

### Guardrails

Do not use `--force` to bulldoze conflicts.

Do not accept an Express backend generated by default and leave it in place.

Do not accept Jest merely because a generator defaults to it.

Do not choose a different Prisma major.

Do not use prerelease versions.

### Acceptance

M0 passes when:

- the repository state is understood;
- user changes are preserved;
- Docker availability is known;
- exact stable dependency/runtime selections are recorded;
- no architecture-significant incompatibility has been discovered.

If a selected approved major line is no longer supported or cannot coexist with the others, stop and document the conflict before changing architecture.

---

## 14. Milestone 1 — Root Workspace and Toolchain Foundation

### Goal

Create the smallest reproducible pnpm/Nx/TypeScript workspace capable of hosting the real Phase 0 projects.

### Work

Create the root package/workspace configuration.

The root `package.json` must be private and must pin the package manager exactly using the supported package-manager pinning mechanism.

Pin Node 24 LTS using a repository-visible mechanism appropriate to the selected toolchain, and declare a compatible Node engine range.

Use ESM-compatible project configuration where required by the selected modern Nest/Prisma toolchain.

Create:

- `pnpm-workspace.yaml`;
- `nx.json`;
- strict TypeScript base configuration;
- ESLint configuration;
- formatting configuration;
- `.editorconfig`;
- `.gitignore`.

Enable TypeScript strictness. Include `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` unless the selected framework/tooling proves an actual incompatibility; if either must be disabled, record why in the Decision Log.

Use ESLint rather than adopting an experimental lint stack solely because a new Nx release advertises one.

Use a deterministic formatter supported by the repository. Prefer the mature stable option rather than an experimental formatter unless there is an existing repository decision.

Review dependency install scripts. Do not configure pnpm to allow arbitrary dependency build scripts globally. Approve only build scripts required by selected dependencies using the current supported pnpm mechanism.

Create initial root commands with stable names. The final command definitions may evolve during later milestones, but the intended command surface is:

    pnpm dev
    pnpm build
    pnpm format
    pnpm format:check
    pnpm lint
    pnpm typecheck
    pnpm test
    pnpm test:integration
    pnpm test:e2e
    pnpm verify
    pnpm verify:full

Do not fake commands with no-op placeholders. A command is added only when it performs a real check.

### Acceptance

From the repository root:

    pnpm install

must complete successfully and produce one committed lockfile.

Running Nx workspace introspection must succeed using the selected current syntax.

Formatting and lint configuration must parse even before application projects exist.

No code generator may have introduced unapproved stack choices.

---

## 15. Milestone 2 — Real Projects and Enforceable Dependency Boundaries

### Goal

Create exactly the Phase 0 projects that have real responsibilities and configure boundaries before feature code starts to accumulate.

### Work

Create:

- `apps/api` as a NestJS application;
- `apps/web` as a React/Vite application;
- `packages/database` as a backend infrastructure library/package.

Use official current Nx generators where they produce a cleaner supported result, but treat generators as file-producing tools, not architectural authorities.

After generation, inspect every generated dependency and file. Remove framework/test defaults that conflict with canonical decisions.

For `apps/api`:

- use NestJS;
- use Fastify, not Express as the running platform;
- do not keep Express-only packages if no selected Nest dependency actually needs them;
- do not install authentication/IAM code.

For `apps/web`:

- use React + Vite;
- add TanStack Router and TanStack Query because Phase 0 will actually use both;
- add Tailwind CSS;
- do not add TanStack Table yet because no table exists;
- do not add shadcn or another component kit;
- do not create a shared UI package yet.

For `packages/database`:

- make it backend-only;
- give it a real consumer in the API;
- do not expose Prisma generated implementation types as public API/domain contracts.

Add Nx project tags and ESLint module-boundary rules for the projects that exist.

At minimum, the rules must make these architectural facts enforceable:

- frontend code cannot import backend-only/database implementation;
- database infrastructure cannot depend on frontend code;
- applications may depend only on appropriate libraries;
- future domain projects can be added without weakening existing boundaries.

Do not create elaborate future-domain tags that cannot be validated yet. Extend the rule set when domains actually appear.

### Acceptance

Nx can enumerate all three projects.

Each project builds or type-checks far enough to prove its scaffold is valid.

A repository search confirms:

- no Jest configuration/dependency accidentally remains;
- no shadcn package exists;
- no business-domain package exists;
- no Redis/Temporal/message-broker/S3 package exists;
- the API runtime platform is Fastify.

The boundary configuration is active in the real lint command.

---

## 16. Milestone 3 — PostgreSQL and Prisma 7 Database Foundation

### Goal

Establish a real PostgreSQL development/test path and a single Prisma infrastructure boundary without inventing domain schema.

### Work

Configure `packages/database` for Prisma ORM 7.x and PostgreSQL using the current Prisma 7 architecture.

Use the Prisma 7 `prisma-client` generator style and explicit generated-client output required by the current official guidance.

Place the database connection configuration where Prisma 7 expects it; do not copy Prisma 6-era datasource URL conventions if Prisma 7 has moved them into configuration.

Use the supported PostgreSQL driver adapter required by Prisma 7.

Create a central database client/factory/service boundary that the API can consume. Keep generated client details inside the infrastructure package.

Do not create fake business models.

If a Prisma schema containing only generator/datasource configuration is valid for the selected Prisma 7 release, keep it model-free.

If Prisma itself requires another minimal construct for generation, stop and verify the requirement from official Prisma documentation rather than inventing a business entity.

Do not create a meaningless initial migration solely to make a `migrations/` directory exist.

Add a local PostgreSQL service under `infra/compose.yaml` or an equivalently clear local-only Compose location.

The local database service must:

- bind only as broadly as required for local development;
- use a supported PostgreSQL image;
- persist local development data in a named local volume if useful;
- avoid committed real credentials.

Create an ignored local environment file strategy.

A checked-in `.env.example` may document variable names and safe non-secret defaults, but MUST NOT contain credential values.

Prefer a small, idempotent local setup command/script that can generate local development credentials into an ignored file without overwriting an existing developer environment. Use Node’s standard cryptographic facilities rather than adding a dependency solely for random-secret generation.

Add real commands for database tasks, for example the final equivalent of:

    pnpm db:validate
    pnpm db:generate
    pnpm infra:up
    pnpm infra:down

Names may be adjusted if the repository establishes a more coherent convention; document the actual final commands.

Add an integration test that starts an isolated PostgreSQL instance through Testcontainers and proves the selected Prisma/database client can execute a simple database operation such as `SELECT 1`.

Do not use SQLite for tests.

### Acceptance

The following capabilities work from a fresh install:

- Prisma schema/config validation;
- Prisma client generation;
- Testcontainers PostgreSQL startup;
- a real database integration test;
- local PostgreSQL Compose startup using ignored local credentials;
- clean shutdown of Testcontainers and local infrastructure.

No business table exists.

No business migration exists.

No secret value is tracked.

---

## 17. Milestone 4 — NestJS/Fastify API Foundation

### Goal

Provide a production-shaped but minimal backend foundation that proves process health, database readiness, contract generation, error behavior, security headers, and observability conventions.

### Work

Create a reusable application factory/bootstrap shape so the same configured Nest/Fastify application can be used by:

- the normal server entry point;
- Fastify-injection tests;
- OpenAPI document generation where practical.

Use the Fastify adapter explicitly.

Enable graceful shutdown hooks.

Use a stable API prefix:

    /api

Do not introduce API-versioning infrastructure before a versioning requirement exists.

### Configuration

Validate environment/configuration at startup using Zod or another already-approved lightweight schema approach.

Required values must fail fast with a useful non-secret error.

Map raw environment variables into typed application configuration once. Do not scatter `process.env` reads through application code.

### Health endpoints

Implement:

    GET /api/health/live
    GET /api/health/ready

`/live` proves the process and HTTP stack are alive. It must not require PostgreSQL.

`/ready` proves the application’s required Phase 0 dependency, PostgreSQL, is reachable through the actual database infrastructure path.

When PostgreSQL is unavailable, readiness must not report success.

Health responses must not expose credentials, connection strings, stack traces, or sensitive internals.

Do not add a health-check framework if two small explicit endpoints are simpler and fully tested.

### Error contract

Create one consistent HTTP problem response model compatible with RFC 9457.

At minimum, ordinary HTTP failures should have a stable shape containing the applicable Problem Details fields such as:

- `type`;
- `title`;
- `status`;
- `detail` when safe;
- `instance` when useful.

A stable application `code` and correlation/trace identifier may be included when the implementation uses them consistently.

Do not expose raw exceptions in production responses.

### OpenAPI

Use the NestJS OpenAPI integration.

The machine-readable OpenAPI document must be generatable deterministically without requiring a developer to manually click a browser UI.

Provide a repository command that emits the document to a generated/build location.

The Swagger/OpenAPI interactive UI may be enabled for local development, but it must not be publicly enabled in production by default.

Do not create `packages/api-client` yet merely to consume health endpoints.

### Security baseline

Register appropriate Fastify-compatible security headers, using the current supported plugin.

CORS must remain disabled or narrowly configured by default. The Phase 0 web application should use a dev proxy rather than `*`.

Set sensible request/body limits using framework defaults or explicit configuration; do not loosen them unnecessarily.

No auth middleware/guard is added yet.

### Logging and correlation

Provide structured production logging using the selected Nest/Fastify-supported mechanism without adding a logging framework unless it materially improves a requirement that native facilities cannot satisfy.

Every request must have a correlation/request identifier available to logs and returned in a response header or equivalent observable boundary.

If inbound request IDs are honored, validate them rather than trusting arbitrary attacker-controlled log content.

Do not log secrets or full environment values.

### API tests

Use Nest testing utilities with Fastify.

Default request execution must use Fastify injection after the Fastify instance is fully initialized/ready.

Test at least:

- liveness returns success without PostgreSQL;
- readiness returns success against real Testcontainers PostgreSQL;
- readiness returns non-success when PostgreSQL is unavailable;
- representative unknown/invalid HTTP behavior produces the chosen problem shape;
- key security/correlation headers are present as intended.

Use a real listening server only if a behavior genuinely requires the network boundary.

### Acceptance

The API builds, starts, shuts down cleanly, and all API tests pass.

A developer can observe:

    curl ... /api/health/live

returning success.

With PostgreSQL running, readiness returns success.

Without PostgreSQL, readiness does not lie.

The generated OpenAPI document includes the health routes.

---

## 18. Milestone 5 — React/Vite Web Foundation and Technical Vertical Slice

### Goal

Create a minimal frontend that proves the selected web stack, routing, query/data access, styling foundation, and browser-to-API development topology without inventing business UI.

### Work

Configure React on Vite using the approved stable versions.

Configure TanStack Router using the current supported Vite integration. Prefer its recommended file-based routing path unless current repository/tooling evidence gives a concrete reason not to.

Configure TanStack Query with one application-level query client.

Configure Tailwind CSS using the current stable Tailwind 4 integration for Vite.

Do not install a UI component library.

Do not create `packages/ui` in order to wrap a single element.

Create a deliberately small technical shell.

The root route should:

- identify the product as Vertex OS;
- make a relative request to `/api/health/live` through TanStack Query;
- present a clear accessible loading/success/failure state;
- avoid fake business dashboards, navigation modules, client records, metrics, or sample ERP data.

Configure Vite development proxying so browser code calls `/api/...` and Vite forwards to the local Nest API.

Do not solve local development by enabling wildcard CORS.

Keep the HTTP client code small and local to the web application. Do not create a generic API SDK abstraction before a real generated/business contract exists.

Handle network failure explicitly; the web app must remain renderable if the API is temporarily unavailable.

Do not add authentication state.

### Frontend tests

Use Vitest + React Testing Library.

Test behavior, not implementation details.

At minimum prove:

- the shell renders;
- liveness success is represented;
- liveness failure is represented;
- accessible queries/roles can locate the meaningful status UI.

Do not add snapshot-heavy tests.

### Acceptance

The web app builds and tests pass.

When API and web are running, opening the root page shows Vertex OS and an observable successful API connection state.

If the API is stopped, the web page shows an explicit non-crashing unavailable/error state.

Browser developer tools should show a request to the web origin’s `/api/...` path, not a hard-coded cross-origin localhost backend URL.

No business UI, auth UI, shadcn, or shared UI package exists.

---

## 19. Milestone 6 — Testing and End-to-End Verification Harness

### Goal

Turn the isolated milestone tests into one coherent repository verification path and prove the technical slice through the real browser.

### Work

Ensure Vitest is the only unit/application test runner unless a dependency has an internal test tool irrelevant to repository tests.

Set up the repository test projects so Nx can run them predictably.

Use React Testing Library for frontend tests.

Use Testcontainers for the database/API PostgreSQL integration path.

Create one small Playwright smoke project/test.

The Playwright smoke test should prove only the Phase 0 browser outcome:

1. start the real API and web applications using the repository-supported test/dev commands;
2. navigate to the root page;
3. observe the Vertex OS shell;
4. observe the successful API liveness state.

The smoke test does not need PostgreSQL because database readiness is independently proven through the real API/Testcontainers integration path.

Configure the E2E test environment with a syntactically valid non-production database URL if application startup validation requires one, but do not accidentally exercise or depend on a fake database when only liveness is being tested.

Keep Playwright retries small and diagnostics useful.

Retain trace/screenshot artifacts on failure according to the existing testing policy.

Create or finalize these repository command categories:

### Fast gate

`pnpm verify` should be suitable for frequent local/PR use and run a deterministic fail-fast sequence equivalent to:

1. format check;
2. lint including architecture boundaries;
3. typecheck;
4. unit/application tests;
5. builds.

### Full gate

`pnpm verify:full` should extend the fast gate with the expensive foundation checks, including:

- Prisma validation/generation as appropriate;
- real PostgreSQL integration/API tests;
- Playwright smoke E2E.

Do not hide failures by appending `|| true`.

Do not add arbitrary coverage thresholds.

A separate coverage command MAY exist for diagnostics.

### Acceptance

Run the fast gate from a clean working directory and observe success.

Run the full gate with Docker available and observe success.

Intentionally stopping the API should cause the browser status behavior to fail/turn unavailable as expected rather than generating an unhandled crash.

Integration containers must clean up after the test run.

---

## 20. Milestone 7 — CI and Security-Quality Integration

### Goal

Make the repository CI-ready without inventing a hosting provider.

### Work

Inspect the live repository’s Git metadata.

If an existing remote or repository configuration clearly proves a CI provider, add the minimal provider-specific CI workflow for that provider.

If the live repository does not prove a provider, do not create `.github`, `.gitlab-ci.yml`, or another provider-specific workflow by guesswork. In that case, Phase 0 still requires the provider-neutral root verification commands and this limitation must be recorded in `Outcomes & Retrospective`.

For any CI workflow created:

- use the pinned Node/package-manager configuration;
- install with the committed lockfile in frozen mode;
- avoid globally permitting dependency lifecycle scripts;
- use cache mechanisms that do not compromise correctness;
- run the fast gate on ordinary change validation;
- run real PostgreSQL integration/API tests;
- run the critical Playwright smoke path where the CI environment supports Docker/browser execution;
- retain useful failure artifacts for Playwright;
- avoid production secrets;
- use synthetic test data only.

Add a dependency-vulnerability scan using the current supported package-manager mechanism or an existing approved repository scanner.

Do not silently introduce a large third-party security platform solely to check a Phase 0 box.

Secret-scanning integration should use an existing provider-native capability if the repository/provider proves it is available; otherwise document the remaining CI-provider integration rather than committing an arbitrary secret-scanning service.

Pin third-party CI actions/plugins sufficiently to prevent accidental major drift and follow the repository security policy.

### Acceptance

If a provider-specific workflow exists, validate its syntax/configuration locally where a supported validator exists and inspect it carefully.

The workflow invokes real repository commands rather than duplicating a second set of shell logic.

If no provider was discoverable, record that CI provider integration is pending provider selection, while `pnpm verify` and `pnpm verify:full` remain complete and runnable.

---

## 21. Milestone 8 — Documentation Synchronization and Final Acceptance

### Goal

Make the executable repository and canonical instructions agree, then close Phase 0 without leaking into IAM.

### Work

Create a concise root `README.md` containing only commands and setup steps that have been observed to work.

It should explain:

- required Node/package-manager/Docker prerequisites;
- dependency installation;
- local environment setup;
- local PostgreSQL startup/shutdown;
- database validation/generation;
- starting API and web;
- the URLs a developer should open/call;
- `verify` and `verify:full`;
- known Phase 0 limitations, especially that auth/IAM is intentionally not implemented.

Do not turn `README.md` into another architecture document. Link to canonical docs instead.

Update `AGENTS.md` only where the now-real repository commands or locations make its operational routing more useful.

Do not copy README command documentation into `CLAUDE.md`. Keep `CLAUDE.md` small unless a genuine Claude-specific correction is required.

Review all canonical docs for statements that have become concretely verifiable after Phase 0. Do not rewrite them unless the executable state exposes a real contradiction.

Update this plan’s:

- `Progress`;
- `Surprises & Discoveries`;
- `Decision Log`;
- `Outcomes & Retrospective`;
- status.

Search the repository for stale/unwanted technology choices:

    shadcn
    jest
    express
    sqlite
    redis
    rabbit
    kafka
    temporal
    s3
    minio
    localStorage
    sessionStorage
    access_token
    refresh_token

Interpret matches in documentation/tests correctly; a documentation statement saying “do not use X” is not a violation.

Inspect the final tree and final diff.

If Git exists:

    git diff --check
    git status --short

Do not commit or push.

### Final acceptance commands

The exact commands may differ if the final root script names were improved during implementation, but the repository MUST expose and successfully run the functional equivalent of:

    pnpm install --frozen-lockfile
    pnpm format:check
    pnpm lint
    pnpm typecheck
    pnpm test
    pnpm build
    pnpm test:integration
    pnpm test:e2e
    pnpm verify
    pnpm verify:full

Also exercise local infrastructure/application behavior:

    pnpm infra:up
    pnpm db:validate
    pnpm db:generate
    pnpm dev

Then observe the web shell and health endpoints.

Stop the local applications/infra cleanly afterward.

### Phase 0 is rejected if

Any fast/full verification command fails.

The web app only works with wildcard CORS.

The API runs on Express rather than Fastify.

A fake business entity was created to satisfy Prisma.

An auth/IAM flow was implemented.

A domain placeholder package was created.

Secrets were committed.

A generator left Jest as the repository test stack.

The frontend can import Prisma/database infrastructure.

Prisma is not 7.x.

The full gate depends on SQLite/mocks instead of a real PostgreSQL integration path.

A package or service outside scope was added without an actual Phase 0 consumer.

Documentation claims commands that were not executed successfully.

---

## 22. Concrete Command Surface Expected at Completion

The final script implementation is owned by the actual repository, but a developer should not need to memorize Nx project internals for routine work.

Prefer a root command surface approximately like:

    pnpm dev
    pnpm dev:api
    pnpm dev:web

    pnpm infra:up
    pnpm infra:down

    pnpm db:validate
    pnpm db:generate

    pnpm openapi:generate

    pnpm format
    pnpm format:check
    pnpm lint
    pnpm typecheck
    pnpm test
    pnpm test:integration
    pnpm test:e2e
    pnpm build

    pnpm verify
    pnpm verify:full

Exact names may change only when the replacement is simpler and more coherent. If names change, update this plan and `README.md` before completion.

**As implemented (2026-09-22):** every command above exists under that exact name. Three were added: `pnpm env:setup` (idempotent local `.env` creation), `pnpm infra:reset` (the separate destructive command that also deletes the local volume, Section 24) and `pnpm deps:audit` (D-019).

Commands must delegate to Nx/project targets where appropriate rather than maintaining divergent build logic.

---

## 23. Interfaces and Concrete Phase 0 Behavior

Do not over-design public interfaces, but the following observable contracts must exist by the end of Phase 0.

### API liveness

    GET /api/health/live

Expected semantic outcome:

- HTTP 200 when the API process is alive;
- small JSON response;
- no database dependency;
- no sensitive details.

### API readiness

    GET /api/health/ready

Expected semantic outcome:

- HTTP 200 only when required Phase 0 dependencies are ready;
- PostgreSQL is checked through the real database infrastructure path;
- non-2xx readiness response when PostgreSQL is unavailable;
- no credentials/stack traces.

### HTTP problems

Non-success HTTP behavior uses one consistent RFC 9457-compatible representation rather than several framework-default shapes.

### Web root

    /

Expected semantic outcome:

- renders a minimal Vertex OS technical shell;
- uses TanStack Router;
- uses TanStack Query to observe API liveness;
- represents loading/available/unavailable states;
- uses relative `/api` request path;
- contains no business feature.

### Database infrastructure

`packages/database` exposes only the narrow infrastructure needed by the API to acquire/use the configured Prisma/PostgreSQL client and to close resources correctly.

Do not expose domain-neutral “generic repositories”.

---

## 24. Idempotence and Recovery

All setup and execution steps should be safe to repeat.

Local environment setup MUST NOT overwrite an existing ignored local environment file without an explicit force/repair action.

`infra:up` should be repeatable.

`infra:down` should be repeatable and should not delete a developer’s local database volume unless a separate destructive command is explicitly invoked.

Testcontainers must clean up ephemeral resources.

Prisma generation should be repeatable and generated artifacts must not be manually edited.

If an Nx/framework generator partially succeeds, inspect its output before rerunning. Do not rerun with `--force` over user work. Remove only the partial files proven to belong to the failed generation or adjust manually.

If dependency installation fails, preserve the manifest/lockfile consistency. Do not “fix” it by switching package managers.

If a milestone fails acceptance, remain in that milestone, update `Progress` and `Surprises & Discoveries`, fix the issue, and rerun its acceptance before moving forward.

Do not use Git reset/clean to recover unless the user explicitly authorizes destructive version-control operations.

---

## 25. Change Control and Stop Conditions

The agent may make ordinary implementation choices inside the approved stack without asking for approval.

The agent MUST stop before implementing a proposed change that would materially alter any of these:

- modular-monolith strategy;
- Node major outside the approved Phase 0 line;
- backend framework/platform;
- frontend framework;
- primary database;
- Prisma major;
- authentication topology;
- authorization model;
- public API compatibility beyond the technical health surface;
- addition of a new infrastructure service;
- microservices;
- Kubernetes;
- production deployment topology;
- an architecture-significant major production dependency not already implied by this plan.

The agent MUST also stop if:

- Docker is unavailable and real PostgreSQL integration cannot be executed;
- current official framework compatibility makes the approved version lines mutually incompatible;
- a canonical document contains a material contradiction that was missed before execution;
- existing user code appears in the repository and conflicts with the documentation-only assumption in a way that changes scope;
- a destructive operation becomes necessary.

Do not stop for trivial naming choices, formatter details, generator flag changes, or patch-version differences.

---

## 26. Artifacts and Evidence to Retain in This Plan

As milestones complete, add concise evidence here.

Keep evidence short. Do not paste full logs.

Useful evidence includes:

- exact selected runtime/tool versions;
- final Nx project list;
- successful `verify` / `verify:full` summaries;
- one liveness response;
- one readiness-success response;
- one readiness-failure observation;
- one Playwright smoke result;
- Prisma validation/generation result;
- Testcontainers PostgreSQL result;
- final repository tree summary.

Initial state:

- No execution evidence yet.

### M0 evidence (2026-09-22)

- Repository tree at preflight: `AGENTS.md`, `CLAUDE.md`, `docs/{ARCHITECTURE,ENGINEERING,MODULES,PRODUCT,SECURITY,TESTING}.md`, `docs/plans/PHASE_0_PLAN.md`; nothing else (including hidden files). `git rev-parse` → not a Git repository; no user changes to preserve beyond the documentation set.
- Tooling: `node --version` → `v24.21.0` (managed by fnm); `corepack --version` → `0.36.0`; `pnpm --version` → `12.4.1` (global; the repository pins 12.5.1 via `packageManager`); `docker --version` → `29.2.1`; `docker compose version` → `v5.1.0`; `docker info` → server `29.2.1 linux` after starting Docker Desktop.
- Version selections: see D-009.

### M1 evidence (2026-09-22 03:20)

- Root files created: `package.json` (private, `packageManager: pnpm@12.5.1`, `engines.node >=24.0.0 <25`), `pnpm-workspace.yaml` (`apps/*`, `packages/*`, `allowBuilds: { nx: false }`), `nx.json`, `tsconfig.base.json` (strict + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`, `module/moduleResolution: nodenext`, `customConditions: ["@vertex-os/source"]`, `types: []`), `tsconfig.json`, `eslint.config.mjs` (Nx flat presets + `@nx/enforce-module-boundaries` with `type:*`, `scope:*`, `layer:*` constraints), `.prettierrc`, `.prettierignore`, `.editorconfig`, `.gitignore`, `.node-version` (`24.21.0`).
- `pnpm install` → pnpm auto-switched from the global 12.4.1 to the pinned 12.5.1 (`managePackageManagerVersions`); the only ignored build script was `nx`'s non-critical postinstall, recorded as a reviewed denial.
- `nx report` → Node 24.21.0, pnpm 12.5.1, nx 23.2.1, @nx/js|eslint|eslint-plugin|playwright|vite|devkit 23.2.1, typescript 6.0.3; registered plugins `@nx/js/typescript`, `@nx/eslint/plugin`, `@nx/vite/plugin`, `@nx/playwright/plugin`.
- `pnpm format:check` → "All matched files use Prettier code style!"; `eslint --print-config eslint.config.mjs` loads; `pnpm verify` exit 0 (no project tasks yet).

### M3 evidence (2026-09-22 03:36)

- `packages/database`: `prisma/schema.prisma` (generator `prisma-client` → `src/generated/prisma`, `datasource db { provider = "postgresql" }`, zero models), `prisma.config.ts` (loads the root `.env` with `process.loadEnvFile`, `datasource.url` only when `DATABASE_URL` is set), `src/database-client.ts` (`createDatabaseClient` → `{ ping, disconnect }` over `PrismaClient` + `@prisma/adapter-pg`), `src/database-client.integration.spec.ts`.
- `prisma validate` → "The schema at prisma\schema.prisma is valid"; `prisma generate` → "Generated Prisma Client (7.10.0) to .\src\generated\prisma" — both with `prisma`/`@prisma/engines` install scripts denied and no `DATABASE_URL`. The CLI prints an "Update available 7.10.0 -> 8.0.0-rc.15" notice, which is the prerelease and is ignored.
- `nx run @vertex-os/database:build|typecheck|lint` → success (generated files carry `// @ts-nocheck`; `@nx/dependency-checks` needed `ignoredDependencies: ['@prisma/client']` because only generated code imports it).
- `nx run @vertex-os/database:test:integration` → Vitest 5.0.1, "Test Files 1 passed, Tests 2 passed" (`ping resolves when PostgreSQL answers`, `ping rejects when PostgreSQL is unreachable`) against `postgres:18.6-alpine` via Testcontainers 12.1.0; first run 164 s including image pull; `docker ps -a` afterwards shows no Testcontainers containers.
- `infra/compose.yaml` (project `vertexos`, loopback-only port `127.0.0.1:${POSTGRES_PORT:-5432}`, named volume at `/var/lib/postgresql` per the PostgreSQL 18 image layout, `pg_isready` healthcheck). `pnpm infra:up` → "Container vertexos-postgres-1 Healthy"; repeated `infra:up` is a no-op; a marker table written before `pnpm infra:down` still exists after the next `infra:up` (volume `vertexos_postgres-data` retained); `infra:reset` is the separate destructive command.
- `pnpm env:setup` → "Wrote D:\vertex-media-os\.env with a generated local database password."; second run → ".env already exists; leaving it untouched". On this machine `POSTGRES_PORT=5440` is used locally because `127.0.0.1:5432` is occupied by an unrelated container.
- No `prisma/migrations` directory, no business table, no tracked secret.

### M2 evidence (2026-09-22 05:05)

- `nx show projects` → `@vertex-os/database`, `@vertex-os/web-e2e`, `@vertex-os/api`, `@vertex-os/web`. Tags: api `type:app,scope:backend`; web `type:app,scope:web`; database `type:lib,scope:backend,layer:infrastructure`; web-e2e `type:e2e,scope:web`.
- Boundary probes (temporary files, deleted afterwards), reported by the real `lint` targets: web → `@vertex-os/database`: *A project tagged with "scope:web" can only depend on libs tagged with "scope:web"*; web → `@prisma/adapter-pg`, `@nestjs/core`: *A project tagged with "scope:web" is not allowed to import …*; database → `../../../apps/web/src/router`: *Projects cannot be imported by a relative or absolute path*.
- No project was produced by an Nx generator; `@nx/nest`, `@nx/node`, `@nx/react` and `@nx/vitest`-driven inference are not used. `@nestjs/platform-express` is absent from the lockfile.

### M4 evidence (2026-09-22 05:00)

- `curl -i http://127.0.0.1:3000/api/health/live` → `200` `{"status":"ok"}` with `x-request-id`, CSP (`frame-ancestors 'none'`), HSTS, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`; no `Access-Control-Allow-Origin` for a foreign `Origin`.
- `GET /api/health/ready` with local PostgreSQL up → `200` `{"status":"ready"}`; after `pnpm infra:down` → `503` in 88 ms, `application/problem+json` `{"type":"about:blank","title":"Service Unavailable","status":503,"detail":"PostgreSQL is not reachable.","instance":"/api/health/ready","code":"NOT_READY","traceId":"…"}` (liveness stayed 200; the warning log names only host and port); after `pnpm infra:up` → `200` again.
- `GET /api/nope` with `x-request-id: bad id with spaces` → `404` problem `code: NOT_FOUND`, the hostile id replaced by a UUID; a well-formed inbound id is echoed.
- `nx run @vertex-os/api:test` → 3 files, 20 tests passed; `nx run @vertex-os/api:test:integration` → 1 test passed (ready 200 → container stopped → 503 `NOT_READY`, live 200) on `postgres:18.6-alpine`; no Testcontainers container left afterwards.
- `pnpm openapi:generate` → `apps/api/generated/openapi.json` (OpenAPI 3.0.0, paths `/api/health/live`, `/api/health/ready`; 503 documented as `application/problem+json`), identical bytes on regeneration.

### M5 evidence (2026-09-22 05:15)

- `pnpm dev` → API `127.0.0.1:3000` and web `127.0.0.1:4200` up within ~4 s. Browser: page text "Vertex OS / Internal operating platform of Vertex Media. / System status / API connection available"; network `GET http://127.0.0.1:4200/api/health/live → 200`; no console errors.
- API process stopped → without reload the page showed "API connection unavailable" and its explanation; console showed only the proxied `502` network entries, no script errors; the web server kept serving.
- Swagger UI at `/api/docs` rendered under the API's CSP with no console errors (development only; disabled by default when `NODE_ENV=production`).
- `nx run @vertex-os/web:test` → 5 tests passed; a mutation check (interval removed) made the recovery test fail.
- `nx run @vertex-os/web:build` → `index-*.js` 322 kB (gzip 103 kB), React production runtime.

### M6 evidence (2026-09-22 05:20)

- `pnpm verify` → exit 0 in 49 s. `pnpm verify:full` → exit 0 in 100 s: `The schema at prisma\schema.prisma is valid`, both `test:integration` targets ran (never cached), `ok 1 [chromium] › src\smoke.spec.ts › the web shell loads and observes the live API through its own origin (553ms)`.
- `docker ps -a --filter label=org.testcontainers=true` → empty after the runs (Ryuk exits on its own).

### M7 evidence (2026-09-22 05:25)

- `git rev-parse --is-inside-work-tree` → *fatal: not a git repository*; no remote or CI configuration exists, so no `.github/`, `.gitlab-ci.yml` or other provider file was created.
- `pnpm deps:audit` → exit 0, "4 ignored: 1 moderate | 3 high" (the reviewed D-019 exceptions); the runtime `fastify` advisory is fixed by D-018.

### M8 / final acceptance evidence (2026-09-22 05:30)

- Clean state: `node_modules`, every `dist`/`out-tsc`, `apps/api/generated`, `packages/database/src/generated`, `apps/web-e2e/test-output` and `.nx` deleted (only git-ignored, regenerable output; `.env` kept).
- In order, each exit 0: `pnpm install --frozen-lockfile` (11 s), `pnpm lint` (13 s), `pnpm typecheck` (17 s), `pnpm test` (11 s), `pnpm build` (11 s), `pnpm test:integration` (16 s), `pnpm test:e2e` (29 s, `1 passed`), `pnpm verify` (29 s), `pnpm verify:full` (80 s), `pnpm deps:audit` (2 s). `pnpm format:check` first failed on the new `README.md` (table alignment); after `prettier --write README.md` it passed, as did the format step inside `verify` and `verify:full`.
- Uncached test counts: `@vertex-os/web:test` 5, `@vertex-os/api:test` 20, `@vertex-os/database:test:integration` 2, `@vertex-os/api:test:integration` 1, Playwright 1.
- Local behaviour: `pnpm infra:up` → `Container vertexos-postgres-1 Healthy`; `pnpm db:validate`, `pnpm db:generate` → success; `pnpm dev` → up in ~6 s; `/api/health/live` 200 `{"status":"ok"}`, `/api/health/ready` 200 `{"status":"ready"}`, `http://127.0.0.1:4200/api/health/live` 200 through the proxy; browser shell "API connection available"; applications stopped, ports 3000/4200/3100/4300 free; `pnpm infra:down` → container removed, volume kept.
- Individually observed as documented in `README.md`: `pnpm dev:api` (restarts after a source change), `pnpm dev:web`, `pnpm env:setup` (create / leave untouched / `-- --force` regenerate, in a scratch copy), `pnpm infra:down` keeps and `pnpm infra:reset` deletes the volume (on a throwaway Compose project name), `pnpm openapi:generate`, `pnpm exec playwright install chromium`.
- Tracked-set review (a Git index kept outside the repository): 84 files would be committed; `.env`, `node_modules`, build output, generated Prisma client, OpenAPI output, test output and `.nx` data are ignored; the local database password occurs in no tracked file; the only credential-shaped strings are fake test URLs pointing at unreachable hosts; whitespace check clean for all new and changed sources.
- Stale-technology search (Section 21 list): matches only in documentation statements and this plan; none in source or configuration. Canonical documents (`docs/*.md`) and `CLAUDE.md` are unchanged.
- Final tree: `apps/api`, `apps/web`, `apps/web-e2e`, `packages/database`, `infra/compose.yaml`, `scripts/setup-env.mjs`, root configuration, `README.md`, `docs/`. No `domains/`, `docs/modules/`, `docs/adr/` or `packages/{ui,contracts,shared,config,testing,api-client}`.

---

## 27. Outcomes & Retrospective

Recorded 2026-09-22 05:35, after the final acceptance run.

### What was delivered

- A pnpm 12.5.1 / Nx 23.2.1 / TypeScript 6.0.3 workspace on Node 24 with one committed lockfile, strict compiler options (including `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`), ESLint with Nx module-boundary rules, Prettier, an explicit build-script allowlist, a strict one-day release cooldown, a patch override for a runtime advisory and a dependency-audit command.
- `apps/api`: NestJS 12 on Fastify 5 through one `createApp()` factory — `/api` prefix, Zod-validated configuration mapped once, liveness and PostgreSQL readiness endpoints, RFC 9457 problem responses with `code`/`traceId`, Helmet headers, CORS disabled, validated `x-request-id` correlation, a single pino JSON log stream, development-only Swagger UI and deterministic OpenAPI generation.
- `packages/database`: the backend-only Prisma 7.10 / `@prisma/adapter-pg` boundary exposing only `ping`/`disconnect`, with a model-free schema.
- `apps/web`: React 19 + Vite 8 + TanStack Router (file-based) + TanStack Query + Tailwind 4 technical shell reporting API liveness through the same-origin `/api` proxy.
- `apps/web-e2e`: one Playwright smoke journey against the real API and the production web build.
- Local PostgreSQL 18.6 via `infra/compose.yaml`, an idempotent `.env` generator, and root commands for every routine task, documented in `README.md` and routed from `AGENTS.md`.

### What was deliberately deferred

- IAM: no `docs/modules/iam.md`, no Keycloak runtime or realm, no login/logout, application session, CSRF, guards, users, roles or permissions. The health endpoints are the only (public) endpoints.
- Every business module, table, migration and seed.
- `packages/ui`, `contracts`, `shared`, `config`, `testing`, `api-client`, TanStack Table and any design-system work.
- A provider-specific CI workflow and provider-native secret scanning (no provider is identifiable).
- Production deployment, observability backends, queues, caches, Temporal and object storage.

### Deviations from the original plan

- Execution ran in two sessions; the second re-verified M0/M1/M3 and continued without rework. M3 was completed before M2 because the database package had to exist before the API could consume it.
- No Nx generator was used for any project (D-010): the relevant plugins either do not support NestJS 12 or pull in Jest, and hand-authored projects avoided removing generator defaults.
- D-018: `fastify` forced to the 5.12.5 security patch; it also removed a duplicate-type build failure.
- D-019: four tooling-internal advisories are reviewed exceptions, so the audit gate stays meaningful.
- D-020: `NODE_ENV` removed from the shared `.env`, plus a build guard — this fixed a real defect (production builds shipped React's development runtime through Nx's `.env` loading).
- D-021, D-022, D-023, D-024, D-025: no `jest-dom`, `printWidth: 100`, Nx Cloud disabled, dedicated end-to-end ports and a never-connected database URL, API tests through the production factory without `@nestjs/testing`.
- D-013 amended: ESLint 9 kept despite its end-of-life.
- `@tanstack/react-query` 5.103.1 instead of 5.103.2 (cooldown).

### Verification evidence

- From a cleaned tree, `pnpm install --frozen-lockfile`, `lint`, `typecheck`, `test`, `build`, `test:integration`, `test:e2e`, `verify`, `verify:full` and `deps:audit` all exited 0; `format:check` passed after `README.md` was formatted (details in Section 26).
- 28 Vitest tests (API 20, web 5, database integration 2, API integration 1) and 1 Playwright test pass; the integration tests use real `postgres:18.6-alpine` containers, which are removed afterwards.
- Manually observed: liveness 200 with and without PostgreSQL; readiness 200 with PostgreSQL and a `503` `NOT_READY` problem within ~90 ms after it stopped, recovering after restart; the browser shell showing "available" through `/api` on the web origin and "unavailable" without a crash when the API process was stopped; boundary violations rejected by lint.

### Residual risks / follow-up

- **ESLint 9 is end-of-life** (2026-08-06). Development-only, but move to ESLint 10 once `eslint-plugin-react`, `-jsx-a11y` and `-import` support it (D-013).
- **Temporary supply-chain exceptions:** remove the `fastify` override when adopting `@nestjs/platform-fastify` ≥ 12.0.4 (D-018); re-check the four audit exceptions on every Nx/Prisma upgrade (D-019).
- **CI is not wired.** Once a provider is chosen: run `pnpm install --frozen-lockfile`, `pnpm verify:full` and `pnpm deps:audit`, keep Playwright traces on failure, and enable provider-native secret scanning.
- **Signal-driven shutdown was not exercised.** `enableShutdownHooks()` is configured and `app.close()` (HTTP server and database pool) runs in every API test, but Windows has no POSIX signals; verify SIGTERM handling on the Linux CI/deployment target.
- **Nx loads the workspace `.env` into every task.** `DATABASE_URL` and the local password are therefore present in every task environment; harmless today (nothing reads them implicitly), but keep it in mind before adding tools that read environment variables on their own.
- `apps/web/src/routeTree.gen.ts` is committed and regenerated by the Vite plugin during `dev`/`build`/`test`; after adding a route, run one of those before relying on `pnpm typecheck` alone.

### Next exact step

Phase 0 passed all acceptance criteria:

    Create and review docs/modules/iam.md.

IAM was not created or implemented as part of this plan.

---

## 28. Required Final Execution Report

When Phase 0 finishes, the executing agent must return a report with these sections.

### 1. Executive Result

Use exactly one of:

    PHASE 0 COMPLETE
    PHASE 0 NOT COMPLETE

### 2. Repository Foundation Created

Describe the actual workspace/apps/packages/infrastructure created.

### 3. Versions Resolved

List exact selected versions for Node, pnpm, Nx, NestJS, React, Vite, Tailwind, Vitest, Prisma, PostgreSQL test/local image, Playwright, and Testcontainers.

### 4. Files / Areas Changed

Group by:

- root workspace;
- API;
- web;
- database;
- local infrastructure;
- tests;
- CI;
- documentation.

Do not dump every generated file if a grouped explanation is clearer.

### 5. Architecture Enforcement

Explain what is actually enforced now and what correctly remains unenforceable until domain packages exist.

### 6. Security Foundation

Report:

- secret handling;
- security headers;
- CORS posture;
- API docs exposure;
- config validation;
- logging/correlation;
- supply-chain/build-script handling.

### 7. Tests and Verification

For every command actually run, report pass/fail.

Never report a check as passed if it was not executed.

### 8. Demonstrated Behavior

Report the observed:

- web root behavior;
- API liveness;
- PostgreSQL readiness success;
- PostgreSQL readiness failure;
- Playwright smoke result.

### 9. Deviations and Discoveries

Summarize relevant Decision Log / Surprises entries.

### 10. Remaining Blockers

If Phase 0 is incomplete, state only concrete blockers and the evidence.

### 11. Final Diff / Working Tree Summary

If Git exists, report the working-tree summary. Do not commit or push.

### 12. Phase 0 Readiness Verdict

Use exactly one:

    READY FOR IAM SPECIFICATION
    NOT READY FOR IAM SPECIFICATION

### 13. Exact Next Step

When ready, state:

    Create and review docs/modules/iam.md.

Then stop.

---

## 29. Plan Quality Rules for the Executing Agent

While updating this plan during execution:

- keep it self-contained for Phase 0;
- preserve links to canonical ownership instead of copying whole canonical policies;
- record material decisions, not every keystroke;
- update future steps when a discovery changes them;
- keep milestones independently verifiable;
- describe observed results, not intended results;
- do not mark work complete because code exists;
- avoid pseudo-progress such as “mostly done” without a failing/passing criterion;
- do not expand Phase 0 in order to “prepare” for hypothetical future modules;
- do not create files because the conceptual architecture tree contains their names;
- use the simplest implementation that satisfies the accepted architecture and verification criteria.

The objective is a trustworthy foundation with minimal accidental architecture.

---

## 30. Plan Completion Rule

This plan becomes `COMPLETE` only after all Phase 0 milestones pass, the full verification evidence is recorded, documentation matches executable reality, and the agent has stopped before IAM.

A repository that merely compiles is not enough.

A repository that has more infrastructure than current behavior requires is not better.

The final Phase 0 state should make the next step—writing `docs/modules/iam.md`—safe, obvious, and grounded in a working engineering foundation.
