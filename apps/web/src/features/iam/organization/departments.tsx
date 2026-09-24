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
  changeDepartmentState,
  createDepartment,
  ENTITY_STATES,
  getDepartment,
  updateDepartment,
  type Department,
  type EntityState,
} from '../iam-api';
import { useIamMessages } from '../iam-messages';
import { describeMutationFailure } from '../iam-problems';
import {
  departmentQuery,
  departmentsQuery,
  IAM_PERMISSIONS,
  refreshOrganization,
  userCountQuery,
} from '../iam-queries';
import { EntityStatus, entityStateLabel } from '../iam-states';
import type { Outcome } from '../users/outcome';
import { CreateEntityDialog, EditEntityDialog } from './entity-dialogs';
import type { ListParams } from './list-search';
import { MemberCount } from './member-count';
import { useOrganizationMessages } from './organization-messages';
import { StateListPage } from './state-list-page';

/** The departments list (spec Sections 25.6, 42): bounded, searchable, filtered by state. */
export function DepartmentList({
  params,
  onParamsChange,
}: {
  params: ListParams<EntityState>;
  onParamsChange: (next: ListParams<EntityState>) => void;
}) {
  const copy = useOrganizationMessages();
  const messages = useIamMessages();
  const { can } = useAccess();
  const navigate = useNavigate();
  const [search, setSearch] = useState({ text: '', applied: '' });
  const [creating, setCreating] = useState(false);
  const departments = useQuery({
    ...departmentsQuery({
      ...params,
      search: search.applied === '' ? undefined : search.applied,
    }),
    placeholderData: keepPreviousData,
  });
  const client = useQueryClient();
  const manage = can(IAM_PERMISSIONS.departmentsManage);

  const columns: TableColumn<Department>[] = [
    {
      id: 'department',
      header: copy.columnDepartment,
      kind: 'identity',
      cell: (department) => (
        <TwoLineCell
          primary={
            <UiLink href={`/departments/${department.id}`}>
              <Bdi>{department.name}</Bdi>
            </UiLink>
          }
          secondary={<TechnicalId>{department.code}</TechnicalId>}
        />
      ),
    },
    {
      id: 'description',
      header: copy.description,
      cell: (department) =>
        department.description === null ? (
          <span className="text-secondary">{messages.none}</span>
        ) : (
          <Bdi>{department.description}</Bdi>
        ),
    },
    {
      id: 'state',
      header: copy.columnState,
      kind: 'status',
      cell: (department) => <EntityStatus state={department.state} />,
    },
  ];

  return (
    <>
      <StateListPage
        copy={{
          title: copy.departments,
          description: copy.departmentsDescription,
          caption: copy.departmentsCaption,
          searchLabel: copy.searchDepartments,
          searchHelp: copy.searchByNameOrCode,
          stateFilter: copy.columnState,
          loadFailed: copy.departmentsLoadFailed,
          emptyTitle: copy.noDepartmentsTitle,
          emptyDescription: manage ? copy.noDepartmentsCreate : copy.noDepartmentsDescription,
        }}
        params={params}
        onParamsChange={onParamsChange}
        search={search}
        onSearch={setSearch}
        query={departments}
        columns={columns}
        getRowId={(department) => department.id}
        getRowLabel={(department) => department.name}
        states={ENTITY_STATES}
        stateLabel={entityStateLabel}
        action={
          manage && (
            <Button variant="primary" icon="plus" onClick={() => setCreating(true)}>
              {copy.newDepartment}
            </Button>
          )
        }
      />
      {creating && (
        <CreateEntityDialog
          kind="department"
          create={createDepartment}
          onClose={() => setCreating(false)}
          onCreated={(created) => {
            setCreating(false);
            void refreshOrganization(client, 'departments');
            void navigate({
              to: '/departments/$departmentId',
              params: { departmentId: created.id },
              search: { created: true },
            });
          }}
        />
      )}
    </>
  );
}

/**
 * One department (spec Sections 9.2, 22): its stable code, name, description and state, how many
 * users are members, and the changes the administrator's permissions allow. Deactivation always
 * states its consequence (spec Section 52; IAM-R08C D-05).
 */
