# IAM-R05 — Department, Membership, Role and Permission Administration Core

**Status:** IN PROGRESS  
**Master Plan stages:** IAM-MP-08, IAM-MP-09  
**Risk tier:** A (reviewers: security; data and concurrency; architecture and boundaries)  
**Branch:** `iam/r05-privilege-administration`  
**Baseline commit:** `006c20226faaa80568c221aef7ad8316b079377d`

---

## 1. Objective

Give IAM the authoritative application-layer behavior for administering departments, department memberships, custom roles, role-permission mappings and user-role assignments, before any administrative HTTP route exists (IAM-MP-11). Every mutation runs in one IAM transaction together with its Audit evidence, checks optimistic versions where the resource is versioned, and takes row locks in one fixed order so that competing operations serialize instead of racing. The protected System Administrator role cannot be renamed, deactivated or stripped of its code-controlled mappings, and no operation can remove the role from the last ACTIVE System Administrator, even when two administrators are removed concurrently. The authorization context of IAM-R04 already reads committed state, so every change here is effective on the next request.

## 2. Scope

**In scope**

- Domain rules (pure functions): department and role field validation, membership and primary-membership decisions, custom-role protection, mapping validation, the last-System-Administrator decision.
- Two transaction-scoped ports, `OrganizationStore` (departments, memberships) and `RoleStore` (roles, mappings, assignments, System Administrator lock and count), bound into `IamTransactionScope`, with their PostgreSQL adapters.
- Use cases behind `@vertex-os/iam/composition`; request, result and view types on the public root.
- The bound composition root `apps/api/src/iam/administration.ts` (`createIamAdministration`), not mounted in HTTP.
- Unit tests of the rules; PostgreSQL integration tests of every use case, including competing operations and the effect on the authorization context.

**Out of scope**

- HTTP routes, DTOs, OpenAPI and the mapping of outcomes to HTTP error codes (IAM-MP-11). Section 5.6 lists the intended mapping for MP-11.
- Read and list capabilities (directory, department and role lists, catalog reads): IAM-MP-11 builds them with its GET routes.
- User creation with initial memberships and roles, access-state transitions, session revocation and bootstrap (IAM-MP-10). They reuse the locks defined here (Section 10).
- Permission registration and retirement: stays with reference synchronization (IAM-MP-02); this run only fixes how mappings treat non-ACTIVE permissions.
- Frontend (IAM-MP-14).
- Schema changes: none are needed (Section 5.1).

## 3. Inputs

Specification: `docs/modules/iam.md` Sections 9.2–9.7, 18–20, 21.2–21.4 (serialization with bootstrap), 22, 23, 28, 29, 30, 34, 35, 44, 46.1–46.3, 53 and IAM-5 (Section 55); Master Plan Section 7 (invariants 8, 11–13, 15, 16, 20) and the IAM-MP-08 and IAM-MP-09 sections; `IAM_R04_AUTHORIZATION_CONTEXT_PLAN.md` Section 10; `IAM_01_PERSISTENCE_FOUNDATION_PLAN.md` Section 23; `IAM_02_REFERENCE_DATA_AND_AUDIT_FOUNDATION_PLAN.md` interpretations I-1 and I-6.

Carried-forward items and their resolution:

| Item | Resolution |
|---|---|
| IAM-01 Section 23: primary-membership switch ordering (the partial unique index is immediate) | The old primary is cleared before the new one is set, in one transaction under the user-row lock (D-09). |
| IAM-02: `DEPRECATED`/`RETIRED` mappings of custom roles | A custom role never receives a mapping to a non-ACTIVE code; existing ones are kept (never effective, IAM-R04 D-06) and dropped by the next replacement (D-15). |
| R04: use the authorization boundary, do not duplicate it | No use case re-checks permission codes; the coarse capability is the HTTP route's `@RequirePermission` (IAM-MP-11). Resource and state rules are here (D-02). No new permission code is added. |
| R04: composition entry | Use cases go behind `@vertex-os/iam/composition` and are bound in `apps/api/src/iam/administration.ts` (D-03). |
| R04: custom-role version semantics | Aligned with I-6: any change of attributes, state or mapping set raises the version by exactly one; a no-op raises nothing (D-14). |
| R04: system-role mappings stay unwritable | Every role mutation refuses the system role (`system-role-protected`) before writing (D-13). |

