# Vertex OS — IAM-02 Reference Data & Minimal Audit Foundation Plan

**Repository path:** `docs/plans/iam/IAM_02_REFERENCE_DATA_AND_AUDIT_FOUNDATION_PLAN.md`  
**Master Plan item:** `IAM-MP-02` — Permission/System-Role Reference Data & Minimal Audit Foundation  
**Status:** AUDIT_REQUIRED — written 2026-09-23 from the accepted IAM-01 baseline and accepted by the owner the same day (Section 12.1); implemented 2026-09-23 on `9e9e464` (uncommitted); independent audit returned `IAM-02 ACCEPTED` (Section 46A); owner baseline acceptance pending  
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

- [x] The Audit generated section equals a fresh `migrate diff --from-schema <pre-change copy> --to-schema prisma/schema --script` output.
- [x] Every name in Section 16 appears exactly as written; none exceeds 63 bytes.
- [x] Each file has exactly one `BEGIN;` and one `COMMIT;`, and no `CONCURRENTLY`, `CREATE SCHEMA`, `DROP`, `TRUNCATE`, `DELETE`, `INSERT`, `UPDATE`, `CREATE TRIGGER` or `CREATE FUNCTION`.
- [x] No reference rows.
- [x] The drift gate passes after both migrations.
- [x] The IAM-01 migration file is byte-for-byte unchanged (forward-only).

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

- [x] `@vertex-os/audit` and `@vertex-os/audit-persistence` exist with the D-01 tags, closed surfaces and D-02 boundaries.
- [x] `audit_record` and its enums exist exactly as in Section 16.1; every check is proven by name and behavior; no foreign key, index, trigger or function.
- [x] `createAuditEntry` enforces Section 19.2 with parity against the database.
- [x] `AuditRecorder` has exactly `append`; no update or delete path exists.
- [x] Appends participate atomically in the caller's transaction (proven across real adapters).

### Reference data

- [x] The twelve permissions and the system role are code-defined exactly as in Section 21.1 and spec Section 20.
- [x] The planner and use case implement Section 23 with every refusal.
- [x] First run, idempotent second run, evolution, custom-role isolation, atomicity and concurrency are proven against PostgreSQL.
- [x] Every change has exactly its Section 23.2 Audit record; converged runs write nothing.
- [x] `iam_role_system_code_ck` exists, with constraint and upgrade-path tests.

### Boundaries and security

- [x] Scoped entries replace `/persistence`; the type-level scoping test compiles as expected.
- [x] A1-01 selectors, the unsafe-raw ban and all Section 33.6 cases pass; the three M2 sanity breaks were observed failing.
- [x] A1-02: database errors are logged only as descriptions; real-error tests pass; existing log-hygiene tests pass.
- [x] A1-03 examples fixed; A1-05 and A1-07 applied.

### Command

- [x] `pnpm iam:sync-reference` works locally twice (second converged); exit codes as specified; `openapi:generate` output unchanged.

### Verification and documentation

- [x] Section 34 commands pass (with any local worktree exclusion stated); integration suites pass three consecutive runs; search gates clean; no probe or scratch file remains; only Section 31 changes present (additional test-infrastructure and `nx sync` paths justified in the Decision Log).
- [x] README, ENGINEERING Section 15, Master Plan (`AUDIT_REQUIRED` plus amendment record) and this plan's living sections are synchronized.

### Scope control

- [x] No IAM-MP-03+ work: no Keycloak, sessions, authentication, authorization context, administration, HTTP IAM endpoints, UI, Audit read path, users or departments.

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

- **2026-09-23 / V17 keeps its IAM-01 content / Why:** Section 26.3 and M1 list V17 among the "renamed-entry" cases, but V17 is `packages/database` → `@vertex-os/iam/persistence` and never referenced `@vertex-os/database/persistence`; a `packages/database` self-import of `/iam` would test nothing meaningful. Only V14 and C1 referenced the removed entry. / **Evidence:** IAM-01 Section 27.5 table; `scripts/check-architecture-boundaries.mjs` at `9e9e464`. / **Consequences:** V14 → `import '@vertex-os/database/iam'` and C1's fourth import → `@vertex-os/database/iam`; V17 unchanged and still passes. / **Revisit trigger:** none.
- **2026-09-23 / Shared scope helper and transaction registry live in `packages/database/src/database-client.ts` / Why:** D-03's `Pick<…>` type is identical for both domains, so one generic `DomainScopedClient<Prefix>` (not exported from the root) avoids two copies; the transaction registry must share the module with the client registry. `prismaClientOf(handle)` (not exported from the root) resolves an open transaction first, then a registered client; a `WeakSet` of issued handles gives an ended transaction its own `TypeError` message. / **Evidence:** `packages/database/src/{database-client,iam,audit}.ts`; `dist/index.d.ts` exports only `createDatabaseClient`, `DatabaseUnavailableError` and the types `DatabaseClient`, `DatabaseClientOptions`, `DatabaseTransaction`. / **Consequences:** scoping is a type-level guarantee plus lint (as D-03 states); the object returned at runtime is Prisma's own client, not a proxy. / **Revisit trigger:** a third domain adapter or ADR-0008.
- **2026-09-23 / Database test support and an extra spec file / Why:** the migration, transaction, error-description and upgrade-path suites all need "start PostgreSQL 18.6, run the real Prisma CLI against that container only"; one helper keeps the container-target assertion in one place. / **Evidence:** new `packages/database/test-support/postgres.ts`; `packages/database/tsconfig.spec.json` includes `test-support/**/*.ts`; `packages/database/eslint.config.mjs` adds `{projectRoot}/test-support/**/*.ts` to `@nx/dependency-checks` `ignoredFiles` (the first `pnpm lint` failed with `@testcontainers/postgresql` "missing from dependencies" until then, exactly as the IAM adapter's configuration already handles it). Transaction-primitive tests are in the new sibling `src/transactions.integration.spec.ts`; the compile-time scoping assertions are in `src/scoped-clients.types.spec.ts` (typechecked, never executed: the database project has no unit-test target). / **Consequences:** three test-infrastructure files outside Section 31's list (`test-support/postgres.ts`, `tsconfig.spec.json`, `eslint.config.mjs` of `packages/database`). The IAM-01 test "keeps the Prisma client behind a registered DatabaseClient handle" moved into the transaction spec's foreign-handle cases. / **Revisit trigger:** a shared test-support package (Section 40).
- **2026-09-23 / `@vertex-os/audit-persistence` declares its dependencies when its code first uses them (M4), not at M2 / Why:** with `export {};` entries, `@nx/dependency-checks` rejects `@vertex-os/audit` and `@vertex-os/database` as declared-but-unused, so M2's `pnpm lint` acceptance could not pass with them declared. / **Evidence:** first M2 `pnpm lint`: two `@nx/dependency-checks` errors ("package is not used by @vertex-os/audit-persistence"); after removing them `pnpm lint` passes. / **Consequences:** the M2 lockfile importer is `domains/audit-persistence: {}`; M4 adds the two `workspace:` links. / **Revisit trigger:** none.
- **2026-09-23 / Audit core details the plan left open / Why:** Section 19.2 fixes the rules; the core also (a) rejects an empty `before`/`after` side (stricter than "at least one field overall", so evidence never carries an empty object; the database backstop still only checks structure), (b) checks the D-08 denylist before the field-name grammar so `Password` reports `sensitive-change-field`, (c) adds `invalid-entry` (input is not an object) and `invalid-source-module`/`invalid-result` to the reason codes, and (d) returns deeply frozen copies. `parseSystemProcess` reports `invalid-process`; inside `createAuditEntry` an invalid process is `invalid-actor`. / **Evidence:** `domains/audit/src/*.ts`, 111 unit tests. / **Consequences:** none on the database contract. / **Revisit trigger:** `docs/modules/audit.md`.
- **2026-09-23 / `occurred_at` defaults to `transaction_timestamp()` instead of the literal spelling `CURRENT_TIMESTAMP` / Why:** Section 16.1 requires a database-assigned transaction-start timestamp that callers never write. PostgreSQL defines `transaction_timestamp()` as equivalent to `CURRENT_TIMESTAMP`. The literal spelling cannot satisfy both D-05 and the IAM-01 drift gate in Prisma 7.10: with `@default(now())` the Prisma client computes and sends the timestamp itself, and with `@default(dbgenerated("CURRENT_TIMESTAMP"))` Prisma introspects the database default as `now()` and reports perpetual drift. `@default(dbgenerated("transaction_timestamp()"))` is omitted from inserts (database-assigned) and introspects verbatim (no drift). / **Evidence:** throwaway container `iam02-impl-probe-pg` (removed): with `dbgenerated("CURRENT_TIMESTAMP")` the drift diff was `ALTER TABLE "audit_record" ALTER COLUMN "occurred_at" SET DEFAULT CURRENT_TIMESTAMP;`; with `@default(now())` the drift gate passed but the adapter test "the database assigns occurred_at … shared by its appends" failed (the two appends 20 ms apart differed); with `transaction_timestamp()` both pass. / **Consequences:** same semantics as Section 16.1; the default-catalog test asserts `transaction_timestamp()`; the schema comment explains why. / **Revisit trigger:** a Prisma release that leaves `now()` defaults to the database.
- **2026-09-23 / `AuditChange` is a type alias / Why:** interface types have no implicit index signature, so the contract type was not assignable to Prisma's JSON input type under `exactOptionalPropertyTypes`; a type alias with the same members is. / **Evidence:** first `@vertex-os/audit-persistence:typecheck` failed with TS2375; passes after the change. / **Consequences:** no behavior change; no cast in the adapter. / **Revisit trigger:** none.
- **2026-09-23 / Server-side `pg_sleep` in two tests / Why:** the transaction-timeout test and the "database assigns `occurred_at`" test need a measurable interval inside one transaction; a server-side statement provides it deterministically. No test waits for an asynchronous condition by sleeping; concurrency tests synchronize with promises and locks only. / **Evidence:** `packages/database/src/transactions.integration.spec.ts`, `domains/audit-persistence/src/audit-recorder.integration.spec.ts`. / **Consequences:** about 1.5 s of suite time. / **Revisit trigger:** a flaky run of either test.
- **2026-09-23 / Reference-synchronization details the plan left open / Why:** Sections 21.3–21.5 leave the port method set, the detail-token vocabulary and some result semantics to the implementer. Choices: (a) `ReferenceDataStore` = `acquireSynchronizationLock`, `readSnapshot`, `registerPermissions`, `updatePermission` (changed fields only), `createSystemRole`, `updateSystemRole`, `grantSystemRolePermissions`, `revokeSystemRolePermissions`, `incrementSystemRoleVersion(expectedVersion)`: one method per plan change kind, no upsert; (b) manifest detail tokens are `invalid-module:manifest-<i>`, `duplicate-module:<module>`, `invalid-code:<module>#<i>`, `wrong-module:<code>`, `duplicate-code:<code>`, `invalid-name:<code>`, `non-canonical-name:<code>`, `invalid-description:<code>`, `non-canonical-description:<code>`, `invalid-state:<code>`, `invalid-sensitivity:<code>`: a malformed value is identified by position, never echoed; (c) `system-role-conflict` also covers an `INACTIVE` system role (unreachable through `iam_role_system_active_ck`; refusing keeps the planner total, like rule 3) and its details are the conflicting role codes; (d) `changes.systemRole` is `updated` exactly when an existing role's version is bumped (name, description or mapping set changed); (e) Audit entries are appended right after each change, in the Section 23.3 order; the version bump has no Audit action of its own (Section 23.2 lists none). / **Evidence:** `domains/iam/src/**`, 35 new unit tests. / **Consequences:** IAM-MP-09 can reuse the mapping actions and the version rule. / **Revisit trigger:** IAM-MP-09.
- **2026-09-23 / Serialized database errors carry a fixed `message` and an empty `stack` / Why:** D-15 describes the database branch as `{ type, database }`, but Fastify 5 types the `err` serializer's result as `{ type: string; message: string; stack: string; … }`; satisfying it without a type cast means always emitting both strings. A database error's own message and stack are never used (the stack begins with the message, which carries row data or raw input). / **Evidence:** first `@vertex-os/api:typecheck` failed with TS2322 on `serializers.err`; it passes with the uniform shape. / **Consequences:** every logged `err` has `type`, `message` and `stack`; for database errors they are `DATABASE_ERROR_MESSAGE` and `''` plus `database`. / **Revisit trigger:** none.
- **2026-09-23 / Operator-command details / Why:** D-16 leaves the log format and wiring details open. Choices: the result line is `info` (synchronized), `warn` (refused) or `error` (failed), carries `command: "iam:sync-reference"`, `traceId`, `outcome`, `counts` and the full sorted `changes` lists (or `reason` and `details`); `createCommandLogger` is exported so the A1-02 test can log a real database error through the command's own logger; `pino` is pinned exactly (`10.3.1`) so installation cannot resolve a different version; the API's `test:integration` depends on its own `build` because two tests run the built entry as a process. / **Evidence:** `apps/api/src/commands/*`, `apps/api/package.json`. / **Consequences:** `@vertex-os/api:test:integration` builds the API first. / **Revisit trigger:** IAM-MP-10's bootstrap command reuses the pattern.
- **2026-09-23 / Files outside Section 31, each required by the plan's own work / Why:** a closeout comparison of `git status` against Section 31 found these additional paths: `domains/iam/tsconfig.lib.json` and `domains/iam-persistence/tsconfig.lib.json` (project references written by `nx sync` for the new `@vertex-os/audit` dependencies); `domains/iam-persistence/package.json` (the adapter's `AuditRecorder` type needs `@vertex-os/audit`, D-04); `domains/iam-persistence/src/enum-mapping.ts` (entry rename to `@vertex-os/database/iam` in M1, and permission/role enum maps for the store); `domains/iam/test-support/reference-data-fakes.ts` (the in-memory store and recording recorder Section 33.2 asks for); `apps/api/src/http/request-id.spec.ts` (the I-8 trace-ID parity unit test of Section 33.8); plus the `packages/database` test infrastructure already recorded above. / **Evidence:** `git status --short` at closeout. / **Consequences:** no production behavior outside the planned areas; no unrelated file changed. / **Revisit trigger:** none.
- **2026-09-23 / Boundary-check message fragments / Why:** `no-restricted-syntax` now carries several selector families, so every syntax case asserts a fragment of the expected selector's message (private subpath, computed import, raw environment, unsafe raw SQL), and V18/V19 gained the raw-environment fragment. The script prints the observed message for cases without a fragment. / **Evidence:** `scripts/check-architecture-boundaries.mjs`. / **Consequences:** a case can no longer pass because an unrelated selector of the same rule fired. / **Revisit trigger:** none.

