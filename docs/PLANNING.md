# Vertex OS — Planning & Delivery Method

## Purpose

This document defines the standard planning, implementation, audit, and delivery method for every Vertex OS module.

The objective is to keep implementation work small enough to be completed professionally in a single Claude Code conversation, while preserving architectural consistency, security, verification quality, and reliable project continuity.

---

## Canonical Delivery Flow

Every module follows this sequence:

```text
Final Module Specification
        ↓
Create Module Master Plan
        ↓
Create the Next Executable Plan Only
        ↓
Implement the Plan in One Claude Code Conversation
        ↓
Independent Audit
        ↓
Fix Blocking Findings
        ↓
Re-Audit if Required
        ↓
Accept the New Repository Baseline
        ↓
Create the Next Executable Plan from the New Baseline
        ↓
Implement
        ↓
Audit
        ↓
...
        ↓
Complete All Master Plan Stages
        ↓
Final Module Audit
        ↓
Module Accepted as Complete
```

This flow is mandatory unless a module is intentionally small enough to be completed safely in a single plan.

---

## 1. Final Module Specification

Before implementation planning begins, the module must have an approved canonical specification.

The specification defines:

- module purpose;
- scope and non-goals;
- ownership and boundaries;
- domain model;
- security requirements;
- API and behavioral contracts;
- failure semantics;
- architectural invariants;
- required integrations;
- expected frontend behavior;
- testing requirements;
- deferred work.

The specification defines **what the module must do**.

It must not become a step-by-step implementation plan.

Implementation planning begins only after the specification is considered ready.

---

## 2. Module Master Plan

After the specification is approved, create one module-level Master Plan.

Example:

```text
docs/plans/<module>/<MODULE>_MASTER_PLAN.md
```

The Master Plan is the execution roadmap for the entire module.

It defines:

- implementation stages;
- stage ordering;
- dependencies between stages;
- major deliverables;
- high-level entry and exit criteria;
- security or architectural checkpoints;
- expected audit checkpoints;
- stage status.

The Master Plan should remain stable at the roadmap level.

It may be updated when the real repository state justifies a change, but it must not duplicate the detailed contents of every executable plan.

### The Master Plan must not contain

- detailed file-by-file implementation steps for every future stage;
- speculative implementation decisions that have not yet become necessary;
- duplicated canonical specification content;
- large code examples;
- detailed plans for stages that are still far in the future.

Its purpose is to answer:

> What is the safest and most logical sequence for completing this module?

---

## 3. Rolling-Wave Planning

Do not create all detailed implementation plans in advance.

The Master Plan describes the full route, but only the **next executable plan** is fully detailed.

The workflow is:

```text
Master Plan
    ↓
Detail Plan 01
    ↓
Implement Plan 01
    ↓
Audit Plan 01
    ↓
Accept Baseline
    ↓
Detail Plan 02 using the real repository state
    ↓
Implement Plan 02
    ↓
Audit Plan 02
    ↓
...
```

This prevents later plans from being based on assumptions that may become invalid after earlier implementation work.

Every new detailed plan must be based on:

- the current `main` branch;
- the approved module specification;
- the Master Plan;
- all previously completed plan outcomes;
- the most recent accepted audit;
- current repository constraints.

---

## 4. Executable Plan Size

Each executable plan must be small enough to be completed professionally in **one Claude Code conversation**.

A plan is too large if:

- it spans several major architectural concerns;
- it requires unrelated implementation domains;
- its expected diff is too broad to review confidently;
- its testing surface cannot reasonably be completed in one session;
- it is likely to exhaust conversational context;
- the implementation agent would need to continue into another conversation to finish it.

If any of these are true, split the plan before implementation.

The objective is not to minimize the number of plans.

The objective is to maximize correctness, reviewability, and execution quality.

---

## 5. Required Executable Plan Structure

Each detailed implementation plan should contain, where relevant:

```text
Status
Parent Specification
Parent Master Plan
Dependencies
Entry Criteria
Objective

In Scope
Out of Scope

Locked Architectural Decisions
Security Invariants
Module Boundaries

Current Repository Baseline

Required Repository Changes
Implementation Workstreams
Expected Files / Packages
Database Changes
API Changes
Frontend Changes
Integration Changes
Failure Handling
Concurrency Considerations
Observability / Audit Requirements

Required Tests
Verification Commands

Definition of Done
Exit Criteria
Repository State Required by the Next Plan
```

The plan must be explicit enough to execute without relying on prior conversation memory.

At the same time, it should not over-prescribe low-level implementation details when repository conventions already define them.

---

## 6. One Plan per Implementation Conversation

Each Claude Code implementation conversation executes **one executable plan only**.

The implementation agent must not continue into the next Master Plan stage because related work appears convenient.

The agent may make only changes required to satisfy the current plan and its Definition of Done.

When the current plan is complete:

