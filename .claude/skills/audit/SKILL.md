---
name: audit
description: Deep independent audit of a Vertex OS Master Plan checkpoint or a Final Module Audit, run in its own fresh session, following docs/PLANNING.md Sections 8 to 10. Only when the owner types /audit.
argument-hint: <checkpoint, e.g. IAM-CP1 | IAM-CP2 | IAM-FINAL>
disable-model-invocation: true
effort: xhigh
---

# Deep audit: $ARGUMENTS

`docs/PLANNING.md` is canonical; this skill is its procedure. The audit is read-only for everything except its own record and the Master Plan ledger. Work under the Run Contract in `AGENTS.md`.

Independence is the point of this session. Merged plans, pull request descriptions and earlier reports are claims. Code, tests, command output, CI results and database state are evidence.

## 1. Scope

- In the module's Master Plan, find `$ARGUMENTS` in "Runs, tiers and checkpoints" and the ledger. The runs it covers must all be merged. `-FINAL` means the Final Module Audit (the Master Plan's Final Module Audit section).
- Range: from the commit recorded as audited by the previous checkpoint's record (or, for the first checkpoint, the last accepted baseline before the covered runs) to the current `origin/main`. List the merged pull requests in that range.
- `git switch main`, `git pull --ff-only`, and make sure `git status --short` is empty.

## 2. Read

`docs/PLANNING.md` Sections 8 to 10; the Master Plan's locked invariants, the covered stage sections (especially "Audit focus"), and the ledger; the specification sections those stages cite; the covered run plans (Decisions, Done means, Hand-off). Other canonical documents as the concerns require.

## 3. CI evidence

For each covered pull request, confirm that CI ran `pnpm verify:full` and `pnpm deps:audit` green on its final commit (`gh pr checks <n>`, `gh run view <id>`). Re-run a gate locally only where that evidence is missing or doubtful, and say so.

## 4. Fan out

Launch five `vertex-reviewer` subagents in parallel, one per concern in `.claude/skills/audit/review-brief.md`: security and authorization; data, migrations and concurrency; architecture and boundaries; tests and verification; scope and documentation truthfulness. Give each the concern, the range, the covered plan paths and the cited specification sections. For `-FINAL`, also give each the Final Module Audit criteria of the Master Plan that fall in its concern.

## 5. Own probes

While the reviewers work, probe the covered stages' "Audit focus" yourself: negative security probes, concurrency and failure-path tests against a throwaway PostgreSQL or Keycloak container you name uniquely and remove, boundary probes through ESLint `lintText`, and log inspection with real failures. Never touch containers, volumes or compose projects you did not create.

## 6. Judge

- Check the evidence of every reviewer finding. Reject findings whose evidence does not hold, and say why.
- Classify with the severity scale of `docs/PLANNING.md` Section 8.3.
- Verdict: `$ARGUMENTS ACCEPTED` when no blocking finding remains; otherwise `$ARGUMENTS FIXES REQUIRED`.

## 7. Record and deliver

- Write `docs/plans/<module>/audits/$ARGUMENTS.md`, short: scope (range, pull requests, audited commit), verdict, findings table (ID, severity, file:line, finding, evidence, owner stage), probes run and their results, and what was not verified.
- Ledger: when `ACCEPTED`, set the checkpoint `COMPLETE` and the next run `READY`, and attach non-blocking findings to the stages that will resolve them. When `FIXES REQUIRED`, leave statuses unchanged and name the fix run the owner should start.
- On branch `<module>/audit-<checkpoint-lowercase>`: commit, push, and open a pull request to `main` whose description is the report below. Never change production code, merge, or push to `main`.

## 8. Report

End with the Run Contract headings: **Needs the owner** (the verdict, then "Review and merge PR #<n>"), **Changed**, **Verified**, **Not verified**, **Found**. Then stop.
