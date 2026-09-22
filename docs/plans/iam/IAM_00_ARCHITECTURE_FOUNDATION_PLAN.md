# Vertex OS — IAM-00 Architecture & Domain Boundary Foundation Plan

**Repository path:** `docs/plans/iam/IAM_00_ARCHITECTURE_FOUNDATION_PLAN.md`  
**Master Plan item:** `IAM-MP-00`  
**Status:** IMPLEMENTED — AUDIT REQUIRED  
**Plan type:** Living execution plan  
**Prepared:** 2026-09-22  
**Scope owner:** IAM / Vertex OS architecture  
**Execution target:** One Claude Code or Codex conversation operating from the repository root  
**Required follow-up:** Independent read-only audit before `IAM-MP-01` planning

> This plan establishes the enforceable architecture and package boundary for the IAM domain. It is deliberately **not** an authentication, persistence, Keycloak, user-management, or authorization-feature implementation plan. Its job is to make the architecture difficult to violate before IAM business behavior is added.

---

## 1. Purpose / Big Picture

Vertex OS has completed its general platform foundation and design-system foundation. The IAM specification is accepted and the IAM Master Plan is active.

`IAM-MP-00` is the first executable IAM stage.

The purpose of this stage is to create the smallest real IAM package foundation and to make the important IAM architecture rules mechanically enforceable through:

- workspace/project structure;
- package ownership;
- package exports;
- Nx project tags and dependency constraints;
- ESLint import restrictions;
- TypeScript/package resolution;
- centralized configuration access rules;
- architecture-focused verification.

At the end of this plan, the repository must have one clear IAM core boundary that later plans can safely build upon without allowing authentication infrastructure, Prisma, Keycloak, frontend code, or application code to leak into the IAM core.

This stage must be intentionally boring.

It creates the walls before furnishing the room.

---

## 2. Position in the IAM Program

The accepted high-level IAM implementation sequence is:

1. **IAM-00 — Architecture & package/domain boundary foundation** ← this plan
2. **IAM-01 — Persistence foundation**
3. **IAM-02 — Keycloak integration**
4. **IAM-03 — BFF authentication & application sessions**
5. **IAM-04 — Authorization context**
6. **IAM-05 — IAM administration API**
7. **IAM-06 — IAM frontend**
8. **IAM-07 — E2E, security hardening, verification, and closeout**

This plan MUST NOT pull work forward from IAM-01 or later phases.

The rolling-wave planning rule is mandatory:

> Implement one detailed plan → verify it → independently audit it → accept the new baseline → create only the next detailed plan.

---

## 3. Execution Contract

This file is a living execution plan.

During execution, the implementing agent MUST keep these sections current:

- `Progress`
- `Surprises & Discoveries`
- `Decision Log`
- `Outcomes & Retrospective`

The agent MUST execute the plan from the repository root and MUST inspect the actual repository before changing it.

The agent MUST NOT silently replace repository conventions with generic templates.

The agent MUST NOT commit, push, merge, deploy, change GitHub settings, provision external services, or mutate remote infrastructure unless separately authorized by the user.

Routine implementation decisions that are already bounded by this plan do not require repeated user confirmation.

Architecture-significant contradictions do.

---

## 4. Mandatory Read Order Before Any Modification

Read the following completely enough to understand their relevant rules before editing code:

1. `AGENTS.md`
2. `CLAUDE.md`
3. `docs/PLANNING.md`
4. `docs/PRODUCT.md`
5. `docs/ARCHITECTURE.md`
6. `docs/MODULES.md`
7. `docs/ENGINEERING.md`
8. `docs/SECURITY.md`
9. `docs/TESTING.md`
10. `docs/modules/iam.md`
11. `docs/plans/iam/IAM_MASTER_PLAN.md`
12. this plan
13. root `package.json`
14. `pnpm-workspace.yaml`
15. `nx.json`
16. root ESLint configuration
17. root TypeScript configuration
18. `apps/api` project configuration and bootstrap/configuration files
19. `apps/web` project configuration
20. `packages/database`
21. `packages/ui`
22. existing verification/CI configuration

If a listed file has a slightly different canonical path in the live repository, use the live canonical file.

Do not create duplicate policy documents to compensate for not reading the existing ones.

---

## 5. Baseline Expected at Start

The accepted repository baseline before this plan is expected to contain the following characteristics.

### 5.1 Platform foundation

- pnpm workspace;
- Nx workspace;
- strict TypeScript;
- ESLint with Nx module-boundary support;
- NestJS API on Fastify;
- React + Vite web application;
- PostgreSQL;
- Prisma ORM 7.x infrastructure under `packages/database`;
- Testcontainers;
- Vitest;
- Playwright;
- OpenAPI generation;
- RFC 9457-compatible problem responses;
- structured request correlation/logging;
- custom in-house UI/design-system package;
- CI/verification commands.

### 5.2 IAM baseline

The IAM specification is accepted.

The IAM Master Plan is active.

`IAM-MP-00` is the next executable item.

There should still be no implemented IAM business domain.

In particular, before this plan there should be no legitimate reason for the repository to already contain:

- IAM Prisma models;
- IAM database migrations;
- Keycloak runtime configuration;
- Keycloak realm/client provisioning;
- login endpoints;
- logout endpoints;
- application session persistence;
- authentication guards;
- IAM CRUD APIs;
- IAM administration UI.

### 5.3 Baseline commit

Previous planning identified a baseline beginning with:

`eef2b25...`

At execution start:

- record the full current `HEAD`;
- compare it with the accepted planning baseline;
- inspect all intervening commits/diffs if `HEAD` differs;
- continue only when the differences do not invalidate this plan.

A different `HEAD` is not automatically a blocker.

An architecture-significant change that invalidates this plan is a blocker.

---

## 6. Canonical IAM Decisions Carried Into This Plan

The following decisions are already settled and MUST NOT be reopened by IAM-00.

### 6.1 Authentication topology

The accepted future topology is:

```text
Browser / React
    |
    | opaque Secure + HttpOnly application session cookie
    v
Vertex OS API / BFF
    |
    | OIDC Authorization Code Flow + PKCE (S256)
    | confidential client
    v
Keycloak
```

Browser code must never receive or persist Keycloak access, refresh, or ID tokens.

IAM-00 does not implement this flow.

### 6.2 Identity and credential ownership

Keycloak owns:

- authentication;
- credentials;
- password hashing;
- password policy;
- MFA factors;
- identity-provider authentication mechanics;
- brute-force protection;
- credential recovery.

Vertex IAM owns application-side identity/authorization state such as:

- application user;
- IdP identity ↔ application user mapping;
- departments/memberships;
- roles;
- permissions/capabilities;
- access state;
- application authorization primitives.

