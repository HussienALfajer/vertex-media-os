import { readFileSync } from 'node:fs';

/** The Audit core's shared fixtures (domains/audit/test-support), read as data for parity. */
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
  readFileSync(
    new URL('../../audit/test-support/validation-fixtures.json', import.meta.url),
    'utf8',
  ),
) as AuditFixtureSets;
