/** Keys a limiter keeps at most; the oldest key is forgotten first (IAM-R09 D-03). */
export const RATE_LIMIT_MAX_KEYS = 10_000;

export type RateLimitDecision =
  | { readonly allowed: true }
  /** The key has used its window; `retryAfterSeconds` is what is left of the window (at least 1). */
  | { readonly allowed: false; readonly retryAfterSeconds: number; readonly first: boolean };

/** A fixed-window counter per key, in this process only (IAM-R09 D-03, D-04). */
export interface RateLimiter {
  /** Counts one event for `key` and says whether it is within the limit. */
  take(key: string): RateLimitDecision;
}

export interface RateLimiterOptions {
  readonly limit: number;
  readonly windowSeconds: number;
  readonly maxKeys?: number;
  /** The current time in milliseconds; tests move it. */
  readonly now?: () => number;
}

interface Window {
  readonly startedAt: number;
  count: number;
}

/**
 * Creates a fixed-window limiter. V1 runs one API process (Master Plan Section 15), so the counters
 * need no shared store. The table is bounded: past `maxKeys`, the key seen longest ago is dropped,
 * which can only let that key start a fresh window, never refuse another key.
 */
export function createRateLimiter(options: RateLimiterOptions): RateLimiter {
  const now = options.now ?? Date.now;
  const windowMs = options.windowSeconds * 1000;
  const maxKeys = options.maxKeys ?? RATE_LIMIT_MAX_KEYS;
  // A Map iterates in insertion order; a key is re-inserted when its window starts.
  const windows = new Map<string, Window>();

  return Object.freeze({
    take(key: string): RateLimitDecision {
      const at = now();
      let window = windows.get(key);
      if (window === undefined || at - window.startedAt >= windowMs) {
        windows.delete(key);
        window = { startedAt: at, count: 0 };
        windows.set(key, window);
        while (windows.size > maxKeys) {
          const oldest = windows.keys().next();
          if (oldest.done === true) break;
          windows.delete(oldest.value);
        }
      }
      window.count += 1;
      if (window.count <= options.limit) return { allowed: true };
      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil((window.startedAt + windowMs - at) / 1000)),
        // The first refusal of a window, so a caller can log a suppression once per window.
        first: window.count === options.limit + 1,
      };
    },
  });
}