IdP authentication alone never grants Vertex OS application access.

### 6.3 Application session ownership

The Vertex backend/BFF owns the future application session capability.

Keycloak owns the SSO session.

These are not the same session.

### 6.4 Authorization authority

The backend is authoritative for authorization.

Frontend permission checks are only UX controls.

A hidden or disabled UI element is never a security boundary.

### 6.5 IAM versus resource authorization

IAM owns generic application authorization primitives and role/permission assignment.

Business modules remain responsible for their own resource-level business authorization.

IAM MUST NOT become a universal policy engine for all domain resource rules.

### 6.6 Transaction boundary

Infrastructure transaction objects must not leak into IAM domain/public contracts.

No generic unit-of-work framework is introduced.

### 6.7 Audit boundary

IAM security-significant actions must eventually be auditable through the accepted Audit boundary.

Audit is not an event store and is not an activity source.

IAM-00 does not implement audit events.

---

## 7. Hard Scope of IAM-00

IAM-00 includes only architecture/domain-boundary foundation work.

The permitted scope is:

1. introduce the real IAM core package/project;
2. establish its public package identity;
3. establish its package export boundary;
4. establish its Nx project classification;
5. enforce permitted/forbidden dependency directions;
6. prevent browser/frontend code from depending on backend IAM internals;
7. prevent IAM core from depending on application/framework/infrastructure details that do not belong in the core;
8. explicitly preserve separation between future `AuthModule` and the IAM core;
9. enforce the existing centralized environment-configuration rule for new production source;
10. add architecture-focused verification needed to prove the boundary;
11. update this plan with observed evidence;
12. make only minimal documentation changes required to describe executable reality.

---

## 8. Explicit Non-Goals

IAM-00 MUST NOT implement or introduce:

- Prisma IAM models;
- IAM database tables;
- IAM database migrations;
- IAM seed data;
- IAM repositories;
- IAM persistence adapters;
- Keycloak container/runtime;
- Keycloak realm configuration;
- Keycloak client configuration;
- Keycloak Admin API client;
- Keycloak SDK integration;
- OIDC endpoints;
- authentication callback endpoints;
- login endpoint;
- logout endpoint;
- application-session table/store;
- application-session cookie behavior;
- CSRF token/session behavior;
- authentication guards;
- current-user endpoint;
- application user CRUD;
- department CRUD;
- membership CRUD;
- role CRUD;
- permission CRUD;
- role-assignment workflows;
- invitation workflows;
- invitation email delivery;
- account activation;
- password processing;
- MFA implementation;
- recovery implementation;
- authorization decision service;
- permission evaluation;
- resource authorization;
- audit event emission;
- IAM web routes/pages;
- IAM React hooks;
- IAM TanStack Query hooks;
- IAM navigation;
- IAM tables/forms/dialogs;
- fake demo users;
- fake roles;
- fake permissions;
- wildcard permissions;
- ABAC engine;
- policy DSL;
- generic event bus;
- generic outbox;
- Redis;
- message broker;
- Temporal;
- S3/object storage;
- unrelated refactors.

If any of the above appears necessary merely to make IAM-00 “feel complete”, it is not necessary.

---

## 9. Architecture Objective

IAM-00 must leave the repository with this conceptual dependency shape:

```text
                         ┌────────────────────────┐
                         │       apps/web         │
                         │   Browser / React UI   │
                         └────────────┬───────────┘
                                      │
                                      │ HTTP contracts only
                                      │
                         ┌────────────▼───────────┐
                         │       apps/api         │
                         │ NestJS / Fastify / BFF │
                         └───────┬────────┬───────┘
                                 │        │
                 future public   │        │ infrastructure
                 IAM capability  │        │ access
                                 │        │
                  ┌──────────────▼─┐    ┌─▼────────────────┐
                  │ @vertex-os/iam │    │ @vertex-os/database│
                  │  IAM core      │    │ Prisma/PostgreSQL  │
                  └────────────────┘    └────────────────────┘

Future authentication infrastructure:

apps/api/AuthModule or a dedicated auth-infrastructure boundary
        │
        ├── may consume IAM public capabilities
        ├── may consume future Keycloak/OIDC adapters
        └── MUST NOT be implemented inside @vertex-os/iam core
```

Key architectural property:

> Dependencies point toward the IAM core. The IAM core does not reach outward into the API app, browser app, Keycloak runtime, Prisma implementation, or UI system.

---

## 10. IAM Core Package Identity

Create one real IAM core workspace project.

### Required package identity

```text
@vertex-os/iam
```

### Preferred repository location

Use the repository’s established package convention.

If current first-party packages live under `packages/`, the preferred location is:

```text
packages/iam
```

Do not introduce a second top-level convention such as `domains/` solely for IAM if the live repository has standardized on `packages/`.

If `IAM_MASTER_PLAN.md` or the live accepted architecture explicitly defines another path, follow the canonical path and record the deviation in this plan.

**Execution resolution:** The accepted IAM specification and Master Plan explicitly establish `domains/iam` as the first domain project. The implemented path is `domains/iam` (D-001), while the package name remains `@vertex-os/iam`.

### Package character

`@vertex-os/iam` is:

- private workspace code;
- backend/domain-oriented;
- not a browser package;
- not a UI package;
- not a database package;
- not an authentication-provider adapter;
- not a generic shared package.

---

## 11. Minimal Package Rule

Create only the files required to make `@vertex-os/iam` a real, lintable, type-checkable Nx workspace project.

Mirror existing repository conventions from stable first-party packages such as `packages/database` and `packages/ui`.

Typical files may include, depending on repository convention:

```text
domains/iam/
  package.json
  eslint.config.mjs
  tsconfig.json
  tsconfig.lib.json
  src/
    index.ts
```

Do not create speculative empty directory trees such as:

```text
src/domain/
src/application/
src/infrastructure/
src/repositories/
src/entities/
src/services/
src/controllers/
```

unless a real file in this phase needs the directory.

Do not create fake marker entities, fake services, fake repositories, or fake interfaces merely to populate the package.

An intentionally minimal `index.ts` is preferable to invented behavior.

---

## 12. Public API / Package Export Policy

The IAM package MUST expose one deliberate public entry point.

Consumers must import from:

```ts
import ... from '@vertex-os/iam';
```

Consumers MUST NOT import internal paths such as:

```ts
@vertex-os/iam/src/...
@vertex-os/iam/domain/...
@vertex-os/iam/application/...
@vertex-os/iam/internal/...
../../../packages/iam/src/...
```

### Package export requirements

Use the repository's existing source/build convention, but the semantic rule is mandatory:

- export the root package entry only;
- do not publish wildcard internal subpaths;
- do not expose implementation folders;
- do not expose future Prisma types;
- do not expose future Keycloak SDK types;
- do not expose Nest/Fastify implementation types merely for convenience.

If the current workspace uses `package.json#exports`, configure a closed export map.

Conceptually:

```json
{
  "exports": {
    ".": "..."
  }
}
```

Do not add:

```json
"./*": "..."
```

unless a future approved plan intentionally creates a named public subpath.

---

## 13. No Deep-Import Rule

Deep imports into IAM internals MUST be blocked, not merely discouraged.

Use the simplest mechanism compatible with the repository:

- package `exports`;
- TypeScript path configuration;
- ESLint `no-restricted-imports`;
- Nx module boundaries;
- or a small combination.

The implementation should prefer layered enforcement where inexpensive.

A consumer accidentally typing:

```ts
import { Something } from '../../packages/iam/src/...';
```

must not become an accepted repository pattern.

---

## 14. Nx Project Classification

Extend the existing Nx tag vocabulary minimally.

Do not rename every existing project tag to fit a theoretical taxonomy.

The IAM project must be classifiable by at least these semantics:

- scope/domain: IAM;
- type: domain/core library;
- platform: server/backend.

Preferred tags, if compatible with the existing repository vocabulary:

```text
scope:iam
type:domain
platform:server
```

If the repository already uses equivalent names, use the established equivalents.

Record the final tags in this plan’s `Decision Log`.

---

## 15. Required Dependency Rules

The resulting rules must express the following architecture.

### 15.1 Allowed

Future server/API composition may depend on IAM public API:

```text
apps/api -> @vertex-os/iam
```

Future IAM-owned infrastructure adapter may depend on IAM core:

```text
future IAM infrastructure -> @vertex-os/iam
```

A future authentication/BFF adapter may consume IAM public capabilities when needed:

```text
future AuthModule/auth infrastructure -> @vertex-os/iam
```

### 15.2 Forbidden

IAM core MUST NOT depend on:

```text
apps/api
apps/web
apps/web-e2e
packages/ui
React
Vite
TanStack Router
TanStack Query
Fastify request/response types
Keycloak SDK/client packages
Prisma generated client
@vertex-os/database
application bootstrap code
application configuration globals
```

For IAM-00 specifically, the IAM core should have no reason to import NestJS either.

If a later plan intentionally introduces a framework adapter, that adapter should remain outside the core boundary.

### 15.3 Browser restriction

Browser-facing projects MUST NOT directly import the backend IAM core.

At minimum:

```text
apps/web -X-> @vertex-os/iam
packages/ui -X-> @vertex-os/iam
```

Frontend code must eventually consume stable HTTP/OpenAPI-derived contracts or a deliberately approved browser-safe contract package, not backend domain internals.

### 15.4 Database inversion

`packages/database` MUST NOT depend on `@vertex-os/iam`.

The generic database infrastructure package is lower-level infrastructure and must not learn business-domain semantics.

IAM persistence ownership introduced in IAM-01 must preserve dependency inversion rather than turning the generic database package into the IAM domain.

---

## 16. Dependency Matrix

The architecture after IAM-00 should satisfy this matrix.

| Source | Target | IAM-00 status | Reason |
|---|---|---:|---|
| `apps/api` | `@vertex-os/iam` | Allowed | Composition/root application may consume public IAM capability |
| `apps/web` | `@vertex-os/iam` | Forbidden | Browser must not couple to backend IAM core |
| `packages/ui` | `@vertex-os/iam` | Forbidden | UI primitives must remain domain-agnostic |
| `@vertex-os/iam` | `apps/api` | Forbidden | Domain core must not depend on composition root |
| `@vertex-os/iam` | `apps/web` | Forbidden | Domain core must not depend on browser |
| `@vertex-os/iam` | `packages/ui` | Forbidden | Domain core must not depend on presentation |
| `@vertex-os/iam` | `packages/database` | Forbidden in IAM-00 | Persistence adapter belongs to a later bounded layer |
| `packages/database` | `@vertex-os/iam` | Forbidden | Generic infra must not know domain |
| `@vertex-os/iam` | Keycloak packages | Forbidden | Keycloak is authentication infrastructure |
| `@vertex-os/iam` | React/Vite packages | Forbidden | Backend/domain purity |
| `@vertex-os/iam` | Prisma generated client | Forbidden | ORM details must not leak into core |
| future Auth boundary | `@vertex-os/iam` | Allowed | Auth may ask IAM whether mapped application access exists |
| `@vertex-os/iam` | future Auth boundary | Forbidden | IAM must not own authentication mechanics |

---

## 17. AuthModule Separation Rule

Authentication and IAM are related but distinct.

This plan MUST explicitly preserve the rule:

> `AuthModule` is not `@vertex-os/iam`.

A future `AuthModule` or equivalent BFF authentication boundary will own concerns such as:

- OIDC login orchestration;
- OIDC callback;
- server-side token handling;
- application-session cookie mechanics;
- CSRF/session binding;
- RP-initiated logout;
- IdP session termination integration;
- Keycloak adapter calls.

`@vertex-os/iam` must not absorb these because IAM also owns application authorization state that must remain independent of one identity-provider transport.

### IAM-00 implementation requirement

Do **not** create `AuthModule`.

Do **not** create placeholder auth code.

Instead:

- document the dependency direction in executable boundary configuration where possible;
- ensure IAM core cannot import future auth infrastructure;
- ensure future auth infrastructure can consume only IAM’s public API.

---

## 18. Keycloak Isolation Rule

No Keycloak runtime or SDK dependency belongs in IAM core.

The following categories are prohibited from `@vertex-os/iam`:

- Keycloak Admin API clients;
- OIDC client runtime;
- Keycloak-specific token types;
- realm/client config;
- Keycloak session objects;
- Keycloak user-representation DTOs as domain types.

Future Keycloak integration belongs to IAM-02 and/or the auth-infrastructure boundary defined by the accepted Master Plan.

If an adapter later maps a Keycloak identifier to an IAM application user, the mapping boundary must translate provider-specific structures into provider-neutral IAM inputs before calling IAM core behavior.

---

## 19. Prisma / Persistence Isolation Rule

IAM-00 contains no persistence work.

Therefore:

- do not modify the Prisma schema for IAM;
- do not create IAM migrations;
- do not generate IAM tables;
- do not introduce IAM repository implementations;
- do not expose Prisma generated types from IAM;
- do not make IAM core import `@vertex-os/database`.

IAM-01 will design persistence from the accepted IAM specification and the real IAM-00 repository state.

---

## 20. NestJS Isolation Rule

IAM core should remain framework-neutral in IAM-00.

Do not create NestJS decorators merely so the package appears integrated.

Avoid:

```ts
@Module(...)
@Injectable()
@Controller(...)
```

inside the core package during this stage unless the live canonical architecture explicitly requires an already-defined framework seam.

No feature behavior exists yet that needs dependency injection.

A future NestJS composition module may wire IAM application services, repositories, auth adapters, or controllers without turning the IAM core model into NestJS infrastructure.

---

## 21. Frontend Isolation Rule

IAM-00 performs no frontend work.

Do not add:

- React components;
- routes;
- TanStack Query hooks;
- permission hooks;
- navigation items;
- role-management UI;
- user-management UI;
- placeholder IAM screens.

The only permitted web/UI changes are architecture-enforcement configuration changes required to prove that frontend code cannot import backend IAM core code.

---

## 22. Centralized Environment Configuration Rule

The existing Vertex OS rule remains:

> Raw environment variables are read once, validated, and mapped into typed application configuration. New production code must not scatter `process.env` reads.

IAM-00 must strengthen this rule if it is not mechanically enforced yet.

### Required behavior

Production source under IAM must contain no direct:

```ts
process.env
```

reads.

New production source elsewhere in the repository must not use `process.env` outside the existing canonical environment loader.

### Preferred enforcement

Use ESLint on production source with an exception only for the established central environment/configuration loader.

For example, use a repository-appropriate restriction equivalent to:

```text
process.env is forbidden in production source
except in the canonical env loader
```

Do not invent a new `packages/config` solely for this rule if configuration is currently correctly owned by `apps/api`.

### Tests/setup

Do not break legitimate test harness setup that needs controlled environment variables.

Scope the lint rule intelligently to production source, with explicit narrow exceptions where the repository already requires them.

---

## 23. External Import Restrictions

Where the existing Nx/ESLint setup supports it cleanly, reinforce server/browser separation using external-package restrictions.

Examples of concepts IAM core should not import:

```text
react
react-dom
@tanstack/*
vite
@vitejs/*
@keycloak/*
keycloak-*
@prisma/client generated internals
fastify request/response-facing APIs
```

Do not add a brittle exhaustive blacklist if project tags already enforce the necessary separation more cleanly.

Use the smallest robust rule set.

---

## 24. Nx / ESLint Enforcement Strategy

The repository already has Nx module-boundary support.

IAM-00 must extend it rather than creating a parallel architecture system.

Use:

- Nx project tags;
- `@nx/enforce-module-boundaries`;
- `onlyDependOnLibsWithTags` and/or `notDependOnLibsWithTags` where appropriate;
- `bannedExternalImports` where it produces clear value;
- ESLint import restrictions for deep imports or rules Nx cannot express.

Do not adopt Nx Enterprise-only Conformance merely for this phase.

Do not switch the repository to a new linter.

Do not weaken existing rules to make the IAM package fit.

Current Nx documentation confirms that the ESLint boundary rule is designed for exactly this type of project/tag dependency constraint.

---

## 25. Package Export Enforcement

Package exports must reinforce the conceptual boundary.

The executing agent must inspect how `packages/database` and `packages/ui` are resolved in development/build.

Then make `@vertex-os/iam` consistent with the repository while preserving a closed public API.

Acceptance requires both:

1. the root IAM import path resolves according to repository conventions; and
2. a private/deep import is not considered an approved supported import path.

Do not add path aliases to internal folders.

---

## 26. Circular Dependency Policy

IAM-00 must not introduce cycles.

Required direction:

```text
composition -> domain/core
infrastructure adapter -> domain/core
domain/core -X-> composition
domain/core -X-> infrastructure implementation
```

Run the repository’s Nx graph/cycle checks if already available.

If no explicit cycle command exists, inspect the Nx dependency graph and rely on lint/build/typecheck evidence.

Do not add a new heavy dependency solely for cycle detection.

---

## 27. Architecture Verification Philosophy

IAM-00 is primarily an architecture phase.

Verification must therefore prove architecture, not just compilation.

The plan requires evidence for:

- project discoverability;
- package public resolution;
- dependency direction;
- frontend isolation;
- database isolation;
- deep-import restriction;
- absence of Keycloak/Prisma/auth behavior;
- absence of raw env reads in new production IAM code;
- no regression in existing project verification.

A green build alone is insufficient.

---

## 28. Negative Boundary Verification

At least once during execution, verify that key forbidden dependency rules actually fail.

Prefer one of these methods:

### Method A — Existing rule-test harness

If the repository already has tests around ESLint/Nx architecture rules, extend them.

### Method B — Temporary probe files

If no harness exists:

1. temporarily create a minimal violating source file;
2. run the real lint/boundary command;
3. confirm the expected rule fails;
4. delete the probe;
5. rerun lint successfully;
6. record the observed failure and final clean result in this plan.

Recommended probes:

- browser/web project importing `@vertex-os/iam`;
- IAM package importing `@vertex-os/database`;
- consumer deep-importing `@vertex-os/iam/src/...`;
- IAM production source directly reading `process.env` if the env rule is newly enforced.

Never leave violating probe files in the final tree.

---

## 29. Required Repository Search Gates

Before declaring IAM-00 complete, perform targeted searches.

No IAM persistence/auth implementation should exist.

Search for IAM-adjacent additions such as:

```text
Keycloak
keycloak
openid
oidc
authorization code
refresh_token
access_token
id_token
Prisma
process.env
@Controller
@Module
@Injectable
login
logout
session
role
permission
ApplicationUser
```

Interpret matches intelligently.

Documentation/specification mentions are expected.

The gate concerns unintended new executable implementation in IAM-00.

Also search for forbidden import forms such as:

```text
@vertex-os/iam/src
packages/iam/src
domains/iam/src
../iam/src
```

Final production source must contain no accepted deep-import pattern.

---

## 30. Expected File/Area Changes

The exact file list depends on the live workspace convention.

Expected change areas are limited to:

```text
domains/iam/**
root/Nx project configuration
root ESLint configuration
root TypeScript/package resolution configuration if required
root package scripts only if a real verification command is added
docs/plans/iam/IAM_00_ARCHITECTURE_FOUNDATION_PLAN.md
```

Possible but not automatically required:

```text
README.md
AGENTS.md
docs/ARCHITECTURE.md
docs/MODULES.md
docs/TESTING.md
```

Canonical documentation should be changed only if executable reality exposes a genuine missing or contradictory rule.

Do not rewrite canonical documents merely to restate this plan.

---

# Execution Milestones

---

## 31. Milestone 0 — Preflight and Baseline Freeze

### Goal

Prove that the repository state still matches the assumptions under which IAM-00 was planned.

### Work

Record:

```text
git status --short
git rev-parse HEAD
git log -n <small useful number> --oneline
```

