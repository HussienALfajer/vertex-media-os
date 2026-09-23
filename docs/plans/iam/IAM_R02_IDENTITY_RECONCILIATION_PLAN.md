# IAM-R02 — Identity Reconciliation, Provisioning & Invitation Delivery

**Status:** COMPLETE  
**Master Plan stages:** IAM-MP-04  
**Risk tier:** A (reviewers: security; data and concurrency; architecture and boundaries)  
**Branch:** `iam/r02-identity-reconciliation`  
**Baseline commit:** `4364d8656b25d6f5b8cdbd48b12ce19b7388ba9c`

---

## 1. Objective

Give IAM the single capability that brings Keycloak to the state the committed Vertex user requires (spec Section 11.2), and a separate capability that dispatches and resends the invitation (Section 11.3). Both run their Keycloak I/O outside every database transaction, record `identitySyncState` and `invitationDeliveryState` with version-checked writes, and append Audit evidence in the same transaction as each state write. A narrow Keycloak Admin REST adapter implements an IAM port and translates every provider failure to a safe category. The realm gains SMTP settings and an OTP-demanding self-service reset flow, proven end to end through a local mail sink. Real PostgreSQL and real Keycloak integration tests prove provisioning, lost-response recovery, conflicts, fail-closed disablement and invitation delivery.

## 2. Scope

**In scope**

- IAM application capabilities `provisionIdentity`, `reconcileIdentity` and `resendInvitation`, with the ports they need (identity provider, transaction-bound user identity writes).
- Keycloak Admin REST adapter in a new adapter project `domains/iam-keycloak`, and its boundary rules and probes.
- Repository operations for the identity binding and the two delivery states, with concurrency and constraint tests against PostgreSQL.
- Typed provisioner configuration in `apps/api` and a composition function that wires the capabilities (not mounted in the HTTP runtime).
- Realm: SMTP settings from placeholders; self-service reset re-enabled only through a flow that requires the existing OTP.
- Local mail sink (owner decision OD-1), `.env.example`, `pnpm env:setup`, README.
- Integration tests: real Keycloak with the mail sink, real PostgreSQL, real Audit adapter.

**Out of scope**

- Authorized administrative use cases (create user, sync-identity, resend, suspend, reactivate) with actor permissions and reasons: IAM-MP-10. Their HTTP contracts and error mapping: IAM-MP-11.
- The reactivation variant of reconciliation (target state substituted before commit, spec Section 31.2): IAM-MP-10 extends the capability.
- Vertex session revocation on recovery or access removal: IAM-MP-05/06/10.
- OIDC login and first activation: IAM-MP-06.
- Production SMTP, TLS trust and provider narrowing: production deployment design.

## 3. Inputs

Specification: `docs/modules/iam.md` Sections 6.1, 7.2, 9.1, 10, 11, 12, 27, 30, 31, 34–39, 46.2–46.4, 50, 54 and 55 (IAM-2); `docs/SECURITY.md` Sections 6, 9, 10, 21, 24, 27; `docs/ENGINEERING.md` Sections 6, 15, 16, 24; Master Plan Section 7 and the IAM-MP-04 section; `IAM_R01_KEYCLOAK_ENVIRONMENT_PLAN.md` Section 10.

Carried-forward items and their resolution:

| Item | Resolution |
|---|---|
| Keycloak Admin errors can carry emails (IAM-02 Section 40) | The adapter never puts upstream bodies, request URLs or headers into results or errors; results carry categories only (D-05). Proven by adapter tests with email-bearing bodies and URL-bearing `fetch` errors, and with real refusals. Neither the capabilities nor the adapter log. |
| A-04 (ban proof if a Keycloak client package is installed) | Not triggered: the adapter uses `fetch` (D-03). Stays with IAM-MP-06 for the OIDC library. |
| Typed provisioner configuration (R01 D-11) | Closed (D-13). |
| Email delivery; a new local service needs owner approval | SMTP from placeholders (D-15); the mail sink is OD-1. |
| Self-service recovery (R01 S-01) | Re-enabled with an OTP-requiring reset flow, proven end to end (D-16). No invitation link, not even an earlier unused one, can replace an enrolled factor (D-10). |
| Provisioner residual (R01 D-14) | The adapter calls only the operations listed in D-03; a unit test pins the method and path set. |
| Harness location (R01 AB-5) | Resolved by D-17: the adapter's real-Keycloak tests run in `apps/api`, next to the one harness. |
| A2-01 and the API statement timeout | Not reachable: nothing is composed into the HTTP runtime. Passed on unchanged. |