---

## 42. Surprises & Discoveries

Record every observation that differs from this plan or that a later reader needs. Use the format: Observed / Evidence / Impact / Action. Record in particular:

- how Nx reports V24 (tag or cycle);
- the Prisma error classes `describeDatabaseError` had to recognize;
- the exact lockfile delta;
- any advisory-lock or transaction-timeout behavior different from P-05/P-06.

- **Observed (transaction timeout vs. a running statement):** Prisma's interactive-transaction `timeout` does **not** interrupt a statement that is already running. A transaction with `timeoutMs: 300` blocked in `pg_advisory_xact_lock` on a lock held by another open transaction did not fail at 300 ms; it failed after 5 029 ms with **P2010** (the 5 s `statement_timeout` cancelling the lock wait). A server-side statement that finishes after the bound (`pg_sleep(1.5)` with `timeoutMs: 250`) makes the transaction fail with **P2028** and keeps none of its writes. **Evidence:** first `@vertex-os/database:test:integration` run on 2026-09-23 (the lock-wait variant of the timeout test failed with `code: 'P2010'` after 5 029 ms); the redesigned test passes. **Impact:** consistent with Section 28 ("P2028 or 57014"): a synchronization run waiting on the advisory lock is bounded by the statement timeout (5 s in the command, D-16), not by the transaction timeout. P-06 ("longer than 5 000 ms raises P2028") holds for time spent between or after statements. **Action:** the timeout test uses one bounded server-side statement instead of a lock wait; no production change.
- **Observed (tooling):** Windows Python's text mode wrote CRLF into files edited by a script during M1 (Git warned "CRLF will be replaced by LF"). **Evidence:** `file` reported CRLF terminators; they were converted back to LF immediately and every changed file was re-checked with a byte scan for carriage returns. **Impact:** none on the delivered tree. **Action:** scripted edits now preserve LF (`newline=''`).
- **Observed (record-keeping):** the completion times first written for M1–M10 were not read from the clock and ran ahead of real time (M10 was entered as 06:25 UTC; `date -u` at the start of M11 read 04:36 UTC). **Evidence:** file modification times (e.g. `transactions.integration.spec.ts` 03:41, `domains/audit/package.json` 03:47, the two migration folders 03:57 and 04:13, `safe-error-serializer.ts` 04:26, `README.md` 04:35) and the command's own log timestamps (local runs 04:33:16 and 04:33:23 UTC). **Impact:** none on results; only the recorded times were wrong. **Action:** M1–M10 now show "≈" times reconstructed from that evidence; M0 and M11 onwards use `date -u`.
- **Observed (V24):** Nx rejects `domains/audit-persistence` → `@vertex-os/iam-persistence` with the tag diagnostic `A project tagged with "layer:adapter" can only depend on libs tagged with "layer:domain", "layer:infrastructure", "layer:shared"`, not with a cycle (unlike IAM-01's V5/V7): no path leads from the IAM adapter back to the Audit adapter. **Evidence:** first M2 `pnpm lint:boundaries` run. **Impact:** none; both `layer:adapter` and `domain:audit` forbid the edge, and Nx reports the first. **Action:** V24 asserts the `layer:adapter` fragment.
- **Observed (Prisma `now()` defaults are client-side):** in Prisma 7.10 with the driver adapter, a field declared `@default(now())` is filled by the Prisma client on `create`, not by the database default, although the migration also declares `DEFAULT CURRENT_TIMESTAMP`; and a database default spelled `CURRENT_TIMESTAMP` is introspected as `now()`. **Evidence:** M4 probe and test results recorded in the Decision Log (`transaction_timestamp()` entry). **Impact:** a "database-assigned" timestamp needs `dbgenerated(…)` with a spelling Prisma does not normalize. It also means IAM's `created_at`/`updated_at` values written through Prisma come from the application clock (IAM-01 D-07 already writes them explicitly); nothing in IAM-02 depends on that. **Action:** `audit_record.occurred_at` uses `transaction_timestamp()`; recorded for later stages that rely on database time.
- **Observed (CHECK violation codes):** a CHECK violation raised through a typed Prisma write (`auditRecord.create`) is `P2039` with SQLSTATE `23514` in `meta.driverAdapterError.cause`; through `$executeRaw*` it is `P2010` (P-02 confirmed). PostgreSQL evaluates a table's CHECK constraints in name order, so an invalid module repeated in the action trips `audit_record_action_ck` before `audit_record_source_module_ck`. **Evidence:** Audit adapter suite. **Impact:** the parity test accepts either named check for invalid modules and isolates `audit_record_source_module_ck` with the two length bounds. **Action:** none.
- **Observed (failed wrapped migration output):** when `iam_role_system_code_ck` rejects existing data, `prisma migrate deploy` exits 1 and prints `Error: ERROR: current transaction is aborted, commands ignored until end of transaction block` with `migration_name="20260923041312_iam_system_role_code"`, but no `P3018` label; `_prisma_migrations` holds the attempt with `finished_at` NULL, and the next deploy prints `Error: P3009`. Planning text (Section 33.5) and the IAM-01 README say "fails with P3018". **Evidence:** throwaway container `iam02-impl-probe-pg2` (removed) and the upgrade-path test. **Impact:** operators see the secondary error, as IAM-01 D-09 anticipated ("accepted cost"); the recovery procedure is unchanged. **Action:** the test asserts the observed output; the README wording is corrected in M10 to describe what the CLI prints.
- **Observed (V20 after the IAM → Audit edge):** once `domains/iam` really imports `@vertex-os/audit` (M5), Nx reports V20 (`domains/audit` → `@vertex-os/iam`) as `Circular dependency between "@vertex-os/audit" and "@vertex-os/iam"` before evaluating the `domain:audit` tag, exactly as IAM-01 recorded for V5/V7. **Evidence:** `pnpm lint:boundaries` during M7: V20 FAIL with the cycle message, every other case PASS. **Impact:** the reverse edge is still rejected by the intended rule; the `domain:audit` tag constraint remains exercised directly by V23 (`domains/audit-persistence` → `@vertex-os/iam`, reported by the tag). **Action:** V20 asserts the cycle diagnostic (commented in the script); no constraint changed.
- **Observed (Prisma error classes and shapes for `describeDatabaseError`):** with Prisma 7.10 and `@prisma/adapter-pg`, every query-time database failure surfaced as `PrismaClientKnownRequestError` (P2039 typed CHECK, P2010 raw, P2007 invalid input, P2002 unique, P1001 unreachable), with `meta.driverAdapterError.cause` = `{ originalCode, originalMessage, kind, … }`. CHECK failures add `code`, `severity`, `message` and `detail` (the whole failing row, email included) and `kind: 'postgres'`, with no structured constraint name; P2007's `originalMessage`/`message` contain the raw input; P2002 adds `constraint: { index }` and `table`; P1001's cause carries `host` and `port`. Wrong call arguments raise `PrismaClientValidationError` (keys `name`, `clientVersion`), whose message prints the invocation. Unknown-request, initialization and panic errors were not observed but are recognized. **Evidence:** a temporary probe spec (deleted) and the durable `database-errors.integration.spec.ts`. **Impact:** the description reads only `code`, `cause.originalCode`/`cause.code`, `cause.kind`, `cause.constraint.index`, `cause.table` and `meta.modelName`, each shape-checked. **Action:** none further.
- **Observed (exit code through Nx):** the command process exits 2 on a refusal (`node dist/commands/iam-sync-reference.js` → 2), but `pnpm iam:sync-reference` (Nx `run-commands`) exits 1 for any non-zero exit of the command. **Evidence:** local `vertexos` probe with a temporary undeclared permission (inserted, observed, deleted; the next run converged with all counts 0 and the Audit count stayed 14). **Impact:** through the root script, "refused" and "failed" are distinguished by the result line (`outcome`, `msg`, level 40 vs 50), not by the exit code. **Action:** README documents both; the command's own exit codes are as D-16 specifies and are tested directly.
- **Observed (Testcontainers default credentials):** the default `test` password appears as a substring of stack-trace paths (`vitest`), so "no connection details in the log" cannot be asserted against it. **Evidence:** first run of the cross-adapter atomicity test. **Impact:** test-only. **Action:** the API harness starts its container with `sentinel_user` / `sentinel_password_7c1e` / `sentinel_db` and asserts that no output contains `sentinel`, the host:port or a `postgres(ql)://` URL.

---

## 43. Progress

- [x] M0 Preflight and baseline freeze — 2026-09-23 03:34 UTC. `git status --short` empty; HEAD `9e9e464a9d17eb0a10d200b88ed415040b93130a`; last five `9e9e464`, `21f536c`, `3cc9cd4`, `5056c9f`, `effd95c`. `git diff --stat 21f536c..HEAD` touches only this plan and `IAM_MASTER_PLAN.md` (no persistence, boundary, IAM or `apps/api` change; stop condition 1 not met). P-01 holds: one migration (`20260923013708_iam_persistence_foundation`), IAM root export `export {};`, no Audit code/table/spec (search of `domains`, `packages/database`, `apps/api/src` finds none); `gh run list` shows CI 35811565312 (`21f536c`) and 35814312867 (`9e9e464`) `success`. Node 24.21.0, `pnpm --version` 12.5.1 (no `corepack` needed). `docker info`: Docker Desktop server 29.2.1; the `vertexos` compose project is not running. `pnpm openapi:generate` ran (not cached, 37.9 s); copy saved to the session scratchpad as `openapi.m0.json` (SHA-256 `0bf3e7a1…84d717`). Master Plan IAM-MP-02 set to `IN_PROGRESS`.
- [x] M1 Database entry points and transaction primitive — 2026-09-23 ≈03:46 UTC. `DatabaseTransaction` (opaque, frozen, type-only root export), `runInTransaction` (ReadCommitted default, explicit 5 000 ms timeout / 2 000 ms max wait) and `iamPersistenceOf`/`auditPersistenceOf`, exported only from `./iam` and `./audit`; `./persistence` and `src/persistence.ts` removed. IAM adapter and its test support moved to `@vertex-os/database/iam`; `create` uses `runInTransaction`; the adapter negation is exactly `!@vertex-os/database/iam`; V14 and C1 updated (V17 unchanged, Decision Log). A1-05 (backdated `updated_at`) and A1-07 (all six FKs `confdeltype`/`confupdtype` = `r`, not deferrable; one-character module rejected by `iam_permission_owning_module_ck`) applied. Evidence: `nx run-many -t typecheck,build` for database, IAM and adapter PASS; `pnpm lint` PASS (7 projects); `pnpm lint:boundaries` PASS (V1–V19, C1–C2); `@vertex-os/database:test:integration` PASS 17/17 (client 4, migrations 5, new transaction spec 8: one shared transaction client for both scopes, commit, rollback rethrowing the same error, ended and rolled-back handles rejected, foreign handles and nesting rejected, ReadCommitted/Serializable, timeout → P2028 with no writes); `@vertex-os/iam-persistence:test:integration` PASS 74/74 (73 IAM-01 + 1 A1-07 case). `scoped-clients.types.spec.ts` compiles under `typecheck` (its `@ts-expect-error` lines prove `iam.auditRecord`, `audit.iamRole`, `$transaction`, `$connect`, `$disconnect` and `$extends` do not compile). An ESLint-API probe confirmed Nx attributes `@vertex-os/database/iam` and `/audit` to the database project (`layer:domain` and `layer:ui` reject both), so stop condition 2 is not met. `packages/database/dist/index.d.ts` contains no Prisma reference.
- [x] M2 Audit projects and boundary rules — 2026-09-23 ≈03:52 UTC. `domains/audit` (`@vertex-os/audit`) and `domains/audit-persistence` (`@vertex-os/audit-persistence`) created with `export {};` entries; `nx show project` reports tags `type:lib, scope:backend, layer:domain, domain:audit` and `type:lib, scope:backend, layer:adapter, domain:audit`. Root ESLint: `domain:audit` constraint added, `domain:iam` += `domain:audit`, restricted patterns += the four Audit patterns, `restrictedImportSyntax` / `restrictedEnvSyntax` / `restrictedRawSqlSyntax` exported and composed per D-13 (all files: import selectors; production `src`: all three; `apps/api` `src/main.ts` and `src/commands/iam-sync-reference.ts`: import + raw SQL, no longer `off`). Audit adapter configuration negates exactly `!@vertex-os/database/audit`. `pnpm install`: lockfile delta is only the two importers (`domains/audit: {}`, `domains/audit-persistence: {}`), no version change; `nx sync` added both projects to the root `tsconfig.json`; `nx sync:check` PASS. `pnpm lint` PASS (9 projects). `pnpm lint:boundaries` PASS 45/45: V1–V40 and C1–C5; V24 is reported by the `layer:adapter` tag rule (not a cycle) and its expected fragment is pinned to that. `nx graph --file=.nx/iam-02-graph.json`: workspace edges are only `api → database`, `iam-persistence → database, iam`, `web → ui`, `web-e2e → web, api` (no Audit → IAM edge, no adapter-to-adapter edge). Sanity breaks, each restored byte-for-byte (SHA-256 compared): removing `domain:audit` from `domain:iam`'s list → C4 FAIL (and C1, which also imports `@vertex-os/audit`); removing the `TSImportType` selector → V32 FAIL; reverting the `main.ts` override to `off` → V35 FAIL. The selector regular expressions spell `/` as `/` so esquery's regex-literal parser never meets a slash inside the pattern.
- [x] M3 Audit core — 2026-09-23 ≈03:57 UTC. `domains/audit/src/{codes,change,audit-entry,audit-recorder,result,text}.ts`: branded codes and validators (module, action, target type/ID, system process, user ID, trace ID, reason), change validation (only `before`/`after`, non-empty sides of ≤32 fields, field-name grammar and D-08 denylist checked case-insensitively before the grammar, bounded values, ≤16 384 UTF-8 bytes), `createAuditEntry` returning a frozen copy or a stable reason code, `userActor`, the closed sets, and `AuditRecorder` with the single `append`. Shared fixtures in `domains/audit/test-support/validation-fixtures.{json,ts}` (boundary lengths generated and checked by script). Evidence: `nx run-many -t test,typecheck,lint,build -p @vertex-os/audit` PASS; 111 unit tests; `dist/index.d.ts` exports only the contract; the source imports nothing outside the project (no framework, Prisma or `pg`).
- [x] M4 Audit schema, migration and adapter — 2026-09-23 ≈04:07 UTC. `prisma/schema/audit.prisma` (enums `AuditActorType`/`audit_actor_type`, `AuditResult`/`audit_result`, model `AuditRecord`/`audit_record` with the Section 16.1 columns; `///` comment lists the ten checks); migration `20260923035742_audit_foundation` = header + `BEGIN;` + the generated section + ten hand-written checks + `COMMIT;`. `createAuditRecorder(handle)` in `domains/audit-persistence` (explicit exhaustive enum maps, `select: { id: true }`, never writes `occurred_at`, omits absent `change`/`reason`, no logging, errors propagate; frozen object with only `append`; handle resolved at creation and on every append). Section 17.3 checklist (script over the file): the generated section is byte-identical to a fresh `prisma migrate diff --from-schema <pre-change copy> --to-schema prisma/schema --script`; one `BEGIN;`, one `COMMIT;`; no `CONCURRENTLY`, `CREATE SCHEMA`, `DROP`, `TRUNCATE`, `DELETE`, `INSERT`, `UPDATE`, `ROLLBACK`, `REFERENCES`, index, trigger or function statement; longest name 29 bytes; no reference rows; IAM-01 migration SHA-256 `4fb4977e…2db394` unchanged. Evidence: `pnpm db:validate` and `pnpm db:generate` PASS; `@vertex-os/database:test:integration` PASS 17/17 (drift gate exits 0; history now asserts the exact ordered list; `audit_record` empty after migration); `@vertex-os/audit-persistence:test:integration` PASS 99/99 three consecutive times (8.29 s, 8.06 s, 7.93 s) plus two earlier full passes: round trip of USER and SYSTEM entries, SQL NULL for absent change/reason, `occurred_at` = transaction start shared by two appends 20 ms apart, rollback/commit participation, a database rejection (P2039, 23514) failing the caller transaction, capability shape, foreign/ended handles → `TypeError`, every check by SQLSTATE 23514 and name with fixture parity (all core fixtures, including C1 control characters, behave identically in PostgreSQL), exact constraint/index/enum/default catalog, no foreign key, trigger or function. `nx run-many -t lint,typecheck,build` for database, audit, audit-persistence and iam-persistence PASS. The Audit adapter's lockfile importer now carries the two `workspace:` links. `occurred_at` uses `DEFAULT transaction_timestamp()` (Decision Log, Surprises).
- [x] M5 IAM catalog, planner and use case — 2026-09-23 ≈04:12 UTC. `domain/permission-catalog.ts` (deep-frozen `iamPermissionManifest` with the Section 21.1 content, `systemAdministratorRole`), `domain/reference-sync-plan.ts` (`validatePermissionManifests` with code/position-only detail tokens; pure `planReferenceSync` implementing Section 23.1 rules 1–10), `application/ports/{reference-data-store,iam-transaction}.ts`, `application/synchronize-reference-data.ts` (validate → one `runner.run`: lock, snapshot, plan, apply in the Section 23.3 order with one `createAuditEntry` + `append` per change; fixed actor `SYSTEM iam.reference-sync`). `@vertex-os/audit` added to `domains/iam` dependencies (lockfile: importer link only; `nx sync` added the tsconfig reference). Root export per D-17 (`synchronizeIamReferenceData`, `iamPermissionManifest`, types `PermissionManifest`, `PermissionDefinition`, `PermissionCode`, `ReferenceSyncResult`, `ReferenceSyncRefusalReason`); ports, snapshot and change types on the private `/persistence` entry. Evidence: `nx run-many -t test,lint,build,typecheck -p @vertex-os/iam` PASS; 86 unit tests (51 IAM-01 + 35 new: shipped catalog and role, manifest validation incl. no free text in details, planner first/converged/evolution/refusal cases, use-case call order, exact Section 23.2 entries, 14 entries on first run, converged run appends nothing, fixed actor and trace ID, invalid manifest opens no transaction, refusal writes nothing, append failure propagates). The IAM source imports only `@vertex-os/audit` besides its own files.
- [x] M6 IAM constraint migration — 2026-09-23 ≈04:17 UTC. Migration `20260923041312_iam_system_role_code` (hand-written only: `ALTER TABLE "iam_role" ADD CONSTRAINT "iam_role_system_code_ck" CHECK (is_system = (code = 'system-administrator'));` inside one `BEGIN;`/`COMMIT;`); `prisma migrate diff --from-schema <pre-change copy> --to-schema prisma/schema --script` → `-- This is an empty migration.` (only the `///` comment on `IamRole` changed). Checklist script: one `BEGIN;`/`COMMIT;`, no forbidden statement, name 23 bytes. IAM-01 migration SHA-256 unchanged. Evidence: `@vertex-os/database:test:integration` PASS 19/19 (history = exactly the three migrations in order; drift gate exits 0; new `migration-upgrade.integration.spec.ts`: an IAM-01-only database (temporary `.mjs` Prisma config in the OS temp directory pointing at a copy of the IAM-01 migration; URL only in the environment) with a custom role, the reserved-code system role, a permission and a mapping upgrades with the real CLI: rows intact, constraint present, three finished migrations; with a custom role holding the reserved code the deploy exits 1 naming `20260923041312_iam_system_role_code`, the constraint is absent, the row is intact, the Audit migration is applied, the failed attempt is recorded (`finished_at` NULL) and a redeploy refuses with `P3009`; temp files removed). `@vertex-os/iam-persistence:test:integration` PASS 75/75 (new case: reserved code as custom role and `is_system` with another code both rejected by `iam_role_system_code_ck`, the valid system role accepted; the inactive-system-role case now uses the reserved code so it isolates `iam_role_system_active_ck`; catalog includes the new name).
- [x] M7 IAM adapter store and runner — 2026-09-23 ≈04:23 UTC. `domains/iam-persistence/src/reference-data-store.ts` (explicit `select`s, exhaustive enum maps, set-based `createMany`/`deleteMany` for mapping deltas, count-checked `updateMany` for permission and role changes, the version bump as one conditional `updateMany` on `{ id, version, isSystem }` that throws on zero rows, the lock as a tagged `$executeRaw` with `IAM_REFERENCE_SYNC_LOCK_KEY = -4098619809192145812n`) and `iam-transaction-runner.ts` (`createIamTransactionRunner(database, { auditRecorderFor })`: one `ReadCommitted` `runInTransaction` per `run`, frozen scope of IAM store + recorder bound to the same handle). `index.ts` exports `createApplicationUserRepository`, `createIamTransactionRunner` (and the options type); `@vertex-os/audit` added to the adapter's dependencies (lockfile: importer link only). `dist/index.d.ts` of all four domain projects and the database contain no `prisma`/`generated` reference. Evidence: `@vertex-os/iam-persistence:test:integration` PASS 84/84 three consecutive times (11.75 s, 10.57 s, 10.96 s): new `reference-sync.integration.spec.ts` covers the first run (12 rows with the Section 21.1 content, one ACTIVE `is_system` role at version 1, 12 mappings, 14 entries in Section 23.2 order and shape), a byte-identical second run (row JSON incl. timestamps and version) with no entry, the evolution sequence against the database (add, ACTIVE↔DEPRECATED, →RETIRED, RETIRED registration without grant, metadata-only without bump, name/description drift repair, extra DEPRECATED mapping revoked; versions 1→8 exactly once per changing run), both refusals leaving the database byte-identical with no entry, custom role and its mappings untouched, atomicity (last append fails on a fresh database → nothing; on a converged database → byte-identical), four truly concurrent first runs (exactly one creates, three converge, 14 entries in total, correct final state), and the lock (a second run is observed waiting on the advisory lock in `pg_stat_activity`, completes after the first commits and plans no change). `nx run-many -t lint,typecheck,build` for the five backend libraries PASS; `pnpm lint:boundaries` PASS 45/45 after the V20 update (Surprises).
- [x] M8 Safe error logging — 2026-09-23 ≈04:28 UTC. `describeDatabaseError` (database root export, Prisma-free signature, type `DatabaseErrorDescription`) recognizes `DatabaseUnavailableError` and Prisma's known-request, unknown-request, validation, initialization and panic errors and returns only `errorClass`, `prismaCode`, `sqlState`, `driverKind`, `constraint`, `table`, `model` (and `reason` for `DatabaseUnavailableError`), each matched against a strict shape. `apps/api/src/logging/safe-error-serializer.ts` serializes every `err`: database errors → `{ type, message: <fixed text>, stack: '', database }`; other errors → `type`, `message`, `stack`, safe `code`, integer `statusCode`, `cause` chain to depth 3; nothing else; never throws. Wired as `serializers: { err }` in `createApp` (Fastify keeps its `req`/`res` serializers; child/request loggers and `PinoLoggerService` inherit it). Evidence: `@vertex-os/database:test:integration` PASS 27/27 (new `database-errors.integration.spec.ts` with real P2039 and P2010 whose raw errors contain the email sentinel, P2007 whose raw error contains the input sentinel, P2002 with constraint and table, a validation error, P1001 against an unreachable server, `DatabaseUnavailableError`, and non-database values → `undefined`; no description contains a sentinel, host or password); `@vertex-os/api` typecheck, lint and unit tests PASS (27, incl. 6 new serializer/logger cases: arbitrary enumerable properties dropped, code/statusCode kept, cause depth bound, database cause described, cyclic and hostile non-Error values never throw, the Fastify logger and a child logger emit no sentinel); `@vertex-os/api:test:integration` PASS 3/3; the existing log-hygiene tests (`app.spec.ts` readiness failure logging, `health.integration.spec.ts`) pass unchanged.
- [x] M9 Operator command — 2026-09-23 ≈04:35 UTC. `apps/api/src/commands/iam-sync-reference.ts` (raw-environment bridge: `loadAppConfig(process.env)`, sets `process.exitCode`; configuration errors name variables only, on stderr) and `iam-sync-reference.command.ts` (`runIamReferenceSync(config, options)`: own `DatabaseClient` with 5 000 ms connect/statement bounds, `createIamTransactionRunner(database, { auditRecorderFor: createAuditRecorder })`, UUID trace ID, one result line through `createCommandLogger` = pino with the safe `err` serializer, disconnect in `finally`; exit 0/2/1). Nx target `@vertex-os/api:iam-sync-reference` (`dependsOn: ["build"]`, `cache: false`), root script `iam:sync-reference`, `apps/api` dependencies `@vertex-os/{iam,iam-persistence,audit,audit-persistence}` (`workspace:*`) and `pino` `10.3.1`; the API's `test:integration` now also depends on its own `build` (the tests run the built entry). Lockfile delta for the whole stage: `importers:` hunks only (workspace links for the two new projects, IAM → Audit, IAM adapter → Audit, the API's four links and `pino: 10.3.1`, already locked); no `packages:`/`snapshots:` change. Harness `apps/api/test-support/postgres.ts` (migrated container with distinctive `sentinel_*` credentials; SQL through `psql` inside the container, since the API may not import the scoped Prisma entries). Evidence: `@vertex-os/api` typecheck, lint, build and unit tests PASS (29, incl. the I-8 trace-ID parity test); `@vertex-os/api:test:integration` PASS 10/10 three consecutive times (12.05 s, 11.47 s, 11.47 s): first run (exit 0, one result line, 12/1/12 rows and 14 Audit records with the run's trace ID, `SYSTEM iam.reference-sync`, `SUCCEEDED`), second run (exit 0, no change, identical rows, still 14), cross-adapter atomicity with the **real** `createAuditRecorder` failing after the 14th real append (exit 1, zero IAM and Audit rows, error line without connection details), refusal (exit 2, `undeclared-permissions` with the code, nothing changed or recorded), A1-02 end to end (a real P2007 carrying a sentinel, logged through the command logger and `createApp`'s logger: no sentinel, no connection details, description present), the built entry as a process (exit 0, exactly one stdout JSON line, empty stderr) and configuration errors (missing/invalid `DATABASE_URL` → exit 1, variable named, value never echoed). Local `vertexos` run: before migrating, the local database held only the IAM-01 migration and no role (no data `iam_role_system_code_ck` would reject; stop condition 8 not met); `pnpm infra:up` → `pnpm db:migrate` (applied the two new migrations) → `pnpm iam:sync-reference` (exit 0: 12 registered, role created, 12 granted) → `pnpm iam:sync-reference` (exit 0: all counts 0, `systemRole: unchanged`); database then held 12 permissions, `system-administrator` v1, 12 mappings, 14 Audit records with one trace ID, and the new constraint; neither output contained a connection string. `pnpm openapi:generate` output is byte-identical to the M0 copy (SHA-256 `0bf3e7a1…84d717`). `pnpm infra:down` afterwards (volume kept).
- [x] M10 Documentation — 2026-09-23 ≈04:36 UTC. `README.md`: intro names the reference data and the MOD-AUDIT foundation; first-time setup and the database command list include `pnpm iam:sync-reference` after `pnpm db:migrate`; the three migrations are described; the failure paragraph now states what the CLI prints (P3018 or `current transaction is aborted` naming the migration; then P3009) and how `iam_role_system_code_ck` fails on conflicting data; a new paragraph documents the command (explicit, never on start, one serialized transaction, what it changes, 14 Audit records on the first run and none on a converged run, refusals, one JSON result line with `traceId`, exit codes 0/2/1 and their normalization to 1 through `pnpm`/Nx); `lint:boundaries` row says V1–V40, C1–C5; layout adds both Audit projects; "Current limitations" updated. `npx prettier --check README.md` PASS. `docs/ENGINEERING.md` Section 15: the "no generic unit-of-work … until a concrete cross-module case requires it" sentence is replaced by the D-04 mechanism in four sentences, keeping the prohibitions (generic framework, ambient transactions, handles in public surfaces/domain code). A1-03: `projects.edit` → `projects.projects.edit` at `docs/modules/iam.md` Sections 6.4, 16.1 and 16.3 and `docs/SECURITY.md` (the four example lines only; `git diff` shows exactly those four changed lines). No change to `docs/ARCHITECTURE.md`, `docs/MODULES.md` or `AGENTS.md`; no `docs/modules/audit.md`. All touched documents keep LF endings (byte scan).
- [x] M11 Full verification — 2026-09-23 04:36–05:06 UTC (`date -u`). Section 34 in order, all **PASS**: `git status --short` (65 entries, all IAM-02) / `git rev-parse HEAD` `9e9e464…`; `pnpm install` "Already up to date", lockfile byte-identical afterwards; `pnpm nx sync:check`; `pnpm db:validate`; `pnpm db:generate`; `nx run-many -t test` for iam/audit/api with `--skip-nx-cache` (86/111/29 tests); `nx run-many -t lint,typecheck,build` for the six projects; `pnpm lint:boundaries` 45/45 (V1–V40, C1–C5), and the three sanity breaks re-run on the final tree (C4 and C1 FAIL without `domain:audit`; V32 FAIL without the `TSImportType` selector; V35 FAIL with the `main.ts` override `off`), each restored byte-for-byte (SHA-256) and 45/45 again; `@vertex-os/database:test:integration` 27/27; `@vertex-os/audit-persistence:test:integration` 99/99 ×3 (7.91 s, 8.09 s, 8.12 s); `@vertex-os/iam-persistence:test:integration` 84/84 ×3 (11.71 s, 11.43 s, 10.16 s); `@vertex-os/api:test:integration` 10/10 ×3 (11.75 s, 11.55 s, 11.53 s); `pnpm infra:up && pnpm db:migrate && pnpm iam:sync-reference && pnpm iam:sync-reference` on `vertexos` (exit 0; "No pending migrations"; both runs converged with all counts 0 because M9 had already synchronized that database; Audit count stayed 14; no connection string in the output; `pnpm infra:down` afterwards); `NX_SKIP_NX_CACHE=true pnpm openapi:generate` byte-identical to the M0 copy; `nx show project` for both Audit projects (tags as D-01); `nx graph --file=.nx/iam-02-graph.json` (edges: api → audit, audit-persistence, database, iam, iam-persistence; audit-persistence → audit, database; iam → audit; iam-persistence → audit, database, iam; web → ui; web-e2e → api, web; no Audit → IAM edge, no adapter-to-adapter edge); `pnpm verify` (05:00, exit 0); `NX_SKIP_NX_CACHE=true pnpm verify` (05:00–05:02, exit 0, every Nx task "Cache: Skipped"); `pnpm verify:full` (05:02–05:05, exit 0: all integration suites, Playwright 130/130 with no flaky test); `pnpm deps:audit` (exit 0; the 4 previously reviewed exceptions, 1 moderate and 3 high, none new). **Worktree exclusion (stated exactly):** two sibling worktrees exist under `.claude/worktrees/`, so for each of the three root gates (`verify`, uncached `verify`, `verify:full`) the line `.claude/worktrees/` (with a comment) was appended to `.prettierignore` and the original bytes were restored immediately afterwards (SHA-256 `391aeb8c…32a70` checked after each gate; `git status` shows `.prettierignore` unchanged); `npx prettier --check . '!.claude/**'` also PASS without touching the file. Section 35 search gates: see Outcomes; no stray probe file and no `iam02-*` container remains. Environment: Windows 11, Node 24.21.0, pnpm 12.5.1, Docker Desktop 29.2.1, `NX_DAEMON=false`, `CI` unset.
- [x] M12 Closeout — 2026-09-23 05:06 UTC. Living sections completed (Decision Log, Surprises, Progress, Outcomes & Retrospective); Sections 17.3 and 36 ticked from the recorded evidence; plan status `AUDIT_REQUIRED`; Master Plan IAM-MP-02 set to `AUDIT_REQUIRED` with an evidence summary and an amendment record. No commit, push, branch or remote change; no IAM-MP-03 work.

