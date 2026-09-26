# IAM-R11 — Final-audit blocking fixes and current acceptance evidence

**Status:** COMPLETE — accepted baseline follows the PR merge  
**Master Plan stage:** Owner-directed final-audit fix run  
**Risk tier:** A — Critical  
**Branch:** `codex/iam-final-project-audit`  
**Baseline commit:** `b4031af9492831ac7f9cef366fa966c1a25b4ec7`

## 1. Objective

Close the migrated-administrator lockout found while auditing the merged local-auth baseline.
Correct IAM administration UI states found by manual mobile QA and reconcile the Final Audit
criteria with ADR-0001. Produce a reviewable fix pull request before the independent Final IAM
Module Audit makes its acceptance decision.

## 2. Scope

In scope: operator-only migrated credential recovery, concurrency and Audit tests, failed-read
presentation and sensitive confirmation behavior in the current IAM UI, current acceptance map,
local-auth specification amendment, relevant operator documentation and stale operational comments.
Out of scope: production deployment, general password reset, self-service recovery, other business
modules and changing the owner's single-factor authentication decision.

## 3. Inputs

ADR-0001; `docs/modules/iam.md` Section 61 and provider-independent rules; Master Plan Sections
17–18; `docs/SECURITY.md` Sections 7–11 and 29; `docs/DESIGN_SYSTEM.md` Sections 34–35;
the merged R10 implementation and the independent IAM, UI and project audit findings.

## 4. Decisions

- **D-01:** Recover the exact existing ACTIVE System Administrator, only when no ACTIVE or
  INVITED System Administrator has a local password. Never create a new user or replace a hash.
- **D-02:** Require an explicit CLI switch, existing-admin email, operator-provided password and
  administrative reason. The database transaction locks reference data, the system role and
  users in the established order and writes the credential and Audit evidence together.
- **D-03:** Keep stale authorized list data visible after a transient read failure but label it
  stale and offer retry. Hide protected data after a 401/403 response. Require a verified affected
  count freshly read for an IAM deactivation when the actor may read counts; otherwise state the
  exact scope without exposing a count the actor lacks permission to read. Verify every mapped
  permission state before enabling role activation when the actor may read the catalog; a bounded
  first page is insufficient. Without catalog-read permission, state the whole active-mapping
  scope without exposing or guessing a grant count.

**Owner decisions:** None. ADR-0001 and the owner's full-audit/fix request authorize this work.

## 5. Design notes

Recovery uses the existing IAM transaction runner and Audit capability. A failed Audit append
must roll back the hash. The one-time predicate includes a NULL hash and expected version. The
local CLI does not print or receive the password as an argument. Historical identity data remains
available for migration review; no legacy provider is contacted.

## 6. Done means

- [ ] Migrated-admin recovery accepts exactly the eligible inaccessible account and refuses an
  already credentialed administrator, wrong target, repeat attempt and concurrent loser.
- [ ] A real PostgreSQL integration test proves Audit rollback and recovery login.
- [ ] IAM list refresh failures and sensitive confirmations meet Design System Sections 34–35.
- [ ] Current specification, evidence map, run ledger, README and operational comments describe
  local authentication; historical provider checks are not counted as current evidence.
- [ ] Relevant unit/UI/integration/browser tests, `pnpm verify`, `pnpm verify:full` and
  `pnpm deps:audit` pass through the required local/CI gates.
- [ ] Fresh-context Tier A review resolves every blocking finding; the fix PR is merged before
  the Final Audit verdict.

## 7. Stop conditions

The Run Contract in `AGENTS.md` applies. Production database or infrastructure operations remain
separate. If the audit finds an architectural/security conflict not settled by ADR-0001, surface
it before changing that behavior.

## 8. Verification

Run targeted PostgreSQL recovery, IAM frontend component and local IAM browser tests while
implementing. Run `pnpm verify` and relevant integration checks before review. CI runs
`pnpm verify:full` and `pnpm deps:audit` on the pull request. Re-check the Final Audit on the
merged baseline with independent reviewers and produce its own audit-record pull request.

## 9. Checklist

- [x] Inspect merged implementation and independent findings.
- [x] Implement and test the operator-only recovery path.
- [x] Correct IAM failure and confirmation presentation; test affected behavior.
- [x] Reconcile normative documents and the current evidence map.
- [x] Complete local verification and independent fix review.
- [x] Open [fix PR #24](https://github.com/HussienALfajer/vertex-media-os/pull/24) and pass
  [required CI](https://github.com/HussienALfajer/vertex-media-os/actions/runs/36206283048).
- [ ] Merge the fix PR and update local main.
- [ ] Run the independent Final IAM Module Audit on merged main.

## 10. Hand-off

Fix PR #24 passed the required full CI gate; acceptance follows its merge. A read-only review
also found dormant
provider-specific session mechanics and a token-encryption startup secret unused by the local
runtime. The owner requested full provider removal, so a focused IAM-R12 cleanup should follow
this merge before the Final Audit. It must preserve historical migration data and recheck session
security. The Final Audit then inspects R10–R12 and the deferred IAM-CP2
authorization/administration scope. Production launch gates remain separate and are enumerated
in the current evidence map.
