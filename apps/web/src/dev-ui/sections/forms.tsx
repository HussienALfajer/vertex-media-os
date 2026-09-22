import {
  Bdi,
  Button,
  Checkbox,
  ErrorSummary,
  Field,
  Fieldset,
  FormActions,
  FormSection,
  Input,
  Radio,
  RequiredNote,
  SearchInput,
  Select,
  Switch,
  Textarea,
  type FormIssue,
} from '@vertex-os/ui';
import { useState } from 'react';
import { useLabText } from '../lab-text';
import { Specimen, Stack } from '../specimen';

function ValidationSpecimen() {
  const t = useLabText();
  const [attempt, setAttempt] = useState(0);
  const [name, setName] = useState('');
  const [code, setCode] = useState('design.lead');
  const [saving, setSaving] = useState(false);
  const issues: FormIssue[] = [
    ...(name.trim() === ''
      ? [{ fieldId: 'lab-role-name', message: t('أدخل اسم الدور.', 'Enter the role name.') }]
      : []),
    ...(code === 'design.lead'
      ? [
          {
            fieldId: 'lab-role-code',
            message: t('هذا الرمز مستخدم بالفعل.', 'This code is already in use.'),
          },
        ]
      : []),
  ];
  const shown = attempt > 0 ? issues : [];
  const errorFor = (id: string) => shown.find((issue) => issue.fieldId === id)?.message;
  return (
    <form
      noValidate
      className="flex flex-col gap-form-sections max-w-form"
      onSubmit={(event) => {
        event.preventDefault();
        setAttempt((value) => value + 1);
        if (issues.length > 0) return;
        setSaving(true);
        window.setTimeout(() => setSaving(false), 1200);
      }}
    >
      <RequiredNote />
      <ErrorSummary issues={shown} attempt={attempt} />
      <FormSection
        title={t('بيانات الدور', 'Role details')}
        description={t(
          'مثال عرض فقط؛ لا يحفظ أي دور.',
          'Presentation example only; no role is saved.',
        )}
      >
        <Field
          id="lab-role-name"
          label={t('اسم الدور', 'Role name')}
          required
          error={errorFor('lab-role-name')}
        >
          <Input
            value={name}
            onChange={(event) => setName(event.currentTarget.value)}
            autoComplete="off"
          />
        </Field>
        <Field
          id="lab-role-code"
          label={t('رمز الدور', 'Role code')}
          required
          description={t('أحرف لاتينية صغيرة ونقاط.', 'Lowercase Latin letters and dots.')}
          error={errorFor('lab-role-code')}
        >
          <Input value={code} dir="ltr" onChange={(event) => setCode(event.currentTarget.value)} />
        </Field>
        <Field label={t('الوصف', 'Description')} optional>
          <Textarea rows={3} />
        </Field>
      </FormSection>
      <FormActions>
        <Button type="button">{t('إلغاء', 'Cancel')}</Button>
        <Button
          type="submit"
          variant="primary"
          pending={saving}
          pendingLabel={t('جارٍ الحفظ…', 'Saving…')}
        >
          {t('حفظ التغييرات', 'Save changes')}
        </Button>
      </FormActions>
    </form>
  );
}

