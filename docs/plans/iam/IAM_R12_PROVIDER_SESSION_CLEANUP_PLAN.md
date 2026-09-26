# IAM-R12 — Dormant provider session cleanup

**Status:** IN_REVIEW — accepted baseline follows the PR merge  
**Master Plan stage:** Owner-directed provider cleanup  
**Risk tier:** A — Critical  
**Branch:** `iam/r12-provider-session-cleanup`  
**Baseline commit:** `f54a8a8c5dcb90774ac8ae9b0d1c1f0e840500d9`

## 1. Objective

Remove the remaining executable external-provider session path after the accepted local-auth
migration. The backend must create, validate, slide and revoke only local application sessions,
and start without the obsolete token-encryption key. Preserve migrated user, Audit and session
history, reject former provider-backed cookies, and retain safe cleanup of old encrypted tokens.

## 2. Scope

In scope: authentication session service/store, its configuration and environment setup, current
tests and fixtures, browser stack configuration, active documentation and final-audit evidence.
Out of scope: deleting historical migrations or provider identity mappings, replacing established
passwords, production deployment and other business modules.

## 3. Inputs

ADR-0001; `docs/modules/iam.md` Section 61; `docs/SECURITY.md` Sections 8–11;
`docs/ARCHITECTURE.md` Section 22; Master Plan Sections 17–19; R11 hand-off and merged PR #24.

## 4. Decisions

- **D-01:** Keep legacy columns and the migration mapping for data integrity. Remove code that
  creates or refreshes a provider-backed session. Lookup refuses a row with any legacy provider
  marker before returning a valid session.
- **D-02:** Retain bounded cleanup of old login-attempt rows and encrypted tokens until their
  retention window passes. Neither operation requires the old encryption key.
- **D-03:** Replace obsolete provider-only test cases with equivalent local-session security,
  concurrency, expiry, revocation, CSRF and housekeeping probes; preserve database constraints.

**Owner decisions:** None. The owner explicitly requested complete Keycloak removal; ADR-0001
already defines the local authentication architecture.

## 5. Design notes

The session cookie remains opaque, `Secure` and `HttpOnly`; only its hash is stored. A local
session's idle deadline slides at most once per minute and never beyond its absolute deadline.
Concurrent touch, revocation and expiry remain fail closed. Legacy token data may be discarded
after expiry without decrypting it, and Audit evidence stays transactional with session creation
and revocation. No destructive database migration is included.

## 6. Done means

- [x] No compiled runtime path can create, refresh or authenticate an external-provider session.
- [x] An old provider-backed cookie is rejected and local session expiry, revocation, CSRF and
  Audit behavior retain targeted test evidence.
- [x] API and local/browser test stacks start without `AUTH_TOKEN_ENCRYPTION_SECRET`; local
  environment setup no longer generates it.
- [x] Historical mapping and session data remain intact; cleanup and retention still work.
- [x] Current docs, evidence map and run ledger state the supported local-only behavior.
- [x] Relevant tests, `pnpm verify`, touched integration suites, required CI and independent
  Tier A review pass before the PR is merged.

## 7. Stop conditions

The Run Contract applies. Any proposal to drop historical columns/data or change the cookie,
authorization or password model requires a separate decision.

## 8. Verification

Run targeted auth and setup unit tests, PostgreSQL session/API integration tests, local IAM
browser journeys, `pnpm verify`, and PR CI `pnpm verify:full` plus `pnpm deps:audit`.
Three independent reviewers cover security, data/concurrency and tests/contracts.

## 9. Checklist

- [x] Inspect merged R11 baseline and current/historical session contracts.
- [x] Remove dormant provider mechanics, key requirement and obsolete fixtures.
- [x] Preserve and verify legacy-session refusal and old-state cleanup.
- [x] Synchronize current docs and evidence map.
- [x] Complete local verification and independent Tier A review.
- [x] Open [PR #25](https://github.com/HussienALfajer/vertex-media-os/pull/25).
- [x] Pass required CI and obtain owner acceptance ([PR #25](https://github.com/HussienALfajer/vertex-media-os/pull/25)).

## 10. Hand-off

PR #25 merged. The independent [Final IAM audit](audits/IAM-FINAL.md) examined merged `main`,
including deferred IAM-CP2 and the local identity compatibility layer. It classified the local
adapter as nonblocking compatibility debt because it makes no Keycloak or network request, but
identified separate session and UI closure blockers that require dedicated fix runs.
