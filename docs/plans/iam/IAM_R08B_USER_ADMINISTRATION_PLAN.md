# IAM-R08B — Frontend User, Access and Provisioning Administration

**Status:** COMPLETE  
**Master Plan stages:** IAM-MP-13  
**Risk tier:** B (reviewers: architecture and boundaries; tests and verification)  
**Branch:** `iam/r08b-user-administration`  
**Baseline commit:** `7d01f84cde476fef53c0cdf267da565de2c58ac5`

---

## 1. Objective

An IAM administrator manages users in the production web application through the shared Vertex design system: a bounded, searchable user directory; user detail; creating (inviting) a user; editing the display name; department memberships and role assignments; the access lifecycle actions (suspend, disable, reactivate, terminate); identity synchronization; invitation resend; and session revocation. Access state, identity synchronization and invitation delivery appear as three separately labeled facts, and every outcome shown is the one the backend reports. Security-sensitive actions name the exact target and consequence and ask for deliberate confirmation, with an optional administrative reason where the API accepts one. Stale writes, refusals, busy and uncertain outcomes keep the administrator's context. Visibility of screens and actions follows the permission codes for presentation only; the API authorizes every request.

## 2. Scope

**In scope**

- Routes under the `_app` layout: user directory, create user, user detail; the first administration navigation item.
- User reads (`GET /api/iam/users`, `GET /api/iam/users/{userId}`) and the ACTIVE department and role lists used by pickers.
- User mutations of spec Section 25.3, membership (25.4) and role assignment (25.5).
- The carried-forward items of IAM-R07 (SA-4) and IAM-R08 (T-11, S-5, S-11, remount note).
- One additive API change: an optional `reason` body on `DELETE /api/iam/users/{userId}/roles/{roleId}` (D-02).
- Arabic and English copy; component tests; a browser journey with an accessibility scan in both directions (D-15).

**Out of scope**

- Department, role, role-permission and permission-catalog administration screens: IAM-MP-14 (run `IAM-R08C`).
- Real-Keycloak signed-in browser journeys: IAM-MP-15.
- Bulk user actions (no bulk API exists) and any recovery action of spec Section 54 (no API exists; it is a MAY).
- Any change to `@vertex-os/ui`, unless a missing primitive forces one (D-16).

## 3. Inputs

- Spec `docs/modules/iam.md`: Sections 10 (lifecycle, 10.6 transitions, 10.7 reactivation), 11 (sync and invitation), 22, 23.1, 25.3–25.5, 27, 40, 42, 52, 53, 54; Section 55 IAM-6.
- `docs/DESIGN_SYSTEM.md` Sections 28 (forms, conflicts, uncertain outcomes), 29 (tables), 30, 33 (status mapping), 34, 35 (dangerous actions), 38, 43.
- IAM-R07 contracts: plan `IAM_R07_HTTP_ADMINISTRATION_PLAN.md` D-03 (page contract), D-05 (problem codes), D-06, D-08 (reasons), D-13 (statuses), Section 5; `apps/api/src/iam/http/schemas.ts`.
- IAM-R08 foundation: plan `IAM_R08_FRONTEND_SESSION_PLAN.md` D-07, D-10, D-11, Hand-off.
- Carried forward to IAM-MP-13 → resolution:
  - IAM-R07 SA-4 (no reason when removing a role, including System Administrator) → D-02.
  - IAM-R08 foundation (`apiRequest`, refusal handling, `meta.permission`, `_app` remount) → built on, D-04, D-13.
  - IAM-R08 T-11 (navigation wiring test for the first `anyOf` item) → D-14.
  - IAM-R08 S-11 (every protected query declares `meta.permission`) → D-04.
  - IAM-R08 remount note (a permission change resets an open form) → D-13.
  - IAM-R08 S-5 (CSRF refusal presented as "try again") → D-11.

## 4. Decisions

