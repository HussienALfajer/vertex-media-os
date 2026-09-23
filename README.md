# Vertex OS

Internal operating platform of Vertex Media: a TypeScript modular monolith (pnpm + Nx) with a
NestJS-on-Fastify API, a React/Vite web application and PostgreSQL through Prisma ORM 7.

This repository contains the **Phase 0 technical foundation**, the **Vertex Design System
Foundation** (`packages/ui`, specified in [DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md)), the IAM
persistence foundation (`domains/iam` and `domains/iam-persistence`), and the IAM reference data
with the minimal MOD-AUDIT foundation (`domains/audit` and `domains/audit-persistence`). IAM
tables, the permission catalog and the protected System Administrator role exist, but no IAM
behavior is reachable from the running application yet. A local Keycloak with the Vertex realm
(`infra/keycloak`) runs next to PostgreSQL; the API does not use it yet.
The product and architecture are defined in the canonical documents: [product](docs/PRODUCT.md),
[architecture](docs/ARCHITECTURE.md), [modules](docs/MODULES.md),
[engineering](docs/ENGINEERING.md), [security](docs/SECURITY.md), [testing](docs/TESTING.md) and
[design system](docs/DESIGN_SYSTEM.md). Coding agents start with [AGENTS.md](AGENTS.md).

## Prerequisites

- **Node.js 24 LTS** — `.node-version` pins `24.21.0`; `package.json` requires `>=24 <25`.
- **pnpm 12.5.1** — pinned in `package.json` (`packageManager`). A globally installed pnpm switches
  to the pinned version automatically.
- **Docker** with Compose v2 and a running daemon — for local PostgreSQL and Keycloak, the
  Testcontainers integration tests and the visual baselines (rendered in the pinned Playwright
  Linux image).

## First-time setup

```sh
pnpm install                           # installs exactly what pnpm-lock.yaml records
pnpm env:setup                         # creates the ignored .env with generated local secrets
pnpm infra:up                          # starts PostgreSQL 18 and Keycloak 26.7.4 on 127.0.0.1, waits until healthy
pnpm db:migrate                        # applies forward-only database migrations
pnpm iam:sync-reference                # synchronizes the IAM permission catalog and system role
pnpm exec playwright install chromium firefox webkit  # browsers for the end-to-end tests
```

`pnpm env:setup` generates the local database password, the Keycloak administrator credentials and
the two Keycloak client secrets, and never prints them. It never rewrites an existing `.env`: run
again after `.env.example` gains keys (for example after pulling a new service), it appends only
the missing keys. It refuses to generate a value while the Docker volume that keeps it exists,
because PostgreSQL and Keycloak keep the credentials they were initialised with. To rotate the
local credentials, delete the local data first (all of it is lost): `pnpm infra:reset`, then
`pnpm env:setup -- --force`, then re-apply local overrides such as `POSTGRES_PORT` and
`pnpm infra:up`.
If port 5432 is already taken, change `POSTGRES_PORT` and the port in `DATABASE_URL` in `.env`;
for Keycloak change `KEYCLOAK_PORT`. Never put production values in `.env`, and do not add
`NODE_ENV` to it (see `.env.example`).

## Running locally

```sh
pnpm dev        # API (rebuilds and restarts on change) and web dev server together
pnpm dev:api    # API only
pnpm dev:web    # web only
```

| URL                                         | What                                                                         |
| ------------------------------------------- | ---------------------------------------------------------------------------- |
| http://127.0.0.1:4200                       | Web shell; it calls the API through `/api` (Vite proxy)                      |
| http://127.0.0.1:4200/dev/ui                | Design-system lab (development and the `lab` build only; synthetic data)     |
| http://127.0.0.1:3000/api/health/live       | Liveness: `200 {"status":"ok"}`, independent of PostgreSQL                   |
| http://127.0.0.1:3000/api/health/ready      | Readiness: `200` when PostgreSQL answers, otherwise a `503` within about 3 s |
| http://127.0.0.1:3000/api/docs              | Swagger UI (off by default when `NODE_ENV=production`)                       |
| http://127.0.0.1:3000/api/docs/openapi.json | OpenAPI document                                                             |
| http://127.0.0.1:8080/realms/vertex         | Local Keycloak `vertex` realm (issuer); `/.well-known/openid-configuration`  |
| http://127.0.0.1:8080/admin                 | Keycloak admin console: `KEYCLOAK_BOOTSTRAP_ADMIN_*` from `.env`             |

