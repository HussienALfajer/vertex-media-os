# Vertex OS — Claude Code Instructions

@AGENTS.md

Treat `AGENTS.md` as the canonical repository-wide agent contract, including its Run Contract.

Do not duplicate its rules in this file. This file holds only what is specific to Claude Code.

Before modifying files:

* Check whether a more specific `AGENTS.md` applies to the target directory.
* Inspect the existing implementation and repository state before making assumptions.
* Read only the documentation relevant to the current task.

For review or audit tasks, do not modify the repository unless changes were explicitly requested.

Keep plans proportional to the task. Trivial changes do not require elaborate planning; significant architectural, cross-domain, migration, or refactoring work should be planned before editing.

Do not expand the requested scope merely because adjacent improvements are possible.

If repository evidence conflicts with documentation in a way that materially affects correctness, security, data integrity, architecture, or public contracts, surface the conflict instead of silently choosing a new direction.

## Delivery skills

* `/stage <stage-id>` runs the next Master Plan run end to end: plan, implement, verify, review, pull request.
* `/audit <checkpoint>` runs a deep audit at a Master Plan checkpoint or the Final Module Audit.
* Both implement `docs/PLANNING.md`. If a skill and the document disagree, the document wins; report the mismatch.

## Effort and reasoning

* Sessions default to `medium` effort. Effort is the only thinking control; do not add "think carefully" style instructions to prompts, plans or skills.
* Tier A runs at `high` (`/stage` checks this before any work). `/audit` runs at `xhigh`. The `vertex-reviewer` subagent runs at `high`.
* Use `low` for mechanical edits, status updates and short factual answers.

## Subagents

* Use subagents for fan-out work: reviews by concern, repository-wide searches, audits split by area.
* A subagent's report is a claim. Check its evidence before accepting a finding or acting on it.
* Give reviewers the plan, the cited specification sections and the diff. Do not give them the implementer's report.

## Long runs

* At session start, `.claude/hooks/sync-main.sh` fast-forwards the local `main` and reports one line when it changed something or could not.
* Keep run progress in the plan's checklist so it survives context compaction; read the checklist, not the scrollback, to resume.
* Accept mid-run additions from the owner without restarting the run.

## UI work

* `docs/DESIGN_SYSTEM.md` governs all UI, including Section 43 (Forbidden Patterns).
* Do not use the globally installed `ui-ux-pro-max` skills in this repository. They assume shadcn/ui and generic styling, which this project forbids.