Inspect the project tree and workspace graph.

Record the relevant versions/configurations already pinned by the repository.

Inspect:

- current Nx project tags;
- current module-boundary constraints;
- package conventions;
- config/env loader;
- existing root verify scripts;
- current `packages/database` exports;
- current `packages/ui` exports;
- current TypeScript path/package resolution.

Confirm:

- Phase 0 is complete;
- Design System foundation is complete;
- IAM spec is accepted;
- IAM Master Plan is present/active;
- no already-implemented IAM behavior conflicts with this plan.

### Acceptance

The plan remains valid against the live repository.

The agent records the full baseline commit.

The working tree is understood before edits.

### Stop condition

Stop before implementation if the current repository has already introduced architecture-significant IAM implementation that changes the intended boundary.

Do not silently redesign around it.

---

## 32. Milestone 1 — Create the Real IAM Core Project

### Goal

Introduce the smallest legitimate `@vertex-os/iam` project.

### Work

Create the IAM workspace project using existing manual/generator conventions.

Requirements:

- package name: `@vertex-os/iam`;
- private workspace package;
- TypeScript;
- strict settings inherited from root;
- Nx discovers the project;
- project is lintable;
- project is type-checkable/buildable according to the repository model;
- no runtime behavior;
- no persistence;
- no NestJS feature code;
- no auth code.

Mirror stable repository conventions rather than accepting unrelated generator defaults.

If a generator introduces Jest, Express, React, or other unrelated dependencies, remove them.

### Acceptance

Nx can enumerate the IAM project.

The IAM project passes its relevant lint/typecheck/build target.

No business behavior has been invented.

---

## 33. Milestone 2 — Establish the IAM Public Entry Point

### Goal

Make the IAM package’s public surface explicit before real IAM code accumulates.

### Work

Configure the package/root entry.

The root public import is:

```text
@vertex-os/iam
```

Close internal subpaths.

Do not create public subpath exports.

Do not publish `src`.

Do not add aliases for domain/application internals.

### Acceptance

The package root resolves correctly under the repository build/typecheck convention.

The export configuration does not intentionally expose internals.

A deep internal path is not an approved public contract.

---

## 34. Milestone 3 — Add IAM Project Tags and Dependency Constraints

### Goal

Make core dependency direction machine-enforceable.

### Work

Add/extend project tags and Nx/ESLint constraints.

Required semantics:

- IAM is a server-side domain/core project;
- browser/UI code cannot depend on IAM core;
- IAM core cannot depend on browser/UI projects;
- IAM core cannot depend on application projects;
- generic database infrastructure cannot depend on IAM;
- IAM core does not depend on database infrastructure in IAM-00.

Keep the constraint set understandable.

Prefer explicit rules over broad exceptions.

### Acceptance

The real lint command evaluates the constraints.

Existing projects remain valid.

No existing boundary is weakened.

---

## 35. Milestone 4 — Enforce Deep-Import and Infrastructure Isolation

### Goal

Prevent bypassing the project-level boundary through path tricks or implementation imports.

### Work

Enforce:

- no `@vertex-os/iam/src/...`;
- no relative imports from outside package into IAM `src`;
- no IAM imports of Keycloak packages;
- no IAM imports of Prisma generated implementation;
- no IAM imports of React/browser stack.

Use existing lint/package mechanisms.

Do not introduce a bespoke architecture framework.

### Acceptance

The repository has a clear enforcement mechanism for private IAM internals.

The rule produces a useful developer error rather than an obscure build failure where possible.

---

## 36. Milestone 5 — Preserve Auth/IAM Separation

### Goal

Make future authentication integration unable to redefine IAM ownership accidentally.

### Work

Do not create auth code.

Instead verify/configure the architecture so:

- IAM does not import authentication infrastructure;
- IAM does not import Keycloak;
- IAM does not own cookies/session/OIDC;
- future auth composition can depend on IAM public contracts.

If an existing tag vocabulary has an `auth` or infrastructure scope, ensure the direction remains toward IAM core, never from IAM core to auth.

Do not create an unused auth package solely to encode a future dependency edge.

### Acceptance

No AuthModule exists as a result of IAM-00.

No Keycloak runtime dependency exists as a result of IAM-00.

The allowed/forbidden direction is recorded and enforceable as far as currently-existing projects allow.

---

## 37. Milestone 6 — Enforce Centralized Environment Access

### Goal

Prevent IAM and future feature packages from creating uncontrolled configuration reads.

### Work

Identify the current canonical environment loader.

Add or refine ESLint enforcement so new production source cannot read:

```ts
process.env
```

outside the approved loader.

Keep test setup workable.

Do not move configuration ownership without a concrete reason.

### Acceptance

A raw env read in IAM production source fails the intended static check.

The existing canonical environment loader continues to work.

Existing tests/verification do not regress.

---

## 38. Milestone 7 — Prove the Boundary With Negative Checks

### Goal

Demonstrate that the enforcement is real.

### Work

Run controlled negative probes or existing architecture rule tests for the highest-risk violations.

At minimum prove two independent forbidden cases.

Strong preferred set:

1. web → IAM import is rejected;
2. IAM → database import is rejected;
3. IAM deep import is rejected;
4. IAM `process.env` read is rejected if newly enforced.

Record the exact observed rule/message.

Remove all probe code afterward.

### Acceptance

At least two forbidden cases demonstrably fail for the intended reason.

Final repository lint is clean after probes are removed.

---

## 39. Milestone 8 — Regression Verification

### Goal

Prove IAM-00 did not damage the existing platform.

### Work

Run the repository’s canonical verification commands.

Prefer the actual commands documented by the repository.

Expected categories:

```text
format check
lint
typecheck
unit tests
integration tests where part of normal verify
build
Nx project/graph validation
architecture/boundary verification
```

Run the full repository verification command if one exists, for example the repository’s real equivalent of:

```text
pnpm verify
```

Use the heavier/full verification command if it is required by `TESTING.md` for a change of this type.

Do not claim a command passed unless it actually ran and passed.

### Acceptance

All required existing checks are green, or an external/environmental blocker is explicitly proven and does not hide a repository failure.

---

## 40. Milestone 9 — Documentation and Plan Closeout

### Goal

Make the implementation state auditable without duplicating canonical policy.

### Work

Update this plan:

- Progress;
- Surprises & Discoveries;
- Decision Log;
- Outcomes & Retrospective;
- final commit/working-tree evidence;
- verification results;
- deviations.

Update canonical docs only where necessary.

Do not mark future IAM phases complete.

### Acceptance

The plan accurately describes what exists.

No intended behavior is reported as implemented behavior.

IAM-00 has a single final readiness verdict.

---

# Verification and Acceptance

---

## 41. Required Verification Matrix

