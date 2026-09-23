# Vertex OS — IAM-02 Reference Data & Minimal Audit Foundation Plan

**Repository path:** `docs/plans/iam/IAM_02_REFERENCE_DATA_AND_AUDIT_FOUNDATION_PLAN.md`  
**Master Plan item:** `IAM-MP-02` — Permission/System-Role Reference Data & Minimal Audit Foundation  
**Status:** READY — written 2026-09-23 from the accepted IAM-01 baseline and accepted by the owner the same day (Section 12.1); not yet implemented  
**Plan type:** Living execution plan  
**Prepared:** 2026-09-23  
**Planning baseline:** `main` at `21f536ce4b2b71d78e28d0a804ec4a7d7b780462`, clean working tree, CI run 35811565312 green  
**Parent specification:** `docs/modules/iam.md` (Accepted V1 Implementation Specification), chiefly Sections 9.4–9.6, 18–21, 28–30, 34–36, 48–50 and 53  
**Parent Master Plan:** `docs/plans/iam/IAM_MASTER_PLAN.md`, stage IAM-MP-02  
**Planning authority:** `docs/PLANNING.md`  
**Decision authority:** The planning agent wrote this plan and its decisions at the owner's request on 2026-09-23. The owner accepted the plan on 2026-09-23 and delegated every flagged decision to the planning agent, which ruled on them in Section 12.1. Decisions D-01…D-17 (Section 11) and interpretations I-1…I-8 (Section 12) are therefore locked. D-03 and D-04 are architecture-significant (first per-domain persistence scoping, first cross-module atomic transaction). An executing agent does not reopen a locked decision except through a stop condition (Section 38).  
**Execution target:** One Claude Code conversation operating from the repository root  
**Required follow-up:** Independent audit (Section 46), owner baseline acceptance, then the IAM-MP-03 executable plan

> IAM-02 gives IAM its deterministic security reference data (the code-defined permission catalog and the protected `system-administrator` role) and gives the platform the smallest correctly owned MOD-AUDIT capability: an immutable, validated append that participates atomically in the caller's transaction. The reference synchronization is the Audit capability's first real consumer, so every catalog or system-role change is itself durable accountability evidence. The stage also closes the two security items the IAM-01 audit carried forward (A1-01 dynamic-import bypass, A1-02 personal data in logs) because it is the first stage to compose IAM and Audit persistence into `apps/api`. It is deliberately **not** Keycloak, sessions, authentication, authorization context, administration, HTTP endpoints or UI work, and it builds no Audit search, reporting or UI.

---

## 1. Purpose / Big Picture

After IAM-01 the IAM tables exist, but they are empty and nothing may write privileged state. Before any later stage exposes a privileged mutation, two foundations must exist (Master Plan IAM-MP-02):

1. **Security reference data that code, not data, defines.** Permissions are code-defined and synchronized into persistence from reviewed manifests (spec Sections 9.5 and 18). The protected `system-administrator` role exists by deterministic repository logic and always holds exactly every active permission (spec Section 20). Synchronization is idempotent and never runs implicitly (spec Section 48).
2. **Durable accountability owned by MOD-AUDIT.** IAM must not become complete while privileged mutations have no durable accountability record, and it must not build a competing audit subsystem (spec Section 34). If a required audit write fails, the privileged mutation must fail (spec Section 50).

IAM-02 delivers:

1. a new MOD-AUDIT domain core (`@vertex-os/audit`) and adapter (`@vertex-os/audit-persistence`) with one append-only table;
2. the first cross-module atomic write mechanism, decided concretely as ARCHITECTURE AR-022 and ENGINEERING Section 15 anticipate;
3. per-domain scoping of the shared Prisma client, resolving IAM-01 risk R-06 now that a second domain adapter exists;
4. the IAM permission catalog, the system-role definition and a pure synchronization planner in the IAM core;
5. the IAM adapter operations and transaction runner that apply a plan and its audit evidence in one serialized transaction;
6. one additive IAM constraint that makes the system role unforgeable at the database level;
7. an explicit operator command, `pnpm iam:sync-reference`;
8. safe logging of database errors (A1-02) and closure of the dynamic-import bypass (A1-01);
9. real-PostgreSQL evidence for all of the above.

---

## 2. Position in the IAM Program

```text
IAM-MP-00  Architecture & Domain Boundary Foundation            COMPLETE (accepted 2026-09-23)
IAM-MP-01  IAM Persistence Model & First Business Migration      COMPLETE (accepted 2026-09-23)
IAM-MP-02  Permission/System-Role Reference Data & Minimal Audit ← this plan
IAM-MP-03  Keycloak Environment, Realm Contract & Integration Harness
...
```

The specification's phase IAM-1 is split across IAM-MP-01 (model, migration, first repository) and this stage (reference synchronization, minimal Audit). This plan MUST NOT pull IAM-MP-03 or later work forward.

### 2.1 Size check (PLANNING Section 4)

The stage was examined for a split into "Audit foundation" and "reference synchronization". It is kept whole:

- **An Audit capability without a consumer is a speculative abstraction.** The reference synchronization is the only privileged write that exists in this stage, and it is the consumer that proves atomic participation end to end.
- **A synchronization without Audit would itself violate the specification.** Role-permission changes "require durable accountability evidence" (spec Section 9.6).

The surface is comparable to IAM-01, which completed in one conversation: two small projects, one table, two migrations, one pure planner, one adapter extension, one command and two contained security fixes. The milestone order (Section 32) puts boundary and security work first. If the implementing agent nevertheless cannot finish, it stops at a milestone boundary and reports `IAM-02 NOT COMPLETE` (Section 45) rather than claiming partial completion.

Rolling-wave rule: implement this plan, verify it, audit it independently, accept the baseline, and only then write the IAM-MP-03 plan.

---

## 3. Execution Contract

This file is a living execution plan. During execution the implementing agent MUST keep current: `Progress` (Section 43), `Surprises & Discoveries` (Section 42), `Decision Log` (Section 41) and `Outcomes & Retrospective` (Section 44).

The agent MUST:

- execute from the repository root and inspect the live repository before changing it;
- follow repository conventions instead of generic templates;
- record observed evidence, never intended results;
- stop on the conditions in Section 38 instead of improvising around them.

The agent MUST NOT commit, push, merge, change GitHub settings, or touch remote infrastructure unless the user separately authorizes it for the execution conversation.

The agent MUST NOT start, stop, reset or modify any Docker container, volume or compose project other than:

- ephemeral Testcontainers containers started by the test suites;
- throwaway probe containers it names uniquely and removes;
- the repository's own compose project `vertexos`, and only through `pnpm infra:up` / `pnpm infra:down`.

Other containers on the development host belong to unrelated projects.

**Reference convention:** `spec Section N` means `docs/modules/iam.md`. References to other documents name the document. An unqualified `Section N`, `D-NN`, `I-N`, `P-NN`, `M-N`, `V-NN`, `C-N` or `R-NN` refers to this plan. `IAM-01 X` refers to `IAM_01_PERSISTENCE_FOUNDATION_PLAN.md`.

---

## 4. Mandatory Read Order Before Any Modification

1. `AGENTS.md`, `CLAUDE.md`
2. `docs/PLANNING.md`
3. `docs/modules/iam.md`: Sections 6, 9.4–9.7, 16–21, 28–31, 34–36, 44, 46, 48–50, 53, 56, 58
4. `docs/plans/iam/IAM_MASTER_PLAN.md`: Sections 7, 8, 10 (IAM-MP-02, IAM-MP-03), 14, 15
5. `docs/plans/iam/IAM_01_PERSISTENCE_FOUNDATION_PLAN.md`: Sections 11 (D-01…D-12), 13, 16, 22, 33, 34, 36 and 40A (audit findings A1-01…A1-08)
6. `docs/MODULES.md`: MOD-IAM, MOD-AUDIT, Sections 4 (MR-001…MR-015), 11, 12 and 16
7. `docs/ARCHITECTURE.md`: Sections 9–13 (AR-001…AR-023), 26, 33–35, 38–40
8. `docs/ENGINEERING.md`: Sections 4.3, 6–9, 13–17, 21, 25, 26, 30, 32
9. `docs/SECURITY.md`: Sections 15, 16, 26–29
10. `docs/TESTING.md`: Sections 12–17, 33, 34, 36, 38, 39, 42–45, 56, 57
11. this plan
12. root `package.json`, `pnpm-workspace.yaml`, `nx.json`, `tsconfig.base.json`, `tsconfig.json`, `eslint.config.mjs`, `scripts/check-architecture-boundaries.mjs`
13. `packages/database/**`, `domains/iam/**`, `domains/iam-persistence/**` (every tracked file; there are few)
14. `apps/api/package.json`, `apps/api/eslint.config.mjs`, `apps/api/src/{main.ts,app.factory.ts}`, `apps/api/src/config/app-config.ts`, `apps/api/src/http/{problem-details.ts,request-id.ts}`, `apps/api/src/logging/pino-logger.service.ts`, `apps/api/src/app.spec.ts`, `apps/api/src/health/health.integration.spec.ts`
15. `.github/workflows/ci.yml`, `README.md`

---

## 5. Dependencies and Entry Criteria

| Entry criterion (Master Plan IAM-MP-02) | State at planning | Evidence |
|---|---|---|
| IAM-MP-01 COMPLETE; IAM persistence model accepted | Satisfied | Master Plan Section 15; IAM-01 Section 40A (`IAM-01 ACCEPTED`) and owner acceptance 2026-09-23 (`21f536c`) |
| Audit ownership from `docs/MODULES.md` remains unchanged | Satisfied | MOD-AUDIT owns Audit Record, actor attribution, action and target identity, change evidence, metadata; IAM integrates through its public capability (spec Section 34) |
| `main` is green | Satisfied | CI 35811565312 on `21f536c` |

### 5.1 Items carried forward to this stage

| Item | Source | Resolution in this plan |
|---|---|---|
| A1-01 — `no-restricted-imports` covers static imports only; dynamic `import()` and `import('…')` type queries of private subpaths pass lint | IAM-01 Section 40A | D-13, Section 26.2, cases V31–V35 |
| A1-02 — rethrown persistence errors carry row data in `meta.driverAdapterError.cause.detail`, and the API logs unexpected errors unredacted | IAM-01 Section 40A | D-15, Section 25. Required here because this stage is the first to compose IAM and Audit persistence into `apps/api` (the operator command). |
| A1-03 — two-segment `projects.edit` examples in spec Sections 6.4, 16.1, 16.3 and `docs/SECURITY.md` | IAM-01 Section 40A (owner, documentation) | Section 26.4: examples replaced with the three-segment `projects.projects.edit`; no normative text changes |
| A1-05 — `updatedAt` advance assertion depends on elapsed time | IAM-01 Section 40A (optional) | M1: backdate `updated_at` in test setup |
| A1-07 — two of six delete-RESTRICT foreign keys and all `ON UPDATE RESTRICT` actions unasserted; lower module-length bound not isolated | IAM-01 Section 40A (optional) | M1: assert `confdeltype`/`confupdtype` for all six in the catalog test; add the one-character module case |
| R-06 — another domain's adapter could query IAM models through the shared client; decide when a second domain adapter appears (ADR-0008 input) | IAM-01 Sections 13, 33, 34 | D-03 (typed per-domain scoping now); ADR-0008 schema/role separation stays deferred with a new revisit trigger (Section 40) |
| API statement-timeout sizing when IAM persistence is first composed | IAM-01 Section 34 | **Not triggered.** This stage composes persistence only into the operator command, which creates its own `DatabaseClient` (D-16). The HTTP `DatabaseModule` is unchanged. Carried to the first stage that composes IAM into the HTTP request path (Section 40). |
| Primary-membership switch ordering | IAM-01 Section 34 | Not this stage (IAM-MP-08); carried unchanged |
| A-02, A-04 | IAM-00 audit | Not this stage (IAM-MP-03/06); carried unchanged |

---

## 6. Current Repository Baseline

### 6.1 Relevant facts at `21f536c`

- **Projects and tags.**

  | Project | Path | Tags |
  |---|---|---|
  | `@vertex-os/api` | `apps/api` | `type:app`, `scope:backend` |
  | `@vertex-os/web` | `apps/web` | `type:app`, `scope:web` |
  | `@vertex-os/web-e2e` | `apps/web-e2e` | `type:e2e`, `scope:web` |
  | `@vertex-os/database` | `packages/database` | `type:lib`, `scope:backend`, `layer:infrastructure` |
  | `@vertex-os/ui` | `packages/ui` | `type:lib`, `scope:web`, `layer:ui` |
  | `@vertex-os/iam` | `domains/iam` | `type:lib`, `scope:backend`, `layer:domain`, `domain:iam` |
  | `@vertex-os/iam-persistence` | `domains/iam-persistence` | `type:lib`, `scope:backend`, `layer:adapter`, `domain:iam` |

- **Boundary rules** (`eslint.config.mjs`):
  - `layer:domain` → only `layer:domain`/`layer:shared`; bans `@nestjs/*`, `@prisma/*`, `prisma`, `pg`, `fastify`, `@fastify/*`, browser stack, `@keycloak/*`, `keycloak-*`.
  - `layer:adapter` → only `layer:domain`/`layer:infrastructure`/`layer:shared`; bans Prisma, `pg`, NestJS, Fastify, browser stack.
  - `layer:infrastructure` → only `layer:infrastructure`.
  - `domain:iam` → only `domain:iam`/`layer:infrastructure`/`layer:shared`.
  - `restrictedImportPatterns` (exported) rejects `@vertex-os/iam/*`, `@vertex-os/database/*`, `@vertex-os/iam-persistence/*`, `**/domains/iam/src/**`, `**/domains/iam-persistence/src/**`. `domains/iam-persistence/eslint.config.mjs` re-declares it with the negations `!@vertex-os/iam/persistence` and `!@vertex-os/database/persistence`.
  - `no-restricted-syntax` rejects `process.env` in production `**/src/**` (non-spec). `apps/api/eslint.config.mjs` switches the rule **off** for `src/main.ts`.
  - `scripts/check-architecture-boundaries.mjs` (`pnpm lint:boundaries`, inside `pnpm verify`) asserts V1–V19 and controls C1–C2 by linting virtual files.
