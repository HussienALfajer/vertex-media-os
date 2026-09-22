import {
  AlertDialog,
  Bdi,
  Button,
  Checkbox,
  Dialog,
  DialogCancel,
  Drawer,
  DropdownMenu,
  Field,
  Fieldset,
  IconButton,
  Input,
  LtrText,
  Popover,
  Radio,
  Select,
  Tooltip,
} from '@vertex-os/ui';
import { useRef, useState } from 'react';
import { useLabText } from '../lab-text';
import { Caption, Row, Specimen, Stack } from '../specimen';

function RoutineDialog() {
  const t = useLabText();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('سارة الخطيب (تجريبي)');
  const first = useRef<HTMLInputElement>(null);
  const dirty = name !== 'سارة الخطيب (تجريبي)';
  return (
    <>
      <Button onClick={() => setOpen(true)}>{t('تعديل المستخدم', 'Edit user')}</Button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setName('سارة الخطيب (تجريبي)');
        }}
        title={t('تعديل المستخدم', 'Edit user')}
        description={t(
          'غيّر الاسم ثم حاول الإغلاق لرؤية حماية التغييرات غير المحفوظة.',
          'Change the name, then try to close to see the unsaved-changes guard.',
        )}
        initialFocus={first}
        dirty={dirty}
        actions={
          <>
            <DialogCancel />
            <Button variant="primary" onClick={() => setOpen(false)}>
              {t('حفظ التغييرات', 'Save changes')}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-form-fields">
          <Field label={t('الاسم', 'Name')} required>
            <Input
              ref={first}
              value={name}
              onChange={(event) => setName(event.currentTarget.value)}
            />
          </Field>
          <Field label={t('القسم', 'Department')}>
            <Select defaultValue="design">
              <option value="design">{t('التصميم', 'Design')}</option>
              <option value="production">{t('الإنتاج', 'Production')}</option>
            </Select>
          </Field>
          <div className="flex items-center gap-actions">
            <Caption>
              {t('قائمة داخل النافذة (مملوكة لها):', 'Menu inside the dialog (owned by it):')}
            </Caption>
            <DropdownMenu
              trigger={<IconButton icon="more" label={t('إجراءات إضافية', 'More actions')} />}
              items={[
                {
                  id: 'copy',
                  label: t('نسخ المعرّف', 'Copy identifier'),
                  icon: 'copy',
                  onSelect: () => undefined,
                },
                {
                  id: 'sessions',
                  label: t('إنهاء الجلسات', 'Revoke sessions'),
                  intent: 'danger',
                  onSelect: () => undefined,
                },
              ]}
            />
          </div>
        </div>
      </Dialog>
    </>
  );
}

function LongDialog() {
  const t = useLabText();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>{t('محتوى طويل', 'Long content')}</Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        size="wide"
        title={t('سجل التغييرات المقترحة', 'Proposed changes log')}
        actions={<DialogCancel>{t('إغلاق', 'Close')}</DialogCancel>}
      >
        <ol className="flex flex-col gap-actions ps-toolbar-groups">
          {Array.from({ length: 40 }, (_, index) => (
            <li key={index}>
              {t('تغيير مقترح رقم', 'Proposed change no.')} <LtrText>{String(index + 1)}</LtrText> —{' '}
              {t(
                'يبقى العنوان والإجراءات ظاهرين أثناء التمرير.',
                'The title and actions stay reachable while scrolling.',
              )}
            </li>
          ))}
        </ol>
      </Dialog>
    </>
  );
}

function DestructiveConfirmation({ pendingDemo = false }: { pendingDemo?: boolean }) {
  const t = useLabText();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  return (
    <>
      <Button variant="ghost" intent="danger" onClick={() => setOpen(true)}>
        {pendingDemo
          ? t('تعطيل (مع انتظار)', 'Disable (with pending)')
          : t('تعطيل المستخدم', 'Disable user')}
      </Button>
      <AlertDialog
        open={open}
        onOpenChange={setOpen}
        title={t('تعطيل المستخدم؟', 'Disable user?')}
        description={t(
          'لن يتمكن من تسجيل الدخول، وتُنهى جلساته الحالية. يمكن إعادة التفعيل لاحقًا.',
          'They will not be able to sign in, and current sessions end. Access can be re-enabled later.',
        )}
        confirmLabel={t('تعطيل المستخدم', 'Disable user')}
        pending={pending}
        pendingLabel={t('جارٍ التعطيل…', 'Disabling…')}
        onConfirm={() => {
          if (!pendingDemo) {
            setOpen(false);
            return;
          }
          setPending(true);
          window.setTimeout(() => {
            setPending(false);
            setOpen(false);
          }, 2000);
        }}
      >
        <p>
          <Bdi>سارة الخطيب (تجريبي)</Bdi> — <LtrText>sara.demo@example.test</LtrText>
        </p>
      </AlertDialog>
    </>
  );
}

