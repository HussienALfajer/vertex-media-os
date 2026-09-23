import { describe, expect, it } from 'vitest';
import { auditFixtures } from '../test-support/validation-fixtures.js';
import {
  auditActorTypes,
  auditResults,
  createAuditEntry,
  parseAdministrativeReason,
  parseSystemProcess,
  parseTraceId,
  userActor,
  type AuditEntryInput,
} from './index.js';

const USER_ID = '0f8fad5b-d9cb-469f-a165-70867728950e';

function entry(overrides: Partial<Record<keyof AuditEntryInput, unknown>> = {}): AuditEntryInput {
  return {
    sourceModule: 'iam',
    action: 'iam.role.created',
    actor: { type: 'SYSTEM', process: 'iam.reference-sync' },
    target: { type: 'iam.role', id: USER_ID },
    result: 'SUCCEEDED',
    traceId: 'trace-1',
    ...overrides,
  } as AuditEntryInput;
}

function rejection(input: unknown): string | undefined {
  const result = createAuditEntry(input as AuditEntryInput);
  return result.ok ? undefined : result.reason;
}

describe('audit entry codes', () => {
  it.each(auditFixtures.validModuleCodes)('accepts module code %s', (module) => {
    const action = `${module}.role.created`;
    expect(createAuditEntry(entry({ sourceModule: module, action })).ok).toBe(true);
  });

  it.each(auditFixtures.invalidModuleCodes)('rejects module code %s', (module) => {
    expect(rejection(entry({ sourceModule: module, action: 'iam.role.created' }))).toBe(
      'invalid-source-module',
    );
  });

  it.each(auditFixtures.validActions)('accepts action %s', (action) => {
    expect(createAuditEntry(entry({ action })).ok).toBe(true);
  });

  it.each(auditFixtures.invalidActions)('rejects action %s', (action) => {
    expect(rejection(entry({ action }))).toBe('invalid-action');
  });

  it('rejects an action whose first segment is not the source module', () => {
    expect(rejection(entry({ action: 'crm.role.created' }))).toBe('action-module-mismatch');
  });

  it.each(auditFixtures.validTargetTypes)('accepts target type %s', (type) => {
    expect(createAuditEntry(entry({ target: { type, id: 'a' } })).ok).toBe(true);
  });

  it.each(auditFixtures.invalidTargetTypes)('rejects target type %s', (type) => {
    expect(rejection(entry({ target: { type, id: 'a' } }))).toBe('invalid-target');
  });

  it.each(auditFixtures.validTargetIds)('accepts target id %s', (id) => {
    expect(createAuditEntry(entry({ target: { type: 'iam.role', id } })).ok).toBe(true);
  });

  it.each(auditFixtures.invalidTargetIds)('rejects target id %s', (id) => {
    expect(rejection(entry({ target: { type: 'iam.role', id } }))).toBe('invalid-target');
  });

  it.each(auditFixtures.validProcesses)('accepts system process %s', (process) => {
    expect(parseSystemProcess(process).ok).toBe(true);
    expect(createAuditEntry(entry({ actor: { type: 'SYSTEM', process } })).ok).toBe(true);
  });

  it.each(auditFixtures.invalidProcesses)('rejects system process %s', (process) => {
    expect(parseSystemProcess(process)).toEqual({ ok: false, reason: 'invalid-process' });
    expect(rejection(entry({ actor: { type: 'SYSTEM', process } }))).toBe('invalid-actor');
  });

  it.each(auditFixtures.validTraceIds)('accepts trace id %s', (traceId) => {
    expect(parseTraceId(traceId).ok).toBe(true);
    expect(createAuditEntry(entry({ traceId })).ok).toBe(true);
  });

  it.each(auditFixtures.invalidTraceIds)('rejects trace id %s', (traceId) => {
    expect(parseTraceId(traceId)).toEqual({ ok: false, reason: 'invalid-trace-id' });
    expect(rejection(entry({ traceId }))).toBe('invalid-trace-id');
  });

  it('rejects a missing or unknown result', () => {
    expect(rejection(entry({ result: 'DONE' }))).toBe('invalid-result');
    expect(rejection(entry({ result: undefined }))).toBe('invalid-result');
  });
});

