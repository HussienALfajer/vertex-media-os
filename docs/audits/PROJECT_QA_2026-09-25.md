# Vertex OS — Repository and Current UI QA

**Baseline:** merged local-auth `main` at `b4031af9492831ac7f9cef366fa966c1a25b4ec7`  
**Fix run:** [IAM-R11](../plans/iam/IAM_R11_AUDIT_FIXES_PLAN.md)  
**Scope:** executable repository, implemented IAM/Audit surfaces, current application UI, and
the repository verification ladder. This record does not accept the Final IAM Module Audit;
that audit reviews the merged fix separately under `docs/PLANNING.md`.

## 1. What exists

The repository implements a TypeScript/Nx modular-monolith foundation, PostgreSQL/Prisma,
the IAM and Audit domain capabilities and adapters, NestJS API, and React/Vertex UI. Current
administration screens cover local sign-in, account/session display, users, departments, roles,
permissions and their authorized changes. The other V1 modules in `docs/MODULES.md` describe
ownership and product direction; they are not implemented business workflows. A successful
repository gate cannot be interpreted as the complete Lead-to-Payment product being delivered.

## 2. Audit method

- Compared ADR-0001, the IAM specification amendment, `docs/SECURITY.md`,
  `docs/DESIGN_SYSTEM.md`, the Master Plan, implementation, migrations and tests.
- Used independent read-only reviews of IAM security, persistence/concurrency, project
  architecture and UI/UX. Rechecked findings against code and exercised targeted regressions.
- Inspected the local application in an isolated browser at a narrow 390×844 viewport with
  Arabic/RTL presentation: IAM navigation, role and department details, form validation,
  destructive confirmation, scrolling and console behavior. This is representative manual QA,
  not an exhaustive visual review of every state, size or browser engine.
- Exercised the disposable PostgreSQL local IAM browser journey: administrator login, employee
  creation with a role and password, employee login, permission removal, suspension, invalid
  credentials and logout. The test verifies that the browser cannot read the session cookie.
- Ran the repository's format/lint/boundary/type/unit/build gate and PostgreSQL integration
  suites. CI on the fix pull request remains the authoritative full gate, including production
  smoke, design-system browser/visual checks and dependency audit.

## 3. Findings and disposition

| Finding | Impact | Disposition |
| --- | --- | --- |
| A database upgraded from provider authentication can retain an ACTIVE System Administrator with no local password. Normal bootstrap refuses a second administrator, leaving no usable administrative sign-in. | Blocking IAM recovery defect | R11 adds explicit, one-time, operator-only credential recovery for the existing administrator. PostgreSQL tests cover wrong target, competing attempts, Audit rollback and sign-in. |
| IAM role and department state confirmations could proceed without a verified affected count when the count read failed or was stale at dialog open. | Misleading sensitive-action review | R11 refreshes the count on entering review, blocks confirmation until it succeeds and provides retry. Actors without count-read permission see the full effect stated without an unauthorized count. |
| List rows could remain visible after a failed background refresh with no stale-data notice. | Misleading UI state | R11 labels authorized cached rows as stale and offers retry; authorization failures suppress protected rows. |
| Role activation treated a permission absent from the bounded catalog page as ACTIVE and counted it as a certain grant. | Incorrect permission review | R11 reads the needed catalog pages when allowed, counts only verified ACTIVE mappings and disables activation if a mapped permission cannot be verified. A role manager without catalog-read permission sees the whole active-mapping scope without a guessed count. |
| IAM acceptance and operational comments still described Keycloak/OIDC/TOTP as current. | Conflicting acceptance evidence | R11 updates the current evidence map, Master Plan criteria, CLI/README and active code comments. Historical specifications remain in Git and are explicitly superseded by IAM Section 61 and ADR-0001. |
| Provider-specific session methods and an unused token-encryption secret requirement remain compiled, although the local runtime never configures a provider and rejects provider-backed sessions. | Literal full-removal gap and unnecessary startup configuration | Carry to a focused IAM-R12 cleanup before the Final Module Audit. Preserve historical migration data; do not remove live tables or columns without a reviewed migration. |

## 4. Verification evidence

- `corepack pnpm verify` — passed on the final reviewed code diff: format, lint, boundary
  probes, types, unit/API/UI tests and builds.
- `corepack pnpm test:integration` — passed for API, database, IAM persistence and Audit
  persistence on the final R11 diff. The database migration target also passed independently
  after its synthetic ACTIVE administrator fixture was corrected (6 files, 36 tests).
- App-local Vitest for organization and user UI — 2 files, 87 tests passed after the review
  fixes; the final activation authorization adjustment passed its focused 44-test file.
- `corepack pnpm nx run @vertex-os/web-e2e:e2e-iam` — 2 Chromium tests passed against a
  disposable PostgreSQL stack, covering the current local-auth journey and negative/logout case.
- Independent manual mobile QA found no overflow or browser console error in the inspected
  screens; this observation is bounded to the inspected pages and viewport.

The [final IAM-R11 CI run](https://github.com/HussienALfajer/vertex-media-os/actions/runs/36206766684)
passed `pnpm verify:full` and `pnpm deps:audit` on pull request #24. Its dependency audit reported
only the reviewed exceptions in repository policy. The Final IAM Audit record cites merged CI,
probes and its independent verdict.

## 5. Remaining boundaries

- Production launch still requires server-specific scrypt benchmarking, compromised-password
  checks, HTTPS/security alert configuration and the Contabo deployment topology decision in
  `docs/SECURITY.md` and the current IAM evidence map.
- General password replacement and self-service recovery are separate workflows. The R11
  migrated-administrator command is not a general reset.
- IAM-R12 will remove dormant provider session methods and the unused token-encryption startup
  requirement. The accepted local sign-in path already makes no provider request; the historical
  identity mapping and data-preserving migration remain necessary.
- Browser IAM E2E currently exercises Chromium. Design-system lab behavior and visual baselines
  are checked across Chromium, Firefox and WebKit by the full gate; the IAM-specific employee
  journey is not independently run in all three engines.
- Manual QA covered representative current IAM views. It did not certify every UI state, every
  locale/viewport combination or unimplemented business modules.
