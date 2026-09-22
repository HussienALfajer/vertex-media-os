import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Icon } from '../icons/icon';
import { useAnnounce, useUiMessages } from '../runtime/ui-root';
import { Button } from './button';
import { Checkbox } from './choice';
import { SKELETON_DELAY_MS } from './feedback';

/**
 * Column contract. `kind` sets alignment and minimum width (§29.1, §29.4): numeric and amount
 * cells align to inline-end, identity comes first, actions last. Minimums never permit
 * truncating values that decide an action.
 */
export type ColumnKind = 'identity' | 'text' | 'status' | 'number' | 'amount' | 'date' | 'actions';

export interface TableColumn<Row> {
  readonly id: string;
  /** Sentence-case heading; also the accessible name used in sort announcements. */
  readonly header: string;
  readonly cell: (row: Row) => ReactNode;
  readonly kind?: ColumnKind;
  readonly sortable?: boolean;
  /** Keep the heading for assistive technology but hide it visually (row-action columns). */
  readonly headerVisuallyHidden?: boolean;
}

/**
 * Primary value with one secondary line (e.g. name and email). Rows containing it use the
 * two-line minimum block size (§14).
 */
export function TwoLineCell({ primary, secondary }: { primary: ReactNode; secondary: ReactNode }) {
  return (
    <span className="vx-cell-two-line">
      <span className="vx-cell-primary">{primary}</span>
      <span className="vx-cell-secondary">{secondary}</span>
    </span>
  );
}

export type SortDirection = 'ascending' | 'descending';
export type TableSort = { readonly columnId: string; readonly direction: SortDirection } | null;

/** Default cycle: unsorted → ascending → descending → unsorted (§29.2). */
export function nextSort(current: TableSort, columnId: string): TableSort {
  if (current?.columnId !== columnId) return { columnId, direction: 'ascending' };
  return current.direction === 'ascending' ? { columnId, direction: 'descending' } : null;
}

export interface TableSelection {
  readonly selected: ReadonlySet<string>;
  readonly isSelectable: (id: string) => boolean;
  readonly toggle: (id: string, selected: boolean) => void;
  readonly togglePage: (ids: readonly string[], selected: boolean) => void;
  readonly clear: () => void;
}

/**
 * Explicit-ID selection (§29.3): it survives sorting and paging, and is cleared (with an
 * announcement) whenever the query/filter context changes. "Select all matching" is a
 * separate backend-supported capability and is deliberately not inferred here.
 */
export function useTableSelection({
  queryContext,
  isSelectable = () => true,
}: {
  /** A stable key of every filter/search input; not the sort or page. */
  queryContext: string;
  isSelectable?: (id: string) => boolean;
}): TableSelection {
  const messages = useUiMessages();
  const announce = useAnnounce();
  const [state, setState] = useState<{ context: string; ids: ReadonlySet<string> }>(() => ({
    context: queryContext,
    ids: new Set(),
  }));
  const [clears, setClears] = useState(0);
  if (state.context !== queryContext) {
    // Reset during render when the query context changes, before anything reads the old ids.
    if (state.ids.size > 0) setClears((count) => count + 1);
    setState({ context: queryContext, ids: new Set() });
  }
  useEffect(() => {
    if (clears > 0) announce(messages.selectionCleared);
  }, [clears, announce, messages.selectionCleared]);
  const selected = state.context === queryContext ? state.ids : EMPTY;
  const update = useCallback(
    (change: (ids: Set<string>) => void) =>
      setState((current) => {
        const ids = new Set(current.context === queryContext ? current.ids : []);
        change(ids);
        return { context: queryContext, ids };
      }),
    [queryContext],
  );
  return useMemo(
    () => ({
      selected,
      isSelectable,
      toggle: (id, next) => update((ids) => (next ? ids.add(id) : ids.delete(id))),
      togglePage: (pageIds, next) =>
        update((ids) => {
          for (const id of pageIds) {
            if (next) ids.add(id);
            else ids.delete(id);
          }
        }),
      clear: () => update((ids) => ids.clear()),
    }),
    [selected, isSelectable, update],
  );
}

const EMPTY: ReadonlySet<string> = new Set();

export interface DataTableProps<Row> {
  /** Names the table and its scroll region; visible as the caption unless hidden. */
  readonly caption: string;
  readonly captionVisuallyHidden?: boolean;
  readonly columns: readonly TableColumn<Row>[];
  /** The current page, as returned by the owning feature. */
  readonly rows: readonly Row[];
  readonly getRowId: (row: Row) => string;
  /** Record identity used in row-checkbox names (§29.3). */
  readonly getRowLabel: (row: Row) => string;
  readonly sort?: TableSort;
  readonly onSortChange?: (sort: TableSort) => void;
  readonly selection?: TableSelection;
  /** `loading`: first load (shaped skeleton). `error`: the query failed — never an empty result. */
  readonly status?: 'ready' | 'loading' | 'error';
  /** Background refresh keeps rows and shows an updating message instead of a skeleton. */
  readonly refreshing?: boolean;
  /** Shown when ready with no rows: `EmptyState` (no records) or `NoResultsState` (no matches). */
  readonly empty: ReactNode;
  /** Shown for `status="error"`, usually an `ErrorState` with a safe retry. */
  readonly error?: ReactNode;
  /** Keep selection and identity visible while scrolling wide tables (disabled on narrow screens). */
  readonly stickyIdentity?: boolean;
}

