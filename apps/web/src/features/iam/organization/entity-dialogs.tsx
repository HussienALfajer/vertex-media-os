import { useMutation } from '@tanstack/react-query';
import {
  Alert,
  Bdi,
  Button,
  Dialog,
  DialogCancel,
  Field,
  InlineMessage,
  Input,
  Textarea,
} from '@vertex-os/ui';
import { useState, type FormEvent } from 'react';
import type { Department, EntityChange, EntityInput } from '../iam-api';
import { useIamMessages } from '../iam-messages';
import { describeMutationFailure } from '../iam-problems';
import { useOrganizationMessages } from './organization-messages';

/** The input bounds IAM applies, in characters (spec Sections 9.2, 9.4; IAM-R08C D-12). */
const CODE_MAX = 64;
const NAME_MAX = 200;
const DESCRIPTION_MAX = 2_000;

type FieldName = 'code' | 'name' | 'description';
type FieldErrors = Partial<Record<FieldName, string>>;

const CODE_TAKEN = new Set(['IAM_DEPARTMENT_CODE_CONFLICT', 'IAM_ROLE_CODE_CONFLICT']);

/**
 * Reads a refusal of a create or edit form: invalid fields and a taken code are shown on their
 * fields; the API's rules are authoritative and not repeated here (IAM-R08C D-11, D-12).
 */
function useFormFailure(uncertain: string) {
  const messages = useIamMessages();
  const copy = useOrganizationMessages();
  return (error: unknown) => {
    const described = describeMutationFailure(error, messages, uncertain);
    const fields: FieldErrors = {};
    if (described.code !== undefined && CODE_TAKEN.has(described.code)) {
      fields.code = described.message;
    }
    if (described.fields.includes('code')) fields.code = copy.codeInvalid;
    if (described.fields.includes('name')) fields.name = copy.nameInvalid;
    if (described.fields.includes('description')) fields.description = copy.descriptionInvalid;
    const onFields = Object.keys(fields).length > 0;
    return { described, fields, message: onFields ? undefined : described.message };
  };
}

function EntityFields({
  code,
  name,
  description,
  errors,
  busy,
  onName,
  onDescription,
  onCode,
}: {
  code?: string;
  name: string;
  description: string;
  errors: FieldErrors;
  busy: boolean;
  onName: (value: string) => void;
  onDescription: (value: string) => void;
  onCode?: (value: string) => void;
}) {
  const copy = useOrganizationMessages();
  return (
    <>
      {onCode !== undefined && (
        <Field label={copy.code} description={copy.codeHelp} error={errors.code} required>
          <Input
            dir="ltr"
            autoComplete="off"
            spellCheck={false}
            maxLength={CODE_MAX}
            value={code ?? ''}
            readOnly={busy}
            onChange={(event) => onCode(event.currentTarget.value)}
          />
        </Field>
      )}
      <Field label={copy.name} error={errors.name} required>
        <Input
          autoComplete="off"
          maxLength={NAME_MAX}
          value={name}
          readOnly={busy}
          onChange={(event) => onName(event.currentTarget.value)}
        />
      </Field>
      <Field label={copy.description} error={errors.description} optional>
        <Textarea
          rows={3}
          maxLength={DESCRIPTION_MAX}
          value={description}
          readOnly={busy}
          onChange={(event) => onDescription(event.currentTarget.value)}
        />
      </Field>
    </>
  );
}

/**
 * Creates a department or a custom role (spec Sections 25.6, 25.7). The code is chosen once and
 * never changes; a new role starts ACTIVE without permissions.
 */
