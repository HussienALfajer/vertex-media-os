import {
  Bdi,
  DataTable,
  DateText,
  EmptyState,
  ErrorState,
  ExactAmount,
  Fieldset,
  NoResultsState,
  Radio,
  StatusIndicator,
  TechnicalId,
  useTableSelection,
  type TableColumn,
  type TableSort,
} from '@vertex-os/ui';
import { useState } from 'react';
import { LEDGER, type LedgerLine } from '../fixtures';
import { useLabText } from '../lab-text';
import { Specimen, Stack } from '../specimen';

type Mode = 'ready' | 'refreshing' | 'loading' | 'error' | 'empty' | 'no-results';

/** Orders canonical decimal strings exactly (no floating point); missing sorts first. */
function compareDecimal(a: string | null, b: string | null): number {
  if (a === null || b === null) return a === b ? 0 : a === null ? -1 : 1;
  const negativeA = a.startsWith('-');
  const negativeB = b.startsWith('-');
  if (negativeA !== negativeB) return negativeA ? -1 : 1;
  const [wholeA = '', fractionA = ''] = a.replace('-', '').split('.');
  const [wholeB = '', fractionB = ''] = b.replace('-', '').split('.');
  const width = Math.max(fractionA.length, fractionB.length);
  const digitsA = `${wholeA.padStart(24, '0')}${fractionA.padEnd(width, '0')}`;
  const digitsB = `${wholeB.padStart(24, '0')}${fractionB.padEnd(width, '0')}`;
  const magnitude = digitsA < digitsB ? -1 : digitsA > digitsB ? 1 : 0;
  return negativeA ? -magnitude : magnitude;
}

/** A deliberately wide table: overflow stays in its region and identity can stay visible. */
export function TablesSection() {
  const t = useLabText();
  const [mode, setMode] = useState<Mode>('ready');
  const [sort, setSort] = useState<TableSort>(null);
  const selection = useTableSelection({
    queryContext: mode,
    isSelectable: (id) => id !== 'INV-2026-0045',
  });
  const rows = mode === 'empty' || mode === 'no-results' ? [] : [...LEDGER];
  if (sort?.columnId === 'amount')
    rows.sort((a, b) => {
      const order = compareDecimal(a.amount, b.amount);
      return sort.direction === 'ascending' ? order : -order;
    });
  const columns: TableColumn<LedgerLine>[] = [
    {
      id: 'id',
      header: t('المستند', 'Document'),
      kind: 'identity',
      cell: (row) => <TechnicalId>{row.id}</TechnicalId>,
    },
    {
      id: 'description',
      header: t('الوصف', 'Description'),
      kind: 'text',
      cell: (row) => <Bdi>{t(row.description.ar, row.description.en)}</Bdi>,
    },
    {
      id: 'date',
      header: t('التاريخ', 'Date'),
      kind: 'date',
      cell: (row) => <DateText value={row.date} />,
    },
    {
      id: 'state',
      header: t('الحالة', 'Status'),
      kind: 'status',
      cell: (row) =>
        row.amount === null ? (
          <StatusIndicator
            tone="warning"
            icon="alert-triangle"
            label={t('بانتظار التسعير', 'Awaiting pricing')}
          />
        ) : (
          <StatusIndicator tone="info" icon="clock" label={t('قيد المراجعة', 'In review')} />
        ),
    },
    {
      id: 'currency',
      header: t('العملة', 'Currency'),
      kind: 'text',
      cell: (row) => <TechnicalId>{row.currency}</TechnicalId>,
    },
    {
      id: 'amount',
      header: t('المبلغ', 'Amount'),
      kind: 'amount',
      sortable: true,
      cell: (row) => <ExactAmount value={row.amount} currency={row.currency} />,
    },
  ];
  return (
    <Stack gap="section">
      <Specimen id="table-modes" title={t('حالات الجدول', 'Table states')}>
        <Fieldset legend={t('الحالة المعروضة', 'Shown state')}>
          <div className="flex flex-wrap gap-toolbar-groups">
            {(
              [
                ['ready', 'جاهز', 'Ready'],
                ['refreshing', 'تحديث في الخلفية', 'Background refresh'],
                ['loading', 'تحميل أول', 'First load'],
                ['error', 'فشل الاستعلام', 'Query failed'],
                ['empty', 'لا سجلات', 'No records'],
                ['no-results', 'لا نتائج مطابقة', 'No matches'],
              ] as const
            ).map(([value, ar, en]) => (
              <Radio
                key={value}
                name="lab-table-mode"
                value={value}
                label={t(ar, en)}
                checked={mode === value}
                onChange={() => setMode(value)}
              />
            ))}
          </div>
        </Fieldset>
      </Specimen>
      <Specimen
        id="data-table"
        title={t('جدول بيانات عريض', 'Wide data table')}
        description={t(
          'الأعمدة الرقمية عند نهاية السطر، والتمرير الأفقي داخل منطقة مسماة.',
          'Numeric columns at inline-end; horizontal scrolling inside a named region.',
        )}
        flush
      >
        <DataTable
          caption={t('مستندات مالية تجريبية', 'Demo financial documents')}
          columns={columns}
          rows={rows}
          getRowId={(row) => row.id}
          getRowLabel={(row) => row.id}
          sort={sort}
          onSortChange={setSort}
          selection={selection}
          stickyIdentity
          status={mode === 'loading' ? 'loading' : mode === 'error' ? 'error' : 'ready'}
          refreshing={mode === 'refreshing'}
          empty={
            mode === 'no-results' ? (
              <NoResultsState onClearFilters={() => setMode('ready')} />
            ) : (
              <EmptyState
                title={t('لا توجد مستندات بعد', 'No documents yet')}
                description={t(
                  'ستظهر المستندات هنا عند إصدارها.',
                  'Documents appear here once issued.',
                )}
              />
            )
          }
          error={
            <ErrorState
              title={t('تعذّر تحميل المستندات', 'Documents could not be loaded')}
              description={t(
                'فشل الاستعلام لا يعني أن القائمة فارغة.',
                'A failed query does not mean the list is empty.',
              )}
              onRetry={() => setMode('ready')}
            />
          }
        />
      </Specimen>
    </Stack>
  );
}
