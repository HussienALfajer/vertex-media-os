import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import { handleApiError, watchAuthState } from './features/auth/auth-state';
import { ApiProblem } from './lib/http';

/** Reads may be retried twice after a network failure or a server error, never after a refusal. */
const MAX_READ_RETRIES = 2;

/**
 * The application's query client: every query and mutation error passes through the
 * authentication handler, and the protected cache follows the authentication state (IAM-R08 D-10).
 */
export function createQueryClient(): QueryClient {
  const client: QueryClient = new QueryClient({
    queryCache: new QueryCache({ onError: (error, query) => handleApiError(client, error, query) }),
    mutationCache: new MutationCache({ onError: (error) => handleApiError(client, error) }),
    defaultOptions: {
      queries: {
        retry: (failures, error) =>
          failures < MAX_READ_RETRIES && !(error instanceof ApiProblem && error.status < 500),
      },
      // A mutation is never retried automatically (DESIGN_SYSTEM Section 43).
      mutations: { retry: false },
    },
  });
  watchAuthState(client);
  return client;
}
