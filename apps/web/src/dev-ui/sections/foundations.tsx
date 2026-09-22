import { DIRECTIONAL_ICONS, Icon, ICON_NAMES, TechnicalId, type IconSize } from '@vertex-os/ui';
import { useLabText } from '../lab-text';
import { Caption, Specimen, Stack } from '../specimen';
import {
  ChartSeries,
  ColorPairs,
  ColorRoles,
  FontFamilies,
  ShapeSpecimens,
  SpacingScale,
  TokenTable,
} from '../token-specimens';

const TYPE_ROLES = [
  ['type-page-title', 'عنوان الصفحة', 'Page title'],
  ['type-section-title', 'عنوان قسم', 'Section title'],
  ['type-subheading', 'عنوان فرعي', 'Subheading'],
  [
    'type-body-long',
    'نص القراءة الطويلة للملخصات والتعليقات.',
    'Long reading text for briefs and comments.',
  ],
  [
    'type-body',
    'النص التشغيلي الافتراضي وخلايا الجداول.',
    'Default operational text and table cells.',
  ],
  ['type-label', 'تسمية حقل أو زر', 'Field or button label'],
  ['type-secondary', 'نص مساعد وبيانات وصفية', 'Help text and metadata'],
  ['type-table-heading', 'عنوان عمود', 'Column heading'],
  ['type-metric', '1,284', '1,284'],
  ['type-code', 'VX-2026-014', 'VX-2026-014'],
] as const;

export function FoundationsSection() {
  const t = useLabText();
  return (
    <Stack gap="section">
      <Specimen
        id="color-roles"
        title={t('أدوار الألوان', 'Colour roles')}
        description={t(
          'القيم للمظهر الحالي؛ بدّل المظهر للمقارنة.',
          'Values for the current theme; switch theme to compare.',
        )}
      >
        <Stack>
          <ColorRoles prefix="color.background." title={t('الخلفيات', 'Backgrounds')} />
          <ColorRoles prefix="color.text." title={t('النصوص', 'Text')} />
          <ColorRoles prefix="color.border." title={t('الحدود', 'Borders')} />
          <ColorRoles prefix="color.action." title={t('الإجراءات', 'Actions')} />
          <ColorRoles prefix="color.state." title={t('الحالات التفاعلية', 'Interaction states')} />
          <ColorRoles
            prefix="color.status."
            title={t('نغمات الحالة الخمس', 'The five status tones')}
          />
          <ColorRoles
            prefix="color.brand."
            title={t('الهوية (ليست حالة)', 'Identity (never status)')}
          />
        </Stack>
      </Specimen>
      <Specimen id="color-pairs" title={t('أزواج النص والخلفية', 'Text and background pairs')}>
        <ColorPairs />
      </Specimen>
      <Specimen
        id="chart-series"
        title={t('سلاسل الرسوم البيانية', 'Chart series')}
        description={t(
          'ترتيب ثابت لمكوّن الرسوم المستقبلي (§37).',
          'Fixed order for the future chart component (§37).',
        )}
      >
        <ChartSeries />
      </Specimen>
      <Specimen
        id="typography"
        title={t('الطباعة', 'Typography')}
        description={t(
          'الأدوار نفسها في اللغتين؛ الكثافة لا تغيّر حجم الخط.',
          'The same roles in both languages; density never changes type.',
        )}
      >
        <ul className="flex flex-col gap-form-fields">
          {TYPE_ROLES.map(([role, ar, en]) => (
            <li key={role} className="flex flex-col gap-field-gap">
              <span className="type-secondary text-secondary">
                <TechnicalId>{role}</TechnicalId>
              </span>
              <span className={role}>{t(ar, en)}</span>
            </li>
          ))}
        </ul>
      </Specimen>
      <Specimen
        id="font-families"
        title={t('العائلات المسلَّمة', 'Delivered families')}
        description={t(
          'تشكيل عربي وحركات دون قص، وأرقام جدولية.',
          'Arabic shaping and diacritics without clipping; tabular figures.',
        )}
      >
        <Stack>
          <FontFamilies />
          <p className="type-body-long">
            {t('نص مشكول بالكامل:', 'Fully vocalised Arabic:')}{' '}
            <bdi lang="ar">
              تُراجِعُ الْمُصَمِّمَةُ الْإِصْدارَ الثّانِيَ قَبْلَ اعْتِمادِهِ نِهائِيًّا.
            </bdi>
          </p>
          <p className="type-body lining-nums tabular-nums">
            111,111.11 <br /> 888,888.88
          </p>
        </Stack>
      </Specimen>
      <Specimen id="spacing" title={t('المسافات', 'Spacing')}>
        <SpacingScale />
      </Specimen>
      <Specimen id="shape" title={t('الزوايا والارتفاع', 'Radius and elevation')}>
        <ShapeSpecimens />
      </Specimen>
      <Specimen id="geometry" title={t('الأحجام والحركة والطبقات', 'Sizes, motion and layers')}>
        <div className="grid gap-section wide:grid-cols-3">
          <TokenTable
            prefix="size."
            caption={t('الأحجام (تتغير مع الكثافة)', 'Sizes (vary with density)')}
          />
          <TokenTable prefix="motion." caption={t('الحركة', 'Motion')} />
          <TokenTable prefix="layer." caption={t('الطبقات', 'Layers')} />
        </div>
      </Specimen>
      <Specimen
        id="icons"
        title={t('الأيقونات', 'Icons')}
        description={t(
          'الأيقونات الاتجاهية فقط تنعكس في RTL.',
          'Only directional icons mirror in RTL.',
        )}
      >
        <Stack>
          <ul className="grid gap-actions medium:grid-cols-3 wide:grid-cols-4">
            {ICON_NAMES.map((name) => (
              <li key={name} className="flex items-center gap-icon-label">
                <span className="text-icon">
                  <Icon name={name} />
                </span>
                <TechnicalId>{name}</TechnicalId>
                {DIRECTIONAL_ICONS.includes(name) && (
                  <span className="type-secondary text-status-info">
                    {t('اتجاهية', 'directional')}
                  </span>
                )}
              </li>
            ))}
          </ul>
          <div className="flex items-end gap-section text-icon">
            {(['small', 'default', 'large', 'empty'] as const satisfies readonly IconSize[]).map(
              (size) => (
                <span key={size} className="flex flex-col items-center gap-field-gap">
                  <Icon name="check-circle" size={size} />
                  <Caption>{size}</Caption>
                </span>
              ),
            )}
          </div>
        </Stack>
      </Specimen>
    </Stack>
  );
}
