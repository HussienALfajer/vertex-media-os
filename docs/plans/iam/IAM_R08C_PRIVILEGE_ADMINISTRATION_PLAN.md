# IAM-R08C — Frontend Departments, Roles and Permissions Administration

**Status:** IN PROGRESS  
**Master Plan stages:** IAM-MP-14  
**Risk tier:** B (reviewers: architecture and boundaries; tests and verification)  
**Branch:** `iam/r08c-privilege-administration`  
**Baseline commit:** `d849355d741c243c40c3034f0c82720e278afa98`

---

## 1. Objective

An IAM administrator manages departments, roles, role-permission mappings and reads the permission catalog in the production web application through the shared Vertex design system. Departments and custom roles can be created, renamed, re-described, activated and deactivated; a custom role's permissions are edited by choosing from the registered catalog only, with an explicit review of what is added and removed before saving. The System Administrator role is shown as protected, identified by the API's `isSystem` flag, never by its name or code. Department and role deactivation, role activation and permission edits state their exact target and consequence. Stale writes keep the draft; refusals and uncertain outcomes keep the administrator's context. The API authorizes and enforces every rule; the UI presents them.

## 2. Scope

**In scope**

- Routes under the `_app` layout: departments list and detail, roles list and detail (with the permission editor), permission catalog; their navigation items.
- The routes of spec Sections 25.6, 25.7 and 25.8 as the IAM-R07 contract defines them. No API change is expected.
- The carried-forward items of IAM-R08B: foundation, directory filters by department and role, route search validation.
- Arabic and English copy; component tests; a browser journey with an accessibility scan in both directions.

**Out of scope**

- Any change to user administration beyond the directory's department and role filters.
- Real-Keycloak signed-in journeys, privilege-change effect verification end to end: IAM-MP-15.
- Creating, editing or retiring permission codes (spec Section 18: code-reviewed manifests only).
- Hard deletion of departments or roles (spec Sections 22, 29; no API exists).
- Any change to `@vertex-os/ui`, unless a missing primitive forces one (D-15).

## 3. Inputs

- Spec `docs/modules/iam.md`: Sections 9.2–9.7, 18, 19, 20, 22, 23, 23.1, 25.6–25.8, 27, 40, 42, 52, 53; Section 55 IAM-6.
- `docs/DESIGN_SYSTEM.md` Sections 28 (28.2 permissions as grouped checkboxes with mixed state and an explicit review/save step; 28.4; 28.5), 29, 30, 31, 33, 34, 35, 38, 43.
- IAM-R07 contracts: `apps/api/src/iam/http/schemas.ts`, `departments.controller.ts`, `roles.controller.ts`, `iam-problems.ts`.
- IAM-R08B foundation and plan `IAM_R08B_USER_ADMINISTRATION_PLAN.md` D-04, D-05, D-07, D-11, D-13, Hand-off.
- Carried forward to IAM-MP-14 → resolution:
  - IAM-R08B foundation (`protectedQuery`, `describeMutationFailure`, `ReasonField`, `iam-states.tsx`, `useAccess`, ACTIVE pickers) → built on, D-04, D-10, D-11.
  - IAM-R08B directory filters by department and role → D-09.
  - IAM-R08B route search validation → D-02 (every new route validates what it reads).

## 4. Decisions

