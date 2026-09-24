import { Alert, Button, Page, PageHeader, type Tone } from '@vertex-os/ui';
import { useState } from 'react';
import { leaveApplication } from '../../lib/navigation';
import { ApiStatus } from '../system-status/api-status';
import { useAuthMessages, type AuthMessages } from './auth-messages';
import type { SignedOutReason } from './auth-state';

/** Failure codes the API's sign-in callback returns to the app as `/?authError=` (IAM-R03 D-23). */
export const SIGN_IN_FAILURES = [
  'AUTH_ACCESS_DENIED',
  'AUTH_LOGIN_FAILED',
  'IDENTITY_PROVIDER_UNAVAILABLE',
] as const;
export type SignInFailure = (typeof SIGN_IN_FAILURES)[number];

export function isSignInFailure(value: unknown): value is SignInFailure {
  return SIGN_IN_FAILURES.some((code) => code === value);
}

const SIGN_IN_PATH = '/api/auth/login';

type Notice = { tone: Tone; title: keyof AuthMessages; detail: keyof AuthMessages };

const FAILURE_NOTICES: Record<SignInFailure, Notice> = {
  AUTH_ACCESS_DENIED: { tone: 'danger', title: 'accessDeniedTitle', detail: 'accessDeniedDetail' },
  AUTH_LOGIN_FAILED: { tone: 'danger', title: 'loginFailedTitle', detail: 'loginFailedDetail' },
  IDENTITY_PROVIDER_UNAVAILABLE: {
    tone: 'warning',
    title: 'providerUnavailableTitle',
    detail: 'providerUnavailableDetail',
  },
};

const STATE_NOTICES: Record<Exclude<SignedOutReason, 'required'> | 'inactive', Notice> = {
  expired: { tone: 'info', title: 'sessionExpiredTitle', detail: 'sessionExpiredDetail' },
  ended: { tone: 'info', title: 'sessionEndedTitle', detail: 'sessionEndedDetail' },
  inactive: { tone: 'danger', title: 'inactiveTitle', detail: 'inactiveDetail' },
};

export interface SignedOutPageProps {
  readonly reason: SignedOutReason | 'inactive';
  /** The failure of the sign-in that just returned to the app, if any. */
  readonly authError?: SignInFailure | undefined;
}

/**
 * The signed-out entry (DESIGN_SYSTEM Section 34): the reason, the backend sign-in action and the
 * public system status. Vertex OS has no password or verification-code field (spec Section 40).
 */
export function SignedOutPage({ reason, authError }: SignedOutPageProps) {
  const messages = useAuthMessages();
  const [leaving, setLeaving] = useState(false);
  const notice =
    authError !== undefined
      ? FAILURE_NOTICES[authError]
      : reason === 'required'
        ? undefined
        : STATE_NOTICES[reason];

  return (
    <Page width="reading">
      <PageHeader title={messages.signInTitle} description={messages.signInDescription} />
      <div className="flex flex-col gap-section">
        {notice && (
          <Alert tone={notice.tone} title={messages[notice.title]}>
            {messages[notice.detail]}
          </Alert>
        )}
        <div>
          <Button
            variant="primary"
            size="large"
            pending={leaving}
            pendingLabel={messages.signingIn}
            onClick={() => {
              setLeaving(true);
              leaveApplication(SIGN_IN_PATH);
            }}
          >
            {messages.signIn}
          </Button>
        </div>
        <ApiStatus />
      </div>
    </Page>
  );
}
