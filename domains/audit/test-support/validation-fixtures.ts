import { readFileSync } from 'node:fs';

/**
 * Shared valid/invalid fixtures for the MOD-AUDIT contract. The Audit core's unit tests and the
 * Audit adapter's database constraint tests both read this file, so the core's rules and the
 * database checks are proven against the same values.
 */
export interface AuditFixtureSets {
  readonly validModuleCodes: readonly string[];
  readonly invalidModuleCodes: readonly string[];
  readonly validActions: readonly string[];
  readonly invalidActions: readonly string[];
  readonly validTargetTypes: readonly string[];
  readonly invalidTargetTypes: readonly string[];
  readonly validProcesses: readonly string[];
  readonly invalidProcesses: readonly string[];
  readonly validTargetIds: readonly string[];
  readonly invalidTargetIds: readonly string[];
  readonly validTraceIds: readonly string[];
  readonly invalidTraceIds: readonly string[];
  readonly validReasons: readonly string[];
  readonly invalidReasons: readonly string[];
}

export const auditFixtures = JSON.parse(
  readFileSync(new URL('./validation-fixtures.json', import.meta.url), 'utf8'),
) as AuditFixtureSets;
