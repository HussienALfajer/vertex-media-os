import { checkAuditChange, type AuditChange } from './change.js';
import {
  isAuditActionCode,
  isAuditModuleCode,
  isAuditTargetId,
  isAuditTargetType,
  isAuditUserId,
  parseAdministrativeReason,
  parseSystemProcess,
  parseTraceId,
  type AdministrativeReason,
  type AuditActionCode,
  type AuditModuleCode,
  type AuditTargetId,
  type AuditTargetType,
  type AuditUserId,
  type SystemProcessCode,
  type TraceId,
} from './codes.js';
import type { AuditValidationResult } from './result.js';

export const auditResults = ['SUCCEEDED', 'REFUSED', 'FAILED'] as const;
export type AuditResult = (typeof auditResults)[number];

export const auditActorTypes = ['USER', 'SYSTEM'] as const;
export type AuditActorType = (typeof auditActorTypes)[number];

/** Who acted: a Vertex user, or an identified system process (spec Section 35). */
export type AuditActor =
  | { readonly type: 'USER'; readonly userId: AuditUserId }
  | { readonly type: 'SYSTEM'; readonly process: SystemProcessCode };

/**
 * The trace/request attribution a privileged operation receives from its caller: who acts, which
 * request or run it belongs to, and the optional administrative reason.
 */
export interface AuditAttribution {
  readonly actor: AuditActor;
  readonly traceId: TraceId;
  readonly reason?: AdministrativeReason;
}

/** One validated, immutable accountability record, ready to append. */
export interface AuditEntry {
  readonly sourceModule: AuditModuleCode;
  readonly action: AuditActionCode;
  readonly actor: AuditActor;
  readonly target: { readonly type: AuditTargetType; readonly id: AuditTargetId };
  readonly result: AuditResult;
  readonly traceId: TraceId;
  readonly reason?: AdministrativeReason;
  readonly change?: AuditChange;
}

/** Unvalidated entry fields, as a caller assembles them. */
export interface AuditEntryInput {
  readonly sourceModule: string;
  readonly action: string;
  readonly actor:
    | { readonly type: 'USER'; readonly userId: string }
    | { readonly type: 'SYSTEM'; readonly process: string };
  readonly target: { readonly type: string; readonly id: string };
  readonly result: AuditResult;
  readonly traceId: string;
  readonly reason?: string;
  readonly change?: {
    readonly before?: Readonly<Record<string, unknown>>;
    readonly after?: Readonly<Record<string, unknown>>;
  };
}

export type AuditEntryRejection =
  | 'invalid-entry'
  | 'invalid-source-module'
  | 'invalid-action'
  | 'action-module-mismatch'
  | 'invalid-actor'
  | 'invalid-target'
  | 'invalid-result'
  | 'invalid-trace-id'
  | 'invalid-reason'
  | 'invalid-change'
  | 'sensitive-change-field'
  | 'change-too-large';

function field(value: unknown, name: string): unknown {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)[name]
    : undefined;
}

/** A validated USER actor for a canonical lowercase UUID. */
export function userActor(userId: string): AuditValidationResult<AuditActor, 'invalid-actor'> {
  return isAuditUserId(userId)
    ? { ok: true, value: Object.freeze({ type: 'USER', userId }) }
    : { ok: false, reason: 'invalid-actor' };
}

function checkActor(input: unknown): AuditActor | undefined {
  const type = field(input, 'type');
  const keys = typeof input === 'object' && input !== null ? Object.keys(input) : [];
  if (type === 'USER' && keys.length === 2 && keys.includes('userId')) {
    const actor = userActor(field(input, 'userId') as string);
    return actor.ok ? actor.value : undefined;
  }
  if (type === 'SYSTEM' && keys.length === 2 && keys.includes('process')) {
    const process = parseSystemProcess(field(input, 'process') as string);
    return process.ok ? Object.freeze({ type: 'SYSTEM', process: process.value }) : undefined;
  }
  return undefined;
}

/**
 * Validates an entry against the MOD-AUDIT contract (IAM-02 Section 19.2) and returns an immutable
 * copy. Never throws for invalid input; a rejection is a stable code that never echoes the input.
 */
export function createAuditEntry(
  input: AuditEntryInput,
): AuditValidationResult<AuditEntry, AuditEntryRejection> {
  if (typeof input !== 'object' || input === null) return { ok: false, reason: 'invalid-entry' };
  const sourceModule = field(input, 'sourceModule');
  if (!isAuditModuleCode(sourceModule)) return { ok: false, reason: 'invalid-source-module' };
  const action = field(input, 'action');
  if (!isAuditActionCode(action)) return { ok: false, reason: 'invalid-action' };
  if (action.split('.', 1)[0] !== sourceModule) {
    return { ok: false, reason: 'action-module-mismatch' };
  }
  const actor = checkActor(field(input, 'actor'));
  if (!actor) return { ok: false, reason: 'invalid-actor' };
  const target = field(input, 'target');
  const targetType = field(target, 'type');
  const targetId = field(target, 'id');
  if (!isAuditTargetType(targetType) || !isAuditTargetId(targetId)) {
    return { ok: false, reason: 'invalid-target' };
  }
  const result = field(input, 'result');
  if (!auditResults.some((allowed) => allowed === result)) {
    return { ok: false, reason: 'invalid-result' };
  }
  const traceId = parseTraceId(field(input, 'traceId') as string);
  if (!traceId.ok) return traceId;
  const reasonInput = field(input, 'reason');
  let reason: AdministrativeReason | undefined;
  if (reasonInput !== undefined) {
    const parsed = parseAdministrativeReason(reasonInput as string);
    if (!parsed.ok) return parsed;
    reason = parsed.value;
  }
  const changeInput = field(input, 'change');
  let change: AuditChange | undefined;
  if (changeInput !== undefined) {
    const checked = checkAuditChange(changeInput);
    if (!checked.ok) return checked;
    change = checked.value;
  }
  return {
    ok: true,
    value: Object.freeze({
      sourceModule,
      action,
      actor,
      target: Object.freeze({ type: targetType, id: targetId }),
      result: result as AuditResult,
      traceId: traceId.value,
      ...(reason === undefined ? {} : { reason }),
      ...(change === undefined ? {} : { change }),
    }),
  };
}