describe('audit actors', () => {
  it('accepts a USER actor with a canonical lowercase UUID', () => {
    expect(userActor(USER_ID)).toEqual({ ok: true, value: { type: 'USER', userId: USER_ID } });
    expect(createAuditEntry(entry({ actor: { type: 'USER', userId: USER_ID } })).ok).toBe(true);
  });

  it.each([USER_ID.toUpperCase(), `{${USER_ID}}`, 'not-a-uuid', ''])(
    'rejects the USER id %s',
    (userId) => {
      expect(userActor(userId)).toEqual({ ok: false, reason: 'invalid-actor' });
      expect(rejection(entry({ actor: { type: 'USER', userId } }))).toBe('invalid-actor');
    },
  );

  it('rejects mixed, missing and unknown actor shapes', () => {
    for (const actor of [
      { type: 'USER', userId: USER_ID, process: 'iam.reference-sync' },
      { type: 'SYSTEM', process: 'iam.reference-sync', userId: USER_ID },
      { type: 'USER' },
      { type: 'SYSTEM' },
      { type: 'SYSTEM', userId: USER_ID },
      { type: 'SERVICE', process: 'iam.reference-sync' },
      null,
      'SYSTEM',
    ]) {
      expect(rejection(entry({ actor }))).toBe('invalid-actor');
    }
  });
});

describe('audit reasons', () => {
  it.each(auditFixtures.validReasons)('accepts reason %s', (reason) => {
    expect(parseAdministrativeReason(reason).ok).toBe(true);
  });

  it.each(auditFixtures.invalidReasons.map((reason) => [JSON.stringify(reason), reason]))(
    'rejects reason %s',
    (_label, reason) => {
      expect(parseAdministrativeReason(reason)).toEqual({ ok: false, reason: 'invalid-reason' });
      expect(rejection(entry({ reason }))).toBe('invalid-reason');
    },
  );

  it('trims surrounding whitespace and keeps Arabic text', () => {
    const result = createAuditEntry(entry({ reason: '  سبب إداري  ' }));
    expect(result.ok && result.value.reason).toBe('سبب إداري');
  });

  it('counts code points: 500 accepted, 501 rejected, astral characters counted once', () => {
    expect(parseAdministrativeReason('x'.repeat(500)).ok).toBe(true);
    expect(parseAdministrativeReason('x'.repeat(501)).ok).toBe(false);
    expect(parseAdministrativeReason('😀'.repeat(500)).ok).toBe(true);
    expect(parseAdministrativeReason('😀'.repeat(501)).ok).toBe(false);
  });

  it('omits the reason when none is given', () => {
    const result = createAuditEntry(entry());
    expect(result.ok && 'reason' in result.value).toBe(false);
  });
});

