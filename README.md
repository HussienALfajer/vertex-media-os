# Vertex OS

Vertex Media's internal operating platform is a TypeScript modular monolith: NestJS on Fastify,
React with Vite, PostgreSQL through Prisma 7, pnpm and Nx. The IAM module owns accounts, password
hashes, roles, permissions, departments and access state. The API owns opaque application sessions.
Sign-in is an email and password form in the Vertex UI. There is no external identity provider or
second authentication factor. The accepted change is recorded in
[ADR-0001](docs/adr/0001-local-password-authentication.md).

Canonical product and engineering documents are in [docs](docs/); agents follow [AGENTS.md](AGENTS.md).

## Prerequisites

- Node.js 24 (see `.node-version`) and pnpm 12.5.1 (see `package.json`).
- Docker with Compose v2 for PostgreSQL, database integration tests and Playwright visual tests.

## Local setup

```sh
pnpm install
pnpm env:setup
pnpm infra:up
pnpm db:migrate
pnpm iam:sync-reference
```

`env:setup` creates the ignored `.env` with a generated local PostgreSQL password and preserves
existing values. The default database and API listen on loopback. If PostgreSQL port 5432 is taken,
change `POSTGRES_PORT` and `DATABASE_URL` in `.env`. Never use production secrets in this file.

The first administrator is created by an explicit operator command. Set a strong password in the
process environment, then run:

```sh
pnpm iam:bootstrap --email info@vertexmedia.pro
```

`IAM_BOOTSTRAP_PASSWORD` must be present in that process environment; it is never a CLI argument,
logged value, committed default or generated account. On PowerShell, set it only for the command
session and remove it afterward. Bootstrap requires `iam:sync-reference` to have created the
protected System Administrator role. The command refuses an existing email; it does not reset or
overwrite an account. The current owner administrator was provisioned in the local development
database during the local-auth migration. Deploying elsewhere requires running the migrations,
reference synchronization and bootstrap against that environment.

Start the application with `pnpm dev` (or `pnpm dev:api` and `pnpm dev:web`). Open
`http://127.0.0.1:4200/`, enter the administrator email and password, then use **Users → Add user**
to create employee accounts. Each employee gets an email and password. The administrator can
select roles on the creation screen; the backend enforces the actor's grant ceiling. Role mappings
control permissions, and the account becomes active on its first successful sign-in.

| Address                                  | Purpose                                        |
| ---------------------------------------- | ---------------------------------------------- |
| `http://127.0.0.1:4200/`                 | Application and sign-in form                   |
| `http://127.0.0.1:3000/api/health/live`  | API liveness                                   |
| `http://127.0.0.1:3000/api/health/ready` | PostgreSQL readiness                           |
| `http://127.0.0.1:3000/api/docs`         | OpenAPI UI (disabled by default in production) |

## Authentication and IAM

`POST /api/auth/login` accepts JSON email and password and sets an opaque, `Secure`, `HttpOnly`,
`SameSite=Strict` cookie. The password is held only long enough to verify the salted scrypt hash.
The browser never stores a password or session secret. Unknown accounts and incorrect passwords
receive the same failed-login response; attempts are rate-limited. `GET /api/auth/session` reads
the current user, `GET /api/auth/csrf` provides the token required for unsafe authenticated
requests, and `POST /api/auth/logout` revokes the session. Sessions expire after 30 minutes idle
and 10 hours total by default. Access state and effective permissions are checked on each request.

The `/api/iam` routes provide the user directory, creation, role assignments, departments, role
management, access restriction, session revocation and the permission catalog. They require a
session and the route's IAM permission; writes require the CSRF token. Problem responses follow
RFC 9457 and include a stable code and trace ID. The OpenAPI document is available at
`/api/docs/openapi.json` and via `pnpm openapi:generate`.

Existing users from the previous identity-provider schema retain their IAM data. The local-auth
migration copies old issuer and subject identifiers into a legacy mapping table, then sets the
active identity to the local user ID. Old provider-backed sessions cannot authenticate. Existing
users without a local password cannot sign in until an administrator with
`iam.users.manage-access` sets their initial password using
`POST /api/iam/users/:userId/password` with the current `expectedVersion`, a 15–128 character
password and a CSRF token. The action is audited and can be used only once per legacy account.
The new administrator account and all new staff accounts have local passwords.

## Database and commands

| Command                                 | Purpose                                                             |
| --------------------------------------- | ------------------------------------------------------------------- |
| `pnpm infra:up` / `pnpm infra:down`     | Start / stop the local PostgreSQL service; data is retained         |
| `pnpm infra:reset`                      | Delete the local PostgreSQL volume (destructive)                    |
| `pnpm db:validate` / `pnpm db:generate` | Validate the schema / generate the Prisma client                    |
| `pnpm db:migrate`                       | Apply forward-only migrations; API startup never migrates           |
| `pnpm iam:sync-reference`               | Synchronize permission catalog and protected system role            |
| `pnpm iam:bootstrap --email <address>`  | Create the first local administrator using `IAM_BOOTSTRAP_PASSWORD` |

The Prisma schema lives under `packages/database/prisma/schema/`; migrations live under
`packages/database/prisma/migrations/`. `iam:sync-reference` runs in one transaction and audits
changes. If Prisma reports a failed migration, investigate the database and use its documented
`migrate resolve` flow only after correcting the cause; do not edit an already applied migration.

## Verification

| Command                              | Runs                                                                       |
| ------------------------------------ | -------------------------------------------------------------------------- |
| `pnpm format:check`                  | Prettier check                                                             |
| `pnpm lint` / `pnpm lint:boundaries` | ESLint and architecture boundary probes                                    |
| `pnpm typecheck`                     | TypeScript checks                                                          |
| `pnpm test`                          | Unit, API and frontend tests                                               |
| `pnpm build`                         | Production builds                                                          |
| `pnpm test:integration`              | Disposable PostgreSQL integration tests (Docker required)                  |
| `pnpm test:e2e`                      | Production smoke, design-system visual tests and local IAM browser journey |
| `pnpm verify`                        | Fast gate: formatting, lint, boundaries, types, tests, builds              |
| `pnpm verify:full`                   | Fast gate plus Prisma, integration and Playwright                          |
| `pnpm deps:audit`                    | Dependency vulnerability audit                                             |

CI runs `pnpm install --frozen-lockfile`, `pnpm verify:full` and `pnpm deps:audit` on pull requests
to `main`. Playwright's IAM stack starts its own disposable PostgreSQL container and bootstraps a
synthetic administrator; it does not read the development database or its credentials.

## Repository layout

```text
apps/api                   Fastify API, local sign-in and IAM HTTP
apps/web                   React application and Vertex UI
apps/web-e2e               Playwright browser journeys
domains/iam                IAM domain rules
domains/iam-persistence    IAM-owned Prisma adapters
domains/audit              Audit contracts and behavior
domains/audit-persistence  Append-only Audit recorder
packages/database          PostgreSQL and Prisma boundary
packages/ui                Vertex design system
infra/compose.yaml         Local PostgreSQL
docs/                      Canonical documents and plans
```

## Current limitations

- The one-time password initialization for migrated users is available through the API; its
  form has not yet been added to the user detail screen.
- Local HTTP development uses `Secure` cookies on loopback; production must serve the application
  through HTTPS. WebKit may reject secure cookies on HTTP loopback.
- MOD-AUDIT writes immutable records but has no read interface yet. `/dev/ui` proof scenarios use
  synthetic design data.
