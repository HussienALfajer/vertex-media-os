import { Field, Textarea } from '@vertex-os/ui';
import { useIamMessages } from '../iam-messages';

/** Audit's limit on an administrative reason, in code points (IAM-R07 D-08). */
export const REASON_MAX = 500;

/**
 * The optional administrative reason (spec Section 53): accountability metadata, never
 * required, so it cannot delay an urgent revocation.
 */
export function ReasonField({
  value,
  onChange,
  disabled,
  error,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  error?: string | undefined;
}) {
  const messages = useIamMessages();
  return (
    <Field label={messages.reason} description={messages.reasonHelp} error={error} optional>
      <Textarea
        rows={2}
        maxLength={REASON_MAX}
        value={value}
        readOnly={disabled}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
    </Field>
  );
}
