# TESTING.md

> Canonical verification policy for Vertex OS.
>
> This document defines what production behavior MUST be verified,
> which test layer SHOULD prove it, how test data and isolation are handled,
> and which verification gates are required before change completion.
>
> Product scope belongs in `docs/PRODUCT.md`.
> System structure belongs in `docs/ARCHITECTURE.md`.
> Module ownership belongs in `docs/MODULES.md`.
> Engineering rules belong in `docs/ENGINEERING.md`.
> Security policy belongs in `docs/SECURITY.md`.
> Domain-specific scenarios belong in `docs/modules/*.md`.

---

## 1. Purpose

Tests exist to prove:

- business invariants;
- externally meaningful behavior;
- authorization boundaries;
- API contracts;
- persistence correctness;
- integration behavior;
- critical user journeys;
- regression safety;
- architectural boundaries.

Tests MUST optimize for confidence, clarity, determinism, and useful failure diagnosis.

This document does not teach Vitest, Playwright, Prisma, Testing Library, Fastify injection, or Supertest APIs.

---

## 2. Normative Language

Normative terms follow `docs/ENGINEERING.md`.

- **MUST / MUST NOT** — mandatory.
- **SHOULD / SHOULD NOT** — strong default.
- **MAY** — optional when appropriate.

Testing exceptions MUST be explicit and justified by risk.

---

## 3. Core Testing Principles

1. Test behavior, not implementation details.
2. Use the lowest-cost test layer that can prove the behavior with sufficient confidence.
3. Business invariants MUST have direct tests.
4. Database behavior MUST be tested against real PostgreSQL.
5. Authorization-sensitive behavior MUST include meaningful denied cases.
6. Browser E2E MUST focus on critical journeys, not exhaustive branch coverage.
7. Tests MUST be isolated and deterministic.
8. Flaky tests are defects.
9. Coverage is a diagnostic signal, not the objective.
10. Important production bugs MUST receive regression tests.
11. Static tooling SHOULD prove what runtime tests do not need to prove.
12. Architecture and security rules SHOULD be executable where practical.

---

## 4. Risk-Based Testing

Test depth MUST reflect risk.

Risk increases with:

- business impact;
- financial impact;
- security impact;
- data sensitivity;
- state complexity;
- concurrency;
- external integrations;
- failure cost;
- number of affected modules.

Low-risk presentation changes MAY require only focused frontend tests.

High-risk financial, authorization, identity, or state-transition changes require deeper verification across relevant layers.

No fixed unit/integration/E2E percentage is required.

---

## 5. Test Selection Rule

Use the cheapest layer that can reliably prove the behavior.

| Change | Default verification |
|---|---|
| Pure business rule | Unit / Domain |
| State transition | Unit / Domain |
| Application orchestration | Application |
| Repository / Prisma behavior | Integration |
| Database constraint / transaction | Integration |
| HTTP contract | API Integration |
| Authorization decision | Policy + API |
| React interaction | Frontend feature test |
| Critical user journey | Browser E2E |
| Module boundary | Architecture check |
| Production bug | Regression at lowest useful layer |

Tests SHOULD NOT duplicate the same scenario across multiple layers unless each layer proves a materially different risk.

---

## 6. Verification Layers

Vertex OS uses these verification layers:

```text
0. Static Verification
1. Unit / Domain
2. Application
3. Persistence Integration
4. API Integration
5. Frontend Feature
6. Browser E2E
7. Architecture / Security Verification
```

The stack SHOULD remain small and coherent.

Preferred tooling:

| Layer | Tooling |
|---|---|
| Static | TypeScript + ESLint |
| Unit / Application | Vitest |
| Frontend | Vitest + React Testing Library |
| Persistence | Vitest + Testcontainers + PostgreSQL |
| API | Nest testing utilities + Fastify `inject` (real listening server + Supertest only where the HTTP boundary matters) + PostgreSQL |
| Browser E2E | Playwright |
| Coverage | Vitest V8 coverage |
| Architecture | ESLint / dependency rules / focused custom checks |