## 4. Decisions

- **D-01 Application layer only.** This run delivers use cases and their persistence; IAM-MP-11 adds HTTP. The use cases are exercised by integration tests through the bound composition root, like IAM-R02's provisioning root.
- **D-02 Attribution, not authorization.** Every mutation takes an `AuditAttribution` (actor, trace ID, optional reason; spec Section 53). The caller has already passed the route's permission check; the use cases apply resource and state rules only.
- **D-03 Surface.** Use cases are exported from `@vertex-os/iam/composition`. Request, result and view types (`DepartmentView`, `RoleView`, outcome unions) are exported from the root; they carry no repository, no user entity and no persistence type (spec Section 44, IAM-R04 D-12). The ports are exported from `@vertex-os/iam/persistence` for the adapter only.
- **D-04 Transaction and isolation.** Each use case is one `IamTransactionRunner.run` (READ COMMITTED), in which the change and its Audit record commit together or not at all (invariant 16). Serialization comes from explicit row locks (D-05), not from SERIALIZABLE retries.
- **D-05 Lock order.** Every mutation that locks more than one row locks in this order: (1) the role row, `FOR UPDATE`; (2) the user row, `FOR UPDATE`; (3) department rows or permission rows, `FOR SHARE`. A department or role mutation locks only its own row `FOR UPDATE`. No path takes a lock earlier in the order after a later one, so these operations cannot deadlock one another. Reference synchronization (advisory lock → permission rows → system role row) never waits on a user row, so it cannot form a cycle with them either.
- **D-06 Last ACTIVE System Administrator.** Every assignment or removal of the `system-administrator` role locks the role's row `FOR UPDATE` first (D-05 step 1). A removal from an ACTIVE user then counts ACTIVE holders under that lock and refuses with `last-system-admin` when the count is one. The lock serializes every count-reducing operation and the future bootstrap (spec Sections 20, 21.4); per-user versions are not relied on. IAM-MP-10's suspension, disablement, termination and bootstrap take the same lock through `RoleStore.lockSystemAdministratorRole()`.
- **D-07 The target user's row is locked** (D-05 step 2) by every membership and assignment mutation before its state is read. This orders the removal against a concurrent first activation (INVITED → ACTIVE), so a removal can never read INVITED and commit after the user became the only ACTIVE administrator, and it serializes all membership and assignment changes of one user, so pre-checks for duplicates and primaries stay true until commit.
- **D-08 Department state checks lock the department row `FOR SHARE`.** Adding a membership or making one primary locks the department `FOR SHARE`, which conflicts with a deactivation's `FOR UPDATE`; after the wait, READ COMMITTED returns the committed state, so a membership is never added to a department that a concurrent deactivation already made INACTIVE. (A foreign-key insert only takes `FOR KEY SHARE`, which does not conflict with an ordinary update; the explicit lock is required.)
- **D-09 Primary membership.** At most one primary per user (spec Section 22). Adding a membership with `isPrimary`, or setting `isPrimary` on an existing one, is the caller's explicit choice: the current primary, if any, is demoted first and then the new one is set, so the immediate partial unique index never sees two primaries (IAM-01 Section 23). Setting `isPrimary = false` on the primary leaves the user without one. Removing the primary membership leaves the user without a primary unless the request names a replacement; the replacement must be another existing membership of the user in an ACTIVE department. The backend never picks a replacement itself (`primary-conflict` when a replacement is named for a non-primary removal or is not a membership of the user).
- **D-10 Inactive departments.** Adding a membership to an INACTIVE department and making such a membership primary are refused (`department-inactive`). Removing it and demoting it are allowed. Deactivation does not touch memberships: the authorization context already omits INACTIVE departments and the primary they hold (IAM-R04 D-06), and reactivation restores them. No department is ever deleted (spec Section 29).
- **D-11 Inactive roles.** Assigning an INACTIVE role is refused (`role-inactive`); removing its assignment is allowed. Deactivation keeps assignments and mappings; the context ignores them until the role is active again (spec Section 23).
- **D-12 Target user state.** Memberships and assignments may be changed for a user in any access state. The spec forbids none of them, none grants access to a user who is not ACTIVE, and bootstrap recovery (spec Section 21.3) removes the role from SUSPENDED and DISABLED holders. The last-administrator rule applies only when the target is ACTIVE (spec Section 20).
- **D-13 System role protection.** Updating, activating, deactivating or replacing the mappings of the system role returns `system-role-protected` without writing (spec Section 20). Custom roles can never hold the reserved code: creation refuses it (`code-taken`), and the `iam_role_system_code_ck` constraint backs this. Assigning and removing the system role are ordinary assignment operations under D-06.
- **D-14 Versions.** Departments and roles carry `version`. Update, activate, deactivate and mapping replacement require the expected version; a mismatch returns `version-conflict` and writes nothing (spec Section 30). A successful change raises the version by exactly one. A request that would change nothing (same values, same state, same mapping set) returns `unchanged`, writes nothing, records no Audit evidence and raises no version (I-6). Membership and assignment rows are not versioned: add and remove are intent-explicit (a duplicate add or a missing remove is refused), so no stale screen can silently overwrite newer state. They do not raise the user's version, which guards the user record and access state (IAM-MP-10).
- **D-15 Mappings.** Replacement is a full set (spec Section 25.7 `PUT`). Every code must be a well-formed, registered, ACTIVE permission (`unknown-permission`, `permission-not-assignable`); duplicates in the request are invalid input. Permission rows are locked `FOR SHARE`, so a concurrent reference synchronization that deprecates or retires a code is ordered with the replacement. Existing non-ACTIVE mappings stay until the next replacement, which cannot keep them. No wildcard exists (spec Section 9.5) and there are no direct user grants (spec Section 9.7).
- **D-16 Audit evidence.** Each successful change appends exactly one record (source module `iam`, result `SUCCEEDED`, the attribution's actor, trace ID and reason) with before/after values of the changed fields:
  - departments (`iam.department`, target the department ID): `iam.department.created`, `updated`, `activated`, `deactivated`;
  - roles (`iam.role`, target the role ID): `iam.role.created`, `updated`, `activated`, `deactivated`, `permissions-replaced` (full before and after sets);
  - users (`iam.user`, target the user ID): `iam.user.department-added`, `department-removed`, `primary-department-changed`, `role-assigned`, `role-removed`.

  Refusals by `last-system-admin` and `system-role-protected` are recorded as `REFUSED` with the attempted action code, because they are attempts against System Administrator protection (spec Section 34). Other refusals (not found, invalid, conflict) are not recorded. An invalid entry is a programming error and rolls the transaction back.
- **D-17 Creation races.** Department and role creation insert with `ON CONFLICT DO NOTHING` semantics, so a concurrent creation of the same code yields `code-taken` instead of aborting the transaction. Inserts of memberships and assignments are protected by the user-row lock (D-07); the primary keys remain the backstop.
- **D-18 No read or list capabilities.** Results return the changed department or role as a view; memberships and assignments return their outcome. Lists and details are IAM-MP-11's work.

No owner decisions: nothing here changes an item under "Changes Requiring Explicit Approval" (no migration, no new infrastructure, no public HTTP contract, no change to the authorization model), and the specification leaves none of these questions to the owner.

## 5. Design notes

### 5.1 Schema

No migration. The existing schema already provides the unique codes, the composite primary keys of the join tables, the partial unique index `iam_department_membership_one_primary_key`, `iam_role_system_active_ck`, `iam_role_system_code_ck`, and the `version` columns. Locks are taken with `SELECT … FOR UPDATE` / `FOR SHARE` through the IAM-scoped client.

### 5.2 Use cases and outcomes

Inputs are raw strings; IDs, codes and texts are parsed first (`invalid` with the field name).

| Use case | Success | Refusals |
|---|---|---|
| `createDepartment(code, name, description?)` | `created` (ACTIVE, version 1) | `invalid`, `code-taken` |
| `updateDepartment(id, expectedVersion, name?, description?)` (description `null` clears; code is immutable) | `updated`, `unchanged` | `invalid`, `department-not-found`, `version-conflict` |
| `activateDepartment` / `deactivateDepartment(id, expectedVersion)` | `updated`, `unchanged` | `invalid`, `department-not-found`, `version-conflict` |
| `addMembership(userId, departmentId, isPrimary)` | `added` (with the demoted primary, if any) | `invalid`, `user-not-found`, `department-not-found`, `department-inactive`, `duplicate-membership` |
| `setPrimaryMembership(userId, departmentId, isPrimary)` | `updated`, `unchanged` | `invalid`, `user-not-found`, `membership-not-found`, `department-inactive` |
| `removeMembership(userId, departmentId, replacementPrimaryDepartmentId?)` | `removed` | `invalid`, `user-not-found`, `membership-not-found`, `primary-conflict`, `department-inactive` |
| `createRole(code, name, description?)` | `created` (custom, ACTIVE, version 1, no mappings) | `invalid`, `code-taken` |
| `updateRole(id, expectedVersion, name?, description?)` | `updated`, `unchanged` | `invalid`, `role-not-found`, `version-conflict`, `system-role-protected` |
| `activateRole` / `deactivateRole(id, expectedVersion)` | `updated`, `unchanged` | as `updateRole` |
| `replaceRolePermissions(id, expectedVersion, codes)` | `updated`, `unchanged` | as `updateRole`, plus `unknown-permission`, `permission-not-assignable` |
| `assignRole(userId, roleId)` | `assigned` | `invalid`, `user-not-found`, `role-not-found`, `role-inactive`, `duplicate-assignment` |
| `removeRole(userId, roleId)` | `removed` | `invalid`, `user-not-found`, `role-not-found`, `assignment-not-found`, `last-system-admin` |

A version check precedes the `unchanged` decision, so a stale version is always `version-conflict`.

### 5.3 Ports

- `OrganizationStore`: `createDepartment` (returns `code-taken` on conflict), `lockDepartment(id, 'update' | 'share')`, `writeDepartment(id, expectedVersion, fields)` (conditional on the version; raises it by one), `lockUser(id)` → access state, `readMemberships(userId)` with each department's state, `insertMembership`, `setMembershipPrimary`, `deleteMembership`.
- `RoleStore`: `createRole`, `lockRole(id)` (`FOR UPDATE`), `lockSystemAdministratorRole()`, `writeRole(id, expectedVersion, fields)`, `readRolePermissionCodes(roleId)`, `lockPermissions(codes)` (`FOR SHARE`, returns code and state), `replaceRolePermissions(roleId, add, remove)`, `lockUser(id)`, `hasAssignment`, `insertAssignment`, `deleteAssignment`, `countActiveSystemAdministrators()`.

Writes that the rules have already decided fail loudly (throw) when they do not affect exactly the expected rows; that can only mean a broken lock assumption.

### 5.4 Views

`DepartmentView = { id, code, name, description?, state, version }`; `RoleView = { id, code, name, description?, state, isSystem, version }`, frozen. Mapping replacement returns the role view and the resulting code set.

### 5.5 Rules as pure functions

The domain decides, the store executes: `decideMembershipAddition`, `decidePrimaryChange`, `decideMembershipRemoval`, `decideRoleChange` (system-role protection, version, unchanged), `planMappingReplacement` (validity, assignability, diff), `decideRoleRemoval` (last-administrator rule). These are unit-tested without persistence (spec Section 46.1).

### 5.6 Intended HTTP mapping (for IAM-MP-11)

`department-not-found` → 404 `IAM_DEPARTMENT_NOT_FOUND`; `role-not-found` → 404 `IAM_ROLE_NOT_FOUND`; `user-not-found` → 404 `IAM_USER_NOT_FOUND`; `department-inactive` → 409 `IAM_DEPARTMENT_INACTIVE`; `role-inactive` → 409 `IAM_ROLE_INACTIVE`; `duplicate-membership` → 409 `IAM_DUPLICATE_DEPARTMENT_MEMBERSHIP`; `duplicate-assignment` → 409 `IAM_DUPLICATE_ROLE_ASSIGNMENT`; `primary-conflict` → 422 `IAM_PRIMARY_DEPARTMENT_CONFLICT`; `last-system-admin` → 409 `IAM_LAST_SYSTEM_ADMIN`; `system-role-protected` → 409 `IAM_SYSTEM_ROLE_PROTECTED`. The specification has no code for `version-conflict`, `code-taken`, `membership-not-found`, `assignment-not-found`, `unknown-permission`, `permission-not-assignable` or `invalid`; IAM-MP-11 names them once (spec Section 27).

## 6. Done means

1. Departments are created, updated, activated and deactivated with version checks; stale versions are refused without writing; no-ops write nothing; no department is deleted. *(MP-08 exit 4.)*
2. Deactivating a department removes it, and a primary it holds, from the next authorization context of its members; reactivating restores both. *(MP-08 exit 1.)*
3. A membership cannot be added to, or made primary in, an INACTIVE department, also when the deactivation runs concurrently. *(Spec Section 22.)*
4. A user never has two primaries: concurrent primary changes for one user all serialize and leave exactly one primary, and removing the primary never selects a replacement unless the request names it. *(MP-08 exits 2, 3.)*
5. The system role cannot be renamed, deactivated or given a different mapping set; custom roles cannot take the reserved code; there are no direct user-permission grants and no wildcards. *(MP-09 exits 1, 2.)*
6. Two concurrent removals of the System Administrator role from the only two ACTIVE holders leave exactly one of them holding it; one removal is refused with `last-system-admin`. A removal racing the first activation of its own target waits for it and then applies the rule to the ACTIVE user, so it cannot remove the last ACTIVE holder either. *(MP-09 exit 3; spec Section 20.)*
7. Stale role versions cannot overwrite newer role state or mappings; replacing mappings raises the version once, a no-op not at all; non-ACTIVE codes are never newly mapped. *(MP-09 exit 4; D-14, D-15.)*
8. Assigning or removing a role, replacing a mapping, deactivating a role and changing memberships change the authorization context on the next resolution. *(MP-09 exit 5; invariant 11.)*
9. Every successful change appends exactly one Audit record with before/after evidence in the same transaction; a refused System Administrator protection appends one `REFUSED` record; if the append fails, the change is rolled back. *(MP-08 exit 5; invariant 16.)*
10. No new dependency, no migration; the IAM root exports no port, use case or persistence type; `pnpm verify` and the integration suites are green.

## 7. Stop conditions

- The fixed lock order (D-05) cannot be kept for an operation this run needs.
- A rule requires a schema change or a new HTTP contract.

## 8. Verification

- `@vertex-os/iam:test`: the rule functions of Section 5.5 (every outcome of Section 5.2 that the domain decides).
- `@vertex-os/iam-persistence:test:integration`: store behavior that depends on PostgreSQL (conflict-free creation, lock modes, count query), where not covered through the use cases.
- `@vertex-os/api:test:integration` (`administration.integration.spec.ts`): every use case against real PostgreSQL through `createIamAdministration`; Audit records; the authorization-context effects through `createIamAuthorization`; truly concurrent operations for Done means 3, 4 and 6 (and a department code race for D-17), with a lock-holding transaction or parallel calls, never sequential simulation (TESTING Section 16).
- `pnpm lint:boundaries`, `pnpm verify`, integration suites of `iam-persistence`, `audit-persistence` (unchanged) and `api`.
- CI: `verify:full` and `deps:audit` on the pull request.

## 9. Checklist

- [x] M1 Plan committed
- [ ] M2 Domain rules, views and outcome types; unit tests
- [ ] M3 Ports and `IamTransactionScope`; PostgreSQL stores; runner binding
- [ ] M4 Use cases (departments, memberships, roles, mappings, assignments); composition and root exports
- [ ] M5 `createIamAdministration`; integration tests incl. concurrency and authorization-context effects
- [ ] M6 `pnpm verify` and integration suites green
- [ ] M7 In-run review (three reviewers); findings resolved
- [ ] M8 Master Plan ledger, hand-off, pull request, CI green

## 10. Hand-off

Written at the end of the run.