---

## 44. Outcomes & Retrospective

**Delivered (uncommitted, on `main` at `9e9e464`, awaiting the independent audit).**

- **MOD-AUDIT foundation.** `@vertex-os/audit` (`domains/audit`, tags `type:lib`, `scope:backend`, `layer:domain`, `domain:audit`; closed public root: entry/attribution contract, validators, `AuditRecorder` with the single `append`) and `@vertex-os/audit-persistence` (`layer:adapter`, `domain:audit`; root exports only `createAuditRecorder`). Table `audit_record` with enums `audit_actor_type` and `audit_result`, database-assigned `occurred_at` (`transaction_timestamp()`), the ten Section 16.1 checks by name, no foreign key, secondary index, trigger or function; migration `20260923035742_audit_foundation`.
- **Per-domain database access and the first cross-module transaction (D-03, D-04).** `@vertex-os/database/iam` and `/audit` replace `/persistence`; scoped client types by model prefix without `$transaction`/`$connect`/`$disconnect`/`$extends` (compile-time proof); opaque `DatabaseTransaction` (root, type only) and `runInTransaction` (scoped entries only); `IamTransactionRunner` + composition-root `auditRecorderFor`; ENGINEERING Section 15 documents the mechanism.
- **IAM reference data.** The twelve spec Section 19 permissions (Section 21.1 content) and the `system-administrator` role in code; manifest validation; a pure planner with the four refusals; the use case applying exactly the planned changes with one Section 23.2 Audit record per change; `ReferenceDataStore` and the runner in the IAM adapter (advisory lock `-4098619809192145812`); migration `20260923041312_iam_system_role_code` (`iam_role_system_code_ck`) with an upgrade-path test.
- **Operator command.** `pnpm iam:sync-reference` (`apps/api/src/commands/*`): exit 0/2/1, one JSON result line with `traceId`, safe logger, never on API start.
- **Security items.** A1-01 closed (`restrictedImportSyntax` for dynamic imports, template/computed specifiers and type queries; D-13 composition; `main.ts`/command override no longer `off`); D-14 unsafe-raw-SQL ban; A1-02 closed (`describeDatabaseError` allowlist + API/command `err` serializer, proven with real P2039/P2010/P2007/P2002/P1001 errors and end to end); A1-03 (four example lines), A1-05 and A1-07 applied. `lint:boundaries` now V1–V40, C1–C5.

