import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertDialog,
  Bdi,
  Button,
  Checkbox,
  Dialog,
  DialogCancel,
  DropdownMenu,
  Field,
  IconButton,
  InlineMessage,
  LtrText,
  Select,
} from '@vertex-os/ui';
import { useState, type FormEvent } from 'react';
import { useAccess } from '../../auth/use-access';
import { refreshAuthState } from '../../auth/auth-state';
import {
  addMembership,
  removeMembership,
  setPrimaryMembership,
  type UserDepartment,
  type UserDetail,
} from '../iam-api';
import { useIamMessages } from '../iam-messages';
import { describeMutationFailure } from '../iam-problems';
import { activeDepartmentsQuery, IAM_PERMISSIONS, refreshUser } from '../iam-queries';
import type { Outcome } from './outcome';
import { PickerNote } from './picker-note';

/**
 * The user's department memberships (spec Sections 22, 25.4). Membership gives organizational
 * context only; removing the primary may name a replacement, never guessed by the backend.
 */
export function UserMemberships({
  user,
  onOutcome,
}: {
  user: UserDetail;
  onOutcome: (outcome: Outcome) => void;
}) {
  const messages = useIamMessages();
  const client = useQueryClient();
  const access = useAccess();
  const manage = access.can(IAM_PERMISSIONS.usersManageDepartments);
  const canPick = manage && access.can(IAM_PERMISSIONS.departmentsRead);
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<UserDepartment | undefined>(undefined);

  const settle = (outcome: Outcome) => {
    onOutcome(outcome);
    void refreshUser(client, user.id);
    // The administrator's own context changed: navigation and actions follow (IAM-R08B D-13).
    if (access.user?.id === user.id) void refreshAuthState(client);
  };
  const failed = (error: unknown) => {
    const described = describeMutationFailure(error, messages);
    if (described.reload) void refreshUser(client, user.id);
    return described.message;
  };

  const makePrimary = useMutation({
    mutationFn: (departmentId: string) => setPrimaryMembership(user.id, departmentId),
    onSuccess: () => settle({ tone: 'success', title: messages.primaryChanged }),
    onError: (error) => onOutcome({ tone: 'danger', title: failed(error) }),
  });

  return (
    <section aria-labelledby="user-departments" className="flex flex-col gap-form-fields">
      <div className="flex flex-wrap items-center justify-between gap-actions">
        <h2 id="user-departments" className="type-section-title">
          {messages.departmentsTitle}
        </h2>
        {canPick && (
          <Button icon="plus" size="small" onClick={() => setAdding(true)}>
            {messages.addDepartment}
          </Button>
        )}
      </div>
      {user.departments.length === 0 ? (
        <p className="text-secondary">{messages.noMemberships}</p>
      ) : (
        <ul className="flex flex-col gap-field-gap">
          {user.departments.map((department) => (
            <li key={department.id} className="flex flex-wrap items-center gap-actions">
              <span>
                <Bdi>{department.name}</Bdi>
                {department.isPrimary && ` · ${messages.primary}`}
                {department.state !== 'ACTIVE' && ` · ${messages.inactive}`}
              </span>
              {manage && (
                <DropdownMenu
                  trigger={
                    <IconButton
                      icon="more"
                      size="small"
                      label={messages.departmentActions(department.name)}
                      disabled={makePrimary.isPending}
                    />
                  }
                  items={[
                    ...(!department.isPrimary && department.state === 'ACTIVE'
                      ? [
                          {
                            id: 'primary',
                            label: messages.makePrimary,
                            icon: 'check' as const,
                            onSelect: () => makePrimary.mutate(department.id),
                          },
                        ]
                      : []),
                    {
                      id: 'remove',
                      label: messages.removeFromDepartment,
                      icon: 'trash',
                      intent: 'danger',
                      onSelect: () => setRemoving(department),
                    },
                  ]}
                />
              )}
            </li>
          ))}
        </ul>
      )}
      {adding && (
        <AddMembershipDialog
          user={user}
          onClose={() => setAdding(false)}
          onAdded={() => {
            setAdding(false);
            settle({ tone: 'success', title: messages.membershipAdded });
          }}
          describeFailure={failed}
        />
      )}
      {removing !== undefined && (
        <RemoveMembershipDialog
          user={user}
          department={removing}
          onClose={() => setRemoving(undefined)}
          onRemoved={() => {
            setRemoving(undefined);
            settle({ tone: 'success', title: messages.membershipRemoved });
          }}
          describeFailure={failed}
        />
      )}
    </section>
  );
}