describe('audit change evidence', () => {
  const accepted = (change: unknown): boolean => createAuditEntry(entry({ change })).ok;
  const reasonFor = (change: unknown): string | undefined => rejection(entry({ change }));

  it('accepts before, after or both with typed values', () => {
    expect(accepted({ after: { name: 'Read users', isSystem: true, version: 2 } })).toBe(true);
    expect(accepted({ before: { permissionCodes: ['iam.users.read'] } })).toBe(true);
    expect(accepted({ before: { name: 'Old', description: null }, after: { name: 'New' } })).toBe(
      true,
    );
  });

  it('rejects an empty change, an empty side and any key other than before and after', () => {
    expect(reasonFor({})).toBe('invalid-change');
    expect(reasonFor({ before: {} })).toBe('invalid-change');
    expect(reasonFor({ after: { name: 'x' }, extra: { name: 'y' } })).toBe('invalid-change');
    expect(reasonFor({ during: { name: 'x' } })).toBe('invalid-change');
    expect(reasonFor(null)).toBe('invalid-change');
    expect(reasonFor(['after'])).toBe('invalid-change');
    expect(reasonFor({ after: ['name'] })).toBe('invalid-change');
    expect(reasonFor({ after: undefined })).toBe('invalid-change');
  });

  it('enforces the field-name grammar', () => {
    for (const name of ['Name', 'first_name', 'first-name', '1name', 'a'.repeat(65), '']) {
      expect(reasonFor({ after: { [name]: 'x' } })).toBe('invalid-change');
    }
    expect(accepted({ after: { ['a'.repeat(64)]: 'x' } })).toBe(true);
  });

  it.each([
    'password',
    'Password',
    'userPassword',
    'passwd',
    'clientSecret',
    'apiToken',
    'refreshToken',
    'cookie',
    'authorization',
    'credentials',
    'sessionId',
    'apiKey',
    'privateKey',
  ])('rejects the sensitive field name %s in either side', (name) => {
    expect(reasonFor({ after: { [name]: 'x' } })).toBe('sensitive-change-field');
    expect(reasonFor({ before: { [name]: 'x' } })).toBe('sensitive-change-field');
  });

  it('rejects nested objects, non-finite numbers and non-string list items', () => {
    for (const value of [
      { nested: 'object' },
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      undefined,
      [1, 2],
      [null],
      [['nested']],
      () => 'function',
      new Date(0),
    ]) {
      expect(reasonFor({ after: { value } })).toBe('invalid-change');
    }
  });

  it('bounds strings, lists, list items and the number of fields', () => {
    expect(accepted({ after: { text: 'x'.repeat(2000) } })).toBe(true);
    expect(reasonFor({ after: { text: 'x'.repeat(2001) } })).toBe('invalid-change');
    expect(accepted({ after: { text: '😀'.repeat(2000) } })).toBe(true);
    expect(reasonFor({ after: { text: 'bad\u0000text' } })).toBe('invalid-change');
    expect(accepted({ after: { list: Array.from({ length: 500 }, () => 'a') } })).toBe(true);
    expect(reasonFor({ after: { list: Array.from({ length: 501 }, () => 'a') } })).toBe(
      'invalid-change',
    );
    expect(accepted({ after: { list: ['x'.repeat(128)] } })).toBe(true);
    expect(reasonFor({ after: { list: ['x'.repeat(129)] } })).toBe('invalid-change');
    expect(reasonFor({ after: { list: ['bad\u0085item'] } })).toBe('invalid-change');
    const fields = (count: number): Record<string, number> =>
      Object.fromEntries(Array.from({ length: count }, (_, index) => [`field${index}`, index]));
    expect(accepted({ after: fields(32) })).toBe(true);
    expect(reasonFor({ after: fields(33) })).toBe('invalid-change');
  });

  it('limits the serialized change to 16 384 UTF-8 bytes, boundary included', () => {
    // {"after":{"a":"…","b":"…",…}}: 8 fields of 2 000 characters plus one sized filler.
    const base = Object.fromEntries(
      Array.from({ length: 8 }, (_, index) => [`f${index}`, 'x'.repeat(2000)]),
    );
    const size = (change: unknown): number =>
      new TextEncoder().encode(JSON.stringify(change)).length;
    const filler = 16_384 - size({ after: { ...base, pad: '' } });
    expect(filler).toBeGreaterThan(0);
    const atLimit = { after: { ...base, pad: 'y'.repeat(filler) } };
    const overLimit = { after: { ...base, pad: 'y'.repeat(filler + 1) } };
    expect(size(atLimit)).toBe(16_384);
    expect(accepted(atLimit)).toBe(true);
    expect(reasonFor(overLimit)).toBe('change-too-large');
    // Multi-byte characters count by their UTF-8 size, not by code units.
    const arabicFiller = { after: { ...base, pad: 'ب'.repeat(Math.floor(filler / 2) + 1) } };
    expect(size(arabicFiller)).toBeGreaterThan(16_384);
    expect(reasonFor(arabicFiller)).toBe('change-too-large');
  });

  it('returns an immutable copy that later changes to the input cannot alter', () => {
    const list = ['iam.users.read'];
    const after: Record<string, unknown> = { permissionCodes: list };
    const result = createAuditEntry(entry({ change: { after } }));
    if (!result.ok) throw new Error('Expected an entry');
    list.push('iam.users.create');
    after['extra'] = 'x';
    expect(result.value.change).toEqual({ after: { permissionCodes: ['iam.users.read'] } });
    expect(Object.isFrozen(result.value)).toBe(true);
    expect(Object.isFrozen(result.value.change)).toBe(true);
    expect(Object.isFrozen(result.value.change?.after)).toBe(true);
    expect(Object.isFrozen(result.value.change?.after?.['permissionCodes'])).toBe(true);
    expect(Object.isFrozen(result.value.target)).toBe(true);
    expect(Object.isFrozen(result.value.actor)).toBe(true);
  });
});