**Verification actually run** (Section 43 M11 has the details): `git status`/`rev-parse` PASS; `pnpm install` PASS (no change); `nx sync:check` PASS; `db:validate`, `db:generate` PASS; unit tests PASS (IAM 86, Audit 111, API 29); six-project lint/typecheck/build PASS; `lint:boundaries` PASS 45/45 plus the three sanity breaks observed failing and restored; database integration PASS 27/27; Audit adapter 99/99, IAM adapter 84/84 and API command suite 10/10, each three consecutive times; local `vertexos` `infra:up` → `db:migrate` → `iam:sync-reference` ×2 PASS (M9: first run created everything, second converged; M11: both converged); OpenAPI byte-identical to the M0 copy; project tags and graph PASS; `pnpm verify` PASS; `NX_SKIP_NX_CACHE=true pnpm verify` PASS; `pnpm verify:full` PASS (Playwright 130/130, no flaky test); `pnpm deps:audit` PASS (4 previously reviewed exceptions). The three root gates used the temporary `.claude/worktrees/` line in `.prettierignore`, restored byte-for-byte after each run; `prettier --check . '!.claude/**'` PASS. CI has not run on this tree (nothing is committed or pushed).

**Section 35 search gates** (interpreted): no `audit_*`/`auditRecord` access in IAM source (the only hits are the D-04 factory name `auditRecorderFor`); no `iam*` access in Audit source; no `@prisma`/`pg` in the cores or adapter source; no Prisma/generated reference in any `dist/index.d.ts`; `@vertex-os/database/persistence` only in historical plan text; the scoped entries are imported only by their owning adapter (source, tests, harness, ESLint configuration) and the boundary script; no `$transaction(` in `domains/**/src`; the only `RawUnsafe` in production source is the scoped type's method-name union; no update/upsert/delete on the audit delegate; the only `UPDATE `/`DELETE ` matches in `packages/database/prisma/**` are the unchanged IAM-01 referential actions `ON DELETE RESTRICT ON UPDATE RESTRICT`; no trigger, function, preview feature or `CONCURRENTLY` outside a test assertion; `process.env` only in the two bridges (plus a comment in `app-config.ts`); no `console.log`; no Nest decorator in `domains/**`; Keycloak/session matches are the pre-existing ban list, the D-08 denylist fragment `sessionid` and catalog text; no `.only`/`.skip`, every Vitest `retry` is 0.