export function FormsSection() {
  const t = useLabText();
  const [query, setQuery] = useState('');
  const [committed, setCommitted] = useState('');
  const [notify, setNotify] = useState(true);
  return (
    <Stack gap="section">
      <Specimen id="field-states" title={t('حالات الحقول', 'Field states')}>
        <div className="grid gap-form-fields medium:grid-cols-2">
          <Field
            label={t('الاسم الكامل', 'Full name')}
            description={t('كما يظهر في الدليل.', 'As shown in the directory.')}
            required
          >
            <Input defaultValue="سارة الخطيب (تجريبي)" />
          </Field>
          <Field label={t('البريد الإلكتروني', 'Email')} required>
            <Input type="email" defaultValue="sara.demo@example.test" />
          </Field>
          <Field label={t('الهاتف', 'Phone')} optional>
            <Input type="tel" placeholder="+90 555 010 0200" />
          </Field>
          <Field label={t('القسم', 'Department')}>
            <Select defaultValue="design">
              <option value="design">{t('التصميم', 'Design')}</option>
              <option value="production">{t('الإنتاج', 'Production')}</option>
              <option value="accounts">{t('الحسابات', 'Accounts')}</option>
            </Select>
          </Field>
          <Field label={t('المعرّف (للقراءة فقط)', 'Identifier (read-only)')}>
            <Input readOnly defaultValue="usr-001" dir="ltr" />
          </Field>
          <Field
            label={t('حقل معطّل', 'Disabled field')}
            description={t('يتطلب صلاحية الإدارة.', 'Requires administration permission.')}
          >
            <Input disabled defaultValue={t('غير متاح', 'Unavailable')} />
          </Field>
          <Field
            label={t('المبلغ', 'Amount')}
            error={t('استخدم منزلتين عشريتين كحد أقصى.', 'Use at most two decimal places.')}
          >
            <Input defaultValue="12.345" inputMode="decimal" dir="ltr" />
          </Field>
          <Field label={t('البحث في العملاء', 'Search clients')}>
            <SearchInput
              value={query}
              onValueChange={setQuery}
              onSearch={setCommitted}
              placeholder={t('اسم العميل', 'Client name')}
            />
          </Field>
          <Field
            label={t('ملاحظات داخلية', 'Internal notes')}
            description={t('تحافظ على فواصل الأسطر.', 'Keeps line breaks.')}
          >
            <Textarea defaultValue={t('سطر أول\nسطر ثانٍ', 'First line\nSecond line')} />
          </Field>
        </div>
        <p className="type-secondary text-secondary pt-actions" role="status">
          {committed && (
            <>
              {t('آخر بحث:', 'Last search:')} <Bdi>{committed}</Bdi>
            </>
          )}
        </p>
      </Specimen>
      <Specimen id="choice-states" title={t('عناصر الاختيار', 'Choice controls')}>
        <div className="grid gap-form-sections medium:grid-cols-3">
          <Fieldset
            legend={t('الإشعارات', 'Notifications')}
            description={t('تُحفظ مع النموذج.', 'Saved with the form.')}
          >
            <Checkbox label={t('ملخص يومي', 'Daily digest')} defaultChecked />
            <Checkbox label={t('تنبيهات الموافقة', 'Approval alerts')} />
            <Checkbox
              label={t('كل التنبيهات (مختلط)', 'All alerts (mixed)')}
              mixed
              defaultChecked={false}
            />
            <Checkbox
              label={t('تنبيهات المالية', 'Finance alerts')}
              description={t('تتطلب صلاحية المالية.', 'Requires the finance permission.')}
              disabled
            />
            <Checkbox label={t('محدد ومعطّل', 'Checked and disabled')} defaultChecked disabled />
          </Fieldset>
          <Fieldset legend={t('طريقة العرض', 'View')} required>
            <Radio name="lab-view" value="list" label={t('قائمة', 'List')} defaultChecked />
            <Radio name="lab-view" value="table" label={t('جدول', 'Table')} />
            <Radio
              name="lab-view"
              value="board"
              label={t('لوحة (غير متاحة)', 'Board (unavailable)')}
              disabled
            />
          </Fieldset>
          <Fieldset legend={t('إعدادات فورية', 'Immediate settings')}>
            <Switch
              label={t('إشعارات فورية', 'Instant notifications')}
              checked={notify}
              onChange={(event) => setNotify(event.currentTarget.checked)}
            />
            <Switch
              label={t('جارٍ الحفظ', 'Saving')}
              checked
              pending
              description={t('جارٍ تطبيق الإعداد…', 'Applying the setting…')}
              onChange={() => undefined}
            />
            <Switch label={t('إعداد معطّل', 'Disabled setting')} disabled />
          </Fieldset>
        </div>
      </Specimen>
      <Specimen
        id="form-validation"
        title={t('التحقق وملخص الأخطاء', 'Validation and error summary')}
        description={t(
          'أرسل النموذج لرؤية الملخص والتركيز.',
          'Submit to see the summary and focus behaviour.',
        )}
      >
        <ValidationSpecimen />
      </Specimen>
    </Stack>
  );
}
