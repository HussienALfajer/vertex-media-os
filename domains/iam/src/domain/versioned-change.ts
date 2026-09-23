import type { Description, EntityName } from './text.js';

/** The administrable fields shared by departments and roles; the code never changes. */
export interface AdministrableFields<State extends string> {
  readonly name: EntityName;
  readonly description: Description | undefined;
  readonly state: State;
}

/** A requested change: absent fields stay; `description: null` clears the description. */
export interface RequestedFields<State extends string> {
  readonly name?: EntityName;
  readonly description?: Description | null;
  readonly state?: State;
}

/** Only the fields that change, as the store writes them. */
export interface FieldChanges<State extends string> {
  readonly name?: EntityName;
  readonly description?: Description | null;
  readonly state?: State;
}

/** Audit evidence values of one side of a change (`null` for an absent description). */
export type ChangeSide = Readonly<Record<string, string | null>>;

export type VersionedChangeDecision<State extends string> =
  | {
      readonly kind: 'write';
      readonly changes: FieldChanges<State>;
      readonly before: ChangeSide;
      readonly after: ChangeSide;
    }
  | { readonly kind: 'unchanged' }
  | { readonly kind: 'version-conflict' };

/**
 * Decides a version-checked change of a department or role (IAM-R05 D-14): a stale expected
 * version is a conflict whatever was requested; a request that changes nothing writes nothing.
 */
export function decideVersionedChange<State extends string>(
  current: AdministrableFields<State> & { readonly version: number },
  expectedVersion: number,
  requested: RequestedFields<State>,
): VersionedChangeDecision<State> {
  if (current.version !== expectedVersion) return { kind: 'version-conflict' };
  const changes: { name?: EntityName; description?: Description | null; state?: State } = {};
  const before: Record<string, string | null> = {};
  const after: Record<string, string | null> = {};
  if (requested.name !== undefined && requested.name !== current.name) {
    changes.name = requested.name;
    before['name'] = current.name;
    after['name'] = requested.name;
  }
  if (requested.description !== undefined) {
    const wanted = requested.description ?? undefined;
    if (wanted !== current.description) {
      changes.description = requested.description;
      before['description'] = current.description ?? null;
      after['description'] = wanted ?? null;
    }
  }
  if (requested.state !== undefined && requested.state !== current.state) {
    changes.state = requested.state;
    before['state'] = current.state;
    after['state'] = requested.state;
  }
  return Object.keys(changes).length === 0
    ? { kind: 'unchanged' }
    : { kind: 'write', changes, before, after };
}
