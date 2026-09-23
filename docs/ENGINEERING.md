# Vertex OS Engineering Rules

> Canonical implementation rules for production code in Vertex OS.

## 1. Purpose

This document defines repository-wide engineering invariants: how production code MUST be structured, how architectural boundaries MUST be respected, and how backend, frontend, persistence, contracts, asynchronous work, and cross-cutting concerns MUST behave.

This document is intentionally compact. It is a rulebook, not a tutorial.

It does not define:

- product scope -> `docs/PRODUCT.md`
- system architecture -> `docs/ARCHITECTURE.md`
- module ownership -> `docs/MODULES.md`
- security policy -> `docs/SECURITY.md`
- testing strategy -> `docs/TESTING.md`
- domain-specific behavior -> `docs/modules/*.md`
- design-system details -> `docs/DESIGN_SYSTEM.md`

When documents overlap, the more specific canonical document governs its own scope.

---

## 2. Normative Language

- **MUST / MUST NOT** — mandatory. Deviation requires an accepted ADR.
- **SHOULD / SHOULD NOT** — strong default. Deviation requires a documented reason.
- **MAY** — optional when appropriate.

Rules that can reasonably be enforced by tooling SHOULD be enforced by tooling rather than prose alone.

---

## 3. Core Engineering Principles

1. **Correctness before convenience.** Business invariants MUST survive malformed clients, retries, concurrency, and direct API use.
2. **Backend authority.** Durable business behavior MUST be enforced server-side.
3. **Explicit ownership.** Every mutable business entity MUST have one owning module.
4. **Strong boundaries.** Modules MUST interact through declared public contracts, not internal implementation details.
5. **Pragmatic architecture.** Complexity MUST earn abstraction; architecture theater is forbidden.
6. **Explicit side effects.** Persistent writes, events, notifications, external calls, and audit effects MUST be visible in the execution model.
7. **Safe defaults.** Security-sensitive behavior MUST fail closed.
8. **Single source of truth.** Rules, contracts, and generated artifacts MUST NOT be manually duplicated without necessity.
9. **Operational clarity.** Production behavior MUST be observable, traceable, and diagnosable.
10. **Progressive disclosure.** Keep global rules compact; move domain detail to module documentation and major rationale to ADRs.

---

## 4. Authority Model

### 4.1 Backend

The backend is the authoritative executor of domain behavior.

The backend MUST enforce:

- authentication and authorization;
- business invariants;
- state-transition rules;
- authoritative calculations;
- pricing, discounts, totals, and financial rules;
- approval and workflow eligibility;
- numbering and sequence rules;
- cross-entity validation;
- durable side effects;
- audit decisions;
- persistent state changes.

A request MUST remain correct even if the frontend is bypassed entirely.

### 4.2 Frontend

The frontend owns presentation and interaction behavior, including:

- view and component state;
- form state and local drafts;
- navigation;
- loading and error presentation;
- local sorting/filtering when appropriate;
- formatting;
- accessibility behavior;
- responsive behavior;
- keyboard and pointer interactions;
- reversible optimistic UX.

Client-side validation and permission checks MAY mirror server rules to improve UX, but MUST NOT be treated as correctness or security boundaries.

When the frontend computes a business-derived preview, the backend MUST recompute or validate the authoritative result before persistence.

### 4.3 Database

The database protects persistence integrity through appropriate constraints, indexes, relationships, and transactions.

Business workflows SHOULD remain explicit in backend application/domain code.

Hidden workflow logic in database triggers or stored procedures MUST NOT be introduced without an accepted ADR.

---

## 5. Repository and Package Boundaries

Repository structure MUST preserve clear ownership and dependency direction.

Code SHOULD be organized around deployable applications, reusable technical packages, and business modules rather than horizontal dumping grounds.

A package MUST have a clear purpose and owner.

`shared`, `common`, `utils`, or equivalent packages MUST NOT become repositories for unrelated domain logic.

Domain-specific code MUST remain with its owning domain/module.

Circular dependencies MUST NOT be introduced.

---

## 6. Module Anatomy

Business modules SHOULD follow this conceptual structure where the complexity warrants it:

```text
<module>/
├─ domain/
├─ application/
├─ infrastructure/
├─ presentation/
├─ <module>.module.ts
└─ public.ts
```

