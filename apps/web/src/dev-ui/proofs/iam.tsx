import {
  Alert,
  AlertDialog,
  Bdi,
  BulkActionBar,
  Button,
  Checkbox,
  DataTable,
  DialogCancel,
  Dialog,
  DropdownMenu,
  EmptyState,
  Field,
  FilterBar,
  Fieldset,
  FormActions,
  FormSection,
  IconButton,
  InstantText,
  LtrText,
  NoResultsState,
  SearchInput,
  Select,
  StatusIndicator,
  TableToolbar,
  TechnicalId,
  TwoLineCell,
  useTableSelection,
  useUiSettings,
  type TableColumn,
  type TableSort,
} from '@vertex-os/ui';
import { useMemo, useState } from 'react';
import {
  ACCESS_STATES,
  INITIAL_ROLE_PERMISSIONS,
  PERMISSION_GROUPS,
  PROVISIONING_STATES,
  USERS,
  type AccessState,
  type DirectoryUser,
} from '../fixtures';
import { useLabText } from '../lab-text';
import { Specimen, Stack } from '../specimen';

function UserDirectory() {
  const t = useLabText();
  const { language } = useUiSettings();
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [access, setAccess] = useState<AccessState | 'all'>('all');
  const [sort, setSort] = useState<TableSort>(null);
  const [disabling, setDisabling] = useState<DirectoryUser | null>(null);
  const rows = useMemo(() => {
    const filtered = USERS.filter(
      (user) =>
        (access === 'all' || user.access === access) &&
        (query === '' || user.name.includes(query) || user.email.includes(query)),
    );
    if (sort?.columnId === 'name')
      filtered.sort(
        (a, b) =>
          a.name.localeCompare(b.name, language) * (sort.direction === 'ascending' ? 1 : -1),
      );
    return filtered;
  }, [access, query, sort, language]);
  const selection = useTableSelection({
    queryContext: `${query}|${access}`,
    isSelectable: (id) => USERS.find((user) => user.id === id)?.access !== 'TERMINATED',
  });
  const status = (
    mapping:
      | (typeof ACCESS_STATES)[AccessState]
      | (typeof PROVISIONING_STATES)[keyof typeof PROVISIONING_STATES],
  ) => <StatusIndicator tone={mapping.tone} icon={mapping.icon} label={mapping.label[language]} />;
  const columns: TableColumn<DirectoryUser>[] = [
    {
      id: 'name',
      header: t('المستخدم', 'User'),
      kind: 'identity',
      sortable: true,
      cell: (user) => (
        <TwoLineCell primary={<Bdi>{user.name}</Bdi>} secondary={<LtrText>{user.email}</LtrText>} />
      ),
    },
    {
      id: 'department',
      header: t('القسم', 'Department'),
      kind: 'text',
      cell: (user) => user.department[language],
    },
    {
      id: 'access',
      header: t('حالة الوصول', 'Access'),
      kind: 'status',
      cell: (user) => status(ACCESS_STATES[user.access]),
    },
    {
      id: 'provisioning',
      header: t('مزامنة الهوية', 'Identity sync'),
      kind: 'status',
      cell: (user) => status(PROVISIONING_STATES[user.provisioning]),
    },
    {
      id: 'activity',
      header: t('آخر نشاط', 'Last activity'),
      kind: 'date',
      cell: (user) =>
        user.lastActivity ? (
          <InstantText value={user.lastActivity} />
        ) : (
          <span className="text-secondary">{t('لم يسجّل الدخول بعد', 'Not signed in yet')}</span>
        ),
    },
    {
      id: 'actions',
      header: t('الإجراءات', 'Actions'),
      kind: 'actions',
      headerVisuallyHidden: true,
      cell: (user) => (
        <DropdownMenu
          trigger={
            <IconButton
              icon="more"
              size="small"
              label={t(`إجراءات ${user.name}`, `Actions for ${user.name}`)}
            />
          }
          items={[
            {
              id: 'view',
              label: t('عرض الملف', 'View profile'),
              icon: 'user',
              onSelect: () => undefined,
            },
            {
              id: 'roles',
              label: t('إسناد الأدوار', 'Assign roles'),
              icon: 'shield',
              onSelect: () => undefined,
            },
            ...(user.provisioning === 'FAILED'
              ? [
                  {
                    id: 'retry',
                    label: t('إعادة محاولة المزامنة', 'Retry identity sync'),
                    icon: 'refresh' as const,
                    onSelect: () => undefined,
                  },
                ]
              : []),
            {
              id: 'disable',
              label: t('تعطيل المستخدم', 'Disable user'),
              intent: 'danger' as const,
              disabled: user.access === 'DISABLED' || user.access === 'TERMINATED',
              onSelect: () => setDisabling(user),
            },
          ]}
        />
      ),
    },
  ];
  const filters =
    access === 'all'
      ? []
      : [
          {
            id: 'access',
            label: `${t('حالة الوصول', 'Access')}: ${ACCESS_STATES[access].label[language]}`,
            onRemove: () => setAccess('all'),
          },
        ];
  const pageIds = rows.map((user) => user.id);
  return (
    <div className="flex flex-col gap-toolbar-groups">
      <TableToolbar
        search={
          <Field label={t('البحث في المستخدمين', 'Search users')}>
            <SearchInput value={search} onValueChange={setSearch} onSearch={setQuery} />
          </Field>
        }
        filters={
          <FilterBar active={filters} onClearAll={() => setAccess('all')}>
            <Field label={t('حالة الوصول', 'Access status')}>
              <Select
                value={access}
                onChange={(event) => setAccess(event.currentTarget.value as AccessState | 'all')}
              >
                <option value="all">{t('الكل', 'All')}</option>
                {(Object.keys(ACCESS_STATES) as AccessState[]).map((state) => (
                  <option key={state} value={state}>
                    {ACCESS_STATES[state].label[language]}
                  </option>
                ))}
              </Select>
            </Field>
          </FilterBar>
        }
        actions={
          <Button variant="primary" icon="plus">
            {t('دعوة مستخدم', 'Invite user')}
          </Button>
        }
        bulkActions={
          selection.selected.size > 0 ? (
            <BulkActionBar selection={selection} pageIds={pageIds}>
              <Button size="small">{t('إسناد دور', 'Assign role')}</Button>
              <Button size="small" variant="ghost" intent="danger">
                {t('إيقاف الوصول مؤقتًا', 'Suspend access')}
              </Button>
            </BulkActionBar>
          ) : undefined
        }
      />
      <DataTable
        caption={t('دليل المستخدمين', 'User directory')}
        columns={columns}
        rows={rows}
        getRowId={(user) => user.id}
        getRowLabel={(user) => user.name}
        sort={sort}
        onSortChange={setSort}
        selection={selection}
        empty={
          query || access !== 'all' ? (
            <NoResultsState
              onClearFilters={() => {
                setSearch('');
                setQuery('');
                setAccess('all');
              }}
            />
          ) : (
            <EmptyState
              title={t('لا يوجد مستخدمون بعد', 'No users yet')}
              description={t('ادعُ أول عضو في الفريق.', 'Invite the first team member.')}
            />
          )
        }
      />
      <AlertDialog
        open={disabling !== null}
        onOpenChange={(open) => {
          if (!open) setDisabling(null);
        }}
        title={t('تعطيل المستخدم؟', 'Disable user?')}
        description={t(
          'لن يتمكن من تسجيل الدخول وتُنهى جلساته. لا يُحذف السجل ويمكن إعادة التفعيل.',
          'They cannot sign in and their sessions end. The record is kept and access can be restored.',
        )}
        confirmLabel={t('تعطيل المستخدم', 'Disable user')}
        onConfirm={() => setDisabling(null)}
      >
        {disabling && (
          <p>
            <Bdi>{disabling.name}</Bdi> — <LtrText>{disabling.email}</LtrText> ·{' '}
            <TechnicalId>{disabling.id}</TechnicalId>
          </p>
        )}
      </AlertDialog>
    </div>
  );
}