- **D-01 Reviewers.** As the Master Plan names: architecture and boundaries; tests and verification. Dangerous-action UX and data exposure (audit focus) are checked by both and by the self-review.
- **D-02 Reason when removing a role (SA-4).** `DELETE /api/iam/users/{userId}/roles/{roleId}` accepts the same optional JSON body `{ reason }` as the other reason-taking routes (R07 D-08), strict, and passes it to the attribution, so it reaches the Audit record. No body stays valid (backward compatible). Not a query parameter: query strings reach access logs. OpenAPI documents the optional body. The confirmation UI offers the reason for every role removal; it is never required (spec Section 53).
- **D-03 Routes and list state.** `/users` (directory), `/users/new` (create), `/users/$userId` (detail). The directory keeps `page`, `pageSize` and `accessState` in the URL (non-sensitive, survive Back); the search text stays in memory only, because names and emails are personal data (DESIGN_SYSTEM Section 29.2). Directory filters are search and access state; the API's department and role filters wait for the pickers of IAM-MP-14.
- **D-04 Typed protected queries (S-11).** One helper builds every protected query's options from `{ permission, queryKey, queryFn }`, so `meta.permission` cannot be omitted; every IAM administration query uses it. Keys start with `iam`, never with a public root.
- **D-05 Response reading.** Small type guards read the fields the screens use (as R08 D-07); an unexpected body is a `NetworkFailure` (load failure), never an empty result. An unknown state value renders the neutral "unknown status" label (DESIGN_SYSTEM Section 33), never success.
- **D-06 State labels.** Access and identity-sync labels, tones and icons follow DESIGN_SYSTEM Section 33; invitation delivery follows spec Section 40's table. Invitation delivery is shown only while the user is INVITED; its SENT label carries `invitationSentAt` on the detail (the directory omits that field, spec Section 42). FAILED with an earlier `invitationSentAt` says a resend failed after an earlier success (spec Section 11.3).
- **D-07 Action availability.** Actions appear when the permission codes include the route's permission and the access state admits them by spec Section 10.6 (suspend: INVITED, ACTIVE; disable: INVITED, ACTIVE, SUSPENDED; terminate: all but TERMINATED; reactivate: SUSPENDED, DISABLED; resend invitation: INVITED). This is presentation only: the backend decides, and each refusal (`IAM_INVALID_ACCESS_TRANSITION`, `IAM_LAST_SYSTEM_ADMIN`, `IAM_GRANT_EXCEEDS_ACTOR`, …) is explained in context. Sync identity is offered in every state (spec Section 25.3). The UI never predicts a backend-derived result.
- **D-08 Confirmations.** Suspend, disable, terminate, revoke sessions, remove role and remove membership use `AlertDialog` (danger, safe action focused). Reactivate and assigning the System Administrator role use the same deliberate confirmation with the primary intent and a warning (DESIGN_SYSTEM Section 35: privilege grants use primary fill). Each names the action, the user's display name and email, the consequence and reversibility; terminate says the record is kept and access cannot be restored. When the target is the signed-in administrator, the confirmation says so (their own sessions end). Optional reason (at most 500 characters) on suspend, disable, terminate, reactivate, revoke sessions, assign role and remove role.
- **D-09 Reactivation.** The confirmation says the backend restores ACTIVE if the user completed first activation before, otherwise INVITED pending first activation; the result message states the `target` the API returned. `expectedVersion` is the detail's version.
- **D-10 Outcomes in context.** Results appear as an `Alert` on the detail page (not only a toast): created, restricted (with sessions revoked), reactivated (target), synchronized (identity state and invitation outcome), resent (`SENT` or `NO_ACTION_REQUIRED`), sessions revoked (count and provider outcome). A committed change whose Keycloak follow-up failed is a success whose states show the failure (spec Section 27). Every mutation refreshes the user detail and the directory.
- **D-11 Refusal presentation.** One mapping from `ApiProblem`/`NetworkFailure` to localized, actionable messages: `400 VALIDATION_FAILED` marks the named fields; `409 IAM_VERSION_CONFLICT` keeps the draft and offers loading the latest version (DESIGN_SYSTEM Section 28.5); `403 CSRF_VALIDATION_FAILED` says "try again" (S-5); `503 SERVICE_BUSY` says busy with its `Retry-After`; `503 IDENTITY_PROVIDER_UNAVAILABLE` and `409 IAM_IDENTITY_CONFLICT` explain the identity service outcome and that the state was recorded; a network failure after submission is "result not confirmed", and the detail is reloaded before any repeat (Section 28.5). Session refusals stay with the global handler (R08 D-10).
- **D-12 Pickers.** Department and role choices read `state=ACTIVE`, `pageSize=100` (bounded, spec Section 42); when `total` exceeds the page, the picker says only the first 100 are listed. Without `iam.departments.read` or `iam.roles.read` the matching section of the create form and the add action are not shown.
- **D-13 Remount on permission change kept.** The gate still remounts protected views when the permission set changes (R08 D-10, review S-1): data of a lost permission must not stay rendered, and a form begun under the old permissions should not survive them. After a membership or role change that targets the signed-in administrator, the auth state is re-read so navigation and actions follow; the resulting remount is accepted.
- **D-14 Navigation.** An "administration" group with the Users item (`anyOf: ['iam.users.read']`), current on every `/users` route. A test shows the shell hides it without the code and shows it with it (T-11).
- **D-15 Browser journey.** Signed-in journeys through the real API need Keycloak (IAM-MP-15). This run adds a Playwright journey in the smoke project against the production build with the `/api` answers fulfilled in the browser: directory and detail in Arabic (RTL) and English, one confirmation dialog, and an axe scan with no violations.
- **D-16 Shared UI only.** Screens compose `@vertex-os/ui` components (lint `vertex-ui/no-raw-styling`); no local parallel components. No primitive is expected to be missing; if one is, the minimum is added to `@vertex-os/ui` and recorded.
- **D-17 Display name edit.** A dialog form with explicit save, dirty guard and `expectedVersion`; the email is shown read-only and never editable (spec Section 9.1).

