# IAM-FINAL — Final IAM Module Audit

**Verdict:** `IAM-FINAL FIXES REQUIRED`  
**Audited baseline:** merged `main` at `4dae6eb3e3b61c55353ea04d98b6050be7f65d2a`  
**Scope:** IAM-MP-00 through IAM-MP-15, the deferred IAM-CP2 authorization and administration checkpoint, and local-credential changes IAM-R10–R12.  
**Current authority:** ADR-0001 and `docs/modules/iam.md` Section 61 supersede the historical external-provider requirements.

## Method and evidence

Four independent read-only reviews covered security, data and concurrency, architecture and boundaries, and current UI/verification. The auditor compared their findings with the merged code, current contracts, the IAM evidence map, canonical security and design-system rules, and the carried items in the Master Plan Section 17. F-01 describes a deterministic interleaving derived from separate executable transactions; it has not yet been exercised against PostgreSQL in this audit environment. F-02 is a direct UI path and an absent route/unload guard.

The [IAM-R10 CI](https://github.com/HussienALfajer/vertex-media-os/actions/runs/36179932384), [IAM-R11 CI](https://github.com/HussienALfajer/vertex-media-os/actions/runs/36207270802), [IAM-R12 PR CI](https://github.com/HussienALfajer/vertex-media-os/actions/runs/36209024982), and [R12 merge CI on `main`](https://github.com/HussienALfajer/vertex-media-os/actions/runs/36245190149) all passed the required `verify:full` and `deps:audit` steps. The merge CI completed successfully at the audited commit. This audit relies on those full gates; it does not claim that they cover the findings below.

Targeted audit checks: IAM lifecycle Vitest, 28 tests passed; web Vitest, 9 files and 164 tests passed. A local `pnpm lint:boundaries` attempt reported passing negative and positive probes through C18 but did not terminate in the audit shell, so this audit does not claim a local pass; the merged CI did pass that gate. A PostgreSQL/Testcontainers probe could not start because access to the Docker engine pipe was denied. The R11 [project/UI QA record](../../../audits/PROJECT_QA_2026-09-25.md) contains representative manual Arabic mobile QA on the prior merged UI; R12 changed no UI files. The Final Audit did not repeat a manual browser inspection.

## Findings

Severity follows `docs/PLANNING.md` Section 8.3. The dedicated fix runs must be reviewed and merged before a focused re-check of blocking findings.

| ID | Severity | Evidence | Finding and required correction | Owner |
| --- | --- | --- | --- | --- |
| F-01 | **Blocking** | `apps/api/src/auth/auth.controller.ts:110-123`; `apps/api/src/auth/session-store.ts:237-263`; `domains/iam/src/application/administer-users.ts:501-563,637-746`; `apps/api/src/auth/request-session.ts:112` | Login checks ACTIVE before inserting its session, while a restriction commits and revokes sessions in between. The new session is not in the revocation sweep. It is denied during restriction, but can become valid after reactivation without a post-restriction sign-in. A revocation failure after restriction has the same revival risk. Add a durable access-generation rule to session issuance/use, or another race-safe equivalent; test forced interleavings and revocation failure against PostgreSQL. | Dedicated security fix run |
| F-02 | **Blocking** | `docs/DESIGN_SYSTEM.md:689-695`; `apps/web/src/features/iam/users/create-user.tsx:49-55,270-273`; IAM dialog components | The staff-creation Cancel action immediately discards email, password and selected roles. There is no route-change or browser-unload dirty guard in the production web source; Back, sidebar navigation and reload can discard edits in IAM dialogs too. Implement the required review choice and route/unload guards, exempt successful saves, and cover Cancel, navigation and unload behavior. | Dedicated UI fix run |
| F-03 | Major | `domains/iam/src/domain/permission-catalog.ts:42-44`; `apps/api/src/iam/http/responses.ts:119`; `apps/web/src/features/iam/organization/permission-list.tsx:72` | The live `iam.users.create` description says administrators can resend invitations, although Section 61 removed invitation email and the current HTTP API has no resend route. Correct the catalog text and its contract/UI evidence. | UI fix run |
| F-04 | Minor | `apps/web/src/features/iam/users/create-user.tsx:186-187,235-236`; `docs/DESIGN_SYSTEM.md:835,842` | Failed department and role picker reads show an error but no retry action. Add a retry control while preserving entered draft values. | UI fix run |
| F-05 | Minor | `apps/api/src/iam/user-administration.ts:102-116`; `domains/iam-persistence/src/local-identity-provider.ts:8-70`; `apps/api/src/iam/http/responses.ts:38-40` | Administration still uses a provider-era port and exposes migration-era sync/delivery fields in DTOs. The adapter reads local IAM rows, sends no external request and has no reachable invitation email path for newly created password accounts. Its names and synthetic status semantics are compatibility debt; UI must continue to hide them, and no consumer may treat `SENT` as proof of email. | IAM maintenance after blocking fixes |
| F-06 | Minor | `eslint.config.mjs`; `scripts/check-architecture-boundaries.mjs`; `apps/web-e2e/playwright.iam.config.mts` | The Nx module-boundary lint configuration does not inspect `.mts` files. No forbidden `.mts` import was found. Extend coverage when boundary tooling is next changed. | Engineering tooling backlog |

The carried permission-reactivation concern remains an operational release obligation: changing a DEPRECATED permission to ACTIVE in the reference catalog can widen roles already mapped to it. The releaser must inspect affected role mappings before that change. No current UI action reactivates a catalog permission.

## Scope conclusions

The active sign-in path verifies salted scrypt hashes inside the backend, creates opaque server-side sessions and uses no Keycloak, OIDC, TOTP or external provider service. The local identity compatibility adapter is in-process. Historical issuer/subject mappings and old provider-session columns remain for migration and safe refusal. The absence of Keycloak packages, Compose service and active provider network calls was checked against runtime files and manifests. The provider-era code is classified as F-05 rather than as an active authentication dependency.

The deferred IAM-CP2 scope was reviewed: current route protection, grant ceiling, role and membership administration, last-System-Administrator locking, bootstrap and one-time migrated-admin recovery, and Audit rollback have executable test evidence in the merged full gate and targeted lifecycle suite. This audit found no additional confirmed blocker in those paths. The session-revival defect F-01 crosses the deferred checkpoint's access lifecycle and session boundary, so the checkpoint cannot be accepted yet.

The implemented project currently consists of IAM, Audit, API and the Vertex UI foundation. CRM-to-payment workflows remain planned modules; this audit does not certify them as implemented. Production launch gates remain separate: server-specific scrypt benchmarking, compromised-password checks, HTTPS/security alerts and the Contabo deployment decision.

## Re-check condition

After dedicated reviewed fix runs for F-01 and F-02/F-03, re-check those findings and their regressions on merged `main`, update this record with the new evidence and exactly one current verdict, and obtain acceptance of the audit-record pull request. IAM remains open until the verdict is `IAM-FINAL ACCEPTED` and the record is merged.
