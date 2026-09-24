import { describe, expect, it } from 'vitest';
import { ApiProblem, NetworkFailure } from '../../lib/http';
import type { IamMessages } from './iam-messages';
import { describeMutationFailure } from './iam-problems';

// The English copy is enough to tell the branches apart.
const messages = new Proxy({} as IamMessages, {
  get: (_target, key: string) =>
    key === 'problemBusy' ? (seconds: number | undefined) => `busy ${seconds}` : key,
});

describe('describeMutationFailure (IAM-R08B D-11)', () => {
  it('keeps the draft on a version conflict and marks the named invalid fields', () => {
    expect(
      describeMutationFailure(new ApiProblem(409, 'IAM_VERSION_CONFLICT'), messages),
    ).toMatchObject({ conflict: true, reload: false });
    expect(
      describeMutationFailure(new ApiProblem(400, 'VALIDATION_FAILED', ['displayName']), messages),
    ).toMatchObject({ message: 'problemValidation', fields: ['displayName'] });
    expect(
      describeMutationFailure(new ApiProblem(400, 'VALIDATION_FAILED', ['reason']), messages)
        .message,
    ).toBe('reasonInvalid');
  });

  it('treats a lost answer as unconfirmed and asks for a reload', () => {
    expect(describeMutationFailure(new NetworkFailure('offline'), messages)).toMatchObject({
      message: 'problemUncertain',
      reload: true,
    });
  });

  it('passes the busy wait on and asks to retry after a CSRF refusal', () => {
    expect(
      describeMutationFailure(new ApiProblem(503, 'SERVICE_BUSY', [], 1), messages).message,
    ).toBe('busy 1');
    expect(
      describeMutationFailure(new ApiProblem(403, 'CSRF_VALIDATION_FAILED'), messages).message,
    ).toBe('problemCsrf');
  });

  it('reloads the user after outcomes that mean it changed, and never names an unknown code', () => {
    for (const code of [
      'IAM_INVALID_ACCESS_TRANSITION',
      'IAM_OPERATION_SUPERSEDED',
      'IDENTITY_PROVIDER_UNAVAILABLE',
    ]) {
      expect(describeMutationFailure(new ApiProblem(409, code), messages).reload).toBe(true);
    }
    expect(
      describeMutationFailure(new ApiProblem(409, 'IAM_LAST_SYSTEM_ADMIN'), messages),
    ).toMatchObject({
      message: 'problemLastAdmin',
      reload: false,
    });
    expect(describeMutationFailure(new ApiProblem(418, 'SOMETHING_NEW'), messages).message).toBe(
      'problemGeneric',
    );
  });
});
