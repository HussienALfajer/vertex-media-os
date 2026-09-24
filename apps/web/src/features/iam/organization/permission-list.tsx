import { keepPreviousData, useQuery, type UseQueryResult } from '@tanstack/react-query';
import {
  Bdi,
  Button,
  InlineMessage,
  TechnicalId,
  TwoLineCell,
  type TableColumn,
} from '@vertex-os/ui';
import { useState } from 'react';
import { PERMISSION_STATES, type Page, type Permission, type PermissionState } from '../iam-api';
import { permissionsQuery } from '../iam-queries';
import { PermissionStatus, permissionStateLabel, SensitivityStatus } from '../iam-states';
import { PickerNote } from '../users/picker-note';
import type { ListParams } from './list-search';
import { useOrganizationMessages } from './organization-messages';
import { StateListPage } from './state-list-page';

/**
 * The permission catalog (spec Sections 9.5, 18, 25.8): read-only. Permission codes are defined
 * by reviewed module manifests; no screen creates, edits or retires one.
 */
export function PermissionCatalog({
  params,
  onParamsChange,
}: {
  params: ListParams<PermissionState>;
  onParamsChange: (next: ListParams<PermissionState>) => void;
}) {
  const copy = useOrganizationMessages();
  const [search, setSearch] = useState({ text: '', applied: '' });
  const permissions = useQuery({
    ...permissionsQuery({
      ...params,
      search: search.applied === '' ? undefined : search.applied,
    }),
    placeholderData: keepPreviousData,
  });

  const columns: TableColumn<Permission>[] = [
    {
      id: 'permission',
      header: copy.columnPermission,
      kind: 'identity',
      cell: (permission) => (
        <TwoLineCell
          primary={<Bdi>{permission.name}</Bdi>}
          secondary={<TechnicalId>{permission.code}</TechnicalId>}
        />
      ),
    },
    {
      id: 'module',
      header: copy.columnModule,
      cell: (permission) => <TechnicalId>{permission.owningModule}</TechnicalId>,
    },
    {
      id: 'sensitivity',
      header: copy.columnSensitivity,
      kind: 'status',
      cell: (permission) => <SensitivityStatus sensitivity={permission.sensitivity} />,
    },
    {
      id: 'state',
      header: copy.columnState,
      kind: 'status',
      cell: (permission) => <PermissionStatus state={permission.state} />,
    },
    {
      id: 'description',
      header: copy.description,
      cell: (permission) => <Bdi>{permission.description}</Bdi>,
    },
  ];

  return (
    <StateListPage
      copy={{
        title: copy.permissions,
        description: copy.permissionsDescription,
        caption: copy.permissionsCaption,
        searchLabel: copy.searchPermissions,
        searchHelp: copy.searchByNameOrCode,
        stateFilter: copy.columnState,
        loadFailed: copy.catalogLoadFailed,
        emptyTitle: copy.noPermissionsTitle,
        emptyDescription: copy.noPermissionsDescription,
      }}
      params={params}
      onParamsChange={onParamsChange}
      search={search}
      onSearch={setSearch}
      query={permissions}
      columns={columns}
      getRowId={(permission) => permission.code}
      getRowLabel={(permission) => permission.name}
      states={PERMISSION_STATES}
      stateLabel={permissionStateLabel}
    />
  );
}

/**
 * The permissions mapped to a role, named from the catalog when the administrator may read it;
 * otherwise their codes only. A mapped code that is not ACTIVE shows its state: it is not
 * effective (spec Section 9.6).
 */
export function MappedPermissions({
  codes,
  catalog,
}: {
  codes: readonly string[];
  catalog: UseQueryResult<Page<Permission>> | undefined;
}) {
  const copy = useOrganizationMessages();
  if (codes.length === 0) return <p className="text-secondary">{copy.noMappedPermissions}</p>;
  const byCode = new Map(
    (catalog?.data?.items ?? []).map((permission) => [permission.code, permission]),
  );
  return (
    <>
      {catalog?.isError && (
        <InlineMessage tone="danger">
          {copy.catalogLoadFailed}{' '}
          <Button size="small" onClick={() => void catalog.refetch()}>
            {copy.retry}
          </Button>
        </InlineMessage>
      )}
      {catalog?.data !== undefined && <PickerNote page={catalog.data} />}
      <ul className="flex flex-col gap-field-gap">
        {[...codes].sort().map((code) => {
          const permission = byCode.get(code);
          return (
            <li key={code} className="flex flex-wrap items-center gap-actions">
              {permission === undefined ? (
                <TechnicalId>{code}</TechnicalId>
              ) : (
                <>
                  <span>
                    <Bdi>{permission.name}</Bdi> <TechnicalId>{code}</TechnicalId>
                  </span>
                  <SensitivityStatus sensitivity={permission.sensitivity} />
                  {permission.state !== 'ACTIVE' && <PermissionStatus state={permission.state} />}
                </>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}
