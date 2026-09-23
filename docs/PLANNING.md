# Vertex OS — Planning & Delivery Method

## Purpose

This document defines how every Vertex OS module is specified, planned, implemented, reviewed and accepted.

The method is built for long autonomous Claude Code runs. One run carries one planned unit of work from plan to reviewed pull request. The repository, not conversation memory, carries the project forward. Rigor scales with risk: every run is reviewed, and deep independent audits are reserved for the checkpoints where risk concentrates.

---

## Delivery Flow

```text
Accepted module specification
        ↓
Module Master Plan (stages, runs, risk tiers, audit checkpoints)
        ↓
Stage run — one Claude Code session
    preflight → plan → [owner decision, only if needed] → implement
    → verify → in-run review → pull request → CI
        ↓
Owner merges the pull request  =  accepted baseline
        ↓
Deep audit, only where the Master Plan places a checkpoint
        ↓
Next run from the new baseline
        ↓
...
        ↓
Final Module Audit  →  module complete
```

This flow is mandatory for every module. A module small enough for one run still has an accepted specification, a one-run Master Plan and a Final Module Audit.

---

## 1. Module Specification

Implementation planning starts only after the module specification is accepted.

The specification defines **what the module must do**: purpose, scope and non-goals, ownership and boundaries, domain model, security requirements, API and behavioral contracts, failure semantics, invariants, integrations, frontend behavior, testing requirements and deferred work.

It is not an implementation plan.

---

## 2. Master Plan

Each module has one roadmap-level Master Plan at `docs/plans/<module>/<MODULE>_MASTER_PLAN.md`.

It defines:

- stages, their order and dependencies;
- runs: which stages each run delivers together;
- the risk tier of each run (Section 4);
- deep-audit checkpoints (Section 9);
- stage-level objectives, deliverables, entry and exit criteria, and review focus;
- carried-forward items attached to the stage that must resolve them;
- the status ledger.

It must not contain file-level steps for future stages, speculative decisions, copies of the specification, large code examples, or narrative history. Git history and pull requests carry history. An amendment record is written only when the roadmap itself changes: stage order, a split or merge of runs, a new checkpoint, or a new dependency.

### Status model

```text
PLANNED → READY → IN_PROGRESS → IN_REVIEW → COMPLETE
(any active state may become BLOCKED)
```

- `IN_PROGRESS` and `IN_REVIEW` describe an open run branch and an open pull request. They are visible on GitHub and are not committed to `main`.
- `COMPLETE`: the pull request is merged. The run's pull request sets its stages to `COMPLETE`, so the ledger on `main` changes exactly when the owner merges.
- `BLOCKED` is committed only when a stage cannot proceed for a reason that outlives a run.
- A run after a deep-audit checkpoint does not start until that checkpoint's audit is accepted.

---

## 3. Rolling-Wave Planning

The Master Plan describes the whole route. Only the next run is planned in detail, and only from the merged `main` that the previous run produced.

A run plan is based on:

- the current `main`;
- the accepted specification;
- the Master Plan;
- the hand-off of the previous run and of the latest deep audit;
- current repository constraints.

---

## 4. Risk Tiers

Every run has a tier in the Master Plan. The tier sets how much review the run receives and the session effort. It does not lower the standard of implementation.

| Tier | Typical scope | In-run review | Deep audit | Session effort |
|---|---|---|---|---|
| **A — Critical** | Authentication, sessions, authorization, privilege changes, secrets, money, cross-module transactions, migrations that rewrite or delete data | Three reviewers | At Master Plan checkpoints and in the Final Module Audit | `high` |
| **B — Standard** | Domain behavior, additive persistence, APIs, administration UI, integrations without credentials | Two reviewers | Final Module Audit only | `medium` |
| **C — Low** | Documentation, tooling, test hardening, UI polish without behavior change | Self-review against the plan | None | `medium` or `low` |

When a run mixes tiers, the highest tier applies.

---

## 5. Run Size

A run is sized for **reviewability**, not for context. Claude Code sessions have large context windows and compact older turns automatically; the plan's checklist keeps progress safe across compaction.

A run is the right size when:

- it covers one coherent risk surface;
- its pull request can be reviewed confidently in one careful pass;
- it needs at most one owner decision checkpoint.

Adjacent stages that share a risk surface may run together; the Master Plan names them. The planner may split a run at planning time when the expected diff would not be reviewable, and records the split in the plan and the Master Plan. Merging runs is a Master Plan change.

---

## 6. The Stage Run

One Claude Code session executes one run. In Claude Code, `/stage <stage-id>` starts it.

### 6.1 Preflight

- `main` is clean, up to date and green in CI.
- The run is `READY` and every checkpoint before it is accepted.
- Read the run's Master Plan sections, the specification sections they cite, the previous hand-off, and the carried-forward items. Read other canonical documents only when the work touches their concerns.