**Deviations and discoveries** (Decision Log and Surprises): `occurred_at` spelled `transaction_timestamp()` because Prisma fills `now()` on the client and normalizes `CURRENT_TIMESTAMP`; Prisma's transaction timeout does not interrupt a running statement (the statement timeout bounds lock waits); a failed wrapped migration prints `current transaction is aborted` rather than a `P3018` label, and the README now says so; V20 is reported as a cycle once IAM depends on Audit; serialized database errors carry a fixed `message` and empty `stack` to satisfy Fastify's types; `pnpm`/Nx turn the command's exit 2 into 1; V17 kept its IAM-01 content; test-infrastructure files outside Section 31 are listed; the M1–M10 times in Progress were corrected from file and log timestamps.

**Remaining risks and open items** (none blocks this stage): R-04 raw SQL can still name another domain's table (search gates; ADR-0008/runtime roles later); database-level Audit immutability and runtime/migration role separation remain deployment-design items (D-09); API statement-timeout sizing is still open for the first stage that composes IAM into the HTTP path; IAM's `created_at`/`updated_at` written through Prisma use the application clock (observation only); the server-side `pg_sleep` in two tests is a potential flake source if the machine is extremely loaded (none observed in 3+ runs); CI (Linux) is the first evidence outside this Windows machine. The Section 40 hand-offs to IAM-MP-03 onwards stand unchanged.

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

## 46A. Independent Audit Record — 2026-09-23

### Basis

Separate conversation, read-only for implementation; the implementation report and this plan's living sections were treated as claims, not evidence. The audit reviewed the uncommitted IAM-02 tree on `main` at `9e9e464a9d17eb0a10d200b88ed415040b93130a` (65 `git status` entries: 36 modified, 1 deleted, 28 untracked paths; `git diff --stat 9e9e464`: 37 files, +812/−203; `git worktree list`: the main checkout plus the two sibling worktrees under `.claude/worktrees/`). Read first: `AGENTS.md`, `CLAUDE.md`, `docs/PLANNING.md`, this whole plan, `IAM_MASTER_PLAN.md` (Sections 7, 10 IAM-MP-02/03, 12, 15, 19), `docs/modules/iam.md` Sections 9.4–9.6, 18–21, 28–30, 34–36, 44, 48–50, 53, `docs/MODULES.md` (MR-001…MR-015, MOD-AUDIT, Section 16), `docs/ARCHITECTURE.md` AR-001…AR-024 and Section 26, `docs/ENGINEERING.md` Sections 4.3, 13–15, 25, 26, 32, `docs/SECURITY.md` Sections 16, 26–29, `docs/TESTING.md` Sections 12–17, 32–34, and `IAM_01_PERSISTENCE_FOUNDATION_PLAN.md` Section 40A (format model). Every changed and new file was read completely, tests included. Environment: Windows 11, Node 24.21.0, pnpm 12.5.1 (no corepack needed), Docker 29.2.1, `NX_DAEMON=false`, `CI` unset. All probes used ESLint `lintText` on virtual files, the session scratch directory, and one auditor container (`iam02-audit-pg-a7`, `postgres:18.6-alpine`, loopback port 55491, removed afterwards). No other container, compose project or the developer database was touched. Two repository files (`packages/database/src/scoped-clients.types.spec.ts` and `packages/database/src/database-client.ts`) were changed temporarily for type-level breaks and restored byte-for-byte (SHA-256 verified), and `.prettierignore` was extended temporarily for the `pnpm verify:full` run and restored byte-for-byte (Verification). At the end `git status` shows exactly the implementation changes plus this record and the Master Plan edits.

### Verdict

```text
IAM-02 ACCEPTED
```

No blocking finding exists, and no implementation fix was required or made. Every Section 36 Definition of Done item and every Master Plan IAM-MP-02 exit criterion was re-verified from repository evidence and the auditor's own runs. The Section 13 invariants hold for every path the IAM-02 runtime can reach. A2-01 records a latent logging gap in the HTTP runtime that no IAM-02 code can reach and that must be closed before IAM or Audit persistence enters the HTTP runtime. A2-02 and A2-03 record narrow lint residuals that need deliberate obfuscation. All non-blocking items are carried forward in the Master Plan. This audit changed only this plan and `IAM_MASTER_PLAN.md`. The Master Plan's stale "next executable stage" header and Section 19 were corrected (A2-04). IAM-MP-02 stays `AUDIT_REQUIRED` until the owner accepts the baseline.

### Findings

