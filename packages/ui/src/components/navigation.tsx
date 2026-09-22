import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { Icon, type IconName } from '../icons/icon';
import { UiLink, useUiMessages } from '../runtime/ui-root';
import { Button, IconButton } from './button';
import { Select } from './field';
import { DropdownMenu } from './overlays';
import { Tooltip } from './tooltip';

export interface BreadcrumbItem {
  readonly label: string;
  /** Ancestors link; the last item is the current page and must not link. */
  readonly href?: string;
}

/**
 * Hierarchy, not history (§30). Narrow screens collapse middle ancestors into a named menu,
 * keeping the nearest parent and the current page.
 */
export function Breadcrumb({ items }: { items: readonly BreadcrumbItem[] }) {
  const messages = useUiMessages();
  const current = items.at(-1);
  const ancestors = items.slice(0, -1);
  const collapsible = ancestors.length > 1;
  const crumb = (item: BreadcrumbItem, index: number, isCurrent: boolean, collapsed = false) => (
    <li key={`${index}-${item.label}`} data-collapsed-hidden={collapsed ? '' : undefined}>
      {isCurrent || item.href === undefined ? (
        <span aria-current={isCurrent ? 'page' : undefined}>{item.label}</span>
      ) : (
        <UiLink href={item.href}>{item.label}</UiLink>
      )}
      {!isCurrent && <Icon name="chevron-end" size="small" />}
    </li>
  );
  if (!current) return null;
  return (
    <nav aria-label={messages.breadcrumb} className="vx-breadcrumb">
      <ol>
        {collapsible && (
          <li data-collapsed-only="">
            <DropdownMenu
              trigger={<IconButton icon="more" size="small" label={messages.moreAncestors} />}
              items={ancestors
                .slice(0, -1)
                .map((item, index) =>
                  item.href === undefined
                    ? { id: String(index), label: item.label, disabled: true }
                    : { id: String(index), label: item.label, href: item.href },
                )}
            />
            <Icon name="chevron-end" size="small" />
          </li>
        )}
        {ancestors.map((item, index) =>
          crumb(item, index, false, collapsible && index < ancestors.length - 1),
        )}
        {crumb(current, items.length - 1, true)}
      </ol>
    </nav>
  );
}

export interface TabItem {
  readonly id: string;
  readonly label: string;
  readonly content: ReactNode;
  readonly disabled?: boolean;
}

export interface TabsProps {
  readonly label: string;
  readonly items: readonly TabItem[];
  readonly value: string;
  readonly onValueChange: (id: string) => void;
  /**
   * `manual` (default): arrows move focus, Enter/Space activate — for panels that may load.
   * `automatic`: focus activates, only when content is already available (§30).
   */
  readonly activation?: 'manual' | 'automatic';
}

/**
 * Related panels with one tab stop. ArrowLeft/ArrowRight move to the visually adjacent tab,
 * so the logical next tab is ArrowLeft in RTL (§24.2); Home/End go to the first/last.
 */
export function Tabs({ label, items, value, onValueChange, activation = 'manual' }: TabsProps) {
  const base = useId();
  const list = useRef<HTMLDivElement>(null);
  const enabled = items.filter((item) => !item.disabled);
  const move = (event: KeyboardEvent<HTMLButtonElement>, from: string) => {
    // Direction comes from the governing dir attribute (the root, or a nested isolated region).
    const rtl = list.current?.closest('[dir]')?.getAttribute('dir') === 'rtl';
    const index = enabled.findIndex((item) => item.id === from);
    let target: TabItem | undefined;
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      const forward = (event.key === 'ArrowRight') !== rtl;
      target = enabled[(index + (forward ? 1 : -1) + enabled.length) % enabled.length];
    } else if (event.key === 'Home') target = enabled[0];
    else if (event.key === 'End') target = enabled.at(-1);
    if (!target) return;
    event.preventDefault();
    document.getElementById(`${base}-tab-${target.id}`)?.focus();
    if (activation === 'automatic') onValueChange(target.id);
  };
  return (
    <div className="vx-tabs">
      <div ref={list} role="tablist" aria-label={label} className="vx-tab-list">
        {items.map((item) => {
          const selected = item.id === value;
          return (
            <button
              key={item.id}
              id={`${base}-tab-${item.id}`}
              type="button"
              role="tab"
              className="vx-tab"
              aria-selected={selected}
              aria-controls={`${base}-panel-${item.id}`}
              tabIndex={selected ? 0 : -1}
              disabled={item.disabled}
              onClick={() => onValueChange(item.id)}
              onKeyDown={(event) => move(event, item.id)}
            >
              {item.label}
            </button>
          );
        })}
      </div>
      {items.map((item) => (
        <div
          key={item.id}
          id={`${base}-panel-${item.id}`}
          role="tabpanel"
          aria-labelledby={`${base}-tab-${item.id}`}
          className="vx-tab-panel"
          tabIndex={0}
          hidden={item.id !== value}
        >
          {item.id === value && item.content}
        </div>
      ))}
    </div>
  );
}

