import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Bdi, Button, InlineMessage } from '@vertex-os/ui';
import { leaveApplication } from '../../lib/navigation';
import { useAuthMessages } from './auth-messages';
import { signOut, type CurrentDepartment, type CurrentUser } from './auth-state';

export interface AccountAreaProps {
  readonly user: CurrentUser;
  readonly departments: readonly CurrentDepartment[];
}

/**
 * The shell's account area: who is signed in (display name and primary department) and the
 * sign-out action. Sign-out ends the session through the API, then leaves for the identity
 * provider's logout page (spec Section 32; IAM-R08 D-09).
 */
export function AccountArea({ user, departments }: AccountAreaProps) {
  const messages = useAuthMessages();
  const client = useQueryClient();
  const primary = departments.find((department) => department.isPrimary);
  const signOutMutation = useMutation({
    mutationFn: () => signOut(client),
    onSuccess: (next) => {
      if (next !== undefined) leaveApplication(next);
    },
  });

  return (
    <section aria-label={messages.account} className="flex flex-col gap-actions">
      <div className="flex flex-col">
        <span className="type-label">
          <Bdi>{user.displayName}</Bdi>
        </span>
        {primary && (
          <span className="text-secondary">
            <Bdi>{primary.name}</Bdi>
          </span>
        )}
      </div>
      <div>
        <Button
          variant="ghost"
          size="small"
          pending={signOutMutation.isPending}
          pendingLabel={messages.signingOut}
          onClick={() => signOutMutation.mutate()}
        >
          {messages.signOut}
        </Button>
      </div>
      {signOutMutation.isError && (
        <InlineMessage tone="danger" announce>
          {messages.signOutFailed}
        </InlineMessage>
      )}
    </section>
  );
}
