import {
  Bdi,
  Breadcrumb,
  Button,
  DateText,
  DescriptionList,
  DropdownMenu,
  FileName,
  IconButton,
  Inspector,
  InspectorLayout,
  InstantText,
  RecordHeader,
  StatusIndicator,
  Tabs,
  TechnicalId,
} from '@vertex-os/ui';
import { useState } from 'react';
import { useLabText } from '../lab-text';
import { Specimen, Stack } from '../specimen';

export function ProjectsProof() {
  const t = useLabText();
  const [tab, setTab] = useState('assets');
  const [inspecting, setInspecting] = useState(true);
  const assets = [
    { id: 'ast-1', name: 'ملف الحملة Campaign-v2.pdf', version: 'v2', state: 'review' as const },
    {
      id: 'ast-2',
      name: 'Autumn-hero-banner-final-final-v5.psd',
      version: 'v5',
      state: 'approved' as const,
    },
  ];
  return (
    <Stack gap="section">
      <RecordHeader
        headingLevel={3}
        breadcrumb={
          <Breadcrumb
            items={[
              { label: t('المشاريع', 'Projects'), href: '/dev/ui/projects' },
              { label: t('حملة الخريف التجريبية', 'Demo autumn campaign') },
            ]}
          />
        }
        title={t('حملة الخريف التجريبية', 'Demo autumn campaign')}
        description={t(
          'مشروع اصطناعي لإثبات أنماط العرض فقط.',
          'A synthetic project to prove presentation patterns only.',
        )}
        identifier={<TechnicalId>VX-2026-014</TechnicalId>}
        statuses={
          <>
            <StatusIndicator tone="info" icon="progress" label={t('قيد التنفيذ', 'In progress')} />
            <StatusIndicator
              tone="warning"
              icon="alert-triangle"
              label={t('موعد التسليم خلال يومين', 'Due in two days')}
            />
          </>
        }
        actions={
          <>
            <Button variant="primary">{t('طلب مراجعة', 'Request review')}</Button>
            <DropdownMenu
              trigger={
                <IconButton
                  icon="more"
                  variant="secondary"
                  label={t('إجراءات المشروع التجريبي', 'Actions for the demo project')}
                />
              }
              items={[
                {
                  id: 'duplicate',
                  label: t('نسخ المشروع', 'Duplicate project'),
                  onSelect: () => undefined,
                },
                {
                  id: 'archive',
                  label: t('أرشفة المشروع', 'Archive project'),
                  intent: 'danger',
                  onSelect: () => undefined,
                },
              ]}
            />
          </>
        }
        metadata={
          <DescriptionList
            items={[
              { term: t('المسؤول', 'Owner'), details: <Bdi>سارة الخطيب (تجريبي)</Bdi> },
              { term: t('العميل', 'Client'), details: <Bdi>Northwind Demo Studio</Bdi> },
              { term: t('تاريخ التسليم', 'Due date'), details: <DateText value="2026-09-24" /> },
            ]}
          />
        }
      />
      <Tabs
        label={t('أقسام المشروع', 'Project sections')}
        value={tab}
        onValueChange={setTab}
        items={[
          {
            id: 'assets',
            label: t('الأصول الرقمية', 'Digital assets'),
            content: (
              <InspectorLayout
                inspector={
                  inspecting && (
                    <Inspector
                      title={t('تفاصيل الأصل', 'Asset details')}
                      onClose={() => setInspecting(false)}
                    >
                      <DescriptionList
                        items={[
                          {
                            term: t('الملف', 'File'),
                            details: <FileName name="ملف الحملة Campaign-v2.pdf" />,
                          },
                          {
                            term: t('الإصدار', 'Version'),
                            details: (
                              <>
                                {t('إصدار', 'Version')} (<Bdi>v2</Bdi>) —{' '}
                                {t('مشروع تجريبي', 'demo project')}
                              </>
                            ),
                          },
                          {
                            term: t('المراجعة', 'Review'),
                            details: (
                              <StatusIndicator
                                tone="info"
                                icon="clock"
                                label={t('بانتظار المراجعة', 'Awaiting review')}
                              />
                            ),
                          },
                          {
                            term: t('رفعه', 'Uploaded by'),
                            details: <Bdi>Omar Farouk (demo)</Bdi>,
                          },
                          {
                            term: t('وقت الرفع', 'Uploaded at'),
                            details: <InstantText value="2026-09-21T10:15:00Z" />,
                          },
                          {
                            term: t('الإصدار السابق', 'Previous version'),
                            details: t(
                              'معتمد (v1) — لا ينتقل الاعتماد إلى v2',
                              'Approved (v1) — approval does not carry to v2',
                            ),
                          },
                        ]}
                      />
                    </Inspector>
                  )
                }
              >
                <ul className="flex flex-col gap-actions">
                  {assets.map((asset) => (
                    <li key={asset.id} className="flex flex-wrap items-center gap-actions">
                      <FileName name={asset.name} />
                      <TechnicalId>{asset.version}</TechnicalId>
                      {asset.state === 'approved' ? (
                        <StatusIndicator
                          tone="success"
                          icon="check"
                          label={t('معتمد', 'Approved')}
                        />
                      ) : (
                        <StatusIndicator
                          tone="info"
                          icon="clock"
                          label={t('بانتظار المراجعة', 'Awaiting review')}
                        />
                      )}
                      <Button size="small" variant="ghost" onClick={() => setInspecting(true)}>
                        {t('فحص', 'Inspect')}
                      </Button>
                    </li>
                  ))}
                </ul>
              </InspectorLayout>
            ),
          },
          {
            id: 'brief',
            label: t('موجز العمل', 'Brief'),
            content: (
              <p className="type-body-long max-w-reading">
                {t('موجز اصطناعي للقراءة الطويلة.', 'A synthetic brief for long reading.')}
              </p>
            ),
          },
        ]}
      />
    </Stack>
  );
}

export function ProjectsSection() {
  const t = useLabText();
  return (
    <Specimen
      id="project-record"
      title={t('سجل مشروع مع مفتش', 'Project record with inspector')}
      description={t(
        'المفتش غير نمطي، ويتكدس عندما يقل العمود الأساسي عن 560 بكسل.',
        'The inspector is nonmodal and stacks when the primary column would fall below 560px.',
      )}
      flush
    >
      <ProjectsProof />
    </Specimen>
  );
}
