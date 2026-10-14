import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, MaxLength, Min, Max } from 'class-validator';
import { CurrentPrincipal, RequirePermissions, type RequestPrincipal } from '../auth/auth.decorators';
import { PrismaService } from '../common/prisma.service';
import { AuditService } from '../common/audit.service';
import { badRequest, ERROR_CODES, forbidden, notFound } from '../common/errors';

class OpenSupportSessionDto {
  @IsString()
  companyId!: string;

  @IsString()
  @MaxLength(300)
  reason!: string;

  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(240)
  minutes?: number;
}

interface RequestLike {
  ip?: string;
  headers: Record<string, string | string[] | undefined>;
}

/**
 * Super Admin support access. A support session is explicit, reasoned, time
 * bounded and audited. Until it is opened, a platform principal carries no
 * tenant company scope, so tenant data is unreachable by default.
 */
@ApiTags('support')
@ApiBearerAuth()
@Controller('support-sessions')
export class SupportController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @RequirePermissions('platform.support.access')
  @ApiOperation({ summary: 'List support sessions (active and historical)' })
  async list(@CurrentPrincipal() principal: RequestPrincipal) {
    const sessions = await this.prisma.supportSession.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { company: { select: { nameEn: true, nameAr: true } }, actor: { select: { email: true } } },
    });
    return sessions.map((s) => ({
      id: s.id,
      companyId: s.companyId,
      companyNameEn: s.company.nameEn,
      companyNameAr: s.company.nameAr,
      actorEmail: s.actor.email,
      reason: s.reason,
      status: s.status,
      expiresAt: s.expiresAt.toISOString(),
      endedAt: s.endedAt?.toISOString() ?? null,
      createdAt: s.createdAt.toISOString(),
      isCurrent: s.actorUserId === principal.userId && s.status === 'ACTIVE' && s.expiresAt > new Date(),
    }));
  }

  @Post()
  @RequirePermissions('platform.support.access')
  @ApiOperation({ summary: 'Open a time-bounded, audited support session into a tenant' })
  async open(
    @Body() dto: OpenSupportSessionDto,
    @CurrentPrincipal() principal: RequestPrincipal,
    @Req() req: RequestLike,
  ) {
    if (principal.kind !== 'PLATFORM') {
      throw forbidden(ERROR_CODES.FORBIDDEN_PLATFORM_ONLY, 'Support sessions require a platform administrator.');
    }
    const company = await this.prisma.company.findUnique({ where: { id: dto.companyId } });
    if (!company) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Company not found.');
    if (dto.reason.trim().length < 10) {
      throw badRequest(ERROR_CODES.VALIDATION_FAILED, 'A support reason of at least 10 characters is required.');
    }

    const minutes = dto.minutes ?? 60;
    const session = await this.prisma.supportSession.create({
      data: {
        actorUserId: principal.userId,
        companyId: dto.companyId,
        reason: dto.reason,
        expiresAt: new Date(Date.now() + minutes * 60_000),
      },
    });

    await this.audit.record({
      actorUserId: principal.userId,
      companyId: dto.companyId,
      action: 'support.session_opened',
      targetType: 'SUPPORT_SESSION',
      targetId: session.id,
      summary: `Support session opened for ${company.nameEn} for ${minutes} minutes`,
      metadata: { reason: dto.reason, minutes },
      ipAddress: req.ip,
    });

    return {
      id: session.id,
      companyId: session.companyId,
      companyNameEn: company.nameEn,
      companyNameAr: company.nameAr,
      status: session.status,
      expiresAt: session.expiresAt.toISOString(),
      // Send this value in the x-oryx-support-session header to act inside the tenant.
      supportSessionId: session.id,
    };
  }

  @Post(':id/end')
  @RequirePermissions('platform.support.access')
  @ApiOperation({ summary: 'End a support session immediately' })
  async end(@Param('id') id: string, @CurrentPrincipal() principal: RequestPrincipal) {
    const session = await this.prisma.supportSession.findUnique({ where: { id } });
    if (!session) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Support session not found.');
    if (session.actorUserId !== principal.userId && principal.kind !== 'PLATFORM') {
      throw forbidden(ERROR_CODES.FORBIDDEN_PERMISSION, 'Only the session owner may end this session.');
    }
    await this.prisma.supportSession.update({
      where: { id },
      data: { status: 'ENDED', endedAt: new Date() },
    });
    await this.audit.record({
      actorUserId: principal.userId,
      companyId: session.companyId,
      action: 'support.session_ended',
      targetType: 'SUPPORT_SESSION',
      targetId: id,
      summary: 'Support session ended',
    });
    return { ok: true };
  }
}