Errors use RFC 9457 Problem Details (`application/problem+json`) with a stable `code` and the
request's `traceId`; every response carries an `x-request-id` header.

## Database and infrastructure

```sh
pnpm db:validate   # validate the Prisma schema
pnpm db:generate   # generate the Prisma client into packages/database/src/generated (ignored)
pnpm db:migrate    # apply pending migrations; safe to run again (no reset)
pnpm iam:sync-reference  # synchronize IAM reference data (after db:migrate); safe to run again
pnpm infra:down    # stop local PostgreSQL and Keycloak; both data volumes are kept
pnpm infra:reset   # stop them AND delete both local data volumes (destructive)
```

Keycloak runs in development mode (never a production configuration) with its embedded database
in the `keycloak-data` volume. The `vertex` realm is imported from
`infra/keycloak/import/vertex-realm.json` only when that volume is empty; client secrets and the
environment-specific URIs in it are placeholders filled from `.env`. Realm changes therefore take
effect only after `pnpm infra:reset`, which deletes the Keycloak and PostgreSQL data together so
IAM users and Keycloak identities never drift apart. Do not change the realm in the admin console:
the committed file is the source of truth. Non-secret server options (health, Argon2id password
hashing) live in `infra/keycloak/keycloak.env`, shared with the integration tests.

There are three migrations: `20260923013708_iam_persistence_foundation` creates seven IAM tables
and their structural constraints; `20260923035742_audit_foundation` creates MOD-AUDIT's
append-only `audit_record` table; `20260923041312_iam_system_role_code` adds
`iam_role_system_code_ck`, which reserves the code `system-administrator` for the one system role.
The schema lives in `packages/database/prisma/schema/` (one file per owning module); migrations
live in `packages/database/prisma/migrations/`. The API does not apply migrations on startup.

If `pnpm db:migrate` fails, its explicit transaction wrapper leaves no partial schema, but Prisma
records a failed `_prisma_migrations` row (P3018, or the message `current transaction is aborted`
naming the migration); the next deploy then refuses with P3009. The transaction-aborted message
hides the original SQL error: reproduce the migration against a **disposable database only** with
`psql -v ON_ERROR_STOP=1 -f <migration.sql>`. Correct the environment, privileges or data rather
than editing an already committed migration. Then run
`pnpm --filter @vertex-os/database exec prisma migrate resolve --rolled-back <migration_name>`
and retry `pnpm db:migrate`. Prisma refuses a nonempty schema without migration history (P3005);
do not bypass that check. `iam_role_system_code_ck` fails on a database where a custom role already
uses the reserved code; such data is never changed by tooling and must be resolved deliberately.

`pnpm iam:sync-reference` is an explicit operator command; it never runs on API start or in a
migration. In one transaction serialized by an advisory lock, it registers or updates the
code-defined IAM permissions (spec Section 19), creates the protected `system-administrator` role
if missing, repairs its name and description, and maps it to exactly the ACTIVE permissions. Every
change gets an Audit record in the same transaction: the first run on an empty database writes 12
permissions, 1 role, 12 mappings and 14 Audit records; a second run writes nothing. It refuses,
changing nothing, if the database holds a permission code that no manifest declares, if a RETIRED
permission would become active again, or if the system role is inconsistent. It logs one JSON
result line (`iam reference data synchronized`, `… refused` or `… failed`, with a `traceId` that
also appears on the Audit records) and never logs the connection string. The command process
exits 0 (synchronized, with or without changes), 2 (refused) or 1 (configuration or unexpected
failure); through `pnpm`/Nx any non-zero exit is reported as 1, so read the result line. Run it
after every `pnpm db:migrate`; the later bootstrap command will require synchronized reference
data.

## Verification

