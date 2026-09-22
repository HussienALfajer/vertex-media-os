import { Breadcrumb, Pagination, Tabs, type PageSize } from '@vertex-os/ui';
import { useState } from 'react';
import { useLabText } from '../lab-text';
import { Caption, Specimen, Stack } from '../specimen';

export function NavigationSection() {
  const t = useLabText();
  const [tab, setTab] = useState('profile');
  const [autoTab, setAutoTab] = useState('week');
  const [page, setPage] = useState(2);
  const [size, setSize] = useState<PageSize>(25);
  const [cursor, setCursor] = useState(0);
  return (
    <Stack gap="section">
      <Specimen
        id="breadcrumb"
        title={t('مسار التنقل', 'Breadcrumb')}
        description={t(
          'التسلسل الهرمي لا السجل؛ تُطوى المستويات الوسطى على الشاشات الضيقة.',
          'Hierarchy, not history; middle levels collapse on narrow screens.',
        )}
      >
        <Breadcrumb
          items={[
            { label: t('الإدارة', 'Administration'), href: '/dev/ui/navigation' },
            { label: t('المستخدمون', 'Users'), href: '/dev/ui/navigation' },
            { label: t('الأقسام والأدوار', 'Departments and roles'), href: '/dev/ui/navigation' },
            { label: t('سارة الخطيب (تجريبي)', 'Sara Al-Khatib (demo)') },
          ]}
        />
      </Specimen>
      <Specimen
        id="tabs"
        title={t('علامات التبويب', 'Tabs')}
        description={t(
          'في RTL ينتقل السهم الأيسر إلى التبويب التالي منطقيًا.',
          'In RTL, ArrowLeft moves to the logically next tab.',
        )}
      >
        <Stack>
          <Tabs
            label={t('أقسام المستخدم', 'User sections')}
            value={tab}
            onValueChange={setTab}
            items={[
              {
                id: 'profile',
                label: t('الملف', 'Profile'),
                content: <p>{t('بيانات الملف الأساسية.', 'Basic profile details.')}</p>,
              },
              {
                id: 'roles',
                label: t('الأدوار', 'Roles'),
                content: (
                  <p>{t('الأدوار المسندة لهذا المستخدم.', 'Roles assigned to this user.')}</p>
                ),
              },
              {
                id: 'sessions',
                label: t('الجلسات', 'Sessions'),
                content: <p>{t('الجلسات النشطة.', 'Active sessions.')}</p>,
              },
              { id: 'audit', label: t('التدقيق', 'Audit'), content: null, disabled: true },
            ]}
          />
          <Caption>
            {t(
              'تفعيل تلقائي (المحتوى جاهز مسبقًا):',
              'Automatic activation (content already available):',
            )}
          </Caption>
          <Tabs
            label={t('الفترة', 'Period')}
            activation="automatic"
            value={autoTab}
            onValueChange={setAutoTab}
            items={[
              {
                id: 'week',
                label: t('هذا الأسبوع', 'This week'),
                content: <p>{t('7 مهام', '7 tasks')}</p>,
              },
              {
                id: 'month',
                label: t('هذا الشهر', 'This month'),
                content: <p>{t('31 مهمة', '31 tasks')}</p>,
              },
            ]}
          />
        </Stack>
      </Specimen>
      <Specimen id="pagination" title={t('ترقيم الصفحات', 'Pagination')}>
        <Stack>
          <Pagination
            mode="offset"
            page={page}
            pageSize={size}
            total={132}
            onPageChange={setPage}
            onPageSizeChange={(next) => {
              setSize(next);
              setPage(1);
            }}
          />
          <Caption>
            {t('ترقيم بالمؤشر: لا عدد صفحات مختلق.', 'Cursor pagination: no invented page count.')}
          </Caption>
          <Pagination
            mode="cursor"
            pageSize={25}
            hasPrevious={cursor > 0}
            hasNext={cursor < 2}
            onPrevious={() => setCursor((value) => value - 1)}
            onNext={() => setCursor((value) => value + 1)}
          />
        </Stack>
      </Specimen>
    </Stack>
  );
}