export function DepartmentDetailPage({
  departmentId,
  created,
}: {
  departmentId: string;
  created: boolean;
}) {
  const copy = useOrganizationMessages();
  const messages = useIamMessages();
  const client = useQueryClient();
  const navigate = useNavigate();
  const { can } = useAccess();
  const department = useQuery(departmentQuery(departmentId));
  const members = useQuery({
    ...userCountQuery({ departmentId }),
    enabled: can(IAM_PERMISSIONS.usersRead),
  });
  const [outcome, setOutcome] = useState<Outcome | undefined>(
    created ? { tone: 'success', title: copy.departmentCreated } : undefined,
  );
  const [editing, setEditing] = useState(false);
  const [deactivating, setDeactivating] = useState(false);
  const [failure, setFailure] = useState<string | undefined>(undefined);
  const manage = can(IAM_PERMISSIONS.departmentsManage);

  const settle = (next: Outcome) => {
    setOutcome(next);
    void refreshOrganization(client, 'departments');
    // The administrator may be a member: their organizational context follows (D-13).
    void refreshAuthState(client);
  };
  const describe = (error: unknown) => {
    const described = describeMutationFailure(error, messages, copy.departmentUncertain);
    if (described.reload || described.conflict) {
      void refreshOrganization(client, 'departments');
    }
    return described.conflict ? copy.stateConflict : described.message;
  };

  const changeState = useMutation({
    mutationFn: ({ change, version }: { change: 'activate' | 'deactivate'; version: number }) =>
      changeDepartmentState(departmentId, change, version),
    onSuccess: (result, { change }) => {
      setDeactivating(false);
      settle({
        tone: 'success',
        title: change === 'activate' ? copy.departmentActivated : copy.departmentDeactivated,
        detail:
          change === 'activate'
            ? copy.departmentActivatedDetail
            : copy.departmentDeactivatedDetail(result.name),
      });
    },
    onError: (error, { change }) => {
      const message = describe(error);
      if (change === 'deactivate') setFailure(message);
      else setOutcome({ tone: 'danger', title: message });
    },
  });

  const breadcrumb = (current: string) => (
    <Breadcrumb items={[{ label: copy.departments, href: '/departments' }, { label: current }]} />
  );

  if (department.data === undefined) {
    const notFound = isApiProblem(department.error, 404);
    return (
      <Page width="detail">
        <PageHeader
          breadcrumb={breadcrumb(copy.departments)}
          title={notFound ? copy.departmentNotFound : copy.departments}
        />
        {notFound ? (
          <EmptyState
            icon="folder"
            title={copy.departmentNotFound}
            description={copy.departmentNotFoundDetail}
            action={
              <Button onClick={() => void navigate({ to: '/departments' })}>
                {copy.backToDepartments}
              </Button>
            }
            headingLevel={2}
          />
        ) : isApiProblem(department.error, 403) ? (
          <EmptyState
            icon="lock"
            title={messages.noPermissionTitle}
            description={messages.noPermissionDetail}
            headingLevel={2}
          />
        ) : department.isError ? (
          <ErrorState
            title={copy.departmentLoadFailed}
            description={messages.loadFailedDetail}
            onRetry={() => void department.refetch()}
            retrying={department.isFetching}
            headingLevel={2}
          />
        ) : (
          <LoadingState label={copy.loadingDepartment} />
        )}
      </Page>
    );
  }

  const detail = department.data;
  const active = detail.state === 'ACTIVE';
  return (
    <Page width="detail">
      <RecordHeader
        breadcrumb={breadcrumb(detail.name)}
        title={<Bdi>{detail.name}</Bdi>}
        identifier={<TechnicalId>{detail.code}</TechnicalId>}
        statuses={<EntityStatus state={detail.state} />}
        actions={
          manage && (
            <>
              <Button icon="form" onClick={() => setEditing(true)}>
                {copy.edit}
              </Button>
              {active ? (
                <Button
                  icon="minus-circle"
                  onClick={() => {
                    setFailure(undefined);
                    setDeactivating(true);
                  }}
                >
                  {copy.deactivateDepartment}
                </Button>
              ) : (
                <Button
                  icon="check-circle"
                  pending={changeState.isPending}
                  pendingLabel={messages.working}
                  onClick={() =>
                    changeState.mutate({ change: 'activate', version: detail.version })
                  }
                >
                  {copy.activateDepartment}
                </Button>
              )}
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
        {!active && (
          <Alert tone="info" title={copy.departmentInactiveNotice}>
            {copy.departmentInactiveDetail}
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
            { term: copy.columnState, details: <EntityStatus state={detail.state} /> },
            ...(can(IAM_PERMISSIONS.usersRead)
              ? [
                  {
                    term: copy.members,
                    details: (
                      <MemberCount
                        query={members}
                        label={copy.memberCount}
                        href={`/users?departmentId=${detail.id}`}
                        linkLabel={copy.viewMembers}
                      />
                    ),
                  },
                ]
              : []),
          ]}
        />
      </div>
      {editing && (
        <EditEntityDialog
          record={detail}
          save={(change) => updateDepartment(detail.id, change)}
          loadLatest={() => getDepartment(detail.id)}
          uncertain={copy.departmentUncertain}
          onReload={() => void refreshOrganization(client, 'departments')}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            settle({ tone: 'success', title: copy.saved });
          }}
        />
      )}
      {deactivating && (
        <AlertDialog
          open
          onOpenChange={(open) => {
            if (!open) setDeactivating(false);
          }}
          title={copy.deactivateDepartmentTitle}
          description={copy.deactivateDepartmentConsequence}
          confirmLabel={copy.deactivateDepartment}
          pending={changeState.isPending}
          pendingLabel={messages.working}
          onConfirm={() => {
            setFailure(undefined);
            changeState.mutate({ change: 'deactivate', version: detail.version });
          }}
        >
          <div className="flex flex-col gap-form-fields">
            <p>
              <Bdi>{detail.name}</Bdi> <TechnicalId>{detail.code}</TechnicalId>
            </p>
            {members.data !== undefined && <p>{copy.deactivateReach(members.data)}</p>}
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
