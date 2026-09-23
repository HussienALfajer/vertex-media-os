# Vertex OS Review Brief

Shared by in-run reviews (`/stage`) and deep audits (`/audit`). Canonical rules: `docs/PLANNING.md` Section 8.

## Inputs you receive

- **Concern**: exactly one of the concerns below.
- **Plan**: the run plan path, or the checkpoint scope for a deep audit.
- **Specification**: the cited sections of `docs/modules/<module>.md`.
- **Diff**: a Git range (for example `main...HEAD`) or a list of merged pull requests.

You do not receive the implementer's report. If a plan section records outcomes, treat it as a claim.

## Method

1. Read the plan's Objective, Scope, Decisions, Done means and Stop conditions, and the cited specification sections.
2. List the changed files in your concern: `git diff --stat <range>`. Read each one completely, including tests.
3. Check the change against the concern checklist, the plan's Done means, and the locked invariants of the module's Master Plan.
4. Confirm each suspected defect with evidence: run the relevant test or lint target, write a probe (an ESLint `lintText` case, a SQL query against a throwaway PostgreSQL container, a scratch script), or cite the exact lines that prove it.
5. Check that the tests would fail without the change they protect. A test that cannot fail is a finding.
6. Report. Do not fix.

## Concern checklists

### Security and authorization

- Deny by default; no route, command or UI path becomes reachable without the required authentication and permission.
- Backend authority: no rule enforced only in the frontend; role names never authorize behavior.
- Secrets, tokens, session identifiers, PKCE material, passwords and personal data never reach logs, errors, API responses, fixtures or committed configuration. Check the error and logging paths with real failures, not only the happy path.
- External identity: issuer and subject binding, ownership proof, no unsafe re-linking, fail-closed ordering around remote calls.
- Input validation at the boundary; over-posting rejected; stable error contracts (RFC 9457).
- Privilege changes take effect on the next request; no stale authorization cache.

### Data, migrations and concurrency

- Each migration is atomic, reviewed line by line, and reproducible from an empty database; no destructive statement without an explicit plan decision.
- Structural invariants live in named database constraints where the specification requires them.
- Transactions: correct boundaries, no remote I/O inside, cross-module writes only through the owning module's public capability.
- Competing operations are proven with truly concurrent tests; lock ordering is safe; optimistic versions cannot be bypassed.
- Idempotent operations converge on a rerun without duplicates.

### Architecture and boundaries

- Module ownership per `docs/MODULES.md`; no deep imports; no Prisma or generated types in public surfaces or domain cores.
- Nx tags and ESLint restrictions still reject forbidden edges. Probe them: dynamic and type-query imports, interpolated specifiers, `createRequire`, bracket or destructured access to unsafe raw SQL.
- No speculative abstraction, dependency or infrastructure; composition happens in composition roots.
- Configuration is typed and centralized; no raw environment access outside the approved bridges.

### Tests and verification

- Every Done means item has evidence at the lowest layer that can prove it (`docs/TESTING.md` Section 68).
- No `.only`, `.skip`, retries, arbitrary sleeps, or weakened assertions; names state behavior.
- PostgreSQL behavior is proven against PostgreSQL, not mocks.
- Browser journeys only where a critical journey changed; locators are resilient; visual baselines changed deliberately.
- The verification commands in the plan were actually run, or CI ran them.

### Scope and documentation truthfulness

- Nothing from a later stage or outside the plan slipped in; out-of-scope discoveries are carried forward, not silently fixed or dropped.
- Canonical documents, README and the Master Plan match the code after the change.
- The plan and report contain no invented precision: every count, timestamp or hash traces to a command.

## Severity

Use the scale of `docs/PLANNING.md` Section 8.3: **Blocking**, **Major (non-blocking)**, **Minor**, **Info**. When unsure between two levels, choose the higher one and say why.

## Output format

```text
Concern: <concern>
Range: <git range or pull requests>
Verdict: NO BLOCKING FINDINGS | BLOCKING FINDINGS

| ID | Severity | File:line | Finding | How to show it fails | Evidence |
|----|----------|-----------|---------|----------------------|----------|

Checked and clean: <short list of what you examined and found correct>
Not confirmed: <what you could not verify, and where you looked>
Outside my concern: <one line each, or "None">
```

Keep the report short. Evidence is a command and its relevant output, or exact `file:line` references.
