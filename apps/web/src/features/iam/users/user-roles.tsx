import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  AlertDialog,
  Bdi,
  Button,
  Dialog,
  DialogCancel,
  Field,
  IconButton,
  InlineMessage,
  LtrText,
  Select,
  TechnicalId,
} from '@vertex-os/ui';
import { useState, type FormEvent } from 'react';
import { useAccess } from '../../auth/use-access';
import { AUTH_QUERY_KEY } from '../../auth/auth-state';
import { assignRole, removeRole, type UserDetail, type UserRole } from '../iam-api';
import { useIamMessages } from '../iam-messages';
import { describeMutationFailure } from '../iam-problems';
import { activeRolesQuery, IAM_PERMISSIONS, refreshUser } from '../iam-queries';
import type { Outcome } from './outcome';
import { PickerNote } from './picker-note';
import { ReasonField } from './reason-field';

/**
 * The user's role assignments (spec Sections 23, 25.5). Roles are shown as administrative
 * information; the UI never authorizes by a role name. Assigning or removing the System
 * Administrator role is a deliberate, warned confirmation (spec Section 52); the grant ceiling
 * and the last-administrator rule are the backend's and are explained when it refuses.
 */
export function UserRoles({
  user,
  onOutcome,
}: {
  user: UserDetail;
  onOutcome: (outcome: Outcome) => void;
}) {
  const messages = useIamMessages();
  const client = useQueryClient();
  const access = useAccess();
  const manage = access.can(IAM_PERMISSIONS.usersManageRoles);
  const canPick = manage && access.can(IAM_PERMISSIONS.rolesRead);
  const [assigning, setAssigning] = useState(false);
  const [removing, setRemoving] = useState<UserRole | undefined>(undefined);

  const settle = (outcome: Outcome) => {
    onOutcome(outcome);
    void refreshUser(client, user.id);
    // The administrator's own permissions changed: navigation and actions follow (D-13).
    if (access.user?.id === user.id) void client.invalidateQueries({ queryKey: AUTH_QUERY_KEY });
  };
  const failed = (error: unknown) => {
    const described = describeMutationFailure(error, messages);
    if (described.reload) void refreshUser(client, user.id);
    return described.message;
  };

  return (
    <section aria-labelledby="user-roles" className="flex flex-col gap-form-fields">
      <div className="flex flex-wrap items-center justify-between gap-actions">
        <h2 id="user-roles" className="type-section-title">
          {messages.rolesTitle}
        </h2>
        {canPick && (
          <Button icon="plus" size="small" onClick={() => setAssigning(true)}>
            {messages.assignRole}
          </Button>
        )}
      </div>
      {user.roles.length === 0 ? (
        <p className="text-secondary">{messages.noRoles}</p>
      ) : (
        <ul className="flex flex-col gap-field-gap">
          {user.roles.map((role) => (
            <li key={role.id} className="flex flex-wrap items-center gap-actions">
              <span>
                <Bdi>{role.name}</Bdi> <TechnicalId>{role.code}</TechnicalId>
                {role.isSystem && ` · ${messages.systemRole}`}
                {role.state !== 'ACTIVE' && ` · ${messages.inactive}`}
              </span>
              {manage && (
                <IconButton
                  icon="trash"
                  size="small"
                  variant="ghost"
                  label={messages.roleActions(role.name)}
                  onClick={() => setRemoving(role)}
                />
              )}
            </li>
          ))}
        </ul>
      )}
      {assigning && (
        <AssignRoleDialog
          user={user}
          onClose={() => setAssigning(false)}
          onAssigned={() => {
            setAssigning(false);
            settle({ tone: 'success', title: messages.roleAssigned });
          }}
          describeFailure={failed}
        />
      )}
      {removing !== undefined && (
        <RemoveRoleDialog
          user={user}
          role={removing}
          onClose={() => setRemoving(undefined)}
          onRemoved={() => {
            setRemoving(undefined);
            settle({ tone: 'success', title: messages.roleRemoved });
          }}
          describeFailure={failed}
        />
      )}
    </section>
  );
}