The exact folder count MAY be reduced for simple features, but architectural responsibilities MUST remain clear.

The implemented backend modules (IAM, Audit) realize this structure as two Nx projects per module, and lint enforces the split:

- the core project `domains/<module>` (`layer:domain`) holds `domain/` and `application/`, including the ports; its public surface is the package entry `src/index.ts`, and a module MAY add a private, lint-restricted entry for its own adapter (for example `@vertex-os/iam/persistence`);
- the adapter project `domains/<module>-persistence` (`layer:adapter`) holds the persistence adapters behind those ports and reaches the database only through its domain-scoped `@vertex-os/database/<module>` entry;
- an external-service adapter is a further `layer:adapter` project of the module, with its own private, lint-restricted entry into the core; IAM's Keycloak Admin adapter is `domains/iam-keycloak` (`@vertex-os/iam/identity-provider`) and never reaches the database;
- composition (wiring adapters to ports) happens in `apps/api`.

Neither project may import NestJS or `@prisma/*` directly. Where inbound transport code (Section 6.4) lives is decided by the first run that adds a module endpoint and is then recorded here.

Browser authentication (application sessions, login attempts, CSRF, OIDC) is platform infrastructure, not a business module (`docs/modules/iam.md` Section 6.2). It lives in `apps/api/src/auth`, which alone may import its scoped persistence entry `@vertex-os/database/auth` (lint-enforced), calls IAM only through `@vertex-os/iam`, and appends Audit evidence through the Audit capability bound to its own transactions (`docs/plans/iam/IAM_R03_SESSIONS_AND_OIDC_PLAN.md` D-01).

### 6.1 Domain

`domain/` contains business concepts and rules that are meaningful independently of frameworks.

It MAY contain:

- entities;
- aggregates;
- value objects;
- domain policies;
- domain services;
- domain events;
- domain errors.

Domain code MUST NOT depend on:

- NestJS;
- HTTP;
- Prisma;
- Redis;
- queues;
- Temporal or workflow engines;
- email/SMS providers;
- filesystem or object-storage implementations;
- React or browser APIs.

Do not create domain abstractions when no meaningful domain behavior exists.

### 6.2 Application

`application/` orchestrates use cases.

It MAY contain:

- commands/use cases;
- queries;
- ports/interfaces;
- application policies;
- transaction orchestration;
- coordination across owned domain objects and approved external capabilities.

Application code MUST enforce use-case-level authorization and orchestration where resource context is required.

### 6.3 Infrastructure

`infrastructure/` contains implementation details such as:

- Prisma repositories;
- external service adapters;
- queue adapters;
- persistence mapping;
- storage adapters;
- integration clients.

Infrastructure MUST implement declared application/domain ports rather than leak vendor details inward.

### 6.4 Presentation

`presentation/` contains transport-specific behavior such as:

- HTTP controllers;
- request/response schemas;
- transport mapping;
- HTTP-specific guards/interceptors where appropriate.

Controllers MUST remain thin.

Controllers MUST NOT contain authoritative business rules or direct persistence orchestration.

---

## 7. Dependency Direction

The intended dependency direction is:

```text
presentation -> application -> domain
infrastructure -> application/domain contracts
```

Inner layers MUST NOT import outer-layer implementation details.

Framework-specific decorators or types SHOULD remain near framework boundaries unless their use is demonstrably harmless and intentionally standardized.

---

## 8. Module Ownership and Public APIs

Every mutable business entity MUST have exactly one owning module.

Only the owning module MAY directly mutate its owned state.

Cross-module writes MUST go through the owning module's declared public application capability.

A module MUST NOT:

- import another module's internal files;
- use another module's repository directly;
- mutate another module's Prisma models directly;
- depend on another module's private services;
- bypass ownership through shared helpers.

Each module SHOULD expose a narrow `public.ts` or equivalent public surface.

Public module surfaces MAY expose:

- stable identifiers;
- public application capabilities;
- approved query contracts;
- stable event contracts;
- explicitly shared types.

They MUST NOT expose infrastructure implementations or persistence internals.

Read-only reporting MAY use approved projections/read models that cross domain ownership, but MUST NOT become an alternate write path.

---

## 9. Use-Case Execution Model

A write use case SHOULD conceptually execute in this order when applicable:

