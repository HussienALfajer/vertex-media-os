import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Bdi,
  Button,
  Checkbox,
  DialogCancel,
  Drawer,
  Fieldset,
  InlineMessage,
  TechnicalId,
} from '@vertex-os/ui';
import { useState } from 'react';
import {
  getRole,
  replaceRolePermissions,
  type Page,
  type Permission,
  type RoleDetail,
} from '../iam-api';
import { useIamMessages } from '../iam-messages';
import { describeMutationFailure } from '../iam-problems';
import { refreshCatalog, refreshOrganization } from '../iam-queries';
import { SensitivityStatus } from '../iam-states';
import { PickerNote } from '../users/picker-note';
import { ReasonField } from '../users/reason-field';
import { useOrganizationMessages } from './organization-messages';

/**
 * Edits a custom role's permission mappings (spec Sections 9.6, 18, 25.7; DESIGN_SYSTEM Section
 * 28.2; IAM-R08C D-08). The requested set is built from catalog entries only, so no code can be
 * invented. Mapped codes that are no longer ACTIVE are removed on save, because the backend never
 * keeps or adds them. Saving goes through an explicit review of what is added and removed. The
 * grant ceiling is the backend's: the UI does not pre-filter by the administrator's own codes.
 */
export function PermissionEditor({
  role,
  catalog,
  holders,
  onClose,
  onSaved,
}: {
  role: RoleDetail;
  catalog: Page<Permission>;
  /** How many users hold the role, when the administrator may read users. */
  holders: number | undefined;
  onClose: () => void;
  onSaved: (saved: RoleDetail) => void;
}) {
  const copy = useOrganizationMessages();
  const messages = useIamMessages();
  const client = useQueryClient();
  const byCode = new Map(catalog.items.map((permission) => [permission.code, permission]));
  const assignable = catalog.items.filter((permission) => permission.state === 'ACTIVE');
  // A mapped code the loaded page does not describe is kept: the backend decides on it.
  const kept = (code: string) => (byCode.get(code)?.state ?? 'ACTIVE') === 'ACTIVE';
  const [selected, setSelected] = useState<ReadonlySet<string>>(
    () => new Set(role.permissionCodes.filter(kept)),
  );
  const [step, setStep] = useState<'edit' | 'review'>('edit');
  const [version, setVersion] = useState(role.version);
  const [latest, setLatest] = useState<RoleDetail | undefined>(undefined);
  const [conflict, setConflict] = useState<'stale' | 'reloaded' | undefined>(undefined);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | undefined>(undefined);

  const baseline = latest ?? role;
  const dropped = role.permissionCodes.filter((code) => !kept(code));
  // A choice the reloaded catalog no longer lists as ACTIVE is not requested again.
  const requested = [...selected].filter(kept).sort();
  const added = requested.filter((code) => !baseline.permissionCodes.includes(code));
  const removed = baseline.permissionCodes.filter((code) => !requested.includes(code)).sort();
  const changed = added.length > 0 || removed.length > 0;
  const addsPrivileged = added.some((code) => byCode.get(code)?.sensitivity === 'PRIVILEGED');

  const save = useMutation({
    mutationFn: () => replaceRolePermissions(role.id, requested, version, reason),
    onSuccess: onSaved,
    onError: (failed) => {
      const described = describeMutationFailure(failed, messages, copy.roleUncertain);
      if (described.conflict) {
        setConflict('stale');
        return;
      }
      if (described.reload) {
        void refreshOrganization(client, 'roles');
        // A refused code means the catalog changed: its states are read again (D-11).
        void refreshCatalog(client);
      }
      setError(described.message);
    },
  });
  const loadLatest = useMutation({
    mutationFn: () => getRole(role.id),
    onSuccess: (current) => {
      setLatest(current);
      setVersion(current.version);
      setConflict('reloaded');
      setStep('edit');
    },
    onError: (failed) =>
      setError(describeMutationFailure(failed, messages, copy.roleUncertain).message),
  });

  const toggle = (codes: readonly string[], on: boolean) => {
    setSelected((current) => {
      const next = new Set(current);
      for (const code of codes) {
        if (on) next.add(code);
        else next.delete(code);
      }
      return next;
    });
  };

  const modules = [...new Set(assignable.map((permission) => permission.owningModule))].sort();
  const describe = (code: string) => {
    const permission = byCode.get(code);
    return (
      <li key={code}>
        {permission !== undefined && <Bdi>{permission.name}</Bdi>} <TechnicalId>{code}</TechnicalId>
      </li>
    );
  };

  return (
    <Drawer
      open
      side="end"
      size="wide"
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={copy.editPermissionsTitle(role.name)}
      description={step === 'edit' ? copy.editPermissionsHelp : copy.reviewHelp}
      dirty={changed || reason !== ''}
      actions={
        step === 'edit' ? (
          <>
            <DialogCancel />
            <Button
              variant="primary"
              onClick={() => {
                setError(undefined);
                if (changed) setStep('review');
                else setError(copy.noChanges);
              }}
            >
              {copy.reviewChanges}
            </Button>
          </>
        ) : (
          <>
            <Button disabled={save.isPending} onClick={() => setStep('edit')}>
              {copy.backToEditing}
            </Button>
            <Button
              variant="primary"
              pending={save.isPending}
              pendingLabel={messages.saving}
              onClick={() => {
                setError(undefined);
                save.mutate();
              }}
            >
              {copy.savePermissions}
            </Button>
          </>
        )
      }
    >
      <div className="flex flex-col gap-form-fields">
        <p>
          <Bdi>{role.name}</Bdi> <TechnicalId>{role.code}</TechnicalId>
        </p>
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
            {copy.permissionsConflictDetail}
          </Alert>
        )}
        {conflict === 'reloaded' && latest !== undefined && (
          <Alert tone="info" title={copy.latestPermissionsLoaded} announce>
            {latest.permissionCodes.length === 0 ? (
              copy.noMappedPermissions
            ) : (
              <ul className="flex flex-col">{[...latest.permissionCodes].sort().map(describe)}</ul>
            )}
          </Alert>
        )}
        {step === 'edit' ? (
          <>
            <PickerNote page={catalog} />
            {dropped.length > 0 && (
              <Alert tone="warning" title={copy.droppedTitle}>
                <ul className="flex flex-col">{dropped.map(describe)}</ul>
              </Alert>
            )}
            {assignable.length === 0 && <p className="text-secondary">{copy.noAssignable}</p>}
            {modules.map((module) => {
              const group = assignable.filter((permission) => permission.owningModule === module);
              const codes = group.map((permission) => permission.code);
              const count = codes.filter((code) => selected.has(code)).length;
              return (
                <Fieldset key={module} legend={<TechnicalId>{module}</TechnicalId>}>
                  <Checkbox
                    label={copy.selectModule(module)}
                    checked={count === codes.length}
                    mixed={count > 0 && count < codes.length}
                    onChange={(event) => toggle(codes, event.currentTarget.checked)}
                  />
                  {group.map((permission) => (
                    <div key={permission.code} className="flex flex-col items-start">
                      <Checkbox
                        label={
                          <>
                            <Bdi>{permission.name}</Bdi>{' '}
                            <TechnicalId>{permission.code}</TechnicalId>
                          </>
                        }
                        description={permission.description}
                        checked={selected.has(permission.code)}
                        onChange={(event) => toggle([permission.code], event.currentTarget.checked)}
                      />
                      <SensitivityStatus sensitivity={permission.sensitivity} />
                    </div>
                  ))}
                </Fieldset>
              );
            })}
          </>
        ) : (
          <>
            {addsPrivileged && <Alert tone="warning" title={copy.privilegedWarning} announce />}
            <section aria-labelledby="review-added" className="flex flex-col gap-field-gap">
              <h3 id="review-added" className="type-section-title">
                {copy.addedTitle(added.length)}
              </h3>
              {added.length === 0 ? (
                <p className="text-secondary">{messages.none}</p>
              ) : (
                <ul className="flex flex-col">{added.map(describe)}</ul>
              )}
            </section>
            <section aria-labelledby="review-removed" className="flex flex-col gap-field-gap">
              <h3 id="review-removed" className="type-section-title">
                {copy.removedTitle(removed.length)}
              </h3>
              {removed.length === 0 ? (
                <p className="text-secondary">{messages.none}</p>
              ) : (
                <ul className="flex flex-col">{removed.map(describe)}</ul>
              )}
            </section>
            <p>{holders === undefined ? copy.reviewReachUnknown : copy.reviewReach(holders)}</p>
            <ReasonField value={reason} onChange={setReason} disabled={save.isPending} />
          </>
        )}
        {error !== undefined && (
          <InlineMessage tone="danger" announce>
            {error}
          </InlineMessage>
        )}
      </div>
    </Drawer>
  );
}