- **Database package.** Prisma 7.10.0 with `@prisma/adapter-pg`. Schema folder `prisma/schema/{schema,iam}.prisma`. One migration `20260923013708_iam_persistence_foundation` (atomic wrapper). Root export: `createDatabaseClient`, `DatabaseClient` (`ping`, `disconnect`), `DatabaseUnavailableError`. Private entry `@vertex-os/database/persistence`: `persistenceClientOf(database)` returns the **full** Prisma client minus `$connect`/`$disconnect` (so it includes `$transaction`, every model delegate and the unsafe raw methods), plus IAM enums and the `IamApplicationUser` row type. Targets: `prisma-validate`, `prisma-generate`, `prisma-migrate-deploy`, `test:integration`. Root script `db:migrate`.
- **IAM core** (`domains/iam`). Closed state tuples, branded IDs and codes (`ModuleCode`, `PermissionCode` with `parsePermissionCode(value, owningModule)`), text validators (`parseEntityName`, `parseDescription`), `newApplicationUser`, the `ApplicationUserRepository` port. Root `index.ts` exports **nothing**; private entry `@vertex-os/iam/persistence` exports the port and domain types. 51 unit tests.
- **IAM adapter** (`domains/iam-persistence`). `createApplicationUserRepository(database)`: `create` uses `client.$transaction` (interactive); typed outcomes classified by structured constraint names. Test support starts `postgres:18.6-alpine` and applies migrations through the real `prisma migrate deploy`. 73 integration tests (constraints, repository, error shapes) use `$executeRawUnsafe` for SQL-level setup.
- **API.** `createApp` configures the Fastify pino logger with `level` and an optional `stream`, but no `serializers`. `ProblemDetailsFilter` logs non-HTTP exceptions as `{ err: exception }`. `PinoLoggerService` logs `Error` values as `err`. `main.ts` is the only raw-environment bridge (`loadAppConfig(process.env)`). `DatabaseModule` uses a 1 s statement timeout and a 2 s connect timeout.
- **Reference data.** None. `packages/database/src/migrations.integration.spec.ts` asserts that migrations create no IAM rows and that exactly **one** migration row exists (the latter must change in this stage).
- **Audit.** Nothing exists: no package, table, capability or specification (`docs/modules/audit.md` does not exist).
- **Local environment.** Two sibling worktrees exist under `.claude/worktrees/`, so an unqualified root `prettier --check .` fails in the main checkout (IAM-01 A1-08); use `prettier --check . '!.claude/**'` and say so. `docs/` is in `.prettierignore`.

### 6.2 What does not exist yet (and must not be assumed)

- Any Audit code, table, migration or specification.
- Any permission, role, mapping, user or department row in any environment.
- Any IAM or Audit composition in `apps/api`.
- Any shared test-support package.
- Keycloak, sessions, authentication, authorization context, HTTP IAM endpoints.

### 6.3 Planning-time evidence

The probes ran on 2026-09-23 against the repository's own Prisma 7.10.0 CLI and built `@vertex-os/database`, a throwaway `postgres:18.6-alpine` container named `iam02-plan-probe-pg` on loopback port 55432 (migrated with the real `prisma migrate deploy`, removed afterwards), and the repository's ESLint/Nx configuration via the ESLint Node API on virtual files. No repository file was changed. The executing agent re-verifies what it relies on.

| ID | Observation | Consequence |
|---|---|---|
| P-01 | Baseline `21f536c`; tree clean; CI 35811565312 green; one migration; IAM root export empty; no Audit artifacts. | The plan starts from the accepted IAM-01 state. |
| P-02 | An unexpected CHECK violation through the typed API (`iamApplicationUser.create` with an uppercase email) raises `PrismaClientKnownRequestError` **P2039**; through `$executeRaw` it raises **P2010**. In both, `meta.driverAdapterError.cause.detail` is `Failing row contains (…, Secret.Person@Example.com, …)`. The top-level `message` names only the constraint. `pino.stdSerializers.err` copies every enumerable property, so the serialized log **contains the email**. | Confirms A1-02. A serializer must not enumerate error properties (D-15). |
| P-03 | An invalid UUID literal in `findUnique` raises **P2007** whose top-level `message` itself contains the input (`invalid input syntax for type uuid: "not-a-uuid"`). | Removing `meta` is not enough: database-error **messages** must not be logged either. Only an allowlisted description is logged (D-15). |
| P-04 | A duplicate email raises **P2002** with `cause = { originalCode, originalMessage, kind, constraint, table }` and no `detail`. | Structured fields (SQLSTATE, kind, constraint, table) are safe to log. |
| P-05 | Two concurrent interactive transactions that each run `SELECT pg_advisory_xact_lock(4242)` serialize: A acquired at 15 ms and released at 416 ms; B acquired at 421 ms. | A transaction-scoped advisory lock serializes synchronization runs (D-11). |
| P-06 | A transaction client used after its transaction committed raises **P2028** "Transaction already closed". An interactive transaction running longer than 5 000 ms raises **P2028** "expired transaction" (the Prisma default timeout). An error thrown after a write inside `$transaction` leaves zero rows. | Prisma fails closed on reuse; transaction timeouts must be explicit (D-04); rollback is reliable. |
| P-07 | `no-restricted-syntax` selectors `ImportExpression[source.type='Literal'][source.value=/^@vertex-os\/[^/]+\/.+/]`, `ImportExpression > TemplateLiteral.source[quasis.0.value.raw=/^@vertex-os\//]`, `ImportExpression[source.type!='Literal'][source.type!='TemplateLiteral']` and `TSImportType[source.value=/^@vertex-os\/[^/]+\/.+/]` reject literal, template, computed and type-query imports of private subpaths in `apps/api` and `domains/iam-persistence`, and do not flag `import('@vertex-os/iam')` or relative dynamic imports. typescript-eslint 8.70 exposes `TSImportType.source` (`argument` is deprecated). Nx's rule already applies tag constraints to `import()` (a dynamic `@vertex-os/database` import from `domains/iam` is rejected for `layer:domain`). | A1-01 is closable with syntax selectors (D-13). |
| P-08 | The only `import(` expressions in `apps`, `domains`, `packages` and `scripts` are literal parser imports in ESLint configs and `import('node:fs')` in a `packages/ui` lint spec. | The new selectors break no existing file. |
| P-09 | `prisma migrate diff --from-schema <copy of the current schema folder> --to-schema <new folder> --script` works offline and emits only the incremental DDL, with no `CREATE SCHEMA` line. | Deterministic authoring of later migrations without a shadow database (D-06). |
| P-10 | `CHECK (is_system = (code = 'system-administrator'))` rejects an `is_system` role with another code and a `system-administrator` role with `is_system = false`. `(change - 'before' - 'after') = '{}'::jsonb` detects extra JSON keys. | D-10 and the Audit change backstop (Section 16.1). |
| P-11 | Prisma 7.10 accepts `--config <temporary .mjs>` exporting a plain object whose `migrations.path` points at a temporary copy of a migration subset. | An upgrade-path test can deploy "up to migration N" through the real CLI (D-07, TESTING Section 14). |
| P-12 | `pino@10.3.1` is already in `pnpm-lock.yaml` as Fastify's dependency. | A direct `apps/api` dependency on it adds no package (D-16). |

---

## 7. Objective

At the end of IAM-02:

- `pnpm iam:sync-reference` converges any migrated database to the code-defined IAM permission catalog and the protected `system-administrator` role holding exactly every ACTIVE permission; a second run changes nothing;
- every change it makes produces durable, immutable Audit evidence in the same transaction, and a failed audit write leaves no change behind;
- MOD-AUDIT owns its core, adapter, table and migration; IAM reaches Audit only through `@vertex-os/audit`'s public capability, and neither adapter can reach the other's models through the typed client;
- the database forbids a forged or adopted system role;
- database errors never put row data or raw input into logs;
- dynamic imports and type queries cannot bypass the private-entry restrictions;
- no user, department, session, Keycloak artifact, HTTP endpoint or UI exists for IAM.

---

## 8. In Scope

1. Per-domain database entry points `@vertex-os/database/iam` and `@vertex-os/database/audit`, the opaque `DatabaseTransaction` handle and `runInTransaction` (D-03, D-04); removal of `@vertex-os/database/persistence`; migration of IAM-01 code and tests to the new entry.
2. New projects `domains/audit` and `domains/audit-persistence` (D-01) and their boundary rules (D-02).
3. The Audit core: entry contract, attribution contract, validation, `AuditRecorder` port (Section 19).
4. The Audit table, enums and migration (Sections 16.1, 17) and the Audit adapter (Section 20).
5. The IAM permission catalog, system-role definition, manifest validation, synchronization planner and use case (Section 21).
6. The IAM constraint migration `iam_role_system_code_ck` with an upgrade-path test (D-10, Section 17.4).
7. IAM adapter operations and the IAM transaction runner (Section 22).
8. The operator command in `apps/api`, its Nx target and root script (D-16, Section 24).
9. Safe database-error description and the API log serializer (A1-02, D-15, Section 25).
10. The A1-01 selectors, the unsafe-raw-SQL selector and new `lint:boundaries` cases (D-13, D-14).
11. Optional IAM-01 test hardening A1-05 and A1-07.
12. Documentation: README, ENGINEERING Section 15, spec/SECURITY example fix (A1-03), Master Plan, this plan.

---

## 9. Out of Scope

| Excluded here | Belongs to |
|---|---|
| Audit search, listing, retrieval, reporting, retention, export, UI, activity feed | Future MOD-AUDIT work (not IAM) |
| `docs/modules/audit.md` (full MOD-AUDIT specification) | When MOD-AUDIT is specified; this stage records the foundation contract in this plan and code (Section 40) |
| Database-level immutability (triggers, rules, row-level security) and runtime/migration role separation | ADR / production deployment design (D-09) |
| Audit records for refusals of the reference command, security events for sign-in | IAM-MP-05/06 decide security-event recording; bootstrap refusals are IAM-MP-10 |
| Keycloak, identity reconciliation, invitations | IAM-MP-03/04 |
| Sessions, login, CSRF, logout | IAM-MP-05/06 |
| Authorization context, effective-permission computation, `hasPermission`, guards | IAM-MP-07 |
| Department and membership operations | IAM-MP-08 |
| Custom role lifecycle, role-permission replacement, user-role assignment, last-System-Administrator serialization | IAM-MP-09 |
| Bootstrap command, user lifecycle | IAM-MP-10 |
| HTTP endpoints, DTOs, OpenAPI, Problem Details codes | IAM-MP-11 |
| Frontend | IAM-MP-12–14 |
| Composing IAM into the HTTP runtime (NestJS providers) and resizing `DatabaseModule` timeouts | First stage with an HTTP consumer |
| Other modules' permission manifests | Their modules |
| Department seed data, any user seed | Never without approved product data (spec Section 48) / never (users) |
| Integration events, outbox, message broker | Not required (spec Section 45; ENGINEERING Section 15) |
| A shared test-support package | Deferred (Section 40) |
| Opportunistic refactors, dependency upgrades, new infrastructure | Never |

If an excluded item appears necessary to make IAM-02 "feel complete", it is not necessary.

---

# Part II — Decisions

## 10. Locked Decisions Inherited

1. Everything in IAM-01 Sections 10 and 11 remains in force unless a decision below explicitly supersedes a detail (only D-03 does, for the database private entry name and shape).
2. MOD-AUDIT owns audit persistence; IAM integrates through an Audit public capability and never creates a generic audit subsystem (spec Section 34; MODULES MOD-AUDIT; SECURITY Section 38).
3. Audit is accountability evidence, not an activity feed, event bus or event store (MODULES Section 16; ARCHITECTURE Section 26).
4. Audit records must not be editable or deletable through ordinary application workflows (SECURITY Section 29).
5. A required audit write that fails makes the privileged mutation fail (spec Section 50).
6. Cross-module atomic transactions invoke each owning module through its public capability; transaction handles never appear in domain code or public module surfaces; no generic unit-of-work (AR-022; ENGINEERING Section 15).
7. Permissions are code-defined, synchronized from reviewed manifests, never invented by administrators; retired permissions are never effective (spec Sections 9.5, 18).
8. Exactly one protected system role, `system-administrator` / "System Administrator", `isSystem = true`, active, receiving every active permission, with code-controlled mappings (spec Section 20).
9. Reference synchronization is deterministic and idempotent; no user or unapproved department is seeded; startup performs no data mutation (spec Section 48).
10. Hidden workflow logic in triggers or stored procedures needs an ADR (ENGINEERING Sections 4.3, 32).

---

## 11. Plan Decisions

Each decision is locked for execution. Deviations are recorded in the Decision Log (Section 41) only when a stop condition justified them.

### D-01 — MOD-AUDIT gets a domain core and an adapter project, following the IAM pattern

**Decision.** Create:

- `domains/audit`, package `@vertex-os/audit`, tags `type:lib`, `scope:backend`, `layer:domain`, `domain:audit`. Framework-free. Its root export is MOD-AUDIT's **public** surface: the entry and attribution contracts, their validators and the `AuditRecorder` capability interface. It has **no** private subpath.
- `domains/audit-persistence`, package `@vertex-os/audit-persistence`, tags `type:lib`, `scope:backend`, `layer:adapter`, `domain:audit`. Closed root export: `createAuditRecorder` only.

**Why.** The spec requires the foundation to be "aligned with MOD-AUDIT so no later migration from an IAM-owned generic audit table is required" (spec Section 34). IAM-01 D-01 established `domains/<domain>` + `domains/<domain>-persistence` as the reusable pattern, and it keeps Prisma out of the core the IAM module depends on.

**Alternatives rejected.**

- *Audit code inside IAM.* Violates MOD-AUDIT ownership (Master Plan risk IAM-R03).
- *Audit table and code in `packages/database`.* Makes generic infrastructure own business data.
- *One `domains/audit` project containing Prisma code.* Would loosen the domain-core rules for a project IAM depends on.

### D-02 — Tag constraints for Audit and the IAM → Audit edge

**Decision.** Additive changes to the root ESLint configuration:

```text
domain:audit (new)  onlyDependOnLibsWithTags: domain:audit, layer:infrastructure, layer:shared
domain:iam          onlyDependOnLibsWithTags: domain:iam, domain:audit, layer:infrastructure, layer:shared
restrictedImportPatterns += '@vertex-os/audit/*', '@vertex-os/audit-persistence/*',
                            '**/domains/audit/src/**', '**/domains/audit-persistence/src/**'
```

The tag header comment gains `domain:audit` ("the MOD-AUDIT ownership boundary; other domains may depend on its public root only").

**Why.** IAM must consume the Audit capability. Audit must never depend on IAM: actor IDs are opaque UUIDs, not IAM types. The existing `layer:*` rules still apply, so:

- IAM core → Audit core is allowed (`layer:domain` → `layer:domain`);
- IAM adapter → Audit core is allowed (it needs the `AuditRecorder` type);
- any project → `@vertex-os/audit-persistence` is forbidden except apps (`layer:adapter` is never an allowed target of `layer:domain` or `layer:adapter`);
- Audit → IAM is forbidden in both projects (`domain:audit`).

### D-03 — Per-domain database entry points (supersedes IAM-01 D-02 item 3; resolves R-06 for typed access)

**Decision.** Replace `@vertex-os/database/persistence` with two domain-scoped private entries:

| Entry | File | Exports |
|---|---|---|
| `@vertex-os/database/iam` | `src/iam.ts` | `iamPersistenceOf(handle)`, type `IamPersistenceClient`, `runInTransaction`, IAM enums and row types |
| `@vertex-os/database/audit` | `src/audit.ts` | `auditPersistenceOf(handle)`, type `AuditPersistenceClient`, `runInTransaction`, Audit enums |

The scoped client types are derived from the generated `Prisma.TransactionClient` by model-delegate prefix, so a future model joins its domain's scope automatically:

```ts
type Keys<P extends string> = Extract<keyof Prisma.TransactionClient, `${P}${string}`>;
type Raw = '$queryRaw' | '$executeRaw' | '$queryRawUnsafe' | '$executeRawUnsafe';
export type IamPersistenceClient = Pick<Prisma.TransactionClient, Keys<'iam'> | Raw>;
export type AuditPersistenceClient = Pick<Prisma.TransactionClient, Keys<'audit'> | Raw>;
```