Additional tools require a concrete testing need.

---

## 7. Static Verification

Static verification MUST run before expensive runtime suites where practical.

It SHOULD include:

- formatting/checking;
- linting;
- TypeScript type checking;
- build validation;
- Prisma schema validation;
- migration validation;
- architecture boundary checks.

Do not write runtime tests for guarantees already enforced reliably by the compiler or static tooling.

Static verification is part of the test gate even when it is not a runtime test.

---

## 8. Unit and Domain Tests

Unit tests SHOULD cover behavior that can be proven without real infrastructure.

Primary targets:

- domain invariants;
- state transitions;
- value objects;
- pure calculations;
- policies;
- deterministic transformations;
- domain authorization decisions;
- boundary conditions.

A domain rule SHOULD normally include:

- at least one valid path;
- meaningful invalid or boundary paths.

Unit tests MUST NOT be added merely because a class or method exists.

---

## 9. What Not to Unit Test

Do not create tests whose only purpose is to prove trivial implementation.

Examples that normally do not require standalone tests:

- constructors assigning fields;
- trivial getters/setters;
- DTO property declarations;
- generated code;
- framework behavior already guaranteed by the framework;
- simple pass-through wrappers with no meaningful behavior.

Do not test third-party libraries themselves.

Test how Vertex OS configures or uses them when that behavior matters.

---

## 10. Application Tests

Application tests prove orchestration.

Typical targets:

- use-case sequencing;
- authorization coordination;
- repository interaction at the port level;
- domain invocation;
- event-publication intent;
- error propagation;
- rollback behavior at the application abstraction level.

Application tests MAY use fakes, stubs, or mocks for external ports.

Application tests SHOULD remain fast.

They MUST NOT be used as evidence that real persistence or transaction behavior works.

---

## 11. Test Doubles

Use the simplest test double that preserves test clarity.

Prefer:

- in-memory fakes for stable repository-like ports;
- small stubs for deterministic external responses;
- mocks when interaction itself is part of the contract.

Avoid deep mocks of framework or ORM internals.

Prisma mocks MAY support isolated application tests, but MUST NOT prove:

- SQL correctness;
- constraints;
- transactions;
- locking;
- concurrency;
- query mapping;
- database-specific behavior.

---

## 12. Persistence Integration Tests

Persistence behavior MUST be tested against the same database engine used in production:

> **PostgreSQL.**

SQLite or an in-memory substitute MUST NOT be treated as equivalent evidence for PostgreSQL behavior.

Persistence integration tests SHOULD use isolated real PostgreSQL environments, preferably via Testcontainers or an equivalent reproducible mechanism.

---

## 13. Repository Integration Tests

Repository tests SHOULD prove externally meaningful persistence behavior.

Examples:

- save and retrieve mapping;
- unique constraints;
- foreign keys;
- relation behavior;
- pagination;
- filters;
- sorting;
- Decimal precision;
- date/time semantics;
- transactional behavior;
- optimistic concurrency;
- idempotency support;
- approved soft-delete behavior.

Tests SHOULD NOT assert that repository method A called Prisma method B unless that interaction is itself a required contract.

---

## 14. Migration Verification

The migration history MUST be executable from a clean database state.

CI SHOULD prove:

```text
empty PostgreSQL
       ↓
apply all migrations
       ↓
schema valid
       ↓
relevant integration tests
```

Clean-database verification is necessary but not sufficient for migrations that transform existing data.

A migration involving meaningful existing-data transformation MUST additionally be verified on an upgrade path:

```text
previous supported schema
+ representative existing data
       ↓
apply the new migration
       ↓
verify transformed data
       ↓
verify constraints and invariants
```

This applies in particular to:

- destructive changes;
- backfills;
- column splits or merges;
- constraint tightening over existing rows;
- data-format transformations.

