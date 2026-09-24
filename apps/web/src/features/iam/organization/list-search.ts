import { PAGE_SIZES, type PageSize } from '@vertex-os/ui';

/** Non-sensitive list state kept in the address (IAM-R08C D-02). */
export interface ListSearch<State extends string> {
  readonly page?: number | undefined;
  readonly pageSize?: PageSize | undefined;
  readonly state?: State | undefined;
}

export interface ListParams<State extends string> {
  readonly page: number;
  readonly pageSize: PageSize;
  readonly state?: State | undefined;
}

/**
 * Keeps only valid, non-default values. A page applies it again to what it reads, because the
 * router can expose raw address parameters next to the validated ones (IAM-R08B discovery).
 */
export function listSearch<State extends string>(
  search: Record<string, unknown>,
  states: readonly State[],
): ListSearch<State> {
  const page = Number(search['page']);
  const pageSize = PAGE_SIZES.find((size) => size === Number(search['pageSize']));
  const state = states.find((candidate) => candidate === search['state']);
  return {
    ...(Number.isInteger(page) && page > 1 && page <= 10_000 ? { page } : {}),
    ...(pageSize !== undefined && pageSize !== 25 ? { pageSize } : {}),
    ...(state === undefined ? {} : { state }),
  };
}

export function listParams<State extends string>(search: ListSearch<State>): ListParams<State> {
  return { page: search.page ?? 1, pageSize: search.pageSize ?? 25, state: search.state };
}

/** The address form of list parameters: defaults are omitted. */
export function toListSearch<State extends string>(params: ListParams<State>): ListSearch<State> {
  return {
    ...(params.page > 1 ? { page: params.page } : {}),
    ...(params.pageSize !== 25 ? { pageSize: params.pageSize } : {}),
    ...(params.state === undefined ? {} : { state: params.state }),
  };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** An IAM identifier read from the address, or nothing (IAM-R08C D-09). */
export function idParam(value: unknown): string | undefined {
  return typeof value === 'string' && UUID.test(value) ? value : undefined;
}
