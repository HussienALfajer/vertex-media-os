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
import { useRef, useState } from 'react';
import { isApiProblem } from '../../../lib/http';
import { refreshAuthState } from '../../auth/auth-state';
import { useAccess } from '../../auth/use-access';
import {
  activateRole,
  createRole,
  deactivateRole,
  ENTITY_STATES,
  getRole,
  listPermissions,
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
  LIST_BOUND,
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
  const readsUsers = can(IAM_PERMISSIONS.usersRead);
  const catalog = useQuery({ ...catalogQuery, enabled: readsCatalog });
  const holders = useQuery({
    ...userCountQuery({ roleId }),
    enabled: readsUsers,
  });
  const [outcome, setOutcome] = useState<Outcome | undefined>(
    created
      ? { tone: 'success', title: copy.roleCreated, detail: copy.roleCreatedDetail }
      : undefined,
  );
  const [editing, setEditing] = useState(false);
  const [editingPermissions, setEditingPermissions] = useState(false);
  const [confirming, setConfirming] = useState<Confirming | undefined>(undefined);
  const [reviewCount, setReviewCount] = useState<number | undefined>();
  const [reviewCountError, setReviewCountError] = useState(false);
  const [reviewCountLoading, setReviewCountLoading] = useState(false);
  const countRequest = useRef(0);
  const [activationCatalog, setActivationCatalog] = useState<readonly Permission[] | undefined>();
  const [activationCatalogError, setActivationCatalogError] = useState(false);
  const [activationCatalogLoading, setActivationCatalogLoading] = useState(false);
  const activationRequest = useRef(0);
  const [reason, setReason] = useState('');
  const [failure, setFailure] = useState<string | undefined>(undefined);
  const manage = can(IAM_PERMISSIONS.rolesManage);

  const refreshReviewCount = () => {
    if (!readsUsers) return;
    const request = ++countRequest.current;
    setReviewCount(undefined);
    setReviewCountError(false);
    setReviewCountLoading(true);
    void holders.refetch().then((result) => {
      if (countRequest.current !== request) return;
      setReviewCount(result.isError ? undefined : result.data);
      setReviewCountError(result.isError || result.data === undefined);
      setReviewCountLoading(false);
    });
  };

  const refreshActivationCatalog = (codes: readonly string[]) => {
    const request = ++activationRequest.current;
    setActivationCatalog(undefined);
    setActivationCatalogError(false);
    if (!readsCatalog) return;
    setActivationCatalogLoading(true);
    void (async () => {
      try {
        const first = await listPermissions({ page: 1, pageSize: LIST_BOUND });
        const items = [...first.items];
        const pages = Math.ceil(first.total / LIST_BOUND);
        if (pages > 100) throw new Error('The permission catalog exceeds the review bound.');
        for (let page = 2; page <= pages; page += 1) {
          const next = await listPermissions({ page, pageSize: LIST_BOUND });
          items.push(...next.items);
        }
        const found = new Map(items.map((permission) => [permission.code, permission]));
        if (codes.some((code) => !found.has(code))) {
          throw new Error('A mapped permission could not be verified.');
        }
        if (activationRequest.current === request) setActivationCatalog(items);
      } catch {
        if (activationRequest.current === request) setActivationCatalogError(true);
      } finally {
        if (activationRequest.current === request) setActivationCatalogLoading(false);
      }
    })();
  };

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
    refreshReviewCount();
    if (change === 'activate') refreshActivationCatalog(detail.permissionCodes);
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
          onReload={() => void refreshOrganization(client, 'roles')}
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
          confirmDisabled={
            (readsUsers && (reviewCount === undefined || reviewCountError || reviewCountLoading)) ||
            (confirming === 'activate' && readsCatalog && activationCatalog === undefined)
          }
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
            {!readsUsers ? (
              <p>{copy.impactCountRestricted}</p>
            ) : reviewCountError ? (
              <InlineMessage tone="danger">
                {copy.impactCountUnavailable}{' '}
                <Button size="small" onClick={refreshReviewCount}>
                  {copy.retry}
                </Button>
              </InlineMessage>
            ) : reviewCount !== undefined && !reviewCountLoading ? (
              <p>{copy.roleReach(reviewCount)}</p>
            ) : (
              <p>{messages.loadingList}</p>
            )}
            {confirming === 'activate' &&
              (!readsCatalog ? (
                <Alert tone="warning" title={copy.activationScopeRestricted}>
                  {detail.permissionCodes.length === 0
                    ? copy.activateGrantsNothing
                    : copy.activationScopeRestrictedDetail}
                </Alert>
              ) : activationCatalogError ? (
                <InlineMessage tone="danger">
                  {copy.activationCatalogUnavailable}{' '}
                  {readsCatalog && (
                    <Button
                      size="small"
                      onClick={() => refreshActivationCatalog(detail.permissionCodes)}
                    >
                      {copy.retry}
                    </Button>
                  )}
                </InlineMessage>
              ) : activationCatalogLoading || activationCatalog === undefined ? (
                <p>{messages.loadingList}</p>
              ) : (
                <ActivePermissions codes={detail.permissionCodes} catalog={activationCatalog} />
              ))}
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

/** Only catalog entries with a verified ACTIVE state are counted as activation grants. */
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
  const granted = codes.filter((code) => byCode.get(code)?.state === 'ACTIVE');
  const unverified = codes.filter((code) => !byCode.has(code));
  return (
    <>
      <Alert
        tone="warning"
        title={
          unverified.length === 0
            ? copy.activateGrants(granted.length)
            : copy.activateVerifiedGrants(granted.length)
        }
      >
        {unverified.length > 0 && copy.activateUnverifiedGrants(unverified.length)}
      </Alert>
      <ul className="flex flex-col">
        {granted.map((code) => (
          <li key={code}>
            {byCode.get(code) !== undefined && <Bdi>{byCode.get(code)?.name}</Bdi>}{' '}
            <TechnicalId>{code}</TechnicalId>
          </li>
        ))}
      </ul>
      {unverified.length > 0 && (
        <ul className="flex flex-col">
          {unverified.map((code) => (
            <li key={code}>
              <TechnicalId>{code}</TechnicalId>
            </li>
          ))}
        </ul>
      )}
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
