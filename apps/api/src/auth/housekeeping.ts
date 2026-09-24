import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { AUTH_RUNTIME } from './access.guard.js';
import type { AuthRuntime } from './auth-runtime.js';

/** How often the server runs session housekeeping (IAM-R09 D-07). */
export const HOUSEKEEPING_INTERVAL_MS = 60_000;

/** Injection token of the housekeeping interval; absent means housekeeping is not scheduled. */
export const HOUSEKEEPING_INTERVAL = Symbol('HOUSEKEEPING_INTERVAL');

/**
 * Runs session housekeeping on a timer, independent of sign-in traffic (IAM-R09 D-07): expired
 * login attempts, the tokens of expired sessions (SECURITY Section 11) and session rows past the
 * retention period. The server entry schedules it; tests run {@link AuthHousekeeping.run} or the
 * session service directly. A failed run is logged and the next one retries.
 */
@Injectable()
export class AuthHousekeeping implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger('AuthHousekeeping');
  private timer: NodeJS.Timeout | undefined;
  private current: Promise<void> | undefined;

  constructor(
    @Inject(AUTH_RUNTIME) private readonly runtime: AuthRuntime,
    @Inject(HOUSEKEEPING_INTERVAL) private readonly intervalMs: number | undefined,
  ) {}

  onApplicationBootstrap(): void {
    if (this.intervalMs === undefined) return;
    this.timer = setInterval(() => void this.run(), this.intervalMs);
    // Housekeeping never keeps the process alive on its own.
    this.timer.unref();
  }

  /** Stops the timer and lets a run in progress finish before the database pool closes. */
  async onModuleDestroy(): Promise<void> {
    clearInterval(this.timer);
    this.timer = undefined;
    await this.current;
  }

  /** One run; a run still in progress makes the next tick a no-op. */
  run(): Promise<void> {
    if (this.current !== undefined) return this.current;
    this.current = this.runOnce().finally(() => {
      this.current = undefined;
    });
    return this.current;
  }

  private async runOnce(): Promise<void> {
    try {
      const result = await this.runtime.sessions.housekeep();
      if (result.loginAttemptsDeleted + result.sessionTokensDiscarded + result.sessionsPurged > 0) {
        this.logger.log(
          `session housekeeping: ${result.loginAttemptsDeleted} login attempts deleted, ` +
            `${result.sessionTokensDiscarded} expired sessions' tokens discarded, ` +
            `${result.sessionsPurged} sessions purged`,
        );
      }
    } catch (error) {
      // The error serializer keeps a database error to its allowlisted description (A2-01).
      this.logger.warn(error);
    }
  }
}