Upgrade-path verification is risk-based: trivial additive migrations do not require an upgrade fixture.

Upgrade fixtures MUST use synthetic data and SHOULD stay small while covering the shapes the migration must handle, including nulls, duplicates, and boundary values where relevant.

A schema change is incomplete until its migration behavior is verified.

Migration tests MUST use the production database engine.

---

## 15. Transactions

Multi-write operations with atomicity requirements MUST have failure-path integration tests.

Tests SHOULD prove:

```text
all required writes commit
OR
none commit
```

Transaction tests SHOULD include important failure points.

Network I/O MUST NOT be introduced into database transactions merely to simplify testing.

---

## 16. Concurrency

Concurrency-sensitive behavior MUST be tested at an integration layer.

Examples:

- optimistic concurrency;
- unique allocation;
- duplicate submission;
- idempotency;
- locking;
- competing updates;
- sequence allocation.

Mocks MUST NOT be treated as proof of concurrency correctness.

Where the contract guarantees behavior under concurrent requests, tests SHOULD actually execute competing operations.

---

## 17. Idempotency

Any operation that declares idempotent behavior MUST test relevant cases.

Depending on the contract:

- first request;
- repeated request;
- concurrent duplicate requests;
- failure followed by retry;
- same key with incompatible payload.

The test MUST assert the externally promised result, not the internal implementation.

---

## 18. API Integration Tests

API tests SHOULD run against a real Nest application with production-like middleware and infrastructure relevant to the behavior.

Where applicable they SHOULD include:

- real modules;
- real validation;
- real guards;
- real exception mapping;
- real Prisma;
- real PostgreSQL.

API tests MUST focus on HTTP contracts and cross-layer integration.

The backend runs NestJS on the Fastify adapter; API tests MUST target the Fastify adapter, not a default Express application.

