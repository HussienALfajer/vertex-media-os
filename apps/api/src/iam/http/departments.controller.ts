import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseInterceptors,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { departmentStates } from '@vertex-os/iam';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { CURRENT_ACTOR, RequirePermission, type CurrentActor } from '../../auth/access.guard.js';
import {
  IAM_ADMINISTRATION,
  IAM_DIRECTORY,
  type IamAdministration,
  type IamDirectory,
} from './capabilities.js';
import { IAM_PERMISSIONS, IamRoute, PageQueries, permission } from './docs.js';
import { isOutcome, refuse } from './iam-problems.js';
import { actorAttribution, NoStoreInterceptor, parseInput, pathId } from './request.js';
import { toDepartment, toPage } from './responses.js';
import {
  CreateEntityBody,
  refs,
  StateListQuery,
  UpdateEntityBody,
  VersionBody,
} from './schemas.js';

const READ = permission(IAM_PERMISSIONS.departmentsRead);
const MANAGE = permission(IAM_PERMISSIONS.departmentsManage);
const NOT_FOUND = '`IAM_DEPARTMENT_NOT_FOUND`';

/** Departments (spec Section 25.6); IAM keeps the rules and the version checks. */
@ApiTags('iam')
@Controller('iam/departments')
@UseInterceptors(NoStoreInterceptor)
export class DepartmentsController {
  constructor(
    @Inject(CURRENT_ACTOR) private readonly actors: CurrentActor,
    @Inject(IAM_DIRECTORY) private readonly directory: IamDirectory,
    @Inject(IAM_ADMINISTRATION) private readonly administration: IamAdministration,
  ) {}

  @Get()
  @RequirePermission(READ)
  @PageQueries({ state: { enum: departmentStates } })
  @IamRoute({
    permission: READ,
    unsafe: false,
    success: { status: 200, description: 'One page of departments.', schema: refs.DepartmentPage },
  })
  async list(@Query() query: unknown) {
    const result = await this.directory.listDepartments(parseInput(StateListQuery, query));
    if (result.outcome !== 'listed') refuse(result);
    return toPage(result.page, toDepartment);
  }

  @Post()
  @RequirePermission(MANAGE)
  @IamRoute({
    permission: MANAGE,
    unsafe: true,
    body: refs.CreateEntityBody,
    success: { status: 201, description: 'The ACTIVE department.', schema: refs.Department },
    errors: { 409: '`IAM_DEPARTMENT_CODE_CONFLICT`' },
  })
  async create(
    @Body() body: unknown,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const input = parseInput(CreateEntityBody, body);
    const attribution = await actorAttribution(this.actors, request, reply);
    const result = await this.administration.createDepartment(input, attribution);
    if (result.outcome !== 'created') refuse(result, 'department');
    return toDepartment(result.department);
  }

  @Get(':departmentId')
  @RequirePermission(READ)
  @IamRoute({
    permission: READ,
    unsafe: false,
    params: ['departmentId'],
    success: { status: 200, description: 'The department.', schema: refs.Department },
    errors: { 404: NOT_FOUND },
  })
  async detail(@Param('departmentId') departmentId: string) {
    const result = await this.directory.getDepartment({
      departmentId: pathId('departmentId', departmentId),
    });
    if (result.outcome !== 'found') refuse(result);
    return toDepartment(result.department);
  }

  @Patch(':departmentId')
  @RequirePermission(MANAGE)
  @IamRoute({
    permission: MANAGE,
    unsafe: true,
    params: ['departmentId'],
    body: refs.UpdateEntityBody,
    success: { status: 200, description: 'The department.', schema: refs.Department },
    errors: { 404: NOT_FOUND, 409: '`IAM_VERSION_CONFLICT`' },
  })
  async update(
    @Param('departmentId') departmentId: string,
    @Body() body: unknown,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const input = parseInput(UpdateEntityBody, body);
    const id = pathId('departmentId', departmentId);
    const attribution = await actorAttribution(this.actors, request, reply);
    const result = await this.administration.updateDepartment(
      { departmentId: id, ...input },
      attribution,
    );
    if (!isOutcome(result, 'updated', 'unchanged')) refuse(result);
    return toDepartment(result.department);
  }

  @Post(':departmentId/activate')
  @HttpCode(200)
  @RequirePermission(MANAGE)
  @IamRoute(stateDocs('ACTIVE'))
  activate(
    @Param('departmentId') departmentId: string,
    @Body() body: unknown,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    return this.changeState('activateDepartment', departmentId, body, request, reply);
  }

  @Post(':departmentId/deactivate')
  @HttpCode(200)
  @RequirePermission(MANAGE)
  @IamRoute(stateDocs('INACTIVE'))
  deactivate(
    @Param('departmentId') departmentId: string,
    @Body() body: unknown,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    return this.changeState('deactivateDepartment', departmentId, body, request, reply);
  }

  private async changeState(
    operation: 'activateDepartment' | 'deactivateDepartment',
    departmentId: string,
    body: unknown,
    request: FastifyRequest,
    reply: FastifyReply,
  ) {
    const input = parseInput(VersionBody, body);
    const id = pathId('departmentId', departmentId);
    const attribution = await actorAttribution(this.actors, request, reply);
    const result = await this.administration[operation](
      { departmentId: id, expectedVersion: input.expectedVersion },
      attribution,
    );
    if (!isOutcome(result, 'updated', 'unchanged')) refuse(result);
    return toDepartment(result.department);
  }
}

function stateDocs(state: 'ACTIVE' | 'INACTIVE') {
  return {
    permission: MANAGE,
    unsafe: true,
    params: ['departmentId'],
    body: refs.VersionBody,
    success: { status: 200, description: `The department, ${state}.`, schema: refs.Department },
    errors: { 404: NOT_FOUND, 409: '`IAM_VERSION_CONFLICT`' },
  } as const;
}