```text
request
-> authenticate
-> authorize
-> validate transport input
-> load required state
-> validate business rules
-> perform domain transition
-> persist atomically
-> record required audit and durable-delivery effects, when applicable
-> commit
-> perform post-commit asynchronous effects
-> return authoritative result
```

Not every use case requires every step, but omitted steps MUST be intentionally unnecessary.

Business rules MUST NOT be scattered across controllers, repositories, UI components, and background workers.

---

## 10. Frontend Engineering Model

Frontend feature code MUST use the Vertex in-house UI/design-system primitives where an approved primitive exists.

Feature code MUST NOT create parallel design systems or isolated component conventions without justification.

Frontend code MAY contain presentation-derived logic, but MUST NOT become the authoritative source for domain rules.

Server state and local UI state SHOULD be modeled separately.

Frontend API access SHOULD go through approved generated or centralized API clients rather than ad-hoc `fetch` calls distributed across components.

React components SHOULD primarily compose UI and interaction behavior; reusable business-independent transformations MAY live in dedicated frontend utilities/hooks.

Permission-based hiding or disabling in the UI is a UX feature only. The backend MUST enforce the same protected operation independently.

Optimistic updates MAY be used only when failure can be reconciled safely with the authoritative server result.

---

## 11. API and Contract Rules

HTTP APIs MUST have explicit, stable request and response contracts.

API contracts MUST NOT expose Prisma models as public contracts.

Domain entities MUST NOT be serialized directly merely because their shape resembles an API response.

OpenAPI SHOULD be the machine-readable source for HTTP contract generation and client typing.

When generated API types/clients exist, equivalent handwritten duplicates SHOULD NOT be introduced.

Breaking API changes MUST be intentional and coordinated.

Pagination, filtering, sorting, and search conventions MUST be consistent across endpoints.

Transport concerns MUST remain separate from domain behavior.

---

## 12. Validation

Validation is split into two categories.

### 12.1 Transport / Syntactic Validation

API boundaries MUST validate untrusted input for shape and syntax, including as applicable:

- required fields;
- scalar type;
- length/range;
- enum values;
- identifier shape;
- date/time format;
- collection limits.

Unknown or disallowed fields SHOULD be rejected at sensitive write boundaries.

### 12.2 Semantic / Business Validation

Business validity MUST be enforced in application/domain code.

Examples include:

- whether a transition is allowed;
- whether an actor may approve a specific resource;
- whether a discount is allowed;
- whether a fiscal/business rule permits an operation.

DTO/schema validation MUST NOT become a substitute for domain validation.

---

## 13. Error Model

Errors MUST be intentional, typed where practical, and mapped consistently at boundaries.

Expected business failures MUST NOT rely on generic exceptions with arbitrary messages as their contract.

HTTP error responses SHOULD follow a consistent Problem Details model compatible with RFC 9457 and MAY include stable application fields such as:

- `code`;
- `traceId`;
- field-level validation details.

Internal stack traces, secrets, database errors, and infrastructure details MUST NOT be exposed to clients.

Errors MUST NOT be silently swallowed.

A caught error MUST be handled, translated, retried under an approved policy, or rethrown with preserved causal context.

---

## 14. Persistence and Prisma

Prisma is a persistence implementation detail.

The Prisma major-version baseline is defined once, in `docs/ARCHITECTURE.md` (AC-06).

Prisma client access MUST be centralized in approved infrastructure/persistence code.

Prisma-generated types MUST NOT leak into domain models or public API contracts.

Repositories SHOULD represent meaningful persistence boundaries rather than mirror every table mechanically.

Queries MUST select only the data reasonably required for the use case.

Potential N+1 query patterns MUST be avoided.

Schema constraints MUST protect invariants that are fundamentally persistence-level invariants, such as uniqueness and referential integrity.

Every schema change MUST have an intentional migration strategy.

Production migrations MUST be forward-safe and reviewable.

Every PostgreSQL migration MUST be wrapped in one explicit `BEGIN;` ... `COMMIT;` transaction,
with no `CREATE INDEX CONCURRENTLY` or other statement that cannot run inside it, unless an
explicitly planned exception documents the alternative. Prisma 7.10 does not make migration
application atomic by itself (IAM-01 planning probe P-05); the wrapper prevents a failed
migration from leaving a partial schema.