### 6.2 Plan

Write the run plan (Section 7). Resolve open questions inside the accepted documents yourself and record them as decisions.

List as **owner decisions** only the questions that change something under "Changes Requiring Explicit Approval" in `AGENTS.md`, or that the specification explicitly leaves to the owner. If there are owner decisions, stop and ask. This is the run's planned checkpoint. Otherwise continue without stopping.

### 6.3 Implement

Work on a branch named `<module>/r<NN>-<short-name>` (for example `iam/r01-keycloak-environment`). Follow the plan's checklist and tick each item when it is done. Record deviations and discoveries in the plan as they happen.

### 6.4 Verify

- While implementing, run the narrowest relevant checks.
- Before review, run `pnpm verify` and the integration suites of every project the run touched. Add `pnpm test:e2e` when browser journeys or visual baselines changed.
- `pnpm verify:full` and `pnpm deps:audit` are CI's job on the pull request. Run them locally only when CI cannot run, or when a failure must be reproduced.

### 6.5 In-Run Review

Before opening the pull request, fresh-context reviewers examine the change, one concern each (Section 8). Their number follows the tier. The run checks the evidence of every finding, fixes every blocking finding, re-verifies, and records non-blocking findings as carried-forward items.

### 6.6 Deliver

- Commit following the repository's commit conventions and push the branch.
- Open a pull request to `main`. The pull request description is the run report (Section 6.7) and links the plan.
- In the same pull request, set the run's stages to `COMPLETE` in the Master Plan ledger, set the next run's stages to `READY` unless a checkpoint audit comes first, and attach carried-forward items to the stages that will resolve them.
- Watch CI. Fix failures in the same run.

### 6.7 Report

The final message and the pull request description use the Run Contract headings in `AGENTS.md`: **Needs the owner**, **Changed**, **Verified**, **Not verified**, **Found**. Evidence (test counts, probe results, CI links) goes here, not into the plan.

### 6.8 Stop conditions

A run stops and asks only for the reasons in the Run Contract (`AGENTS.md`) and the plan's own stop conditions. A failing test, an ordinary bug, or a detail the canonical documents settle is not a stop.

### 6.9 Acceptance

The owner reads **Needs the owner**, reviews the pull request and merges it. The merge is the accepted baseline. If the owner does not accept the change, the pull request stays open for fixes or is closed.

---

## 7. Run Plan

Path: `docs/plans/<module>/<MODULE>_R<NN>_<SHORT_NAME>_PLAN.md` (for example `docs/plans/iam/IAM_R01_KEYCLOAK_ENVIRONMENT_PLAN.md`).

A run plan says **what** must be true when the run is done and **which** decisions bind it. It does not prescribe code the implementer can derive from the repository and the canonical documents. Link to canonical sections instead of copying them. Keep a plan under about 40 KB. Most runs need far less.

Required sections, in this order:

```text
Header          Status · Master Plan stages · Risk tier · Branch · Baseline commit
1. Objective        three to six sentences
2. Scope            in scope / out of scope
3. Inputs           cited specification sections; carried-forward items → resolution
4. Decisions        D-nn: decision and reason, one to three lines each
                    Owner decisions (only if any; the run stops for them)
5. Design notes     only what the implementer cannot derive: contracts, schema,
                    invariants, failure semantics specific to this run
6. Done means       checkable statements; mapping to the Master Plan exit criteria
7. Stop conditions  run-specific stops, in addition to the Run Contract
8. Verification     commands and targeted probes that prove Done means
9. Checklist        one line per milestone, ticked during the run
10. Hand-off        written at the end: carried-forward items, open items for the next run
```

The plan never records invented precision. Timestamps, hashes and counts appear only in the pull request report, and only when a command produced them.

---

## 8. Review

### 8.1 Reviewer contract

- Each reviewer starts with a fresh context and one concern.
- Its input is the run plan, the cited specification sections, the relevant canonical rules and the diff. It does not receive the implementer's report or reasoning.
- It reads every changed file in its concern, confirms claims with commands or probes, and changes nothing.
- It reports each finding with severity, `file:line`, why it is wrong, how to show it fails, and the evidence it gathered.

In Claude Code the reviewer is the `vertex-reviewer` subagent, and the shared review brief is `.claude/skills/audit/review-brief.md`.

### 8.2 Concerns

| Concern | Typical use |
|---|---|
| Security and authorization | Runs touching authentication, sessions, permissions, secrets, external identity, or logging of sensitive data |
| Data, migrations and concurrency | Runs touching persistence, migrations, transactions or competing operations |
| Architecture and boundaries | Runs that add or change projects, public surfaces, dependencies, composition or UI package boundaries |
| Tests and verification | Runs whose main risk sits in the test evidence: harnesses, browser journeys, hardening, or changes without persistence |
| Scope and documentation truthfulness | Checked by the run itself; a dedicated reviewer in deep audits |

