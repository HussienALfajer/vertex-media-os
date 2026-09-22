import {
  Alert,
  Badge,
  Button,
  EmptyState,
  ErrorState,
  InlineMessage,
  LoadingState,
  NoResultsState,
  Progress,
  Skeleton,
  StatusIndicator,
  useToast,
  type IconName,
  type Tone,
} from '@vertex-os/ui';
import { useLabText } from '../lab-text';
import { Caption, Row, Specimen, Stack } from '../specimen';

const TONES: readonly Tone[] = ['neutral', 'info', 'success', 'warning', 'danger'];

/** §33 meanings with their tone and redundant shape cue. */
const MEANINGS: readonly [Tone, IconName, string, string][] = [
  ['success', 'check-circle', 'نشط', 'Active'],
  ['success', 'check', 'معتمد', 'Approved'],
  ['neutral', 'minus-circle', 'مسودة', 'Draft'],
  ['info', 'clock', 'قيد الانتظار', 'Queued'],
  ['info', 'progress', 'قيد التنفيذ', 'In progress'],
  ['warning', 'alert-triangle', 'متأخر', 'Overdue'],
  ['warning', 'pause-circle', 'محظور مؤقتًا', 'Temporarily blocked'],
  ['danger', 'alert-circle', 'فشل', 'Failed'],
  ['danger', 'lock', 'وصول معطّل', 'Access disabled'],
  ['neutral', 'archive', 'مؤرشف', 'Archived'],
];

export function FeedbackSection() {
  const t = useLabText();
  const toast = useToast();
  return (
    <Stack gap="section">
      <Specimen
        id="status"
        title={t('الشارات ومؤشرات الحالة', 'Badges and status indicators')}
        description={t(
          'خمس نغمات مشتركة؛ كل حالة لها نص وشكل، لا لون فقط.',
          'Five shared tones; every state has text and shape, never colour alone.',
        )}
      >
        <Stack>
          <Row>
            {TONES.map((tone) => (
              <Badge key={tone} tone={tone}>
                {tone}
              </Badge>
            ))}
          </Row>
          <Row>
            {MEANINGS.map(([tone, icon, ar, en]) => (
              <StatusIndicator key={en} tone={tone} icon={icon} label={t(ar, en)} />
            ))}
          </Row>
        </Stack>
      </Specimen>
      <Specimen
        id="alerts"
        title={t('التنبيهات والرسائل المضمنة', 'Alerts and inline messages')}
        flush
      >
        <Stack gap="actions">
          <Alert tone="info" title={t('يوجد تحديث للسياسة', 'A policy update is available')}>
            {t(
              'تنطبق التغييرات على الدعوات الجديدة فقط.',
              'Changes apply to new invitations only.',
            )}
          </Alert>
          <Alert tone="success" title={t('تم حفظ التغييرات', 'Changes saved')} />
          <Alert
            tone="warning"
            title={t(
              'تغيّر هذا السجل أثناء تحريره. راجع التغييرات قبل الحفظ.',
              'This record changed while you were editing. Review the changes before saving.',
            )}
            actions={<Button size="small">{t('عرض التغييرات', 'View changes')}</Button>}
          />
          <Alert
            tone="danger"
            title={t('تعذّر حفظ الدور', 'The role could not be saved')}
            onDismiss={() => undefined}
          >
            {t(
              'لم يتغير شيء. أعد المحاولة أو تواصل مع المسؤول.',
              'Nothing changed. Try again or contact an administrator.',
            )}
          </Alert>
          <Alert
            tone="neutral"
            placement="page"
            title={t(
              'انتهت الجلسة. سجّل الدخول للمتابعة.',
              'Your session has ended. Sign in to continue.',
            )}
          />
          <InlineMessage tone="success">{t('تم نسخ المعرّف.', 'Identifier copied.')}</InlineMessage>
          <InlineMessage tone="warning">
            {t('سيُرسل البريد إلى نطاق خارجي.', 'This email goes to an external domain.')}
          </InlineMessage>
          <InlineMessage tone="danger">
            {t('هذا الرمز مستخدم بالفعل.', 'This code is already in use.')}
          </InlineMessage>
        </Stack>
      </Specimen>
      <Specimen id="progress" title={t('التقدم والتحميل', 'Progress and loading')}>
        <div className="grid gap-form-fields medium:grid-cols-2">
          <Progress
            label={t('رفع ملفات الحملة', 'Uploading campaign files')}
            value={3}
            max={8}
            valueText={t('3 من 8 ملفات', '3 of 8 files')}
          />
          <Progress label={t('جارٍ التحقق من النتيجة…', 'Confirming the outcome…')} />
          <div className="flex flex-col gap-actions">
            <Caption>
              {t('هيكل تحميل (مخفي عن قارئ الشاشة)', 'Skeleton (hidden from screen readers)')}
            </Caption>
            <Skeleton lines={3} />
          </div>
          <LoadingState label={t('جارٍ تحميل الأدوار', 'Loading roles')} lines={2} />
        </div>
      </Specimen>
      <Specimen id="empty-error" title={t('الحالات الفارغة والأخطاء', 'Empty and error states')}>
        <div className="grid gap-section wide:grid-cols-3">
          <EmptyState
            icon="user"
            title={t('لا يوجد مستخدمون بعد', 'No users yet')}
            description={t(
              'ادعُ أول عضو في الفريق لبدء إدارة الوصول.',
              'Invite the first team member to start managing access.',
            )}
            action={
              <Button variant="primary" icon="plus">
                {t('دعوة مستخدم', 'Invite user')}
              </Button>
            }
          />
          <NoResultsState onClearFilters={() => undefined} />
          <ErrorState
            title={t('تعذّر تحميل المستخدمين', 'Users could not be loaded')}
            description={t(
              'لا يمكن تحديد ما إذا كانت القائمة فارغة.',
              'It is not possible to tell whether the list is empty.',
            )}
            reference="REQ-7F3A-2026"
            onRetry={() => undefined}
          />
        </div>
      </Specimen>
      <Specimen
        id="toasts"
        title={t('الإشعارات المنبثقة', 'Toasts')}
        description={t(
          'تأكيد اختياري فقط؛ لا تستحوذ على التركيز، وتُعلَّق أثناء النوافذ.',
          'Optional confirmation only; never steal focus; suspended under modals.',
        )}
      >
        <Row>
          <Button
            onClick={() =>
              toast.show({
                id: 'lab-saved',
                tone: 'success',
                message: t('تم حفظ التغييرات', 'Changes saved'),
              })
            }
          >
            {t('نجاح (يختفي بعد 6 ثوانٍ)', 'Success (dismisses after 6s)')}
          </Button>
          <Button
            onClick={() =>
              toast.show({
                tone: 'warning',
                message: t('اكتملت المزامنة جزئيًا', 'Sync completed partially'),
              })
            }
          >
            {t('تحذير (يبقى)', 'Warning (persists)')}
          </Button>
          <Button
            onClick={() =>
              toast.show({
                tone: 'info',
                message: t('نُقل الملف إلى الأرشيف', 'File moved to the archive'),
                action: { label: t('عرض الأرشيف', 'View archive'), onAction: () => undefined },
              })
            }
          >
            {t('مع إجراء (يبقى)', 'With action (persists)')}
          </Button>
          <Button
            onClick={() =>
              toast.show({
                tone: 'danger',
                message: t('تعذّر حفظ التفضيل', 'The preference could not be saved'),
              })
            }
          >
            {t('خطأ (يبقى)', 'Error (persists)')}
          </Button>
        </Row>
      </Specimen>
    </Stack>
  );
}
