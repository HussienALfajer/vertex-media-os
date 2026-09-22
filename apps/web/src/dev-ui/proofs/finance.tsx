import {
  Alert,
  Bdi,
  Button,
  DataTable,
  DateText,
  EmptyState,
  ExactAmount,
  FormActions,
  Progress,
  StatusIndicator,
  TechnicalId,
  type TableColumn,
} from '@vertex-os/ui';
import { useState } from 'react';
import { LEDGER, LEDGER_TOTALS, type LedgerLine } from '../fixtures';
import { useLabText } from '../lab-text';
import { Specimen, Stack } from '../specimen';

type Outcome = 'idle' | 'conflict' | 'uncertain';

export function FinanceProof() {
  const t = useLabText();
  const [outcome, setOutcome] = useState<Outcome>('conflict');
  const columns: TableColumn<LedgerLine>[] = [
    {
      id: 'id',
      header: t('المستند', 'Document'),
      kind: 'identity',
      cell: (line) => <TechnicalId>{line.id}</TechnicalId>,
    },
    {
      id: 'description',
      header: t('الوصف', 'Description'),
      kind: 'text',
      cell: (line) => <Bdi>{t(line.description.ar, line.description.en)}</Bdi>,
    },
    {
      id: 'date',
      header: t('التاريخ', 'Date'),
      kind: 'date',
      cell: (line) => <DateText value={line.date} />,
    },
    {
      id: 'kind',
      header: t('الإشارة', 'Sign'),
      kind: 'status',
      cell: (line) =>
        line.amount === null ? (
          <StatusIndicator tone="warning" icon="alert-triangle" label={t('غير محدد', 'Missing')} />
        ) : line.amount.startsWith('-') ? (
          <StatusIndicator
            tone="neutral"
            icon="minus-circle"
            label={t('سالب (دائن)', 'Negative (credit)')}
          />
        ) : /^0(\.0+)?$/.test(line.amount) ? (
          <StatusIndicator tone="neutral" icon="check" label={t('صفر', 'Zero')} />
        ) : (
          <StatusIndicator tone="info" icon="info" label={t('موجب', 'Positive')} />
        ),
    },
    {
      id: 'amount',
      header: t('المبلغ', 'Amount'),
      kind: 'amount',
      cell: (line) => <ExactAmount value={line.amount} currency={line.currency} />,
    },
  ];
  return (
    <Stack gap="section">
      <Alert
        tone="info"
        title={t(
          'عرض فقط: لا حسابات مالية في الواجهة',
          'Presentation only: no money is calculated in the UI',
        )}
      >
        {t(
          'المبالغ والإجماليات قيم مرجعية ثابتة كما لو وردت من الخادم؛ الإجمالي لكل عملة على حدة.',
          'Amounts and totals are fixed values as if returned by the server; totals are per currency.',
        )}
      </Alert>
      {outcome === 'conflict' && (
        <Alert
          tone="warning"
          announce
          title={t(
            'تغيّر هذا السجل أثناء تحريره. راجع التغييرات قبل الحفظ.',
            'This record changed while you were editing. Review the changes before saving.',
          )}
          actions={
            <>
              <Button size="small">{t('عرض التغييرات', 'View changes')}</Button>
              <Button size="small" variant="ghost" onClick={() => setOutcome('idle')}>
                {t('إعادة التحميل وإعادة التطبيق', 'Reload and reapply')}
              </Button>
            </>
          }
        >
          {t(
            'مسودتك محفوظة في هذه الشاشة ولن تُستبدل تلقائيًا.',
            'Your draft is kept on this screen and will not be overwritten automatically.',
          )}
        </Alert>
      )}
      {outcome === 'uncertain' && (
        <Alert
          tone="info"
          announce
          title={t(
            'لم نتمكن من تأكيد الحفظ بعد. جارٍ التحقق من النتيجة.',
            'We could not confirm the save yet. Checking the outcome.',
          )}
        >
          <Progress label={t('جارٍ التحقق من النتيجة…', 'Checking the outcome…')} />
        </Alert>
      )}
      <DataTable
        caption={t('مراجعة مستندات الفاتورة (تجريبي)', 'Invoice document review (demo)')}
        columns={columns}
        rows={LEDGER}
        getRowId={(line) => line.id}
        getRowLabel={(line) => line.id}
        empty={<EmptyState title={t('لا مستندات', 'No documents')} description="—" />}
      />
      <dl className="flex flex-col gap-actions items-end">
        {LEDGER_TOTALS.map((total) => (
          <div key={total.currency} className="flex gap-toolbar-groups items-baseline">
            <dt className="type-label">
              {t('الإجمالي', 'Total')} <TechnicalId>{total.currency}</TechnicalId>
            </dt>
            <dd className="type-subheading">
              <ExactAmount value={total.amount} currency={total.currency} />
            </dd>
          </div>
        ))}
      </dl>
      <FormActions>
        <Button onClick={() => setOutcome('conflict')}>
          {t('محاكاة تعارض', 'Simulate conflict')}
        </Button>
        <Button
          variant="primary"
          pending={outcome === 'uncertain'}
          pendingLabel={t('جارٍ التحقق…', 'Checking…')}
          onClick={() => setOutcome('uncertain')}
        >
          {t('اعتماد الفاتورة', 'Approve invoice')}
        </Button>
      </FormActions>
    </Stack>
  );
}

export function FinanceSection() {
  const t = useLabText();
  return (
    <Specimen
      id="finance-review"
      title={t('مراجعة مالية', 'Finance review')}
      description={t(
        'مبالغ دقيقة موقّعة، عملة صريحة، سالب وصفر ومفقود متمايزة، تعارض ونتيجة غير مؤكدة.',
        'Exact signed amounts, explicit currency, negative/zero/missing kept distinct, conflict and uncertain outcome.',
      )}
      flush
    >
      <FinanceProof />
    </Specimen>
  );
}
