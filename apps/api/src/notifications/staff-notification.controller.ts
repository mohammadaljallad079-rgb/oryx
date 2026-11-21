import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

import {
  CurrentPrincipal,
  PlatformOnly,
  RequireAnyPermission,
  RequirePermissions,
  type RequestPrincipal,
} from '../auth/auth.decorators';
import { NotificationService } from './notification.service';
import { PrismaService } from '../common/prisma.service';

/**
 * Ceiling on a customer broadcast.
 *
 * A single request must not be able to queue an unbounded number of delivery
 * rows, so `allCustomers` is capped. The response reports how many were queued,
 * which is what tells an operator the cap was reached.
 */
const MAX_ANNOUNCEMENT_RECIPIENTS = 5_000;

class SendAnnouncementDto {
  @IsString()
  @MaxLength(120)
  title!: string;

  @IsString()
  @MaxLength(4000)
  body!: string;

  /** Restrict to one tenant; omit to address every company's staff. */
  @IsOptional()
  @IsString()
  companyId?: string;

  @IsOptional()
  @IsIn(['INFO', 'WARNING', 'CRITICAL'])
  severity?: 'INFO' | 'WARNING' | 'CRITICAL';

  /** Staff user ids to notify. Omit to notify the whole company. */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  userIds?: string[];

  /**
   * Customer account ids to notify on the consumer plane.
   *
   * Separate from `userIds`: a customer account is not a staff user, and the
   * consumer inbox reads only rows carrying `customerAccountId`. An operator can
   * address both audiences in one call by supplying both lists.
   */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  customerAccountIds?: string[];

  /** Address every active customer account. Bounded by `announceMaxRecipients`. */
  @IsOptional()
  @IsBoolean()
  allCustomers?: boolean;
}

/**
 * The staff notification centre.
 *
 * This is the operator-facing counterpart to the customer notification centre.
 * It exposes the **delivery log** — what was sent, on which channel, and whether
 * the provider accepted it — plus the templates an operator can review. It is
 * platform-scoped: a company administrator never sees another tenant's
 * deliveries, and the customer plane never reaches it at all.
 */
@ApiTags('notifications')
@ApiBearerAuth()
@Controller('notifications')
export class StaffNotificationController {
  constructor(
    private readonly notifications: NotificationService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('deliveries')
  @PlatformOnly()
  @RequireAnyPermission('platform.notification.read', 'platform.notification.manage')
  @ApiOperation({ summary: 'Delivery log across the platform' })
  async listDeliveries(
    @Query('companyId') companyId?: string,
    @Query('channel') channel?: string,
    @Query('status') status?: string,
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '25',
  ) {
    return this.notifications.listDeliveries({
      companyId: companyId || null,
      channel: channel || undefined,
      status: status || undefined,
      page: Math.max(1, Number(page) || 1),
      pageSize: Math.min(100, Math.max(1, Number(pageSize) || 25)),
    });
  }

  @Get('summary')
  @PlatformOnly()
  @RequireAnyPermission('platform.notification.read', 'platform.notification.manage')
  @ApiOperation({ summary: 'Channel and status breakdown' })
  async summary(@Query('companyId') companyId?: string) {
    const breakdown = await this.notifications.deliveryBreakdown(companyId || null);
    return { ...breakdown, templates: await this.notifications.listTemplates() };
  }

  @Get('templates')
  @PlatformOnly()
  @RequireAnyPermission('platform.notification.read', 'platform.notification.manage')
  @ApiOperation({ summary: 'Notification templates' })
  async templates() {
    return { items: await this.notifications.listTemplates() };
  }

  @Post('announcements')
  @PlatformOnly()
  @RequirePermissions('platform.notification.manage')
  @ApiOperation({ summary: 'Send an in-app announcement to staff and/or customers' })
  async announce(@Body() dto: SendAnnouncementDto, @CurrentPrincipal() principal: RequestPrincipal) {
    // An announcement is delivered as an in-app message to each named recipient.
    // The delivery row is written by NotificationService before any transmit, so
    // the log is the source of truth about what was queued.
    //
    // Staff and customers are addressed through separate id spaces: a staff
    // `userId` is not a `CustomerAccount.id`, and the consumer inbox reads only
    // rows carrying `customerAccountId`. Keeping the two lists apart is what
    // stops a staff announcement from silently reaching no customer at all.
    const userIds = dto.userIds ?? [];

    let customerAccountIds = dto.customerAccountIds ?? [];
    if (dto.allCustomers) {
      const accounts = await this.prisma.customerAccount.findMany({
        where: { status: 'ACTIVE' },
        select: { id: true },
        orderBy: { createdAt: 'asc' },
        take: MAX_ANNOUNCEMENT_RECIPIENTS,
      });
      // The explicit list is additive, so an operator may address a broadcast
      // plus a few accounts that are not active yet.
      customerAccountIds = [...new Set([...customerAccountIds, ...accounts.map((a) => a.id)])];
    }

    const staffRecipients: string[] = [];
    for (const userId of userIds) {
      await this.notifications.notify({
        companyId: dto.companyId ?? null,
        userId,
        channel: 'IN_APP',
        category: dto.severity ?? 'INFO',
        fallbackSubject: dto.title,
        fallbackBody: dto.body,
        entityType: 'ANNOUNCEMENT',
        entityId: principal.userId,
      });
      staffRecipients.push(userId);
    }

    const customerRecipients: string[] = [];
    for (const accountId of customerAccountIds) {
      await this.notifications.notify({
        companyId: dto.companyId ?? null,
        customerAccountId: accountId,
        channel: 'IN_APP',
        category: dto.severity ?? 'INFO',
        fallbackSubject: dto.title,
        fallbackBody: dto.body,
        entityType: 'ANNOUNCEMENT',
        entityId: principal.userId,
      });
      customerRecipients.push(accountId);
    }

    return {
      queued: staffRecipients.length + customerRecipients.length,
      recipients: staffRecipients,
      customerRecipients,
    };
  }

  @Post('templates/:id/toggle')
  @PlatformOnly()
  @RequirePermissions('platform.notification.manage')
  @ApiOperation({ summary: 'Enable or disable a notification template' })
  async toggleTemplate(@Param('id') id: string, @Query('active') active?: string) {
    return this.notifications.setTemplateActive(id, active !== 'false');
  }
}
