import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import {
  parseAdministrativeReason,
  parseTraceId,
  userActor,
  type AuditAttribution,
} from '@vertex-os/audit';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Observable } from 'rxjs';
import type { z } from 'zod';
import type { CurrentActor } from '../../auth/access.guard.js';
import { RequestValidationException } from '../../http/problem-details.js';
import { Id } from './schemas.js';

/** A field name worth echoing back; anything else a client invented is reported generically. */
const FIELD_NAME = /^[A-Za-z][A-Za-z0-9]{0,63}$/;

function fieldsOf(error: z.ZodError, field: string): string[] {
  const names = new Set<string>();
  for (const issue of error.issues) {
    if (issue.code === 'unrecognized_keys') {
      for (const key of issue.keys) names.add(FIELD_NAME.test(key) ? key : '(unknown field)');
    } else {
      names.add(issue.path.length === 0 ? field : issue.path.map(String).join('.'));
    }
  }
  return [...names].sort();
}

/** An input with its absent optional fields left out rather than set to `undefined`. */
type Present<T> = T extends readonly unknown[]
  ? T
  : T extends object
    ? { [K in keyof T as undefined extends T[K] ? never : K]: T[K] } & {
        [K in keyof T as undefined extends T[K] ? K : never]?: Exclude<T[K], undefined>;
      }
    : T;

/**
 * Parses untrusted input with its strict schema before any capability runs (IAM-R07 D-04). A
 * failure is `400 VALIDATION_FAILED` naming the offending fields, never echoing their values.
 * Absent optional fields are left out, as the capabilities' request types expect.
 */
export function parseInput<Schema extends z.ZodType>(
  schema: Schema,
  value: unknown,
  field = '(body)',
): Present<z.output<Schema>> {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new RequestValidationException(fieldsOf(parsed.error, field));
  const data: unknown = parsed.data;
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    return data as Present<z.output<Schema>>;
  }
  return Object.fromEntries(
    Object.entries(data).filter(([, entry]) => entry !== undefined),
  ) as Present<z.output<Schema>>;
}

/** A path identifier, validated like a body field and named after its parameter. */
export function pathId(name: string, value: unknown): string {
  return parseInput(Id, value, name);
}

/**
 * The Audit attribution of a route's change (IAM-R07 D-07): the session's own USER actor, the
 * request's trace ID and the administrator's optional reason. IAM routes never act as a system
 * process, because the grant ceiling exempts every SYSTEM actor (IAM-R06 review SEC-1).
 */
export async function actorAttribution(
  actors: CurrentActor,
  request: FastifyRequest,
  reply: FastifyReply,
  reason?: string,
): Promise<AuditAttribution> {
  const context = await actors.require(request, reply);
  const actor = userActor(context.userId);
  const traceId = parseTraceId(request.id);
  if (!actor.ok || !traceId.ok) throw new Error('The request has no valid attribution.');
  if (reason === undefined) return { actor: actor.value, traceId: traceId.value };
  const parsed = parseAdministrativeReason(reason);
  if (!parsed.ok) throw new RequestValidationException(['reason']);
  return { actor: actor.value, traceId: traceId.value, reason: parsed.value };
}

/** IAM responses carry personal data: no cache may keep them (IAM-R07 D-06). */
@Injectable()
export class NoStoreInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    void context.switchToHttp().getResponse<FastifyReply>().header('cache-control', 'no-store');
    return next.handle();
  }
}