No owner decisions: D-02 is an additive, optional field on an existing route that the carried-forward item and spec Section 53 already call for; nothing under "Changes Requiring Explicit Approval" is touched.

## 5. Design notes

### 5.1 Screens

| Screen | Content | Permission (UX) |
|---|---|---|
| Directory | search, access-state filter, table (user: name and email; departments; roles; access; identity sync; invitation while INVITED), offset pagination, "Invite user" | `iam.users.read`; invite: `iam.users.create` |
| Create | email, display name, memberships (ACTIVE departments, one primary), roles (ACTIVE roles; system role flagged) | `iam.users.create` |
| Detail | record header with the three facts; profile (email, display name, created, first activated, last access change); departments; roles; actions | `iam.users.read`; each action its route permission |

### 5.2 Action permissions (spec Section 25.3; R07 Section 5.1)

`iam.users.update` edit name · `iam.users.manage-access` suspend, disable, reactivate, terminate, sync identity · `iam.users.create` resend invitation · `iam.sessions.revoke` revoke sessions · `iam.users.manage-departments` membership changes · `iam.users.manage-roles` role changes.

### 5.3 API change (D-02)

`DELETE /api/iam/users/{userId}/roles/{roleId}`: optional body `IamReasonRequest` (`{ reason?: string }`, strict); unknown fields `400 VALIDATION_FAILED`; an invalid reason is refused as on the other routes; status `204` unchanged.

## 6. Done means

1. No password, MFA-secret, recovery-token or identity-provider-token field or handling exists in the new screens; email is read-only after creation. (Exit: no credential UI.)
2. Suspend, disable, terminate, revoke sessions, role removal, membership removal, reactivation and assigning the System Administrator role require a confirmation naming the action, the user (name and email), the consequence and reversibility; proven by component tests. (Exit: exact target and consequence.)
3. The reactivation result states the API's `target` (ACTIVE or INVITED pending first activation); proven for both. (Exit: backend-derived outcome.)
4. Access, identity sync and invitation delivery are three labeled facts; invitation delivery appears only for INVITED users; sync-identity and resend results are reported separately; proven by tests. (Exit: invitation not confused with sync or activation.)
5. `409 IAM_VERSION_CONFLICT` keeps the draft and offers the latest version; a network failure after submission is shown as unconfirmed and reloads the user; refusals keep the dialog and input; proven by tests. (Exit: safe context on stale writes and conflicts.)
6. Screens and actions follow the permission codes; the API still refuses; every protected query declares its permission through the helper; the navigation item's visibility is tested. (Audit focus: visibility vs enforcement.)
7. Arabic and English copy exist for every string; the browser journey passes an axe scan in RTL and LTR. (Exit: accessibility and Arabic/RTL verified.)
8. The role-removal reason reaches the Audit record; API and integration tests prove it; OpenAPI documents it.
9. `pnpm verify`, the API integration suite and `pnpm test:e2e` pass.

