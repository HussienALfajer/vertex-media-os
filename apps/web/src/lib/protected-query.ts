import { queryOptions } from '@tanstack/react-query';

/** The first key segment of a protected query: never one of the public roots (`auth`, `system`). */
type ProtectedRoot = 'iam';

export interface ProtectedQuery<Data> {
  /** The permission code the API requires for this data (spec Section 25). */
  readonly permission: string;
  readonly queryKey: readonly [ProtectedRoot, ...unknown[]];
  readonly queryFn: (context: { readonly signal: AbortSignal }) => Promise<Data>;
}

/**
 * Options for a query that reads protected data. The declared permission is mandatory, so the
 * query is removed as soon as the refreshed permission codes no longer include it (IAM-R08 D-10;
 * IAM-R08B D-04, review S-11). The declaration is presentation state: the API authorizes the read.
 */
export function protectedQuery<Data>({ permission, queryKey, queryFn }: ProtectedQuery<Data>) {
  return queryOptions({
    queryKey: [...queryKey] as unknown[],
    queryFn: ({ signal }) => queryFn({ signal }),
    meta: { permission },
  });
}
