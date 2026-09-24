import {
  parseAdministrativeReason,
  parseSystemProcess,
  type AuditAttribution,
  type AuditChangeSide,
  type TraceId,
} from '@vertex-os/audit';
import { normalizeEmail } from '../domain/email.js';
import type { UserId } from '../domain/identifiers.js';
import {
  SYSTEM_ADMINISTRATOR_ROLE_CODE,
  systemAdministratorRole,
  type PermissionManifest,
} from '../domain/permission-catalog.js';
import {
  planReferenceSync,
  validatePermissionManifests,
  type ReferenceSyncPlan,
} from '../domain/reference-sync-plan.js';
import { parseDisplayName } from '../domain/text.js';
import {
  classifyBootstrap,
  decideAccessRestriction,
  type BootstrapCandidate,
  type BootstrapRefusal,
} from '../domain/user-lifecycle.js';
import { requireIamEvidence } from './administration-evidence.js';
import {
  identitySyncOutcome,
  invitationOutcome,
  recordUserCreated,
  type IdentitySyncOutcome,
  type InvitationOutcome,
  type UserAdministrationDependencies,
} from './administer-users.js';
import { appendUserAudit } from './identity-provisioning-dependencies.js';
import { dispatchInvitation } from './invitation-dispatch.js';
import type { IamTransactionScope } from './ports/iam-transaction.js';
import { reconcileIdentity } from './reconcile-identity.js';

/** Bootstrap is a system process; the operator cannot choose who it acts as (spec Section 21.1). */
const BOOTSTRAP_PROCESS = parseSystemProcess('iam.bootstrap');
const INVOCATION_TARGET = { type: 'iam.bootstrap', id: SYSTEM_ADMINISTRATOR_ROLE_CODE } as const;

export interface BootstrapRequest {
  readonly mode: 'normal' | 'recovery';
  readonly email: string;
  readonly displayName: string;
  /** Required in recovery mode, accountability text otherwise ignored (spec Section 21.3). */
  readonly reason?: string;
  /** Re-dispatch an invitation that was already sent (spec Section 21.2, explicit request only). */
  readonly resendInvitation?: boolean;
  /** The code-defined permission manifests reference data must already match (IAM-02). */
  readonly manifests: readonly PermissionManifest[];
  readonly traceId: TraceId;
}

export type BootstrapRefusalReason = BootstrapRefusal | 'reference-data-not-synchronized';

export type BootstrapResult =
  | {
      readonly outcome: 'created' | 'resumed' | 'recovered';
      readonly userId: UserId;
      readonly identity: IdentitySyncOutcome;
      readonly invitation: InvitationOutcome;
      /** Recovery only: the candidates it terminated or removed the role from, with their sync. */
      readonly superseded: readonly {
        readonly userId: UserId;
        readonly change: 'terminated' | 'role-removed';
        readonly identity?: IdentitySyncOutcome;
      }[];
    }
  | { readonly outcome: 'refused'; readonly reason: BootstrapRefusalReason }
  | {
      readonly outcome: 'invalid';
      readonly field: 'email' | 'displayName' | 'reason' | 'manifests';
    };

function converged(plan: ReferenceSyncPlan): boolean {
  return (
    plan.register.length === 0 &&
    plan.update.length === 0 &&
    plan.grant.length === 0 &&
    plan.revoke.length === 0 &&
    plan.systemRole.kind === 'unchanged' &&
    plan.versionBump === undefined
  );
}

type Decided =
  | { readonly outcome: 'refused'; readonly reason: BootstrapRefusalReason }
  | {
      readonly outcome: 'created' | 'resumed' | 'recovered';
      readonly userId: UserId;
      readonly terminated: readonly UserId[];
      readonly stripped: readonly UserId[];
    };

/**
 * The operator-run bootstrap of the first System Administrator (spec Section 21; IAM-R06 D-15).
 * It decides only from committed state, in one transaction serialized against reference
 * synchronization, every System Administrator count change and other bootstrap runs, and refuses
 * unless reference data is synchronized. Keycloak work runs after that commit, through identity
 * reconciliation and invitation delivery only; it never creates credentials or a session.
 */