| Gate | Required evidence |
|---|---|
| IAM project exists | Nx project discovery / workspace output |
| IAM package root is valid | typecheck/build/package-resolution evidence |
| IAM internals are closed | export/import configuration inspection + negative probe where practical |
| Browser cannot import IAM core | Nx/ESLint negative verification |
| IAM cannot import database in IAM-00 | Nx/ESLint negative verification |
| IAM cannot import app/UI internals | boundary configuration + lint |
| Keycloak absent | dependency/source search |
| Prisma IAM work absent | schema/migration/source search |
| Auth behavior absent | route/module/source search |
| Raw env access controlled | ESLint rule + search/negative probe |
| Existing repo remains healthy | canonical verify commands |
| No probe artifacts remain | git diff/tree review |
| Plan reflects reality | completed Progress/Decision/Outcome sections |

---

## 42. IAM-00 Definition of Done

IAM-00 is complete only when **all** of the following are true.

### Project foundation

- [ ] `@vertex-os/iam` exists as a real Nx workspace project.
- [ ] Its package identity is stable and deliberate.
- [ ] It follows existing workspace conventions.
- [ ] It contains no fake business implementation.
- [ ] It contains no speculative infrastructure.

### Public boundary

- [ ] Root public import is defined.
- [ ] Internal implementation paths are not public API.
- [ ] Deep imports are blocked or clearly rejected by supported resolution/lint rules.
- [ ] No wildcard public export exposes internals.

### Dependency architecture

- [ ] IAM project tags are present.
- [ ] Browser/UI → IAM core is forbidden.
- [ ] IAM core → browser/UI is forbidden.
- [ ] IAM core → apps is forbidden.
- [ ] database → IAM core is forbidden.
- [ ] IAM core → database is forbidden for IAM-00.
- [ ] IAM core → Keycloak is forbidden.
- [ ] IAM core → Prisma generated implementation is forbidden.

### Auth separation

- [ ] No `AuthModule` was created.
- [ ] No OIDC runtime was created.
- [ ] No Keycloak runtime was created.
- [ ] No authentication endpoints were created.
- [ ] The future dependency direction remains Auth/BFF → IAM public capability.

### Configuration

- [ ] New IAM production code contains no direct `process.env`.
- [ ] Centralized config ownership is preserved.
- [ ] Static enforcement exists if this rule was not already enforceable.

### Verification

- [ ] At least two forbidden-boundary negative checks were observed.
- [ ] Temporary probes were removed.
- [ ] lint passes.
- [ ] typecheck passes.
- [ ] required tests pass.
- [ ] build passes.
- [ ] canonical repository verify command passes when applicable.
- [ ] no unexpected dependency was added.
- [ ] final working tree contains only intended changes.

### Scope control

- [ ] no IAM Prisma model;
- [ ] no IAM migration;
- [ ] no IAM repository;
- [ ] no Keycloak integration;
- [ ] no application sessions;
- [ ] no IAM API;
- [ ] no IAM frontend;
- [ ] no role/permission implementation;
- [ ] no user implementation;
- [ ] no unrelated refactor.

---

## 43. Stop Conditions

Stop and report rather than improvising if any of these occur:

1. `docs/modules/iam.md` contradicts `IAM_MASTER_PLAN.md` on an architecture-significant rule.
2. the live repository has already implemented IAM in a way that materially changes this phase.
3. creating `@vertex-os/iam` would require changing an accepted canonical architecture decision.
4. the only way to make boundaries pass is to weaken existing architecture enforcement.
5. the only way to proceed is to implement Prisma/Keycloak/authentication early.
6. package naming/location is explicitly fixed differently by a canonical document.
7. environment/config ownership is materially different from the accepted baseline and the proposed lint rule would break intentional architecture.
8. a new external dependency appears necessary solely for architecture enforcement where existing Nx/ESLint can reasonably do the job.

A normal implementation bug is not a stop condition.

Fix normal implementation bugs within this plan.

---

## 44. Decision Log

### D-001 — Canonical IAM package path

Date: 2026-09-22  
Decision: Create `@vertex-os/iam` in `domains/iam` and add `domains/*` to the pnpm workspace.  
Why: The conditional `packages/iam` preference in this execution plan yields to the more specific accepted IAM specification and Master Plan, which explicitly call for the first domain under `domains/`.  
Evidence: `docs/modules/iam.md` Sections 43 and 55; `IAM_MASTER_PLAN.md` Sections 4.2 and 10; `pnpm-workspace.yaml` initially listed only `apps/*` and `packages/*`.  
Consequences: The first domain uses a distinct top-level path while retaining the existing first-party package and Nx conventions.  
Revisit trigger: An accepted ADR changes repository layout or domain package ownership.

### D-002 — Additive Nx classification and inward dependency rule

Date: 2026-09-22  
Decision: Tag IAM `type:lib`, `scope:backend`, `layer:domain`, `domain:iam`; allow domain-core dependencies only on `layer:domain` or future `layer:shared` projects, and ban server frameworks, browser frameworks, Prisma and Keycloak external imports for domain core.  
Why: Existing `type:*`, `scope:*`, and `layer:*` tags already enforce app, browser, UI and infrastructure direction. New tags preserve that vocabulary and identify the IAM owner.  
Evidence: `eslint.config.mjs`; `pnpm nx show project @vertex-os/iam --json`; the web → IAM and IAM → database negative probes.  
Consequences: IAM cannot import apps, UI, database, or unapproved framework/provider packages. Future domain or shared projects must receive a deliberate tag.  
Revisit trigger: A later approved plan introduces a concrete domain dependency needing a narrower rule.

### D-003 — Closed, behavior-free public package entry

Date: 2026-09-22  
Decision: Use a single conditional root export and an intentionally empty `src/index.ts`; ban IAM package subpaths and cross-project relative paths with ESLint/Nx.  
Why: IAM-00 establishes the supported import path without inventing public behavior.  
Evidence: `domains/iam/package.json`; Node root import succeeds, while `@vertex-os/iam/src/index.js` throws `ERR_PACKAGE_PATH_NOT_EXPORTED`; lint rejects both package and relative deep-import probes.  
Consequences: Later capabilities must be exported deliberately from the root.  
Revisit trigger: A later approved plan defines a real public capability or named subpath.

### D-004 — Centralized raw-environment read enforcement

Date: 2026-09-22  
Decision: Apply ESLint `no-restricted-syntax` to project production `src` files and exempt only the established API bootstrap through its own ESLint config; test/setup and CLI configuration files remain outside the production selector.  
Why: `apps/api/src/main.ts` passes raw input to the validated `loadAppConfig`, while Prisma/Vite CLI configuration has separate existing startup needs.  
Evidence: `apps/api/src/main.ts`, `apps/api/src/config/app-config.ts`, `packages/database/prisma.config.ts`, `apps/web/vite.config.mts`; the IAM `process.env` probe fails the rule and final lint passes.  
Consequences: New production feature code must consume typed configuration rather than raw environment variables.  
Revisit trigger: A new approved application bootstrap or configuration loader is introduced.