## 7. Stop conditions

Only those of the Run Contract. Any API change beyond D-02 is a scope change: record it and stop if it touches an approval item.

## 8. Verification

- `pnpm nx run @vertex-os/web:test`, `:lint`, `:typecheck` while working (`NX_DAEMON=false`).
- `pnpm nx run @vertex-os/api:test` and `:test:integration` for D-02 (Docker).
- `pnpm verify`; `pnpm test:e2e` (new journey).

## 9. Checklist

- [x] M1 Plan committed
- [x] M2 API: role-removal reason (D-02), tests, OpenAPI
- [x] M3 Foundation: protected query helper, IAM client and type guards, state labels, problem messages, tests
- [x] M4 Navigation and directory route, tests
- [x] M5 Create user, tests
- [x] M6 User detail: profile, three facts, edit name, lifecycle actions, sync, resend, revoke sessions, tests
- [x] M7 Memberships and roles on the detail, tests
- [x] M8 Browser journey with axe (D-15)
- [x] M9 `pnpm verify`, API integration suite, `pnpm test:e2e`
- [x] M10 In-run review and fixes
- [x] M11 Master Plan ledger, hand-off, pull request, CI

### 9.1 Deviations and discoveries

- **D-08 as built.** Assigning the System Administrator role from the user detail is confirmed inside the assignment dialog itself: choosing the system role shows the warning and renames the commit action to "Assign System Administrator role"; nothing is sent before that explicit action. The create form uses a separate `AlertDialog` because its commit action is "Invite user".
- **Reason refusals.** A `400 VALIDATION_FAILED` naming `reason` is shown as an invalid reason, not as a generic validation error.
- **Accessibility scan timing.** The first browser run reported `color-contrast` on secondary text inside the confirmation dialog. It came from the dialog's entry transition blending colours; the scan now waits until finite animations and transitions have finished, and passes. No token or component changed.
- **Raw address parameters (found by review T-11 test).** The router exposed `accessState=NOPE` to the page next to the validated search, and it reached the API. The directory page now applies its validation to what it reads.
- **Generated route tree.** `apps/web/src/routeTree.gen.ts` is regenerated by the TanStack Router plugin during the Nx tasks; it was not edited by hand.

## 10. Hand-off

**In-run review.** Two fresh-context reviewers checked `main...HEAD`: architecture and boundaries; tests and verification (D-01). The implementer checked the evidence of each finding before accepting it; each held.

- **Blocking, fixed:** AB-1 and T-3 (the create screen ignored `iam.users.create`; it now shows the no-access state and loads nothing), T-1 (no successful resend tested), T-2 (membership removal and System Administrator assignment did not assert the named target).
- **Fixed in the run:** AB-2 and T-4 (unit test pins `meta.permission`; a component test removes user data on permission loss), AB-3 (the IAM feature refreshes the auth state through the auth feature's exported `refreshAuthState`), AB-5 (`refreshDirectory` owns the list key), T-5 to T-13 (no-results state, TERMINATED and INVITED action sets, FAILED-after-SENT label, own-role re-read, picker gating and truncation note, reactivation intent, paging URL state, message wording in both languages, removal without reason or replacement, test names), T-14 (Testing Library async timeout 3 s for full-router renders). T-15 (the load-failure test waits for the client's real retry backoff) is kept with explicit timeouts.
- **Recorded, not changed:** AB-4 (`protectedQuery` names the `iam` root in `lib`; each new module extends it), AB-6 (the presentation copy of spec 10.6 matches the spec). The reviewer's note that directory search text is sent as a query parameter was checked: the API's request log serializer drops query strings (`safe-request-serializer.ts`).

**Carried forward** (attached to the Master Plan stages):

- **IAM-MP-14:** the foundation to build on; directory filters by department and role; route search validation.
- **IAM-MP-15:** signed-in user administration through the real API and Keycloak (D-15).
- **Superseded contract note:** R07 D-08 ("`DELETE` routes take no reason") no longer holds for role removal (D-02).
