import { queryOptions, useQuery } from '@tanstack/react-query';
import { StatusIndicator, Surface, type IconName, type Tone } from '@vertex-os/ui';
import { useAppMessages, type AppMessages } from '../../app-messages';
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

/** Maps the technical query state onto the shared tones (the feature owns this mapping, §33). */
const PRESENTATION: Record<
  'pending' | 'success' | 'error',
  { tone: Tone; icon: IconName; label: keyof AppMessages }
> = {
  pending: { tone: 'info', icon: 'clock', label: 'apiPending' },
  success: { tone: 'success', icon: 'check-circle', label: 'apiAvailable' },
  error: { tone: 'danger', icon: 'alert-circle', label: 'apiUnavailable' },
};

/** Technical status of the browser -> web -> API path. Contains no business information. */
export function ApiStatus() {
  const messages = useAppMessages();
  const { status } = useQuery(livenessQuery);
  const { tone, icon, label } = PRESENTATION[status];

  return (
    <section aria-labelledby="api-status-heading">
      <Surface>
        <div className="flex flex-col gap-actions">
          <h2 id="api-status-heading" className="type-subheading">
            {messages.systemStatus}
          </h2>
          <p role="status">
            <StatusIndicator tone={tone} icon={icon} label={messages[label]} />
          </p>
          {status === 'error' ? (
            <p className="text-secondary">{messages.apiUnavailableDetail}</p>
          ) : null}
        </div>
      </Surface>
    </section>
  );
}