## 4. Decisions

- **D-01 Adapter project.** `domains/iam-keycloak` (`@vertex-os/iam-keycloak`; tags `type:lib`, `scope:backend`, `layer:adapter`, `domain:iam`) implements the port. It reaches IAM types only through a new private entry `@vertex-os/iam/identity-provider`, lint-restricted to this project exactly as `/persistence` is to `domains/iam-persistence`. ENGINEERING Section 6 names the second adapter kind. Reason: IAM owns the integration (spec Sections 6.3, 43); the core stays free of transport.
- **D-02 Ports.** The core declares `IdentityProvider` (the Keycloak operations) and extends `IamTransactionScope` with a `users` store for version-checked identity writes. `ApplicationUserRepository.findById` stays the committed read. No generic abstraction beyond these.
- **D-03 No Keycloak client package.** The adapter calls the Admin REST API with Node `fetch`, obtaining a `vertex-provisioner` client-credentials token (cached until shortly before expiry). Operations, and only these: exact username search, read by id, create, update the enabled flag (a body with `enabled` only, so no other field is overwritten; *revised after review DC-4*), log out all sessions, list credential types, execute-actions email. Each request has a timeout (10 s).
- **D-04 Ownership proof** (spec Section 11.2): the identity's username equals the normalized email, its `vertexUserId` attribute is exactly the Vertex user ID, and, when a subject is bound, its id equals the subject. Link, create and enable require it. Disable and session termination apply to a bound identity without it.
- **D-05 Failure categories.** The port returns typed results. Expected outcomes are values (`not-found`, `duplicate`, `refused`). Provider failures are `unavailable` (network error, timeout, 5xx, 429: outcome unknown) or `rejected` (any other 4xx, including a refused provisioner token). No result or error carries an upstream body, URL, header or email. Unexpected programming errors throw fixed messages.
- **D-06 Reconciliation algorithm.** Read the committed user; locate the identity by bound subject, else by exact username; prove ownership before any access-increasing step; create only when nothing is bound and nothing is found and the required state is enabled; bind with a version-checked write; apply the enabled state (a body with `enabled` only, so no other field changes; *revised after review DC-4*); for a denied state, log out all Keycloak sessions; record `SYNCED`, or `FAILED` with a failure category, with a version-checked write. Every Keycloak call happens between transactions.
- **D-07 Conflicts.** A bound subject that Keycloak no longer has, an identity that fails ownership proof, an identity subject already bound to another Vertex user (unique violation), and a duplicate-create rejection whose re-lookup still finds nothing (the email is held by another identity) are all `FAILED` with `identity-conflict`; nothing in Keycloak is modified. A 409 is followed by exactly one re-lookup.
- **D-08 Denied states.** For SUSPENDED, DISABLED and TERMINATED, an unbound user with no identity under its username is `SYNCED` and nothing is created. An identity found by username is bound and disabled only after ownership proof.
- **D-09 Version discipline.** Every identity or delivery-state write is conditional on the version the decision was computed from and increments `version`. A lost race re-runs the whole operation against the newly committed state, at most three attempts. After that, if no attempt changed Keycloak, the operation returns `superseded` and leaves the committed state untouched (a competing change set its own `PENDING` and runs its own reconciliation). If an attempt did change Keycloak (create, enable, disable), that change may postdate the competing reconciliation, so the operation records `FAILED` (`identity-out-of-sync`) on the latest version and sync-identity repairs it (*revised after review DC-1 and DC-5*; the same reasoning as spec Section 31.2 step 6). A change whose response was lost counts as made. The write may overwrite a newer SYNCED from a reconciliation that already repaired Keycloak (review DC-6); that errs towards FAILED, which the next reconciliation clears. No database lock is held across Keycloak I/O (invariant 10).
- **D-10 Invitation actions.** *Revised after in-run review (S-01).* Keycloak action tokens cannot be revoked (a user logout does not invalidate them), and each carries the actions it was issued with. A link that asked for `UPDATE_PASSWORD` and `CONFIGURE_TOTP` would therefore stay a mailbox-only way to replace factors after the user enrolled through another link or through reset. So no link carries a factor action: every created identity gets `UPDATE_PASSWORD` and `CONFIGURE_TOTP` as its own required actions in the create request, and every emailed link carries `VERIFY_EMAIL` only; Keycloak then runs the identity's own pending actions. Once the user has enrolled, those actions are cleared and any leftover link can only verify an address, as long as no factor action is added to the identity again. Links are reusable until they expire, so an operator who later puts `UPDATE_PASSWORD` or `CONFIGURE_TOTP` back on an enrolled identity (for example after a lost device) lets any unexpired invitation link run it without the OTP (review S-06); sign-in still needs the enrolled OTP. Carried forward to IAM-MP-10's recovery action. The dispatch still reports what the identity lacks (`VERIFY_EMAIL` unless verified, `UPDATE_PASSWORD` without a password, `CONFIGURE_TOTP` without OTP); with nothing outstanding, no email is sent and the result is `no-action-required`. A resend never alters credentials or required actions (spec Section 11.3). No `client_id` or `redirect_uri` is passed. The lifespan comes from configuration.
- **D-11 Dispatch claim.** Before calling Keycloak, the dispatch records the attempt with a version-checked write: `invitationDeliveryState = FAILED` (outcome unknown, spec Section 11.3), keeping `invitationSentAt`. Confirmation then records `SENT` with a new `invitationSentAt`. Concurrent first dispatches therefore send at most one email, and an interrupted dispatch is visible as `FAILED`. A first dispatch claims only from `NOT_SENT`; a resend claims from any delivery state.
- **D-12 Dispatch preconditions and refusals.** Dispatch requires `INVITED`, a bound identity and `SYNCED` (otherwise `not-invited` or `sync-incomplete`, no write). The identity is read first: missing, no longer proven owned, or holding another email records `identitySyncState = FAILED` (`identity-conflict`, *added after review S-03*); disabled, or lacking the required action for a missing factor, records `FAILED` (`identity-out-of-sync`); nothing is sent. A mismatch that Keycloak reports at the send is recorded only if no competing change has committed since the claim (*revised after review DC-3*). A Keycloak refusal (400) or `not-found` of the send records both states `FAILED`; `unavailable` or `rejected` records only the invitation `FAILED`.
- **D-13 Configuration.** `loadIdentityProvisioningConfig(source)` in `apps/api/src/config`, beside `loadAppConfig`, maps `KEYCLOAK_ISSUER_URL` (must end in `/realms/<realm>`; `https` required when `NODE_ENV=production`), `KEYCLOAK_PROVISIONER_CLIENT_ID`, `KEYCLOAK_PROVISIONER_CLIENT_SECRET` and `KEYCLOAK_INVITATION_LIFESPAN_SECONDS` (default 43200, the realm's admin action-token lifespan; 300 to 604800). Errors name variables, never values. It is separate from `AppConfig` so the HTTP runtime keeps starting without Keycloak values until a stage consumes them there.
- **D-14 Audit evidence.** Each state write appends in the same transaction: `iam.user.identity-bound` (after: issuer, subject), `iam.user.identity-reconciled` (`SUCCEEDED` or `FAILED`; before/after `identitySyncState`, `failure`), `iam.user.invitation-dispatch-started` and `iam.user.invitation-dispatched` (`SUCCEEDED` or `FAILED`; delivery state before/after, `dispatch` first/resend, requested `actions`). Target `iam.user`/user ID; never an email. The caller supplies `AuditAttribution`.
- **D-15 SMTP.** The realm's `smtpServer` takes host, port, from address, auth, user, password, STARTTLS and SSL from import placeholders. Locally, auth is on with generated credentials that the sink accepts, so the secret path is the production one. Production values, TLS and trust belong to production deployment design.
- **D-16 Self-service recovery.** `resetPasswordAllowed: true` with a realm flow `vertex reset credentials` bound as the reset-credentials flow: choose user, send reset email, OTP form (required; a user without OTP enrols through `CONFIGURE_TOTP`), then reset password. Keycloak's built-in OTP-reset step is not part of it, so a mailbox alone never replaces the second factor. The user action-token lifespan stays 300 s. Vertex session revocation on recovery waits for sessions (IAM-MP-05/06).
- **D-17 Test placement.** The adapter's unit tests (fake `fetch`: categories, no leakage, timeouts, operation set) live in `domains/iam-keycloak`. Its real-Keycloak tests and the composed PostgreSQL + Keycloak + Audit tests live in `apps/api/src/iam/`, which already owns both harnesses. The Keycloak harness always starts a mail sink on a shared Testcontainers network (*revised during the run*: every Keycloak suite needs a valid SMTP target, so an optional sink added a branch without saving a meaningful cost).
- **D-18 Public surface.** `@vertex-os/iam` exports the three capabilities, their result types and the dependency interfaces composition needs; the port `IdentityProvider` and the lower-level `dispatchInvitation` stay internal (*tightened after in-run review, AB-1*). The Keycloak adapter, Prisma types and the private entries stay off it (spec Section 44).

### Owner decisions

- **OD-1 Local mail sink (new infrastructure service).** *Answered by the owner on 2026-09-23: option A.* The realm needs an SMTP server locally and in tests to deliver invitations and reset links. Options:
  - **A (recommended):** Mailpit, pinned by tag and digest, as a Compose service (SMTP on the Compose network only, web UI on `127.0.0.1:8025`, no volume) and as a Testcontainers sink in the Keycloak harness. Local development can then follow invitations and resets, and tests read messages through Mailpit's HTTP API.
  - **B:** Mailpit in tests only. Local SMTP points at an unreachable host, so local invitations record `FAILED` and developers set credentials in the Keycloak console.
  - **C:** No mail sink. Tests prove only the failure paths; neither the invitation link nor the OTP-requiring reset flow can be proven end to end, so self-service recovery stays off and the S-01 item is carried forward again.

## 5. Design notes

- **Capabilities.** `reconcileIdentity(deps, { userId, attribution })` returns `synced`, `failed` (`identity-conflict` | `provider-unavailable` | `provider-rejected`), `not-found` or `superseded`, with the resulting states. `provisionIdentity` reconciles and, when the result leaves the user `INVITED`, `SYNCED` and `NOT_SENT`, runs the first dispatch; it returns both outcomes. `resendInvitation(deps, { userId, attribution })` returns `sent`, `failed`, `no-action-required`, `not-invited`, `sync-incomplete`, `not-found` or `superseded`. These map one-to-one to spec Section 27 codes in IAM-MP-11.
- **Required state** (spec Section 11.1): `INVITED` and `ACTIVE` require an existing, linked, enabled identity; the denied states require none to be created and an owned one disabled with its sessions terminated.
- **Store operations** (in `IamTransactionScope.users`): `bindIdentity`, `recordIdentitySync`, `recordInvitationDelivery`, each `{ id, expectedVersion, … }` → `updated` (with the new user) | `version-conflict` | `not-found`; `bindIdentity` also `identity-taken`. `bindIdentity` requires the row to be unbound. The existing database checks (`identity_pair`, `invitation_sent`, the identity unique key) stay the last line of defense.
- **Issuer.** The bound issuer is the configured `KEYCLOAK_ISSUER_URL`. The adapter derives the Admin base (`<origin>/admin/realms/<realm>`) and token endpoint from it.
- **Logging.** Neither the capabilities nor the composition log; the callers of IAM-MP-10 log outcome categories. The adapter's `fetch` errors (whose messages can contain the URL, and so a searched email) are never propagated.

### Discoveries during the run

- **An invitation link signs nobody in.** Completing an execute-actions link without `client_id` or `redirect_uri` verifies the email, sets the password and enrols the TOTP, and leaves no Keycloak session (the composed test asserts it). The first stop condition therefore does not apply.
- **The OTP form runs in the reset-credentials flow on 26.7.4.** After the emailed link, a user with OTP must enter it before the password form; a user without one is sent to enrolment. A mutation that drops the OTP step fails three recovery tests.
- **Duplicate email under another username.** With `duplicateEmailsAllowed: false`, creating a user whose email another identity holds answers 409 like a duplicate username; the single re-lookup by username finds nothing, which D-07 reports as a conflict.
- **A different issuer is a conflict, not an outage.** A bound user reconciled through a provider configured with another issuer gets `identity-conflict` before any call; transport failures must therefore be simulated with the same issuer.
- **Keycloak runs the identity's own required actions inside an action-token flow.** A `VERIFY_EMAIL`-only link leads a fresh identity through password and TOTP enrolment, and an earlier link opened after enrolment shows neither form (composed test; a mutation that puts the factor actions back in the link fails it).
- **Local environment.** `pnpm env:setup` refuses to add the SMTP password while `vertexos_keycloak-data` exists and leaves `.env` untouched; a developer runs `pnpm infra:reset` first, as for any realm change.

## 6. Done means

1. A committed INVITED user is provisioned by `provisionIdentity` against real Keycloak: one identity with username and email equal to the normalized email and `vertexUserId` set at creation, enabled; issuer and subject bound; `SYNCED`; invitation `SENT` with the three actions, delivered to the mail sink; Vertex never sees a credential. Following the link in the delivered message completes email verification, password and TOTP enrolment in Keycloak. *(MP exit 1.)*
2. A lost create response (the request reached Keycloak, the response did not reach Vertex) records `FAILED`; the next reconciliation finds, proves and binds the same identity. Concurrent reconciliations of one user create one identity and bind it once; concurrent provisions send one first invitation. *(MP exit 2.)*
3. An identity that fails ownership proof, a subject bound elsewhere, a deleted bound identity and an email held by another identity all record `FAILED` with `identity-conflict`, and the Keycloak identity is byte-for-byte unchanged. *(MP exit 3.)*
4. For a user committed as SUSPENDED, DISABLED or TERMINATED, reconciliation disables the owned identity and ends its Keycloak sessions; a provider failure leaves `accessState` untouched and records `FAILED`; nothing is created for an unbound user. *(MP exit 4.)*
5. A failed or refused dispatch records invitation `FAILED` without touching the identity or `accessState`; a disabled identity at dispatch records `identitySyncState = FAILED`; a failed resend after success keeps `invitationSentAt`; every link carries `VERIFY_EMAIL` only, and an earlier link left unused cannot replace a factor enrolled since. *(MP exit 5.)*
6. Provider unavailability, timeouts and refusals produce stable categories; no Keycloak body, email or secret appears in results, thrown errors, logs or Audit records. *(MP exit 6.)*
7. Every state write is version-checked and has its Audit record in the same transaction; a failed Audit append rolls the write back.
8. Self-service reset: the login page offers it; the reset link demands the enrolled OTP before a new password; a wrong code fails; a user without OTP must enrol one.
9. Boundary lint rejects imports of `@vertex-os/iam/identity-provider` outside the adapter, of the adapter from the core, and of NestJS or Prisma from the adapter; the positive controls pass.
10. README, `.env.example`, ENGINEERING Section 6 and the Master Plan are accurate after the change.

## 7. Stop conditions

- The OTP form cannot run in the 26.7.4 reset-credentials flow, or completing an execute-actions link creates a Keycloak SSO session that bypasses the OTP step: the recovery or invitation design must change, which is a security decision.
- Any required Keycloak operation needs a provisioner role broader than `manage-users`.

## 8. Verification

- `pnpm nx run @vertex-os/iam:test`, `@vertex-os/iam-keycloak:test`, `@vertex-os/api:test`.
- `pnpm nx run @vertex-os/iam-persistence:test:integration` (store operations, versions, constraints, concurrency).
- `pnpm nx run @vertex-os/api:test:integration` (realm contract with SMTP and reset; adapter against real Keycloak; composed provisioning with PostgreSQL, Keycloak, Mailpit and the Audit adapter).
- `pnpm lint:boundaries`; `pnpm verify`.
- Local: `pnpm env:setup` upgrade of an existing `.env`; `pnpm infra:reset && pnpm infra:up`; loopback-only port bindings.
- CI: `verify:full` and `deps:audit` on the pull request.

## 9. Checklist

- [x] M1 Plan committed; owner decision OD-1 answered
- [x] M2 Core: ports, capabilities, unit tests with fakes
- [x] M3 Persistence store operations and integration tests
- [x] M4 `domains/iam-keycloak` adapter, unit tests, boundary lint and probes
- [x] M5 Realm SMTP and reset flow; mail sink in Compose and harness; env setup; realm contract tests
- [x] M6 Typed configuration, composition, real-Keycloak and composed integration tests
- [x] M7 README, ENGINEERING Section 6; `pnpm verify` and integration suites green
- [x] M8 In-run review (three reviewers); findings resolved
- [x] M9 Master Plan ledger, hand-off, pull request, CI green

## 10. Hand-off

**In-run review.** Three fresh-context reviewers checked `main...HEAD`: security, data and concurrency, and architecture and boundaries. The implementer checked each finding's evidence before accepting it. The security and data reviewers re-checked their fixes.

- **Fixed in the run:**
  - S-01 (blocking): an earlier, unused invitation link could replace factors enrolled since. Links now carry `VERIFY_EMAIL` only, and factors are the identity's own required actions (D-10). The reviewer's re-probe, including enrolment through reset while a link was outstanding, confirmed the fix; a mutation fails the new composed test.
  - DC-1 and DC-5 (major): a superseded reconciliation could leave a stale create or enable in Keycloak while the state read SYNCED. It now records FAILED (D-09).
  - DC-3, DC-4, S-02, S-03, S-05, AB-1, AB-2, AB-5, S-04 and S-08 (documentation).
- **Accepted as documented:** DC-6 (the FAILED write may overwrite a SYNCED that already repaired Keycloak; errs towards FAILED), S-06 and S-07 (D-10).
- **Recorded, not changed:** AB-4 (existing lint gaps: CommonJS `require` of a private entry and a root type query of an adapter from the core; both fail at build or type check), AB-3 (Master Plan text, updated in the ledger).

**Carried forward** (attached to the Master Plan stages):

- **IAM-MP-05/06:** Vertex session revocation on self-service recovery; first activation decides by `accessState` only; the TOTP and mail-sink test helpers for the browser journey.
- **IAM-MP-10:**
  - the administrative use cases call the three capabilities through `createIdentityProvisioning` and set PENDING on every requirement-changing commit;
  - the reactivation variant of reconciliation (spec Section 31.2);
  - audit and reporting of refusals and `superseded`;
  - an administrative recovery action (spec Section 54) must not leave a re-added factor action runnable by an unexpired invitation link (S-06, S-07). For example, it can refuse while a link may be valid, or shorten the lifespan.
  - DC-2: a concurrent bind of one identity to two users surfaces as a thrown unique violation instead of `identity-taken`. This is unreachable because of ownership proof, and the store test does not check the loser.
- **IAM-MP-11:** mapping the outcomes to spec Section 27 codes; responses for `no-action-required` and `superseded`.
- **Production deployment design:** production SMTP (values, TLS, trust, sender domain).
- **A2-01 and the API statement timeout:** unchanged; they pass to the first stage that composes persistence into HTTP.
- **Final IAM Module Audit:** the realm's `delete_credential` required action is enabled (predates this run).

**Local environment note.**
- An existing Keycloak volume has neither SMTP nor reset. `pnpm env:setup` refuses to add the SMTP password while that volume exists. Run `pnpm infra:reset`, then `pnpm env:setup`, then `pnpm infra:up`.
- `pnpm infra:down` and `pnpm infra:reset` read `.env.example`, not `.env`. Fixed after the pull request was opened: with an `.env` that lacked the new SMTP keys, Compose refused to interpolate the file, so `infra:reset`, the very step `env:setup` asks for, could not run.
- Mailpit publishes `127.0.0.1:${MAILPIT_PORT:-8025}`. Change `MAILPIT_PORT` if that port is taken.
