# IAM-R06 — User Lifecycle, Session Revocation, Bootstrap and Grant Ceiling

**Status:** IN_PROGRESS  
**Master Plan stages:** IAM-MP-10  
**Risk tier:** A (reviewers: security; data and concurrency; architecture and boundaries)  
**Branch:** `iam/r06-user-lifecycle`  
**Baseline commit:** `2a59b65e0b1380d030ab395faba9c14399e20873`

---

## 1. Objective

Give IAM the application services for the highest-risk administrative workflows before IAM-MP-11 exposes them over HTTP: user creation with memberships and roles, display-name update, suspension, disablement, termination, backend-derived reactivation, sync-identity, resend-invitation, explicit session revocation, and the operator-run bootstrap command with its recovery mode. Access removal commits locally before Keycloak is touched; access restoration never commits before Keycloak is ready and is compensated when its final commit loses a race. Every change commits with its Audit evidence, every operation that can lower the number of ACTIVE System Administrators is serialized on the System Administrator role row, and the grant ceiling decided by the owner (spec Section 23.1) is enforced in every grant path. The run also closes the auth-session and test-evidence items the `IAM-CP1` audit assigned to IAM-MP-10.

## 2. Scope

**In scope**

- Domain rules (pure): the access-transition table, reactivation target derivation, the last-System-Administrator decision for access reduction, the grant ceiling, bootstrap candidate classification.
- A transaction-scoped `UserLifecycleStore` port and adapter; grant-ceiling reads on `RoleStore`; a `SessionRevocation` port bound to the auth session store.
- Use cases: `createUser`, `updateDisplayName`, `suspendUser`, `disableUser`, `terminateUser`, `reactivateUser`, `syncIdentity`, `resendUserInvitation`, `revokeUserSessions`, `bootstrapSystemAdministrator`; the grant ceiling in `assignRole`, `activateRole` and `replaceRolePermissions`.
- Reactivation's identity step (target override and compensation) as an extension of identity reconciliation.
- The bound composition root `apps/api/src/iam/user-administration.ts`, not mounted in HTTP.
- The operator command `pnpm iam:bootstrap`, documented in `README.md`.
- A migration: the new session revocation reasons, and the `auth_session` checks of CP1-06.
- Carried-forward test items CP1-07, CP1-13, CP1-26.

**Out of scope**

- HTTP routes, DTOs, OpenAPI and error-code mapping (IAM-MP-11); Section 5.8 lists the intended mapping.
- Read and list capabilities (user directory, user detail): IAM-MP-11 builds them with the GET routes.
- An administrative credential-recovery action (spec Section 54 MAY): not built (D-17).
- Frontend (IAM-MP-12 to IAM-MP-14).

## 3. Inputs

Specification `docs/modules/iam.md`: Sections 9.1, 10–13, 19–21, 23 and 23.1, 25.3, 27, 30–32, 34, 35, 44, 46.1–46.3, 48, 53, 54, and IAM-5 (Section 55). Master Plan Section 7 (invariants 1, 3, 6, 10–17, 20) and the IAM-MP-10 section; amendment record "grant ceiling (2026-09-24)". Previous hand-off: `IAM_R05_PRIVILEGE_ADMINISTRATION_PLAN.md` Section 10. Audit record `audits/IAM-CP1.md` (CP1-06, CP1-07, CP1-13, CP1-26).

Carried-forward items and their resolution:

| Item | Resolution |
|---|---|
| IAM-02: bootstrap refuses when reference data is not synchronized | Bootstrap plans a reference synchronization under the synchronization lock and refuses unless the plan is empty (D-15). |
| R02: use `provisionIdentity`, `reconcileIdentity`, `resendInvitation`; set `PENDING` with every requirement change | All new paths call them; access changes write `PENDING` in their own transaction (D-07, D-08). |
| R02: reactivation variant (target override, compensation) | D-08. |
| R02 S-06, S-07: recovery action vs. invitation links | Not triggered: no administrative recovery action is built (D-17); the constraint binds any later one and is recorded as an open item. |
| R02 DC-2: concurrent bind surfaces as a unique violation | Still unreachable: every new path binds only through reconciliation's ownership proof. Unchanged. |
| R02: refusal evidence and `superseded` | D-13. |
| R03: session revocation capability and reasons | `SessionRevocation` port bound to `SessionService.revokeUserSessions`, called after the access change commits; reasons added by migration (D-09). |
| CP1-06 | Migration adds the structural checks and a trigger that makes revocation final (D-19). |
| CP1-07 | Session-store constraint tests name each constraint; bare `.rejects.toThrow()` replaced; the missing checks and the key-version branch exercised (D-20). |
| CP1-13 | Real-Keycloak assertions that the identity holding the email and an identity whose subject is bound to another user stay byte-for-byte unchanged (D-20). |
| CP1-26 | The provisioning suite's evidence checks become self-contained (D-20). |
| R05: System Administrator lock before the user row | D-05, D-06. |
| R05: creation with memberships and roles applies the R05 rules | D-11; the unchecked `ApplicationUserRepository.create` is removed (D-04). |
| R05 AB-5: lock order across both stores | D-05. |
| Grant ceiling (owner decision 2026-09-24) | D-12. |

## 4. Decisions