| ID | Severity | Blocks IAM-02 | Evidence | Impact | Recommended fix / owner |
|---|---|---|---|---|---|
| A2-01 | Major (forward; not reachable in IAM-02) | No | `apps/api/src/logging/pino-logger.service.ts` (`write`): when Nest passes an `Error`, the line is written as `logger[level]({ …, err: message }, message.message)`, and for `error(message, stack)` the raw stack string goes to a top-level `stack` field. Only `err` passes through `safeErrorSerializer`. Auditor probe (`createApp` with a capture stream; real errors from a fresh PostgreSQL 18.6): `new Logger('AuditProbe').error(error)` and `.error(error.message, error.stack)` put the P2007 raw input (`sentinel-input-4d2a`), the `PrismaClientValidationError` call arguments (an email) and the P1001 `host:port` into `msg`/`stack`. The same errors through the command logger and the Fastify logger (`app.getHttpAdapter().getInstance().log`) produce only the allowlisted description. D-15 item 3 and Progress M8 state that the `createApp` wiring "covers … `PinoLoggerService`". That is true for its `err` field only. | Not reachable today. The HTTP runtime issues a single statement (the readiness `ping()`), which converts every driver failure into `DatabaseUnavailableError` with a fixed, safe message. No IAM or Audit persistence is composed into the HTTP runtime (D-16, Section 27). Once a query path joins the HTTP runtime, any database error that reaches Nest's `Logger` would log row data or raw input (`docs/SECURITY.md` Section 27, spec Section 36). The IAM-01 A1-02 obligation for this stage (the first composition into `apps/api`, here the command) is met and proven. `apps/api/src/main.ts` also writes a raw `error.stack` to stderr on startup failure. That is pre-existing, and startup issues no query. | Before any IAM or Audit persistence (or any query beyond `ping`) enters the HTTP runtime: make `PinoLoggerService` log `Error` values with `safeErrorSerializer(error).message` as `msg`, decide deliberately how `error(message, stack)` string pairs from Nest are logged (for example, drop the raw stack or keep it only for non-database failures), review `main.ts`'s startup `stack` output, and add a test that logs real P2007 and validation errors through Nest's `Logger` with a sentinel. Owner: the first stage composing IAM into the HTTP request path (IAM-MP-05/06/07), with the carried API statement-timeout item. |
| A2-02 | Minor | No | Auditor probes P50, P51 and P54 in `apps/api`: ``await import(`${'@vertex-os'}/database/iam`)``, ``await import(`@vertex-${'os'}/database/iam`)`` and `createRequire(import.meta.url)('@vertex-os/database/iam')` produce no boundary message. D-13 selector 3 exempts every `TemplateLiteral`, and selector 2 matches only templates whose first quasi starts with `@vertex-os/`. Every other dynamic, template, computed and type-query form probed is rejected (P01–P16, P44, P48, P52, P53). No such code exists: the only template dynamic import is the V33 case string, and the only `createRequire` is `apps/web-e2e/src/visual/browser.setup.ts` (resolving a Playwright `package.json`). | Invariant 13.9 holds for every non-obfuscated form. An interpolated module specifier, or `createRequire` of a workspace subpath, would reach a private entry without a lint error. That needs deliberate circumvention, which lint cannot exclude in general (inline `eslint-disable` exists too). | Add `ImportExpression > TemplateLiteral.source[expressions.length>0]` to `restrictedImportSyntax`. The auditor validated it with ESLint: it rejects both interpolated forms and a relative interpolated import, and accepts `import('@vertex-os/iam')`. Optionally forbid `createRequire` in backend production `src` (`no-restricted-imports` `importNames` on `node:module`/`module`, not in `apps/web-e2e`). Add `lint:boundaries` cases for all three. Owner: IAM-MP-03, the next stage that changes boundary configuration (A-04). |
| A2-03 | Minor | No | Auditor probes P41, Q1 and Q3: `c['$executeRawUnsafe']('x')`, `c['$queryRawUnsafe']('x')` and `const { $queryRawUnsafe } = c` in adapter production `src` produce no message. `restrictedRawSqlSyntax` matches only `MemberExpression[property.name=…]`, while `restrictedEnvSyntax` already covers the bracket form through `property.value`. `c?.$queryRawUnsafe(…)` is rejected (Q2). No production source uses unsafe raw SQL: the only `RawUnsafe` in production `src` is the `RawSqlMethods` union type in `packages/database/src/database-client.ts`. | D-14's ban, the mitigation for keeping the unsafe methods in the scoped type (D-03), can be bypassed by bracket or destructuring syntax. It is not reachable by accident in current code. | Add `MemberExpression[property.value='$queryRawUnsafe']`, `MemberExpression[property.value='$executeRawUnsafe']` and a `Property[key.name=/^\$(query\|execute)RawUnsafe$/]` selector for destructuring. The auditor validated the bracket selectors: they reject F6 and leave tagged `$queryRaw`/`$executeRaw` accepted (F7, F8). Add `lint:boundaries` cases. A stronger alternative is to drop the unsafe methods from the production scoped types and expose them through a test-only entry, which makes the ban a compile error. Owner: IAM-MP-03 (with A2-02). |
| A2-04 | Minor (documentation; corrected in this audit) | No | `IAM_MASTER_PLAN.md` line 12 ("Next executable stage: `IAM-MP-02` — `READY` … awaits implementation") and Section 19 ("The next step is to implement it …") still described the pre-implementation state, while the IAM-MP-02 section, the ledger and the amendment record said `AUDIT_REQUIRED`. | The Master Plan contradicted itself about the current stage. | Corrected by the auditor: factual status text only, with no stage or decision change (the same edit the IAM-01 audit made). |
| A2-05 | Informational (local environment) | No | The ignored local build output `packages/database/dist/persistence.{js,d.ts}` from pre-IAM-02 builds is still present. The `.d.ts` imports the generated Prisma client. `package.json` `exports` no longer has `./persistence`, lint bans `@vertex-os/database/*`, and the Section 35 search finds the specifier only in historical plan text. | It cannot be resolved or imported. CI builds from a clean checkout. The only effect is that a grep over `dist/*.d.ts` shows a stale Prisma reference. | Optional: delete `packages/database/dist` locally, or let a clean-before-build step handle it if one is ever added. |
| A2-06 | Informational (local environment; recurring A1-08) | No | `pnpm format:check` in the main checkout exits 1 with 22 warnings, all under `.claude/worktrees/` (none elsewhere). `pnpm exec prettier --check . '!.claude/**'` passes. | The literal root gates fail locally while sibling worktrees exist. CI is unaffected. | Owner choice: remove stale worktrees or add `.claude/` to `.prettierignore`. |

### Migration and catalog review

