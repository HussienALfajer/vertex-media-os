import { HttpException } from '@nestjs/common';
import type { IdentityFailure } from '@vertex-os/iam';
import { RequestValidationException } from '../../http/problem-details.js';

type Problem = readonly [status: number, code: string, detail: string];

/**
 * Every IAM refusal outcome and its one HTTP answer (spec Section 27; IAM-R07 D-05). The codes the
 * specification lists keep its spelling; the ones it lacks are named here once, so no controller
 * can spell a refusal differently.
 */
const problems = {
  'user-not-found': [404, 'IAM_USER_NOT_FOUND', 'The user does not exist.'],
  'department-not-found': [404, 'IAM_DEPARTMENT_NOT_FOUND', 'The department does not exist.'],
  'role-not-found': [404, 'IAM_ROLE_NOT_FOUND', 'The role does not exist.'],
  'membership-not-found': [
    404,
    'IAM_MEMBERSHIP_NOT_FOUND',
    'The user is not a member of the department.',
  ],
  'assignment-not-found': [
    404,
    'IAM_ROLE_ASSIGNMENT_NOT_FOUND',
    'The user does not hold the role.',
  ],
  'email-conflict': [409, 'IAM_EMAIL_CONFLICT', 'A user with this email already exists.'],
  'invalid-access-transition': [
    409,
    'IAM_INVALID_ACCESS_TRANSITION',
    'The access state does not allow this change.',
  ],
  'last-system-admin': [
    409,
    'IAM_LAST_SYSTEM_ADMIN',
    'The change would leave no ACTIVE System Administrator.',
  ],
  'system-role-protected': [
    409,
    'IAM_SYSTEM_ROLE_PROTECTED',
    'The System Administrator role cannot be changed this way.',
  ],
  'grant-exceeds-actor': [
    403,
    'IAM_GRANT_EXCEEDS_ACTOR',
    'The change would grant permissions the actor does not hold.',
  ],
  'role-inactive': [409, 'IAM_ROLE_INACTIVE', 'The role is not active.'],
  'department-inactive': [409, 'IAM_DEPARTMENT_INACTIVE', 'The department is not active.'],
  'duplicate-assignment': [
    409,
    'IAM_DUPLICATE_ROLE_ASSIGNMENT',
    'The user already holds the role.',
  ],
  'duplicate-membership': [
    409,
    'IAM_DUPLICATE_DEPARTMENT_MEMBERSHIP',
    'The user is already a member of the department.',
  ],
  'primary-conflict': [
    422,
    'IAM_PRIMARY_DEPARTMENT_CONFLICT',
    'Removing the primary membership requires an explicit replacement.',
  ],
  'not-invited': [409, 'IAM_INVITATION_NOT_APPLICABLE', 'Invitations apply to INVITED users only.'],
  'sync-incomplete': [
    409,
    'IAM_IDENTITY_SYNC_INCOMPLETE',
    'The identity is not synchronized; synchronize it first.',
  ],
  'version-conflict': [
    409,
    'IAM_VERSION_CONFLICT',
    'The resource changed since it was read; reload it.',
  ],
  superseded: [
    409,
    'IAM_OPERATION_SUPERSEDED',
    'A competing change was committed first; reload and retry.',
  ],
  'unknown-permission': [422, 'IAM_UNKNOWN_PERMISSION', 'A permission code is not registered.'],
  'permission-not-assignable': [
    409,
    'IAM_PERMISSION_NOT_ASSIGNABLE',
    'A permission is not active and cannot be newly mapped.',
  ],
} as const satisfies Record<string, Problem>;

const codeTaken = {
  department: [409, 'IAM_DEPARTMENT_CODE_CONFLICT', 'A department with this code already exists.'],
  role: [409, 'IAM_ROLE_CODE_CONFLICT', 'A role with this code already exists.'],
} as const satisfies Record<string, Problem>;

const identityConflict: Problem = [
  409,
  'IAM_IDENTITY_CONFLICT',
  'The identity provider holds an identity IAM cannot prove it owns.',
];
const providerUnavailable: Problem = [
  503,
  'IDENTITY_PROVIDER_UNAVAILABLE',
  'The identity provider could not complete the change; retry later.',
];

/** A refusal a capability returned. */
export type Refusal =
  | { readonly outcome: keyof typeof problems }
  | { readonly outcome: 'invalid'; readonly field: string }
  | { readonly outcome: 'identity-failed'; readonly failure: IdentityFailure }
  | { readonly outcome: 'code-taken' };

/** The answer to a refusal; `entity` names whose code was taken. */
export function refusalProblem(refusal: Refusal, entity?: keyof typeof codeTaken): HttpException {
  switch (refusal.outcome) {
    case 'invalid':
      return new RequestValidationException([refusal.field]);
    case 'identity-failed':
      return problem(
        refusal.failure === 'identity-conflict' ? identityConflict : providerUnavailable,
      );
    case 'code-taken':
      if (entity === undefined) throw new Error('A code conflict needs its entity.');
      return problem(codeTaken[entity]);
    default:
      return problem(problems[refusal.outcome]);
  }
}

/**
 * Whether a capability's result is one of its successes; in the other branch TypeScript narrows it
 * to the refusals, which {@link refuse} accepts only if the table answers every one of them.
 */
export function isOutcome<Result extends { readonly outcome: string }, Outcome extends string>(
  result: Result,
  ...outcomes: readonly Outcome[]
): result is Extract<Result, { readonly outcome: Outcome }> {
  return (outcomes as readonly string[]).includes(result.outcome);
}

/** Throws the answer to a refusal; a refusal that can be `code-taken` must name its entity. */
export function refuse(refusal: Exclude<Refusal, { readonly outcome: 'code-taken' }>): never;
export function refuse(refusal: Refusal, entity: keyof typeof codeTaken): never;
export function refuse(refusal: Refusal, entity?: keyof typeof codeTaken): never {
  throw refusalProblem(refusal, entity);
}

function problem([status, code, detail]: Problem): HttpException {
  return new HttpException(detail, status, { errorCode: code });
}

/** Every code this table can answer, for the OpenAPI descriptions and the contract tests. */
export const IAM_PROBLEM_CODES: readonly string[] = [
  ...Object.values(problems).map(([, code]) => code),
  ...Object.values(codeTaken).map(([, code]) => code),
  identityConflict[1],
  providerUnavailable[1],
];