function AddMembershipDialog({
  user,
  onClose,
  onAdded,
  describeFailure,
}: {
  user: UserDetail;
  onClose: () => void;
  onAdded: () => void;
  describeFailure: (error: unknown) => string;
}) {
  const messages = useIamMessages();
  const departments = useQuery(activeDepartmentsQuery);
  const [departmentId, setDepartmentId] = useState('');
  const [isPrimary, setIsPrimary] = useState(user.departments.length === 0);
  const [choiceError, setChoiceError] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  const member = new Set(user.departments.map((department) => department.id));
  const choices = (departments.data?.items ?? []).filter(
    (department) => !member.has(department.id),
  );
  const add = useMutation({
    mutationFn: () => addMembership(user.id, departmentId, isPrimary),
    onSuccess: onAdded,
    onError: (failed) => setError(describeFailure(failed)),
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    setError(undefined);
    if (departmentId === '') {
      setChoiceError(messages.chooseRequired);
      return;
    }
    setChoiceError(undefined);
    add.mutate();
  };
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={messages.addMembershipTitle}
      dirty={departmentId !== ''}
      actions={
        <>
          <DialogCancel />
          <Button
            type="submit"
            form="add-membership"
            variant="primary"
            pending={add.isPending}
            pendingLabel={messages.adding}
          >
            {messages.add}
          </Button>
        </>
      }
    >
      <form
        id="add-membership"
        className="flex flex-col gap-form-fields"
        noValidate
        onSubmit={submit}
      >
        <p>
          <Bdi>{user.displayName}</Bdi> — <LtrText>{user.email}</LtrText>
        </p>
        {departments.isError ? (
          <InlineMessage tone="danger">{messages.pickerFailed}</InlineMessage>
        ) : (
          <Field label={messages.department} error={choiceError} required>
            <Select
              value={departmentId}
              disabled={departments.data === undefined || add.isPending}
              onChange={(event) => setDepartmentId(event.currentTarget.value)}
            >
              <option value="">
                {departments.data === undefined ? messages.loadingList : messages.choose}
              </option>
              {choices.map((department) => (
                <option key={department.id} value={department.id}>
                  {department.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
        {departments.data !== undefined && <PickerNote page={departments.data} />}
        <Checkbox
          label={messages.asPrimary}
          checked={isPrimary}
          disabled={add.isPending}
          onChange={(event) => setIsPrimary(event.currentTarget.checked)}
        />
        {error !== undefined && (
          <InlineMessage tone="danger" announce>
            {error}
          </InlineMessage>
        )}
      </form>
    </Dialog>
  );
}

function RemoveMembershipDialog({
  user,
  department,
  onClose,
  onRemoved,
  describeFailure,
}: {
  user: UserDetail;
  department: UserDepartment;
  onClose: () => void;
  onRemoved: () => void;
  describeFailure: (error: unknown) => string;
}) {
  const messages = useIamMessages();
  const [replacement, setReplacement] = useState('');
  const [error, setError] = useState<string | undefined>(undefined);
  const candidates = department.isPrimary
    ? user.departments.filter((other) => other.id !== department.id && other.state === 'ACTIVE')
    : [];
  const remove = useMutation({
    mutationFn: () =>
      removeMembership(user.id, department.id, replacement === '' ? undefined : replacement),
    onSuccess: onRemoved,
    onError: (failed) => setError(describeFailure(failed)),
  });
  return (
    <AlertDialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={messages.removeMembershipTitle}
      description={messages.removeMembershipConsequence}
      confirmLabel={messages.removeFromDepartment}
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
          <Bdi>{department.name}</Bdi>
          {department.isPrimary && ` · ${messages.primary}`}
        </p>
        {candidates.length > 0 && (
          <Field
            label={messages.replacementPrimary}
            description={messages.replacementHelp}
            optional
          >
            <Select
              value={replacement}
              disabled={remove.isPending}
              onChange={(event) => setReplacement(event.currentTarget.value)}
            >
              <option value="">{messages.noPrimary}</option>
              {candidates.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
        {error !== undefined && (
          <InlineMessage tone="danger" announce>
            {error}
          </InlineMessage>
        )}
      </div>
    </AlertDialog>
  );
}