export async function bootstrapSystemAdministrator(
  dependencies: UserAdministrationDependencies,
  input: BootstrapRequest,
): Promise<BootstrapResult> {
  if (!BOOTSTRAP_PROCESS.ok) throw new Error('The bootstrap process code must be valid.');
  const email = typeof input.email === 'string' ? normalizeEmail(input.email) : undefined;
  if (!email?.ok) return { outcome: 'invalid', field: 'email' };
  const displayName =
    typeof input.displayName === 'string' ? parseDisplayName(input.displayName) : undefined;
  if (!displayName?.ok) return { outcome: 'invalid', field: 'displayName' };
  let attribution: AuditAttribution = {
    actor: { type: 'SYSTEM', process: BOOTSTRAP_PROCESS.value },
    traceId: input.traceId,
  };
  if (input.mode === 'recovery' || input.reason !== undefined) {
    const reason =
      typeof input.reason === 'string' ? parseAdministrativeReason(input.reason) : undefined;
    if (!reason?.ok) return { outcome: 'invalid', field: 'reason' };
    attribution = { ...attribution, reason: reason.value };
  }
  const manifests = validatePermissionManifests(input.manifests);
  if (!manifests.ok) return { outcome: 'invalid', field: 'manifests' };
  const invocation =
    input.mode === 'recovery' ? 'iam.bootstrap.recovery-invoked' : 'iam.bootstrap.invoked';

  const decided = await dependencies.runner
    .run(async (scope): Promise<Decided> => {
      const { referenceData, lifecycle, roles, audit } = scope;
      const refuse = async (reason: BootstrapRefusalReason): Promise<Decided> => {
        await audit.append(
          requireIamEvidence(attribution, {
            action: invocation,
            target: INVOCATION_TARGET,
            result: 'REFUSED',
            after: { mode: input.mode, refusal: reason },
          }),
        );
        return { outcome: 'refused', reason };
      };

      // Lock order (IAM-R06 D-05): the synchronization lock, the System Administrator role row,
      // then the candidates' user rows in ID order.
      await referenceData.acquireSynchronizationLock();
      const planned = planReferenceSync(
        manifests.permissions,
        systemAdministratorRole,
        await referenceData.readSnapshot(),
      );
      if (planned.outcome !== 'planned' || !converged(planned.plan)) {
        return refuse('reference-data-not-synchronized');
      }
      const roleId = await lifecycle.lockSystemAdministratorRole();
      if (roleId === undefined)
        throw new Error('Synchronized reference data lacks the system role.');
      const candidates: BootstrapCandidate[] = [];
      for (const id of await lifecycle.readRoleHolders(roleId)) {
        const user = await lifecycle.lockUser(id);
        if (user === undefined || user.accessState === 'TERMINATED') {
          throw new Error('A System Administrator holder changed under the role lock.');
        }
        candidates.push({ id: user.id, email: user.email, accessState: user.accessState });
      }
      const decision = classifyBootstrap({
        mode: input.mode,
        email: email.value,
        candidates,
        emailInUse: await lifecycle.emailInUse(email.value),
      });
      if (decision.kind === 'refuse') return refuse(decision.reason);

      const succeed = async (
        outcome: 'created' | 'resumed' | 'recovered',
        userId: UserId,
        details: AuditChangeSide = {},
      ): Promise<Decided> => {
        await audit.append(
          requireIamEvidence(attribution, {
            action: invocation,
            target: INVOCATION_TARGET,
            after: { mode: input.mode, outcome, candidateUserId: userId, ...details },
          }),
        );
        return {
          outcome,
          userId,
          terminated: decision.kind === 'recover' ? decision.terminate : [],
          stripped: decision.kind === 'recover' ? decision.strip : [],
        };
      };

      if (decision.kind === 'resume') return succeed('resumed', decision.candidate);
      if (decision.kind === 'recover') {
        await supersede(scope, attribution, roleId, decision.terminate, decision.strip);
      }
      const inserted = await lifecycle.insertUser({
        email: email.value,
        displayName: displayName.value,
      });
      // A concurrent ordinary creation of the same email committed after the check above.
      if (inserted.outcome === 'email-taken') throw new EmailTaken();
      await roles.insertAssignment({ userId: inserted.user.id, roleId });
      await recordUserCreated(audit, attribution, inserted.user, {
        departmentIds: [],
        primaryDepartmentId: undefined,
        roleCodes: [SYSTEM_ADMINISTRATOR_ROLE_CODE],
      });
      return decision.kind === 'recover'
        ? succeed('recovered', inserted.user.id, {
            terminatedUserIds: [...decision.terminate],
            roleRemovedUserIds: [...decision.strip],
          })
        : succeed('created', inserted.user.id);
    })
    .catch(async (error: unknown) => {
      if (!(error instanceof EmailTaken)) throw error;
      // The transaction rolled back; record the refusal on its own.
      await dependencies.runner.run(({ audit }) =>
        audit.append(
          requireIamEvidence(attribution, {
            action: invocation,
            target: INVOCATION_TARGET,
            result: 'REFUSED',
            after: { mode: input.mode, refusal: 'email-taken' },
          }),
        ),
      );
      return { outcome: 'refused', reason: 'email-taken' } as const;
    });
  if (decided.outcome === 'refused') return decided;

  // Keycloak work only after the commit (spec Section 21.3): superseded candidates first, in the
  // fail-closed order of spec Section 31.1.
  const superseded: {
    userId: UserId;
    change: 'terminated' | 'role-removed';
    identity?: IdentitySyncOutcome;
  }[] = [];
  for (const userId of decided.terminated) {
    await dependencies.sessions.revokeUserSessions(userId, 'terminated', attribution);
    const identity = await reconcileIdentity(dependencies, { userId, attribution });
    superseded.push({ userId, change: 'terminated', identity: identitySyncOutcome(identity) });
  }
  for (const userId of decided.stripped) superseded.push({ userId, change: 'role-removed' });

  const provisioning = { userId: decided.userId, attribution };
  const committed = await dependencies.users.findById(decided.userId);
  if (!committed) throw new Error('A committed bootstrap candidate disappeared.');
  const identity =
    committed.identitySyncState === 'SYNCED'
      ? identitySyncOutcome({ outcome: 'synced', user: committed })
      : identitySyncOutcome(await reconcileIdentity(dependencies, provisioning));
  let invitation: InvitationOutcome = { outcome: 'not-applicable' };
  if (identity.outcome === 'synced') {
    const current = await dependencies.users.findById(decided.userId);
    const delivery = current?.invitationDeliveryState;
    if (delivery === 'NOT_SENT') {
      invitation = invitationOutcome(
        await dispatchInvitation(dependencies, { ...provisioning, kind: 'first' }),
      );
    } else if (delivery === 'FAILED' || (delivery === 'SENT' && input.resendInvitation === true)) {
      invitation = invitationOutcome(
        await dispatchInvitation(dependencies, { ...provisioning, kind: 'resend' }),
      );
    }
  }
  return { outcome: decided.outcome, userId: decided.userId, identity, invitation, superseded };
}

