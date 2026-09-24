import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import {
  Alert,
  AlertDialog,
  Bdi,
  Breadcrumb,
  Button,
  DescriptionList,
  EmptyState,
  ErrorState,
  InlineMessage,
  LoadingState,
  Page,
  PageHeader,
  RecordHeader,
  TechnicalId,
  TwoLineCell,
  UiLink,
  type TableColumn,
} from '@vertex-os/ui';
import { useState } from 'react';
import { isApiProblem } from '../../../lib/http';
import { refreshAuthState } from '../../auth/auth-state';
import { useAccess } from '../../auth/use-access';
import {
  activateRole,
  createRole,
  deactivateRole,
  ENTITY_STATES,
  getRole,
  updateRole,
  type EntityState,
  type Permission,
  type Role,
  type RoleDetail,
} from '../iam-api';
import { useIamMessages } from '../iam-messages';
import { describeMutationFailure } from '../iam-problems';
import {
  catalogQuery,
  IAM_PERMISSIONS,
  refreshOrganization,
  roleQuery,
  rolesQuery,
  userCountQuery,
} from '../iam-queries';
import { EntityStatus, entityStateLabel } from '../iam-states';
import type { Outcome } from '../users/outcome';
import { ReasonField } from '../users/reason-field';
import { CreateEntityDialog, EditEntityDialog } from './entity-dialogs';
import type { ListParams } from './list-search';
import { MemberCount } from './member-count';
import { useOrganizationMessages } from './organization-messages';
import { MappedPermissions } from './permission-list';
import { PermissionEditor } from './permission-editor';
import { StateListPage } from './state-list-page';

/**
 * The roles list (spec Sections 25.7, 42). A role's kind comes from the API's `isSystem` flag;
 * role names are display data and decide nothing (spec Section 23; IAM-R08C D-07).
 */
export function RoleList({
  params,
  onParamsChange,
}: {
  params: ListParams<EntityState>;
  onParamsChange: (next: ListParams<EntityState>) => void;
}) {
  const copy = useOrganizationMessages();
  const { can } = useAccess();
  const navigate = useNavigate();
  const client = useQueryClient();
  const [search, setSearch] = useState({ text: '', applied: '' });
  const [creating, setCreating] = useState(false);
  const roles = useQuery({
    ...rolesQuery({ ...params, search: search.applied === '' ? undefined : search.applied }),
    placeholderData: keepPreviousData,
  });
  const manage = can(IAM_PERMISSIONS.rolesManage);

  const columns: TableColumn<Role>[] = [
    {
      id: 'role',
      header: copy.columnRole,
      kind: 'identity',
      cell: (role) => (
        <TwoLineCell
          primary={
            <UiLink href={`/roles/${role.id}`}>
              <Bdi>{role.name}</Bdi>
            </UiLink>
          }
          secondary={<TechnicalId>{role.code}</TechnicalId>}
        />
      ),
    },
    {
      id: 'kind',
      header: copy.columnKind,
      cell: (role) => (role.isSystem ? copy.systemRoleProtected : copy.customRole),
    },
    {
      id: 'state',
      header: copy.columnState,
      kind: 'status',
      cell: (role) => <EntityStatus state={role.state} />,
    },
  ];

  return (
    <>
      <StateListPage
        copy={{
          title: copy.roles,
          description: copy.rolesDescription,
          caption: copy.rolesCaption,
          searchLabel: copy.searchRoles,
          searchHelp: copy.searchByNameOrCode,
          stateFilter: copy.columnState,
          loadFailed: copy.rolesLoadFailed,
          emptyTitle: copy.noRolesTitle,
          emptyDescription: manage ? copy.noRolesCreate : copy.noRolesDescription,
        }}
        params={params}
        onParamsChange={onParamsChange}
        search={search}
        onSearch={setSearch}
        query={roles}
        columns={columns}
        getRowId={(role) => role.id}
        getRowLabel={(role) => role.name}
        states={ENTITY_STATES}
        stateLabel={entityStateLabel}
        action={
          manage && (
            <Button variant="primary" icon="plus" onClick={() => setCreating(true)}>
              {copy.newRole}
            </Button>
          )
        }
      />
      {creating && (
        <CreateEntityDialog
          kind="role"
          create={createRole}
          onClose={() => setCreating(false)}
          onCreated={(created) => {
            setCreating(false);
            void refreshOrganization(client, 'roles');
            void navigate({
              to: '/roles/$roleId',
              params: { roleId: created.id },
              search: { created: true },
            });
          }}
        />
      )}
    </>
  );
}

type Confirming = 'activate' | 'deactivate';

/**
 * One role (spec Sections 9.4, 20, 23): its code, name, description, state, reach and mapped
 * permissions. The system role is presented as protected and offers no change; a custom role
 * offers edit, activation, deactivation and the permission editor where the administrator's
 * permissions allow. The backend enforces every rule, including the grant ceiling (spec 23.1).
 */