- **D-01 Application layer only.** Use cases go behind `@vertex-os/iam/composition`; request, result and view types on the root. `createIamUserAdministration` in `apps/api/src/iam/user-administration.ts` binds them to PostgreSQL, the Audit adapter, the Keycloak adapter and an injected session revocation; it is exercised by integration tests and by the bootstrap command. IAM-MP-11 mounts it.
- **D-02 The attribution's actor is the acting principal.** The use cases keep taking an `AuditAttribution` (R05 D-02). The grant ceiling evaluates its actor: a `USER` actor is subject to it, a `SYSTEM` actor (bootstrap) is not (spec Section 23.1). IAM-MP-11 builds the attribution from the session's authorization context, so the actor is the authenticated user.
- **D-03 Ports.** A new `UserLifecycleStore` (scope key `lifecycle`) holds the user writes that decide access: locking the System Administrator role row by its reserved code, locking a user row and returning the committed user, reading whether a user holds a role, inserting a user (`email-taken` on conflict, without aborting the transaction), writing an access change, completing a reactivation, writing the display name, and reading the System Administrator candidates. `RoleStore` gains `readActorAuthority(userId)` (the actor's authorization facts and whether they hold the system role, read without a lock) and `readActivePermissionCodes(roleId)`. `SessionRevocation` is an application port with one operation, `revokeUserSessions(userId, reason, attribution)`.
- **D-04 One creation path.** `ApplicationUserRepository.create` and `updateDisplayName` wrote users outside the IAM transaction, without the R05 rules and without Audit evidence. They are removed; the repository keeps its reads. Tests seed users through test-support SQL helpers, never through a production port.
- **D-05 Lock order.** (0) the reference-synchronization advisory lock, bootstrap only; (1) role rows `FOR UPDATE`, several in ID order; (2) user rows `FOR UPDATE`, several in ID order; (3) department rows or permission rows `FOR SHARE`. This extends R05 D-05 across both stores. The advisory lock is taken only by bootstrap and reference synchronization, and both take it first.
- **D-06 System Administrator lock for access reduction.** Suspension, disablement and termination always lock the System Administrator role row before the user row, whatever the target holds: whether the target holds that role is only stable under that lock, because its assignments change only under it (R05 D-06). Under both locks, an ACTIVE target holding the role is refused with `last-system-admin` when the ACTIVE count is one. This serializes access reductions with each other, with role removal and with bootstrap; V1 volumes make that acceptable.
- **D-07 Removing access (spec Section 31.1).** One transaction: the locks of D-06, the transition check, the new `accessState` with `identitySyncState = PENDING` and `lastAccessStateChangedAt`, and the Audit record (`iam.user.suspended`, `disabled`, `terminated`, with the administrator's reason). After the commit: revoke every Vertex session (D-09), then `reconcileIdentity`. The operation succeeds once the local change commits and returns the resulting states and the number of revoked sessions (spec Section 27). No expected version is required: the table only allows moves towards less access, so a stale screen cannot restore access, and an urgent revocation is not delayed by a version race (spec Section 53).
- **D-08 Reactivation (spec Sections 10.7, 31.2).** Requires the expected version. (1) The committed user must be SUSPENDED or DISABLED at that version; the target is ACTIVE when `firstActivatedAt` is set, INVITED otherwise. (2) Version-checked write of `identitySyncState = PENDING` with `iam.user.reactivation-started`. (3) Reconciliation's identity step with the required state `enabled`, against exactly that version (no re-read): it enables the owned identity or, for a never-provisioned user, creates and binds it. On failure it records FAILED and the operation fails. (4) A version-checked final commit sets the target state and `SYNCED` with `iam.user.reactivated`. (5) If the final commit misses its version, `reconcileIdentity` runs at once against the committed state (disabling the identity again, or recording FAILED) and the operation returns `superseded`. A user returned to INVITED then receives the first dispatch if none was ever attempted. Reactivation never creates a session, never sets `firstActivatedAt`, and never touches credentials or required actions.
- **D-09 Session revocation reasons.** The migration adds `USER_SUSPENDED`, `USER_DISABLED`, `USER_TERMINATED` and `ADMINISTRATOR_REVOKED` to `auth_session_revocation_reason`. The session store records one Audit record per revoked session, as today.
- **D-10 Explicit revoke-sessions.** `revokeUserSessions` revokes every Vertex session of the user (`ADMINISTRATOR_REVOKED`) and then, when the user has a bound identity, ends its Keycloak sessions, so a lost device's SSO cookie cannot sign in again silently. A Keycloak failure is reported and recorded (`iam.user.provider-sessions-terminated`, FAILED); the local revocation stands. It never changes `accessState` or `identitySyncState`.
- **D-11 User creation (spec Section 12).** Input validation first (email normalization, display name, duplicate departments or roles, at most one primary). One transaction: lock the requested roles (D-05), refuse a missing (`role-not-found`) or INACTIVE (`role-inactive`) one, lock the departments `FOR SHARE` and refuse a missing (`department-not-found`) or INACTIVE (`department-inactive`) one, apply the grant ceiling (a refusal is recorded against the refused role: action `iam.user.role-assigned`, target `iam.role`, because no user exists yet), insert the user (`email-conflict` on an existing email, including a terminated user's), insert memberships and assignments, and append `iam.user.created` with the initial states, departments, primary and role codes. After the commit, `provisionIdentity`. An `email-conflict` makes no Keycloak call.
- **D-12 Grant ceiling (spec Section 23.1).** For a USER actor who is not an ACTIVE System Administrator: `assignRole` and creation refuse the system role and any role whose ACTIVE mapped permissions are not all in the actor's effective permissions; `activateRole` applies the same test to the role it activates; `replaceRolePermissions` refuses when an added code is not effective for the actor. Effective permissions follow `projectAuthorizationContext` (empty for a user who is not ACTIVE or does not exist). The check runs inside the change's transaction after its locks and after the operation's own refusals (not found, inactive, duplicate, version), reading the actor's committed state without locking the actor's row. A refusal writes nothing except a REFUSED Audit record with the attempted action, and returns `grant-exceeds-actor`. Removals and deactivation are not limited.
- **D-13 Refusal evidence.** REFUSED Audit records for `last-system-admin`, `grant-exceeds-actor`, `system-role-protected` (R05) and every bootstrap refusal (spec Sections 21.1, 34). Not for not-found, invalid input, version conflicts, `invalid-access-transition`, or the provisioning outcomes `not-invited`, `sync-incomplete` and `no-action-required`: they change nothing and are answered to the caller. `superseded` is returned as its own outcome; IAM-MP-11 maps it to a conflict the client can retry.
- **D-14 Other lifecycle operations.** `updateDisplayName` requires the expected version, locks the user row, writes only `displayName` (`unchanged` when equal) with `iam.user.updated`. `syncIdentity` is `provisionIdentity` for a user in any state (spec Section 25.3). `resendUserInvitation` is `resendInvitation`. Neither changes `accessState`.
- **D-15 Bootstrap (spec Section 21).** Actor `SYSTEM` `iam.bootstrap`. One transaction: the synchronization lock and an empty reference-synchronization plan for the supplied manifests (else `reference-data-not-synchronized`); the System Administrator role lock; the candidates (holders not TERMINATED) with their user rows locked in ID order; classification (pure). Normal mode creates the candidate with the system role in the creating transaction, resumes the one INVITED candidate with the operator's normalized email, or refuses (`active-administrator-exists`, `recovery-required`, `email-taken`). Recovery mode requires a reason, refuses while an ACTIVE System Administrator exists or the email belongs to any user, terminates INVITED candidates, removes the role from SUSPENDED and DISABLED ones without touching their access or sync state, and creates one new candidate. Evidence: one invocation record per run (`iam.bootstrap.invoked` or `iam.bootstrap.recovery-invoked`, target `iam.bootstrap`/`system-administrator`, mode, outcome, candidate and superseded IDs; REFUSED with the refusal), plus one record per change. After the commit: each terminated candidate's sessions are revoked and its identity reconciled; the candidate is reconciled unless SYNCED, then invited: a first dispatch when none was attempted, a resend after a FAILED one, and a resend of a SENT one only on explicit operator request.
- **D-16 Bootstrap command.** `pnpm iam:bootstrap -- --email <e> --display-name <n> [--resend-invitation] [--recovery --reason <r>]`, a raw-environment bridge like `iam:sync-reference`. Exit codes: 0 complete (candidate SYNCED and invited, or nothing left to do), 2 refused, 3 incomplete (a Keycloak step failed; re-running resumes), 64 usage (missing, unknown or malformed arguments), 1 unexpected failure. It logs one JSON result line with the candidate's user ID and the outcomes, never the email, display name, reason, a token or a secret. It never creates credentials or a session.
- **D-17 No administrative recovery action.** Spec Section 54 allows one and Section 25.3 lists none; nothing in MP-10 requires it. The R02 constraint (a recovery action re-adding factor actions must not be runnable through an unexpired invitation link) is recorded as an open item for any later one.
- **D-18 Views.** `UserView`: id, email, displayName, accessState, identitySyncState, invitationDeliveryState, invitationSentAt, firstActivatedAt, lastAccessStateChangedAt, createdAt, updatedAt, version. It omits the identity mapping. Results never carry the user entity.
- **D-19 CP1-06.** Checks on `auth_session`: `idle_expires_at > created_at`, `absolute_expires_at > created_at`, `revoked_at >= created_at`, non-empty token ciphertexts; on `auth_login_attempt`: non-empty `state`, `nonce`, `code_verifier`. A `BEFORE UPDATE` trigger rejects any change of `revoked_at` or `revocation_reason` on a row whose `revoked_at` is set, so a revoked session can never become valid again (spec Section 32). No application path does either today.
- **D-20 Test evidence items.** CP1-07: each auth constraint is named by a test that violates it and asserts the constraint name. CP1-13: real-Keycloak cases assert byte-for-byte unchanged identities for the email holder and for a subject bound to another user. CP1-26: the evidence checks create their own data and do not depend on test order.

No owner decisions. The grant ceiling was decided by the owner (2026-09-24). Nothing else changes an item under "Changes Requiring Explicit Approval": the migration is additive (enum values, checks, a trigger), no infrastructure or dependency is added, the authorization model is the specification's, and no HTTP contract is published.

## 5. Design notes

### 5.1 Transition table

`decideAccessTransition(from, to)` implements spec Section 10.6 exactly: INVITED → SUSPENDED/DISABLED/TERMINATED; ACTIVE → SUSPENDED/DISABLED/TERMINATED (last-System-Administrator guard); SUSPENDED → DISABLED/TERMINATED; DISABLED → TERMINATED; SUSPENDED/DISABLED → reactivation. Everything else, including INVITED → ACTIVE, DISABLED → SUSPENDED, a state to itself and anything out of TERMINATED, is `invalid-access-transition`.

### 5.2 Outcomes

| Use case | Success | Refusals |
|---|---|---|
| `createUser` | `created` (+ identity, invitation) | `invalid`, `email-conflict`, `role-not-found`, `role-inactive`, `department-not-found`, `department-inactive`, `grant-exceeds-actor` |
| `updateDisplayName` | `updated`, `unchanged` | `invalid`, `user-not-found`, `version-conflict` |
| `suspendUser` / `disableUser` / `terminateUser` | `restricted` (+ sessions revoked, identity) | `invalid`, `user-not-found`, `invalid-access-transition`, `last-system-admin` |
| `reactivateUser` | `reactivated` (+ target, invitation) | `invalid`, `user-not-found`, `version-conflict`, `invalid-access-transition`, `identity-failed` (failure category), `superseded` |
| `syncIdentity` | `synced` (+ invitation) | `invalid`, `user-not-found`, `identity-failed`, `superseded` |
| `resendUserInvitation` | `sent`, `no-action-required` | `invalid`, `user-not-found`, `not-invited`, `sync-incomplete`, `identity-failed`, `superseded` |
| `revokeUserSessions` | `revoked` (+ count, provider sessions) | `invalid`, `user-not-found` |
| `bootstrapSystemAdministrator` | `created`, `resumed`, `recovered` (+ identity, invitation) | `invalid`, `reference-data-not-synchronized`, `active-administrator-exists`, `recovery-required`, `email-taken` |

### 5.3 Identity step for reactivation

`reconcileIdentity` is split into a core that brings Keycloak to a required state for one given user version and returns the (possibly re-bound) user or a failure, and the existing wrapper that reads the committed user, derives the requirement and records the outcome. Reactivation calls the core with `enabled` and the version it wrote in step 2; a bind inside the core raises the version, and the final commit uses the version the core returns.

### 5.4 Grant ceiling evaluation

`decideGrantCeiling({ actor, grant })` where `actor` is `system` or the actor's facts plus `holdsSystemAdministratorRole`, and `grant` is either the system role or a set of permission codes. ACTIVE System Administrator: allowed. Otherwise the system role is refused and every code must be in the projected effective permissions.

### 5.5 Bootstrap classification

`classifyBootstrap({ mode, email, candidates })` returns `create`, `resume`, `recover` (with the INVITED candidates to terminate and the others to strip), or a refusal, per spec Sections 21.2 and 21.3. It is unit-tested for every row of both tables.

### 5.6 Migration

One migration `auth_session_lifecycle`: `ALTER TYPE … ADD VALUE` for the four reasons, the D-19 checks and the trigger. Additive; Prisma schema updated for the enum.

### 5.7 Evidence content

User records target `iam.user`/user ID and carry before/after state fields, never the email. Bootstrap invocation records carry mode, outcome and IDs only. Reasons travel in the attribution (spec Section 53).

### 5.8 Intended HTTP mapping (for IAM-MP-11)

`user-not-found` → 404 `IAM_USER_NOT_FOUND`; `email-conflict` → 409 `IAM_EMAIL_CONFLICT`; `invalid-access-transition` → 409 `IAM_INVALID_ACCESS_TRANSITION`; `last-system-admin` → 409 `IAM_LAST_SYSTEM_ADMIN`; `grant-exceeds-actor` → 403 `IAM_GRANT_EXCEEDS_ACTOR`; `not-invited` → 409 `IAM_INVITATION_NOT_APPLICABLE`; `sync-incomplete` → 409 `IAM_IDENTITY_SYNC_INCOMPLETE`; `identity-failed` with `identity-conflict` → 409 `IAM_IDENTITY_CONFLICT`, with `provider-unavailable`, `provider-rejected` or `identity-out-of-sync` → 503 `IDENTITY_PROVIDER_UNAVAILABLE`; role and department outcomes as R05 Section 5.6. `version-conflict`, `superseded` and `invalid` have no specification code; IAM-MP-11 names them once.

## 6. Done means

1. Every allowed and forbidden transition of spec Section 10.6 is decided by one table; TERMINATED is final; no administrative path moves INVITED to ACTIVE. *(Exit 1, 3.)*
2. Suspension, disablement and termination commit locally with `PENDING` before any Keycloak call, then revoke every Vertex session, then reconcile; with Keycloak unavailable the user stays denied, sessions stay revoked and the state is FAILED. *(Exit 2.)*
3. Reactivation grants no access before Keycloak is ready and the final commit succeeds; a Keycloak failure leaves the access state unchanged and FAILED; a final commit that loses a race re-disables the identity or records FAILED. *(Exit 3.)*
4. Suspending, disabling or terminating the last ACTIVE System Administrator is refused, also when two such operations on different administrators, or one with a role removal, run concurrently. *(Spec Section 20.)*
5. A USER actor who is not an ACTIVE System Administrator cannot assign the system role, assign or activate a role or map a permission beyond their effective permissions, or create a user with such a role; a System Administrator and SYSTEM actors are not limited; refusals write only a REFUSED record. *(Spec Section 23.1.)*
6. User creation applies the R05 rules, commits the user, memberships, assignments and evidence together, then provisions; an existing email creates nothing. *(Spec Section 12.)*
7. Bootstrap creates, resumes and refuses as spec Section 21.2 requires, recovery acts as Section 21.3 requires, concurrent invocations leave at most one live candidate, it refuses unsynchronized reference data, runs only as an operator command, and prints no secret. *(Exit 5, 6, 7.)*
8. Explicit revocation revokes every Vertex session of the user and ends its Keycloak sessions; revoked sessions can never be revived by the database. *(Spec Section 32; CP1-06.)*
9. Every successful change and every audited refusal has exactly one Audit record in the same transaction; no record contains an email, token or secret.
10. CP1-07, CP1-13 and CP1-26 are closed as D-20 states; no new dependency; `pnpm verify` and the integration suites are green.

## 7. Stop conditions

- The lock order of D-05 cannot be kept for an operation this run needs.
- A rule requires a destructive migration or a public HTTP contract.

## 8. Verification

- `@vertex-os/iam:test`: transition table, reactivation target, grant ceiling, bootstrap classification; application tests with fakes for the orderings of D-07 and D-08 (including compensation) and for session revocation.
- `@vertex-os/iam-persistence:test:integration`: store behavior that the API suites do not reach; existing suites adjusted to D-04.
- `@vertex-os/api:test:integration`: `user-administration.integration.spec.ts` with PostgreSQL and real Keycloak (creation, lifecycle journeys, Keycloak failure paths, concurrency for Done means 4 and 7); `administration.integration.spec.ts` grant-ceiling cases; the bootstrap command; `sessions.integration.spec.ts` constraint tests; the provisioning suite items.
- `pnpm lint:boundaries`, `pnpm verify`, and the integration suites of `iam-persistence`, `audit-persistence` and `api`.
- CI: `verify:full` and `deps:audit` on the pull request.

### 8.1 Deviations and discoveries

- **Creation order (D-11).** Departments are locked and checked before the ceiling and the insert, so every refusal returns before anything is written (a transaction that returns an outcome commits). The lock order of D-05 still holds: the new user row is invisible to other transactions, and a concurrent insert of the same email waits only on the unique index after all of its own locks are taken.
- **R05 tests act as a system process.** The R05 administration suite acted as a user that does not exist; under the grant ceiling such an actor holds nothing. Its fixture now acts as the system process `iam.test-administration`, so it keeps testing the R05 rules; the ceiling's own cases act as users.
- **Session test arrangement.** One session test expired a session by setting its idle deadline equal to its creation time, a row no application path can produce; `auth_session_lifetime_ck` refuses it, so the test now expires the session one millisecond after creation.
- **Trigger message.** The revocation trigger's message starts with its name, because `psql` does not print the constraint field of a raised exception.

## 9. Checklist

- [x] M1 Plan committed
- [x] M2 Domain rules and views; unit tests
- [x] M3 Ports, `UserLifecycleStore` and `RoleStore` additions, adapters, removal of the unchecked repository writes
- [x] M4 Grant ceiling in the R05 use cases; tests
- [x] M5 Lifecycle use cases (creation, display name, restrictions, reactivation, sync, resend, revoke sessions); application tests
- [x] M6 Bootstrap use case and `pnpm iam:bootstrap`; README
- [x] M7 Migration (reasons, CP1-06); session binding
- [x] M8 Integration tests; CP1-07, CP1-13, CP1-26
- [x] M9 `pnpm verify` and integration suites green
- [ ] M10 In-run review (three reviewers); findings resolved
- [ ] M11 Master Plan ledger, hand-off, pull request, CI green

## 10. Hand-off

Written at the end of the run.
