import type { LoggerService } from '@nestjs/common';
import type { FastifyBaseLogger } from 'fastify';
import { safeErrorSerializer } from './safe-error-serializer.js';

type Level = 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace';

/**
 * Routes Nest's framework logging into Fastify's pino logger so the process has
 * a single structured (JSON) log stream. Nest passes the log context as the last
 * string argument and, for errors, an optional stack trace before it.
 *
 * Nothing outside the `err` serializer may carry an error's own text (IAM-02 A2-01): an `Error`'s
 * message is replaced by its serialized message (a database error's fixed stand-in), and the raw
 * stack string of Nest's `error(message, stack)` form, which can embed a database error's message
 * and row data, is dropped and flagged with `stackOmitted`.
 */
export class PinoLoggerService implements LoggerService {
  constructor(private readonly logger: FastifyBaseLogger) {}

  log(message: unknown, ...optionalParams: unknown[]): void {
    this.write('info', message, optionalParams);
  }

  error(message: unknown, ...optionalParams: unknown[]): void {
    this.write('error', message, optionalParams);
  }

  warn(message: unknown, ...optionalParams: unknown[]): void {
    this.write('warn', message, optionalParams);
  }

  debug(message: unknown, ...optionalParams: unknown[]): void {
    this.write('debug', message, optionalParams);
  }

  verbose(message: unknown, ...optionalParams: unknown[]): void {
    this.write('trace', message, optionalParams);
  }

  fatal(message: unknown, ...optionalParams: unknown[]): void {
    this.write('fatal', message, optionalParams);
  }

  private write(level: Level, message: unknown, optionalParams: readonly unknown[]): void {
    const last = optionalParams.at(-1);
    const context = typeof last === 'string' ? last : undefined;
    const rest = context === undefined ? optionalParams : optionalParams.slice(0, -1);
    const stackOmitted = level === 'error' && typeof rest[0] === 'string';

    const fields: Record<string, unknown> = {};
    if (context !== undefined) fields['context'] = context;
    if (stackOmitted) fields['stackOmitted'] = true;

    if (typeof message === 'string') {
      this.logger[level](fields, message);
    } else if (message instanceof Error) {
      this.logger[level]({ ...fields, err: message }, safeErrorSerializer(message).message);
    } else {
      this.logger[level]({ ...fields, payload: message }, 'structured log entry');
    }
  }
}