- `$transaction`, `$connect`, `$disconnect`, `$on` and `$extends` are absent: adapters open transactions only through `runInTransaction` (D-04), and the composition root owns the pool.
- The unsafe raw methods stay in the type because the SQL-level constraint suites need them (IAM-01 Section 27.2). Production source is barred from them by lint (D-14).
- Each accessor accepts `DatabaseClient | DatabaseTransaction` and throws `TypeError` for a handle the package did not create or a transaction handle whose transaction has ended.
- `domains/iam-persistence/eslint.config.mjs` negates exactly `!@vertex-os/database/iam`; `domains/audit-persistence/eslint.config.mjs` negates exactly `!@vertex-os/database/audit`.
- The shared Prisma client, pool, timeouts and error classification stay in one place.

**Why.** IAM-01 deferred R-06 "until a second domain adapter appears"; this stage adds it. Without scoping, the IAM adapter could call `client.auditRecord.create(…)`: exactly the IAM-owned audit shortcut the architecture forbids (AR-005, AR-019, IAM-R03), invisible to lint. With scoping it is a compile error, and the entry each adapter may import is lint-enforced.

**Residual (accepted, R-04).** Raw SQL text can still name another domain's table. Mitigations: raw SQL in production source is rare and reviewed; the search gate (Section 35) rejects `audit_` in IAM adapter source and `iam_` in Audit adapter source. Database-level separation (schema per domain, runtime role privileges) remains ADR-0008 input for production deployment design.

**Alternatives rejected.**

- *Keep one full-client entry* (IAM-01 as is). Leaves the forbidden shortcut unguarded exactly when a second domain appears.
- *`importNames` restrictions on one shared entry.* Fragile against namespace imports and harder to read than one entry per domain.
- *Schema per domain now.* Multi-schema migration and privilege design belong to ADR-0008 and deployment design (IAM-01 D-06).

### D-04 — The cross-module atomic write mechanism (AR-022; ENGINEERING Section 15)

**Decision.** The first genuine cross-module atomic case, "IAM mutation + its Audit evidence", uses this mechanism:

1. **Database package.** `DatabaseTransaction` is an opaque, branded, type-only handle exported from the database **root**, so adapter factories can accept it in Prisma-free signatures. `runInTransaction(database, work, options?)` is exported from the scoped entries only (never from the root, so composition roots and controllers cannot open transactions). It:
   - runs one Prisma interactive transaction;
   - creates a fresh frozen token, registers token → transaction client in a module-private `WeakMap`, and deregisters it when `work` settles;
   - takes explicit options `isolationLevel` (`'ReadCommitted'` default, `'Serializable'` allowed), `timeoutMs` (default 5 000) and `maxWaitMs` (default 2 000). Stating the Prisma defaults makes them reviewed choices (P-06).
2. **IAM core** declares an IAM-specific port, not a generic unit of work:

   ```ts
   interface IamTransactionRunner {
     run<T>(work: (scope: IamTransactionScope) => Promise<T>): Promise<T>;
   }
   interface IamTransactionScope {
     readonly referenceData: ReferenceDataStore;   // IAM port (Section 21.4)
     readonly audit: AuditRecorder;                // @vertex-os/audit public capability
   }
   ```

   Later stages add their own IAM ports to the scope.
3. **IAM adapter** implements it as `createIamTransactionRunner(database, { auditRecorderFor })`, where `auditRecorderFor: (scope: DatabaseClient | DatabaseTransaction) => AuditRecorder`. Inside `runInTransaction` it builds the IAM stores from `iamPersistenceOf(tx)` and the recorder from `auditRecorderFor(tx)`. It never imports the Audit adapter.
4. **The composition root** (the operator command now, the API later) wires `auditRecorderFor: createAuditRecorder` from `@vertex-os/audit-persistence`.
5. IAM application code sees only capability interfaces already bound to the transaction. The Audit record and the IAM change commit together or not at all.

**Why.**

- It satisfies spec Section 50 ("MUST fail" rather than silently succeed) with the simplest consistent design (AR-024).
- It keeps every infrastructure handle out of domain code and public module surfaces (ENGINEERING Section 15).
- It keeps Audit ownership (Audit's adapter writes Audit's table).
- It needs no new infrastructure.

**Alternatives rejected.**

- *Transactional outbox.* Durable delivery is not the need, and ENGINEERING Section 15 chooses it only for a genuine durable-delivery case.
- *Append after commit.* The mutation could succeed without evidence.
- *Append before commit in a separate transaction.* It would leave false evidence when the mutation fails.
- *IAM writes the audit table.* Ownership violation.
- *An ambient transaction (AsyncLocalStorage).* It is hidden coupling ("magic"), which ENGINEERING Section 3 forbids.
- *A generic unit-of-work framework.* Speculative.

**Documentation.** ENGINEERING Section 15 gains a short paragraph naming the mechanism (Section 26.4). No ADR is written (Section 12.1).

### D-05 — Audit record contract

**Decision.** One append-only table `audit_record` (model `AuditRecord`, enums `audit_actor_type`/`AuditActorType` = `USER`, `SYSTEM`; `audit_result`/`AuditResult` = `SUCCEEDED`, `REFUSED`, `FAILED`). Columns and checks are in Section 16.1. The contract, derived field by field from spec Section 35 and MODULES MOD-AUDIT:

| Spec Section 35 item | Contract field |
|---|---|
| actor Vertex user ID, or the identified system process | `actor`: `{ type: 'USER', userId }` or `{ type: 'SYSTEM', process }` |
| action code | `action`: `<module>.<resource>.<event>`, first segment = `sourceModule` |
| target type and target ID | `target`: `{ type: '<module>.<resource>', id }`; the ID is an opaque identifier or stable code and can never be an email (format rule) |
| timestamp | `occurred_at`, assigned by the database (`CURRENT_TIMESTAMP`, the transaction start); callers cannot supply or forge it |
| result | `result`: `SUCCEEDED` / `REFUSED` / `FAILED` |
| request/trace ID | `traceId`, required |
| before/after state or stable change description | `change`: `{ before?, after? }` of typed, bounded field values |
| reason metadata | `reason`, optional, untrusted, bounded (spec Section 53) |
| source module | `sourceModule` |

It deliberately has:

- **no foreign keys**, because Audit references other modules' records by opaque ID (MODULES Section 5.3) and must never block or cascade from their lifecycle;
- **no secondary indexes**, because no read path exists yet; the future Audit read capability adds indexes with its queries;
- **no update or delete capability** (D-09).

`REFUSED` and `FAILED` have no producer in IAM-02. They are part of the contract because the specification already requires recording outcomes (bootstrap "including the mode and the outcome", spec Section 21.1), and adding enum values later is a deliberate migration anyway.

### D-06 — Migrations: one per owning module, authored offline

**Decision.** Two new forward-only migrations, each wrapped in the IAM-01 atomic convention (ENGINEERING Section 14):

1. `<UTC ts>_audit_foundation`: MOD-AUDIT. Generated DDL for the Audit enums and table, then hand-written checks.
2. `<UTC ts>_iam_system_role_code`: MOD-IAM. Hand-written only: `ALTER TABLE "iam_role" ADD CONSTRAINT "iam_role_system_code_ck" …`.

Author incremental DDL offline and deterministically (P-09): copy `prisma/schema` to a temporary directory **before** editing it, then run:

```text
prisma migrate diff --from-schema <temp copy> --to-schema prisma/schema --script
```

The IAM migration has no generated section: Prisma cannot model CHECK constraints (IAM-01 P-02/P-03), so the diff for it is empty. The drift gate (IAM-01 D-10) must still exit 0 after both.

**Why.** One migration per owning module keeps ownership reviewable and matches IAM-01 interpretation I-9 ("Audit tables in IAM-MP-02 … each as its own migration").

### D-07 — Upgrade-path verification for the tightened IAM constraint

**Decision.** `iam_role_system_code_ck` tightens a constraint over an existing table, which TESTING Section 14 lists explicitly. A migration test deploys only the IAM-01 migration (temporary Prisma config, P-11), inserts representative synthetic rows, then deploys the rest with the real CLI:

- valid rows survive;
- a row that violates the new check makes that migration fail atomically: the constraint is absent, the row is intact, the failure is recorded, and a redeploy refuses with P3009.

Temporary files live in the OS temporary directory and are removed. SQL files are never executed directly (IAM-01 D-10).

### D-08 — Audit validation lives in the Audit core; the database mirrors it

**Decision.** `createAuditEntry(input)` returns a typed result (`{ ok, value } | { ok: false, reason }`) and never throws for invalid input. The rules (Section 19.2) are authoritative in the core. The database checks mirror them exactly for codes, identifiers, trace ID and reason, and act as a structural backstop for `change` (object, only `before`/`after`, size bound). An invalid entry inside a privileged operation is a programming error: IAM throws, the transaction rolls back, and the mutation fails.

Defense in depth against secrets (spec Section 35 "MUST NOT contain"):

- `change` field names are restricted, and names containing `password`, `passwd`, `secret`, `token`, `cookie`, `authorization`, `credential`, `sessionid`, `apikey` or `privatekey` (case-insensitive) are rejected;
- values are bounded primitives or bounded string arrays;
- the only free text is the bounded `reason`;
- target IDs cannot contain `@`.

### D-09 — Append-only without triggers

**Decision.** Append-only is guaranteed at the capability level, which satisfies SECURITY Section 29 ("through ordinary application workflows"):

- `AuditRecorder` has exactly one operation, `append`;
- the Audit adapter contains no `update`, `updateMany`, `upsert`, `delete` or `deleteMany` call on the audit delegate (search gate, Section 35);
- the IAM adapter cannot reach the audit delegate (D-03);
- there are no foreign keys, so nothing can cascade into the table.

No trigger, rule or row-level security is added: IAM-01 D-08 precedent and ENGINEERING Sections 4.3/32. Row-level security would not bind the superuser that local development uses anyway.

Recorded for production deployment design:

- a runtime role without `UPDATE`, `DELETE` and `TRUNCATE` on `audit_record` (SECURITY Section 26);
- optionally, an ADR for a database immutability guard.

### D-10 — The system role is unforgeable in the database

**Decision.** Add `iam_role_system_code_ck CHECK (is_system = (code = 'system-administrator'))` (P-10).

**Why.** Together with the unique role code and `iam_role_system_active_ck`, the database now guarantees:

- at most one system role;
- that it carries the reserved code;
- that no custom role can occupy the reserved code.

The last point closes a privilege-escalation path. A custom role created with the reserved code before synchronization could otherwise be "adopted" and receive every permission for all its holders. The synchronization additionally refuses rather than converts anything unexpected (Section 23.3).

V1 defines exactly one system role (spec Section 20); introducing another later is a deliberate migration.

### D-11 — Reference synchronization: explicit, serialized, idempotent, fully audited

**Decision.**

1. **Entry point.** Synchronization runs only through the operator command (D-16). It never runs on startup or in a migration (spec Section 48; the IAM-01 migration test forbids reference rows in migrations).
2. **One transaction per run.** A run is one IAM transaction (D-04, `ReadCommitted`). Its first statement takes a transaction-scoped advisory lock with a fixed key constant (`IAM_REFERENCE_SYNC_LOCK_KEY`, a documented bigint literal unique among repository advisory locks). Every run is therefore serialized against every other (P-05), and a waiting run re-reads committed state after the lock.
3. **Plan, then apply.** The planner is a pure function of the declared manifests and a snapshot read after the lock (Section 23). The run applies exactly the planned changes and appends one audit entry per change.
4. **A converged run is a true no-op.** It writes nothing: no row, no `updated_at`, no `version`, no audit record.
5. **Refusals change nothing** and write no audit record: no state changed, and the cause is a repository or deployment inconsistency. The command reports the stable reason and exits non-zero (Section 24).

### D-12 — Permission-catalog and system-role content is code

**Decision.** The IAM core holds `iamPermissionManifest` with the twelve spec Section 19 permissions (content fixed in Section 21.1) and `systemAdministratorRole` (`code` `system-administrator`, `name` `System Administrator`, `description` `Protected system role that holds every active permission.`).

- Manifests are per owning module (`{ module, permissions }`), because spec Section 18 says each owning module defines its own codes.
- The use case takes the list of manifests, so later modules add theirs at the composition root without changing IAM.
- No other module manifest exists in IAM-02; tests use synthetic manifests.

### D-13 — A1-01: dynamic imports and type queries are restricted by syntax selectors

**Decision.** The root configuration exports `restrictedImportSyntax`, the four P-07 selectors with explanatory messages:

- dynamic `import()` of any `@vertex-os/<package>/<subpath>` literal;
- a template-literal specifier starting with `@vertex-os/`;
- any non-literal, non-template specifier (unanalyzable dependencies);
- `import('@vertex-os/<package>/<subpath>')` type queries.

It applies them to **all** linted TypeScript/JavaScript files, including tests and configuration. No project negates them: adapters use static imports for their permitted private entries.

Because a later ESLint configuration object replaces an earlier one's options for the same rule, the rule is composed explicitly:

| Files | `no-restricted-syntax` value |
|---|---|
| all TS/JS/MJS/MTS files | `restrictedImportSyntax` |
| production `**/src/**` (non-spec, non-test-setup) | `restrictedImportSyntax` + `restrictedEnvSyntax` + `restrictedRawSqlSyntax` (D-14) |
| `apps/api/src/main.ts` and `apps/api/src/commands/iam-sync-reference.ts` (the two raw-environment bridges) | `restrictedImportSyntax` + `restrictedRawSqlSyntax` |

The `main.ts` override stops switching the whole rule off; it drops only the environment selectors.

### D-14 — Unsafe raw SQL is banned from production source

**Decision.** `restrictedRawSqlSyntax` rejects `MemberExpression[property.name='$queryRawUnsafe']` and `MemberExpression[property.name='$executeRawUnsafe']` in production source. Tests keep them for SQL-level constraint setup.

**Why.** The scoped client types keep the unsafe methods for tests (D-03). Unsafe raw SQL in production is an injection risk (SECURITY Section 16). Tagged `$queryRaw`/`$executeRaw` remain available for locks and set-based statements.

### D-15 — A1-02: only an allowlisted description of a database error is ever logged

**Decision.**

1. **Database package root.** Add `describeDatabaseError(error: unknown): DatabaseErrorDescription | undefined`, Prisma-free in its signature. It recognizes Prisma's error classes (known-request, unknown-request, validation, initialization, panic) and `DatabaseUnavailableError`. It returns only fields that match strict shapes:
   - `prismaCode` (`^P\d{4}$`);
   - `sqlState` (`^[0-9A-Z]{5}$`);
   - `driverKind` (`^[A-Za-z]{1,64}$`);
   - `constraint` and `table` (lowercase SQL identifiers, at most 63 characters);
   - `model` (`^[A-Za-z][A-Za-z0-9]{0,63}$`).

   It **never** includes messages, `detail`, `originalMessage`, `meta` or stacks, because those carry row data and raw input (P-02, P-03). Validation errors (which print call arguments) are recognized too.
2. **`apps/api/src/logging/safe-error-serializer.ts`.** It serializes any `err` value:
   - a recognized database error → `{ type, database: description }`;
   - anything else → `{ type, message, stack, code?, statusCode? }` plus a recursively serialized `cause` (depth at most 3), and **no other enumerable properties**. Pino's default copies every enumerable property (P-02).