### D-005 — Keep configuration and Keycloak setup in consuming stages

Date: 2026-09-22  
Decision: Clarify the Master Plan's broad IAM-0 deliverables: IAM-00 enforces environment access and Keycloak isolation; typed IAM/auth settings and local Keycloak configuration arrive with the later stages that use them.  
Why: The approved executable IAM-00 plan explicitly excludes premature Keycloak/authentication implementation and unused configuration.  
Evidence: This plan Sections 7–8 and 22; `IAM_MASTER_PLAN.md` IAM-MP-00 and IAM-MP-03; no IAM runtime configuration is consumed today.  
Consequences: No speculative config shape or Keycloak files are created in IAM-00.  
Revisit trigger: The consuming IAM stage is planned from the accepted audit baseline.

---

## 45. Surprises & Discoveries

### S-001 — Duplicate untracked execution plan at baseline

Observed: Two byte-identical, untracked copies of this plan existed at the start: this canonical path and a repository-root copy.  
Evidence: Initial `git status --short`; both SHA-256 hashes were `BB4A1B7EA08516761192A2C40E67DAA570A2BE07F05E85A67C841252A25E5A93`.  
Impact: The root copy is included by the repository-wide Prettier check, unlike `docs/`.  
Action: Preserved both copies; formatted the root copy to satisfy the gate and updated this canonical plan with execution evidence.

Follow-up: The pre-execution root copy was removed after the user chose this implemented canonical plan as the version to keep.

### S-002 — Project-relative ESLint glob

Observed: The first raw-environment probe passed because an `apps/*/src` selector did not match when Nx launched ESLint inside `domains/iam`.  
Evidence: First IAM `process.env` probe exited zero; after changing the selector to `**/src/**/*`, the same probe failed under `no-restricted-syntax`.  
Impact: A path-looking rule would have provided false confidence.  
Action: Corrected the selector and reran the negative probe before accepting the milestone.

### S-003 — Local pnpm metadata and workspace-state mismatch

Observed: The available local pnpm reports 11.25.0 while `package.json` pins 12.5.1. Its default run preflight tried to reinstall `node_modules` after the new workspace pattern, and lockfile-only install could not verify release-age metadata offline; registry requests were denied with `EACCES`. The package manager nevertheless generated the required empty `domains/iam` lockfile importer.  
Evidence: `pnpm config list`, `pnpm install --lockfile-only --offline`, registry retry errors, and the one-entry `pnpm-lock.yaml` diff.  
Impact: Local scripts needed `pnpm_config_verify_deps_before_run=warn` plus the existing root `.bin` on `PATH`. No dependency versions changed.  
Action: Ran the real repository scripts with those environment settings; left package policy unchanged. CI's pinned pnpm/frozen install remains an audit/CI check.

### S-004 — Docker runtime unavailable

Observed: The Docker CLI could not connect to `//./pipe/docker_engine`; both existing Testcontainers integration suites failed before tests could run.  
Evidence: `docker info` and `pnpm test:integration` reported `Could not find a working container runtime strategy`.  
Impact at initial closeout: Integration and the Docker-dependent full verification gate could not be proven locally. This phase changed no persistence or runtime behavior.  
Action: Recorded the external blocker without weakening or skipping the suites. Docker 29.2.1 was subsequently accessible; the integration suites passed during the follow-up `pnpm verify:full` run.

### S-005 — One Firefox overlay E2E failure during full verification

Observed: After Docker became available, `pnpm verify:full` passed format, lint, typecheck, unit tests, build, Prisma validation/generation and both PostgreSQL integration suites, then failed one design-system lab test in Firefox. Playwright reported 129 passed and one failure: the dialog focus-trap predicate exceeded its 1,000 ms timeout during the 12-step Tab/Shift+Tab loop.  
Evidence: `apps/web-e2e/src/lab/shared/overlays.spec.ts:5` and its retained trace/screenshot under ignored `apps/web-e2e/test-output`; the same test passed three times in one focused Firefox run (`--repeat-each=3`).  
Impact: The full verification gate is not green. The focus behavior under the full parallel suite remains uncertain; an isolated pass does not erase the failure.  
Action: Preserved the failing test and its diagnostics, made no unrelated UI change, and recorded the residual finding for independent audit.

---

## 46. Progress

- [x] M0 Preflight and baseline freeze — `eef2b25abb1b140c52c28279611b5b6df56fe66a`; only the two untracked plan copies existed initially; this matches the execution plan's expected `eef2b25` baseline.
- [x] M1 IAM core project — Nx discovers `@vertex-os/iam`; focused lint, typecheck and build pass.
- [x] M2 Public entry point — root import resolves; deep package path is not exported.
- [x] M3 Nx tags and dependency constraints — tags and additive constraints active; graph has no IAM dependency edge.
- [x] M4 Deep-import/infrastructure isolation — package and relative probes rejected; IAM → database probe rejected.
- [x] M5 Auth/IAM separation — source/dependency search confirms no auth or provider implementation in IAM.
- [x] M6 Centralized environment access enforcement — IAM raw-read probe rejected; existing bootstrap and final lint pass.
- [x] M7 Negative boundary verification — five independent violations and a relative-path variant failed for the intended rules; probes removed.
- [x] M8 Regression verification — the required fast gate, Prisma validation, Nx checks and later PostgreSQL integration suites pass. The additional full gate has one Firefox design-system E2E failure documented in S-005.
- [x] M9 Documentation and closeout — status, decisions, discoveries, outcomes, Master Plan ledger and README reflect the resulting tree.

---

## 47. Outcomes & Retrospective

### Delivered

`domains/iam` is a private Nx workspace library with one closed root export, no dependencies and no business implementation. Additive Nx tags and constraints isolate browser, UI, database and implementation infrastructure from IAM core. ESLint rejects IAM deep imports and raw environment reads in production source. The existing API bootstrap remains the sole application raw-environment bridge.

### Deliberately not delivered

No IAM models, migrations, repositories, Keycloak configuration/runtime, OIDC, login/logout, sessions, authorization behavior, API, frontend, users, roles or permissions were added.

### Verification evidence

