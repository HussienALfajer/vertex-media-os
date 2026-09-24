import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Bdi,
  Button,
  Dialog,
  DialogCancel,
  Field,
  InlineMessage,
  Input,
} from '@vertex-os/ui';
import { useState, type FormEvent } from 'react';
import { updateDisplayName, type UserDetail } from '../iam-api';
import { useIamMessages } from '../iam-messages';
import { describeMutationFailure } from '../iam-problems';
import { refreshUser, userQuery } from '../iam-queries';
import type { Outcome } from './outcome';

/**
 * Edits the display name, the only mutable profile field (spec Section 9.1), against the version
 * that was read. A stale write keeps the draft, shows the saved value and lets the administrator
 * load the latest version before saving again (DESIGN_SYSTEM Section 28.5; IAM-R08B D-17).
 */
export function EditNameDialog({
  user,
  open,
  onOpenChange,
  onOutcome,
}: {
  user: UserDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOutcome: (outcome: Outcome) => void;
}) {
  const messages = useIamMessages();
  const client = useQueryClient();
  const [draft, setDraft] = useState(user.displayName);
  const [version, setVersion] = useState(user.version);
  const [conflict, setConflict] = useState<'stale' | 'reloaded' | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  const [fieldError, setFieldError] = useState<string | undefined>(undefined);

  const save = useMutation({
    mutationFn: () => updateDisplayName(user.id, draft.trim(), version),
    onSuccess: () => {
      onOpenChange(false);
      onOutcome({ tone: 'success', title: messages.nameSaved });
      void refreshUser(client, user.id);
    },
    onError: (failed) => {
      const described = describeMutationFailure(failed, messages);
      if (described.conflict) {
        setConflict('stale');
        return;
      }
      if (described.fields.includes('displayName')) {
        setFieldError(messages.displayNameInvalid);
        return;
      }
      setError(described.message);
      if (described.reload) void refreshUser(client, user.id);
    },
  });

  const loadLatest = useMutation({
    mutationFn: () => client.fetchQuery({ ...userQuery(user.id), staleTime: 0 }),
    onSuccess: (latest) => {
      setVersion(latest.version);
      setConflict('reloaded');
    },
    onError: (failed) => setError(describeMutationFailure(failed, messages).message),
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setError(undefined);
    setFieldError(undefined);
    if (draft.trim() === '') {
      setFieldError(messages.displayNameRequired);
      return;
    }
    save.mutate();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={messages.editNameTitle}
      dirty={draft !== user.displayName}
      actions={
        <>
          <DialogCancel />
          <Button
            type="submit"
            form="edit-display-name"
            variant="primary"
            pending={save.isPending}
            pendingLabel={messages.saving}
          >
            {messages.save}
          </Button>
        </>
      }
    >
      <form
        id="edit-display-name"
        className="flex flex-col gap-form-fields"
        noValidate
        onSubmit={submit}
      >
        {conflict === 'stale' && (
          <Alert
            tone="warning"
            title={messages.conflictTitle}
            announce
            actions={
              <Button
                size="small"
                pending={loadLatest.isPending}
                pendingLabel={messages.working}
                onClick={() => loadLatest.mutate()}
              >
                {messages.loadLatest}
              </Button>
            }
          >
            {messages.conflictDetail}
          </Alert>
        )}
        {conflict === 'reloaded' && (
          <Alert tone="info" title={messages.latestLoaded} announce>
            {messages.displayName}: <Bdi>{user.displayName}</Bdi>
          </Alert>
        )}
        <Field label={messages.displayName} error={fieldError} required>
          <Input
            autoComplete="off"
            value={draft}
            readOnly={save.isPending}
            onChange={(event) => setDraft(event.currentTarget.value)}
          />
        </Field>
        {error !== undefined && (
          <InlineMessage tone="danger" announce>
            {error}
          </InlineMessage>
        )}
      </form>
    </Dialog>
  );
}
