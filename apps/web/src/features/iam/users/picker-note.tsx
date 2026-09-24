import { useIamMessages } from '../iam-messages';

/** Says when a bounded picker list shows only its first page (IAM-R08B D-12). */
export function PickerNote({
  page,
}: {
  page: { readonly items: readonly unknown[]; readonly total: number };
}) {
  const messages = useIamMessages();
  if (page.total <= page.items.length) return null;
  return <p className="text-secondary">{messages.pickerTruncated(page.total)}</p>;
}