| Command                 | Runs                                                                              |
| ----------------------- | --------------------------------------------------------------------------------- |
| `pnpm format`           | Prettier (writes); `pnpm format:check` only checks                                |
| `pnpm lint`             | ESLint for every project, including the Nx module-boundary rules                  |
| `pnpm lint:boundaries`  | Virtual negative and positive boundary probes (V1–V62, C1–C8)                     |
| `pnpm typecheck`        | TypeScript for every project                                                      |
| `pnpm test`             | Unit, API (Fastify inject) and frontend (Testing Library) tests with Vitest       |
| `pnpm build`            | Production builds of every project with a build target                            |
| `pnpm test:integration` | Tests against real, ephemeral PostgreSQL and Keycloak (Testcontainers; Docker)    |
| `pnpm test:e2e`         | Playwright: production smoke, design-system lab in 3 engines, visual baselines    |
| `pnpm verify`           | Fast gate: format check → lint → lint:boundaries → typecheck → test → build       |
| `pnpm verify:full`      | `verify` + Prisma validate/generate + integration tests + end-to-end tests        |
| `pnpm deps:audit`       | Dependency vulnerability audit (reviewed exceptions are in `pnpm-workspace.yaml`) |
| `pnpm openapi:generate` | Writes the OpenAPI document to `apps/api/generated/openapi.json` (ignored)        |

Single project targets run with `pnpm nx run <project>:<target>`, for example
`pnpm nx run @vertex-os/api:test`.

`pnpm test:e2e` starts the real API (:3100), the production web build (:4300, which must not
contain the lab) and the separate lab build (:4310, `vite build --mode lab`). Visual baselines are
rendered by Chromium inside the digest-pinned `mcr.microsoft.com/playwright` Linux image, so every
platform compares against the same reviewed images. They change only deliberately:
`pnpm nx run @vertex-os/web-e2e:e2e -- --project=visual --update-snapshots`, then review every
changed file under `apps/web-e2e/src/visual/__screenshots__/` before committing; CI never writes
baselines. Design tokens are edited in `packages/ui/src/tokens/tokens.json` and regenerated with
`pnpm nx run @vertex-os/ui:tokens` (a stale generated file fails `pnpm test`).

GitHub Actions ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)) runs the same commands,
`pnpm install --frozen-lockfile`, `pnpm verify:full` and `pnpm deps:audit`, for every pull request
to `main` and every push to `main`. It needs no secrets. CI retries a failed Playwright test once
only to classify it: a test that passes only on retry is flaky and still fails the run. Failed and
flaky tests are annotated on the run, and when `verify:full` fails the Playwright traces,
screenshots and report are kept as a run artifact for 7 days.

## Repository layout

```text
apps/api          NestJS on Fastify: configuration, health endpoints, errors, logging, OpenAPI
apps/web          React + Vite + TanStack Router/Query + Tailwind CSS shell and the /dev/ui lab
apps/web-e2e      Playwright: browser -> web -> API smoke, design-system lab and visual baselines
domains/iam       @vertex-os/iam: backend IAM domain core and private persistence contract
domains/iam-persistence @vertex-os/iam-persistence: IAM-owned Prisma adapters and transaction runner
domains/audit     @vertex-os/audit: MOD-AUDIT core (Audit entry contract and append capability)
domains/audit-persistence @vertex-os/audit-persistence: MOD-AUDIT-owned append-only recorder
packages/database Backend-only PostgreSQL/Prisma 7 client boundary
packages/ui       @vertex-os/ui: business-neutral design system (tokens, fonts, components)
infra/compose.yaml Local PostgreSQL and Keycloak for development
infra/keycloak    Vertex realm import (no secrets) and shared Keycloak server options
scripts/          Local environment setup and the lint:boundaries probes
docs/             Canonical documentation and execution plans
```

## Current limitations

- **No authentication or authorization yet.** The approved design (Keycloak over OIDC with the API as
  a backend-for-frontend holding the session) is specified in `docs/modules/iam.md`. The only
  endpoints are the public technical health endpoints.
- IAM tables, the IAM permission catalog and the protected System Administrator role exist
  (`pnpm iam:sync-reference`), and MOD-AUDIT can append immutable records, but the HTTP API uses
  none of them. There is no seed user, no user holding any role, no authentication or authorization,
  no Audit read path and no IAM endpoint. The `/dev/ui` proof scenarios (IAM, CRM, Projects,
  Finance) are static design fixtures.
- The local Keycloak realm has no email (SMTP) configuration yet, so Keycloak cannot send
  invitation or verification email locally, and self-service password reset is off until a reset
  flow that also requires the existing one-time code is added. Its back-channel logout URL points
  at an API endpoint that does not exist yet.
