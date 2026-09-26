import type { UseQueryResult } from '@tanstack/react-query';
import {
  Alert,
  Button,
  DataTable,
  EmptyState,
  ErrorState,
  Field,
  FilterBar,
  NoResultsState,
  Page,
  PageHeader,
  Pagination,
  SearchInput,
  Select,
  TableToolbar,
  useUiSettings,
  type Language,
  type TableColumn,
} from '@vertex-os/ui';
import type { ReactNode } from 'react';
import { isApiProblem } from '../../../lib/http';
import type { Page as ResultPage } from '../iam-api';
import { useIamMessages } from '../iam-messages';
import type { ListParams } from './list-search';

/** The API bounds search text to 100 characters (IAM-R07 D-03). */
export const SEARCH_MAX = 100;

export interface StateListCopy {
  readonly title: string;
  readonly description: string;
  readonly caption: string;
  readonly searchLabel: string;
  readonly searchHelp: string;
  readonly stateFilter: string;
  readonly loadFailed: string;
  readonly emptyTitle: string;
  readonly emptyDescription: string;
}

/**
 * One bounded, server-paged IAM list with search and a state filter (spec Section 42; DESIGN_SYSTEM
 * Section 29), shared by departments, roles and the permission catalog. Page, page size and state
 * live in the address; the search text is in memory (IAM-R08C D-02).
 */
export function StateListPage<Item, State extends string>({
  copy,
  params,
  onParamsChange,
  search,
  onSearch,
  query,
  columns,
  getRowId,
  getRowLabel,
  states,
  stateLabel,
  action,
}: {
  copy: StateListCopy;
  params: ListParams<State>;
  onParamsChange: (next: ListParams<State>) => void;
  search: { readonly text: string; readonly applied: string };
  onSearch: (next: { readonly text: string; readonly applied: string }) => void;
  query: UseQueryResult<ResultPage<Item>>;
  columns: TableColumn<Item>[];
  getRowId: (item: Item) => string;
  getRowLabel: (item: Item) => string;
  states: readonly State[];
  stateLabel: (state: string, language: Language) => string | undefined;
  /** The one permitted first action, already filtered by permission. */
  action?: ReactNode;
}) {
  const messages = useIamMessages();
  const { language } = useUiSettings();
  const header = <PageHeader title={copy.title} description={copy.description} actions={action} />;

  if (isApiProblem(query.error, 403)) {
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

  const filtered = search.applied !== '' || params.state !== undefined;
  const clearFilters = () => {
    onSearch({ text: '', applied: '' });
    onParamsChange({ page: 1, pageSize: params.pageSize });
  };
  // Never retain protected rows when a refresh says the session is no longer authorized.
  const page = isApiProblem(query.error, 401) ? undefined : query.data;

  return (
    <Page>
      {header}
      <div className="flex flex-col gap-toolbar-groups">
        {page !== undefined && query.isError && (
          <Alert
            tone="warning"
            title={messages.staleDataTitle}
            actions={
              <Button onClick={() => void query.refetch()} disabled={query.isFetching}>
                {messages.retry}
              </Button>
            }
          />
        )}
        <TableToolbar
          search={
            <Field label={copy.searchLabel} description={copy.searchHelp}>
              <SearchInput
                value={search.text}
                maxLength={SEARCH_MAX}
                onValueChange={(text) => onSearch({ ...search, text })}
                onSearch={(value) => {
                  const trimmed = value.trim();
                  if (trimmed === search.applied) return;
                  onSearch({ text: value, applied: trimmed });
                  onParamsChange({ ...params, page: 1 });
                }}
              />
            </Field>
          }
          filters={
            <FilterBar
              active={
                params.state === undefined
                  ? []
                  : [
                      {
                        id: 'state',
                        label: `${copy.stateFilter}: ${stateLabel(params.state, language) ?? params.state}`,
                        onRemove: () => onParamsChange({ page: 1, pageSize: params.pageSize }),
                      },
                    ]
              }
              onClearAll={clearFilters}
            >
              <Field label={copy.stateFilter}>
                <Select
                  value={params.state ?? 'all'}
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    const state = states.find((candidate) => candidate === value);
                    onParamsChange({ page: 1, pageSize: params.pageSize, state });
                  }}
                >
                  <option value="all">{messages.all}</option>
                  {states.map((state) => (
                    <option key={state} value={state}>
                      {stateLabel(state, language)}
                    </option>
                  ))}
                </Select>
              </Field>
            </FilterBar>
          }
        />
        <DataTable
          caption={copy.caption}
          captionVisuallyHidden
          columns={columns}
          rows={page?.items ?? []}
          getRowId={getRowId}
          getRowLabel={getRowLabel}
          status={page !== undefined ? 'ready' : query.isError ? 'error' : 'loading'}
          refreshing={query.isFetching && page !== undefined}
          error={
            <ErrorState
              title={copy.loadFailed}
              description={messages.loadFailedDetail}
              onRetry={() => void query.refetch()}
              retrying={query.isFetching}
              headingLevel={2}
            />
          }
          empty={
            filtered ? (
              <NoResultsState onClearFilters={clearFilters} />
            ) : (
              <EmptyState
                title={copy.emptyTitle}
                description={copy.emptyDescription}
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
