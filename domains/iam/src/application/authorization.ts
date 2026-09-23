import { createAuditEntry, userActor, type TraceId } from '@vertex-os/audit';
import {
  projectAuthorizationContext,
  type AuthorizationContext,
} from '../domain/authorization-context.js';
import type { PermissionCode } from '../domain/codes.js';
import { parseUserId, type UserId } from '../domain/identifiers.js';
import type { AuthorizationReader } from './ports/authorization-reader.js';
import type { IamTransactionRunner } from './ports/iam-transaction.js';

/** What authorization-context resolution needs; composition supplies it. */
export interface AuthorizationDependencies {
  readonly reader: AuthorizationReader;
  /** Appends the denial evidence (IAM-R04 D-15). */
  readonly runner: IamTransactionRunner;
}

export type ResolveAuthorizationContextResult =
  | { readonly outcome: 'active'; readonly context: AuthorizationContext }
  /** The user exists but is not ACTIVE. */
  | { readonly outcome: 'inactive' }
  | { readonly outcome: 'not-found' };

/** A coarse-capability denial of an authenticated, ACTIVE user. */
export interface AuthorizationDenial {
  readonly userId: UserId;
  readonly permissionCode: PermissionCode;
  readonly traceId: TraceId;
}

/**
 * The current authorization context of a user (spec Section 17), projected from committed IAM
 * state on every call: no cache, so a removed privilege is gone on the next call (invariant 11).
 * Anything missing, inactive or unknown yields no context (spec Section 16.4).
 */
export async function resolveAuthorizationContext(
  dependencies: Pick<AuthorizationDependencies, 'reader'>,
  userId: string,
): Promise<ResolveAuthorizationContextResult> {
  const id = parseUserId(userId);
  if (!id.ok) return { outcome: 'not-found' };
  const facts = await dependencies.reader.readAuthorizationFacts(id.value);
  if (facts === undefined) return { outcome: 'not-found' };
  const context = projectAuthorizationContext(id.value, facts);
  return context === undefined ? { outcome: 'inactive' } : { outcome: 'active', context };
}

/**
 * Records a permission denial as Audit evidence (spec Section 34, "authorization denials at a
 * useful, non-noisy level"; IAM-R04 D-15): the user, the permission code and the trace ID.
 */
export async function recordAuthorizationDenial(
  dependencies: Pick<AuthorizationDependencies, 'runner'>,
  denial: AuthorizationDenial,
): Promise<void> {
  const actor = userActor(denial.userId);
  if (!actor.ok) throw new Error('An authorization denial names an invalid user identifier.');
  const entry = createAuditEntry({
    sourceModule: 'iam',
    action: 'iam.authorization.denied',
    actor: actor.value,
    target: { type: 'iam.permission', id: denial.permissionCode },
    result: 'REFUSED',
    traceId: denial.traceId,
  });
  if (!entry.ok)
    throw new Error(`An authorization denial built an invalid entry (${entry.reason}).`);
  const built = entry.value;
  await dependencies.runner.run((scope) => scope.audit.append(built));
}