function RolePermissionForm() {
  const t = useLabText();
  const { language } = useUiSettings();
  const [granted, setGranted] = useState<ReadonlySet<string>>(INITIAL_ROLE_PERMISSIONS);
  const [reviewing, setReviewing] = useState(false);
  const [saved, setSaved] = useState(false);
  const added = [...granted].filter((code) => !INITIAL_ROLE_PERMISSIONS.has(code));
  const removed = [...INITIAL_ROLE_PERMISSIONS].filter((code) => !granted.has(code));
  const privileged = new Set(
    PERMISSION_GROUPS.flatMap((group) =>
      group.permissions.filter((p) => p.privileged).map((p) => p.code),
    ),
  );
  const labelOf = (code: string) =>
    PERMISSION_GROUPS.flatMap((group) => group.permissions).find(
      (permission) => permission.code === code,
    )?.label[language] ?? code;
  const toggle = (codes: readonly string[], on: boolean) =>
    setGranted((current) => {
      const next = new Set(current);
      for (const code of codes) {
        if (on) next.add(code);
        else next.delete(code);
      }
      return next;
    });
  const changes = added.length + removed.length;
  return (
    <form
      className="flex flex-col gap-form-sections max-w-form"
      onSubmit={(event) => {
        event.preventDefault();
        setReviewing(true);
      }}
    >
      {saved && (
        <Alert
          tone="success"
          title={t('تم حفظ الصلاحيات (محاكاة)', 'Permissions saved (simulated)')}
          announce
        />
      )}
      <FormSection
        title={t('صلاحيات دور «مدير المحتوى»', 'Permissions of the “Content manager” role')}
        description={t(
          'تجريبي: لا يُحفظ أي دور. التغيير يمر بمراجعة صريحة.',
          'Demo: no role is saved. Changes go through an explicit review.',
        )}
      >
        {PERMISSION_GROUPS.map((group) => {
          const codes = group.permissions.map((permission) => permission.code);
          const count = codes.filter((code) => granted.has(code)).length;
          return (
            <Fieldset key={group.id} legend={group.label[language]}>
              <Checkbox
                label={t(`كل صلاحيات ${group.label.ar}`, `All ${group.label.en} permissions`)}
                checked={count === codes.length}
                mixed={count > 0 && count < codes.length}
                onChange={(event) => toggle(codes, event.currentTarget.checked)}
              />
              <div className="flex flex-col gap-field-gap ps-section">
                {group.permissions.map((permission) => (
                  <Checkbox
                    key={permission.code}
                    label={permission.label[language]}
                    description={
                      <>
                        <TechnicalId>{permission.code}</TechnicalId>
                        {permission.privileged && ` · ${t('ذات امتيازات', 'privileged')}`}
                      </>
                    }
                    checked={granted.has(permission.code)}
                    onChange={(event) => toggle([permission.code], event.currentTarget.checked)}
                  />
                ))}
              </div>
            </Fieldset>
          );
        })}
      </FormSection>
      <FormActions>
        <Button
          type="button"
          onClick={() => setGranted(INITIAL_ROLE_PERMISSIONS)}
          disabled={changes === 0}
        >
          {t('تجاهل التغييرات', 'Discard changes')}
        </Button>
        <Button type="submit" variant="primary" disabled={changes === 0}>
          {t('مراجعة التغييرات', 'Review changes')}
        </Button>
      </FormActions>
      <Dialog
        open={reviewing}
        onOpenChange={setReviewing}
        title={t('مراجعة تغييرات الصلاحيات', 'Review permission changes')}
        description={t(
          'تُطبَّق على كل من يحمل هذا الدور.',
          'Applies to everyone who holds this role.',
        )}
        actions={
          <>
            <DialogCancel>{t('متابعة التحرير', 'Continue editing')}</DialogCancel>
            <Button
              variant="primary"
              onClick={() => {
                setReviewing(false);
                setSaved(true);
              }}
            >
              {t('حفظ الصلاحيات', 'Save permissions')}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-form-fields">
          {added.some((code) => privileged.has(code)) && (
            <Alert
              tone="warning"
              title={t(
                'يمنح هذا التغيير صلاحيات ذات امتيازات.',
                'This change grants privileged permissions.',
              )}
            />
          )}
          {added.length > 0 && (
            <div className="flex flex-col gap-field-gap">
              <h3 className="type-label">{t('ستُضاف', 'Will be added')}</h3>
              <ul className="flex flex-col gap-field-gap">
                {added.map((code) => (
                  <li key={code}>
                    {labelOf(code)} — <TechnicalId>{code}</TechnicalId>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {removed.length > 0 && (
            <div className="flex flex-col gap-field-gap">
              <h3 className="type-label">{t('ستُزال', 'Will be removed')}</h3>
              <ul className="flex flex-col gap-field-gap">
                {removed.map((code) => (
                  <li key={code}>
                    {labelOf(code)} — <TechnicalId>{code}</TechnicalId>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </Dialog>
    </form>
  );
}

export function IamProof() {
  const t = useLabText();
  return (
    <Stack gap="section">
      <Alert
        tone="info"
        title={t(
          'سيناريو إثبات بصري ببيانات اصطناعية',
          'Visual proof scenario with synthetic data',
        )}
      >
        {t(
          'لا يستدعي أي واجهة برمجية، ولا يطبّق منطق IAM؛ التطبيق الحقيقي يبدأ بعد إغلاق نظام التصميم.',
          'It calls no API and implements no IAM logic; the real module starts after the design system closes.',
        )}
      </Alert>
      <Specimen
        id="iam-directory"
        title={t('دليل المستخدمين', 'User directory')}
        description={t(
          'حالة الوصول ومزامنة الهوية حقيقتان منفصلتان بتسميتين مستقلتين.',
          'Access and identity sync are separate facts with separate labels.',
        )}
        flush
      >
        <UserDirectory />
      </Specimen>
      <Specimen
        id="iam-permissions"
        title={t('محرر صلاحيات الدور', 'Role permission editor')}
        description={t(
          'مجموعات مختلطة الحالة، ومراجعة صريحة قبل الحفظ، دون حفظ تلقائي.',
          'Mixed-state groups and an explicit review before saving; never autosaved.',
        )}
      >
        <RolePermissionForm />
      </Specimen>
    </Stack>
  );
}
