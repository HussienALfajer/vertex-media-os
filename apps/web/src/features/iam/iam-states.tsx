import {
  InstantText,
  LtrText,
  StatusIndicator,
  useUiSettings,
  type IconName,
  type Language,
  type Tone,
} from '@vertex-os/ui';
import { useIamMessages } from './iam-messages';

/**
 * The IAM status mapping (DESIGN_SYSTEM Section 33; spec Section 40). Access, identity
 * synchronization and invitation delivery are three separately labeled facts (IAM-R08B D-06).
 */
interface StateMapping {
  readonly tone: Tone;
  readonly icon: IconName;
  readonly label: Readonly<Record<Language, string>>;
}

const ACCESS: Readonly<Record<string, StateMapping>> = {
  INVITED: { tone: 'info', icon: 'clock', label: { ar: 'مدعو', en: 'Invited' } },
  ACTIVE: { tone: 'success', icon: 'check-circle', label: { ar: 'نشط', en: 'Active' } },
  SUSPENDED: {
    tone: 'warning',
    icon: 'pause-circle',
    label: { ar: 'موقوف مؤقتًا', en: 'Suspended' },
  },
  DISABLED: { tone: 'danger', icon: 'lock', label: { ar: 'معطّل', en: 'Disabled' } },
  TERMINATED: {
    tone: 'neutral',
    icon: 'archive',
    label: { ar: 'منتهي الوصول', en: 'Access ended' },
  },
};

const IDENTITY: Readonly<Record<string, StateMapping>> = {
  PENDING: { tone: 'info', icon: 'clock', label: { ar: 'بانتظار المزامنة', en: 'Awaiting sync' } },
  SYNCED: { tone: 'success', icon: 'check-circle', label: { ar: 'تمت المزامنة', en: 'Synced' } },
  FAILED: {
    tone: 'danger',
    icon: 'alert-circle',
    label: { ar: 'فشلت المزامنة', en: 'Sync failed' },
  },
};

const INVITATION: Readonly<Record<string, StateMapping>> = {
  NOT_SENT: {
    tone: 'neutral',
    icon: 'minus-circle',
    label: { ar: 'لم تُرسل الدعوة', en: 'Invitation not sent' },
  },
  SENT: {
    tone: 'success',
    icon: 'check-circle',
    label: { ar: 'أُرسلت الدعوة', en: 'Invitation sent' },
  },
  FAILED: {
    tone: 'danger',
    icon: 'alert-circle',
    label: { ar: 'تعذّر تأكيد إرسال الدعوة', en: 'Invitation not confirmed' },
  },
};

/** The label of a known access state, for filters and confirmations. */
export function accessLabel(state: string, language: Language): string | undefined {
  return ACCESS[state]?.label[language];
}

function StateIndicator({
  mapping,
  value,
}: {
  mapping: Readonly<Record<string, StateMapping>>;
  value: string;
}) {
  const { language } = useUiSettings();
  const messages = useIamMessages();
  const known = Object.hasOwn(mapping, value) ? mapping[value] : undefined;
  if (known === undefined) {
    // Never classified as success; the raw value is the diagnostic path (Section 33).
    return (
      <StatusIndicator
        tone="neutral"
        icon="info"
        label={
          <>
            {messages.unknownStatus} (<LtrText>{value}</LtrText>)
          </>
        }
      />
    );
  }
  return <StatusIndicator tone={known.tone} icon={known.icon} label={known.label[language]} />;
}

export function AccessStatus({ state }: { state: string }) {
  return <StateIndicator mapping={ACCESS} value={state} />;
}

export function IdentityStatus({ state }: { state: string }) {
  return <StateIndicator mapping={IDENTITY} value={state} />;
}

/**
 * Invitation delivery is an outstanding condition only while the user is INVITED; afterwards it
 * is history and is not presented (spec Sections 11.3, 40). The detail passes `sentAt` (the
 * directory does not receive it, spec Section 42).
 */
export function InvitationStatus({
  accessState,
  state,
  sentAt,
}: {
  accessState: string;
  state: string;
  sentAt?: string | null;
}) {
  const messages = useIamMessages();
  if (accessState !== 'INVITED')
    return <span className="text-secondary">{messages.notApplicable}</span>;
  return (
    <span className="flex flex-col">
      <StateIndicator mapping={INVITATION} value={state} />
      {sentAt != null && state === 'SENT' && (
        <span className="text-secondary">
          <InstantText value={sentAt} />
        </span>
      )}
      {sentAt != null && state === 'FAILED' && (
        <span className="text-secondary">
          {messages.resendFailedAfterSuccess} <InstantText value={sentAt} />
        </span>
      )}
    </span>
  );
}
