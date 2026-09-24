import type { ReferenceObject, SchemaObject } from '@nestjs/swagger';
import { z } from 'zod';

const named = new Map<string, SchemaObject>();

/**
 * The OpenAPI 3.0 form of a Zod schema. A body or response is documented from the same schema
 * that validates or types it, so the two cannot drift (IAM-R07 D-17).
 */
export function openApiSchema(schema: z.ZodType, io: 'input' | 'output' = 'output'): SchemaObject {
  const { $schema: _dialect, ...json } = z.toJSONSchema(schema, {
    target: 'openapi-3.0',
    io,
  }) as SchemaObject & { $schema?: string };
  return json;
}

/**
 * Registers a Zod schema as a named component and returns its reference. Registration happens
 * when the module declaring a route loads, so every generated document carries the components of
 * its routes.
 */
export function namedSchema(
  name: string,
  schema: z.ZodType,
  io: 'input' | 'output' = 'output',
): ReferenceObject {
  const existing = named.get(name);
  const json = openApiSchema(schema, io);
  if (existing !== undefined && JSON.stringify(existing) !== JSON.stringify(json)) {
    throw new Error(`OpenAPI schema ${name} is registered twice with different shapes.`);
  }
  named.set(name, json);
  return { $ref: `#/components/schemas/${name}` };
}

/** Every registered component, for the document builder. */
export function namedSchemas(): Record<string, SchemaObject> {
  return Object.fromEntries(named);
}
