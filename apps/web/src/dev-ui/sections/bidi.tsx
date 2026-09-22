import {
  Bdi,
  DateText,
  ExactAmount,
  FileName,
  InstantText,
  LtrText,
  TechnicalId,
  useUiMessages,
} from '@vertex-os/ui';
import type { ReactNode } from 'react';
import { useLabText } from '../lab-text';
import { Specimen, Stack } from '../specimen';

function Case({ label, rule, children }: { label: string; rule: string; children: ReactNode }) {
  return (
    <tr className="border-b border-subtle">
      <th scope="row" className="py-actions pe-toolbar-groups text-start type-label align-top">
        {label}
      </th>
      <td className="py-actions pe-toolbar-groups">{children}</td>
      <td className="py-actions type-secondary text-secondary">{rule}</td>
    </tr>
  );
}

/** The §24.3 stress set plus long, vocalised and truncated content. */
export function BidiSection() {
  const t = useLabText();
  const messages = useUiMessages();
  return (
    <Stack gap="section">
      <Specimen
        id="bidi-cases"
        title={t('حالات النص ثنائي الاتجاه', 'Bidirectional cases')}
        description={t(
          'كل قيمة مدمجة معزولة؛ لا انعكاس للأرقام أو السلاسل.',
          'Every embedded value is isolated; no digit or string reversal.',
        )}
      >
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <th scope="col" className="type-table-heading text-secondary text-start">
                  {t('الحالة', 'Case')}
                </th>
                <th scope="col" className="type-table-heading text-secondary text-start">
                  {t('العرض', 'Rendering')}
                </th>
                <th scope="col" className="type-table-heading text-secondary text-start">
                  {t('القاعدة', 'Rule')}
                </th>
              </tr>
            </thead>
            <tbody>
              <Case
                label={t('معرّف تقني', 'Technical ID')}
                rule={t('معرّف LTR معزول', 'Isolated LTR ID')}
              >
                {t('المشروع:', 'Project:')} <TechnicalId>VX-2026-014</TechnicalId>
              </Case>
              <Case
                label={t('بريد إلكتروني', 'Email')}
                rule={t('LTR معزول قابل للنسخ', 'Isolated LTR, copyable')}
              >
                {t('تم إرسال الدعوة إلى', 'Invitation sent to')}{' '}
                <LtrText>user@example.test</LtrText>
              </Case>
              <Case
                label={t('اسم ملف', 'Filename')}
                rule={t('يُعزل الاسم كاملًا مع الامتداد', 'Whole name isolated, extension kept')}
              >
                {t('ملف الحملة', 'Campaign file')} <FileName name="Campaign-v2.pdf" />
              </Case>
              <Case
                label={t('هاتف', 'Phone')}
                rule={t('رقم واحد LTR مع علامة +', 'One LTR run including +')}
              >
                {t('الهاتف:', 'Phone:')} <LtrText>+90 555 010 0200</LtrText>
              </Case>
              <Case
                label={t('نسبة', 'Percentage')}
                rule={t('وحدة النسبة ضمن القيمة', 'Percent unit inside the value')}
              >
                {t('التقدم:', 'Progress:')} <LtrText>{messages.percentFormat(0.375)}</LtrText>
              </Case>
              <Case
                label={t('مبلغ سالب', 'Negative amount')}
                rule={t('الإشارة والعملة ضمن تشغيل واحد', 'Sign and currency in one run')}
              >
                {t('الرصيد:', 'Balance:')} <ExactAmount value="-1234.50" currency="USD" />
              </Case>
              <Case
                label={t('إصدار داخل علامات', 'Version in punctuation')}
                rule={t('عزل اللاتيني داخل الأقواس', 'Latin isolated inside brackets')}
              >
                {t('إصدار', 'Version')} (<Bdi>v2</Bdi>) — {t('مشروع تجريبي', 'demo project')}
              </Case>
              <Case
                label={t('تاريخ فقط', 'Date only')}
                rule={t('يوم + شهر + سنة، أرقام لاتينية', 'Day + month + year, Latin digits')}
              >
                <DateText value="2026-09-22" /> · <LtrText>2026-09-22</LtrText>
              </Case>
              <Case
                label={t('لحظة زمنية', 'Instant')}
                rule={t('المنطقة الزمنية ظاهرة (UTC عند غيابها)', 'Zone shown (UTC fallback)')}
              >
                <InstantText value="2026-09-22T21:30:00Z" />
              </Case>
              <Case
                label={t('اسم مستخدم مجهول الاتجاه', 'Name of unknown direction')}
                rule={t('عزل تلقائي', 'Auto isolation')}
              >
                {t('أسند إلى', 'Assigned to')} <Bdi>Lina Haddad (demo)</Bdi> {t('و', 'and')}{' '}
                <Bdi>عبد الرحمن بن ناصر الشهري</Bdi>
              </Case>
            </tbody>
          </table>
        </div>
      </Specimen>
      <Specimen id="bidi-long" title={t('نصوص طويلة واقتطاع', 'Long text and truncation')}>
        <Stack gap="actions">
          <p className="type-body-long">
            {t(
              'عنوان عربي طويل جدًا يلتف بدلًا من أن يُقص: مراجعة الموجز الإبداعي لحملة الخريف المشتركة بين الفرق الثلاثة قبل الاعتماد',
              'A very long English heading that wraps instead of clipping: review of the shared autumn campaign creative brief before approval',
            )}
          </p>
          <div className="max-w-secondary">
            <FileName name="تقرير أداء الحملة الموسع للربع الثالث Q3-performance-report-final-v7.xlsx" />
          </div>
        </Stack>
      </Specimen>
    </Stack>
  );
}