export function RoleDetailPage({ roleId, created }: { roleId: string; created: boolean }) {
  const copy = useOrganizationMessages();
  const messages = useIamMessages();
  const client = useQueryClient();
  const navigate = useNavigate();
  const { can } = useAccess();
  const role = useQuery(roleQuery(roleId));
  const readsCatalog = can(IAM_PERMISSIONS.permissionsRead);
  const catalog = useQuery({ ...catalogQuery, enabled: readsCatalog });
  const holders = useQuery({
    ...userCountQuery({ roleId }),
    enabled: can(IAM_PERMISSIONS.usersRead),
  });
  const [outcome, setOutcome] = useState<Outcome | undefined>(
    created
      ? { tone: 'success', title: copy.roleCreated, detail: copy.roleCreatedDetail }
      : undefined,
  );
  const [editing, setEditing] = useState(false);
  const [editingPermissions, setEditingPermissions] = useState(false);
  const [confirming, setConfirming] = useState<Confirming | undefined>(undefined);
  const [reason, setReason] = useState('');
  const [failure, setFailure] = useState<string | undefined>(undefined);
  const manage = can(IAM_PERMISSIONS.rolesManage);

  const settle = (next: Outcome) => {
    setOutcome(next);
    void refreshOrganization(client, 'roles');
    // The administrator may hold this role: navigation and actions follow (D-13).
    void refreshAuthState(client);
  };

  const changeState = useMutation({
    mutationFn: ({ change, version }: { change: Confirming; version: number }) =>
      change === 'activate'
        ? activateRole(roleId, version)
        : deactivateRole(roleId, version, reason),
    onSuccess: (_result, { change }) => {
      setConfirming(undefined);
      settle(
        change === 'activate'
          ? { tone: 'success', title: copy.roleActivated, detail: copy.roleActivatedDetail }
          : { tone: 'success', title: copy.roleDeactivated, detail: copy.roleDeactivatedDetail },
      );
    },
    onError: (error) => {
      const described = describeMutationFailure(error, messages, copy.roleUncertain);
      if (described.reload || described.conflict) void refreshOrganization(client, 'roles');
      setFailure(described.conflict ? copy.stateConflict : described.message);
    },
  });

  const breadcrumb = (current: string) => (
    <Breadcrumb items={[{ label: copy.roles, href: '/roles' }, { label: current }]} />
  );

  if (role.data === undefined) {
    const notFound = isApiProblem(role.error, 404);
    return (
      <Page width="detail">
        <PageHeader
          breadcrumb={breadcrumb(copy.roles)}
          title={notFound ? copy.roleNotFound : copy.roles}
        />
        {notFound ? (
          <EmptyState
            icon="shield"
            title={copy.roleNotFound}
            description={copy.roleNotFoundDetail}
            action={
              <Button onClick={() => void navigate({ to: '/roles' })}>{copy.backToRoles}</Button>
            }
            headingLevel={2}
          />
        ) : isApiProblem(role.error, 403) ? (
          <EmptyState
            icon="lock"
            title={messages.noPermissionTitle}
            description={messages.noPermissionDetail}
            headingLevel={2}
          />
        ) : role.isError ? (
          <ErrorState
            title={copy.roleLoadFailed}
            description={messages.loadFailedDetail}
            onRetry={() => void role.refetch()}
            retrying={role.isFetching}
            headingLevel={2}
          />
        ) : (
          <LoadingState label={copy.loadingRole} />
        )}
      </Page>
    );
  }

  const detail = role.data;
  const active = detail.state === 'ACTIVE';
  // The protection follows the API's flag, never the role's code or name (IAM-R08C D-07).
  const changeable = manage && !detail.isSystem;
  const open = (change: Confirming) => {
    setReason('');
    setFailure(undefined);
    setConfirming(change);
  };

  return (
    <Page width="detail">
      <RecordHeader
        breadcrumb={breadcrumb(detail.name)}
        title={<Bdi>{detail.name}</Bdi>}
        identifier={<TechnicalId>{detail.code}</TechnicalId>}
        statuses={<EntityStatus state={detail.state} />}
        actions={
          changeable && (
            <>
              <Button icon="form" onClick={() => setEditing(true)}>
                {copy.edit}
              </Button>
              {catalog.data !== undefined && (
                <Button icon="shield" onClick={() => setEditingPermissions(true)}>
                  {copy.editPermissions}
                </Button>
              )}
              <Button
                icon={active ? 'minus-circle' : 'check-circle'}
                onClick={() => open(active ? 'deactivate' : 'activate')}
              >
                {active ? copy.deactivateRole : copy.activateRole}
              </Button>
            </>
          )
        }
      />
      <div className="flex flex-col gap-section">
        {outcome !== undefined && (
          <Alert
            tone={outcome.tone}
            title={outcome.title}
            announce
            onDismiss={() => setOutcome(undefined)}
          >
            {outcome.detail}
          </Alert>
        )}
        {detail.isSystem && (
          <Alert tone="info" title={copy.systemRoleNoticeTitle}>
            {copy.systemRoleNoticeDetail}
          </Alert>
        )}
        {!active && (
          <Alert tone="info" title={copy.roleInactiveNotice}>
            {copy.roleInactiveDetail}
          </Alert>
        )}
        <DescriptionList
          items={[
            { term: copy.code, details: <TechnicalId>{detail.code}</TechnicalId> },
            { term: copy.name, details: <Bdi>{detail.name}</Bdi> },
            {
              term: copy.description,
              details:
                detail.description === null ? messages.none : <Bdi>{detail.description}</Bdi>,
            },
            {
              term: copy.columnKind,
              details: detail.isSystem ? copy.systemRoleProtected : copy.customRole,
            },
            { term: copy.columnState, details: <EntityStatus state={detail.state} /> },
            ...(can(IAM_PERMISSIONS.usersRead)
              ? [
                  {
                    term: copy.holders,
                    details: (
                      <MemberCount
                        query={holders}
                        label={copy.holderCount}
                        href={`/users?roleId=${detail.id}`}
                        linkLabel={copy.viewHolders}
                      />
                    ),
                  },
                ]
              : []),
          ]}
        />
        <section aria-labelledby="role-permissions" className="flex flex-col gap-form-fields">
          <h2 id="role-permissions" className="type-section-title">
            {copy.rolePermissions}
          </h2>
          <MappedPermissions
            codes={detail.permissionCodes}
            catalog={readsCatalog ? catalog : undefined}
          />
        </section>
      </div>
      {editing && (
        <EditEntityDialog
          record={detail}
          save={(change) => updateRole(detail.id, change)}
          loadLatest={() => getRole(detail.id)}
          uncertain={copy.roleUncertain}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            settle({ tone: 'success', title: copy.saved });
          }}
        />
      )}
      {editingPermissions && catalog.data !== undefined && (
        <PermissionEditor
          role={detail}
          catalog={catalog.data}
          holders={holders.data}
          onClose={() => setEditingPermissions(false)}
          onSaved={(saved) => {
            setEditingPermissions(false);
            settle(savedOutcome(saved, copy));
          }}
        />
      )}
      {confirming !== undefined && (
        <AlertDialog
          open
          onOpenChange={(next) => {
            if (!next) setConfirming(undefined);
          }}
          title={confirming === 'activate' ? copy.activateRoleTitle : copy.deactivateRoleTitle}
          description={
            confirming === 'activate'
              ? copy.activateRoleConsequence
              : copy.deactivateRoleConsequence
          }
          confirmLabel={confirming === 'activate' ? copy.activateRole : copy.deactivateRole}
          // Activation grants permissions: primary fill with a warning (DESIGN_SYSTEM Section 35).
          intent={confirming === 'activate' ? 'default' : 'danger'}
          pending={changeState.isPending}
          pendingLabel={messages.working}
          onConfirm={() => {
            setFailure(undefined);
            changeState.mutate({ change: confirming, version: detail.version });
          }}
        >
          <div className="flex flex-col gap-form-fields">
            <p>
              <Bdi>{detail.name}</Bdi> <TechnicalId>{detail.code}</TechnicalId>
            </p>
            {holders.data !== undefined && <p>{copy.roleReach(holders.data)}</p>}
            {confirming === 'activate' && (
              <ActivePermissions codes={detail.permissionCodes} catalog={catalog.data?.items} />
            )}
            {confirming === 'deactivate' && (
              <ReasonField value={reason} onChange={setReason} disabled={changeState.isPending} />
            )}
            {failure !== undefined && (
              <InlineMessage tone="danger" announce>
                {failure}
              </InlineMessage>
            )}
          </div>
        </AlertDialog>
      )}
    </Page>
  );
}

