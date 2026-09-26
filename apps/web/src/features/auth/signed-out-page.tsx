import { Alert, Button, Field, Input, Page, PageHeader, type Tone } from '@vertex-os/ui';
import { useState, type FormEvent } from 'react';
import { isApiProblem, signInWithPassword } from '../../lib/http';
import { leaveApplication } from '../../lib/navigation';
import { ApiStatus } from '../system-status/api-status';
import { useAuthMessages, type AuthMessages } from './auth-messages';
import type { SignedOutReason } from './auth-state';

/**
 * Failure codes accepted from the API and presented as a generic sign-in result.
 */
export const SIGN_IN_FAILURES = ['AUTH_LOGIN_FAILED', 'AUTH_RATE_LIMITED'] as const;
export type SignInFailure = (typeof SIGN_IN_FAILURES)[number];

export function isSignInFailure(value: unknown): value is SignInFailure {
  return SIGN_IN_FAILURES.some((code) => code === value);
}

type Notice = { tone: Tone; title: keyof AuthMessages; detail: keyof AuthMessages };

const FAILURE_NOTICES: Record<SignInFailure, Notice> = {
  AUTH_LOGIN_FAILED: { tone: 'danger', title: 'loginFailedTitle', detail: 'loginFailedDetail' },
  AUTH_RATE_LIMITED: { tone: 'warning', title: 'rateLimitedTitle', detail: 'rateLimitedDetail' },
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
 * The signed-out entry: session reason, email and password sign-in, and public system status.
 */
export function SignedOutPage({ reason, authError }: SignedOutPageProps) {
  const messages = useAuthMessages();
  const [pending, setPending] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [failure, setFailure] = useState<SignInFailure | undefined>();
  const reportedFailure = failure ?? authError;
  const notice =
    reportedFailure !== undefined
      ? FAILURE_NOTICES[reportedFailure]
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
        <form
          onSubmit={(event: FormEvent) => {
            event.preventDefault();
            if (pending) return;
            setPending(true);
            setFailure(undefined);
            void signInWithPassword(email, password)
              .then(() => leaveApplication('/'))
              .catch((error: unknown) => {
                setPassword('');
                setFailure(isApiProblem(error, 429) ? 'AUTH_RATE_LIMITED' : 'AUTH_LOGIN_FAILED');
                setPending(false);
              });
          }}
          className="flex flex-col gap-actions"
        >
          <Field label={messages.email} required>
            <Input
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(event) => setEmail(event.currentTarget.value)}
            />
          </Field>
          <Field label={messages.password} required>
            <Input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.currentTarget.value)}
            />
          </Field>
          <div>
            <Button
              type="submit"
              variant="primary"
              size="large"
              pending={pending}
              pendingLabel={messages.signingIn}
            >
              {messages.signIn}
            </Button>
          </div>
        </form>
        <ApiStatus />
      </div>
    </Page>
  );
}