- **D-01 Reviewers.** As the Master Plan names: architecture and boundaries; tests and verification. Privilege-management UX and "no backend policy in React" (audit focus) are checked by both and by the self-review.
- **D-02 Routes and list state.** `/departments`, `/departments/$departmentId`, `/roles`, `/roles/$roleId`, `/permissions`. Lists keep `page`, `pageSize` and `state` in the address; search text stays in memory as in the user directory (one pattern for every IAM list). Each page applies its search validation to what it reads (R08B discovery). Creation of departments and roles is a dialog on the list page that navigates to the new record's detail.
- **D-03 Navigation.** The administration group gains Departments (`anyOf: ['iam.departments.read']`), Roles (`iam.roles.read`) and Permissions (`iam.permissions.read`), each current on its routes; tested for visibility by permission code.
- **D-04 Reads.** Every new read goes through `protectedQuery` with the route's permission; keys start with `iam`. After any department or role mutation the lists, the detail, the ACTIVE pickers and the user queries (which embed department and role names and states) are refreshed.
- **D-05 Departments.** Detail shows code (read-only, stable; spec Section 9.2), name, description, state. Edit (`iam.departments.manage`) is a dialog with explicit save, dirty guard and `expectedVersion`; an emptied description is sent as `null`. Activation is a direct action with pending state and a result in context. Deactivation always asks for confirmation (`AlertDialog`, danger): department name and code; consequence — it leaves every member's organizational context immediately, including as primary, memberships are kept, no new membership can be added; reversible by activation; the member count when the administrator holds `iam.users.read` (`GET /api/iam/users?departmentId=…&pageSize=1` → `total`, all access states), otherwise no count. The API takes no reason for department changes; none is offered.
- **D-06 Roles.** Detail shows code, name, description, state, "system role" when `isSystem`, and the mapped permissions with their catalog name, sensitivity and state. For a custom role with `iam.roles.manage`: edit (as D-05), activate, deactivate, edit permissions. Activation is a privilege grant: a deliberate confirmation with primary intent, the role's ACTIVE permissions and holder count, and the note that the backend refuses it if the administrator does not hold them (spec Section 23.1). Deactivation: `AlertDialog` danger with holder count, consequence (its permissions leave every holder's context on the next request; assignments and mappings are kept; reversible), optional reason. Holder counts use `GET /api/iam/users?roleId=…&pageSize=1` when `iam.users.read` is held.
- **D-07 System role presentation.** When `isSystem` is true the detail shows a protection notice (name, state and permissions are code-controlled; it receives every active permission; ordinary UI and API cannot change them) and offers no edit, state or permission action. This follows the API's `isSystem` flag, never the role's code or name, and is presentation: the API still refuses with `IAM_SYSTEM_ROLE_PROTECTED`, which is explained if it happens.
- **D-08 Permission editor.** A wide drawer from the role detail (`iam.roles.manage` plus `iam.permissions.read`). Step one: the ACTIVE catalog as checkboxes grouped by owning module, each group with a mixed state; each item shows name, code, sensitivity and description. There is no free-text code input: the requested set is built from catalog entries only (spec Section 18). Mapped codes that are no longer ACTIVE are listed separately as "will be removed when you save", because the backend never keeps or adds them (IAM-R05 D-15). Step two (review): the added and removed permissions by name and code, a warning when a PRIVILEGED permission is added, the holder count, the note that changes apply on the next authorization evaluation, the optional reason, and the commit action "Save permission changes". Saving sends `PUT /api/iam/roles/{roleId}/permissions` with the full set and the role's version. The UI does not pre-filter permissions by the administrator's own codes: the grant ceiling is the backend's and `IAM_GRANT_EXCEEDS_ACTOR` is explained in context. The catalog is read as one bounded page (`pageSize=100`); a truncation note appears when `total` exceeds it.
- **D-09 Directory filters (carried forward).** The user directory offers department and role filters when the administrator holds `iam.departments.read` / `iam.roles.read`, fed by one bounded page (100) of each list in every state; the chosen IDs live in the address and are validated as UUIDs before use. Department and role details link to the directory filtered by them when `iam.users.read` is held.
- **D-10 State labels.** Department and role state: ACTIVE → success/`نشط`/Active, INACTIVE → neutral/`غير نشط`/Inactive. Permission state: ACTIVE → success, DEPRECATED → warning/`متقادم`/Deprecated, RETIRED → neutral archive/`مسحوب`/Retired. Sensitivity is a separately labeled fact: STANDARD → neutral, SENSITIVE → warning, PRIVILEGED → warning with the shield icon and label `صلاحية امتيازية`/Privileged. Unknown values use the neutral unknown-status label (DESIGN_SYSTEM Section 33).
- **D-11 Refusals.** The IAM mutation mapping gains `IAM_DEPARTMENT_CODE_CONFLICT` and `IAM_ROLE_CODE_CONFLICT` (shown on the code field), `IAM_SYSTEM_ROLE_PROTECTED`, `IAM_UNKNOWN_PERMISSION` and `IAM_PERMISSION_NOT_ASSIGNABLE` (the role and catalog are reloaded). `400 VALIDATION_FAILED` naming `code`, `name` or `description` marks that field. Conflicts, CSRF, busy and unconfirmed outcomes follow R08B D-11.
- **D-12 Client validation.** Presence only (code and name not empty). The code rule (lowercase letters, digits and single hyphens, 2–64 characters) is help text; the API's `400` on `code` is authoritative and marks the field. No length or format policy is re-implemented beyond the input's `maxLength`.
- **D-13 Own access after a change.** After a role's state or mappings change, or a department's state changes, the auth state is re-read through `refreshAuthState`, because the administrator may hold that role or membership; the resulting remount on a changed permission set is accepted (R08B D-13).
- **D-14 Browser journey.** A Playwright journey in the smoke project against the production build with `/api` answered in the browser: departments list and detail, role detail with the permission editor's review step, the catalog, in Arabic (RTL) and English, with an axe scan with no violations.
- **D-15 Shared UI only.** Screens compose `@vertex-os/ui` (lint `vertex-ui/no-raw-styling`). No primitive is expected to be missing; if one is, the minimum is added to `@vertex-os/ui` and recorded.
- **D-16 Stale writes.** Edit dialogs and the permission editor keep the draft on `409 IAM_VERSION_CONFLICT` and offer loading the latest version; for the editor, the latest mapped set is shown next to the draft (read-only comparison, DESIGN_SYSTEM Section 28.5) before saving again against the new version. A network failure after submission is "result not confirmed" and reloads the record.