function AssignRoleDialog({
  user,
  onClose,
  onAssigned,
  describeFailure,
}: {
  user: UserDetail;
  onClose: () => void;
  onAssigned: () => void;
  describeFailure: (error: unknown) => string;
}) {
  const messages = useIamMessages();
  const roles = useQuery(activeRolesQuery);
  const [roleId, setRoleId] = useState('');
  const [reason, setReason] = useState('');
  const [choiceError, setChoiceError] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  const held = new Set(user.roles.map((role) => role.id));
  const choices = (roles.data?.items ?? []).filter((role) => !held.has(role.id));
  const chosen = choices.find((role) => role.id === roleId);
  const assign = useMutation({
    mutationFn: () => assignRole(user.id, roleId, reason),
    onSuccess: onAssigned,
    onError: (failed) => setError(describeFailure(failed)),
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    setError(undefined);
    if (roleId === '') {
      setChoiceError(messages.chooseRequired);
      return;
    }
    setChoiceError(undefined);
    assign.mutate();
  };
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={messages.assignRoleTitle}
      dirty={roleId !== '' || reason !== ''}
      actions={
        <>
          <DialogCancel />
          <Button
            type="submit"
            form="assign-role"
            variant="primary"
            pending={assign.isPending}
            pendingLabel={messages.working}
          >
            {chosen?.isSystem ? messages.assignSystemRole : messages.assign}
          </Button>
        </>
      }
    >
      <form id="assign-role" className="flex flex-col gap-form-fields" noValidate onSubmit={submit}>
        <p>
          <Bdi>{user.displayName}</Bdi> — <LtrText>{user.email}</LtrText>
        </p>
        {roles.isError ? (
          <InlineMessage tone="danger">{messages.pickerFailed}</InlineMessage>
        ) : (
          <Field label={messages.role} error={choiceError} required>
            <Select
              value={roleId}
              disabled={roles.data === undefined || assign.isPending}
              onChange={(event) => setRoleId(event.currentTarget.value)}
            >
              <option value="">
                {roles.data === undefined ? messages.loadingList : messages.choose}
              </option>
              {choices.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.isSystem ? `${role.name} (${messages.systemRole})` : role.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
        {roles.data !== undefined && <PickerNote page={roles.data} />}
        {chosen?.isSystem && <Alert tone="warning" title={messages.systemRoleWarning} announce />}
        <ReasonField value={reason} onChange={setReason} disabled={assign.isPending} />
        {error !== undefined && (
          <InlineMessage tone="danger" announce>
            {error}
          </InlineMessage>
        )}
      </form>
    </Dialog>
  );
}

function RemoveRoleDialog({
  user,
  role,
  onClose,
  onRemoved,
  describeFailure,
}: {
  user: UserDetail;
  role: UserRole;
  onClose: () => void;
  onRemoved: () => void;
  describeFailure: (error: unknown) => string;
}) {
  const messages = useIamMessages();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | undefined>(undefined);
  const remove = useMutation({
    mutationFn: () => removeRole(user.id, role.id, reason),
    onSuccess: onRemoved,
    onError: (failed) => setError(describeFailure(failed)),
  });
  return (
    <AlertDialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={messages.removeRoleTitle}
      description={messages.removeRoleConsequence}
      confirmLabel={messages.removeRole}
      pending={remove.isPending}
      pendingLabel={messages.working}
      onConfirm={() => {
        setError(undefined);
        remove.mutate();
      }}
    >
      <div className="flex flex-col gap-form-fields">
        <p>
          <Bdi>{user.displayName}</Bdi> — <LtrText>{user.email}</LtrText>
          {' · '}
          <Bdi>{role.name}</Bdi> <TechnicalId>{role.code}</TechnicalId>
        </p>
        {role.isSystem && <Alert tone="warning" title={messages.systemRoleRemoveWarning} />}
        <ReasonField value={reason} onChange={setReason} disabled={remove.isPending} />
        {error !== undefined && (
          <InlineMessage tone="danger" announce>
            {error}
          </InlineMessage>
        )}
      </div>
    </AlertDialog>
  );
}
