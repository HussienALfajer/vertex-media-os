import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  AlertDialog,
  Bdi,
  DropdownMenu,
  IconButton,
  InlineMessage,
  LtrText,
  type MenuItemSpec,
} from '@vertex-os/ui';
import { useState } from 'react';
import { useAccess } from '../../auth/use-access';
import { reactivateUser, restrictUser, revokeSessions, type UserDetail } from '../iam-api';
import { useIamMessages, type IamMessages } from '../iam-messages';
import { describeMutationFailure } from '../iam-problems';
import { IAM_PERMISSIONS, refreshUser } from '../iam-queries';
import type { Outcome } from './outcome';
import { ReasonField } from './reason-field';

type Confirmed = 'suspend' | 'disable' | 'terminate' | 'reactivate' | 'revoke';

/**
 * Access states that admit each lifecycle action (spec Section 10.6). Presentation only: the
 * backend decides every transition and refuses the others (IAM-R08B D-07).
 */
const ADMITTED: Readonly<
  Record<'suspend' | 'disable' | 'terminate' | 'reactivate', readonly string[]>
> = {
  suspend: ['INVITED', 'ACTIVE'],
  disable: ['INVITED', 'ACTIVE', 'SUSPENDED'],
  terminate: ['INVITED', 'ACTIVE', 'SUSPENDED', 'DISABLED'],
  reactivate: ['SUSPENDED', 'DISABLED'],
};

/**
 * The user's access, identity and session actions (spec Sections 25.3, 52): a menu whose items
 * follow the permission codes and the access state, and a deliberate confirmation for every
 * security-sensitive action, naming the target and consequence, with an optional reason.
 */
export function AccessActions({
  user,
  onOutcome,
}: {
  user: UserDetail;
  onOutcome: (outcome: Outcome) => void;
}) {
  const messages = useIamMessages();
  const client = useQueryClient();
  const access = useAccess();
  const isSelf = access.user?.id === user.id;
  const [confirming, setConfirming] = useState<Confirmed | undefined>(undefined);
  const [reason, setReason] = useState('');
  const [failure, setFailure] = useState<string | undefined>(undefined);

  const open = (action: Confirmed) => {
    setReason('');
    setFailure(undefined);
    setConfirming(action);
  };

  const confirmed = useMutation({
    mutationFn: async ({ action, reason }: { action: Confirmed; reason: string }) => {
      switch (action) {
        case 'suspend':
        case 'disable':
        case 'terminate': {
          const result = await restrictUser(user.id, action, reason);
          return restrictedOutcome(action, result.sessionsRevoked, messages);
        }
        case 'reactivate': {
          const result = await reactivateUser(user.id, user.version, reason);
          return {
            tone: 'success',
            title:
              result.target === 'ACTIVE' ? messages.reactivatedActive : messages.reactivatedInvited,
            detail: messages.reactivatedDetail,
          } satisfies Outcome;
        }
        case 'revoke': {
          const result = await revokeSessions(user.id, reason);
          return revokedOutcome(result.sessionsRevoked, messages);
        }
      }
    },
    onSuccess: (outcome) => {
      setConfirming(undefined);
      onOutcome(outcome);
      void refreshUser(client, user.id);
    },
    onError: (error) => {
      const described = describeMutationFailure(error, messages);
      // A version conflict on reactivation means the user changed: show the current state.
      setFailure(described.conflict ? messages.problemSuperseded : described.message);
      if (described.reload || described.conflict) void refreshUser(client, user.id);
    },
  });

  const state = user.accessState;
  const items: MenuItemSpec[] = [];
  const manage = access.can(IAM_PERMISSIONS.usersManageAccess);
  if (manage && ADMITTED.reactivate.includes(state)) {
    items.push({
      id: 'reactivate',
      label: messages.reactivate,
      icon: 'check-circle',
      onSelect: () => open('reactivate'),
    });
  }
  if (access.can(IAM_PERMISSIONS.sessionsRevoke)) {
    items.push({
      id: 'revoke',
      label: messages.revokeSessions,
      icon: 'close',
      intent: 'danger',
      onSelect: () => open('revoke'),
    });
  }
  for (const action of ['suspend', 'disable', 'terminate'] as const) {
    if (manage && ADMITTED[action].includes(state)) {
      items.push({
        id: action,
        label: messages[action],
        icon: action === 'suspend' ? 'pause-circle' : action === 'disable' ? 'lock' : 'archive',
        intent: 'danger',
        onSelect: () => open(action),
      });
    }
  }

  const dialog = confirming === undefined ? undefined : dialogCopy(confirming, messages);

  return (
    <>
      {items.length > 0 && (
        <DropdownMenu
          trigger={
            <IconButton icon="more" label={messages.userActions} disabled={confirmed.isPending} />
          }
          items={items}
        />
      )}
      <AlertDialog
        open={dialog !== undefined}
        onOpenChange={(next) => {
          if (!next) setConfirming(undefined);
        }}
        title={dialog?.title ?? ''}
        description={dialog?.consequence ?? ''}
        confirmLabel={dialog?.confirm ?? ''}
        intent={confirming === 'reactivate' ? 'default' : 'danger'}
        pending={confirmed.isPending}
        pendingLabel={messages.working}
        onConfirm={() => {
          if (confirming === undefined) return;
          setFailure(undefined);
          confirmed.mutate({ action: confirming, reason });
        }}
      >
        <div className="flex flex-col gap-form-fields">
          <p>
            <Bdi>{user.displayName}</Bdi> — <LtrText>{user.email}</LtrText>
          </p>
          {isSelf && confirming !== 'reactivate' && (
            <Alert tone="warning" title={messages.selfWarning} />
          )}
          <ReasonField value={reason} onChange={setReason} disabled={confirmed.isPending} />
          {failure !== undefined && (
            <InlineMessage tone="danger" announce>
              {failure}
            </InlineMessage>
          )}
        </div>
      </AlertDialog>
    </>
  );
}

function dialogCopy(action: Confirmed, messages: IamMessages) {
  switch (action) {
    case 'suspend':
      return {
        title: messages.suspendTitle,
        consequence: messages.suspendConsequence,
        confirm: messages.suspend,
      };
    case 'disable':
      return {
        title: messages.disableTitle,
        consequence: messages.disableConsequence,
        confirm: messages.disable,
      };
    case 'terminate':
      return {
        title: messages.terminateTitle,
        consequence: messages.terminateConsequence,
        confirm: messages.terminate,
      };
    case 'reactivate':
      return {
        title: messages.reactivateTitle,
        consequence: messages.reactivateConsequence,
        confirm: messages.reactivate,
      };
    case 'revoke':
      return {
        title: messages.revokeTitle,
        consequence: messages.revokeConsequence,
        confirm: messages.revokeSessions,
      };
  }
}

function restrictedOutcome(
  action: 'suspend' | 'disable' | 'terminate',
  sessionsRevoked: number,
  messages: IamMessages,
): Outcome {
  const title =
    action === 'suspend'
      ? messages.suspendedOutcome
      : action === 'disable'
        ? messages.disabledOutcome
        : messages.terminatedOutcome;
  return {
    tone: 'success',
    title,
    detail: messages.sessionsEnded(sessionsRevoked),
  };
}

function revokedOutcome(sessionsRevoked: number, messages: IamMessages): Outcome {
  return {
    tone: 'success',
    title: messages.sessionsRevokedOutcome,
    detail: messages.sessionsEnded(sessionsRevoked),
  };
}