`pnpm verify` — PASS (format, lint, typecheck, tests and build; local pnpm preflight set to warn).  
`pnpm db:validate` — PASS.  
`pnpm nx show project @vertex-os/iam --json`, `pnpm nx graph --file=.nx/iam-00-graph.json`, `nx sync:check` — PASS.  
Node package self-import — PASS for root; deep path rejected with `ERR_PACKAGE_PATH_NOT_EXPORTED`.  
Web → IAM, IAM → database, package deep import, relative deep import, IAM → React and IAM raw-env lint probes — expected failures; all probe files removed.  
`pnpm test:integration` — BLOCKED by absent Docker engine; both existing Testcontainers suites fail before execution.  
`pnpm install --lockfile-only --offline` — BLOCKED by absent pnpm release-age metadata; lockfile contains only the generated new importer.

Follow-up after Docker recovery: `docker info` — PASS (server 29.2.1). `pnpm verify:full` — FAIL at Playwright only: 129 passed, one Firefox dialog focus-trap test failed; all preceding stages, including both PostgreSQL integration suites, passed. Focused Playwright Firefox run of that same test with `--repeat-each=3` — PASS (3/3). No test was skipped or weakened.

### Deviations

The conditional `packages/iam` preference resolved to `domains/iam` because the accepted IAM specification and Master Plan explicitly name the domain path. Broad Master Plan IAM-0 preparation for typed auth/Keycloak configuration was narrowed to this executable plan's architecture-only scope and aligned in the Master Plan.

### Remaining risks

The full gate is red due to the one Firefox overlay focus-trap failure under parallel E2E execution; the isolated three-run check passed, so reproducibility under full load remains unresolved. A frozen install with pinned pnpm 12.5.1 has not been run in this environment; the lockfile change is limited to `domains/iam: {}`.

### Final working tree

At the initial IAM-00 implementation closeout, `HEAD` remained `eef2b25abb1b140c52c28279611b5b6df56fe66a`; no commit, branch change or remote action had been made. Those intended changes were later committed and pushed to `main` as `40c5aff39713b810af5e41a62a3c6ad0683130bc`. The initially untracked repository-root duplicate has now been removed; this canonical plan remains the sole IAM-00 execution plan. No probe or generated source file was committed.


---

## 48. Required Final Execution Report

The implementing agent’s final response after executing IAM-00 must contain:

### 1. Executive Result

Use exactly one:

```text
IAM-00 COMPLETE — READY FOR INDEPENDENT AUDIT
```

or

```text
IAM-00 NOT COMPLETE
```

### 2. Baseline

- starting commit;
- ending working-tree state;
- whether the baseline differed from the planning baseline.

### 3. Files / Areas Changed

Group by purpose.

### 4. Architecture Established

State the real final:

- IAM package path/name;
- project tags;
- package exports;
- allowed dependency directions;
- forbidden dependency directions;
- deep-import protection;
- env-access enforcement.

### 5. Explicit Scope Confirmation

Confirm no Prisma/Keycloak/auth/session/API/UI work was introduced.

### 6. Negative Verification

Report the forbidden imports/behaviors intentionally tested and the observed rejection.

### 7. Verification

For every command actually run:

```text
command — PASS / FAIL / BLOCKED
```

Never convert “not run” into “pass”.

### 8. Deviations / Discoveries

Summarize material items from the plan.

### 9. Remaining Blockers

Only concrete blockers.

### 10. Exact Next Step

When complete, state:

```text
Perform an independent read-only audit of IAM-00 against
docs/modules/iam.md, IAM_MASTER_PLAN.md, this execution plan,
and the resulting repository state.
Do not begin IAM-01 during that audit.
```

Then stop.

---

## 49. Independent Audit Gate

IAM-00 execution is not enough to begin IAM-01.

A separate conversation/agent should perform a read-only audit.

The audit must verify:

- scope did not expand;
- package boundary matches accepted IAM ownership;
- Auth/IAM separation remains intact;
- no persistence/authentication implementation slipped in;
- module-boundary rules are actually active;
- negative checks are credible;
- canonical docs and executable reality do not conflict;
- verification results are reproducible;
- final repository state is clean.

Audit verdict must be one of:

```text
IAM-00 ACCEPTED
```

or

```text
IAM-00 REJECTED — FIXES REQUIRED
```

Only `IAM-00 ACCEPTED` unlocks IAM-MP-01 planning.

---

## 50. Next Planning Step After Acceptance

After IAM-00 is executed, independently audited, and accepted:

Create the next rolling-wave execution plan for:

```text
IAM-MP-01 — Persistence Foundation
```

Recommended filename:

```text
docs/plans/iam/IAM_01_PERSISTENCE_FOUNDATION_PLAN.md
```

That plan should be authored **from the actual accepted IAM-00 repository state**, not copied in advance from a generic template.

IAM-01 should then address the accepted IAM persistence model, Prisma schema/migration design, constraints, identifiers, lifecycle state, repository adapters, real PostgreSQL integration tests, and migration safety—without pulling Keycloak/OIDC runtime work forward from IAM-02.

Do not create IAM-01 in detail before IAM-00 has been accepted.

---

## 51. Architecture Rationale

This sequence is intentional.

If persistence, Keycloak, sessions, permissions, controllers, and UI are added before the package boundary is enforceable, later cleanup becomes a refactor of security-sensitive code.

By establishing the domain boundary first:

- Keycloak cannot accidentally become the application authorization model;
- Prisma cannot become the public domain API;
- React cannot depend on backend internals;
- authentication cannot swallow IAM ownership;
- IAM cannot become a global business-policy dumping ground;
- environment access remains centralized;
- later plans inherit a mechanically safer repository.

The cost of IAM-00 should remain small.

Its value is that every later IAM phase becomes easier to reason about and harder to implement incorrectly.

---

## 52. Plan Quality Rules

While executing and updating this plan:

- keep the plan self-contained for IAM-00;
- link to canonical ownership instead of duplicating entire policies;
- describe observed reality, not intention;
- keep package architecture minimal;
- avoid empty speculative scaffolding;
- avoid abstractions without a current consumer;
- do not add libraries when Nx/ESLint/TypeScript already solve the problem;
- do not weaken an existing rule to get green checks;
- prefer compile-time/static enforcement over comments;
- prefer one obvious public import path;
- treat a boundary that is not tested/enforced as weaker than a boundary that is;
- do not mark completion because files merely exist;
- do not start IAM-01 implementation;
- preserve rolling-wave discipline.

---

## 53. Plan Completion Rule

This plan becomes `COMPLETE` only when:

1. every IAM-00 Definition of Done item is satisfied;
2. verification evidence is recorded;
3. temporary negative-test probes are removed;
4. canonical documentation does not contradict executable reality;
5. the implementation agent issues:

```text
IAM-00 COMPLETE — READY FOR INDEPENDENT AUDIT
```

The plan must then stop.

The next action is an independent audit, not persistence implementation.