export const PAGE_SIZES = [25, 50, 100] as const;
export type PageSize = (typeof PAGE_SIZES)[number];

export type PaginationProps =
  | {
      /** The server knows the total: show the range and page count. */
      readonly mode: 'offset';
      readonly page: number;
      readonly pageSize: PageSize;
      readonly total: number;
      readonly onPageChange: (page: number) => void;
      readonly onPageSizeChange?: (size: PageSize) => void;
    }
  | {
      /** Cursor pagination: never fabricate page counts (§29.4). */
      readonly mode: 'cursor';
      readonly hasPrevious: boolean;
      readonly hasNext: boolean;
      readonly onPrevious: () => void;
      readonly onNext: () => void;
      readonly pageSize: PageSize;
      readonly onPageSizeChange?: (size: PageSize) => void;
    };

/** Previous points to inline-start and next to inline-end; numbers keep their order (§24.1). */
export function Pagination(props: PaginationProps) {
  const messages = useUiMessages();
  const sizeId = useId();
  const pages = props.mode === 'offset' ? Math.max(1, Math.ceil(props.total / props.pageSize)) : 0;
  const summary =
    props.mode === 'offset' && props.total > 0
      ? `${messages.range(
          (props.page - 1) * props.pageSize + 1,
          Math.min(props.page * props.pageSize, props.total),
          props.total,
        )} · ${messages.pageOf(props.page, pages)}`
      : undefined;
  const canPrevious = props.mode === 'offset' ? props.page > 1 : props.hasPrevious;
  const canNext = props.mode === 'offset' ? props.page < pages : props.hasNext;
  return (
    <nav aria-label={messages.pagination} className="vx-pagination">
      {props.onPageSizeChange && (
        <span className="vx-pagination-size">
          <label htmlFor={sizeId}>{messages.rowsPerPage}</label>
          <Select
            id={sizeId}
            value={String(props.pageSize)}
            onChange={(event) => {
              const size = PAGE_SIZES.find(
                (option) => String(option) === event.currentTarget.value,
              );
              if (size !== undefined) props.onPageSizeChange?.(size);
            }}
          >
            {PAGE_SIZES.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </Select>
        </span>
      )}
      {summary && <span className="vx-pagination-summary vx-numeric">{summary}</span>}
      <span className="vx-pagination-actions">
        <Button
          icon="chevron-start"
          disabled={!canPrevious}
          onClick={() =>
            props.mode === 'offset' ? props.onPageChange(props.page - 1) : props.onPrevious()
          }
        >
          {messages.previousPage}
        </Button>
        <Button
          trailingIcon="chevron-end"
          disabled={!canNext}
          onClick={() =>
            props.mode === 'offset' ? props.onPageChange(props.page + 1) : props.onNext()
          }
        >
          {messages.nextPage}
        </Button>
      </span>
    </nav>
  );
}

export interface NavigationItem {
  readonly id: string;
  readonly label: string;
  readonly href: string;
  readonly icon: IconName;
  readonly current?: boolean;
}

export interface NavigationGroup {
  readonly id: string;
  /** Work-area group name (§30); omit for a single ungrouped list. */
  readonly label?: string;
  readonly items: readonly NavigationItem[];
}

/** Destinations only; unauthorized or empty groups are omitted by the feature (§30). */
export function SidebarNav({
  label,
  groups,
  rail = false,
  onNavigate,
}: {
  label: string;
  groups: readonly NavigationGroup[];
  /** Collapsed rail: labels are visually hidden and supplemented by tooltips (§22.1). */
  rail?: boolean;
  onNavigate?: () => void;
}) {
  const idBase = useId();
  return (
    <nav aria-label={label} className="vx-sidebar-nav" data-rail={rail ? '' : undefined}>
      {groups.map((group) => {
        const groupId = `${idBase}-${group.id}`;
        return (
          <div key={group.id} className="vx-sidebar-group">
            {group.label && (
              <p className="vx-sidebar-group-label" id={groupId}>
                {group.label}
              </p>
            )}
            <ul aria-labelledby={group.label ? groupId : undefined}>
              {group.items.map((item) => {
                const link = (
                  <UiLink
                    href={item.href}
                    className="vx-sidebar-link"
                    aria-current={item.current ? 'page' : undefined}
                    onClick={onNavigate}
                  >
                    <Icon name={item.icon} />
                    <span className="vx-sidebar-link-label">{item.label}</span>
                  </UiLink>
                );
                return (
                  <li key={item.id}>
                    {rail ? <Tooltip content={item.label}>{link}</Tooltip> : link}
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}
