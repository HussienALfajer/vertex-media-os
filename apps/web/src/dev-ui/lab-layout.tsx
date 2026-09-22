import { notFound, Outlet, useLocation } from '@tanstack/react-router';
import {
  AppShell,
  DisplayPreferences,
  Fieldset,
  Page,
  PageHeader,
  Radio,
  UiLink,
  useUiSettings,
  type NavigationGroup,
} from '@vertex-os/ui';
import { createElement } from 'react';
import { useLabText } from './lab-text';
import { LAB_GROUPS, LAB_SECTIONS } from './sections';
import { Specimen, Stack } from './specimen';

/** The design-system lab: synthetic navigation, never production navigation (DS-D026). */
export function LabLayout() {
  const t = useLabText();
  const settings = useUiSettings();
  const { pathname } = useLocation();
  const navigation: NavigationGroup[] = [
    {
      id: 'lab',
      items: [
        {
          id: 'overview',
          label: t('نظرة عامة', 'Overview'),
          href: '/dev/ui',
          icon: 'home',
          current: pathname === '/dev/ui' || pathname === '/dev/ui/',
        },
      ],
    },
    ...LAB_GROUPS.map((group) => ({
      id: group.id,
      label: t(...group.label),
      items: LAB_SECTIONS.filter((section) => section.group === group.id).map((section) => ({
        id: section.id,
        label: t(...section.title),
        href: `/dev/ui/${section.id}`,
        icon: section.icon,
        current: pathname === `/dev/ui/${section.id}`,
      })),
    })),
  ];
  const mode = [
    settings.language === 'ar' ? 'العربية · RTL' : 'English · LTR',
    settings.resolvedTheme === 'dark' ? t('داكن', 'Dark') : t('فاتح', 'Light'),
    settings.effectiveDensity === 'compact' ? t('مضغوطة', 'Compact') : t('افتراضية', 'Default'),
  ].join(' · ');
  return (
    <AppShell
      productName="Vertex OS"
      homeHref="/dev/ui"
      navigation={navigation}
      header={
        <span className="type-secondary">
          {t('مختبر نظام التصميم', 'Design system lab')} — {mode}
        </span>
      }
      utilities={<DisplayPreferences />}
    >
      <Outlet />
    </AppShell>
  );
}

function ModeControls() {
  const t = useLabText();
  const settings = useUiSettings();
  return (
    <div className="grid gap-form-fields medium:grid-cols-3">
      <Fieldset legend={t('اللغة والاتجاه', 'Language and direction')}>
        <Radio
          name="lab-language"
          value="ar"
          label="العربية (RTL)"
          checked={settings.language === 'ar'}
          onChange={() => settings.setPreferences({ language: 'ar' })}
        />
        <Radio
          name="lab-language"
          value="en"
          label="English (LTR)"
          checked={settings.language === 'en'}
          onChange={() => settings.setPreferences({ language: 'en' })}
        />
      </Fieldset>
      <Fieldset legend={t('المظهر', 'Theme')}>
        {(['system', 'light', 'dark'] as const).map((theme) => (
          <Radio
            key={theme}
            name="lab-theme"
            value={theme}
            label={
              {
                system: t('حسب النظام', 'Match system'),
                light: t('فاتح', 'Light'),
                dark: t('داكن', 'Dark'),
              }[theme]
            }
            checked={settings.theme === theme}
            onChange={() => settings.setPreferences({ theme })}
          />
        ))}
      </Fieldset>
      <Fieldset legend={t('الكثافة', 'Density')}>
        <Radio
          name="lab-density"
          value="default"
          label={t('افتراضية', 'Default')}
          checked={settings.density === 'default'}
          onChange={() => settings.setPreferences({ density: 'default' })}
        />
        <Radio
          name="lab-density"
          value="compact"
          label={t('مضغوطة', 'Compact')}
          checked={settings.density === 'compact'}
          onChange={() => settings.setPreferences({ density: 'compact' })}
        />
      </Fieldset>
    </div>
  );
}

export function LabOverview() {
  const t = useLabText();
  return (
    <Page width="detail">
      <PageHeader
        title={t('مختبر نظام التصميم', 'Design system lab')}
        description={t(
          'بيئة تحقق داخلية لنظام Vertex بالبيانات الاصطناعية فقط. ليست لوحة إنتاج ولا تطبيقًا تجاريًا.',
          'An internal verification environment for the Vertex system using synthetic data only. Not a production dashboard or business application.',
        )}
      />
      <Specimen
        id="modes"
        title={t('الأوضاع الثمانية', 'The eight modes')}
        description={t(
          'العربية/الإنجليزية × فاتح/داكن × افتراضية/مضغوطة.',
          'Arabic/English × Light/Dark × Default/Compact.',
        )}
      >
        <ModeControls />
      </Specimen>
      <Stack>
        {LAB_GROUPS.map((group) => (
          <section key={group.id} className="flex flex-col gap-actions">
            <h2 className="type-section-title">{t(...group.label)}</h2>
            <ul className="grid gap-toolbar-groups medium:grid-cols-2">
              {LAB_SECTIONS.filter((section) => section.group === group.id).map((section) => (
                <li key={section.id} className="flex flex-col gap-field-gap">
                  <UiLink href={`/dev/ui/${section.id}`}>{t(...section.title)}</UiLink>
                  <span className="type-secondary text-secondary">{t(...section.description)}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </Stack>
    </Page>
  );
}

export function LabSectionPage({ id }: { id: string }) {
  const t = useLabText();
  const section = LAB_SECTIONS.find((entry) => entry.id === id);
  if (!section) throw notFound();
  return (
    <Page>
      <PageHeader title={t(...section.title)} description={t(...section.description)} />
      {createElement(section.component)}
    </Page>
  );
}