Destructive schema changes MUST include an explicit data-migration/rollout plan.

---

## 15. Transactions

Transaction boundaries belong to application use cases or approved transaction orchestration.

Controllers MUST NOT own transaction logic.

Transactions MUST be kept as short as practical.

Remote network I/O MUST NOT occur inside a database transaction unless an accepted ADR proves it unavoidable and safe.

Do not send email, call external APIs, upload remote files, or wait on external systems while holding a database transaction open.

All state changes that must succeed or fail together MUST share one atomic boundary when technically possible.

A use case that must atomically change state owned by more than one module (`docs/ARCHITECTURE.md`, AR-022) MAY establish the transaction context, but MUST invoke each owning module through its public application capability.

Prisma transaction clients and other infrastructure transaction handles MUST NOT appear in a module's public surface or in domain code. The mechanism, decided with the first genuine cross-module case (an IAM mutation and its MOD-AUDIT evidence, `docs/plans/iam/IAM_02_REFERENCE_DATA_AND_AUDIT_FOUNDATION_PLAN.md` D-04), is: `@vertex-os/database` exports an opaque, type-only `DatabaseTransaction` handle and opens transactions only through `runInTransaction` on its domain-scoped persistence entries; the owning module's adapter implements a module-specific transaction port (for IAM, `IamTransactionRunner`) whose work receives only capability interfaces already bound to that transaction; and the composition root supplies the other module's capability factory (for example `auditRecorderFor: createAuditRecorder`), so no adapter imports another module's adapter. The changes and their evidence commit together or not at all. A generic unit-of-work or transaction-orchestration framework and ambient (implicit) transactions remain forbidden.

Post-commit side effects that require durable delivery MUST use an explicitly approved durable-delivery mechanism. None is part of the baseline; the mechanism (for example an outbox) is chosen when the first genuine durable-delivery use case is implemented, not by default.

---

## 16. Concurrency, Retries, and Idempotency

Code MUST assume that concurrent requests and retries can occur.

Read-modify-write workflows MUST define how lost updates and concurrent modifications are handled when they matter.

Idempotency SHOULD be designed for operations that are sensitive to duplicate execution, including as applicable:

- payments;
- invoice/document posting;
- automation execution;
- webhook processing;
- external integration commands;
- retryable background work.

Idempotency keys/results MUST be scoped and persisted according to the owning use case's correctness requirements.

Blind retry loops MUST NOT be introduced.

---

## 17. Events and Asynchronous Work

Events describe facts that happened; commands request work to happen.

Prefer event names such as:

- `ProjectActivated`;
- `InvoiceIssued`;
- `PaymentRecorded`.

Event payloads SHOULD remain small and stable, usually containing identifiers, metadata, and essential immutable facts rather than full entity snapshots.

An event handler MUST NOT bypass module ownership rules.

Background jobs MUST be safe for retries when the underlying runner may redeliver work.

Durability requirements MUST be explicit. In-memory publication MUST NOT be assumed sufficient for business-critical post-commit effects.

---

## 18. Queries, Read Models, and Reporting

Write paths MUST preserve strict ownership and domain invariants.

Read paths MAY use optimized projections/read models when they materially improve performance, reporting, or cross-module aggregation.

Read models MUST remain read-only with respect to authoritative domain state.

Complex dashboards SHOULD prefer purpose-built queries/projections over forcing every read through write-domain aggregates.

CQRS-style separation MAY be introduced selectively; it MUST NOT be adopted ceremonially where simple queries are sufficient.

---

## 19. Money and Numeric Precision

Authoritative monetary calculations MUST NOT use binary floating-point arithmetic.

Money MUST carry currency explicitly.

Persistence SHOULD use exact numeric/decimal representations appropriate to the required precision.

Exchange rates MAY require higher precision than monetary amounts.

Rounding rules MUST be explicit and domain-owned.

Frontend monetary calculations are previews unless the backend explicitly returns an authoritative calculated result.

---

## 20. Date and Time

Code MUST distinguish among:

- instants in time;
- date-only business values;
- local business date/time;
- scheduling time zones.

Instants MUST be stored and transmitted using timezone-aware semantics.

Business-local scheduling MUST retain the applicable IANA timezone when future wall-clock behavior matters.