export function CreateEntityDialog<Created extends Department>({
  kind,
  create,
  onClose,
  onCreated,
}: {
  kind: 'department' | 'role';
  create: (input: EntityInput) => Promise<Created>;
  onClose: () => void;
  onCreated: (created: Created) => void;
}) {
  const copy = useOrganizationMessages();
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string | undefined>(undefined);
  const readFailure = useFormFailure(copy.createUncertain);
  const save = useMutation({
    mutationFn: () => create({ code, name, description }),
    onSuccess: onCreated,
    onError: (failed) => {
      const failure = readFailure(failed);
      setErrors(failure.fields);
      setError(failure.message);
    },
  });
  const formId = `create-${kind}`;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    setError(undefined);
    const missing: FieldErrors = {};
    if (code.trim() === '') missing.code = copy.codeRequired;
    if (name.trim() === '') missing.name = copy.nameRequired;
    setErrors(missing);
    if (Object.keys(missing).length > 0) return;
    save.mutate();
  };
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={kind === 'department' ? copy.newDepartment : copy.newRole}
      description={kind === 'department' ? copy.createDepartmentHelp : copy.createRoleHelp}
      dirty={code !== '' || name !== '' || description !== ''}
      actions={
        <>
          <DialogCancel />
          <Button
            type="submit"
            form={formId}
            variant="primary"
            pending={save.isPending}
            pendingLabel={copy.creating}
          >
            {kind === 'department' ? copy.createDepartment : copy.createRole}
          </Button>
        </>
      }
    >
      <form id={formId} className="flex flex-col gap-form-fields" noValidate onSubmit={submit}>
        <EntityFields
          code={code}
          name={name}
          description={description}
          errors={errors}
          busy={save.isPending}
          onCode={setCode}
          onName={setName}
          onDescription={setDescription}
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

/**
 * Edits the name and description against the version that was read. A stale write keeps the draft
 * and lets the administrator load the latest version before saving again (DESIGN_SYSTEM Section
 * 28.5; IAM-R08C D-16).
 */
export function EditEntityDialog({
  record,
  save: saveChange,
  loadLatest: readLatest,
  onClose,
  onSaved,
  uncertain,
}: {
  record: Department;
  save: (change: EntityChange) => Promise<unknown>;
  loadLatest: () => Promise<Department>;
  onClose: () => void;
  onSaved: () => void;
  /** The "result not confirmed" message naming this kind of record. */
  uncertain: string;
}) {
  const copy = useOrganizationMessages();
  const messages = useIamMessages();
  const [name, setName] = useState(record.name);
  const [description, setDescription] = useState(record.description ?? '');
  const [version, setVersion] = useState(record.version);
  const [latest, setLatest] = useState<Department | undefined>(undefined);
  const [conflict, setConflict] = useState<'stale' | 'reloaded' | undefined>(undefined);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string | undefined>(undefined);
  const readFailure = useFormFailure(uncertain);

  const save = useMutation({
    mutationFn: () => saveChange({ name, description, expectedVersion: version }),
    onSuccess: () => onSaved(),
    onError: (failed) => {
      const failure = readFailure(failed);
      if (failure.described.conflict) {
        setConflict('stale');
        return;
      }
      setErrors(failure.fields);
      setError(failure.message);
    },
  });
  const loadLatest = useMutation({
    mutationFn: readLatest,
    onSuccess: (current) => {
      setLatest(current);
      setVersion(current.version);
      setConflict('reloaded');
    },
    onError: (failed) => setError(readFailure(failed).described.message),
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setError(undefined);
    if (name.trim() === '') {
      setErrors({ name: copy.nameRequired });
      return;
    }
    setErrors({});
    save.mutate();
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={copy.editTitle}
      dirty={name !== record.name || description !== (record.description ?? '')}
      actions={
        <>
          <DialogCancel />
          <Button
            type="submit"
            form="edit-entity"
            variant="primary"
            pending={save.isPending}
            pendingLabel={messages.saving}
          >
            {messages.save}
          </Button>
        </>
      }
    >
      <form id="edit-entity" className="flex flex-col gap-form-fields" noValidate onSubmit={submit}>
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
            {copy.conflictDetail}
          </Alert>
        )}
        {conflict === 'reloaded' && latest !== undefined && (
          <Alert tone="info" title={messages.latestLoaded} announce>
            {copy.name}: <Bdi>{latest.name}</Bdi>
            {' · '}
            {copy.description}:{' '}
            {latest.description === null ? messages.none : <Bdi>{latest.description}</Bdi>}
          </Alert>
        )}
        <EntityFields
          name={name}
          description={description}
          errors={errors}
          busy={save.isPending}
          onName={setName}
          onDescription={setDescription}
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
