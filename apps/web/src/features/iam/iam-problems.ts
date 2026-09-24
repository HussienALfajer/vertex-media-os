import { isApiProblem, NetworkFailure } from '../../lib/http';
import type { IamMessages } from './iam-messages';

/** How a failed IAM mutation is presented (IAM-R08B D-11). */
export interface MutationFailure {
  readonly message: string;
  /** The user may have changed: read it again before the administrator decides anything else. */
  readonly reload: boolean;
  /** `409 IAM_VERSION_CONFLICT`: keep the draft and offer the latest version (DS Section 28.5). */
  readonly conflict: boolean;
  /** `400 VALIDATION_FAILED`: the invalid request fields, never their values. */
  readonly fields: readonly string[];
  /** The API's problem code, when it sent one. */
  readonly code: string | undefined;
}

const RELOAD_CODES = new Set([
  'IAM_INVALID_ACCESS_TRANSITION',
  'IAM_OPERATION_SUPERSEDED',
  'IDENTITY_PROVIDER_UNAVAILABLE',
  'IAM_IDENTITY_CONFLICT',
  'IAM_MEMBERSHIP_NOT_FOUND',
  'IAM_ROLE_ASSIGNMENT_NOT_FOUND',
  'IAM_DUPLICATE_ROLE_ASSIGNMENT',
  'IAM_DUPLICATE_DEPARTMENT_MEMBERSHIP',
  'IAM_INVITATION_NOT_APPLICABLE',
  'IAM_IDENTITY_SYNC_INCOMPLETE',
  'IAM_SYSTEM_ROLE_PROTECTED',
  'IAM_UNKNOWN_PERMISSION',
  'IAM_PERMISSION_NOT_ASSIGNABLE',
]);

/**
 * Maps a mutation error to its message. Session refusals (`401`, `403 IAM_USER_INACTIVE`) are
 * handled by the application's query client and end the signed-in state (IAM-R08 D-10); they
 * still receive a message here in case the view is visible for a moment.
 */
export function describeMutationFailure(
  error: unknown,
  messages: IamMessages,
  /** The "result not confirmed" message of the record in view; the user's by default. */
  uncertain: string = messages.problemUncertain,
): MutationFailure {
  const failure = (message: string, extra: Partial<MutationFailure> = {}): MutationFailure => ({
    message,
    reload: false,
    conflict: false,
    fields: [],
    code: isApiProblem(error) ? error.code : undefined,
    ...extra,
  });
  if (error instanceof NetworkFailure) {
    // The request may have been applied (DESIGN_SYSTEM Section 28.5): reconcile before a repeat.
    return failure(uncertain, { reload: true });
  }
  if (!isApiProblem(error)) return failure(messages.problemGeneric);
  const reload = error.code !== undefined && RELOAD_CODES.has(error.code);
  switch (error.code) {
    case 'VALIDATION_FAILED':
      // The reason is the only free text in most dialogs: name it (spec Section 53).
      return failure(
        error.fields.includes('reason') ? messages.reasonInvalid : messages.problemValidation,
        { fields: error.fields },
      );
    case 'IAM_VERSION_CONFLICT':
      return failure(messages.conflictDetail, { conflict: true });
    case 'CSRF_VALIDATION_FAILED':
      return failure(messages.problemCsrf);
    case 'SERVICE_BUSY':
      return failure(messages.problemBusy(error.retryAfterSeconds));
    case 'AUTHORIZATION_DENIED':
      return failure(messages.problemDenied);
    default: {
      const message = error.code === undefined ? undefined : codeMessages(messages)[error.code];
      return failure(message ?? messages.problemGeneric, { reload });
    }
  }
}

function codeMessages(messages: IamMessages): Record<string, string> {
  return {
    IDENTITY_PROVIDER_UNAVAILABLE: messages.problemProvider,
    IAM_IDENTITY_CONFLICT: messages.problemIdentityConflict,
    IAM_INVALID_ACCESS_TRANSITION: messages.problemTransition,
    IAM_LAST_SYSTEM_ADMIN: messages.problemLastAdmin,
    IAM_GRANT_EXCEEDS_ACTOR: messages.problemGrantCeiling,
    IAM_OPERATION_SUPERSEDED: messages.problemSuperseded,
    IAM_INVITATION_NOT_APPLICABLE: messages.problemNotInvited,
    IAM_IDENTITY_SYNC_INCOMPLETE: messages.problemSyncIncomplete,
    IAM_EMAIL_CONFLICT: messages.problemEmailTaken,
    IAM_ROLE_INACTIVE: messages.problemRoleInactive,
    IAM_DEPARTMENT_INACTIVE: messages.problemDepartmentInactive,
    IAM_DUPLICATE_ROLE_ASSIGNMENT: messages.problemDuplicateRole,
    IAM_DUPLICATE_DEPARTMENT_MEMBERSHIP: messages.problemDuplicateMembership,
    IAM_PRIMARY_DEPARTMENT_CONFLICT: messages.problemPrimaryConflict,
    IAM_USER_NOT_FOUND: messages.problemUserNotFound,
    IAM_ROLE_NOT_FOUND: messages.problemRoleNotFound,
    IAM_DEPARTMENT_NOT_FOUND: messages.problemDepartmentNotFound,
    IAM_DEPARTMENT_CODE_CONFLICT: messages.problemDepartmentCodeTaken,
    IAM_ROLE_CODE_CONFLICT: messages.problemRoleCodeTaken,
    IAM_SYSTEM_ROLE_PROTECTED: messages.problemSystemRoleProtected,
    IAM_UNKNOWN_PERMISSION: messages.problemUnknownPermission,
    IAM_PERMISSION_NOT_ASSIGNABLE: messages.problemPermissionNotAssignable,
    IAM_MEMBERSHIP_NOT_FOUND: messages.problemMembershipNotFound,
    IAM_ROLE_ASSIGNMENT_NOT_FOUND: messages.problemAssignmentNotFound,
  };
}