No owner decisions: the run consumes the accepted IAM-R07 HTTP surface and changes nothing under "Changes Requiring Explicit Approval".

## 5. Design notes

### 5.1 Screens

| Screen | Content | Permission (UX) |
|---|---|---|
| Departments | search, state filter, table (name and code; description; state), pagination, "New department" | `iam.departments.read`; create: `iam.departments.manage` |
| Department | record header (name, code, state); description; member count and link; edit, activate, deactivate | `iam.departments.read`; actions: `iam.departments.manage` |
| Roles | search, state filter, table (name and code; system role; state), pagination, "New role" | `iam.roles.read`; create: `iam.roles.manage` |
| Role | record header; description; protection notice for the system role; holder count and link; mapped permissions; edit, activate, deactivate, edit permissions | `iam.roles.read`; mapping names: `iam.permissions.read`; actions: `iam.roles.manage` |
| Permissions | search, state filter, table (name and code; module; sensitivity; state; description), pagination; no actions | `iam.permissions.read` |

Without `iam.permissions.read`, the role detail lists mapped codes only and the permission editor is not offered.

### 5.2 Contracts consumed

`IamDepartment`, `IamDepartmentPage`, `IamRole`, `IamRoleDetail` (`permissionCodes`), `IamRolePage`, `IamPermissionPage`; requests `IamCreateDepartmentOrRoleRequest`, `IamUpdateDepartmentOrRoleRequest`, `IamVersionRequest`, `IamDeactivateRoleRequest`, `IamReplaceRolePermissionsRequest`. Activation and deactivation answer `200` with the record; an already-applied state answers `200` unchanged.

## 6. Done means

1. The permission editor builds the requested set only from catalog entries; no screen accepts a typed permission code; mapped non-ACTIVE codes are dropped visibly; proven by tests. (Exit: map existing permissions, cannot invent codes.)
2. The system role shows the protection notice and no change action, decided by `isSystem`; a test gives a system role an ordinary name and a custom role the name "System Administrator" and proves the presentation follows the flag. (Exit: System Administrator protections visible; role names not used as logic.)
3. Department deactivation names the department, the consequence, the reversibility and the member count when readable; proven by tests. (Exit: department deactivation consequences communicated.)
4. Role deactivation, role activation and permission edits require a confirmation naming the role, the change and its reach; the permission review lists additions and removals and warns on PRIVILEGED additions; proven by tests. (Spec Section 52.)
5. `409 IAM_VERSION_CONFLICT` keeps the draft and offers the latest version; unconfirmed results reload; `IAM_GRANT_EXCEEDS_ACTOR`, `IAM_SYSTEM_ROLE_PROTECTED` and code conflicts are explained in context; proven by tests. (Audit focus: stale mutation handling.)
6. Screens and actions follow the permission codes; every new query declares its permission through `protectedQuery`; the navigation items' visibility is tested. (Audit focus: no duplication of backend policy; visibility vs enforcement.)
7. The directory filters by department and role, with address values validated. (Carried forward.)
8. Arabic and English copy exist for every string; the browser journey passes an axe scan in RTL and LTR. (Exit: localization, keyboard, RTL, responsive.)
9. `pnpm verify` and `pnpm test:e2e` pass.

## 7. Stop conditions

Only those of the Run Contract. An API change found necessary is recorded; if it touches a public contract beyond an additive optional field, stop.

## 8. Verification

- `pnpm nx run @vertex-os/web:test`, `:lint`, `:typecheck` while working (`NX_DAEMON=false`).
- `pnpm verify`; `pnpm test:e2e` (new journey). No API code changes, so no API integration run unless that changes.

## 9. Checklist

- [x] M1 Plan committed
- [x] M2 Foundation: API client and guards, queries, state labels, refusal codes, navigation, tests
- [x] M3 Departments: list, create, detail, edit, activate, deactivate, tests
- [x] M4 Roles: list, create, detail, system-role presentation, edit, activate, deactivate, tests
- [x] M5 Permission catalog and permission editor with review step, tests
- [x] M6 Directory filters by department and role, tests
- [ ] M7 Browser journey with axe (D-14)
- [ ] M8 `pnpm verify`, `pnpm test:e2e`
- [ ] M9 In-run review and fixes
- [ ] M10 Master Plan ledger, hand-off, pull request, CI

### 9.1 Deviations and discoveries

_None yet._

## 10. Hand-off

_Written at the end of the run._
