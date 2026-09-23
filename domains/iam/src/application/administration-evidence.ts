import {
  createAuditEntry,
  type AuditAttribution,
  type AuditChangeSide,
  type AuditEntry,
  type AuditResult,
} from '@vertex-os/audit';

/** One IAM Audit record as an IAM use case describes it. */
export interface IamEvidence {
  readonly action: string;
  readonly target: {
    readonly type: 'iam.department' | 'iam.role' | 'iam.user';
    readonly id: string;
  };
  readonly result?: AuditResult;
  readonly before?: AuditChangeSide;
  readonly after?: AuditChangeSide;
}

/**
 * Builds the Audit record of one IAM change or refusal (spec Sections 34, 35) with the caller's
 * actor, trace ID and optional reason. `too-large`: the evidence of an accepted input exceeds
 * Audit's size limit, which the caller turns into an `invalid` outcome before writing anything
 * (IAM-R05 D-16). Any other rejection is a programming error and throws, so no change commits
 * without evidence.
 */
export function buildIamEvidence(
  attribution: AuditAttribution,
  record: IamEvidence,
): AuditEntry | 'too-large' {
  const change =
    record.before === undefined && record.after === undefined
      ? undefined
      : {
          ...(record.before === undefined ? {} : { before: record.before }),
          ...(record.after === undefined ? {} : { after: record.after }),
        };
  const entry = createAuditEntry({
    sourceModule: 'iam',
    action: record.action,
    actor: attribution.actor,
    target: record.target,
    result: record.result ?? 'SUCCEEDED',
    traceId: attribution.traceId,
    ...(attribution.reason === undefined ? {} : { reason: attribution.reason }),
    ...(change === undefined ? {} : { change }),
  });
  if (entry.ok) return entry.value;
  if (entry.reason === 'change-too-large') return 'too-large';
  throw new Error(`IAM built an invalid audit entry (${entry.reason}).`);
}

/** Builds evidence whose size cannot exceed Audit's limit; any rejection throws. */
export function requireIamEvidence(attribution: AuditAttribution, record: IamEvidence): AuditEntry {
  const entry = buildIamEvidence(attribution, record);
  if (entry === 'too-large') throw new Error('IAM built an audit entry that is too large.');
  return entry;
}

/** An expected version as the caller supplied it: a positive safe integer, or nothing. */
export function parseExpectedVersion(value: number): number | undefined {
  return Number.isSafeInteger(value) && value >= 1 ? value : undefined;
}