describe('createAuditEntry results', () => {
  it('returns the validated entry with exactly the contract fields', () => {
    const result = createAuditEntry(
      entry({ reason: 'Planned change', change: { after: { name: 'System Administrator' } } }),
    );
    expect(result).toEqual({
      ok: true,
      value: {
        sourceModule: 'iam',
        action: 'iam.role.created',
        actor: { type: 'SYSTEM', process: 'iam.reference-sync' },
        target: { type: 'iam.role', id: USER_ID },
        result: 'SUCCEEDED',
        traceId: 'trace-1',
        reason: 'Planned change',
        change: { after: { name: 'System Administrator' } },
      },
    });
  });

  it('never throws for invalid input and never echoes it in the reason', () => {
    const sentinel = 'sentinel-7c1e@example.invalid';
    const inputs: unknown[] = [
      undefined,
      null,
      42,
      sentinel,
      [],
      {},
      entry({ sourceModule: sentinel }),
      entry({ action: sentinel }),
      entry({ target: { type: 'iam.role', id: sentinel } }),
      entry({ target: sentinel }),
      entry({ actor: { type: 'USER', userId: sentinel } }),
      entry({ traceId: sentinel }),
      entry({ reason: `${sentinel}\u0000` }),
      entry({ change: { after: { [sentinel]: sentinel } } }),
      entry({ change: { after: { password: sentinel } } }),
    ];
    for (const input of inputs) {
      let result: ReturnType<typeof createAuditEntry> | undefined;
      expect(() => {
        result = createAuditEntry(input as AuditEntryInput);
      }).not.toThrow();
      expect(result?.ok).toBe(false);
      expect(JSON.stringify(result)).not.toContain('sentinel');
    }
  });

  it('uses stable reason codes', () => {
    expect(rejection(undefined)).toBe('invalid-entry');
    expect(rejection(entry({ sourceModule: 'X' }))).toBe('invalid-source-module');
    expect(rejection(entry({ action: 'iam.x' }))).toBe('invalid-action');
    expect(rejection(entry({ action: 'crm.x.y' }))).toBe('action-module-mismatch');
    expect(rejection(entry({ actor: {} }))).toBe('invalid-actor');
    expect(rejection(entry({ target: { type: 'iam.role' } }))).toBe('invalid-target');
    expect(rejection(entry({ result: 'OK' }))).toBe('invalid-result');
    expect(rejection(entry({ traceId: 'a b' }))).toBe('invalid-trace-id');
    expect(rejection(entry({ reason: '' }))).toBe('invalid-reason');
    expect(rejection(entry({ change: {} }))).toBe('invalid-change');
    expect(rejection(entry({ change: { after: { token: 'x' } } }))).toBe('sensitive-change-field');
  });

  it('keeps the closed sets equal to the contract lists, in order', () => {
    expect(auditResults).toEqual(['SUCCEEDED', 'REFUSED', 'FAILED']);
    expect(auditActorTypes).toEqual(['USER', 'SYSTEM']);
  });
});
