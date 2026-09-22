import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { UiRoot } from '../runtime/ui-root';
import { EmptyState, NoResultsState } from './feedback';
import {
  BulkActionBar,
  DataTable,
  nextSort,
  useTableSelection,
  type TableColumn,
  type TableSort,
} from './table';

interface Row {
  readonly id: string;
  readonly name: string;
  readonly balance: string;
  readonly terminated: boolean;
}

const rows: Row[] = Array.from({ length: 30 }, (_, index) => ({
  id: `u-${index + 1}`,
  name: `مستخدم تجريبي ${String(index + 1).padStart(2, '0')}`,
  balance: `${index * 10}.00`,
  terminated: index === 0,
}));

const columns: TableColumn<Row>[] = [
  { id: 'name', header: 'الاسم', kind: 'identity', sortable: true, cell: (row) => row.name },
  { id: 'balance', header: 'الرصيد', kind: 'amount', cell: (row) => `${row.balance} USD` },
  {
    id: 'actions',
    header: 'الإجراءات',
    kind: 'actions',
    headerVisuallyHidden: true,
    cell: () => null,
  },
];

function Directory({
  query = '',
  status = 'ready' as 'ready' | 'loading' | 'error',
  data = rows,
  page = 1,
}) {
  const [sort, setSort] = useState<TableSort>(null);
  const visible = data.slice((page - 1) * 25, page * 25);
  const selection = useTableSelection({
    queryContext: query,
    isSelectable: (id) => !data.find((row) => row.id === id)?.terminated,
  });
  const pageIds = visible.map((row) => row.id);
  return (
    <>
      {selection.selected.size > 0 && (
        <BulkActionBar selection={selection} pageIds={pageIds}>
          <span>إجراءات جماعية</span>
        </BulkActionBar>
      )}
      <DataTable
        caption="دليل المستخدمين"
        columns={columns}
        rows={visible}
        getRowId={(row) => row.id}
        getRowLabel={(row) => row.name}
        sort={sort}
        onSortChange={setSort}
        selection={selection}
        status={status}
        empty={
          query ? (
            <NoResultsState onClearFilters={() => undefined} />
          ) : (
            <EmptyState title="لا يوجد مستخدمون بعد" description="أضف أول مستخدم." />
          )
        }
        error={<p>تعذّر تحميل المستخدمين.</p>}
      />
    </>
  );
}

describe('DataTable semantics', () => {
  it('is a real table named by its caption, not a grid', () => {
    render(
      <UiRoot>
        <Directory />
      </UiRoot>,
    );
    const table = screen.getByRole('table', { name: 'دليل المستخدمين' });
    expect(screen.queryByRole('grid')).toBeNull();
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((cell) => cell.textContent),
    ).toEqual(['تحديد السجلات المتاحة في هذه الصفحة', 'الاسم', 'الرصيد', 'الإجراءات']);
    expect(within(table).getByRole('columnheader', { name: 'الرصيد' }).dataset['kind']).toBe(
      'amount',
    );
  });

  it('cycles sort unsorted → ascending → descending → unsorted with aria-sort and an announcement', async () => {
    render(
      <UiRoot>
        <Directory />
      </UiRoot>,
    );
    const header = () => screen.getByRole('columnheader', { name: 'الاسم' });
    const button = within(header()).getByRole('button', { name: 'الاسم' });
    expect(header().hasAttribute('aria-sort')).toBe(false);
    fireEvent.click(button);
    expect(header().getAttribute('aria-sort')).toBe('ascending');
    await waitFor(() =>
      expect(document.querySelector('[aria-live="polite"]')?.textContent).toBe(
        'مرتب حسب الاسم تصاعديًا',
      ),
    );
    fireEvent.click(button);
    expect(header().getAttribute('aria-sort')).toBe('descending');
    fireEvent.click(button);
    expect(header().hasAttribute('aria-sort')).toBe(false);
    expect(nextSort(null, 'name')).toEqual({ columnId: 'name', direction: 'ascending' });
  });
});

describe('selection scope (§29.3)', () => {
  it('selects eligible rows on the current page only and reports mixed state', () => {
    render(
      <UiRoot>
        <Directory />
      </UiRoot>,
    );
    const header = screen.getByRole('checkbox', {
      name: 'تحديد السجلات المتاحة في هذه الصفحة',
    }) as HTMLInputElement;
    fireEvent.click(header);
    expect(screen.getByRole('group', { name: /تم تحديد 24 سجلًا/ })).toBeTruthy();
    // The terminated record cannot be selected and says so in its name.
    expect(
      (
        screen.getByRole('checkbox', {
          name: /مستخدم تجريبي 01 — غير متاح للتحديد/,
        }) as HTMLInputElement
      ).disabled,
    ).toBe(true);
    fireEvent.click(screen.getByRole('checkbox', { name: 'تحديد مستخدم تجريبي 02' }));
    expect(header.indeterminate).toBe(true);
    expect(header.checked).toBe(false);
  });

  it('keeps explicit ids across paging and counts off-page selections', () => {
    const view = render(
      <UiRoot>
        <Directory />
      </UiRoot>,
    );
    fireEvent.click(screen.getByRole('checkbox', { name: 'تحديد مستخدم تجريبي 03' }));
    view.rerender(
      <UiRoot>
        <Directory page={2} />
      </UiRoot>,
    );
    expect(screen.getByText('تم تحديد سجل واحد، منها 1 خارج هذه الصفحة')).toBeTruthy();
  });

  it('clears selection and announces it when the query context changes', async () => {
    const view = render(
      <UiRoot>
        <Directory />
      </UiRoot>,
    );
    fireEvent.click(screen.getByRole('checkbox', { name: 'تحديد مستخدم تجريبي 03' }));
    await act(async () => {
      view.rerender(
        <UiRoot>
          <Directory query="نشط" />
        </UiRoot>,
      );
    });
    expect(screen.queryByRole('group', { name: /تم تحديد/ })).toBeNull();
    await waitFor(() =>
      expect(document.querySelector('[aria-live="polite"]')?.textContent).toBe(
        'تم إلغاء التحديد لأن نطاق النتائج تغيّر.',
      ),
    );
  });
});

describe('result states (§29.2, §34)', () => {
  it('distinguishes no records, no matches and a failed query', () => {
    const view = render(
      <UiRoot>
        <Directory data={[]} />
      </UiRoot>,
    );
    expect(screen.getByRole('heading', { name: 'لا يوجد مستخدمون بعد' })).toBeTruthy();
    view.rerender(
      <UiRoot>
        <Directory data={[]} query="xyz" />
      </UiRoot>,
    );
    expect(screen.getByRole('heading', { name: 'لا توجد نتائج مطابقة' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'مسح عوامل التصفية' })).toBeTruthy();
    view.rerender(
      <UiRoot>
        <Directory status="error" />
      </UiRoot>,
    );
    expect(screen.getByText('تعذّر تحميل المستخدمين.')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'لا توجد نتائج مطابقة' })).toBeNull();
  });

  it('keeps the table shape while loading and hides the skeleton rows from assistive technology', () => {
    render(
      <UiRoot>
        <Directory status="loading" />
      </UiRoot>,
    );
    const table = screen.getByRole('table');
    expect(within(table).getAllByRole('columnheader')).toHaveLength(4);
    expect(table.querySelector('tbody')?.getAttribute('aria-hidden')).toBe('true');
    expect(screen.getByText('جارٍ التحميل…')).toBeTruthy();
  });
});
