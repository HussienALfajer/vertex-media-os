import { applyDecorators } from '@nestjs/common';
import {
  ApiBody,
  ApiCookieAuth,
  ApiHeader,
  ApiParam,
  ApiQuery,
  ApiResponse,
  type ReferenceObject,
} from '@nestjs/swagger';
import { DEFAULT_PAGE_SIZE, MAX_PAGE, MAX_PAGE_SIZE, type PermissionCode } from '@vertex-os/iam';
import { PROBLEM_CONTENT_TYPE } from '../../http/problem-details.js';
import { ProblemDetailsSchema } from '../../openapi/problem-details.schema.js';

/** The IAM permission each route requires (spec Section 19); one spelling for routes and tests. */
export const IAM_PERMISSIONS = {
  usersRead: 'iam.users.read',
  usersCreate: 'iam.users.create',
  usersUpdate: 'iam.users.update',
  usersManageAccess: 'iam.users.manage-access',
  usersManageRoles: 'iam.users.manage-roles',
  usersManageDepartments: 'iam.users.manage-departments',
  rolesRead: 'iam.roles.read',
  rolesManage: 'iam.roles.manage',
  permissionsRead: 'iam.permissions.read',
  departmentsRead: 'iam.departments.read',
  departmentsManage: 'iam.departments.manage',
  sessionsRevoke: 'iam.sessions.revoke',
} as const satisfies Record<string, string>;

export const permission = (code: (typeof IAM_PERMISSIONS)[keyof typeof IAM_PERMISSIONS]) =>
  code as PermissionCode;

const problem = { content: { [PROBLEM_CONTENT_TYPE]: { schema: ProblemDetailsSchema } } };

type ErrorStatus = 400 | 403 | 404 | 409 | 422 | 503;

export interface IamRouteDocs {
  /** The permission the route requires; `undefined` for a route open to any ACTIVE session. */
  readonly permission: PermissionCode | undefined;
  /** Unsafe methods need the session's CSRF token. */
  readonly unsafe: boolean;
  readonly params?: readonly string[];
  readonly body?: ReferenceObject;
  readonly bodyRequired?: boolean;
  readonly success: {
    readonly status: number;
    readonly description: string;
    readonly schema?: ReferenceObject;
  };
  /** Route-specific problem codes by status, beyond the ones every IAM route can answer. */
  readonly errors?: Partial<Record<ErrorStatus, string>>;
}

/**
 * The OpenAPI description of one IAM route: session cookie, CSRF header on unsafe methods, body,
 * success response and every problem response, each as Problem Details (IAM-R07 D-17).
 */
export function IamRoute(docs: IamRouteDocs): MethodDecorator {
  const errors = docs.errors ?? {};
  const forbidden = [
    docs.permission === undefined ? undefined : '`AUTHORIZATION_DENIED`',
    docs.unsafe ? '`CSRF_VALIDATION_FAILED`' : undefined,
    '`IAM_USER_INACTIVE`',
    errors[403],
  ].filter((code): code is string => code !== undefined);
  const decorators = [
    ApiCookieAuth('session'),
    ...(docs.unsafe
      ? [
          ApiHeader({
            name: 'X-CSRF-Token',
            required: true,
            description: 'The session’s token from `GET /api/auth/csrf`.',
          }),
        ]
      : []),
    ...(docs.params ?? []).map((name) =>
      ApiParam({ name, schema: { type: 'string', format: 'uuid' } }),
    ),
    ...(docs.body === undefined
      ? []
      : [ApiBody({ schema: docs.body, required: docs.bodyRequired ?? true })]),
    ApiResponse({
      status: docs.success.status,
      description: docs.success.description,
      ...(docs.success.schema === undefined
        ? {}
        : { content: { 'application/json': { schema: docs.success.schema } } }),
    }),
    ApiResponse({
      status: 400,
      description: ['`VALIDATION_FAILED`', errors[400]].filter(Boolean).join(', '),
      ...problem,
    }),
    ApiResponse({
      status: 401,
      description: '`AUTHENTICATION_REQUIRED`, `AUTH_SESSION_INVALID` or `AUTH_SESSION_EXPIRED`.',
      ...problem,
    }),
    ApiResponse({ status: 403, description: forbidden.join(', '), ...problem }),
    ...([404, 409, 422] as const)
      .filter((status) => errors[status] !== undefined)
      .map((status) => ApiResponse({ status, description: errors[status] ?? '', ...problem })),
    ApiResponse({
      status: 503,
      description: ['`SERVICE_BUSY`', errors[503]].filter(Boolean).join(', '),
      ...problem,
    }),
  ];
  return applyDecorators(...decorators);
}

const pageQueries = [
  ApiQuery({
    name: 'page',
    required: false,
    schema: { type: 'integer', minimum: 1, maximum: MAX_PAGE, default: 1 },
  }),
  ApiQuery({
    name: 'pageSize',
    required: false,
    schema: { type: 'integer', minimum: 1, maximum: MAX_PAGE_SIZE, default: DEFAULT_PAGE_SIZE },
  }),
  ApiQuery({
    name: 'search',
    required: false,
    description: 'Literal, case-insensitive substring; 1–100 characters.',
    schema: { type: 'string', maxLength: 100 },
  }),
];

/** Query parameters of a collection route (IAM-R07 D-03). */
export function PageQueries(
  filters: Readonly<Record<string, { readonly enum?: readonly string[]; readonly uuid?: true }>>,
): MethodDecorator {
  return applyDecorators(
    ...pageQueries,
    ...Object.entries(filters).map(([name, filter]) =>
      ApiQuery({
        name,
        required: false,
        schema:
          filter.uuid === true
            ? { type: 'string', format: 'uuid' }
            : { type: 'string', enum: [...(filter.enum ?? [])] },
      }),
    ),
  );
}
