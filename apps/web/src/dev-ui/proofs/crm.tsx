import {
  Bdi,
  Breadcrumb,
  Button,
  DataTable,
  DateText,
  Field,
  FilterBar,
  NoResultsState,
  EmptyState,
  SearchInput,
  Select,
  StatusIndicator,
  TableToolbar,
  UiLink,
  useUiSettings,
  type TableColumn,
} from '@vertex-os/ui';
import { useState } from 'react';
import { CLIENT_STAGES, CLIENTS, type Client } from '../fixtures';
import { useLabText } from '../lab-text';
import { Caption, Specimen, Stack } from '../specimen';

export function CrmProof() {
  const t = useLabText();
  const { language } = useUiSettings();
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [stage, setStage] = useState<Client['stage'] | 'all'>('opportunity');
  const [owner, setOwner] = useState<string | 'all'>('all');
  const [opened, setOpened] = useState<Client | null>(null);
  const rows = CLIENTS.filter(
    (client) =>
      (stage === 'all' || client.stage === stage) &&
      (owner === 'all' || client.owner === owner) &&
      (query === '' || client.name.includes(query)),
  );
  const owners = [...new Set(CLIENTS.map((client) => client.owner))];
  const active = [
    ...(stage === 'all'
      ? []
      : [
          {
            id: 'stage',
            label: `${t('المرحلة', 'Stage')}: ${CLIENT_STAGES[stage].label[language]}`,
            onRemove: () => setStage('all'),
          },
        ]),
    ...(owner === 'all'
      ? []
      : [
          {
            id: 'owner',
            label: `${t('المسؤول', 'Owner')}: ${owner}`,
            onRemove: () => setOwner('all'),
          },
        ]),
    ...(query === ''
      ? []
      : [
          {
            id: 'query',
            label: `${t('البحث', 'Search')}: ${query}`,
            onRemove: () => {
              setSearch('');
              setQuery('');
            },
          },
        ]),
  ];
  const clear = () => {
    setStage('all');
    setOwner('all');
    setSearch('');
    setQuery('');
  };
  const columns: TableColumn<Client>[] = [
    {
      id: 'name',
      header: t('الجهة', 'Organisation'),
      kind: 'identity',
      cell: (client) => (
        // A real link (new tab, copy link); the lab opens the synthetic detail in place.
        <UiLink
          href={`/dev/ui/crm#${client.id}`}
          onClick={(event) => {
            event.preventDefault();
            setOpened(client);
          }}
        >
          <Bdi>{client.name}</Bdi>
        </UiLink>
      ),
    },
    {
      id: 'stage',
      header: t('المرحلة', 'Stage'),
      kind: 'status',
      cell: (client) => {
        const mapping = CLIENT_STAGES[client.stage];
        return (
          <StatusIndicator
            tone={mapping.tone}
            icon={mapping.icon}
            label={mapping.label[language]}
          />
        );
      },
    },
    {
      id: 'owner',
      header: t('المسؤول', 'Owner'),
      kind: 'text',
      cell: (client) => <Bdi>{client.owner}</Bdi>,
    },
    {
      id: 'city',
      header: t('المدينة', 'City'),
      kind: 'text',
      cell: (client) => client.city[language],
    },
    {
      id: 'updated',
      header: t('آخر تحديث', 'Last updated'),
      kind: 'date',
      cell: (client) => <DateText value={client.updated} />,
    },
  ];
  if (opened)
    return (
      <Stack gap="section">
        <Breadcrumb
          items={[{ label: t('العملاء', 'Clients'), href: '/dev/ui/crm' }, { label: opened.name }]}
        />
        <Specimen
          id="crm-return"
          title={t('سياق العودة المحفوظ', 'Preserved return context')}
          description={t(
            'العودة إلى القائمة تحتفظ بعوامل التصفية والبحث (عرض فقط).',
            'Returning keeps filters and search (presentation only).',
          )}
        >
          <Stack gap="actions">
            <p className="type-subheading">
              <Bdi>{opened.name}</Bdi>
            </p>
            <Caption>
              {t('عوامل التصفية المحفوظة:', 'Preserved filters:')}{' '}
              {active.length === 0
                ? t('لا يوجد', 'none')
                : active.map((filter) => filter.label).join('، ')}
            </Caption>
            <div>
              <Button icon="arrow-start" onClick={() => setOpened(null)}>
                {t(`العودة إلى النتائج (${rows.length})`, `Back to results (${rows.length})`)}
              </Button>
            </div>
          </Stack>
        </Specimen>
      </Stack>
    );
  return (
    <Stack gap="section">
      <Specimen
        id="crm-list"
        title={t('قائمة عملاء مصفّاة', 'Filtered client list')}
        description={t(
          'جرّب مرحلة «عميل» مع المسؤول «Omar Farouk (demo)» لرؤية حالة لا نتائج.',
          'Try stage “Client” with owner “Omar Farouk (demo)” to see the no-results state.',
        )}
        flush
      >
        <div className="flex flex-col gap-toolbar-groups">
          <TableToolbar
            search={
              <Field label={t('البحث في العملاء', 'Search clients')}>
                <SearchInput value={search} onValueChange={setSearch} onSearch={setQuery} />
              </Field>
            }
            filters={
              <FilterBar active={active} onClearAll={clear}>
                <Field label={t('المرحلة', 'Stage')}>
                  <Select
                    value={stage}
                    onChange={(event) =>
                      setStage(event.currentTarget.value as Client['stage'] | 'all')
                    }
                  >
                    <option value="all">{t('الكل', 'All')}</option>
                    {(Object.keys(CLIENT_STAGES) as Client['stage'][]).map((value) => (
                      <option key={value} value={value}>
                        {CLIENT_STAGES[value].label[language]}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label={t('المسؤول', 'Owner')}>
                  <Select value={owner} onChange={(event) => setOwner(event.currentTarget.value)}>
                    <option value="all">{t('الكل', 'All')}</option>
                    {owners.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </Select>
                </Field>
              </FilterBar>
            }
          />
          <DataTable
            caption={t('العملاء والفرص', 'Clients and opportunities')}
            columns={columns}
            rows={rows}
            getRowId={(client) => client.id}
            getRowLabel={(client) => client.name}
            empty={
              active.length > 0 ? (
                <NoResultsState onClearFilters={clear} />
              ) : (
                <EmptyState
                  title={t('لا يوجد عملاء بعد', 'No clients yet')}
                  description={t('أضف أول جهة.', 'Add the first organisation.')}
                />
              )
            }
          />
        </div>
      </Specimen>
    </Stack>
  );
}