3. The serializer is wired into the Fastify logger (`serializers: { err }` in `createApp`), which covers `ProblemDetailsFilter` and `PinoLoggerService`, and into the operator command's logger.
4. **Tests.**
   - The database package asserts, with real P2039, P2010, P2007 and P2002 errors, that the description is complete and contains no sentinel.
   - The API asserts the serializer rules and that the Fastify logger is wired.
   - The command's integration test logs a **real** P2007 error carrying a sentinel through both loggers and asserts the sentinel is absent (Section 33.8).

**Why this location.** Knowledge of Prisma error shapes stays in the database package (IAM-01 D-03); the logger stays in the composition root; adapters keep rethrowing unexpected errors unchanged (IAM-01 Section 24).

### D-16 — The operator command lives in `apps/api` as a second bootstrap entry

**Decision.**

- **Entry and command.** `apps/api/src/commands/iam-sync-reference.ts` is a thin entry, like `main.ts`: `loadAppConfig(process.env)`, then run and set the exit code. `apps/api/src/commands/iam-sync-reference.command.ts` holds the testable `runIamReferenceSync(config, options)`.
- **What the command does:**
  1. creates its own `DatabaseClient` with explicit 5 000 ms connect and statement timeouts;
  2. composes `createIamTransactionRunner(database, { auditRecorderFor: createAuditRecorder })`;
  3. generates a `traceId` (`randomUUID()`);
  4. calls `synchronizeIamReferenceData`;
  5. logs one structured result line through a `pino` logger with the safe serializer;
  6. disconnects in `finally`.
- **Exit codes:** `0` synchronized (with or without changes), `2` refused, `1` configuration or unexpected failure.
- **Wiring:**
  - Nx target `@vertex-os/api:iam-sync-reference`: `node --enable-source-maps --env-file-if-exists=../../.env dist/commands/iam-sync-reference.js`, `dependsOn: ["build"]`, `cache: false`;
  - root script `"iam:sync-reference": "nx run @vertex-os/api:iam-sync-reference"`;
  - `apps/api` dependencies gain `@vertex-os/iam`, `@vertex-os/iam-persistence`, `@vertex-os/audit`, `@vertex-os/audit-persistence` (`workspace:*`) and `pino` at the version already locked (P-12).
- `options` accepts a log destination and an `auditRecorderFor` factory. The production default is `createAuditRecorder`; injecting a wrapper is ordinary dependency injection used by the fault-injection test, not a test hook.

**Why.** Apps compose (AR-008). `apps/api` already owns typed configuration, logging and the deployable artifact. A second app would duplicate configuration and packaging for one command. The adapters must not compose each other (D-02). The HTTP runtime (`AppModule`, `DatabaseModule`) is not changed, so the API statement-timeout item stays open (Section 5.1).

### D-17 — Public IAM surface grows only by what the composition root needs

**Decision.** The IAM root export (empty since IAM-00) exports:

- `synchronizeIamReferenceData` (an application command, ARCHITECTURE Section 11);
- `iamPermissionManifest`;
- the types `PermissionManifest`, `PermissionDefinition`, `PermissionCode`, `ReferenceSyncResult` and `ReferenceSyncRefusalReason`.

The ports (`IamTransactionRunner`, `IamTransactionScope`, `ReferenceDataStore`, snapshot and change types) go to the private `@vertex-os/iam/persistence` entry, because only the IAM adapter implements them. No repository, Prisma type, store or internal service becomes public (spec Section 44).

---

## 12. Specification Interpretations

The specification leaves the following open. None changes a specified semantic, so `docs/modules/iam.md` changes only for A1-03. The auditor should confirm the classification.

