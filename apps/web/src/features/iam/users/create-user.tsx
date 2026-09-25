import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import {
  Alert,
  AlertDialog,
  Bdi,
  Button,
  Checkbox,
  EmptyState,
  ErrorSummary,
  Field,
  Fieldset,
  FormActions,
  FormSection,
  Input,
  InlineMessage,
  LoadingState,
  LtrText,
  Page,
  PageHeader,
  RequiredNote,
  Select,
  TechnicalId,
  type FormIssue,
} from '@vertex-os/ui';
import { useState, type FormEvent } from 'react';
import { useAccess } from '../../auth/use-access';
import { createUser } from '../iam-api';
import { useIamMessages } from '../iam-messages';
import { describeMutationFailure } from '../iam-problems';
import {
  activeDepartmentsQuery,
  activeRolesQuery,
  IAM_PERMISSIONS,
  refreshDirectory,
} from '../iam-queries';
import { PickerNote } from './picker-note';

const EMAIL_ID = 'create-user-email';
const PASSWORD_ID = 'create-user-password';

/**
 * Creates (invites) a user (spec Section 12): the account starts INVITED, the backend creates
 * the identity and sends the invitation. No password or verification field exists (spec 40).
 * Assigning the System Administrator role asks for deliberate confirmation (spec Section 52).
 */
