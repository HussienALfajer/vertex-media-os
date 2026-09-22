import { queryOptions, useQuery } from '@tanstack/react-query';
import { getJson } from '../../lib/http';

const LIVENESS_REFRESH_MS = 15_000;

interface Liveness {
  readonly status: 'ok';
}

function isLiveness(body: unknown): body is Liveness {
  return typeof body === 'object' && body !== null && 'status' in body && body.status === 'ok';
}

export const livenessQuery = queryOptions({
  queryKey: ['system', 'liveness'],
  queryFn: async ({ signal }): Promise<Liveness> => {
    const body = await getJson('/api/health/live', signal);
    if (!isLiveness(body)) {
      throw new Error('Unexpected liveness response from the API');
    }
    return body;
  },
  // A failed check is shown immediately and re-checked on the next interval.
  retry: false,
  refetchInterval: LIVENESS_REFRESH_MS,
});

const PRESENTATION = {
  pending: { label: 'Checking API connection…', indicator: 'bg-slate-400' },
  success: { label: 'API connection available', indicator: 'bg-emerald-500' },
  error: { label: 'API connection unavailable', indicator: 'bg-red-500' },
} as const;

/** Technical status of the browser -> web -> API path. Contains no business information. */
export function ApiStatus() {
  const { status } = useQuery(livenessQuery);
  const { label, indicator } = PRESENTATION[status];

  return (
    <section
      aria-labelledby="api-status-heading"
      className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm"
    >
      <h2 id="api-status-heading" className="text-sm font-medium text-slate-500">
        System status
      </h2>
      <p role="status" className="mt-2 flex items-center gap-2 text-base font-medium">
        <span aria-hidden="true" className={`inline-block size-2.5 rounded-full ${indicator}`} />
        {label}
      </p>
      {status === 'error' ? (
        <p className="mt-2 text-sm text-slate-600">
          The Vertex OS API could not be reached. The connection is re-checked automatically.
        </p>
      ) : null}
    </section>
  );
}
