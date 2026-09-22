import { Button, ButtonGroup, IconButton, TechnicalId, type ButtonVariant } from '@vertex-os/ui';
import { useState } from 'react';
import { useLabText } from '../lab-text';
import { Caption, Row, Specimen, Stack } from '../specimen';

const VARIANTS: readonly (ButtonVariant & { key: string })[] = [
  { key: 'primary', variant: 'primary' },
  { key: 'secondary', variant: 'secondary' },
  { key: 'ghost', variant: 'ghost' },
  { key: 'primary-danger', variant: 'primary', intent: 'danger' },
  { key: 'ghost-danger', variant: 'ghost', intent: 'danger' },
];

export function ActionsSection() {
  const t = useLabText();
  const [pending, setPending] = useState(false);
  return (
    <Stack gap="section">
      <Specimen
        id="button-matrix"
        title={t('الأزرار: الأنواع والحالات', 'Buttons: variants and states')}
        description={t(
          'الأساسي للالتزام، الثانوي للبدائل، الهادئ للإجراءات الثالثة. لا متغير ذهبي.',
          'Primary commits, secondary for alternatives, ghost for tertiary actions. No gold variant.',
        )}
      >
        <table className="w-full">
          <thead>
            <tr>
              {[
                t('النوع', 'Variant'),
                t('عادي', 'Rest'),
                t('معطّل', 'Disabled'),
                t('قيد التنفيذ', 'Pending'),
              ].map((heading) => (
                <th
                  key={heading}
                  scope="col"
                  className="type-table-heading text-secondary text-start pb-actions"
                >
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {VARIANTS.map(({ key, ...variant }) => (
              <tr key={key}>
                <th
                  scope="row"
                  className="type-secondary text-secondary text-start py-actions pe-toolbar-groups"
                >
                  <TechnicalId>{key}</TechnicalId>
                </th>
                <td className="py-actions pe-toolbar-groups">
                  <Button
                    {...variant}
                    {...(key.includes('danger') ? { icon: 'trash' as const } : {})}
                  >
                    {key.includes('danger')
                      ? t('تعطيل المستخدم', 'Disable user')
                      : t('حفظ التغييرات', 'Save changes')}
                  </Button>
                </td>
                <td className="py-actions pe-toolbar-groups">
                  <Button {...variant} disabled>
                    {t('غير متاح', 'Unavailable')}
                  </Button>
                </td>
                <td className="py-actions">
                  <Button {...variant} pending pendingLabel={t('جارٍ الحفظ…', 'Saving…')}>
                    {t('حفظ التغييرات', 'Save changes')}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Specimen>
      <Specimen id="button-sizes" title={t('الأحجام والأيقونات', 'Sizes and icons')}>
        <Stack>
          <Row>
            <Button size="small">{t('صغير', 'Small')}</Button>
            <Button>{t('متوسط', 'Medium')}</Button>
            <Button size="large" variant="primary">
              {t('كبير', 'Large')}
            </Button>
            <Button icon="plus" variant="primary">
              {t('دعوة مستخدم', 'Invite user')}
            </Button>
            <Button trailingIcon="chevron-end">{t('التالي', 'Next')}</Button>
          </Row>
          <Row>
            <IconButton
              icon="more"
              label={t('إجراءات المشروع التجريبي', 'Actions for the demo project')}
            />
            <IconButton icon="copy" variant="secondary" label={t('نسخ المعرّف', 'Copy ID')} />
            <IconButton
              icon="trash"
              intent="danger"
              label={t('حذف المسودة التجريبية', 'Delete the demo draft')}
            />
            <IconButton icon="refresh" size="small" label={t('تحديث', 'Refresh')} />
            <IconButton icon="refresh" pending label={t('جارٍ التحديث', 'Refreshing')} />
          </Row>
          <Caption>
            {t('الأيقونات الاتجاهية تنعكس في RTL فقط.', 'Directional icons mirror only in RTL.')}
          </Caption>
        </Stack>
      </Specimen>
      <Specimen
        id="button-behaviour"
        title={t('السلوك: الانتظار والتجميع والالتفاف', 'Behaviour: pending, grouping, wrapping')}
      >
        <Stack>
          <Row>
            <Button
              variant="primary"
              pending={pending}
              pendingLabel={t('جارٍ الحفظ…', 'Saving…')}
              onClick={() => {
                setPending(true);
                window.setTimeout(() => setPending(false), 1500);
              }}
            >
              {t('حفظ التغييرات', 'Save changes')}
            </Button>
            <Caption>
              {t(
                'العرض ثابت والتركيز باقٍ والتكرار ممنوع.',
                'Width stays, focus stays, repeats are refused.',
              )}
            </Caption>
          </Row>
          <ButtonGroup label={t('عرض النتائج', 'Result view')}>
            <Button>{t('قائمة', 'List')}</Button>
            <Button>{t('جدول', 'Table')}</Button>
            <Button>{t('تقويم', 'Calendar')}</Button>
          </ButtonGroup>
          <div className="max-w-secondary">
            <Button variant="secondary">
              {t(
                'إرسال الموجز الإبداعي إلى فريق المراجعة المشترك للموافقة النهائية',
                'Send the creative brief to the joint review team for final approval',
              )}
            </Button>
          </div>
        </Stack>
      </Specimen>
    </Stack>
  );
}
