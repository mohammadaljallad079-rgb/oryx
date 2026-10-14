import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  CurrentPrincipal,
  RequireAnyPermission,
  RequirePermissions,
  type RequestPrincipal,
} from '../auth/auth.decorators';
import { OrganizationsService, type ActorContext } from './organizations.service';
import {
  CreateBranchDto,
  CreateCompanyDto,
  ListQueryDto,
  SetCompanyStatusDto,
  UpdateBranchDto,
  UpdateCompanyDto,
} from './organizations.dto';

interface RequestLike {
  ip?: string;
  headers: Record<string, string | string[] | undefined>;
}

function actorFrom(principal: RequestPrincipal, req: RequestLike): ActorContext {
  const ua = req.headers['user-agent'];
  return {
    userId: principal.userId,
    kind: principal.kind,
    companyId: principal.company?.companyId,
    isSuperAdmin: principal.kind === 'PLATFORM',
    ip: req.ip,
    userAgent: Array.isArray(ua) ? ua[0] : ua,
  };
}

@ApiTags('organizations')
@ApiBearerAuth()
@Controller('companies')
export class CompaniesController {
  constructor(private readonly orgs: OrganizationsService) {}

  @Get()
  @RequireAnyPermission('platform.company.read', 'company.read')
  @ApiOperation({ summary: 'List companies visible to the current principal' })
  list(@Query() query: ListQueryDto, @CurrentPrincipal() p: RequestPrincipal, @Req() req: RequestLike) {
    return this.orgs.listCompanies(query, actorFrom(p, req));
  }

  @Post()
  @RequirePermissions('platform.company.create')
  @ApiOperation({ summary: 'Provision a new internal company or SaaS tenant' })
  create(@Body() dto: CreateCompanyDto, @CurrentPrincipal() p: RequestPrincipal, @Req() req: RequestLike) {
    return this.orgs.createCompany(dto, actorFrom(p, req));
  }

  @Get(':id')
  @RequireAnyPermission('platform.company.read', 'company.read')
  @ApiOperation({ summary: 'Company detail including current subscription' })
  get(@Param('id') id: string, @CurrentPrincipal() p: RequestPrincipal, @Req() req: RequestLike) {
    return this.orgs.getCompany(id, actorFrom(p, req));
  }

  @Patch(':id')
  @RequireAnyPermission('platform.company.update', 'company.update')
  @ApiOperation({ summary: 'Update company profile' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateCompanyDto,
    @CurrentPrincipal() p: RequestPrincipal,
    @Req() req: RequestLike,
  ) {
    return this.orgs.updateCompany(id, dto, actorFrom(p, req));
  }

  @Patch(':id/status')
  @RequirePermissions('platform.company.suspend')
  @ApiOperation({ summary: 'Activate, suspend or archive a company (platform only)' })
  setStatus(
    @Param('id') id: string,
    @Body() dto: SetCompanyStatusDto,
    @CurrentPrincipal() p: RequestPrincipal,
    @Req() req: RequestLike,
  ) {
    return this.orgs.setCompanyStatus(id, dto.status, dto.reason, actorFrom(p, req));
  }

  @Get(':companyId/branches')
  @RequireAnyPermission('platform.branch.manage', 'company.branch.read')
  @ApiOperation({ summary: 'List branches of a company' })
  branches(
    @Param('companyId') companyId: string,
    @Query() query: ListQueryDto,
    @CurrentPrincipal() p: RequestPrincipal,
    @Req() req: RequestLike,
  ) {
    return this.orgs.listBranches(companyId, query, actorFrom(p, req));
  }

  @Post(':companyId/branches')
  @RequireAnyPermission('platform.branch.manage', 'company.branch.create')
  @ApiOperation({ summary: 'Create a branch within plan limits' })
  createBranch(
    @Param('companyId') companyId: string,
    @Body() dto: CreateBranchDto,
    @CurrentPrincipal() p: RequestPrincipal,
    @Req() req: RequestLike,
  ) {
    return this.orgs.createBranch(companyId, dto, actorFrom(p, req));
  }
}

@ApiTags('branches')
@ApiBearerAuth()
@Controller('branches')
export class BranchesController {
  constructor(private readonly orgs: OrganizationsService) {}

  @Patch(':id')
  @RequireAnyPermission('platform.branch.manage', 'company.branch.update')
  @ApiOperation({ summary: 'Update a branch' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateBranchDto,
    @CurrentPrincipal() p: RequestPrincipal,
    @Req() req: RequestLike,
  ) {
    return this.orgs.updateBranch(id, dto, actorFrom(p, req));
  }

  @Delete(':id')
  @RequireAnyPermission('platform.branch.manage', 'company.branch.delete')
  @ApiOperation({ summary: 'Deactivate a branch (soft delete)' })
  remove(@Param('id') id: string, @CurrentPrincipal() p: RequestPrincipal, @Req() req: RequestLike) {
    return this.orgs.deleteBranch(id, actorFrom(p, req));
  }
}
