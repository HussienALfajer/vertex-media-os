# Vertex OS

Internal operating platform of Vertex Media: a TypeScript modular monolith (pnpm + Nx) with a
NestJS-on-Fastify API, a React/Vite web application and PostgreSQL through Prisma ORM 7.

This repository currently contains the **Phase 0 technical foundation** only: no business module,
no business data and no authentication yet. What the product is and how it is built is defined in
the canonical documents: [product](docs/PRODUCT.md), [architecture](docs/ARCHITECTURE.md),
[modules](docs/MODULES.md), [engineering](docs/ENGINEERING.md), [security](docs/SECURITY.md) and
[testing](docs/TESTING.md). Coding agents start with [AGENTS.md](AGENTS.md).

## Prerequisites

- **Node.js 24 LTS** — `.node-version` pins `24.21.0`; `package.json` requires `>=24 <25`.
- **pnpm 12.5.1** — pinned in `package.json` (`packageManager`). A globally installed pnpm switches
  to the pinned version automatically.
- **Docker** with Compose v2 and a running daemon — for local PostgreSQL and for the Testcontainers
  integration tests.

## First-time setup

```sh
pnpm install                           # installs exactly what pnpm-lock.yaml records
pnpm env:setup                         # creates the ignored .env with a generated local DB password
pnpm infra:up                          # starts PostgreSQL 18 on 127.0.0.1 and waits until healthy
pnpm exec playwright install chromium  # browser for the end-to-end smoke test
```

`pnpm env:setup` never overwrites an existing `.env` (`pnpm env:setup -- --force` regenerates it).
If port 5432 is already taken, change `POSTGRES_PORT` and the port in `DATABASE_URL` in `.env`.
Never put production values in `.env`, and do not add `NODE_ENV` to it (see `.env.example`).

## Running locally

```sh
pnpm dev        # API (rebuilds and restarts on change) and web dev server together
pnpm dev:api    # API only
pnpm dev:web    # web only
```

| URL                                         | What                                                        |
| ------------------------------------------- | ----------------------------------------------------------- |
| http://127.0.0.1:4200                       | Web shell; it calls the API through `/api` (Vite proxy)     |
| http://127.0.0.1:3000/api/health/live       | Liveness: `200 {"status":"ok"}`, independent of PostgreSQL  |
| http://127.0.0.1:3000/api/health/ready      | Readiness: `200` when PostgreSQL answers, otherwise a `503` |
| http://127.0.0.1:3000/api/docs              | Swagger UI (off by default when `NODE_ENV=production`)      |
| http://127.0.0.1:3000/api/docs/openapi.json | OpenAPI document                                            |

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
| `pnpm test:e2e`         | Playwright smoke test: real API on :3100 and production web build on :4300        |
| `pnpm verify`           | Fast gate: format check → lint → typecheck → test → build                         |
| `pnpm verify:full`      | `verify` + Prisma validate/generate + integration tests + end-to-end smoke test   |
| `pnpm deps:audit`       | Dependency vulnerability audit (reviewed exceptions are in `pnpm-workspace.yaml`) |
| `pnpm openapi:generate` | Writes the OpenAPI document to `apps/api/generated/openapi.json` (ignored)        |

Single project targets run with `pnpm nx run <project>:<target>`, for example
`pnpm nx run @vertex-os/api:test`.

## Repository layout

```text
apps/api          NestJS on Fastify: configuration, health endpoints, errors, logging, OpenAPI
apps/web          React + Vite + TanStack Router/Query + Tailwind CSS technical shell
apps/web-e2e      Playwright smoke test of the browser -> web -> API path
packages/database Backend-only PostgreSQL/Prisma 7 client boundary
infra/compose.yaml Local PostgreSQL for development
scripts/          Local environment setup
docs/             Canonical documentation and execution plans
```

## Current limitations (Phase 0)

- **No authentication or authorization yet.** The approved design (Keycloak over OIDC with the API as
  a backend-for-frontend holding the session) is specified next, in `docs/modules/iam.md`. The only
  endpoints are the public technical health endpoints.
- No business modules, tables, migrations or seed data.
- No CI workflow: the repository does not yet identify a source-control/CI provider. CI should run
  `pnpm install --frozen-lockfile`, `pnpm verify:full` and `pnpm deps:audit`.
