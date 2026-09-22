import {
  Button,
  DataTable,
  ExactAmount,
  Field,
  FormActions,
  FormSection,
  Input,
  Page,
  PageHeader,
  StatusIndicator,
  Surface,
  TechnicalId,
  type TableColumn,
} from '@vertex-os/ui';
import { LEDGER, type LedgerLine } from '../fixtures';
import { useLabText } from '../lab-text';
import { Caption, Specimen, Stack } from '../specimen';

export function LayoutsSection() {
  const t = useLabText();
  return (
    <Stack gap="section">
      <Specimen
        id="page-widths"
        title={t('عروض الصفحات', 'Page widths')}
        description={t(
          'النموذج 720، القراءة 720، التفاصيل 1200، الفهارس بكامل العرض.',
          'Form 720, reading 720, detail 1200, indexes use the full width.',
        )}
        flush
      >
        <Stack>
          <Page width="form">
            <Surface>
              <FormSection title={t('نموذج بعرض 720', 'A 720px form')}>
                <div className="max-w-field">
                  <Field label={t('حقل قصير بعرض 480', 'Short field at 480px')}>
                    <Input defaultValue="" />
                  </Field>
                </div>
                <FormActions>
                  <Button>{t('إلغاء', 'Cancel')}</Button>
                  <Button variant="primary">{t('إنشاء الدور', 'Create role')}</Button>
                </FormActions>
              </FormSection>
            </Surface>
          </Page>
          <Page width="reading">
            <p className="type-body-long">
              {t(
                'محتوى القراءة الطويلة يلتزم بعرض 720 بكسل ليبقى السطر مريحًا للعين في اللغتين، مع ارتفاع سطر أوسع للتعليقات والموجزات.',
                'Long reading content keeps a 720px measure so lines stay comfortable in both languages, with a taller line box for comments and briefs.',
              )}
            </p>
          </Page>
        </Stack>
      </Specimen>
      <Specimen id="page-grammar" title={t('قواعد الصفحة', 'Page grammar')} flush>
        <Surface>
          <PageHeader
            headingLevel={3}
            title={t('عنوان صفحة تجريبي', 'Demo page title')}
            description={t(
              'العنوان في بداية السطر والإجراء الأساسي في نهايته.',
              'Title at inline-start, the primary action at inline-end.',
            )}
            actions={
              <>
                <Button>{t('تصدير', 'Export')}</Button>
                <Button variant="primary" icon="plus">
                  {t('إنشاء مشروع', 'Create project')}
                </Button>
              </>
            }
          />
        </Surface>
      </Specimen>
    </Stack>
  );
}

/** Printing uses the explicit Light presentation and drops interactive chrome (§40.2). */
export function PrintSection() {
  const t = useLabText();
  const columns: TableColumn<LedgerLine>[] = [
    {
      id: 'id',
      header: t('المستند', 'Document'),
      kind: 'identity',
      cell: (line) => <TechnicalId>{line.id}</TechnicalId>,
    },
    {
      id: 'status',
      header: t('الحالة', 'Status'),
      kind: 'status',
      cell: (line) =>
        line.amount === null ? (
          <StatusIndicator
            tone="warning"
            icon="alert-triangle"
            label={t('بانتظار التسعير', 'Awaiting pricing')}
          />
        ) : (
          <StatusIndicator tone="success" icon="check-circle" label={t('صادر', 'Issued')} />
        ),
    },
    {
      id: 'amount',
      header: t('المبلغ', 'Amount'),
      kind: 'amount',
      cell: (line) => <ExactAmount value={line.amount} currency={line.currency} />,
    },
    {
      id: 'actions',
      header: t('الإجراءات', 'Actions'),
      kind: 'actions',
      headerVisuallyHidden: true,
      cell: () => <Button size="small">{t('فتح', 'Open')}</Button>,
    },
  ];
  return (
    <Specimen
      id="print"
      title={t('عرض الطباعة', 'Print presentation')}
      description={t(
        'عرض واجهة فقط، وليس مستندًا ماليًا رسميًا.',
        'UI presentation only, never an official financial document.',
      )}
      flush
    >
      <Stack>
        <div className="flex items-center gap-actions" data-vx-print="omit">
          <Button icon="printer" onClick={() => window.print()}>
            {t('معاينة الطباعة', 'Print preview')}
          </Button>
          <Caption>
            {t(
              'يُطبع دائمًا بالمظهر الفاتح دون أزرار أو أدوات تصفية.',
              'Always prints Light, without buttons or filter controls.',
            )}
          </Caption>
        </div>
        <DataTable
          caption={t('ملخص المستندات للطباعة', 'Document summary for print')}
          columns={columns}
          rows={LEDGER}
          getRowId={(line) => line.id}
          getRowLabel={(line) => line.id}
          empty={null}
        />
      </Stack>
    </Specimen>
  );
}