| # | Topic | Resolution | Basis |
|---|---|---|---|
| I-1 | "every active permission" (spec Section 20) | The system role's mapping set equals exactly the permissions whose state is `ACTIVE`. `DEPRECATED` and `RETIRED` are removed from it. Whether `DEPRECATED` stays effective for custom roles is IAM-MP-07's decision. | Literal reading; least privilege; nothing is `DEPRECATED` in V1 |
| I-2 | Permission state transitions under synchronization | `ACTIVE ↔ DEPRECATED`, `ACTIVE → RETIRED`, `DEPRECATED → RETIRED` are allowed. `RETIRED` is terminal: a manifest that declares a persisted `RETIRED` code as anything else is refused. | Spec Section 18: codes are never repurposed, and retired permissions are never effective |
| I-3 | A persisted code missing from every manifest | Refused. Manifests are append-only: a removed capability stays declared with state `RETIRED`. A new database may register a code directly as `RETIRED` to reserve it. | Spec Section 18 "MUST NOT be silently repurposed"; accidental removal fails loudly |
| I-4 | Metadata changes | Name, description and sensitivity of an existing code may change; each change is audited with before/after. `owningModule` cannot change (it is the code's first segment, database-enforced). | Display and classification metadata, not meaning |
| I-5 | Sensitivity levels (the specification lists the values but not their meaning) | `STANDARD`: reads non-confidential organizational data. `SENSITIVE`: reads personal or security-relevant data, or changes data without altering access or privileges. `PRIVILEGED`: grants, removes or alters access, privileges or sessions. In V1 no behavior depends on sensitivity. | Working definitions for classification and UX (IAM-MP-14) |
| I-6 | System-role `version` | A newly created system role has version 1, and its initial mappings belong to the creation. For an existing role, a run that changes its attributes or its mapping set increments `version` by exactly 1 (once per run). | The mapping set is part of the role's protected state (spec Section 30). IAM-MP-09 aligns custom roles or records why not. |
| I-7 | Audit of refused synchronization runs | Not recorded as Audit evidence (D-11); reported by the command and its structured log | No state changed; the cause is a repository or deployment inconsistency, not an actor's security action |
| I-8 | Trace ID grammar | Identical to the API's accepted request-ID grammar `^[A-Za-z0-9._:-]{1,128}$`, so every API request ID is a valid audit trace ID (parity test). Commands generate a UUID. | Spec Section 35 "request/trace ID"; `apps/api/src/http/request-id.ts` |

### 12.1 Owner acceptance and delegated rulings (2026-09-23)

The owner accepted this plan and delegated the decisions it had flagged for review. The planning agent ruled:

| Item | Ruling | Reason |
|---|---|---|
| D-03 per-domain database entries | Confirmed as written | It is the smallest mechanism that makes the forbidden shortcut (IAM writing Audit rows, or the reverse) a compile error now that a second domain adapter exists. Database-level separation stays with ADR-0008 and deployment design. |
| D-04 cross-module transaction mechanism | Confirmed. It is recorded in `docs/ENGINEERING.md` Section 15, **not** as an ADR. | AR-022 and ENGINEERING Section 15 already anticipate that "the concrete mechanism is decided when the first genuine cross-domain case is implemented". The decision stays inside the accepted architecture. `docs/adr/` does not exist, and creating the repository's first ADR would set a governance format beyond this stage's scope. |
| I-1 System Administrator holds `ACTIVE` permissions only | Confirmed | Literal reading of spec Section 20 and least privilege. No V1 permission is `DEPRECATED`. |
| I-3 undeclared persisted code refuses | Confirmed | Accidental removal or repurposing must fail loudly; `RETIRED` tombstones keep codes reserved. |
| I-5 sensitivity definitions and the Section 21.1 classification | Confirmed | No V1 behavior depends on sensitivity; a later change is an audited catalog update. |
| A1-03 replacement text | Confirmed: `projects.projects.edit` | It follows the normative `<module>.<resource>.<action>` rule with the plural-resource convention of the IAM codes (`iam.users.read`). |
| `docs/modules/audit.md` | Not created in this stage | A module specification is a governance act. The foundation contract lives in this plan (D-05, Section 19) and in code until MOD-AUDIT is specified (Section 40). |

---

## 13. Security Invariants for This Stage

1. Permission codes come only from reviewed code. Data alone cannot introduce one: an undeclared persisted code makes synchronization refuse, and no API or UI exists.
2. A `RETIRED` code can never become effective again through synchronization.
3. After every successful run, the system role holds exactly the `ACTIVE` permissions; custom roles are never touched.
4. The database forbids a second or forged system role and any custom use of the reserved code (D-10).
5. Every catalog or system-role change has an Audit record in the same transaction; a failed append leaves no change (D-04).
6. Audit records carry no secrets, emails or raw driver text (D-08, Section 19.2); target IDs cannot contain `@`.
7. Audit records cannot be updated or deleted through any application capability (D-09).
8. IAM cannot reach Audit models through the typed client, and vice versa (D-03); raw cross-domain SQL is caught by search gates.
9. Private entries cannot be reached through static imports, dynamic imports or type queries (D-13).
10. Database errors are logged only as allowlisted descriptions: no row data, no raw input, no connection string (D-15).
11. No user, department or default account is created; synchronization never runs implicitly.
12. Test harnesses migrate only containers they started (IAM-01 Section 22), including the upgrade-path harness.

---

## 14. Module Boundaries After IAM-02

| Source → target | Status | Enforced by |
|---|---|---|
| `apps/api` → roots of `@vertex-os/iam`, `iam-persistence`, `audit`, `audit-persistence`, `database` | Allowed | tags |
| `apps/api` → `@vertex-os/database/iam`, `/audit`, `@vertex-os/iam/persistence`, `@vertex-os/audit/*`, any `src` path | Forbidden, statically **and** dynamically | `no-restricted-imports` + `no-restricted-syntax` |
| `@vertex-os/iam` → `@vertex-os/audit` root | Allowed | tags (`domain:iam` += `domain:audit`) |
| `@vertex-os/iam` → `audit-persistence`, `database` | Forbidden | `layer:domain` |
| `@vertex-os/iam-persistence` → `iam` root and `/persistence`, `audit` root, `database` root and `/iam` | Allowed | tags + adapter negations |
| `@vertex-os/iam-persistence` → `audit-persistence`, `database/audit` | Forbidden | `layer:adapter`; `no-restricted-imports` |
| `@vertex-os/audit` → any IAM project, `database`, Prisma, `pg` | Forbidden | `domain:audit`, `layer:domain` |
| `@vertex-os/audit-persistence` → `audit` root, `database` root and `/audit` | Allowed | tags + adapter negation |
| `@vertex-os/audit-persistence` → any IAM project, `database/iam`, Prisma, `pg` | Forbidden | `domain:audit`, `layer:adapter`, `no-restricted-imports` |
| `packages/database` → any domain project | Forbidden | `layer:infrastructure` |
| `apps/web`, `packages/ui`, `apps/web-e2e` → any backend project | Forbidden | `scope:web`, `layer:ui`, `type:e2e` |
| IAM adapter typed access to `audit*` delegates; Audit adapter typed access to `iam*` delegates | Compile error | D-03 scoped types |
| Unsafe raw SQL in production source | Forbidden | D-14 |

---

# Part III — Target Design

## 15. Target Architecture

```text
 apps/api  ── operator command iam-sync-reference (composition root; HTTP runtime unchanged)
   │ loadAppConfig → createDatabaseClient → createIamTransactionRunner(db, { auditRecorderFor: createAuditRecorder })
   │ → synchronizeIamReferenceData(runner, { manifests: [iamPermissionManifest], traceId })
   │ safe pino logger (describeDatabaseError)
   ├──────────► @vertex-os/iam  (layer:domain, domain:iam)
   │               catalog + planner (pure) + use case; ports via /persistence (private)
   │               └──► @vertex-os/audit (public root: entry contract, AuditRecorder)
   ├──────────► @vertex-os/iam-persistence (layer:adapter, domain:iam)
   │               ReferenceDataStore, IamTransactionRunner ──► @vertex-os/database/iam
   ├──────────► @vertex-os/audit-persistence (layer:adapter, domain:audit)
   │               createAuditRecorder(handle) ──► @vertex-os/database/audit
   ▼
 @vertex-os/database (layer:infrastructure)
   root: createDatabaseClient, DatabaseClient, DatabaseTransaction (type), describeDatabaseError
   /iam, /audit: scoped clients + runInTransaction; one pool, one transaction registry
   prisma/schema/{schema,iam,audit}.prisma; migrations: iam_persistence_foundation,
   audit_foundation, iam_system_role_code
                     ▼
               PostgreSQL 18 (public.iam_*, public.audit_record)
```

One synchronization run:

```text
runner.run ─ BEGIN (ReadCommitted)
   ├─ pg_advisory_xact_lock(IAM_REFERENCE_SYNC_LOCK_KEY)
   ├─ read snapshot (permissions, system role, its mappings)
   ├─ plan = planReferenceSync(manifests, snapshot)      ← pure; may refuse
   ├─ apply: permissions → system role → revoke mappings → grant mappings → version
   ├─ audit.append(entry) for each change                ← same transaction
   └─ COMMIT (or ROLLBACK on any error: nothing persists)
```

---

## 16. Database Changes

### 16.1 `audit_record` (MOD-AUDIT)

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | `uuid` | no | `gen_random_uuid()` | PK `audit_record_pkey` |
| `occurred_at` | `timestamptz(3)` | no | `CURRENT_TIMESTAMP` | database-assigned; never written by callers |
| `source_module` | `text` | no | — | |
| `action` | `text` | no | — | |
| `actor_type` | `audit_actor_type` | no | — | `USER` or `SYSTEM` |
| `actor_user_id` | `uuid` | yes | — | opaque; no foreign key |
| `actor_process` | `text` | yes | — | e.g. `iam.reference-sync` |
| `target_type` | `text` | no | — | |
| `target_id` | `text` | no | — | |
| `result` | `audit_result` | no | — | |
| `trace_id` | `text` | no | — | |
| `reason` | `text` | yes | — | |
| `change` | `jsonb` | yes | — | SQL NULL when absent, never JSON `null` |

Hand-written checks. Each code check keeps the IAM-01 ASCII precondition `octet_length(x) = char_length(x)`:

| Name | Predicate (semantics; exact SQL in the migration) |
|---|---|
| `audit_record_source_module_ck` | module-code format, 2–32 characters (as `iam_permission_owning_module_ck`) |
| `audit_record_action_ck` | three segments `^[a-z][a-z0-9]*(-[a-z0-9]+)*` joined by `.`, at most 128 characters |
| `audit_record_action_module_ck` | `split_part(action, '.', 1) = source_module` |
| `audit_record_actor_ck` | `(actor_type = 'USER' AND actor_user_id IS NOT NULL AND actor_process IS NULL) OR (actor_type = 'SYSTEM' AND actor_process IS NOT NULL AND actor_user_id IS NULL)` |
| `audit_record_actor_process_ck` | `actor_process IS NULL` or two segments of the segment format, at most 64 characters |
| `audit_record_target_type_ck` | two segments of the segment format, at most 64 characters |
| `audit_record_target_id_ck` | `^[a-z0-9]([a-z0-9._-]{0,126}[a-z0-9])?$` (1–128 characters; no `@`, no upper case, no space) |
| `audit_record_trace_id_ck` | `^[A-Za-z0-9._:-]{1,128}$` |
| `audit_record_reason_ck` | `reason IS NULL` or 1–500 characters, trimmed, no `[[:cntrl:]]` |
| `audit_record_change_ck` | `change IS NULL` or (`jsonb_typeof(change) = 'object'` AND `(change - 'before' - 'after') = '{}'::jsonb` AND `change <> '{}'::jsonb` AND `octet_length(change::text) <= 32768`) |

The `change` size bound is a looser backstop than the core's authoritative 16 KiB limit, because `jsonb::text` adds spaces that `JSON.stringify` does not. There are no foreign keys, no secondary indexes, no triggers and no functions.

### 16.2 IAM: `iam_role_system_code_ck`

```sql
ALTER TABLE "iam_role" ADD CONSTRAINT "iam_role_system_code_ck"
  CHECK (is_system = (code = 'system-administrator'));
```

`iam.prisma`'s `///` comment on `IamRole` gains the name, following the IAM-01 convention.

### 16.3 What the database deliberately does not enforce

The following stay in the application and are proven by tests:

- the permission state machine and `RETIRED` terminality;
- the system role's mapping set being equal to the `ACTIVE` set;
- "undeclared persisted permission" refusal;
- the change-field denylist and value typing;
- Audit append-only-ness (D-09).

---

## 17. Migration Specification

### 17.1 Location and names

- `packages/database/prisma/migrations/<UTC yyyymmddHHMMSS>_audit_foundation/migration.sql`
- `packages/database/prisma/migrations/<UTC yyyymmddHHMMSS>_iam_system_role_code/migration.sql` (authored after the Audit one, so it sorts later)

### 17.2 Structure

Both files follow IAM-01 Section 16.2:

- a header comment naming the owner (MOD-AUDIT or MOD-IAM), the plan (IAM-MP-02), the atomic-wrapper reason and a recovery pointer (IAM-01 Section 16.5, which applies unchanged);
- `BEGIN;`;
- the generated section (Audit only), headed with its generating command;
- the hand-written section;
- `COMMIT;`.

### 17.3 Review checklist (the implementer records it; the auditor re-checks it)

- [ ] The Audit generated section equals a fresh `migrate diff --from-schema <pre-change copy> --to-schema prisma/schema --script` output.
- [ ] Every name in Section 16 appears exactly as written; none exceeds 63 bytes.
- [ ] Each file has exactly one `BEGIN;` and one `COMMIT;`, and no `CONCURRENTLY`, `CREATE SCHEMA`, `DROP`, `TRUNCATE`, `DELETE`, `INSERT`, `UPDATE`, `CREATE TRIGGER` or `CREATE FUNCTION`.
- [ ] No reference rows.
- [ ] The drift gate passes after both migrations.
- [ ] The IAM-01 migration file is byte-for-byte unchanged (forward-only).

### 17.4 Tests that change

In `packages/database/src/migrations.integration.spec.ts`:

- "applies all migrations" asserts the exact ordered list of three migration names, all finished and none rolled back;
- "creates no reference data" also asserts `audit_record` is empty;
- the upgrade-path test (D-07) goes in the same file or a sibling `*.integration.spec.ts`.

---

## 18. Database Package Changes (`packages/database`)

1. `prisma/schema/audit.prisma`, holding the Audit enums and model, with a `///` comment listing its database-only checks; format with `prisma format`.
2. `src/database-client.ts`:
   - the transaction registry;
   - `runInTransaction`;
   - the brand declaration for `DatabaseTransaction`;
   - the scoped accessor core;
   - `describeDatabaseError` (exported from the root).

   `persistenceClientOf` and `src/persistence.ts` are **removed**, together with the `./persistence` export.
3. `src/iam.ts` and `src/audit.ts` with the `./iam` and `./audit` exports (D-03). Production code reads no environment.
4. The root export adds `type DatabaseTransaction`, `describeDatabaseError` and `type DatabaseErrorDescription`.
5. Tests:
   - `database-client.integration.spec.ts` (or a new sibling) covers transaction-handle lifecycle, rollback, isolation option, accessor rejection of foreign or expired handles, and `describeDatabaseError` on real P2002, P2007, P2010 and P2039 errors;
   - a type-level spec asserts with `// @ts-expect-error` that `iamPersistenceOf(x).auditRecord`, `auditPersistenceOf(x).iamRole` and `iamPersistenceOf(x).$transaction` do not compile (verified by `typecheck`);
   - migration tests change per Section 17.4.
6. `@nx/dependency-checks` must still pass.

---

## 19. Audit Core (`domains/audit`)

### 19.1 Layout

```text
domains/audit/
  package.json            @vertex-os/audit, private, ESM, closed root export (IAM shape), no subpath,
                          nx.tags type:lib scope:backend layer:domain domain:audit, nx.targets.test {}
  eslint.config.mjs       base config only
  tsconfig{,.lib,.spec}.json, vitest.config.mts   (mirroring domains/iam)
  src/index.ts            public: types, validators, AuditRecorder
  src/audit-entry.ts      entry + attribution contract and createAuditEntry
  src/codes.ts            module, action, target type, process, target id, trace id grammars
  src/change.ts           change validation
  src/audit-recorder.ts   AuditRecorder port
  src/*.spec.ts
```

File names are guidance; the separation and the closed surface are required.

### 19.2 Validation rules (core = authority; Section 16.1 mirrors them)

| Value | Rule |
|---|---|
| `sourceModule` | `^[a-z][a-z0-9]*(-[a-z0-9]+)*$`, 2–32 characters |
| `action` | three dot-separated segments of that grammar, at most 128 characters, first segment = `sourceModule` |
| `actor` | `{ type: 'USER', userId }`, where `userId` is canonical lowercase UUID text; or `{ type: 'SYSTEM', process }`, where `process` is two segments, at most 64 characters |
| `target` | `type`: two segments, at most 64 characters; `id`: `^[a-z0-9]([a-z0-9._-]{0,126}[a-z0-9])?$` |
| `result` | `SUCCEEDED`, `REFUSED`, `FAILED` |
| `traceId` | `^[A-Za-z0-9._:-]{1,128}$` (I-8) |
| `reason` | absent, or trimmed with 1–500 code points and no C0/C1 control characters (IAM-01 text rules) |
| `change` | absent, or an object with only `before` and/or `after`; at least one field overall. Each side is an object of at most 32 fields. Field names match `^[a-z][A-Za-z0-9]{0,63}$` and are not on the D-08 denylist. A value is a string (at most 2 000 code points, no control characters), a finite number, a boolean, `null`, or an array of at most 500 strings (each at most 128 characters, no control characters). `JSON.stringify(change)` is at most 16 384 UTF-8 bytes. |

`createAuditEntry` returns a typed result with stable reason codes (for example `invalid-action`, `action-module-mismatch`, `invalid-actor`, `invalid-target`, `invalid-trace-id`, `invalid-reason`, `invalid-change`, `sensitive-change-field`, `change-too-large`). It never throws for invalid input, and invalid-input reasons never echo the input.

### 19.3 Public contract (sketch; exact TypeScript is the implementer's)

```ts
export type AuditActor =
  | { readonly type: 'USER'; readonly userId: AuditUserId }
  | { readonly type: 'SYSTEM'; readonly process: SystemProcessCode };

export interface AuditAttribution {          // the trace/request attribution contract
  readonly actor: AuditActor;
  readonly traceId: TraceId;
  readonly reason?: AdministrativeReason;
}

export interface AuditEntry {                // validated, immutable
  readonly sourceModule: AuditModuleCode;
  readonly action: AuditActionCode;
  readonly actor: AuditActor;
  readonly target: { readonly type: AuditTargetType; readonly id: AuditTargetId };
  readonly result: AuditResult;
  readonly traceId: TraceId;
  readonly reason?: AdministrativeReason;
  readonly change?: AuditChange;
}

export interface AuditRecorder {
  append(entry: AuditEntry): Promise<void>;  // the only operation
}
```

The module also exports:

- `createAuditEntry(input)`;
- `parseTraceId`, `parseAdministrativeReason`, `parseSystemProcess` and `userActor`;
- the closed sets `auditResults` and `auditActorTypes`.

`AuditAttribution` is how later IAM use cases receive "who, which request, why" from their callers (HTTP request ID, session actor, administrative reason); this stage's command builds a system attribution.

### 19.4 Tests

Section 33.1.

---

## 20. Audit Adapter (`domains/audit-persistence`)

- **Project.** Mirrors `domains/iam-persistence`:
  - package `@vertex-os/audit-persistence` with dependencies `@vertex-os/audit` and `@vertex-os/database`;
  - tags `type:lib`, `scope:backend`, `layer:adapter`, `domain:audit`;
  - target `test:integration`;
  - an ESLint configuration re-declaring `restrictedImportPatterns` with the single negation `!@vertex-os/database/audit`, plus `@nx/dependency-checks`;
  - `test-support/` holding the migrated-PostgreSQL harness, a copy of IAM-01's, outside `src/`.
- **`createAuditRecorder(handle: DatabaseClient | DatabaseTransaction): AuditRecorder`**:
  - `append` performs one `auditPersistenceOf(handle).auditRecord.create` with explicit mapping (exhaustive enum maps, `satisfies Record<…>`) and `select: { id: true }`;
  - it never writes `occurred_at`;
  - it omits `change` when absent (SQL NULL);
  - it does not log, read the environment or catch errors: unexpected errors propagate unchanged, and the caller's transaction rolls back.
- **Public declarations** contain only `@vertex-os/audit` and `@vertex-os/database` root types (search gate).

---

## 21. IAM Core Changes (`domains/iam`)

### 21.1 Permission catalog content (D-12, I-5)

| Code | Name | Description | Sensitivity |
|---|---|---|---|
| `iam.users.read` | Read users | View the IAM user directory and user details. | SENSITIVE |
| `iam.users.create` | Create users | Create and provision invited users and resend their invitations. | PRIVILEGED |
| `iam.users.update` | Update users | Update a user's display name, the only mutable profile field in V1. | SENSITIVE |
| `iam.users.manage-access` | Manage user access | Suspend, disable, reactivate or terminate user access, and retry identity synchronization. | PRIVILEGED |
| `iam.users.manage-roles` | Manage user roles | Grant and remove user roles. | PRIVILEGED |
| `iam.users.manage-departments` | Manage user departments | Manage user department memberships. | SENSITIVE |
| `iam.roles.read` | Read roles | View roles and their permission mappings. | SENSITIVE |
| `iam.roles.manage` | Manage roles | Create, update and deactivate custom roles and edit their permission mappings. | PRIVILEGED |
| `iam.permissions.read` | Read permissions | View the permission catalog. | STANDARD |
| `iam.departments.read` | Read departments | View departments. | STANDARD |
| `iam.departments.manage` | Manage departments | Create, update, activate and deactivate departments. | SENSITIVE |
| `iam.sessions.revoke` | Revoke sessions | Revoke application sessions for another user. | PRIVILEGED |

All twelve are declared `ACTIVE`. English text is canonical data; localized UI labels are IAM-MP-14's concern.

### 21.2 Layout

```text
domains/iam/src/
  domain/permission-catalog.ts        PermissionDefinition, PermissionManifest, iamPermissionManifest,
                                      systemAdministratorRole
  domain/reference-sync-plan.ts       manifest validation + planReferenceSync (pure)
  application/ports/reference-data-store.ts
  application/ports/iam-transaction.ts
  application/synchronize-reference-data.ts
  index.ts                            public (D-17)
  persistence.ts                      private (D-17)
```

`@vertex-os/audit` is added to `domains/iam/package.json` dependencies.

### 21.3 Manifest validation (pure, before any I/O)

Validation checks:

- every module code is valid and unique across manifests;
- every permission code is valid for its manifest's module (`parsePermissionCode(code, module)`) and unique across all manifests;
- names and descriptions pass `parseEntityName`/`parseDescription` and are already in canonical form (input equals its trimmed value);
- states and sensitivities are in their closed sets.

Any violation refuses with `invalid-manifest` and safe detail tokens, for example `duplicate-code:iam.users.read`; the tokens contain codes only. A unit test proves `iamPermissionManifest` is valid.

### 21.4 Ports (private)

- `ReferenceDataStore` (inside a transaction):
  - `acquireSynchronizationLock()`;
  - `readSnapshot()`, returning every persisted permission with all fields, plus the role with code `system-administrator` or `is_system = true` if any (ID, code, name, description, state, `isSystem`, version, current mapping codes);
  - write operations for exactly the plan's change kinds: register permissions, update one permission's changed fields, create the system role, update its attributes, revoke and grant mappings, bump its version.

  The exact method set is the implementer's, but it MUST NOT offer "upsert everything". A converged run performs no write.
- `IamTransactionRunner` and `IamTransactionScope` (D-04).

### 21.5 Use case

```ts
synchronizeIamReferenceData(
  dependencies: { readonly runner: IamTransactionRunner },
  request: { readonly manifests: readonly PermissionManifest[]; readonly traceId: TraceId },
): Promise<ReferenceSyncResult>
```

The use case:

- validates manifests first (Section 21.3);
- then, inside one `runner.run`: lock, snapshot, plan, apply, and append one entry per change;
- builds the attribution itself: actor `{ type: 'SYSTEM', process: 'iam.reference-sync' }`, source module `iam`, the caller's trace ID, no reason. Callers cannot choose the actor of a system process;
- returns:

```ts
type ReferenceSyncResult =
  | { readonly outcome: 'synchronized'; readonly changes: {
        readonly permissionsRegistered: readonly PermissionCode[];
        readonly permissionsUpdated: readonly PermissionCode[];
        readonly systemRole: 'created' | 'updated' | 'unchanged';
        readonly permissionsGranted: readonly PermissionCode[];
        readonly permissionsRevoked: readonly PermissionCode[]; } }
  | { readonly outcome: 'refused'; readonly reason: ReferenceSyncRefusalReason;
      readonly details: readonly string[] };
```

Lists are sorted ascending. Refusal reasons are `invalid-manifest`, `undeclared-permissions`, `retired-permission-reactivated` and `system-role-conflict`.

---

## 22. IAM Adapter Changes (`domains/iam-persistence`)

1. **Migration to the scoped entry.** `application-user-repository.ts` and the test support import `@vertex-os/database/iam`. `create` uses `runInTransaction(database, …)` instead of `client.$transaction`. Behavior and typed outcomes are unchanged, and the 73 existing tests stay green.
2. **`reference-data-store.ts`** implements `ReferenceDataStore` on `IamPersistenceClient`:
   - explicit `select`s and exhaustive enum maps (IAM-01 Section 18.3);
   - set-based `createMany`/`deleteMany` for mapping deltas;
   - the version bump as one conditional update of the system role (`where: { id, version }`). A zero-row result is impossible under the lock and is thrown as an unexpected error, never ignored;
   - the advisory lock as a tagged `$executeRaw` with the key constant.
3. **`iam-transaction-runner.ts`** implements `createIamTransactionRunner(database, { auditRecorderFor })` (D-04).
4. **`index.ts`** exports `createApplicationUserRepository` and `createIamTransactionRunner` only. `dist/index.d.ts` contains no Prisma or generated types.
5. **ESLint:** the negation `!@vertex-os/database/persistence` becomes `!@vertex-os/database/iam`.
6. **Tests:** Section 33.4.

---

## 23. Reference Synchronization Semantics

### 23.1 Planning rules (pure; `D` = declared, `S` = snapshot)

1. A code in `S` but in no manifest → refuse `undeclared-permissions` (I-3).
2. A code `RETIRED` in `S` and declared with another state → refuse `retired-permission-reactivated` (I-2).
3. A snapshot inconsistent with D-10 (a role with the reserved code but `isSystem = false`, a system role with another code, or more than one) → refuse `system-role-conflict`. The database makes this unreachable; the check keeps the planner total.
4. A code in `D` but not in `S` → register it with the declared fields and state, `RETIRED` included.
5. A code in both whose name, description, sensitivity or state differs → update exactly the differing fields (I-4, I-2).
6. No system role → create it from `systemAdministratorRole`: `isSystem = true`, `ACTIVE`, version 1.
7. A system role whose name or description differs from the definition → update them (drift repair).
8. Target mapping set = the codes whose post-plan state is `ACTIVE`. Grant `target − current`; revoke `current − target`.
9. The system role existed and (7) or (8) changed something → `version + 1`, once (I-6).
10. Custom roles and their mappings are never read or written.

Refusal checks (1)–(3) run before any change is planned. A refused plan contains no changes.

### 23.2 Audit entries (all `sourceModule: iam`, actor `SYSTEM iam.reference-sync`, result `SUCCEEDED`, the run's `traceId`)

| Action | Target | `change` |
|---|---|---|
| `iam.permission.registered` | `iam.permission` / code | `after`: `owningModule`, `name`, `description`, `state`, `sensitivity` |
| `iam.permission.updated` | `iam.permission` / code | `before`/`after`: only the changed fields among `name`, `description`, `state`, `sensitivity` |
| `iam.role.created` | `iam.role` / role UUID | `after`: `code`, `name`, `description`, `state`, `isSystem` |
| `iam.role.updated` | `iam.role` / role UUID | `before`/`after`: only the changed fields among `name`, `description` |
| `iam.role.permissions-granted` | `iam.role` / role UUID | `after`: `permissionCodes` (sorted granted codes) |
| `iam.role.permissions-revoked` | `iam.role` / role UUID | `before`: `permissionCodes` (sorted revoked codes) |

These action codes are stable contracts. IAM-MP-09 reuses the two mapping actions for custom roles. On an empty database the first run writes 12 permissions, 1 role and 12 mappings, and appends 14 Audit records (12 + 1 + 1).

### 23.3 Apply order inside the transaction

Permissions (register, update) → system role (create or update) → revoke mappings → grant mappings → version bump → audit appends. The order satisfies foreign keys. Appends may interleave with writes; every one is inside the same transaction.

---

## 24. Operator Command (`apps/api`)

- **Files:** `src/commands/iam-sync-reference.ts` (entry, raw-environment bridge) and `src/commands/iam-sync-reference.command.ts` (`runIamReferenceSync`).
- **ESLint:** `apps/api/eslint.config.mjs` applies the D-13 override to both bridge files. The comment names both.
- **Result log line** (one JSON object):
  - `msg` is `iam reference data synchronized` or `iam reference data synchronization refused`;
  - fields: `traceId`, `outcome`, counts and code lists, or `reason` and `details`;
  - failures: `msg: iam reference data synchronization failed`, `traceId`, and `err` through the safe serializer.
  - The connection string never appears. Configuration errors keep `ConfigurationError`'s existing behavior: variable names only, written to stderr.
- **Usage** (README): `pnpm db:migrate` then `pnpm iam:sync-reference`; both are idempotent and operator-run, and synchronization never runs on API start. IAM-MP-10's bootstrap will require synchronized reference data.

---

## 25. Safe Error Logging (A1-02)

As D-15.

- `createApp` passes `serializers: { err: safeErrorSerializer }` to the Fastify logger; Fastify merges its own request and response serializers.
- The command's logger uses the same serializer.
- Existing log-hygiene tests (`app.spec.ts` "readiness failure logging", `health.integration.spec.ts`) must stay green.

---

## 26. Tooling, Workspace, Lint and Documentation Changes

### 26.1 Workspace

- The existing `domains/*` glob picks up the two new projects.
- `pnpm install` should add importers for `domains/audit` and `domains/audit-persistence` and new `workspace:` links, plus `pino` for `apps/api` at the locked 10.3.1. Any other lockfile change is a stop condition (Section 38).
- `nx sync`, then `nx sync:check`.

### 26.2 ESLint (D-02, D-03, D-13, D-14)

Additive only. Export `restrictedImportSyntax`, `restrictedEnvSyntax` and `restrictedRawSqlSyntax` next to `restrictedImportPatterns`, and compose them as in D-13. Update the tag header comment. No existing constraint is removed or widened; the only other edit is the `main.ts` override, which becomes narrower.

### 26.3 `scripts/check-architecture-boundaries.mjs`

- Update the renamed-entry cases V14, V17 and C1 to `@vertex-os/database/iam`.
- Rename the internal `envRule` label to `syntaxRule`.
- Allow a per-case virtual file name (for V35 and V36).
- Add the Section 33.6 cases.

### 26.4 Documentation

- **`README.md`.**
  - Add `pnpm iam:sync-reference`, what it changes, idempotence, exit codes and order after `pnpm db:migrate`.
  - Update the migrations description to three migrations.
  - Add `domains/audit` and `domains/audit-persistence` to the repository layout.
  - Update "Current limitations": reference data and Audit foundation exist; no authentication, authorization, Audit read path or IAM endpoint.
- **`docs/ENGINEERING.md` Section 15.** Replace "No generic unit-of-work … until a concrete cross-module case requires it" with the concrete mechanism in 3–5 sentences (D-04), keeping the prohibition of generic frameworks and handle leakage.
- **A1-03.** Replace `projects.edit` with `projects.projects.edit` at `docs/modules/iam.md` lines 197, 718 and 732 (Sections 6.4, 16.1, 16.3) and `docs/SECURITY.md` line 434. No other spec text changes.
- **`docs/plans/iam/IAM_MASTER_PLAN.md`.** IAM-MP-02 to `IN_PROGRESS` at M0 and `AUDIT_REQUIRED` at closeout, with evidence and an amendment record. Never `COMPLETE`: that follows the audit and owner acceptance.
- **This plan.** Keep the living sections current.
- **No change** to `docs/ARCHITECTURE.md`, `docs/MODULES.md` or `AGENTS.md`. Create no `docs/modules/audit.md` (Section 40). A genuine contradiction is recorded in Surprises and surfaced.

---

## 27. API, Frontend and Integration Changes

- **API:** no controller, route, provider, module or OpenAPI change. `apps/api` changes are:
  - the logger serializer;
  - the operator command and its Nx target;
  - dependencies;
  - the ESLint override.

  `openapi:generate` output must be unchanged.
- **Frontend:** none.
- **Integrations:** none (no Keycloak, no SMTP, no events).

---

## 28. Failure Handling

| Failure | Required behavior |
|---|---|
| Invalid manifest | `refused / invalid-manifest`; no transaction opened; exit 2 |
| Undeclared persisted code, retired reactivation, system-role conflict | `refused` with reason and codes; transaction commits nothing; exit 2 |
| Audit append rejects (validation bug or database error) | Error propagates; the transaction rolls back **all** changes of the run; exit 1; safe log |
| Any database error during a run | Same: full rollback; exit 1; safe log |
| Advisory-lock wait exceeds the statement or transaction timeout (a concurrent run held it more than 5 s) | Run fails (P2028 or 57014) with full rollback; re-running converges. Documented; not expected (runs take milliseconds) |
| PostgreSQL unreachable | `DatabaseUnavailableError` or connect failure → exit 1; no connection details logged |
| Missing or invalid configuration | `ConfigurationError` on stderr, variable names only; exit 1 |
| Migration failure (either new migration) | All-or-nothing; recovery per IAM-01 Section 16.5 |
| `iam_role_system_code_ck` rejects existing data | Migration fails atomically; the data is never modified or deleted by tooling; the operator resolves it deliberately |
| Transaction handle used after its transaction | `TypeError` from the accessor (registry); Prisma itself rejects with P2028 (P-06) |

Typed outcomes and refusal details carry codes only: no driver text, row values or connection details.

---

## 29. Concurrency Considerations

- **Synchronization runs** are serialized by the transaction-scoped advisory lock (P-05); each run plans from state read after the lock. Proven with truly concurrent runs on one fresh database: exactly one run reports changes, the others converge with no changes, no duplicate Audit records exist, and the final state is correct.
- **No other writer** touches permissions or system-role mappings in IAM-02. IAM-MP-09 must keep system-role mappings unwritable by administrative operations; its custom-role writes may reference permissions that a concurrent synchronization deprecates or retires, which is harmless because retired permissions are never effective (IAM-MP-07). Recorded for IAM-MP-09.
- **Isolation.** `ReadCommitted` plus the lock is sufficient because all writers of the affected rows take the lock. `Serializable` stays available in `runInTransaction` for later stages.
- **Transactions are short:** no remote I/O and a bounded number of statements.
- **Last-System-Administrator and bootstrap serialization** (IAM-MP-09/10) lock the system role row. The synchronization does not change assignments, so no invariant spans both. IAM-MP-10 must refuse bootstrap when the system role is absent.

---

## 30. Observability and Audit Requirements

- Every reference change is audited (Section 23.2). Refusals and failures are logged, not audited (I-7).
- The command logs exactly one result line per run, correlated by `traceId`, which also appears on every Audit record of the run.
- No new code logs row data, emails, SQL, connection strings or driver messages (D-15).
- Adapters log nothing (IAM-01 precedent).

---

## 31. Expected Files and Areas

```text
new       domains/audit/**                                             (Section 19)
new       domains/audit-persistence/**                                 (Section 20)
new       domains/iam/src/{domain/permission-catalog.ts, domain/reference-sync-plan.ts,
          application/ports/{reference-data-store,iam-transaction}.ts,
          application/synchronize-reference-data.ts} + specs
changed   domains/iam/{package.json, src/index.ts, src/persistence.ts}
new       domains/iam-persistence/src/{reference-data-store.ts, iam-transaction-runner.ts} + integration specs
changed   domains/iam-persistence/{eslint.config.mjs, src/index.ts, src/application-user-repository.ts,
          test-support/postgres.ts, existing specs (entry rename, A1-05, A1-07)}
new       packages/database/prisma/schema/audit.prisma
new       packages/database/prisma/migrations/{<ts>_audit_foundation,<ts>_iam_system_role_code}/migration.sql
changed   packages/database/prisma/schema/iam.prisma (/// comment only)
new       packages/database/src/{iam.ts, audit.ts} + specs
removed   packages/database/src/persistence.ts
changed   packages/database/{package.json (exports), src/database-client.ts, src/index.ts,
          src/*.integration.spec.ts}
new       apps/api/src/commands/{iam-sync-reference.ts, iam-sync-reference.command.ts} + specs,
          apps/api/src/logging/safe-error-serializer.ts + spec, apps/api/test-support/** (harness)
changed   apps/api/{package.json, eslint.config.mjs, src/app.factory.ts, tsconfig*.json (nx sync)}
changed   eslint.config.mjs, scripts/check-architecture-boundaries.mjs, package.json (script),
          pnpm-lock.yaml (importers + links only), tsconfig.json (nx sync)
docs      README.md, docs/ENGINEERING.md §15, docs/modules/iam.md (A1-03 examples only),
          docs/SECURITY.md (A1-03 example only), docs/plans/iam/IAM_MASTER_PLAN.md, this plan
```

Any change outside this list is recorded and justified in the Decision Log, or reverted.

---

# Part IV — Execution

## 32. Implementation Workstreams / Milestones

Boundaries and security plumbing come first, so every later file is checked by the rules it must obey.

### M0 — Preflight and baseline freeze

- Record `git status --short`, `git rev-parse HEAD` and `git log -5 --oneline`. Compare with `21f536c`; intervening commits may only be this plan and the Master Plan link.
- Confirm P-01 and `docker info`.
- Run `pnpm openapi:generate` and keep a copy of `apps/api/generated/openapi.json` (ignored by Git) in the scratchpad for the M9 comparison.
- Set IAM-MP-02 to `IN_PROGRESS` in the Master Plan.
- **Stop** if persistence, boundaries or IAM changed since `21f536c`.

### M1 — Database entry points and transaction primitive (D-03, D-04)

- Implement `DatabaseTransaction`, the registry, `runInTransaction`, `iamPersistenceOf`/`auditPersistenceOf` (Audit scope empty until M4) and the `./iam` and `./audit` exports; remove `./persistence`.
- Move the IAM adapter and its test support to `@vertex-os/database/iam` (`create` via `runInTransaction`).
- Update the adapter ESLint negation and boundary cases V14, V17 and C1.
- Apply A1-05 and A1-07.
- **Acceptance:**
  - database and IAM adapter integration suites green (IAM-01 regression: 73 and 10 plus new database tests);
  - `pnpm lint`, `pnpm lint:boundaries` and the three projects' typecheck and build pass;
  - the type-level spec proves the scoping.

### M2 — Audit projects and boundary rules (D-01, D-02, D-13, D-14)

- Create both projects with `export {};` entries; tags; constraints; restricted patterns; syntax-selector composition; the `apps/api` override; adapter configurations; all Section 33.6 cases.
- Run `pnpm install` and `nx sync`.
- **Acceptance:**
  - `pnpm lint` and `pnpm lint:boundaries` pass;
  - `nx show project` shows the tags;
  - `nx graph --file` shows no edge from Audit to IAM and none between adapters.
- **Sanity breaks** (restore each after observing the failure):
  - remove `domain:audit` from `domain:iam`'s allowed list → C4 fails;
  - remove the `TSImportType` selector → V32 fails;
  - revert the `main.ts` override to `off` → V35 fails.

### M3 — Audit core (Section 19)

- Implement the contract and validators; unit tests (Section 33.1).
- **Acceptance:** `nx run @vertex-os/audit:test|typecheck|lint|build`; no framework, Prisma or `pg` import.

### M4 — Audit schema, migration and adapter (Sections 16.1, 17, 20)

- `audit.prisma`, `db:validate`/`db:generate`, the offline-diffed migration with checks and the Section 17.3 checklist, `createAuditRecorder`, and integration tests (Section 33.3).
- **Acceptance:** audit adapter suite passes three consecutive runs with no retry; drift gate exits 0.

### M5 — IAM catalog, planner and use case (Section 21)

- Implement the core pieces and unit tests with an in-memory store fake and a recording `AuditRecorder` fake (Section 33.2).
- **Acceptance:** IAM unit suite green (51 existing plus new); root export per D-17; no Prisma, `pg` or framework import.

### M6 — IAM constraint migration (D-10, D-07)

- The hand-written migration, the `iam.prisma` comment, the constraint test (Section 33.4) and the upgrade-path test (Section 33.5).
- **Acceptance:** database suite green; drift gate exits 0; IAM-01 migration unchanged.

### M7 — IAM adapter store and runner (Section 22)

- Implement and test (Section 33.4), including concurrency and fault injection with a recording or failing recorder.
- **Acceptance:** IAM adapter suite passes three consecutive runs; `dist/index.d.ts` is clean of Prisma and generated types.

### M8 — Safe error logging (D-15, Section 25)

- `describeDatabaseError`, the serializer, wiring and tests (Section 33.7).
- **Acceptance:** API unit and integration suites green, including the existing log-hygiene tests.

### M9 — Operator command (D-16, Section 24)

- Entry, command, Nx target, root script, dependencies, harness and integration tests (Section 33.8).
- Run `pnpm infra:up && pnpm db:migrate && pnpm iam:sync-reference && pnpm iam:sync-reference` against the local `vertexos` project: the second run must report no changes.
- **Acceptance:** command suite green three consecutive times; local runs recorded; `openapi:generate` output unchanged.

### M10 — Documentation (Section 26.4)

- **Acceptance:** README commands exist and work as documented; the ENGINEERING text matches D-04; A1-03 edits are limited to the four example lines.

### M11 — Full verification (Section 34)

- **Acceptance:** every required command passes, or an environmental blocker is proven and recorded without weakening anything.

### M12 — Closeout

- Complete the living sections; set the Master Plan to `AUDIT_REQUIRED` with an evidence summary; produce the Section 45 report.
- Stop. Do not begin IAM-MP-03.

---

## 33. Required Tests

Test names state behavior (TESTING Section 46). No sleeps, no retries, `retry: 0`, no `.only`/`.skip`. Concurrency is proven with competing operations (TESTING Section 16), not sequential simulation.

### 33.1 Audit core unit tests (`domains/audit`)

| Area | Cases |
|---|---|
| Codes | Valid and invalid fixtures for module, action (two or four segments, wrong module prefix, uppercase, non-ASCII, length bounds), target type, process, target ID (UUID and permission code accepted; `@`, uppercase, space and 129 characters rejected), trace ID (UUID and dotted IDs accepted; space and 129 characters rejected) |
| Actor | USER needs a canonical UUID; SYSTEM needs a valid process; mixed or missing fields are rejected |
| Reason | Trims; Arabic accepted; 500 code points accepted, 501 rejected, astral characters counted once; control characters rejected |
| Change | Only `before`/`after`; empty change rejected; field-name grammar; each denylisted name rejected (case-insensitive, for example `apiToken`, `Password`, `sessionId`); value types (nested object rejected, `NaN`/`Infinity` rejected); array and string bounds; the 16 384-byte bound, where the boundary passes and one byte over fails |
| Result | `createAuditEntry` never throws; reasons are stable codes; reasons never contain the input |
| Closed sets | `auditResults` and `auditActorTypes` equal the contract lists, in order |

Fixtures are exported from a test-support module so the database constraint tests (Section 33.3) reuse them for parity.

### 33.2 IAM core unit tests (`domains/iam`)

| Area | Cases |
|---|---|
| Shipped catalog | `iamPermissionManifest` is valid, holds exactly the twelve spec Section 19 codes with the Section 21.1 content, and every code is `ACTIVE`; `systemAdministratorRole` matches spec Section 20 |
| Manifest validation | Duplicate module; duplicate code across manifests; wrong prefix; invalid code, name or description; non-canonical whitespace; unknown state or sensitivity → `invalid-manifest` with code-only details |
| Planner, empty snapshot | Registers all, creates the role, grants exactly the `ACTIVE` set, version 1 |
| Planner, converged | No changes of any kind |
| Planner, evolution | Add a code (register and grant); `ACTIVE → DEPRECATED` (update and revoke); `DEPRECATED → ACTIVE` (update and grant); `ACTIVE → RETIRED`; register a code declared `RETIRED` (not granted); metadata-only change (update, no mapping change, no version bump); drift in role name or description (update and bump); an extra current mapping to a `DEPRECATED` code (revoke and bump) |
| Planner, refusals | Undeclared persisted code; `RETIRED → ACTIVE`; `RETIRED → DEPRECATED`; forged snapshot (reserved code with `isSystem = false`, or two system roles) — each refuses with no changes |
| Use case | Lock before snapshot; one audit entry per change with the exact Section 23.2 action, target and change; actor is always `SYSTEM iam.reference-sync` regardless of input; a converged run appends nothing; an append failure propagates out of `runner.run` |

### 33.3 Audit adapter integration tests (`domains/audit-persistence`, real PostgreSQL)

| Behavior | Cases |
|---|---|
| Round trip | A USER entry and a SYSTEM entry each persist every field; `occurred_at` is database-assigned and falls within the transaction window; an absent `change` is SQL NULL |
| Transaction participation | Inside `runInTransaction`: append then throw → no row; append then commit → row present; two appends in one transaction share `occurred_at` |
| Constraint backstop | Raw SQL violating each Section 16.1 check is rejected with SQLSTATE `23514` and the constraint name (IAM-01 test-only message technique); valid fixtures from Section 33.1 are accepted and invalid ones rejected (parity); JSON `null` `change` rejected; an extra top-level key rejected |
| Catalog | The exact set of constraint names on `audit_record`; no foreign key, no secondary index, no trigger |
| Capability shape | The recorder object exposes exactly `append` |
| Hygiene | A recorder given a foreign or expired handle throws `TypeError` |

### 33.4 IAM adapter integration tests (`domains/iam-persistence`, real PostgreSQL)

| Behavior | Cases |
|---|---|
| Regression | All 73 IAM-01 tests pass on the scoped entry; A1-05 backdated `updated_at`; A1-07 referential actions for all six foreign keys and the one-character module case |
| System role constraint | A custom role with code `system-administrator` is rejected by `iam_role_system_code_ck`; an `is_system` role with another code is rejected; the valid system role is accepted |
| First run | 12 permission rows with the Section 21.1 content; one system role (ACTIVE, `is_system`, version 1); 12 mappings; recorder received 14 entries matching Section 23.2 |
| Idempotence | The second run reports no changes; permission, role and mapping rows are byte-identical (including `updated_at` and `version`); recorder received nothing |
| Evolution against the database | Each Section 33.2 evolution case with a synthetic manifest, asserting rows and the version rule |
| Refusals against the database | An undeclared permission inserted by SQL; retired reactivation → refused; database unchanged; nothing appended |
| Custom roles untouched | A custom role mapped to a code that the run deprecates or retires keeps its mapping and version |
| Atomicity | A recorder that throws on the last append → zero permission, role and mapping rows remain (fresh database); on a converged database, a failing evolution leaves the prior state byte-identical |
| Concurrency | Four concurrent runs on a fresh database → exactly one reports changes; the others report none; final state correct; 14 entries recorded in total |
| Lock | A second run started while a first holds the lock completes only after the first commits, and plans from its result |

### 33.5 Migration tests (`packages/database`, real PostgreSQL)

| Behavior | Cases |
|---|---|
| History | Exactly three migrations, in order, all finished; a second deploy is a no-op; drift gate exits 0 |
| Convention | The existing atomic-wrapper test covers the new files unchanged |
| No reference data | All IAM tables and `audit_record` are empty after migration |
| Upgrade path (D-07) | Deploy only the first migration (temporary config); insert a custom role, a system role with the reserved code, a permission and a mapping; deploy the rest → success, rows intact, constraint present. Separately, with a custom role using the reserved code → the IAM migration fails with P3018, the row is intact, the constraint is absent, the Audit migration applied, and a redeploy refuses with P3009 |
| Private entries | Scoped accessors work on a registered client and inside `runInTransaction`; throw for foreign objects and for expired transaction handles |

### 33.6 Boundary regression cases (`pnpm lint:boundaries`)

Existing V1–V19 and C1–C2 remain. V14, V17 and C1 move to `@vertex-os/database/iam`. New cases:

| # | Virtual file in | Code | Rule |
|---|---|---|---|
| V20 | `domains/audit` | `import '@vertex-os/iam';` | Nx: `domain:audit` |
| V21 | `domains/audit` | `import '@vertex-os/database';` | Nx: `layer:domain` |
| V22 | `domains/audit` | `import '@prisma/client';` | Nx banned import |
| V23 | `domains/audit-persistence` | `import '@vertex-os/iam';` | Nx: `domain:audit` |
| V24 | `domains/audit-persistence` | `import '@vertex-os/iam-persistence';` | Nx (tag or cycle; record which) |
| V25 | `domains/iam-persistence` | `import '@vertex-os/audit-persistence';` | Nx: `layer:adapter` |
| V26 | `domains/iam` | `import '@vertex-os/audit-persistence';` | Nx: `layer:domain` |
| V27 | `domains/iam-persistence` | `import '@vertex-os/database/audit';` | `no-restricted-imports` |
| V28 | `domains/audit-persistence` | `import '@vertex-os/database/iam';` | `no-restricted-imports` |
| V29 | `apps/api` | `import '@vertex-os/database/audit';` | `no-restricted-imports` |
| V30 | `apps/api` | `import '@vertex-os/audit/src/index.js';` | `no-restricted-imports` |
| V31 | `apps/api` | `await import('@vertex-os/database/iam');` | `no-restricted-syntax` (A1-01) |
| V32 | `apps/api` | `type T = import('@vertex-os/iam/persistence').UserId;` | `no-restricted-syntax` (A1-01) |
| V33 | `apps/api` | template-literal `import(\`@vertex-os/iam/persistence\`)` | `no-restricted-syntax` |
| V34 | `apps/api` | `const s = 'x'; await import(s);` | `no-restricted-syntax` |
| V35 | `apps/api`, file `src/main.ts` | `await import('@vertex-os/iam/persistence');` | `no-restricted-syntax` (env exemption keeps import selectors) |
| V36 | `domains/iam-persistence` | `declare const c: any; c.$executeRawUnsafe('x');` | `no-restricted-syntax` (D-14) |
| V37 | `packages/database` | `import '@vertex-os/audit';` | Nx: `layer:infrastructure` |
| V38 | `domains/audit` | `process.env['X'];` | `no-restricted-syntax` |
| V39 | `domains/audit-persistence` | `import '@prisma/client';` | Nx banned import |
| V40 | `apps/web` | `import '@vertex-os/audit';` | Nx: `scope:web` |

Positive controls:

| # | Virtual file in | Code |
|---|---|---|
| C1 | `domains/iam-persistence` | `@vertex-os/iam`, `@vertex-os/iam/persistence`, `@vertex-os/database`, `@vertex-os/database/iam`, `@vertex-os/audit` |
| C2 | `apps/api` | `@vertex-os/iam`, `@vertex-os/iam-persistence`, `@vertex-os/audit`, `@vertex-os/audit-persistence`, `@vertex-os/database`, and `await import('@vertex-os/iam')` |
| C3 | `domains/audit-persistence` | `@vertex-os/audit`, `@vertex-os/database`, `@vertex-os/database/audit` |
| C4 | `domains/iam` | `@vertex-os/audit` |
| C5 | `apps/api`, file `src/commands/iam-sync-reference.ts` | `process.env['DATABASE_URL'];` (bridge exemption) |

A violation case that also yields unrelated messages (for example `no-explicit-any` in V36) still passes if the expected rule message is present. A control fails only on `@nx/enforce-module-boundaries`, `no-restricted-imports` or `no-restricted-syntax` (IAM-01 Section 27.5).

### 33.7 Safe logging tests

| Where | Cases |
|---|---|
| `packages/database` (integration) | `describeDatabaseError` for real P2039 (CHECK, email sentinel in `detail`), P2010 (raw CHECK), P2007 (sentinel in `message`) and P2002: correct `prismaCode`/`sqlState`/`driverKind`/`constraint`/`table`/`model` where present; `JSON.stringify` of the description contains no sentinel; non-database errors → `undefined`; `DatabaseUnavailableError` → reason and SQLSTATE only |
| `apps/api` (unit) | The serializer drops arbitrary enumerable properties (`meta` with a sentinel) of a non-database error; keeps `type`, `message`, `stack`, `code`, `statusCode`; serializes `cause` recursively with a depth bound; never throws on cyclic or non-Error values |
| `apps/api` (unit) | The Fastify logger created by `createApp` applies the serializer: an error with a sentinel `meta`, logged through `app.getHttpAdapter().getInstance().log`, produces a line without the sentinel |

### 33.8 Operator command integration tests (`apps/api`, real PostgreSQL)

| Behavior | Cases |
|---|---|
| First run | Exit 0; result line with `outcome: synchronized`, 12 registered, `systemRole: created`, 12 granted, a UUID `traceId`; the database holds 12 permissions, 1 system role, 12 mappings and 14 Audit records, all with that `trace_id`, actor `SYSTEM iam.reference-sync`, result `SUCCEEDED` |
| Second run | Exit 0; no changes; still 14 Audit records; rows unchanged |
| Cross-adapter atomicity | `auditRecorderFor` wraps the **real** `createAuditRecorder` and throws after the last real append → exit 1; zero permission, role, mapping **and Audit** rows remain; the failure log has no sentinel and no connection string |
| Refusal | An undeclared permission inserted by SQL → exit 2; reason `undeclared-permissions` with the code; nothing else changed; no Audit record |
| A1-02 end to end | A real P2007 error with a sentinel, produced through `createApplicationUserRepository(db).findById(…)` with a non-UUID sentinel cast to the method's parameter type (the API cannot import `UserId`), logged through the command logger and through `createApp`'s logger → neither output contains the sentinel; both contain the description |
| Configuration | Missing `DATABASE_URL` → exit 1; stderr names the variable and echoes no value |
| Trace-ID parity (unit) | `resolveRequestId` outputs (generated and accepted inbound values) all satisfy `parseTraceId` (I-8) |

---

## 34. Verification Commands

On Windows run Nx with `NX_DAEMON=false` when capturing output. In the Bash tool use `export PATH="/c/Program Files/nodejs:$PATH"` and `builtin cd` (repository-state memory). Run in this order and record every command with PASS, FAIL or BLOCKED:

```text
git status --short ; git rev-parse HEAD
pnpm install                       # importers/links only
pnpm nx sync:check
pnpm db:validate
pnpm db:generate
pnpm nx run-many -t test -p @vertex-os/iam @vertex-os/audit @vertex-os/api
pnpm nx run-many -t lint,typecheck,build -p @vertex-os/iam @vertex-os/iam-persistence @vertex-os/audit @vertex-os/audit-persistence @vertex-os/database @vertex-os/api
pnpm lint:boundaries
pnpm nx run @vertex-os/database:test:integration
pnpm nx run @vertex-os/audit-persistence:test:integration     # ×3, flake check
pnpm nx run @vertex-os/iam-persistence:test:integration       # ×3, flake check
pnpm nx run @vertex-os/api:test:integration                   # ×3, flake check
pnpm infra:up && pnpm db:migrate && pnpm iam:sync-reference && pnpm iam:sync-reference   # vertexos only
pnpm openapi:generate              # compare apps/api/generated/openapi.json with the M0 copy: identical
pnpm nx show project @vertex-os/audit --json ; pnpm nx show project @vertex-os/audit-persistence --json
pnpm nx graph --file=.nx/iam-02-graph.json
pnpm verify
NX_SKIP_NX_CACHE=true pnpm verify
pnpm verify:full
pnpm deps:audit
```

If sibling worktrees exist under `.claude/worktrees/`, `pnpm format:check` in the main checkout also scans them. Use `prettier --check . '!.claude/**'`, or the temporary `.prettierignore` exclusion IAM-01 used (restored after each gate), and say so. A check that did not run is reported as not run, never as passed. CI on the implementation commit (if a push is authorized) is the first Linux evidence.

---

## 35. Required Search Gates

| Search | Expected |
|---|---|
| `auditRecord`, `audit_record`, `audit_` in `domains/iam-persistence/src/**` (non-test) and `domains/iam/src/**` | none |
| `iam[A-Z]`, `iam_` in `domains/audit-persistence/src/**` (non-test) and `domains/audit/src/**` | none |
| `@prisma`, `generated/prisma`, `from 'pg'` in `domains/{iam,audit}/**` | none |
| `@prisma`, `from 'pg'` in `domains/{iam,audit}-persistence/src/**` | none |
| `@prisma`, `generated` in the `dist/index.d.ts` of all four domain projects and `packages/database/dist/index.d.ts` | none |
| `@vertex-os/database/persistence` anywhere | none |
| `@vertex-os/database/iam` / `/audit` | only the owning adapter, the boundary script, ESLint configuration and `packages/database` |
| `$transaction(` in `domains/**/src` | none |
| `RawUnsafe` in production `src` | none |
| `update`, `upsert`, `delete` calls on the audit delegate | none |
| `INSERT INTO`, `UPDATE `, `DELETE `, `seed` in `packages/database/prisma/**` | none |
| `CREATE TRIGGER`, `CREATE FUNCTION`, `previewFeatures`, `CONCURRENTLY` | none |
| `process.env` in production `src` outside `main.ts` and `commands/iam-sync-reference.ts` | none |
| `console.log` in new production code | none |
| `@Injectable`, `@Module`, `@Controller` in `domains/**` | none |
| `keycloak`, `oidc`, `csrf`, session-store code in new executable code | none (the permission code string `iam.sessions.revoke` is data, not session code) |
| `.only(`, `.skip(`, `retry:` greater than 0 | none |

---

## 36. Definition of Done

### Audit foundation

- [ ] `@vertex-os/audit` and `@vertex-os/audit-persistence` exist with the D-01 tags, closed surfaces and D-02 boundaries.
- [ ] `audit_record` and its enums exist exactly as in Section 16.1; every check is proven by name and behavior; no foreign key, index, trigger or function.
- [ ] `createAuditEntry` enforces Section 19.2 with parity against the database.
- [ ] `AuditRecorder` has exactly `append`; no update or delete path exists.
- [ ] Appends participate atomically in the caller's transaction (proven across real adapters).

### Reference data

- [ ] The twelve permissions and the system role are code-defined exactly as in Section 21.1 and spec Section 20.
- [ ] The planner and use case implement Section 23 with every refusal.
- [ ] First run, idempotent second run, evolution, custom-role isolation, atomicity and concurrency are proven against PostgreSQL.
- [ ] Every change has exactly its Section 23.2 Audit record; converged runs write nothing.
- [ ] `iam_role_system_code_ck` exists, with constraint and upgrade-path tests.

### Boundaries and security

- [ ] Scoped entries replace `/persistence`; the type-level scoping test compiles as expected.
- [ ] A1-01 selectors, the unsafe-raw ban and all Section 33.6 cases pass; the three M2 sanity breaks were observed failing.
- [ ] A1-02: database errors are logged only as descriptions; real-error tests pass; existing log-hygiene tests pass.
- [ ] A1-03 examples fixed; A1-05 and A1-07 applied.

### Command

- [ ] `pnpm iam:sync-reference` works locally twice (second converged); exit codes as specified; `openapi:generate` output unchanged.

### Verification and documentation

- [ ] Section 34 commands pass (with any local worktree exclusion stated); integration suites pass three consecutive runs; search gates clean; no probe or scratch file remains; only Section 31 changes present.
- [ ] README, ENGINEERING Section 15, Master Plan (`AUDIT_REQUIRED` plus amendment record) and this plan's living sections are synchronized.

### Scope control

- [ ] No IAM-MP-03+ work: no Keycloak, sessions, authentication, authorization context, administration, HTTP IAM endpoints, UI, Audit read path, users or departments.

---

## 37. Exit Criteria (Master Plan IAM-MP-02)

| Master Plan exit criterion | Evidence |
|---|---|
| Repeated synchronization converges without duplication or semantic repurposing | Sections 33.2 and 33.4 (idempotence, concurrency, `RETIRED` terminality, undeclared refusal), 33.8 |
| Administrators cannot invent permission codes through data alone | I-3 refusal (undeclared persisted code) tested in 33.4/33.8; no API or UI; database format checks (IAM-01) |
| The protected system role exists by deterministic repository-defined logic | D-12, Section 23, 33.4 first-run and drift repair; D-10 database constraint |
| IAM has a durable Audit public capability before privileged administration is exposed | D-01, D-04, D-05; Sections 33.3, 33.4 atomicity, 33.8 cross-adapter atomicity |
| No Audit search, reporting, UI, activity feed or unrelated Audit scope | Section 9; search gates; recorder shape test |

| Master Plan audit focus | Addressed in |
|---|---|
| Cross-domain ownership | D-01–D-04, Section 14, V20–V30, type-level test |
| Append-only semantics | D-09, Section 33.3 capability shape, search gates |
| Privilege catalog stability | I-2, I-3, Section 23.1 |
| System-role protection | D-10, Section 23.1 rules 3, 6–9 |
| Idempotence | D-11, Sections 33.2 and 33.4 |
| Absence of speculative Audit scope | Section 9; D-05 (no indexes, no read path) |

---

## 38. Stop Conditions

Stop and report instead of improvising if:

1. commits since `21f536c` (other than this plan and the Master Plan link) changed persistence, boundaries, IAM or `apps/api`;
2. Nx does not attribute `@vertex-os/database/iam|audit` to the database project, or a rule could pass only by widening `layer:domain`, `layer:infrastructure` or `layer:adapter`, or by switching `no-restricted-imports`/`no-restricted-syntax` off anywhere;
3. one Prisma interactive transaction cannot be shared by the two scoped accessors through the handle (D-04). The fallback is **never** IAM writing Audit tables;
4. Audit immutability or any other requirement turns out to need a trigger, function, rule or preview feature;
5. Prisma 7.10 rejects the incremental authoring (P-09), the temporary-config upgrade harness (P-11), or the migrations' wrapper;
6. `pnpm install` would change any dependency version or add a package beyond the importers, workspace links and the locked `pino`;
7. a specification contradiction affects meaning beyond I-1…I-8;
8. an observable environment contains data that `iam_role_system_code_ck` would reject. Do not modify or delete it; report;
9. the safe serializer cannot be wired without changing Fastify's request/response logging or the Problem Details contract.

A normal implementation bug is not a stop condition. Fix it within this plan.

---

## 39. Risk Register

| ID | Risk | Mitigation |
|---|---|---|
| R-01 | The transaction mechanism turns into a hidden generic unit of work | IAM-specific port; handles only in adapters; ENGINEERING Section 15 text; audit focus |
| R-02 | The Audit contract is too narrow or too loose for later stages | Derived field by field from spec Section 35; enums changed only by deliberate migration; IAM-MP-10 re-checks it |
| R-03 | `change` becomes a dumping ground or leaks secrets | Structure and size limits, key denylist, no nested objects, database backstop, review |
| R-04 | Raw SQL crosses domains despite typed scoping (R-06 residual) | Search gates; raw use limited to locks; ADR-0008 and runtime roles in deployment design |
| R-05 | Every new ACTIVE permission is auto-granted to System Administrators | Specified behavior (spec Section 20); every grant audited; manifests are code-reviewed |
| R-06 | Accidental removal or repurposing of a code | Undeclared-code refusal; `RETIRED` terminal; unit and integration tests |
| R-07 | Concurrent operator runs | Advisory lock; four-way concurrency test; rerun converges |
| R-08 | Log redaction hides diagnostics | Description keeps Prisma code, SQLSTATE, kind, constraint, table and model; `traceId` correlation |
| R-09 | Stage too large for one conversation | Size check (Section 2.1); milestone order; stop at a boundary reporting NOT COMPLETE |
| R-10 | The computed-import ban blocks a future legitimate need | Clear message; exception only by reviewed configuration change |
| R-11 | Upgrade-path harness brittleness | Verified in P-11; real CLI; container-target assertion; temporary files removed |
| R-12 | Local environment quirks (sibling worktrees, pnpm resolution, fnm `cd` hook) | Known workarounds (IAM-01 Section 36); state them in the report |
| R-13 | Sensitivity classification disputed | I-5 flagged; no V1 behavior depends on it; changing it is an audited catalog update |
| R-14 | Scope creep into Audit reads or IAM administration | Sections 9, 35 and 36 |

---

## 40. Repository State Required by the Next Plan (IAM-MP-03)

At acceptance the next planner can rely on:

- `@vertex-os/audit` (`AuditRecorder`, `AuditEntry`, `AuditAttribution`, validators) and `createAuditRecorder`;
- the IAM transaction runner pattern for any IAM mutation that needs Audit evidence;
- `@vertex-os/database/iam|audit` scoped entries and `runInTransaction`, with the rule that adapters open transactions and composition roots wire them;
- the synchronized reference data command and its order (`db:migrate` → `iam:sync-reference`);
- the safe log serializer, which every new composition in `apps/api` must use;
- the operator-command pattern in `apps/api` (typed configuration, second raw-environment bridge) for IAM-MP-10's bootstrap.

Open items passed on:

- **API statement-timeout sizing** — the first stage composing IAM into the HTTP request path (IAM-MP-05/06/07).
- **Keycloak Admin errors** can contain emails in messages. IAM-MP-04 must translate them to safe categories before logging (spec Section 36); the generic serializer path logs messages of non-database errors.
- **Whether `DEPRECATED` permissions are effective** for custom roles, and whether custom roles may keep or receive mappings to `DEPRECATED`/`RETIRED` codes — IAM-MP-07/09.
- **Custom-role version semantics** for mapping replacement, aligned with I-6 or explicitly different — IAM-MP-09.
- **System-role mappings must stay unwritable** by administrative operations — IAM-MP-09.
- **Bootstrap must refuse** when reference data is not synchronized — IAM-MP-10.
- **Security events** (sign-in denials and similar): Audit records with `REFUSED`/`FAILED`, structured security logs, or both — IAM-MP-05/06, spec Section 34.
- **Database-level Audit immutability and runtime/migration role separation; schema per domain (ADR-0008)** — production deployment design, or a third domain adapter, whichever comes first.
- **`docs/modules/audit.md`** — when MOD-AUDIT is fully specified, it adopts or deliberately migrates the foundation contract (D-05, Section 19).
- **A shared test-support package** — decide when a fourth harness copy would be needed.
- **Primary-membership switch ordering** (IAM-MP-08); **A-02, A-04** (IAM-MP-03/06).

---

# Part V — Living Sections

## 41. Decision Log

Planning decisions D-01…D-17 and interpretations I-1…I-8 are in Sections 11 and 12 and are locked. Record here only decisions taken during execution (choices the plan left open, or deviations forced by a stop condition). Use the format: Date / Decision / Why / Evidence / Consequences / Revisit trigger.

- *(none yet)*

---

## 42. Surprises & Discoveries

Record every observation that differs from this plan or that a later reader needs. Use the format: Observed / Evidence / Impact / Action. Record in particular:

- how Nx reports V24 (tag or cycle);
- the Prisma error classes `describeDatabaseError` had to recognize;
- the exact lockfile delta;
- any advisory-lock or transaction-timeout behavior different from P-05/P-06.

- *(none yet)*

---

## 43. Progress

- [ ] M0 Preflight and baseline freeze
- [ ] M1 Database entry points and transaction primitive
- [ ] M2 Audit projects and boundary rules
- [ ] M3 Audit core
- [ ] M4 Audit schema, migration and adapter
- [ ] M5 IAM catalog, planner and use case
- [ ] M6 IAM constraint migration
- [ ] M7 IAM adapter store and runner
- [ ] M8 Safe error logging
- [ ] M9 Operator command
- [ ] M10 Documentation
- [ ] M11 Full verification
- [ ] M12 Closeout

---

## 44. Outcomes & Retrospective

*(Completed at closeout: what was delivered, the verification actually run with results, deviations and remaining risks.)*

---

## 45. Required Final Execution Report

The implementing agent's final response contains:

1. **Executive result.** Exactly `IAM-02 COMPLETE — READY FOR INDEPENDENT AUDIT` or `IAM-02 NOT COMPLETE` (with the last completed milestone).
2. **Baseline.** Starting commit, ending working-tree state, any difference from `21f536c`.
3. **Files and areas changed**, grouped by purpose and matched against Section 31.
4. **Audit foundation.** Projects, table, checks by name, migration names, recorder surface.
5. **Reference data.** Catalog, system role, first-run and converged-run evidence, refusals, concurrency and atomicity results.
6. **Boundaries and security.** Tags, constraints, scoped entries, `lint:boundaries` results, A1-01/A1-02/A1-03/A1-05/A1-07 status.
7. **Explicit scope confirmation.** No IAM-MP-03+ work; HTTP runtime unchanged apart from the log serializer.
8. **Verification.** Every command: PASS, FAIL or BLOCKED. "Not run" is never "pass".
9. **Deviations and discoveries.**
10. **Remaining blockers**, concrete ones only.
11. **Exact next step:**

```text
Perform an independent read-only audit of IAM-02 against docs/modules/iam.md,
IAM_MASTER_PLAN.md (IAM-MP-02), this plan, and the resulting repository state.
Do not begin IAM-MP-03 during that audit.
```

Then stop.

---

## 46. Independent Audit Gate

A separate conversation performs a read-only audit. It does not rely on the implementation report. It MUST at least:

- re-run Section 34 (at least `pnpm verify:full`, the uncached `pnpm verify`, `pnpm deps:audit`, `pnpm lint:boundaries` and the three new or changed integration suites);
- review both new migrations line by line against Sections 16 and 17.3, and confirm the IAM-01 migration is unchanged;
- re-derive the `audit_record` and `iam_role` constraint catalogs from a freshly migrated database;
- run its own probes beyond Section 33.6:
  - dynamic and type-query imports from other projects;
  - typed access to `auditRecord` from the IAM adapter (expect a compile error);
  - raw SQL across domains (confirm the search gate would catch it);
- run `pnpm iam:sync-reference` twice on a fresh database, compare row and Audit counts, and inspect a sample Audit record for personal data;
- trigger a real database error through the composed command and confirm no row data or raw input reaches the log;
- confirm that D-03/D-04 do not leak transaction handles or Prisma types into any domain core or public declaration;
- rule on interpretations I-1…I-8 (specifically I-1, I-3 and I-5);
- confirm that no Section 9 scope slipped in.

The verdict is exactly one of:

```text
IAM-02 ACCEPTED
```

or

```text
IAM-02 REJECTED — FIXES REQUIRED
```

Only `IAM-02 ACCEPTED`, followed by the owner's baseline acceptance, marks IAM-MP-02 `COMPLETE` and unlocks the IAM-MP-03 plan.

---

## 47. Plan Quality and Completion Rules

- Describe observed reality, not intention. Do not mark completion because files exist.
- Add no abstraction without a current consumer: one Audit operation, one IAM transaction port, one synchronization use case.
- Prefer a database constraint over a comment, a type error over a convention, a test over a probe, and a named rule over an implicit one.
- Never weaken an existing rule or test to get green checks. Never disable a rule wholesale.
- Keep the plan self-contained for IAM-02. Link to canonical sources instead of copying them.

This plan becomes `COMPLETE` only when every Definition of Done item holds, the evidence is recorded, the probes are removed, canonical documentation agrees with executable reality, and the implementing agent has issued `IAM-02 COMPLETE — READY FOR INDEPENDENT AUDIT`. The next action is then an independent audit, not IAM-MP-03.