Date-only concepts MUST use date semantics, not arbitrary midnight timestamps.

Server-side business rules MUST NOT depend on the developer machine's local timezone.

---

## 21. IDs, Enums, and Data Semantics

Identifiers MUST be opaque outside the owning domain unless a documented semantic identifier is intentionally part of the domain.

Clients MUST NOT infer meaning from opaque IDs.

Enums represent closed sets and MUST be changed deliberately because they affect persistence and contracts.

Free-form strings MUST NOT replace stable domain codes when the domain requires a controlled vocabulary.

Magic numbers and magic strings in business logic MUST NOT be introduced; use named constants, configuration, or domain values as appropriate.

---

## 22. TypeScript Rules

TypeScript strictness MUST remain enabled for production code.

Repository configuration SHOULD enable additional safety options where compatible, including `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`.

New `any` usage MUST NOT be introduced without a justified boundary reason.

Use `unknown` for untrusted values until validation/narrowing occurs.

Public functions and exported boundaries SHOULD have intentional types rather than inference that obscures the contract.

Non-null assertions (`!`) and unsafe type assertions (`as`) SHOULD be rare and justified by an invariant the compiler cannot express.

Type errors MUST NOT be suppressed to make builds pass.

---

## 23. Code Quality and Clean Code

Names MUST reflect domain meaning and intent.

Functions SHOULD have one clear responsibility and remain small enough to understand without excessive scrolling or hidden state.

Long parameter lists SHOULD be replaced with meaningful objects when they represent one concept or operation.

Duplication SHOULD be removed when it represents the same concept and is likely to evolve together; incidental visual similarity alone does not justify abstraction.

Comments SHOULD explain **why**, constraints, or non-obvious tradeoffs; they SHOULD NOT narrate obvious code.

Dead code, commented-out implementations, debugging output, and unused abstractions MUST NOT remain in production code.

Boolean flags that radically change a function's behavior SHOULD be replaced with clearer operations or explicit strategy/state where practical.

Deep nesting and complex conditionals SHOULD be reduced using guard clauses, decomposition, or domain policies when this improves clarity.

Abstraction MUST follow demonstrated need. Do not introduce factories, base classes, generic repositories, specifications, or strategy layers solely for architectural appearance.

---

## 24. Configuration and Secrets

Deploy-specific configuration MUST come from approved external configuration/environment mechanisms, not source-code constants.

Configuration MUST be typed and validated at application startup.

Invalid mandatory configuration MUST fail fast.

Secrets MUST NOT be committed to source control, embedded in frontend bundles, or written to logs.

Environment variables SHOULD be mapped once into typed application configuration rather than read ad hoc throughout the codebase.

---

## 25. Logging, Tracing, and Observability

Production logs MUST be structured.

Logs SHOULD include useful operational context where available, such as:

- module/operation;
- trace/request identifier;
- actor identifier when appropriate;
- stable resource identifier;
- error classification.

Secrets, credentials, session tokens, authorization headers, and unnecessary sensitive data MUST NOT be logged.

`console.log`-style debugging MUST NOT remain in production paths.

Trace/request correlation SHOULD propagate through synchronous and asynchronous boundaries where supported.

Logs are not an audit trail.

---

## 26. Audit

Business-significant changes MUST produce audit records according to the system audit policy.

Audit records SHOULD answer, when applicable:

- who acted;
- what action occurred;
- which resource was affected;
- when it occurred;
- relevant before/after or transition context;
- originating request/correlation context.

Audit generation MUST NOT depend on the frontend.

Audit data MUST NOT be silently rewritten as ordinary mutable business data.

---

## 27. Files and Assets

Business modules MUST reference files/assets through stable file/asset identifiers, not storage paths or provider-specific URLs as domain identity.

Storage implementation details MUST remain behind the owning files/assets capability.

The architecture MUST NOT assume S3-compatible storage unless that decision is explicitly reintroduced.

Local-first development storage MAY be used while preserving an abstraction that allows future deployment/storage changes without rewriting business modules.

---

## 28. Security Baseline

Detailed policy belongs in `docs/SECURITY.md`, but the following repository-wide invariants apply:

- protected operations MUST enforce authorization server-side;
- authorization MUST fail closed;
- input from clients and integrations MUST be treated as untrusted;
- secrets MUST remain out of source, logs, and client bundles;
- browser application code MUST NOT receive, store, or attach identity-provider tokens; authentication is carried only by the backend-issued application session cookie;
- security-relevant failures MUST NOT leak sensitive implementation detail;
- ownership boundaries MUST NOT be bypassed for convenience.

Security-sensitive changes MUST follow `docs/SECURITY.md`.

---

## 29. Testing Baseline

Detailed strategy belongs in `docs/TESTING.md`.

Behavior changes MUST include the level of automated verification appropriate to their risk.

Bug fixes SHOULD include a regression test when practical.

Tests MUST assert observable behavior and important invariants, not merely implementation details.

Critical domain rules MUST NOT rely exclusively on end-to-end tests for coverage.

External systems SHOULD be isolated behind adapters so behavior can be tested deterministically.

A green test suite MUST NOT be achieved by disabling, skipping, or weakening relevant tests without documented justification.

---

## 30. Definition of Done

A production change is complete only when all applicable items are satisfied:

- architectural and module boundaries remain valid;
- typecheck passes;
- lint/static checks pass;
- required tests pass;
- API contracts are updated when behavior/contracts change;
- migrations are included and reviewed when persistence changes;
- protected behavior has server-side authorization;
- validation exists at the correct boundaries;
- transaction and concurrency behavior are intentional;
- audit/event/side-effect requirements are implemented;
- logs do not expose secrets or unnecessary sensitive data;
- affected canonical documentation is updated;
- no temporary debugging code or unjustified TODO remains.

---

## 31. Exceptions and ADRs

A `MUST`-level rule may be broken only through an accepted Architecture Decision Record (ADR).

An ADR for an exception MUST document:

- the rule being overridden;
- the concrete problem;
- considered alternatives;
- the chosen approach;
- consequences and risks;
- whether the exception is temporary or permanent.

Local convenience is not sufficient justification for violating a global invariant.

---

## 32. Forbidden Patterns

The following patterns are forbidden unless explicitly approved by an ADR:

- authoritative business logic in controllers;
- authoritative business logic in React components;
- client-authoritative permissions or state transitions;
- cross-module database writes;
- importing another module's internal implementation;
- Prisma types leaking into domain or public API contracts;
- repositories performing hidden external side effects;
- remote network I/O inside database transactions;
- floating-point authoritative money calculations;
- swallowed errors;
- secrets in source code, client bundles, or logs;
- duplicated handwritten API contract types when approved generated contracts exist;
- shared/common packages containing disguised domain ownership;
- database triggers containing hidden business workflows without an ADR;
- abstractions introduced only to satisfy a pattern rather than solve a real problem;
- bypassing canonical module APIs for speed or convenience.

---

## 33. Enforcement

Documentation defines policy; automation SHOULD enforce policy wherever practical.

The repository SHOULD progressively enforce rules using:

- TypeScript compiler configuration;
- ESLint/static architecture rules;
- import-boundary checks;
- formatting checks;
- schema/migration checks;
- automated tests;
- CI quality gates.

A rule repeatedly violated by contributors or agents SHOULD be converted into an automated check where feasible.

---

## 34. Reading Order for Coding Agents

Before making a non-trivial change, an agent SHOULD read only the minimum canonical context required:

1. `docs/PRODUCT.md` — when product intent/scope matters;
2. `docs/ARCHITECTURE.md` — when system-level design matters;
3. `docs/MODULES.md` — to identify ownership and cross-module boundaries;
4. `docs/ENGINEERING.md` — implementation rules;
5. the relevant `docs/modules/<module>.md` — domain-specific behavior;
6. `docs/SECURITY.md` / `docs/TESTING.md` — when the change touches those concerns;
7. `docs/DESIGN_SYSTEM.md` — when the change touches UI;
8. `docs/PLANNING.md` — before creating or executing any module plan;
9. relevant ADRs only when the current rule or implementation references them.

Do not load unrelated documentation by default.

---

## 35. Final Rule

Prefer the simplest implementation that:

- preserves domain correctness;
- respects ownership and dependency boundaries;
- is secure by default;
- is testable and observable;
- remains understandable to the next engineer or coding agent.

Do not trade long-term system integrity for short-term implementation convenience.
