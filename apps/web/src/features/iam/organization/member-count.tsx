import type { UseQueryResult } from '@tanstack/react-query';
import { UiLink } from '@vertex-os/ui';
import { useIamMessages } from '../iam-messages';
import { isApiProblem } from '../../../lib/http';

/**
 * How many users a department or role reaches, with a link to them in the directory (IAM-R08C
 * D-05, D-06, D-09). Shown only to an administrator holding `iam.users.read`.
 */
export function MemberCount({
  query,
  label,
  href,
  linkLabel,
}: {
  query: UseQueryResult<number>;
  label: (count: number) => string;
  href: string;
  linkLabel: string;
}) {
  const messages = useIamMessages();
  if (isApiProblem(query.error, 401) || isApiProblem(query.error, 403)) {
    return <span className="text-secondary">{messages.noPermissionDetail}</span>;
  }
  if (query.data === undefined) {
    return (
      <span className="text-secondary">
        {query.isError ? messages.pickerFailed : messages.loadingList}
      </span>
    );
  }
  return (
    <span className="flex flex-wrap items-center gap-actions">
      <span>{label(query.data)}</span>
      {query.isError && <span className="text-secondary">{messages.staleCount}</span>}
      {query.data > 0 && <UiLink href={href}>{linkLabel}</UiLink>}
    </span>
  );
}
