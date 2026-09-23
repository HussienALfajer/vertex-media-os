# Vertex OS

Internal operating platform of Vertex Media: a TypeScript modular monolith (pnpm + Nx) with a
NestJS-on-Fastify API, a React/Vite web application and PostgreSQL through Prisma ORM 7.

This repository contains the **Phase 0 technical foundation**, the **Vertex Design System
Foundation** (`packages/ui`, specified in [DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md)), and the
IAM architecture package (`domains/iam`). IAM has no business behavior, data or authentication yet.
The product and architecture are defined in the canonical documents: [product](docs/PRODUCT.md),
[architecture](docs/ARCHITECTURE.md), [modules](docs/MODULES.md),
[engineering](docs/ENGINEERING.md), [security](docs/SECURITY.md), [testing](docs/TESTING.md) and
[design system](docs/DESIGN_SYSTEM.md). Coding agents start with [AGENTS.md](AGENTS.md).

## Prerequisites

- **Node.js 24 LTS** — `.node-version` pins `24.21.0`; `package.json` requires `>=24 <25`.
- **pnpm 12.5.1** — pinned in `package.json` (`packageManager`). A globally installed pnpm switches
  to the pinned version automatically.
- **Docker** with Compose v2 and a running daemon — for local PostgreSQL, the Testcontainers
  integration tests and the visual baselines (rendered in the pinned Playwright Linux image).

## First-time setup

```sh
pnpm install                           # installs exactly what pnpm-lock.yaml records
pnpm env:setup                         # creates the ignored .env with a generated local DB password
pnpm infra:up                          # starts PostgreSQL 18 on 127.0.0.1 and waits until healthy
pnpm exec playwright install chromium firefox webkit  # browsers for the end-to-end tests
```

`pnpm env:setup` never overwrites an existing `.env`. It also refuses to generate a new password
while the local PostgreSQL volume exists, because PostgreSQL keeps the password it was initialised
with. To rotate the local credentials, delete the local database first (its data is lost):
`pnpm infra:reset`, then `pnpm env:setup -- --force`, then re-apply local overrides such as
`POSTGRES_PORT` and `pnpm infra:up`.
If port 5432 is already taken, change `POSTGRES_PORT` and the port in `DATABASE_URL` in `.env`.
Never put production values in `.env`, and do not add `NODE_ENV` to it (see `.env.example`).

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

Errors use RFC 9457 Problem Details (`application/problem+json`) with a stable `code` and the
request's `traceId`; every response carries an `x-request-id` header.

## Database and infrastructure

```sh
pnpm db:validate   # validate the Prisma schema
pnpm db:generate   # generate the Prisma client into packages/database/src/generated (ignored)
pnpm infra:down    # stop local PostgreSQL; the data volume is kept
pnpm infra:reset   # stop it AND delete the local data volume (destructive)
```

The Prisma schema intentionally has no models and there are no migrations yet: business tables
arrive with their module specifications.

## Verification

| Command                 | Runs                                                                              |
| ----------------------- | --------------------------------------------------------------------------------- |
| `pnpm format`           | Prettier (writes); `pnpm format:check` only checks                                |
| `pnpm lint`             | ESLint for every project, including the Nx module-boundary rules                  |
| `pnpm typecheck`        | TypeScript for every project                                                      |
| `pnpm test`             | Unit, API (Fastify inject) and frontend (Testing Library) tests with Vitest       |
| `pnpm build`            | Production builds of the API, the web application and the database package        |
| `pnpm test:integration` | Tests against real, ephemeral PostgreSQL through Testcontainers (Docker required) |
| `pnpm test:e2e`         | Playwright: production smoke, design-system lab in 3 engines, visual baselines    |
| `pnpm verify`           | Fast gate: format check → lint → typecheck → test → build                         |
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
domains/iam       @vertex-os/iam: backend domain core boundary, with no IAM behavior yet
packages/database Backend-only PostgreSQL/Prisma 7 client boundary
packages/ui       @vertex-os/ui: business-neutral design system (tokens, fonts, components)
infra/compose.yaml Local PostgreSQL for development
scripts/          Local environment setup
docs/             Canonical documentation and execution plans
```

## Current limitations

- **No authentication or authorization yet.** The approved design (Keycloak over OIDC with the API as
  a backend-for-frontend holding the session) is specified in `docs/modules/iam.md`. The only
  endpoints are the public technical health endpoints.
- No business behavior, tables, migrations or seed data. The `/dev/ui` proof scenarios (IAM, CRM,
  Projects, Finance) are static design fixtures, not module implementations.
