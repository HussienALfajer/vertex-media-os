import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  Res,
  UseInterceptors,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { permissionStates, roleStates } from '@vertex-os/iam';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { CURRENT_ACTOR, type CurrentActor } from '../../auth/access.guard.js';
import {
  IAM_ADMINISTRATION,
  IAM_DIRECTORY,
  type IamAdministration,
  type IamDirectory,
} from './capabilities.js';
import { IAM_PERMISSIONS, IamRoute, PageQueries, permission } from './docs.js';
import { isOutcome, refuse } from './iam-problems.js';
import { actorAttribution, NoStoreInterceptor, parseInput, pathId } from './request.js';
import { toPage, toPermission, toRole, toRoleDetail } from './responses.js';
import {
  CreateEntityBody,
  DeactivateRoleBody,
  refs,
  ReplacePermissionsBody,
  StateListQuery,
  UpdateEntityBody,
  VersionBody,
} from './schemas.js';

const READ = permission(IAM_PERMISSIONS.rolesRead);
const MANAGE = permission(IAM_PERMISSIONS.rolesManage);
const CHANGE_ERRORS = {
  404: '`IAM_ROLE_NOT_FOUND`',
  409: '`IAM_VERSION_CONFLICT`, `IAM_SYSTEM_ROLE_PROTECTED`',
} as const;

/**
 * Roles and their permission mappings (spec Section 25.7). The system role's protection, the
 * mapping rules and the grant ceiling are IAM's (spec Sections 20, 23, 23.1).
 */
@ApiTags('iam')
@Controller('iam/roles')
@UseInterceptors(NoStoreInterceptor)
export class RolesController {
  constructor(
    @Inject(CURRENT_ACTOR) private readonly actors: CurrentActor,
    @Inject(IAM_DIRECTORY) private readonly directory: IamDirectory,
    @Inject(IAM_ADMINISTRATION) private readonly administration: IamAdministration,
  ) {}

  @Get()
  @PageQueries({ state: { enum: roleStates } })
  @IamRoute({
    permission: READ,
    unsafe: false,
    success: { status: 200, description: 'One page of roles.', schema: refs.RolePage },
  })
  async list(@Query() query: unknown) {
    const result = await this.directory.listRoles(parseInput(StateListQuery, query));
    if (result.outcome !== 'listed') refuse(result);
    return toPage(result.page, toRole);
  }

  @Post()
  @IamRoute({
    permission: MANAGE,
    unsafe: true,
    body: refs.CreateEntityBody,
    success: {
      status: 201,
      description: 'The ACTIVE custom role, without mappings.',
      schema: refs.Role,
    },
    errors: { 409: '`IAM_ROLE_CODE_CONFLICT`' },
  })
  async create(
    @Body() body: unknown,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const input = parseInput(CreateEntityBody, body);
    const attribution = await actorAttribution(this.actors, request, reply);
    const result = await this.administration.createRole(input, attribution);
    if (result.outcome !== 'created') refuse(result, 'role');
    return toRole(result.role);
  }

  @Get(':roleId')
  @IamRoute({
    permission: READ,
    unsafe: false,
    params: ['roleId'],
    success: {
      status: 200,
      description: 'The role and its mapped codes.',
      schema: refs.RoleDetail,
    },
    errors: { 404: '`IAM_ROLE_NOT_FOUND`' },
  })
  async detail(@Param('roleId') roleId: string) {
    const result = await this.directory.getRole({ roleId: pathId('roleId', roleId) });
    if (result.outcome !== 'found') refuse(result);
    return toRoleDetail(result.role, result.role.permissionCodes);
  }

  @Patch(':roleId')
  @IamRoute({
    permission: MANAGE,
    unsafe: true,
    params: ['roleId'],
    body: refs.UpdateEntityBody,
    success: { status: 200, description: 'The role.', schema: refs.Role },
    errors: CHANGE_ERRORS,
  })
  async update(
    @Param('roleId') roleId: string,
    @Body() body: unknown,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const input = parseInput(UpdateEntityBody, body);
    const id = pathId('roleId', roleId);
    const attribution = await actorAttribution(this.actors, request, reply);
    const result = await this.administration.updateRole({ roleId: id, ...input }, attribution);
    if (!isOutcome(result, 'updated', 'unchanged')) refuse(result);
    return toRole(result.role);
  }

