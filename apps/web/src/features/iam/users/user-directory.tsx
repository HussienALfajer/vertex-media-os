import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import {
  Bdi,
  Button,
  DataTable,
  EmptyState,
  ErrorState,
  Field,
  FilterBar,
  LtrText,
  NoResultsState,
  Page,
  PageHeader,
  Pagination,
  SearchInput,
  Select,
  TableToolbar,
  TwoLineCell,
  UiLink,
  useUiSettings,
  type PageSize,
  type TableColumn,
} from '@vertex-os/ui';
import { useState } from 'react';
import { isApiProblem } from '../../../lib/http';
import { useAccess } from '../../auth/use-access';
import { ACCESS_STATES, type AccessState, type UserSummary } from '../iam-api';
import { useIamMessages } from '../iam-messages';
import { IAM_PERMISSIONS, usersQuery } from '../iam-queries';
import { AccessStatus, accessLabel, IdentityStatus, InvitationStatus } from '../iam-states';

export interface DirectoryParams {
  readonly page: number;
  readonly pageSize: PageSize;
  readonly accessState?: AccessState | undefined;
}

/** The API bounds search text to 100 characters (IAM-R07 D-03). */
const SEARCH_MAX = 100;

/**
 * The user directory (spec Sections 40, 42): a bounded, server-paged list with search and an
 * access-state filter. The page, page size and filter live in the address; the search text is
 * personal data and stays in memory (IAM-R08B D-03).
 */