```text
STOP IMPLEMENTATION
```

The resulting repository state must then be independently audited.

---

## 7. Independent Audit after Every Plan

Every completed implementation plan receives an independent audit before the next detailed plan is created.

The audit must verify, where applicable:

- all required work was actually implemented;
- no required scope was skipped;
- no unrelated scope was introduced;
- architecture remains consistent;
- module boundaries remain intact;
- security invariants remain intact;
- database constraints and migrations are correct;
- external integration behavior is safe;
- concurrency behavior is correct;
- failure modes are handled explicitly;
- tests genuinely cover the required behavior;
- repository verification passes;
- documentation remains synchronized;
- no hidden workaround or unnecessary technical debt was introduced;
- the repository is safe to become the baseline for the next plan.

The implementation agent's own final report is evidence, not the final audit.

---

## 8. Findings and Re-Audit

If the audit discovers blocking defects:

```text
Implementation
        ↓
Independent Audit
        ↓
Blocking Findings
        ↓
Targeted Fixes
        ↓
Re-Verification
        ↓
Re-Audit
        ↓
Accepted Baseline
```

The next executable plan must not begin until the current plan has an accepted baseline.

Non-blocking deferred items must be explicitly recorded in the appropriate canonical document or Master Plan rather than left implicit.

---

## 9. Accepted Repository Baseline

A plan is considered closed only after:

1. its Definition of Done is satisfied;
2. required verification has passed;
3. its independent audit has no unresolved blocking findings;
4. any required fixes have been re-audited;
5. relevant documentation is synchronized;
6. the resulting repository state is accepted.

That accepted state becomes the baseline for planning the next stage.

The next plan must be written from that actual baseline, not from the assumptions that existed before implementation.

---

## 10. Master Plan Status Tracking

The Master Plan should track each stage using a small consistent state model such as:

```text
PLANNED
READY
IN_PROGRESS
AUDIT_REQUIRED
BLOCKED
COMPLETE
```

A stage becomes `COMPLETE` only after its implementation and audit are accepted.

The Master Plan should also identify the next stage eligible for detailed planning.

---

## 11. Final Module Audit

After all Master Plan stages are complete, perform a dedicated **Final Module Audit**.

This audit evaluates the module as one integrated system rather than as isolated implementation stages.

It should verify, where relevant:

- full specification coverage;
- end-to-end behavior;
- cross-stage consistency;
- architecture;
- security;
- authorization;
- data integrity;
- migrations;
- concurrency;
- external integrations;
- frontend/backend contract consistency;
- accessibility;
- observability;
- auditability;
- E2E flows;
- regression risk;
- repository cleanliness;
- documentation accuracy;
- production-readiness expectations defined by the specification.

The module is not considered complete until the Final Module Audit is accepted.

---

## 12. Scope Discipline

Every plan must preserve strict scope boundaries.

Do not:

- implement future plans early;
- silently redesign canonical architecture;
- introduce infrastructure without demonstrated need;
- add speculative abstractions;
- perform unrelated refactors;
- weaken tests to make verification pass;
- leave temporary security bypasses;
- create undocumented cross-module dependencies.

If implementation discovers a legitimate issue outside the current plan:

1. record it;
2. classify whether it blocks the current plan;
3. fix it only if required for correctness or safety;
4. otherwise defer it explicitly to the appropriate future plan or canonical document.

---

## 13. Documentation Authority

The repository is the source of truth.

Conversation context is disposable.

The authoritative hierarchy is:

```text
Canonical Project Documentation
        ↓
Module Specification
        ↓
Module Master Plan
        ↓
Current Executable Plan
        ↓
Implemented Repository State
        ↓
Independent Audit Evidence
```

If conversational instructions conflict with committed canonical project rules, the repository rules must be reconciled explicitly rather than silently ignored.

---

## 14. Planning Philosophy

The planning method is intentionally iterative.

We plan the entire module at the roadmap level, but we plan implementation detail only when that detail becomes actionable.

This provides:

- smaller context windows;
- better implementation accuracy;
- easier code review;
- safer security work;
- better testing quality;
- lower rework;
- clearer ownership;
- reliable recovery between conversations;
- less dependence on AI conversational memory.

The repository carries the project forward, not the previous conversation.

---

## Standard Vertex OS Delivery Cycle

```text
Specification
    ↓
Master Plan
    ↓
Next Executable Plan
    ↓
Implementation
    ↓
Independent Audit
    ↓
Fix / Re-Audit if Required
    ↓
Accepted Baseline
    ↓
Next Executable Plan
    ↓
...
    ↓
Final Module Audit
    ↓
Module Complete
```

---

## Core Rule

For every Vertex OS module:

> **One Master Plan → one executable plan at a time → one implementation conversation → one independent audit → one accepted baseline → next plan.**

Repeat until all Master Plan stages are complete, then perform the Final Module Audit.
