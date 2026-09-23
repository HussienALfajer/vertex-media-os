/**
 * Public MOD-AUDIT entry point: the accountability-evidence contract, its validators and the
 * append capability. This is the whole public surface; there is no private subpath.
 */
export {
  auditActorTypes,
  auditResults,
  createAuditEntry,
  userActor,
  type AuditActor,
  type AuditActorType,
  type AuditAttribution,
  type AuditEntry,
  type AuditEntryInput,
  type AuditEntryRejection,
  type AuditResult,
} from './audit-entry.js';
export type { AuditChange, AuditChangeSide, AuditChangeValue } from './change.js';
export {
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
export type { AuditRecorder } from './audit-recorder.js';
export type { AuditValidationResult } from './result.js';