export function DataTable<Row>({
  caption,
  captionVisuallyHidden = false,
  columns,
  rows,
  getRowId,
  getRowLabel,
  sort = null,
  onSortChange,
  selection,
  status = 'ready',
  refreshing = false,
  empty,
  error,
  stickyIdentity = false,
}: DataTableProps<Row>) {
  const messages = useUiMessages();
  const announce = useAnnounce();
  const captionId = useId();
  const cueId = useId();
  const region = useRef<HTMLDivElement>(null);
  const [overflowing, setOverflowing] = useState(false);
  const [skeleton, setSkeleton] = useState(false);

  useLayoutEffect(() => {
    const element = region.current;
    if (!element || typeof ResizeObserver === 'undefined') return undefined;
    const measure = () => setOverflowing(element.scrollWidth > element.clientWidth + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    const table = element.firstElementChild;
    if (table) observer.observe(table);
    return () => observer.disconnect();
  }, [status, rows.length, columns.length]);

  useEffect(() => {
    if (status !== 'loading') return undefined;
    const timer = setTimeout(() => setSkeleton(true), SKELETON_DELAY_MS);
    return () => {
      clearTimeout(timer);
      setSkeleton(false);
    };
  }, [status]);

  const pageIds = rows.map(getRowId).filter((id) => selection?.isSelectable(id) ?? false);
  const selectedOnPage = pageIds.filter((id) => selection?.selected.has(id)).length;

  const changeSort = (column: TableColumn<Row>) => {
    const next = nextSort(sort, column.id);
    onSortChange?.(next);
    announce(
      next === null
        ? messages.sortCleared(column.header)
        : next.direction === 'ascending'
          ? messages.sortAscending(column.header)
          : messages.sortDescending(column.header),
    );
  };

  const header = (
    <thead>
      <tr>
        {selection && (
          <th scope="col" data-kind="selection" data-sticky={stickyIdentity ? '' : undefined}>
            <Checkbox
              label={<span className="vx-visually-hidden">{messages.selectPageRows}</span>}
              checked={pageIds.length > 0 && selectedOnPage === pageIds.length}
              mixed={selectedOnPage > 0 && selectedOnPage < pageIds.length}
              disabled={pageIds.length === 0 || status !== 'ready'}
              onChange={(event) => selection.togglePage(pageIds, event.currentTarget.checked)}
            />
          </th>
        )}
        {columns.map((column, index) => {
          const active = sort?.columnId === column.id ? sort.direction : undefined;
          return (
            <th
              key={column.id}
              scope="col"
              data-kind={column.kind ?? 'text'}
              data-sticky={stickyIdentity && index === 0 ? '' : undefined}
              data-offset={stickyIdentity && index === 0 && selection ? '' : undefined}
              aria-sort={active}
            >
              {column.sortable ? (
                <button type="button" className="vx-sort" onClick={() => changeSort(column)}>
                  <span>{column.header}</span>
                  <Icon
                    name={
                      active === 'ascending'
                        ? 'sort-ascending'
                        : active === 'descending'
                          ? 'sort-descending'
                          : 'sort'
                    }
                    size="small"
                  />
                </button>
              ) : (
                <span className={column.headerVisuallyHidden ? 'vx-visually-hidden' : undefined}>
                  {column.header}
                </span>
              )}
            </th>
          );
        })}
      </tr>
    </thead>
  );

  let body: ReactNode;
  if (status === 'loading') {
    body = (
      <tbody aria-hidden="true">
        {Array.from({ length: 5 }, (_, row) => (
          <tr key={row}>
            {selection && <td data-kind="selection" />}
            {columns.map((column) => (
              <td key={column.id} data-kind={column.kind ?? 'text'}>
                {skeleton && <span className="vx-skeleton-cell" />}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    );
  } else if (status === 'ready') {
    body = (
      <tbody>
        {rows.map((row) => {
          const id = getRowId(row);
          const isSelected = selection?.selected.has(id) ?? false;
          const selectable = selection?.isSelectable(id) ?? false;
          return (
            <tr key={id} data-selected={isSelected ? '' : undefined}>
              {selection && (
                <td data-kind="selection" data-sticky={stickyIdentity ? '' : undefined}>
                  <Checkbox
                    label={
                      <span className="vx-visually-hidden">
                        {selectable
                          ? messages.selectRow(getRowLabel(row))
                          : `${messages.selectRow(getRowLabel(row))} — ${messages.unavailableSelection}`}
                      </span>
                    }
                    checked={isSelected}
                    disabled={!selectable}
                    onChange={(event) => selection.toggle(id, event.currentTarget.checked)}
                  />
                </td>
              )}
              {columns.map((column, index) => (
                <td
                  key={column.id}
                  data-kind={column.kind ?? 'text'}
                  data-sticky={stickyIdentity && index === 0 ? '' : undefined}
                  data-offset={stickyIdentity && index === 0 && selection ? '' : undefined}
                >
                  {column.cell(row)}
                </td>
              ))}
            </tr>
          );
        })}
      </tbody>
    );
  }

  const showEmpty = status === 'ready' && rows.length === 0;
  return (
    <div className="vx-data-table" aria-busy={status === 'loading' || refreshing || undefined}>
      <div className="vx-data-table-status" role="status">
        {status === 'loading' ? messages.loading : refreshing ? messages.refreshing : ''}
      </div>
      {overflowing && (
        <p id={cueId} className="vx-data-table-cue">
          <Icon name="arrow-end" size="small" />
          {messages.scrollTable}
        </p>
      )}
      <div
        ref={region}
        className="vx-table-region"
        role="region"
        aria-labelledby={captionId}
        aria-describedby={overflowing ? cueId : undefined}
        tabIndex={overflowing ? 0 : undefined}
        data-overflowing={overflowing ? '' : undefined}
      >
        <table className="vx-table">
          <caption
            id={captionId}
            className={captionVisuallyHidden ? 'vx-visually-hidden' : undefined}
          >
            {caption}
          </caption>
          {header}
          {body}
        </table>
        {status === 'error' && <div className="vx-data-table-message">{error}</div>}
        {showEmpty && <div className="vx-data-table-message">{empty}</div>}
      </div>
    </div>
  );
}

export interface TableToolbarProps {
  /** Usually a Field containing a SearchInput scoped to the work area. */
  readonly search?: ReactNode;
  /** Named filters, usually a FilterBar. */
  readonly filters?: ReactNode;
  /** Page-level actions for the list. */
  readonly actions?: ReactNode;
  /** When records are selected, a BulkActionBar replaces the actions region in place (§29.3). */
  readonly bulkActions?: ReactNode;
}

export function TableToolbar({ search, filters, actions, bulkActions }: TableToolbarProps) {
  return (
    <div className="vx-table-toolbar">
      {search && <div className="vx-table-toolbar-search">{search}</div>}
      {filters && <div className="vx-table-toolbar-filters">{filters}</div>}
      <div className="vx-table-toolbar-actions">{bulkActions ?? actions}</div>
    </div>
  );
}

export interface ActiveFilter {
  readonly id: string;
  /** Name and value, e.g. "الحالة: نشط". */
  readonly label: string;
  readonly onRemove: () => void;
}

export function FilterBar({
  children,
  active = [],
  onClearAll,
}: {
  children?: ReactNode;
  active?: readonly ActiveFilter[];
  onClearAll?: () => void;
}) {
  const messages = useUiMessages();
  return (
    <div className="vx-filter-bar">
      {children && <div className="vx-filter-bar-controls">{children}</div>}
      {active.length > 0 && (
        <div className="vx-filter-bar-active" role="group" aria-label={messages.activeFilters}>
          <ul>
            {active.map((filter) => (
              <li key={filter.id}>
                <button
                  type="button"
                  className="vx-filter-chip"
                  aria-label={messages.removeFilter(filter.label)}
                  onClick={filter.onRemove}
                >
                  <span>{filter.label}</span>
                  <Icon name="close" size="small" />
                </button>
              </li>
            ))}
          </ul>
          {onClearAll && (
            <Button variant="ghost" size="small" onClick={onClearAll}>
              {messages.clearFilters}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

/** States the count and scope, offers clear selection and only meaningful operations. */
export function BulkActionBar({
  selection,
  pageIds,
  children,
}: {
  selection: TableSelection;
  /** Ids on the current page, to state how many selections are off-page. */
  pageIds: readonly string[];
  children: ReactNode;
}) {
  const messages = useUiMessages();
  const onPage = pageIds.filter((id) => selection.selected.has(id)).length;
  return (
    <div
      className="vx-bulk-bar"
      role="group"
      aria-label={messages.selectionSummary(selection.selected.size, 0)}
    >
      <p className="vx-bulk-bar-summary" role="status">
        {messages.selectionSummary(selection.selected.size, selection.selected.size - onPage)}
      </p>
      <div className="vx-bulk-bar-actions">{children}</div>
      <Button variant="ghost" size="small" onClick={selection.clear}>
        {messages.clearSelection}
      </Button>
    </div>
  );
}