function Drawers() {
  const t = useLabText();
  const [end, setEnd] = useState(false);
  const [start, setStart] = useState(false);
  return (
    <>
      <Button onClick={() => setEnd(true)}>
        {t('درج مهمة (نهاية السطر)', 'Task drawer (inline-end)')}
      </Button>
      <Button onClick={() => setStart(true)}>
        {t('درج (بداية السطر)', 'Drawer (inline-start)')}
      </Button>
      <Drawer
        open={end}
        onOpenChange={setEnd}
        title={t('إسناد الأدوار', 'Assign roles')}
        actions={
          <>
            <DialogCancel />
            <Button variant="primary" onClick={() => setEnd(false)}>
              {t('حفظ الإسناد', 'Save assignment')}
            </Button>
          </>
        }
      >
        <Fieldset legend={t('الأدوار', 'Roles')}>
          <Checkbox label={t('مدير المشاريع', 'Project manager')} defaultChecked />
          <Checkbox label={t('مراجع المحتوى', 'Content reviewer')} />
          <Checkbox
            label={t('مسؤول النظام', 'System administrator')}
            description={t(
              'صلاحية ذات امتيازات؛ تتطلب تأكيدًا.',
              'Privileged; requires confirmation.',
            )}
          />
        </Fieldset>
      </Drawer>
      <Drawer
        open={start}
        onOpenChange={setStart}
        side="start"
        title={t('درج من بداية السطر', 'Inline-start drawer')}
      >
        <p>
          {t(
            'يدخل من جهة بداية السطر: اليمين في العربية.',
            'Enters from inline-start: the right in Arabic.',
          )}
        </p>
      </Drawer>
    </>
  );
}

/** Deleting the row removes the opener; focus must land on a surviving control, not the body. */
function TriggerRemoval() {
  const t = useLabText();
  const [rows, setRows] = useState(['VX-2026-011', 'VX-2026-012', 'VX-2026-013']);
  const [target, setTarget] = useState<string | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  return (
    <div className="flex flex-col gap-actions">
      <h3 ref={heading} tabIndex={-1} className="type-subheading">
        {t('مسودات تجريبية', 'Demo drafts')}
      </h3>
      <ul className="flex flex-col gap-field-gap">
        {rows.map((row) => (
          <li key={row} className="flex items-center gap-actions">
            <LtrText>{row}</LtrText>
            <IconButton
              icon="trash"
              intent="danger"
              label={t(`حذف المسودة ${row}`, `Delete draft ${row}`)}
              onClick={() => setTarget(row)}
            />
          </li>
        ))}
      </ul>
      <AlertDialog
        open={target !== null}
        onOpenChange={(open) => {
          if (!open) setTarget(null);
        }}
        title={t('حذف المسودة؟', 'Delete draft?')}
        description={t(
          'تُحذف المسودة التجريبية من هذه القائمة فقط.',
          'The demo draft is removed from this list only.',
        )}
        confirmLabel={t('حذف المسودة', 'Delete draft')}
        returnFocus={heading}
        onConfirm={() => {
          setRows((current) => current.filter((row) => row !== target));
          setTarget(null);
        }}
      >
        <p>
          <LtrText>{target ?? ''}</LtrText>
        </p>
      </AlertDialog>
    </div>
  );
}

export function OverlaysSection() {
  const t = useLabText();
  return (
    <Stack gap="section">
      <Specimen
        id="dialogs"
        title={t('النوافذ والتأكيد', 'Dialogs and confirmation')}
        description={t(
          'اسم مرئي، تركيز أولي مقصود، خلفية خاملة، واستعادة التركيز.',
          'Visible name, deliberate initial focus, inert background and focus restoration.',
        )}
      >
        <Row>
          <RoutineDialog />
          <LongDialog />
          <DestructiveConfirmation />
          <DestructiveConfirmation pendingDemo />
        </Row>
      </Specimen>
      <Specimen id="drawers" title={t('الأدراج', 'Drawers')}>
        <Row>
          <Drawers />
        </Row>
      </Specimen>
      <Specimen
        id="popups"
        title={t('القوائم والنوافذ المنبثقة والتلميحات', 'Menus, popovers and tooltips')}
      >
        <Row>
          <DropdownMenu
            trigger={<Button trailingIcon="chevron-down">{t('إجراءات', 'Actions')}</Button>}
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
              {
                id: 'audit',
                label: t('سجل التدقيق', 'Audit history'),
                disabled: true,
                description: t('يتطلب صلاحية التدقيق.', 'Requires the audit permission.'),
              },
              {
                id: 'suspend',
                label: t('إيقاف الوصول مؤقتًا', 'Suspend access'),
                intent: 'danger',
                onSelect: () => undefined,
              },
              {
                id: 'terminate',
                label: t('إنهاء الوصول', 'End access'),
                intent: 'danger',
                onSelect: () => undefined,
              },
            ]}
          />
          <Popover
            title={t('تصفية النتائج', 'Filter results')}
            trigger={<Button icon="filter">{t('تصفية', 'Filter')}</Button>}
          >
            <Fieldset legend={t('حالة الوصول', 'Access status')}>
              <Radio
                name="lab-popover-status"
                value="all"
                label={t('الكل', 'All')}
                defaultChecked
              />
              <Radio name="lab-popover-status" value="active" label={t('نشط', 'Active')} />
              <Radio
                name="lab-popover-status"
                value="suspended"
                label={t('موقوف مؤقتًا', 'Suspended')}
              />
            </Fieldset>
          </Popover>
          <Tooltip content={t('يُحدَّث كل 15 ثانية', 'Refreshes every 15 seconds')}>
            <Button icon="clock">
              {t('تلميح عند التمرير أو التركيز', 'Tooltip on hover or focus')}
            </Button>
          </Tooltip>
          <IconButton icon="copy" label={t('نسخ رابط السجل', 'Copy record link')} />
        </Row>
      </Specimen>
      <Specimen
        id="focus-fallback"
        title={t('اختفاء المُشغِّل', 'Trigger removal')}
        description={t(
          'بعد الحذف يعود التركيز إلى عنوان القائمة، لا إلى جسم الصفحة.',
          'After deletion focus returns to the list heading, never the page body.',
        )}
      >
        <TriggerRemoval />
      </Specimen>
    </Stack>
  );
}
