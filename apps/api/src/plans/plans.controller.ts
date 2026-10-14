import { Body, Controller, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  CurrentPrincipal,
  RequireAnyPermission,
  RequirePermissions,
  type RequestPrincipal,
} from '../auth/auth.decorators';
import { PlansService } from './plans.service';
import type { ActorContext } from '../organizations/organizations.service';
import {
  AssignSubscriptionDto,
  ChangeSubscriptionStatusDto,
  CreatePlanDto,
  UpdatePlanDto,
} from './plans.dto';

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

@ApiTags('plans')
@ApiBearerAuth()
@Controller('plans')
export class PlansController {
  constructor(private readonly plans: PlansService) {}

  @Get()
  @RequireAnyPermission('platform.plan.manage', 'company.subscription.read')
  @ApiOperation({ summary: 'List subscription plans (public catalog for company admins)' })
  list(@Query('includeInactive') includeInactive: string | undefined, @CurrentPrincipal() p: RequestPrincipal) {
    const showInactive = p.kind === 'PLATFORM' && includeInactive !== 'false';
    return this.plans.listPlans(showInactive);
  }

  @Get(':id')
  @RequireAnyPermission('platform.plan.manage', 'company.subscription.read')
  @ApiOperation({ summary: 'Plan detail including included modules' })
  get(@Param('id') id: string) {
    return this.plans.getPlan(id);
  }

  @Post()
  @RequirePermissions('platform.plan.manage')
  @ApiOperation({ summary: 'Create a subscription plan (platform only)' })
  create(@Body() dto: CreatePlanDto, @CurrentPrincipal() p: RequestPrincipal, @Req() req: RequestLike) {
    return this.plans.createPlan(dto, actorFrom(p, req));
  }

  @Patch(':id')
  @RequirePermissions('platform.plan.manage')
  @ApiOperation({ summary: 'Update a subscription plan (platform only)' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdatePlanDto,
    @CurrentPrincipal() p: RequestPrincipal,
    @Req() req: RequestLike,
  ) {
    return this.plans.updatePlan(id, dto, actorFrom(p, req));
  }
}

@ApiTags('subscriptions')
@ApiBearerAuth()
@Controller('subscriptions')
export class SubscriptionsController {
  constructor(private readonly plans: PlansService) {}

  @Get()
  @RequireAnyPermission('platform.subscription.manage', 'company.subscription.read')
  @ApiOperation({ summary: 'List subscriptions (platform sees all, company sees its own)' })
  async list(
    @Query('companyId') companyId: string | undefined,
    @Query('status') status: string | undefined,
    @CurrentPrincipal() p: RequestPrincipal,
  ) {
    const scope = p.kind === 'COMPANY' ? p.company?.companyId : companyId;
    return this.plans.listSubscriptions({ companyId: scope, status });
  }

  @Post('companies/:companyId/assign')
  @RequirePermissions('platform.subscription.manage')
  @ApiOperation({ summary: 'Assign or change a company subscription and its entitlements' })
  assign(
    @Param('companyId') companyId: string,
    @Body() dto: AssignSubscriptionDto,
    @CurrentPrincipal() p: RequestPrincipal,
    @Req() req: RequestLike,
  ) {
    return this.plans.assignSubscription(companyId, dto, actorFrom(p, req));
  }

  @Patch(':id/status')
  @RequirePermissions('platform.subscription.manage')
  @ApiOperation({ summary: 'Change subscription lifecycle status (platform only)' })
  changeStatus(
    @Param('id') id: string,
    @Body() dto: ChangeSubscriptionStatusDto,
    @CurrentPrincipal() p: RequestPrincipal,
    @Req() req: RequestLike,
  ) {
    return this.plans.changeSubscriptionStatus(id, dto, actorFrom(p, req));
  }
}
