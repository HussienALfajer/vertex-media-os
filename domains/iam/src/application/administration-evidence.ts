import {
  createAuditEntry,
  type AuditAttribution,
  type AuditChangeSide,
  type AuditRecorder,
  type AuditResult,
} from '@vertex-os/audit';

/**
 * Appends the Audit record of one administrative change or refusal (spec Sections 34, 35; IAM-R05
 * D-16) with the caller's actor, trace ID and optional reason. An invalid entry is a programming
 * error: throwing rolls the whole IAM transaction back, so no change commits without evidence.
 */
export async function appendAdministrationEvidence(
  audit: AuditRecorder,
  attribution: AuditAttribution,
  record: {
    readonly action: string;
    readonly target: {
      readonly type: 'iam.department' | 'iam.role' | 'iam.user';
      readonly id: string;
    };
    readonly result?: AuditResult;
    readonly before?: AuditChangeSide;
    readonly after?: AuditChangeSide;
  },
): Promise<void> {
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
  if (!entry.ok) {
    throw new Error(`IAM administration built an invalid audit entry (${entry.reason}).`);
  }
  await audit.append(entry.value);
}

/** An expected version as the caller supplied it: a positive safe integer, or nothing. */
export function parseExpectedVersion(value: number): number | undefined {
  return Number.isSafeInteger(value) && value >= 1 ? value : undefined;
}