/** What activation grants back: the role's mapped codes that are ACTIVE in the catalog. */
function ActivePermissions({
  codes,
  catalog,
}: {
  codes: readonly string[];
  catalog: readonly Permission[] | undefined;
}) {
  const copy = useOrganizationMessages();
  if (codes.length === 0) return <p>{copy.activateGrantsNothing}</p>;
  const byCode = new Map((catalog ?? []).map((permission) => [permission.code, permission]));
  // Only ACTIVE permissions are effective; a code beyond the loaded catalog page is listed.
  const granted = codes.filter((code) => (byCode.get(code)?.state ?? 'ACTIVE') === 'ACTIVE');
  return (
    <>
      <Alert tone="warning" title={copy.activateGrants(granted.length)} />
      <ul className="flex flex-col">
        {granted.map((code) => (
          <li key={code}>
            {byCode.get(code) !== undefined && <Bdi>{byCode.get(code)?.name}</Bdi>}{' '}
            <TechnicalId>{code}</TechnicalId>
          </li>
        ))}
      </ul>
    </>
  );
}

function savedOutcome(
  saved: RoleDetail,
  copy: ReturnType<typeof useOrganizationMessages>,
): Outcome {
  return {
    tone: 'success',
    title: copy.permissionsSaved,
    detail: copy.permissionsSavedDetail(saved.permissionCodes.length),
  };
}
