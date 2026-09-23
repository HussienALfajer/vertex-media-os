---
name: stage
description: Run the next Vertex OS Master Plan run end to end — preflight, plan, implement, verify, in-run review, pull request — following docs/PLANNING.md. Only when the owner types /stage.
argument-hint: <stage-or-run-id, e.g. IAM-MP-03>
disable-model-invocation: true
---

# Stage run: $ARGUMENTS

`docs/PLANNING.md` is canonical. This skill is its procedure for Claude Code. If they disagree, follow the document and report the mismatch. Work under the Run Contract in `AGENTS.md`: keep going, stop only for its listed reasons.

## 1. Identify the run

- Find the module's Master Plan under `docs/plans/<module>/`. Locate the run that contains `$ARGUMENTS` in its "Runs, tiers and checkpoints" table and its ledger. If no argument was given, take the run whose stages are `READY`.
- The run must be `READY`, and every checkpoint before it must be accepted. If not, stop and say what is missing.

## 2. Effort gate (the only stop before work)

Current effort: `${CLAUDE_EFFORT}`. If the run is Tier A and the effort is `low` or `medium`, stop now and ask the owner to raise it for this session (`/effort`, choose `high`, press `s`), then run `/stage $ARGUMENTS` again. Otherwise continue.

## 3. Preflight

- `git status --short` is empty; `git switch main`; `git pull --ff-only`; the latest CI run on `main` is green (`gh run list --branch main --limit 1`).
- Read, and only read: `docs/PLANNING.md` Sections 4 to 8; the Master Plan header, locked invariants, Section "Runs, tiers and checkpoints", each stage section of this run, and the ledger; the specification sections those stage sections cite; the previous run's Hand-off section or, for the first run under this method, the carried-forward items listed in the stage sections. Open other canonical documents only when the work touches their concerns.
- Create the branch `<module>/r<NN>-<short-name>` (for example `iam/r01-keycloak-environment`).

## 4. Plan

- Write `docs/plans/<module>/<MODULE>_R<NN>_<SHORT_NAME>_PLAN.md` with the sections of `docs/PLANNING.md` Section 7, under about 40 KB. State outcomes and decisions. Do not prescribe code the repository already determines.
- Resolve open questions inside the accepted documents and record them as decisions. List owner decisions only for items under "Changes Requiring Explicit Approval" in `AGENTS.md` or questions the specification leaves to the owner.
- Commit the plan as the branch's first commit.
- If there are owner decisions, stop: present each with options and a recommendation. This is the run's planned checkpoint. Otherwise continue.

## 5. Implement

- Work milestone by milestone. Tick the plan checklist as each item is done, and resume from the checklist after any context compaction.
- Record deviations and discoveries in the plan as they happen: what, why, and the evidence.
- Commit at coherent milestones.

## 6. Verify

- Narrowest checks while working. Before review: `pnpm verify` plus the integration suites of every touched project, and `pnpm test:e2e` when browser journeys or visual baselines changed.
- Leave `pnpm verify:full` and `pnpm deps:audit` to CI unless CI cannot run or a failure must be reproduced.
- Use `NX_DAEMON=false` when capturing Nx output.

## 7. In-run review

- Launch the reviewers named for this run in the Master Plan, in parallel, as `vertex-reviewer` subagents. Give each: its one concern, the plan path, the cited specification sections, the range `main...HEAD`, and the instruction to follow `.claude/skills/audit/review-brief.md`. Do not pass your report or reasoning.
- Check the evidence of every finding before accepting it. Reject findings whose evidence does not hold, and say why.
- Fix every blocking finding, re-verify, and re-run the reviewer of that concern when a fix is more than local.
- Record non-blocking findings as carried-forward items on the stages that will resolve them.

## 8. Deliver

- In the Master Plan ledger: set this run's stages to `COMPLETE` and the next run's stages to `READY` (unless a checkpoint audit comes first), and attach carried-forward items to their stages. Set the plan status to `COMPLETE — pending merge` and write its Hand-off section.
- Commit, push the branch (`git push -u origin <branch>`), and open a pull request to `main` with `gh pr create`. The description is the run report below, with a link to the plan.
- Watch CI (`gh pr checks --watch`). Fix failures on the branch.
- Never merge, push to `main`, or force-push.

## 9. Report

End with the Run Contract headings: **Needs the owner** (first line: "Review and merge PR #<n>" plus any decisions), **Changed**, **Verified** (every command actually run and its result, including CI), **Not verified**, **Found**. Then stop.
