import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsArray, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

import {
  CurrentPrincipal,
  PlatformOnly,
  RequireAnyPermission,
  RequirePermissions,
  type RequestPrincipal,
} from '../auth/auth.decorators';
import { NotificationService } from './notification.service';

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
  constructor(private readonly notifications: NotificationService) {}

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
  @ApiOperation({ summary: 'Send an in-app announcement to staff' })
  async announce(@Body() dto: SendAnnouncementDto, @CurrentPrincipal() principal: RequestPrincipal) {
    // An announcement is delivered as an in-app message to each named staff
    // user. The delivery row is written by NotificationService before any
    // transmit, so the log is the source of truth about what was queued.
    const userIds = dto.userIds ?? [];
    const created: string[] = [];
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
      created.push(userId);
    }
    return { queued: created.length, recipients: created };
  }

  @Post('templates/:id/toggle')
  @PlatformOnly()
  @RequirePermissions('platform.notification.manage')
  @ApiOperation({ summary: 'Enable or disable a notification template' })
  async toggleTemplate(@Param('id') id: string, @Query('active') active?: string) {
    return this.notifications.setTemplateActive(id, active !== 'false');
  }
}