Default mechanism: create the Nest application with the Fastify adapter, initialize it fully (including the Fastify instance's ready state), and send requests through Fastify's `inject` mechanism. This exercises routing, validation, guards, and exception mapping without opening a network port.

A real listening HTTP server with Supertest or an HTTP client SHOULD be used only when the behavior under test depends on the real HTTP boundary, such as cookie handling across redirects, streaming or multipart behavior, keep-alive, or headers applied by the real server.

Do not default to a listening server for ordinary contract tests.

---

## 19. API Test Coverage

For protected APIs, relevant tests SHOULD cover:

- valid request;
- invalid request;
- unauthenticated request;
- authenticated but unauthorized request;
- wrong resource scope;
- conflict/duplicate behavior;
- stable response shape;
- stable error code;
- required audit/event side effects.

Do not repeat every domain-state combination through HTTP when lower-level domain tests already prove those combinations.

---

## 20. API Error Contracts

API tests SHOULD assert:

- HTTP status;
- stable machine-readable error code;
- standard problem/error shape.

Tests SHOULD NOT depend on exact human-readable wording unless wording is intentionally part of the contract.

Error-message text MAY change due to localization or copy improvement without breaking core contract tests.

---

## 21. API Contract Drift

When the API contract changes:

- OpenAPI output MUST remain current;
- generated API clients/types MUST be regenerated where applicable;
- CI SHOULD detect stale generated contracts;
- frontend handwritten duplicates SHOULD NOT become alternate sources of truth.

Separate consumer-driven contract tooling is not required while backend and frontend remain in the same monorepo and share generated contracts.

It MAY be introduced later for independent consumers.

---

## 22. Frontend Testing

Frontend tests MUST prefer user-visible behavior.

Primary targets:

- form behavior;
- validation feedback;
- loading states;
- error states;
- permission-aware presentation;
- navigation;
- optimistic updates;
- rollback behavior;
- accessibility behavior;
- rendering of API results.

Frontend tests SHOULD use semantic, user-facing queries.

They SHOULD NOT inspect React internals, hook implementation details, or component private state.

---

## 23. Frontend Feature Tests

Feature-level tests are generally more valuable than isolated tests for trivial primitives.

Examples worth testing:

- project edit form;
- proposal approval interaction;
- invoice creation flow;
- authenticated navigation;
- permission-aware action controls;
- server conflict handling.

Simple presentational components MAY require no dedicated unit test unless they contain meaningful behavior.

---

## 24. Design-System Verification

Vertex UI/design-system primitives SHOULD be tested when they implement meaningful interaction.

Focus on:

- keyboard behavior;
- focus management;
- disabled semantics;
- ARIA behavior;
- modal/dialog behavior;
- menu/listbox interaction;
- form-control semantics.

Tests SHOULD NOT assert visual spacing or styling values that are better verified through design review or visual regression.

Visual regression MAY be introduced for high-value components when justified.

---

## 25. Accessibility Testing

Relevant frontend and E2E tests SHOULD verify:

- accessible names;
- labels;
- roles;
- keyboard interaction;
- focus behavior;
- disabled state;
- dialog/menu semantics.

Semantic queries SHOULD be preferred because they improve both test resilience and accessibility quality.

Automated accessibility checks MAY complement, but MUST NOT replace, deliberate interaction testing for critical components.

---

## 26. Browser E2E

Browser E2E uses Playwright.

E2E exists to prove that critical user journeys work across:

```text
Browser
   ↓
Frontend
   ↓
HTTP/API
   ↓
Backend
   ↓
Database
```

E2E MUST NOT attempt exhaustive branch coverage.

Use lower layers for detailed business-rule coverage.

---

## 27. Critical E2E Journeys

Examples of journeys appropriate for E2E as modules are implemented:

- login;
- logout;
- session revocation/expiry behavior;
- create client;
- create and progress proposal;
- create project from approved commercial work;
- critical task workflow;
- protected file upload/download;
- invoice/payment workflow;
- key authorization denials.

The E2E suite SHOULD remain intentionally small and high-value.

---

## 28. E2E Locators

Playwright tests SHOULD use user-facing locators.

Preferred examples:

- role;
- accessible name;
- label;
- meaningful text;
- stable test ID only when semantic locators are insufficient.

Tests SHOULD NOT depend on fragile CSS selectors or DOM implementation structure.

---

## 29. E2E Isolation

Every browser test MUST be independent.

A test MUST NOT depend on another test having run first.

Each test or worker SHOULD own the mutable data it needs.

Forbidden pattern:

```text
Test A creates resource
Test B assumes resource exists
Test C deletes resource
```

Execution order MUST NOT be required for correctness.

---

## 30. Authenticated E2E State

Reusable authenticated browser state MAY be used to improve test speed.

Authentication-state files MUST:

- be excluded from source control;
- be treated as sensitive;
- avoid containing production credentials;
- be recreated as needed.

Parallel workers SHOULD use isolated accounts/data when tests modify shared server-side state.

---

## 31. E2E Retries and Diagnostics

Retries MUST NOT be used to hide flaky tests.

Unit and integration suites SHOULD run with zero retries.

A small number of browser retries MAY be used in CI for diagnostics.

A test that only passes after retry MUST be treated as flaky and investigated.

On browser failure, CI SHOULD retain useful diagnostic artifacts such as:

- Playwright trace;
- failure screenshot where useful;
- relevant application logs;
- test report.

Test artifacts MUST be treated as potentially sensitive.

---

## 32. No Arbitrary Sleeps

Tests MUST NOT rely on arbitrary delays such as:

```ts
await sleep(3000);
```

Tests SHOULD wait for observable conditions:

- locator state;
- response;
- event;
- database effect;
- explicit async completion.

Playwright auto-waiting and assertions SHOULD be used instead of time-based guessing.

---

## 33. Architecture Tests

Architectural invariants from `ENGINEERING.md` SHOULD be executable.

Examples:

```text
domain/*
MUST NOT import Prisma

domain/*
MUST NOT import NestJS framework APIs

module A
MUST NOT import module B internals

cross-module imports
MUST use approved public boundaries

frontend
MUST NOT import backend internals
```

Architecture enforcement MAY use:

- ESLint rules;
- dependency checks;
- custom tests.

Review alone SHOULD NOT be the only enforcement when automation is practical.

---

## 34. Security Verification

Testing MUST verify relevant controls from `docs/SECURITY.md`.

Security-sensitive behavior requires explicit positive and negative tests.

At minimum, review:

- authentication at the application-session boundary;
- application session lifecycle;
- authorization;
- resource scope;
- account disablement;
- role/permission changes;
- sensitive actions;
- identity-provider configuration for password, MFA, and recovery policy;
- file access;
- exports;
- CSRF behavior where applicable.

Security policy is defined in `docs/SECURITY.md`; this document defines how correctness is verified.

### Authentication and application-session verification

Authentication follows the Keycloak + backend application-session (BFF) architecture (`docs/ARCHITECTURE.md`, Section 22). Tests prove Vertex OS behavior at that boundary rather than re-testing Keycloak:

- an unauthenticated request is denied with the stable error contract and no session is created;
- an invalid, expired, or revoked application session is denied and is not silently re-accepted;
- application logout invalidates the session server-side; the old session identifier no longer works;
- a successful identity-provider authentication is mapped to exactly the correct Vertex application user;
- a disabled or unmapped Vertex application user is denied even though identity-provider authentication succeeded;
- state-changing cookie-authenticated requests without the required CSRF proof are rejected, and the OIDC callback rejects a mismatched `state`;
- identity-provider tokens never appear in response bodies, headers, or browser-readable cookies;
- RBAC and resource-level authorization are enforced independently of authentication: an authenticated user without the required permission or scope is denied.

Identity-provider behavior (password policy, MFA, recovery, brute-force protection) is verified as configuration against `docs/SECURITY.md`, not reimplemented in Vertex tests.

### Identity provider in tests

API and application tests MAY establish an application session directly through the backend's own session-establishment capability for a synthetic user, provided the identity-to-application-user mapping path is the production one.

Browser E2E authentication journeys (login, logout, session expiry) SHOULD run against a local Keycloak instance, for example via Testcontainers, with a reproducible test realm, so the real OIDC redirect and callback path is exercised.

Authentication MUST NOT be bypassed or stubbed out of the build under test, and test-only authentication hooks MUST NOT exist in production code paths.

---

## 35. Authorization Testing

Every meaningful authorization-sensitive operation SHOULD have:

1. an allowed actor;
2. an unauthenticated denial;
3. a missing-permission denial where relevant;
4. a wrong-resource-scope denial where relevant.

Example:

```text
projects.projects.read + Department A
MUST NOT imply
access to protected Department B projects
```

Authorization regression tests are high priority.

---

## 36. Events and Async Work

Event-producing behavior SHOULD prove:

- event occurs when the business fact actually occurred;
- event does not occur after failed behavior;
- event contract contains required fields.

Tests SHOULD NOT depend on the internal function used to publish an event.

When a durable-delivery mechanism (for example outbox/worker processing) exists, integration tests SHOULD cover:

- atomic write + durable-delivery record behavior;
- claiming;
- retries;
- failure handling;
- idempotent processing.

Do not build async test infrastructure before the corresponding production mechanism exists.

---

## 37. External Services

Ordinary unit, application, integration, and E2E suites SHOULD NOT depend on public internet services.

External services SHOULD be replaced by:

- local fakes;
- local stubs;
- sandbox emulators where appropriate.

Examples:

- email;
- remote APIs;
- payment providers;
- social integrations.

Dedicated sandbox/integration smoke tests MAY exist separately when a real external integration requires them.

Accidental internet access SHOULD be minimized.

---

## 38. Time and Determinism

Tests MUST be deterministic.

Domain/application behavior depending on time SHOULD use a controllable clock boundary.

Tests SHOULD NOT depend directly on wall-clock time when fixed time can be injected.

Relevant cases MAY include:

- expiry;
- due dates;
- session timeouts;
- date-only semantics;
- timezone boundaries;
- DST behavior where applicable.

---

## 39. Randomness and IDs

Randomness that affects behavior SHOULD be injectable or controllable in tests.

Examples:

- UUID generation;
- recovery tokens;
- idempotency keys;
- random references.

Tests SHOULD assert semantics rather than unpredictable literal values unless randomness itself is the subject under test.

---

## 40. Money and Numeric Behavior

Financial logic MUST include tests for:

- decimal precision;
- rounding;
- currency handling;
- zero/negative boundaries where allowed;
- totals;
- discount/tax interactions where applicable.

Financial correctness MUST NOT rely on floating-point assumptions.

High-risk money rules SHOULD receive both domain and persistence/API coverage where each layer proves distinct risk.

---

## 41. Date and Time Behavior

Tests SHOULD distinguish:

- instant/timestamp;
- date-only business value;
- local business time;
- timezone-aware scheduling.

Critical date behavior SHOULD include boundary cases.

Do not create midnight timestamps merely to test date-only concepts.

---

## 42. Test Data

Tests SHOULD create only the data required for the scenario.

Large shared global seeds SHOULD NOT be the default for test suites.

Scenario-specific data reduces:

- hidden coupling;
- setup cost;
- state leakage;
- debugging complexity.

Shared baseline reference data MAY be used when genuinely stable and required by many tests.

---

## 43. Factories and Builders

Tests SHOULD use small factories/builders for repetitive valid setup.

Examples:

```text
userFactory()
projectFactory()
invoiceFactory()
```

Defaults SHOULD cover irrelevant data.

Values central to the behavior under test MUST remain explicit.

Avoid factories that hide important authorization, ownership, financial, or state assumptions.

---

## 44. Database Isolation

Tests MUST NOT unintentionally share mutable database state.

Acceptable strategies MAY include:

- cleanup/truncate;
- transaction rollback;
- schema per worker;
- database per worker;
- isolated container environments.

The implementation MAY evolve for performance.

Correct isolation comes before aggressive parallelism.

---

## 45. Parallelism

Tests SHOULD be designed to run independently.

Parallel execution MAY be increased after isolation is correct.

Parallelism MUST NOT introduce:

- shared-account races;
- shared-resource collisions;
- order dependence;
- intermittent failures.

Performance optimization MUST NOT reduce correctness.

---

## 46. Test Naming

Test names MUST describe observable behavior.

Good:

```text
rejects activation when project has no owner
```

Good:

```text
returns 403 when permission does not cover the project scope
```

Bad:

```text
activate project test 3
```

Names SHOULD make failures useful without reading the entire implementation.

---

## 47. Test Structure

Tests SHOULD use a clear mental structure:

```text
Given / Arrange
When / Act
Then / Assert
```

Comments are unnecessary when the test is already clear.

One test SHOULD normally describe one behavior.

A behavior MAY require multiple assertions.

"One assertion per test" is not a project rule.

---

## 48. Assertions

Assertions MUST focus on meaningful outcomes.

Prefer:

- resulting state;
- returned value;
- persisted behavior;
- emitted contract;
- authorization result;
- stable error code.

Mock call-count assertions SHOULD be used only when the interaction itself is a required behavior.

Avoid asserting implementation sequence without a contract reason.

---

## 49. Snapshots

Snapshots SHOULD be rare.

They MAY be useful for:

- large stable structured output;
- intentionally reviewed generated structures.

Snapshots SHOULD NOT replace targeted behavioral assertions.

Large or frequently changing snapshots SHOULD be avoided.

A reviewer MUST be able to understand what a snapshot change means.

---

## 50. Coverage

Coverage is a diagnostic signal.

Coverage MUST NOT be treated as the primary quality metric.

The project MUST NOT pursue arbitrary 100% coverage.

Coverage SHOULD help identify:

- untested critical paths;
- unexpectedly untested modules;
- regression in verification depth.

A global threshold MAY be introduced as a guardrail once the suite matures.

Coverage targets MUST NOT incentivize low-value tests.

---

## 51. Mutation Testing

Mutation testing is optional.

It MAY be introduced for especially sensitive logic such as:

- financial calculations;
- permission policies;
- pricing;
- complex state machines.

It MUST NOT be required globally unless its cost is justified by measurable value.

---

## 52. Performance Testing

Performance tests are required only when a defined performance risk or budget exists.

Likely candidates include:

- large dashboards;
- bulk import/export;
- large reports;
- automation workers;
- high-volume query paths.

Performance testing MUST be based on explicit expected behavior, not arbitrary benchmarks.

---

## 53. Visual Regression

Visual regression MAY be used for:

- stable design-system primitives;
- high-value layouts;
- regressions difficult to detect behaviorally.

It is not required for every page.

Visual regression MUST NOT replace semantic or interaction testing.

---

## 54. RTL and Localization Verification

Where relevant, tests SHOULD cover:

- Arabic/RTL layout behavior;
- accessible labels;
- bidirectional content;
- number/date presentation;
- text overflow;
- layout behavior that differs by direction.

Do not create snapshots of every page solely because RTL exists.

Test the behavior that can break.

---

## 55. Regression Policy

Every important production bug SHOULD produce a regression test.

The regression test MUST be placed at the lowest layer that reliably reproduces the defect.

Preferred workflow:

```text
reproduce failing behavior
        ↓
add failing regression test
        ↓
implement fix
        ↓
test passes
```

Do not add a browser E2E when a small deterministic domain or API regression test is sufficient.

---

## 56. Flaky Tests

A flaky test is a defect.

Flaky tests MUST NOT be normalized through repeated reruns.

A flaky test SHOULD be:

- fixed promptly;
- temporarily quarantined only when necessary;
- linked to a clear issue/reason;
- restored as soon as the cause is resolved.

Retries are diagnostic tools, not correctness mechanisms.

---

## 57. Skipped and Focused Tests

Committed focused tests such as `.only` are forbidden.

Skipped tests MUST NOT become permanent hidden failures.

Any intentional skip SHOULD include:

- reason;
- tracking reference where practical;
- expectation of removal.

Critical security or financial behavior MUST NOT be silently skipped.

---

## 58. Test-Code Quality

Test code is production-supporting code and MUST remain maintainable.

Prefer:

- clear setup;
- meaningful names;
- focused helpers;
- explicit behavior;
- minimal abstraction;
- minimal shared mutable state.

Avoid:

- opaque test frameworks built inside the repository;
- excessive helper indirection;
- clever generic abstractions;
- deep mock trees.

A small amount of duplication is acceptable when it improves test readability.

---

## 59. Test Helpers

Good helpers represent obvious testing concepts.

Examples:

```text
loginAs(role)
createProjectFixture()
expectProblem(code)
```

Avoid helpers whose names hide large or surprising setup.

If understanding a test requires opening many helper files, the abstraction is probably too deep.

---

## 60. CI Verification Strategy

CI SHOULD fail fast.

Recommended order:

```text
format/check
    ↓
lint
    ↓
typecheck
    ↓
architecture/static checks
    ↓
unit/application
    ↓
build
    ↓
integration/API
    ↓
critical E2E
```

Exact job parallelization MAY evolve.

Fast feedback is a project feature.

---

## 61. Pull-Request Gate

Every pull request SHOULD run, at minimum:

- format/check;
- lint;
- typecheck;
- relevant unit/application tests;
- architecture checks;
- build.

Relevant integration/API tests SHOULD run on every PR unless runtime cost becomes materially problematic.

Critical security tests SHOULD NOT be deferred casually.

---

## 62. Full Verification Gate

Before merge to protected production branches or before release, the full required suite SHOULD include:

- static verification;
- unit/application tests;
- persistence integration;
- migration verification;
- API integration;
- security-relevant tests;
- critical Playwright E2E.

The project MAY optimize execution strategy without weakening required confidence.

---

## 63. Test Artifacts

Failed high-level tests SHOULD provide enough evidence for diagnosis.

Useful artifacts MAY include:

- Playwright trace;
- screenshot;
- HTML report;
- application logs;
- relevant container logs.

Artifacts MAY contain confidential test data, cookies, or tokens.

Retention and access MUST respect security requirements.

Production secrets MUST never be used in test artifacts.

---

## 64. Test Environments

Development, test, and production environments MUST remain separate.

Automated tests MUST NOT use production databases.

Automated tests MUST NOT rely on production credentials.

Test environments SHOULD be reproducible.

Integration tests SHOULD create or obtain their required infrastructure automatically where practical.

---

## 65. Security of Test Data

Real customer or production-confidential data SHOULD NOT be copied into automated test fixtures.

Test data SHOULD be synthetic.

If production-derived data is ever required for diagnosis, it MUST be sanitized and handled under an explicit security process.

Secrets in test fixtures MUST be fake.

---

## 66. Definition of Done

A behavior-changing implementation is not complete until applicable verification is complete.

Before considering a change done:

- relevant tests are added or updated;
- required suites pass;
- authorization deny paths are tested where relevant;
- migrations are verified when persistence changes;
- API contracts are updated when changed;
- regression tests exist for fixed important bugs;
- no focused test remains;
- intentional skips are justified;
- architecture/security gates remain valid.

Passing compilation alone is never sufficient evidence of behavioral correctness.

---

## 67. Forbidden Testing Patterns

The following are forbidden or strongly discouraged unless justified:

- testing implementation details instead of behavior;
- using mocks as proof of PostgreSQL behavior;
- substituting SQLite as evidence for PostgreSQL semantics;
- global mutable test state;
- order-dependent tests;
- arbitrary sleeps;
- production credentials in tests;
- production data in ordinary fixtures;
- committed `.only`;
- permanent unexplained skips;
- retry-until-green workflows;
- browser E2E for every branch;
- snapshot testing everything;
- asserting framework/library behavior that Vertex OS does not own;
- chasing coverage percentage with low-value tests;
- deep mocking of Prisma/framework internals;
- shared E2E resources that create worker races.

---

## 68. Agent Decision Guide

When implementing a change, coding agents SHOULD ask:

1. What behavior changed?
2. What risk does failure create?
3. What is the lowest layer that can prove it?
4. Does persistence behavior require real PostgreSQL?
5. Is authorization involved?
6. Is a critical browser journey affected?
7. Does an architecture/security invariant need enforcement?
8. Is this fixing a regression?
9. Can static tooling prove part of the behavior instead?
10. Am I duplicating an existing scenario at a more expensive layer?

Agents SHOULD add only the tests justified by these answers.

---

## 69. Agent Reading Order

For ordinary implementation work:

1. `docs/ENGINEERING.md`
2. `docs/MODULES.md`
3. `docs/TESTING.md`
4. affected `docs/modules/<module>.md`

For security-sensitive work:

1. `docs/ENGINEERING.md`
2. `docs/SECURITY.md`
3. `docs/TESTING.md`
4. `docs/MODULES.md`
5. affected module spec

Unrelated module documentation SHOULD NOT be loaded by default.

---

## 70. External References

Vertex OS testing policy is informed by:

- NestJS official testing guidance, including its Fastify adapter notes;
- Fastify official testing guidance (`inject`);
- Vitest official testing and coverage guidance;
- Prisma integration-testing guidance;
- Testcontainers for Node.js;
- Playwright testing best practices;
- Testing Library guiding principles;
- OWASP Web Security Testing Guide;
- OWASP authorization-testing guidance.

External documentation explains tools.

This document remains the canonical Vertex OS verification policy.