A Tier A run uses three reviewers and a Tier B run two. The Master Plan names the concerns for each run; the planner may swap one when the plan shows a different risk.

### 8.3 Severity

- **Blocking** — violates Done means, a locked invariant, security, data integrity or a public contract, or makes the merge unsafe. It must be fixed before the pull request is opened.
- **Major (non-blocking)** — a real defect that the run cannot reach yet, or a risk that a named later stage must close. It is carried forward to that stage.
- **Minor** — worth fixing, with no correctness or security impact. Fix it in the run when cheap; otherwise carry it forward.
- **Info** — an observation that needs no action.

---

## 9. Deep Audits

A deep audit is an independent, read-only examination of the merged baseline in a separate Claude Code session. In Claude Code, `/audit <checkpoint>` starts it.

It is required:

- at each checkpoint the Master Plan places, normally after a cluster of Tier A runs;
- as the Final Module Audit.

A deep audit:

- covers every change merged since the previous checkpoint, against the specification, the Master Plan, the canonical documents and the actual code;
- fans out to fresh-context reviewers across every concern in Section 8.2 and checks their evidence;
- runs its own targeted probes on the risks of the audited stages;
- relies on the CI runs of the merged pull requests for the full verification gate, and re-runs a gate only when evidence is missing or doubtful;
- writes a short audit record at `docs/plans/<module>/audits/<CHECKPOINT>.md`: scope, verdict, a findings table, the probes run and their results;
- ends with exactly one verdict: `<CHECKPOINT> ACCEPTED` or `<CHECKPOINT> FIXES REQUIRED`.

The audit record is delivered in its own pull request. When the verdict is `ACCEPTED`, that pull request also sets the next run's stages to `READY` and attaches non-blocking findings to the stages that will resolve them.

Blocking findings are fixed in a dedicated fix run. Its review covers the fixes, and the audit is then re-checked only for those findings. The next run after a checkpoint does not start until the checkpoint is accepted and its record is merged.

---

## 10. Final Module Audit

After every run is complete, the Final Module Audit evaluates the module as one integrated system. It verifies, where relevant:

- full specification coverage, and that deferred items stayed deferred;
- end-to-end behavior and cross-stage consistency;
- architecture, boundaries and ownership;
- security, authorization and secret handling;
- data integrity, migrations and concurrency;
- external integrations;
- frontend and backend contract consistency, accessibility and RTL;
- observability and auditability;
- regression risk, repository cleanliness and documentation accuracy;
- production-readiness expectations set by the specification.

The module is complete only when the Final Module Audit is accepted.

---

## 11. Scope Discipline

Every run keeps strict scope boundaries. Do not:

- implement later stages early;
- silently redesign canonical architecture;
- introduce infrastructure without a demonstrated need;
- add speculative abstractions;
- perform unrelated refactors;
- weaken tests or checks to get green;
- leave temporary security bypasses;
- create undocumented cross-module dependencies.

When a run discovers a legitimate issue outside its scope, it records the issue, classifies whether it blocks the run, fixes it only if correctness or safety requires it, and otherwise carries it forward to a named stage or canonical document.

---

## 12. Documentation Authority

The repository is the source of truth. Conversation context is disposable.

```text
Canonical project documentation
        ↓
Module specification
        ↓
Module Master Plan
        ↓
Current run plan
        ↓
Merged repository state
        ↓
Review and audit evidence (pull requests, CI, audit records)
```

If conversational instructions conflict with committed canonical rules, reconcile the rules explicitly. Do not silently ignore either side.

---

## 13. Cost Discipline

Cost and quality both come from spending effort where risk is:

- **Read budget.** Read what the plan cites. Load other canonical documents only when the work touches their concerns.
- **One session per run.** Do not split plan, implementation and review into separate sessions. A separate session is used only for deep audits, because their independence depends on it.
- **Verification once per layer.** The run proves its change locally, CI proves the full gate, and audits rely on CI evidence unless it is missing.
- **Lean documents.** Plans state decisions and outcomes. Evidence lives in pull requests and CI. Audit records are short.
- **Effort by tier.** Section 4. Effort is the only thinking control.

---

## 14. Transition

Plans written before this method (Phase 0, the Design System Foundation, IAM-00 to IAM-02) are historical records. They are not rewritten, and their long execution and audit sections are not a template for new plans. Their carried-forward items remain attached to the Master Plan stages that must resolve them.

---

## Core Rule

> **One Master Plan → one run at a time → a reviewed pull request → the owner's merge is the accepted baseline → deep audits at risk checkpoints → Final Module Audit.**