/** Thrown inside the bootstrap transaction to roll it back when the email was taken meanwhile. */
class EmailTaken extends Error {
  constructor() {
    super('The bootstrap email was taken by a concurrent creation.');
  }
}

/**
 * Recovery's supersession (spec Section 21.3), under the locks already held: INVITED candidates
 * are terminated with `PENDING` (their Keycloak identity is disabled after the commit); SUSPENDED
 * and DISABLED ones only lose the System Administrator role, keeping their access and sync state.
 */
async function supersede(
  scope: IamTransactionScope,
  attribution: AuditAttribution,
  roleId: Parameters<IamTransactionScope['lifecycle']['readRoleHolders']>[0],
  terminate: readonly UserId[],
  strip: readonly UserId[],
): Promise<void> {
  const { lifecycle, roles, audit } = scope;
  for (const id of terminate) {
    const user = await lifecycle.lockUser(id);
    if (user === undefined) throw new Error('A locked candidate disappeared.');
    const decision = decideAccessRestriction({
      from: user.accessState,
      to: 'TERMINATED',
      holdsSystemAdministratorRole: true,
      activeAdministrators: 0,
    });
    if (decision.kind !== 'restrict') throw new Error('Recovery may only terminate INVITED users.');
    const terminated = await lifecycle.writeAccessRestriction({
      id,
      expectedVersion: user.version,
      accessState: 'TERMINATED',
    });
    await appendUserAudit(audit, attribution, terminated, 'iam.user.terminated', 'SUCCEEDED', {
      before: { accessState: user.accessState, identitySyncState: user.identitySyncState },
      after: { accessState: 'TERMINATED', identitySyncState: 'PENDING', supersededBy: 'recovery' },
    });
  }
  for (const id of strip) {
    await roles.deleteAssignment({ userId: id, roleId });
    await audit.append(
      requireIamEvidence(attribution, {
        action: 'iam.user.role-removed',
        target: { type: 'iam.user', id },
        before: { roleId, roleCode: SYSTEM_ADMINISTRATOR_ROLE_CODE },
        after: { supersededBy: 'recovery' },
      }),
    );
  }
}