  @Post(':roleId/activate')
  @HttpCode(200)
  @IamRoute({
    permission: MANAGE,
    unsafe: true,
    params: ['roleId'],
    body: refs.VersionBody,
    success: { status: 200, description: 'The role, ACTIVE.', schema: refs.Role },
    errors: { ...CHANGE_ERRORS, 403: '`IAM_GRANT_EXCEEDS_ACTOR`' },
  })
  async activate(
    @Param('roleId') roleId: string,
    @Body() body: unknown,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const input = parseInput(VersionBody, body);
    const id = pathId('roleId', roleId);
    const attribution = await actorAttribution(this.actors, request, reply);
    const result = await this.administration.activateRole(
      { roleId: id, expectedVersion: input.expectedVersion },
      attribution,
    );
    if (!isOutcome(result, 'updated', 'unchanged')) refuse(result);
    return toRole(result.role);
  }

  @Post(':roleId/deactivate')
  @HttpCode(200)
  @IamRoute({
    permission: MANAGE,
    unsafe: true,
    params: ['roleId'],
    body: refs.DeactivateRoleBody,
    success: { status: 200, description: 'The role, INACTIVE.', schema: refs.Role },
    errors: CHANGE_ERRORS,
  })
  async deactivate(
    @Param('roleId') roleId: string,
    @Body() body: unknown,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const input = parseInput(DeactivateRoleBody, body);
    const id = pathId('roleId', roleId);
    const attribution = await actorAttribution(this.actors, request, reply, input.reason);
    const result = await this.administration.deactivateRole(
      { roleId: id, expectedVersion: input.expectedVersion },
      attribution,
    );
    if (!isOutcome(result, 'updated', 'unchanged')) refuse(result);
    return toRole(result.role);
  }

  @Put(':roleId/permissions')
  @IamRoute({
    permission: MANAGE,
    unsafe: true,
    params: ['roleId'],
    body: refs.ReplacePermissionsBody,
    success: {
      status: 200,
      description: 'The role and its mapped codes after the replacement.',
      schema: refs.RoleDetail,
    },
    errors: {
      ...CHANGE_ERRORS,
      403: '`IAM_GRANT_EXCEEDS_ACTOR`',
      409: `${CHANGE_ERRORS[409]}, \`IAM_PERMISSION_NOT_ASSIGNABLE\``,
      422: '`IAM_UNKNOWN_PERMISSION`',
    },
  })
  async replacePermissions(
    @Param('roleId') roleId: string,
    @Body() body: unknown,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const input = parseInput(ReplacePermissionsBody, body);
    const id = pathId('roleId', roleId);
    const attribution = await actorAttribution(this.actors, request, reply, input.reason);
    const result = await this.administration.replaceRolePermissions(
      {
        roleId: id,
        expectedVersion: input.expectedVersion,
        permissionCodes: input.permissionCodes,
      },
      attribution,
    );
    if (!isOutcome(result, 'updated', 'unchanged')) refuse(result);
    return toRoleDetail(result.role, result.permissionCodes);
  }
}

/** The permission catalog (spec Section 25.8): read-only over HTTP. */
@ApiTags('iam')
@Controller('iam/permissions')
@UseInterceptors(NoStoreInterceptor)
export class PermissionsController {
  constructor(@Inject(IAM_DIRECTORY) private readonly directory: IamDirectory) {}

  @Get()
  @PageQueries({ state: { enum: permissionStates } })
  @IamRoute({
    permission: permission(IAM_PERMISSIONS.permissionsRead),
    unsafe: false,
    success: {
      status: 200,
      description: 'One page of the permission catalog.',
      schema: refs.PermissionPage,
    },
  })
  async list(@Query() query: unknown) {
    const result = await this.directory.listPermissions(parseInput(StateListQuery, query));
    if (result.outcome !== 'listed') refuse(result);
    return toPage(result.page, toPermission);
  }
}
