import type { AuditEntry } from './audit-entry.js';

/**
 * MOD-AUDIT's append capability: the only way any module records accountability evidence. It
 * has exactly one operation; records are never updated or deleted through it. An implementation
 * bound to a caller's transaction appends inside that transaction, so the evidence commits or
 * rolls back together with the change it describes, and a failed append fails the caller.
 */
export interface AuditRecorder {
  append(entry: AuditEntry): Promise<void>;
}
