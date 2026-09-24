import { ModulesContainer, Reflector } from '@nestjs/core';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testAuthConfig } from '../../../test-support/auth-config.js';
import { IAM_ROUTES } from '../../../test-support/iam-routes.js';
import { testProvisioningConfig } from '../../../test-support/provisioning-config.js';
import { createApp } from '../../app.factory.js';
import { loadAppConfig } from '../../config/app-config.js';
import { createOpenApiDocument } from '../../openapi/openapi.js';
import { IAM_PROBLEM_CODES, refusalProblem } from './iam-problems.js';
import { parseInput } from './request.js';
import { UpdateUserBody } from './schemas.js';

/**
 * The IAM HTTP contract without PostgreSQL (IAM-R07 D-05, D-16, D-17): which routes exist, which
 * permission each declares, what the OpenAPI document says about them, and the refusal table.
 */

const METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const;

describe('IAM HTTP contract', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    app = await createApp(
      loadAppConfig({
        NODE_ENV: 'test',
        LOG_LEVEL: 'info',
        DATABASE_URL: 'postgresql://vertex:unused@127.0.0.1:1/vertex_os',
      }),
      testAuthConfig(),
      testProvisioningConfig(),
      { logStream: { write: () => undefined } },
    );
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  function iamOperations() {
    const document = createOpenApiDocument(app);
    return Object.entries(document.paths)
      .filter(([path]) => path.startsWith('/api/iam'))
      .flatMap(([path, item]) =>
        METHODS.flatMap((method) => {
          const operation = item[method];
          return operation === undefined
            ? []
            : [{ route: `${method.toUpperCase()} ${path}`, method, operation }];
        }),
      );
  }

  it('documents exactly the routes of spec Section 25.2 to 25.8', () => {
    expect(
      iamOperations()
        .map(({ route }) => route)
        .sort(),
    ).toEqual(Object.keys(IAM_ROUTES).sort());
  });

  it('declares on every IAM handler exactly the permission and the success status of its route', () => {
    const reflector = new Reflector();
    const declared: Record<string, string | null> = {};
    const answered: Record<string, number> = {};
    for (const module of app.get(ModulesContainer).values()) {
      for (const wrapper of module.controllers.values()) {
        const controller = wrapper.metatype as { prototype: object } | undefined;
        const base = controller ? Reflect.getMetadata('path', controller) : undefined;
        if (typeof base !== 'string' || !base.startsWith('iam')) continue;
        for (const name of Object.getOwnPropertyNames(controller?.prototype ?? {})) {
          const handler = (controller?.prototype as Record<string, unknown>)[name];
          if (typeof handler !== 'function' || name === 'constructor') continue;
          const path = Reflect.getMetadata('path', handler) as string | undefined;
          const method = Reflect.getMetadata('method', handler) as number | undefined;
          if (path === undefined || method === undefined) continue;
          const verb = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'][method];
          const full =
            `/api/${[base, path].filter((part) => part !== '/' && part !== '').join('/')}`
              .replace(/:(\w+)/g, '{$1}')
              .replace(/\/$/, '');
          declared[`${verb} ${full}`] =
            reflector.get<string | undefined>('vertex:required-permission', handler) ?? null;
          answered[`${verb} ${full}`] =
            (Reflect.getMetadata('__httpCode__', handler) as number | undefined) ??
            (verb === 'POST' ? 201 : 200);
        }
      }
    }
    expect(declared).toEqual(IAM_ROUTES);
    // The documented success status is the one the route answers (review T-5).
    const documented = Object.fromEntries(
      iamOperations().map(({ route, operation }) => [
        route,
        Number(Object.keys(operation.responses).find((status) => status.startsWith('2'))),
      ]),
    );
    expect(documented).toEqual(answered);
  });

  it('describes the session, the CSRF header, the body and every problem of each operation', () => {
    const document = createOpenApiDocument(app);
    for (const { route, method, operation } of iamOperations()) {
      const responses = operation.responses as Record<string, { content?: object }>;
      for (const status of ['400', '401', '403', '503']) {
        expect(responses[status]?.content, `${route} ${status}`).toHaveProperty([
          'application/problem+json',
        ]);
      }
      expect(operation.security, route).toEqual([{ session: [] }]);
      const csrf = (operation.parameters ?? []).some(
        (parameter) => 'name' in parameter && parameter.name === 'X-CSRF-Token',
      );
      expect(csrf, route).toBe(method !== 'get');
      const body = operation.requestBody as
        { content: { 'application/json': { schema: { $ref: string } } } } | undefined;
      if (body !== undefined) {
        const name = body.content['application/json'].schema.$ref.split('/').pop() ?? '';
        expect(document.components?.schemas?.[name], route).toMatchObject({
          additionalProperties: false,
        });
      }
    }
  });

  it('documents the optional reason when a role is removed (IAM-R08B D-02)', () => {
    const operation =
      createOpenApiDocument(app).paths['/api/iam/users/{userId}/roles/{roleId}']?.delete;
    expect(operation?.requestBody).toMatchObject({
      required: false,
      content: {
        'application/json': { schema: { $ref: '#/components/schemas/IamReasonRequest' } },
      },
    });
  });

  it('documents the back-channel logout body and its 400 answer (CP1-18)', () => {
    const operation = createOpenApiDocument(app).paths['/api/auth/backchannel-logout']?.post;
    expect(operation?.requestBody).toMatchObject({
      required: true,
      content: {
        'application/x-www-form-urlencoded': {
          schema: { required: ['logout_token'], properties: { logout_token: { type: 'string' } } },
        },
      },
    });
    expect(operation?.responses['400']).toMatchObject({
      content: { 'application/json': { schema: { required: ['error'] } } },
    });
  });

  it('answers every refusal with one status and code, spelled as spec Section 27 spells it', () => {
    expect(new Set(IAM_PROBLEM_CODES).size).toBe(IAM_PROBLEM_CODES.length);
    const answer = (refusal: Parameters<typeof refusalProblem>[0], entity?: 'role') => {
      const problem = refusalProblem(refusal, entity);
      return [problem.getStatus(), problem.errorCode];
    };
    expect(answer({ outcome: 'grant-exceeds-actor' })).toEqual([403, 'IAM_GRANT_EXCEEDS_ACTOR']);
    expect(answer({ outcome: 'last-system-admin' })).toEqual([409, 'IAM_LAST_SYSTEM_ADMIN']);
    expect(answer({ outcome: 'primary-conflict' })).toEqual([
      422,
      'IAM_PRIMARY_DEPARTMENT_CONFLICT',
    ]);
    expect(answer({ outcome: 'not-invited' })).toEqual([409, 'IAM_INVITATION_NOT_APPLICABLE']);
    expect(answer({ outcome: 'superseded' })).toEqual([409, 'IAM_OPERATION_SUPERSEDED']);
    expect(answer({ outcome: 'code-taken' }, 'role')).toEqual([409, 'IAM_ROLE_CODE_CONFLICT']);
    expect(answer({ outcome: 'identity-failed', failure: 'identity-conflict' })).toEqual([
      409,
      'IAM_IDENTITY_CONFLICT',
    ]);
    for (const failure of [
      'provider-unavailable',
      'provider-rejected',
      'identity-out-of-sync',
    ] as const) {
      expect(answer({ outcome: 'identity-failed', failure })).toEqual([
        503,
        'IDENTITY_PROVIDER_UNAVAILABLE',
      ]);
    }
    expect(answer({ outcome: 'invalid', field: 'displayName' })).toEqual([
      400,
      'VALIDATION_FAILED',
    ]);
  });

  it('refuses every field but the display name and version on a user update (spec Section 46.5)', () => {
    const fields = (body: unknown) => {
      try {
        parseInput(UpdateUserBody, body);
        return [];
      } catch (error) {
        return (error as { fields: string[] }).fields;
      }
    };
    expect(fields({ expectedVersion: 1, displayName: 'Ada' })).toEqual([]);
    for (const field of ['email', 'accessState', 'identitySubject', 'version', 'id']) {
      expect(fields({ expectedVersion: 1, displayName: 'Ada', [field]: 'x' })).toEqual([field]);
    }
    expect(fields({ expectedVersion: 1, displayName: 'Ada', '<script>': 1 })).toEqual([
      '(unknown field)',
    ]);
    expect(fields({ displayName: 7 })).toEqual(['displayName', 'expectedVersion']);
  });
});