export function CreateUser() {
  const messages = useIamMessages();
  const { can } = useAccess();
  const navigate = useNavigate();
  const client = useQueryClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [departmentIds, setDepartmentIds] = useState<ReadonlySet<string>>(new Set());
  const [primaryId, setPrimaryId] = useState('');
  const [roleIds, setRoleIds] = useState<ReadonlySet<string>>(new Set());
  const [issues, setIssues] = useState<readonly FormIssue[]>([]);
  const [attempt, setAttempt] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const canCreate = can(IAM_PERMISSIONS.usersCreate);
  const canReadDepartments = canCreate && can(IAM_PERMISSIONS.departmentsRead);
  const canReadRoles = canCreate && can(IAM_PERMISSIONS.rolesRead);
  const departments = useQuery({ ...activeDepartmentsQuery, enabled: canReadDepartments });
  const roles = useQuery({ ...activeRolesQuery, enabled: canReadRoles });
  const grantsSystemRole = (roles.data?.items ?? []).some(
    (role) => role.isSystem && roleIds.has(role.id),
  );

  const create = useMutation({
    mutationFn: () =>
      createUser({
        email: email.trim(),
        password,
        memberships: [...departmentIds].map((departmentId) => ({
          departmentId,
          isPrimary: departmentId === primaryId,
        })),
        roleIds: [...roleIds],
      }),
    onSuccess: async (user) => {
      setConfirming(false);
      await refreshDirectory(client);
      await navigate({
        to: '/users/$userId',
        params: { userId: user.id },
        search: { created: true },
      });
    },
    onError: (error) => {
      setConfirming(false);
      const failure = describeMutationFailure(error, messages);
      const fieldIssues: FormIssue[] = failure.fields.flatMap((field): FormIssue[] => {
        if (field === 'email') return [{ fieldId: EMAIL_ID, message: messages.emailInvalid }];
        if (field === 'password')
          return [{ fieldId: PASSWORD_ID, message: messages.passwordInvalid }];
        return [];
      });
      const known = fieldIssues.length === failure.fields.length && fieldIssues.length > 0;
      setIssues(
        failure.code === 'IAM_EMAIL_CONFLICT'
          ? [{ fieldId: EMAIL_ID, message: messages.problemEmailTaken }]
          : known
            ? fieldIssues
            : [...fieldIssues, { message: failure.message }],
      );
      setAttempt((value) => value + 1);
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const found: FormIssue[] = [];
    if (email.trim() === '') found.push({ fieldId: EMAIL_ID, message: messages.emailRequired });
    if (password.length < 15 || password.length > 128)
      found.push({ fieldId: PASSWORD_ID, message: messages.passwordInvalid });
    setIssues(found);
    if (found.length > 0) {
      setAttempt((value) => value + 1);
      return;
    }
    if (grantsSystemRole) setConfirming(true);
    else create.mutate();
  };

  const errorFor = (fieldId: string) => issues.find((issue) => issue.fieldId === fieldId)?.message;
  const toggle = (set: ReadonlySet<string>, id: string, on: boolean) => {
    const next = new Set(set);
    if (on) next.add(id);
    else next.delete(id);
    return next;
  };
  const chosenDepartments = (departments.data?.items ?? []).filter((department) =>
    departmentIds.has(department.id),
  );

  if (!canCreate) {
    // The screen follows the permission codes (presentation); the API refuses anyway (review AB-1).
    return (
      <Page width="form">
        <PageHeader title={messages.createTitle} />
        <EmptyState
          icon="lock"
          title={messages.noPermissionTitle}
          description={messages.noPermissionDetail}
          headingLevel={2}
        />
      </Page>
    );
  }

  return (
    <Page width="form">
      <PageHeader title={messages.createTitle} description={messages.createDescription} />
      <form className="flex flex-col gap-form-sections" noValidate onSubmit={submit}>
        <ErrorSummary issues={issues} attempt={attempt} />
        <RequiredNote />
        <FormSection title={messages.profileSection}>
          <Field
            id={EMAIL_ID}
            label={messages.email}
            description={messages.emailHelp}
            error={errorFor(EMAIL_ID)}
            required
          >
            <Input
              type="email"
              autoComplete="off"
              value={email}
              readOnly={create.isPending}
              onChange={(event) => setEmail(event.currentTarget.value)}
            />
          </Field>
          <Field id={PASSWORD_ID} label={messages.password} error={errorFor(PASSWORD_ID)} required>
            <Input
              type="password"
              autoComplete="new-password"
              value={password}
              readOnly={create.isPending}
              onChange={(event) => setPassword(event.currentTarget.value)}
            />
          </Field>
        </FormSection>

        {canReadDepartments && (
          <FormSection title={messages.departmentsSection} description={messages.departmentsHelp}>
            {departments.data === undefined ? (
              departments.isError ? (
                <InlineMessage tone="danger">{messages.pickerFailed}</InlineMessage>
              ) : (
                <LoadingState label={messages.loadingList} lines={2} />
              )
            ) : departments.data.items.length === 0 ? (
              <p className="text-secondary">{messages.noActiveDepartments}</p>
            ) : (
              <>
                <Fieldset legend={messages.departmentsSection} disabled={create.isPending}>
                  {departments.data.items.map((department) => (
                    <Checkbox
                      key={department.id}
                      label={<Bdi>{department.name}</Bdi>}
                      description={<TechnicalId>{department.code}</TechnicalId>}
                      checked={departmentIds.has(department.id)}
                      onChange={(event) => {
                        const on = event.currentTarget.checked;
                        setDepartmentIds((current) => toggle(current, department.id, on));
                        if (!on && primaryId === department.id) setPrimaryId('');
                      }}
                    />
                  ))}
                </Fieldset>
                <PickerNote page={departments.data} />
                {chosenDepartments.length > 0 && (
                  <Field label={messages.primaryDepartment}>
                    <Select
                      value={primaryId}
                      disabled={create.isPending}
                      onChange={(event) => setPrimaryId(event.currentTarget.value)}
                    >
                      <option value="">{messages.noPrimary}</option>
                      {chosenDepartments.map((department) => (
                        <option key={department.id} value={department.id}>
                          {department.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                )}
              </>
            )}
          </FormSection>
        )}

        {canReadRoles && (
          <FormSection title={messages.rolesSection} description={messages.rolesHelp}>
            {roles.data === undefined ? (
              roles.isError ? (
                <InlineMessage tone="danger">{messages.pickerFailed}</InlineMessage>
              ) : (
                <LoadingState label={messages.loadingList} lines={2} />
              )
            ) : roles.data.items.length === 0 ? (
              <p className="text-secondary">{messages.noActiveRoles}</p>
            ) : (
              <>
                <Fieldset legend={messages.rolesSection} disabled={create.isPending}>
                  {roles.data.items.map((role) => (
                    <Checkbox
                      key={role.id}
                      label={<Bdi>{role.name}</Bdi>}
                      description={
                        <>
                          <TechnicalId>{role.code}</TechnicalId>
                          {role.isSystem && ` · ${messages.systemRole}`}
                        </>
                      }
                      checked={roleIds.has(role.id)}
                      onChange={(event) => {
                        const on = event.currentTarget.checked;
                        setRoleIds((current) => toggle(current, role.id, on));
                      }}
                    />
                  ))}
                </Fieldset>
                <PickerNote page={roles.data} />
                {grantsSystemRole && <Alert tone="warning" title={messages.systemRoleWarning} />}
              </>
            )}
          </FormSection>
        )}

        <FormActions>
          <Button type="button" onClick={() => void navigate({ to: '/users' })}>
            {messages.cancel}
          </Button>
          <Button
            type="submit"
            variant="primary"
            pending={create.isPending}
            pendingLabel={messages.creating}
          >
            {messages.createAction}
          </Button>
        </FormActions>
      </form>
      <AlertDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={messages.assignSystemRole}
        description={messages.systemRoleWarning}
        confirmLabel={messages.assignSystemRole}
        intent="default"
        pending={create.isPending}
        pendingLabel={messages.creating}
        onConfirm={() => create.mutate()}
      >
        <p>
          <LtrText>{email.trim()}</LtrText>
        </p>
      </AlertDialog>
    </Page>
  );
}