- **Line-by-line review.** Both `migration.sql` files were reviewed against Sections 16 and 17.3. `20260923035742_audit_foundation` has a header naming MOD-AUDIT, IAM-MP-02, the wrapper reason and the recovery pointer; `BEGIN;`; the generated enums and table; ten hand-written checks; `COMMIT;`. `20260923041312_iam_system_role_code` has a header naming MOD-IAM, the tightening and the recovery pointer; `BEGIN;`; one `ALTER TABLE … ADD CONSTRAINT "iam_role_system_code_ck" CHECK (is_system = (code = 'system-administrator'))`; `COMMIT;`. Each file has exactly one `BEGIN;` and one `COMMIT;` and none of `CONCURRENTLY`, `CREATE SCHEMA`, `DROP`, `TRUNCATE`, `DELETE`, `INSERT`, `UPDATE`, `CREATE TRIGGER`, `CREATE FUNCTION`, `REFERENCES` or an index statement. There are no reference rows. Every predicate matches Section 16.1 semantics. `audit_record_change_ck` wraps the Section 16.1 predicate in `CASE … ELSE false`, so JSON scalars are rejected instead of raising an error. That is equivalent and correct.
- **Regenerated DDL.** The auditor copied `git show 9e9e464:packages/database/prisma/schema/{schema,iam}.prisma` to scratch and ran the repository's Prisma 7.10.0 `migrate diff --from-schema <copy> --to-schema prisma/schema --script`. The output is byte-identical to the migration's generated section after CR and blank-line normalization (720 bytes each). The only other schema change, the `///` comment on `IamRole`, produces no DDL, as D-06 predicts.
- **IAM-01 migration unchanged.** `git diff 9e9e464` on its folder is empty, and the blob hash is `47d20c8d…5688` both at `9e9e464` and in the working tree.
- **Fresh database.** The auditor's own `postgres:18.6-alpine` (UTF8, `en_US.utf8`, libc provider) was migrated with the repository's `prisma migrate deploy`. The result: three finished migrations in order, a second deploy reporting "No pending migrations", the drift gate (`migrate diff --from-config-datasource --to-schema prisma/schema --exit-code`) exiting 0, and `migrate status` up to date.
- **`audit_record` catalog.** The catalog derived from `pg_constraint`, `pg_indexes`, `pg_enum`, `pg_trigger`, `pg_proc` and `information_schema.columns` matches Section 16.1 exactly:
  - `audit_record_pkey` plus the ten named checks (source_module, action, action_module, actor, actor_process, target_type, target_id, trace_id, reason, change), and PostgreSQL 18's automatic NOT NULL entries;
  - no foreign key in either direction and no index other than the primary key;
  - enums `audit_actor_type` (`USER`, `SYSTEM`) and `audit_result` (`SUCCEEDED`, `REFUSED`, `FAILED`) in order;
  - defaults only `gen_random_uuid()` and `transaction_timestamp()` on `timestamptz(3)`;
  - zero non-internal triggers in the database (the 24 `RI_ConstraintTrigger_*` rows are IAM-01's foreign-key internals) and zero functions in `public`.
- **`iam_role` catalog.** `iam_role_pkey`, `iam_role_code_ck`, `iam_role_name_ck`, `iam_role_description_ck`, `iam_role_system_active_ck`, `iam_role_system_code_ck` (`CHECK ((is_system = (code = 'system-administrator'::text)))`) and `iam_role_version_ck`, with the indexes `iam_role_pkey` and `iam_role_code_key`. The longest constraint name in `public` is 58 bytes (a PostgreSQL-generated NOT NULL name) and the longest new name is 29 bytes.
- **Tightening failure.** In a second database of the auditor's container, the IAM-01 migration alone was deployed through a temporary Prisma configuration pointing at a scratch copy (P-11). A custom role `system-administrator` / `Impostor` (`is_system = false`) and a valid custom role were inserted. `prisma migrate deploy` then exited 1 with `current transaction is aborted …` naming `migration_name="20260923041312_iam_system_role_code"`. Afterwards the Audit migration was applied, `iam_role_system_code_ck` was absent, both roles were intact (version 1), and the failed attempt was recorded with `finished_at` NULL. A redeploy printed `Error: P3009`. This matches Section 42 and the README. The plan's "fails with P3018" wording (Sections 33.5, D-07) is superseded by that recorded observation.
- **Parity spot check.** Beyond the shared fixtures, `U+2028`, `U+2029`, `U+FFF9`, `U+200B` and `U+00A0` are neither `[[:cntrl:]]` in this locale nor rejected by the core, and the core trims a leading NBSP before the database sees it. No divergence was found.

### Reference-synchronization evidence

All runs used the built command (`node --enable-source-maps apps/api/dist/commands/iam-sync-reference.js`) in a clean environment (`env -i` with only `PATH`, `SystemRoot`, an explicit `DATABASE_URL` for the auditor's container and `LOG_LEVEL=info`), each against a fresh, freshly migrated database.

- **First run.** Exit 0 with one JSON line: `iam reference data synchronized`, 12 registered, `systemRole: created`, 12 granted, UUID `traceId`, no `pid`/`hostname`/URL. The database then held 12 permissions whose code, module, name, description, state and sensitivity equal Section 21.1 exactly; one role `system-administrator` / `System Administrator` (`ACTIVE`, `is_system`, version 1); 12 mappings; and exactly 14 `audit_record` rows. All 14 carry the run's `trace_id`, `source_module = iam`, `actor_type = SYSTEM`, `actor_process = iam.reference-sync`, `actor_user_id` NULL and `result = SUCCEEDED`, and share one `occurred_at` instant (transaction start). The actions are 12 × `iam.permission.registered`, 1 × `iam.role.created` and 1 × `iam.role.permissions-granted`, with the Section 23.2 targets and `change` shapes.
- **Converged run.** Exit 0, all counts 0, `systemRole: unchanged`. The `row_to_json` text of every permission, role, mapping and Audit row (39 lines, `updated_at` and `version` included) was byte-identical before and after (`cmp`). Still 14 Audit rows.
- **Refusals.** An undeclared `iam.audit-probe.read` inserted by SQL gave exit 2 with `reason: undeclared-permissions` and `details: ["iam.audit-probe.read"]` at level 40. Setting `iam.sessions.revoke` to `RETIRED` (mapping removed) with the manifest declaring it `ACTIVE` gave exit 2 with `retired-permission-reactivated`. In both cases every row stayed byte-identical and no Audit row was added. Through `pnpm iam:sync-reference` (Nx target, explicit `DATABASE_URL` overriding `.env`) a converged database gives exit 0, and the refusing database gives exit 1 with the `…refused` result line, which confirms the README's statement on exit-code normalization.
- **Concurrency.** Eight command processes were started simultaneously on a fresh database: all exited 0, exactly one reported `systemRole: created` with 12 registered, seven reported no change, and the database held 12 permissions, one role at version 1, 12 mappings and 14 Audit rows under one trace ID. To prove genuine contention, the run was repeated on another fresh database while a `psql` session held `pg_advisory_xact_lock(-4098619809192145812)` for 3.5 s. `pg_stat_activity` showed **8** sessions waiting on the `advisory` lock, and on release the result was again exactly one creator, seven converged runs, 14 Audit rows and 12/1/12 rows. The key equals the first eight bytes of SHA-256(`vertex-os:iam.reference-sync`) as a signed 64-bit integer, as the source comment states, and it is the repository's only advisory lock.
- **Real adapters: I-1, custom roles, atomicity.** The built `synchronizeIamReferenceData` + `createIamTransactionRunner` + `createAuditRecorder` ran with synthetic manifests.
  - (a) `iam.a.read` + `iam.b.read` ACTIVE: role created at version 1 with both mappings.
  - A custom role `content-editors` mapped to `iam.b.read` was then inserted by SQL.
  - (b) `iam.b.read` → `DEPRECATED`: `permissionsUpdated` and `permissionsRevoked` = `iam.b.read`; the system role moved to version 2 with only `iam.a.read`. **I-1 was observed.**
  - (c) → `RETIRED`: metadata update only, no mapping change and no version bump.
  - The custom role's version, `updated_at` and mapping `created_at` were unchanged after both runs. Audit actions per trace matched Section 23.2.
  - (d) Evolution adding `iam.c.read`, with a recorder wrapping the **real** `createAuditRecorder` that throws after its second real append: the error propagated, the full state (Audit rows included) stayed byte-identical, and no row carries that trace ID.
  - (e) `RETIRED` → `ACTIVE` was refused with nothing written.
- **Implementer's tests.** They were reviewed as genuine. The four-way concurrency test uses real competing transactions. The lock test waits on the observable `pg_stat_activity` advisory wait, not on a timer. The atomicity tests cover a fresh and a converged database, and the API test fails after the fourteenth *real* append. There is no mock used as concurrency proof, no `.only`/`.skip`, and `retry: 0` everywhere. The two server-side `pg_sleep` calls create a measured interval inside one transaction; neither waits for an asynchronous condition.

### Boundary evidence

- `pnpm lint:boundaries`: 45/45 PASS (V1–V40, C1–C5). V20 is reported as a cycle and V24 by the `layer:adapter` rule, as Section 42 records.
- **Auditor probes.** 62 probes ran in each project's own configuration (`lintText`, nothing written). Rejected as intended:
  - dynamic and type-query imports of `@vertex-os/database/iam|audit`, `@vertex-os/iam/persistence` and `@vertex-os/audit/src/*` from `apps/api`, `apps/web`, `domains/audit`, `domains/iam`, `domains/iam-persistence` and `domains/audit-persistence` (P01–P16);
  - `export *` and `import type`/`export type` of private subpaths (P17–P22);
  - relative deep imports between all four domain projects and into `packages/database/src`, static and dynamic (P23–P29);
  - `@vertex-os/audit` → `@vertex-os/iam` (cycle diagnostic, P30/P31);
  - `@vertex-os/iam-persistence` → `@vertex-os/audit-persistence` and the reverse (`layer:adapter`, P32/P33);
  - `pg`/NestJS in Audit projects (P34–P36);
  - `packages/database` → the Audit adapter; `apps/web-e2e` and `packages/ui` → `@vertex-os/audit` (P37–P39);
  - `$queryRawUnsafe` in adapter `src` (P40);
  - the bootstrap overrides keep the import and raw-SQL selectors in `src/main.ts` and `src/commands/iam-sync-reference.ts` (P44–P46, P48, P49) and exempt only the environment (P43); `process.env` stays banned in `iam-sync-reference.command.ts` (P47);
  - test files still reject private dynamic imports (P61) and may use unsafe raw SQL (P62).

  Accepted as intended: the root dynamic import, the root type query and the permitted adapter entries (P56–P60). Not rejected: P41, P42 (computed key) and Q1 (A2-03), and P50, P51 and P54 (A2-02). P55 (`import x = require(…)`) is rejected by `no-restricted-imports`. No project configuration switches `no-restricted-syntax` off; only the pre-existing `packages/ui` `no-restricted-imports: off` (A-05) remains.
- **D-03 typed scoping.** `scoped-clients.types.spec.ts` compiles under `@vertex-os/database:typecheck` (its `tsconfig.spec.json` is part of `tsc --build`). Two temporary breaks, each restored byte-for-byte (SHA-256 checked) with typecheck passing again afterwards:
  - removing the `@ts-expect-error` above `iam.auditRecord` failed typecheck with `TS2339: Property 'auditRecord' does not exist on type 'IamPersistenceClient'`;
  - widening `DomainScopedClient` to the full `Prisma.TransactionClient` failed it with `TS2578 Unused '@ts-expect-error'` on the `iam.auditRecord`, `audit.iamRole`, `audit.iamPermission` and both `$transaction` lines.

  At runtime the scoped object is Prisma's own client (Decision Log). The scoping is a compile-time and lint guarantee, as D-03 states; R-04 remains the documented residual.
- **Transaction handle.** The handle is registered in a module-private `WeakMap` inside `runInTransaction` and deregistered in `finally`. A `WeakSet` marks issued handles, so an ended handle raises `TypeError('DatabaseTransaction has already ended.')`. Foreign objects and a transaction handle passed as a client raise `TypeError`. `runInTransaction` is exported only from `./iam` and `./audit`, never from the root. `@vertex-os/iam` reaches the transaction only through `IamTransactionRunner`/`IamTransactionScope` (capability interfaces). The IAM adapter never imports the Audit adapter; the only binding is `auditRecorderFor: createAuditRecorder` in `apps/api/src/commands/iam-sync-reference.command.ts`.
- **Public declarations.** After an uncached build, the `dist/index.d.ts` of `@vertex-os/database`, `@vertex-os/audit`, `@vertex-os/audit-persistence`, `@vertex-os/iam` and `@vertex-os/iam-persistence` contain no `prisma`, `generated`, `TransactionClient` or `runInTransaction`. The database root exports only `createDatabaseClient`, `DatabaseUnavailableError`, `describeDatabaseError` and the types `DatabaseClient`, `DatabaseClientOptions`, `DatabaseErrorDescription`, `DatabaseTransaction`. `database-client.d.ts`, which that index re-exports from, still imports Prisma for its non-root helpers, exactly as in the accepted IAM-01 baseline. The IAM root exports exactly the D-17 list.
- **Graph and tags.** `nx show project` gives `type:lib, scope:backend, layer:domain, domain:audit` and `type:lib, scope:backend, layer:adapter, domain:audit`. `nx graph --file` edges: `api → audit, audit-persistence, database, iam, iam-persistence`; `audit-persistence → audit, database`; `iam → audit`; `iam-persistence → audit, database, iam`; `web → ui`; `web-e2e → web, api`. There is no Audit → IAM edge and no adapter-to-adapter edge.

### Logging and data-protection evidence

- **Real errors through the composed command process.** Both runs used the built entry against the auditor's database.
  - (1) A throwaway trigger raised SQLSTATE 23514 whose message and detail contained `Sentinel.Trigger@Example.com` and `secret-value-9f3`. Exit 1, one error line whose `err` is only the description `{ errorClass: PrismaClientKnownRequestError, prismaCode: P2039, sqlState: 23514, driverKind: postgres, model: IamRole }`. Neither stdout nor stderr contains the sentinels, the password, the port or a `postgres(ql)://` URL. The run rolled back completely: 0 permissions, 0 roles, 0 Audit rows.
  - (2) An unreachable server with sentinel credentials: exit 1, description `P1001` / `DatabaseNotReachable`, with no host, port or credential.
- **Loggers in isolation.** Real P2007 (input sentinel), P2039 (email in `detail`), `PrismaClientValidationError` (email in the printed arguments) and P1001 errors were logged through `createCommandLogger` and through `createApp`'s Fastify logger. Every line contains only the allowlisted description with the fixed message and empty stack, and no sentinel, `detail`, `meta`, driver message or connection detail. The raw errors do contain the sentinels. The Nest `Logger` path is A2-01.
- **Existing hygiene tests.** `app.spec.ts` readiness-failure logging and `health.integration.spec.ts` pass inside the unit and integration runs below.
- **Audit rows.** Sampled rows (`iam.role.created`, `iam.role.permissions-granted`, two `iam.permission.registered`) contain only codes, a role UUID and catalog text. A scan of all 14 rows found no `@`, password, token, secret, cookie, session ID, URL or credential.
- **Audit write paths.** The only `auditRecord` call in any source is `create` in `createAuditRecorder` (frozen object, exactly `append`). There is no `update`, `updateMany`, `upsert`, `delete` or `deleteMany` on the Audit delegate, and the only `TRUNCATE audit_record` statements are test setup.

### Interpretation rulings

- **I-1 (System Administrator holds exactly the `ACTIVE` set): upheld.** Spec Section 20 says "receives every active permission", and Section 9.6 defines a mapping as associating "one active permission" with a role. Removing `DEPRECATED` codes is the least-privilege reading and was observed as an audited revocation with one version increment. `DEPRECATED` effectiveness for custom roles stays with IAM-MP-07/09.
- **I-2 (transitions; `RETIRED` terminal): consistent** with spec Section 18 ("never silently repurposed", "retired permissions are never effective"). Refusal observed.
- **I-3 (undeclared persisted code refuses): upheld.** It implements the Master Plan exit criterion "administrators cannot invent permission codes through data alone" and fails loudly on accidental removal. Refusal observed.
- **I-4 (metadata may change; `owningModule` cannot): consistent.** `iam_permission_code_module_ck` enforces the first segment.
- **I-5 (sensitivity definitions and the Section 21.1 classification): upheld** as a working classification. No V1 behavior depends on it. Note for IAM-MP-07/14: if department membership becomes an authorization input (spec Section 16.2 organizational context), revisit whether `iam.users.manage-departments` stays `SENSITIVE`.
- **I-6 (version rule): consistent** with spec Section 30. Observed: version 1 on creation, +1 once per changing run, no bump for metadata-only or unrelated permission changes.
- **I-7 (refusals logged, not audited): consistent.** Nothing changed, and spec Section 34 does not list reference-synchronization refusals among security events. Refusals are logged at level 40 with the stable reason.
- **I-8 (trace-ID grammar): consistent.** `TRACE_ID` in `domains/audit/src/codes.ts` and `ACCEPTED_REQUEST_ID` in `apps/api/src/http/request-id.ts` are the same expression, `^[A-Za-z0-9._:-]{1,128}$`, and `request-id.spec.ts` proves generated and inbound values parse.
- **Decision Log entries (Section 41): all acceptable.**
  - V17 unchanged: a database self-import would test nothing.
  - Scope helper and registry in `database-client.ts`: not root-exported.
  - Database test support, the extra spec files and the `ignoredFiles` entry: test infrastructure only.
  - Audit adapter dependencies declared at M4: forced by `@nx/dependency-checks`.
  - Stricter Audit core details: non-empty sides, denylist before grammar, extra reason codes, deep freeze; no database-contract change.
  - `transaction_timestamp()` instead of the literal `CURRENT_TIMESTAMP`: PostgreSQL defines them as equivalent. Callers never write the value, the drift gate exits 0, and one instant was observed per run.
  - `AuditChange` as a type alias.
  - Server-side `pg_sleep`: a deterministic interval, not a wait.
  - Reference-sync port and detail-token choices: `wrong-module:<code>` echoes only a syntactically valid code, which satisfies "codes only".
  - Fixed message and empty stack for database errors.
  - Operator-command details: exact `pino` pin, `test:integration` depending on `build`.
  - Files outside Section 31: each is needed by the plan's own work; confirmed against `git status`.
  - Boundary-check message fragments: they strengthen the cases.
- **Surprises (Section 42): confirmed where reproduced.** Reproduced: the P3018-less output and P3009, V20 reported as a cycle and V24 by the tag rule, P2039/P2010/P2007/P2002/P1001 error shapes, and the exit-code normalization through Nx. The timestamp corrections in Progress are a record-keeping matter and do not affect results.

### Scope checks

- **HTTP runtime.** Under `apps/api/src`, the only changed runtime file is `app.factory.ts` (+4 lines: the serializer import and `serializers: { err }`). No controller, module, provider, route or DTO changed.
- **OpenAPI.** The auditor regenerated the document **at `9e9e464` independently**: a `git archive` copy in scratch, `pnpm install --frozen-lockfile --offline` from the local store, `NX_SKIP_NX_CACHE=true pnpm openapi:generate`. SHA-256 `0bf3e7a1…84d717`. An uncached `pnpm openapi:generate` on the IAM-02 tree gave a byte-identical file (`cmp`). The scratch copy was deleted.
- **No out-of-scope work.** No Keycloak, OIDC, session, CSRF, authentication, authorization-context, IAM HTTP endpoint, UI, Audit read or query path, index, user seed or department seed was added. Keycloak and session matches in changed files are the pre-existing ESLint ban list, the D-08 denylist fragment `sessionid` and the catalog text of `iam.sessions.revoke`. No `console.log`, Nest decorator in `domains/**`, `eslint-disable`, `@ts-ignore` or `as any` appears in changed files.
- **Search gates (Section 35).** All re-run and clean:
  - the only `audit…` matches in IAM source are the D-04 factory name `auditRecorderFor`;
  - there are no `iam…` matches in Audit source, and no `@prisma`/`pg` in cores or adapter `src`;
  - `@vertex-os/database/persistence` appears only in historical plan text;
  - `@vertex-os/database/iam|audit` appear only in their owning adapter, the boundary script, ESLint configuration and `packages/database`;
  - `$transaction(` appears only inside `runInTransaction`, with none in `domains/**/src`;
  - the only `RawUnsafe` in production `src` is the type union;
  - `packages/database/prisma/**` contains no `INSERT INTO`, seed, trigger, function, preview feature or `CONCURRENTLY`; its `UPDATE`/`DELETE` matches are IAM-01's `ON DELETE/UPDATE RESTRICT`;
  - `process.env` appears only in the two bridges, a comment and tests.
- **Lockfile delta.** The delta is `importers:` hunks only: the two new importers, the `workspace:` links and `pino: 10.3.1` for `apps/api`. `pino@10.3.1` was already in `packages:` at `9e9e464`, and there is no `packages:`/`snapshots:` change.
- **Section 31 comparison.** Every changed path is in Section 31 or justified in the Decision Log. The API `tsconfig*.json` and root `tsconfig.json` edits are `nx sync` references.
- **Carried items.** A1-01 is done (static, dynamic, template, computed and type-query forms; residual A2-02). A1-02 is done for every composed path (residual A2-01). A1-03 changed exactly four example lines, `git diff` showing `docs/modules/iam.md` 3/3 and `docs/SECURITY.md` 1/1 with no normative text touched, and no two-segment `projects.edit` remains. A1-05 backdates `updated_at` and asserts against the pre-update row. A1-07 asserts all six foreign keys as `r`/`r` and not deferrable, and adds the one-character module case.
- **Documentation.** The README commands exist and behave as documented: first run, converged run, the refusal exit code through Nx, three migrations and the failure wording. ENGINEERING Section 15 describes the implemented D-04 mechanism accurately, without an ADR. The Master Plan shows IAM-MP-02 `AUDIT_REQUIRED` with an amendment record; its stale header and Section 19 are A2-04. The living sections match the auditor's evidence, except the `PinoLoggerService` coverage claim (A2-01).

### Verification (every command actually run by the auditor)

| Command | Result | Notes |
|---|---|---|
| `git status`, `git rev-parse HEAD`, `git log -5 --oneline`, `git diff --stat 9e9e464`, untracked list, `git worktree list` | Evidence | See Basis; HEAD `9e9e464`; unchanged at the end apart from this record and the Master Plan |
| `prisma migrate diff --from-schema <9e9e464 copy> --to-schema prisma/schema --script` | PASS | Byte-identical to the generated section |
| Fresh-container `migrate deploy` ×2, drift gate, `migrate status`, catalog queries, tightening reproduction | PASS | As recorded above; container removed |
| `pnpm lint:boundaries` | PASS | 45/45 |
| Auditor ESLint probes (62 + 12 follow-up) | As recorded | A2-02 and A2-03 residuals; candidate selectors validated |
| Type-level breaks on `@vertex-os/database:typecheck` (`--skip-nx-cache`) | As expected | TS2339 and TS2578; files restored (SHA-256), typecheck exit 0 |
| Uncached build of the five backend libraries and `dist/*.d.ts` inspection | PASS | No Prisma in any public index |
| Built command: first, converged, two refusals, 8 concurrent (twice, once under a held lock), trigger error, unreachable server | PASS | 12/1/12 + 14; byte-identical; exit 2 ×2; one creator; descriptions only |
| Real-adapter probe (I-1, custom roles, atomicity, RETIRED refusal) | PASS | As recorded |
| Logger probe (command, Fastify, Nest `Logger`) | Command/Fastify PASS; Nest `Logger` leaks | A2-01 |
| `pnpm iam:sync-reference` via Nx with explicit `DATABASE_URL` | PASS | Exit 0 converged; exit 1 on a refusal with the `…refused` line |
| `pnpm openapi:generate` at `9e9e464` (temp copy) and on the IAM-02 tree, uncached | PASS | Byte-identical, SHA-256 `0bf3e7a1…84d717` |
| `pnpm install --frozen-lockfile` | PASS | Lockfile SHA-256 unchanged (05:32 UTC) |
| `pnpm nx sync:check` | PASS | All files up to date |
| `pnpm format:check` | FAIL (environmental) | 22 warnings, all under `.claude/worktrees/` (A2-06) |
| `pnpm exec prettier --check . '!.claude/**'` | PASS | Sibling-worktree exclusion given on the command line |
| `NX_SKIP_NX_CACHE=true`: `pnpm lint`, `pnpm lint:boundaries`, `pnpm typecheck`, `pnpm test`, `pnpm build` | PASS | Lint 9 projects (19 s); 45/45 (8 s); typecheck 9 (9 s); test 5 projects (13 s); build 8 (8 s); "Cache: Skipped". Stream run of the unit suites: Audit 111, IAM 86, API 29, UI 146, web 8 |
| `pnpm db:validate`, `pnpm db:generate` (uncached) | PASS | — |
| `NX_SKIP_NX_CACHE=true pnpm test:integration` | PASS | 39 s: database 27, Audit adapter 99, IAM adapter 84, API 10 |
| `@vertex-os/audit-persistence:test:integration` ×3 (`--skip-nx-cache`, retry 0) | PASS | 99/99 each (8.00 s, 7.54 s, 7.69 s) |
| `@vertex-os/iam-persistence:test:integration` ×3 | PASS | 84/84 each (9.93 s, 10.75 s, 9.95 s) |
| `@vertex-os/api:test:integration` ×3 | PASS | 10/10 each (10.70 s, 11.91 s, 11.17 s) |
| `pnpm test:e2e` (`CI` unset) | PASS | 130/130 in 71 s, no flaky test |
| `pnpm verify:full` | PASS | 143 s including Playwright 130/130. `.claude/` was appended to `.prettierignore` for this run and the original bytes restored immediately (SHA-256 `391aeb8c…32a70` verified; `git status` clean for that file). Lint, typecheck, test and integration tasks were partly Nx cache hits of the uncached runs above. |
| `pnpm deps:audit` | PASS | 4 previously reviewed exceptions (1 moderate, 3 high); none new |

The local `vertexos` compose project was not used: the auditor's own container replaced it for every database run.

---

## 47. Plan Quality and Completion Rules

- Describe observed reality, not intention. Do not mark completion because files exist.
- Add no abstraction without a current consumer: one Audit operation, one IAM transaction port, one synchronization use case.
- Prefer a database constraint over a comment, a type error over a convention, a test over a probe, and a named rule over an implicit one.
- Never weaken an existing rule or test to get green checks. Never disable a rule wholesale.
- Keep the plan self-contained for IAM-02. Link to canonical sources instead of copying them.

This plan becomes `COMPLETE` only when every Definition of Done item holds, the evidence is recorded, the probes are removed, canonical documentation agrees with executable reality, and the implementing agent has issued `IAM-02 COMPLETE — READY FOR INDEPENDENT AUDIT`. The next action is then an independent audit, not IAM-MP-03.