export function UserDirectory({
  params,
  onParamsChange,
}: {
  params: DirectoryParams;
  onParamsChange: (next: DirectoryParams) => void;
}) {
  const messages = useIamMessages();
  const { language } = useUiSettings();
  const { can } = useAccess();
  const navigate = useNavigate();
  const [searchText, setSearchText] = useState('');
  const [search, setSearch] = useState('');
  const users = useQuery({
    ...usersQuery({ ...params, search: search === '' ? undefined : search }),
    // Background refresh and paging keep the authorized rows on screen (DS Section 34).
    placeholderData: keepPreviousData,
  });

  const header = (
    <PageHeader
      title={messages.users}
      description={messages.directoryDescription}
      actions={
        can(IAM_PERMISSIONS.usersCreate) && (
          <Button variant="primary" icon="plus" onClick={() => void navigate({ to: '/users/new' })}>
            {messages.inviteUser}
          </Button>
        )
      }
    />
  );

  if (isApiProblem(users.error, 403)) {
    return (
      <Page>
        {header}
        <EmptyState
          icon="lock"
          title={messages.noPermissionTitle}
          description={messages.noPermissionDetail}
        />
      </Page>
    );
  }

  const columns: TableColumn<UserSummary>[] = [
    {
      id: 'user',
      header: messages.columnUser,
      kind: 'identity',
      cell: (user) => (
        <TwoLineCell
          primary={
            <UiLink href={`/users/${user.id}`}>
              <Bdi>{user.displayName}</Bdi>
            </UiLink>
          }
          secondary={<LtrText>{user.email}</LtrText>}
        />
      ),
    },
    {
      id: 'departments',
      header: messages.columnDepartments,
      cell: (user) =>
        user.departments.length === 0 ? (
          <span className="text-secondary">{messages.none}</span>
        ) : (
          <ul className="flex flex-col">
            {user.departments.map((department) => (
              <li key={department.id}>
                <Bdi>{department.name}</Bdi>
                {department.isPrimary && ` · ${messages.primary}`}
                {department.state !== 'ACTIVE' && ` · ${messages.inactive}`}
              </li>
            ))}
          </ul>
        ),
    },
    {
      id: 'roles',
      header: messages.columnRoles,
      cell: (user) =>
        user.roles.length === 0 ? (
          <span className="text-secondary">{messages.none}</span>
        ) : (
          <ul className="flex flex-col">
            {user.roles.map((role) => (
              <li key={role.id}>
                <Bdi>{role.name}</Bdi>
                {role.state !== 'ACTIVE' && ` · ${messages.inactive}`}
              </li>
            ))}
          </ul>
        ),
    },
    {
      id: 'access',
      header: messages.columnAccess,
      kind: 'status',
      cell: (user) => <AccessStatus state={user.accessState} />,
    },
    {
      id: 'identity',
      header: messages.columnIdentity,
      kind: 'status',
      cell: (user) => <IdentityStatus state={user.identitySyncState} />,
    },
    {
      id: 'invitation',
      header: messages.columnInvitation,
      kind: 'status',
      cell: (user) => (
        <InvitationStatus accessState={user.accessState} state={user.invitationDeliveryState} />
      ),
    },
  ];

  const filtered = search !== '' || params.accessState !== undefined;
  const clearFilters = () => {
    setSearchText('');
    setSearch('');
    onParamsChange({ page: 1, pageSize: params.pageSize });
  };
  const page = users.data;

  return (
    <Page>
      {header}
      <div className="flex flex-col gap-toolbar-groups">
        <TableToolbar
          search={
            <Field label={messages.searchUsers} description={messages.searchHelp}>
              <SearchInput
                value={searchText}
                maxLength={SEARCH_MAX}
                onValueChange={setSearchText}
                onSearch={(query) => {
                  const trimmed = query.trim();
                  if (trimmed === search) return;
                  setSearch(trimmed);
                  onParamsChange({ ...params, page: 1 });
                }}
              />
            </Field>
          }
          filters={
            <FilterBar
              active={
                params.accessState === undefined
                  ? []
                  : [
                      {
                        id: 'access',
                        label: `${messages.accessFilter}: ${accessLabel(params.accessState, language) ?? params.accessState}`,
                        onRemove: () => onParamsChange({ page: 1, pageSize: params.pageSize }),
                      },
                    ]
              }
              onClearAll={clearFilters}
            >
              <Field label={messages.accessFilter}>
                <Select
                  value={params.accessState ?? 'all'}
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    const state = ACCESS_STATES.find((candidate) => candidate === value);
                    onParamsChange({ page: 1, pageSize: params.pageSize, accessState: state });
                  }}
                >
                  <option value="all">{messages.all}</option>
                  {ACCESS_STATES.map((state) => (
                    <option key={state} value={state}>
                      {accessLabel(state, language)}
                    </option>
                  ))}
                </Select>
              </Field>
            </FilterBar>
          }
        />
        <DataTable
          caption={messages.directoryCaption}
          captionVisuallyHidden
          columns={columns}
          rows={page?.items ?? []}
          getRowId={(user) => user.id}
          getRowLabel={(user) => user.displayName}
          status={page !== undefined ? 'ready' : users.isError ? 'error' : 'loading'}
          refreshing={users.isFetching && page !== undefined}
          error={
            <ErrorState
              title={messages.usersLoadFailed}
              description={messages.loadFailedDetail}
              onRetry={() => void users.refetch()}
              retrying={users.isFetching}
              headingLevel={2}
            />
          }
          empty={
            filtered ? (
              <NoResultsState onClearFilters={clearFilters} />
            ) : (
              <EmptyState
                title={messages.noUsersTitle}
                description={
                  can(IAM_PERMISSIONS.usersCreate)
                    ? messages.noUsersInvite
                    : messages.noUsersDescription
                }
                headingLevel={2}
              />
            )
          }
        />
        {page !== undefined && page.total > 0 && (
          <Pagination
            mode="offset"
            page={params.page}
            pageSize={params.pageSize}
            total={page.total}
            onPageChange={(next) => onParamsChange({ ...params, page: next })}
            onPageSizeChange={(size) => onParamsChange({ ...params, page: 1, pageSize: size })}
          />
        )}
      </div>
    </Page>
  );
}
