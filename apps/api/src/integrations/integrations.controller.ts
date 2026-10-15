import { Body, Controller, Get, Param, Post, Put, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import {
  CurrentPrincipal,
  RequirePermissions,
  type RequestPrincipal,
} from '../auth/auth.decorators';
import { PrincipalGuard } from '../auth/principal.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { AuditService } from '../common/audit.service';
import { IntegrationsService } from './integrations.service';
import { SaveCredentialsDto, SetEnabledDto } from './integrations.dto';

/**
 * The External Integrations Center (Super Admin plane).
 *
 * Three permissions separate the jobs: `read` shows status, `manage` changes
 * credentials and enablement, and `verify` runs a live connection test. An
 * operator who can look at the integration list is not automatically allowed to
 * overwrite a payment gateway's secret.
 *
 * Credential values are write-only. The response never contains a value; it
 * contains whether one is stored and, for a non-secret identifier, its last four
 * characters. Every mutation is audited with the *keys* that changed, never the
 * values.
 */
@ApiTags('integrations')
@ApiBearerAuth()
@Controller('integrations')
@UseGuards(PrincipalGuard, PermissionsGuard)
export class IntegrationsController {
  constructor(
    private readonly integrations: IntegrationsService,
    private readonly audit: AuditService,
  ) {}

  private actor(principal: RequestPrincipal, req: Request) {
    return {
      userId: principal.userId,
      companyId: principal.activeCompanyId ?? null,
      ipAddress: req.ip ?? null,
      userAgent: req.headers['user-agent'] ?? null,
    };
  }

  @Get()
  @RequirePermissions('platform.integration.read')
  @ApiOperation({ summary: 'Integration center: every provider with its live state' })
  async center() {
    // Platform-scoped: this is the deployment-wide view the Super Admin needs.
    return this.integrations.center(null);
  }

  @Get(':key')
  @RequirePermissions('platform.integration.read')
  @ApiOperation({ summary: 'One provider with its recent verification history' })
  async detail(@Param('key') key: string) {
    return this.integrations.detail(key.toUpperCase(), null);
  }

  @Put(':key/credentials')
  @RequirePermissions('platform.integration.manage')
  @ApiOperation({ summary: 'Store or clear provider credentials (sealed at rest)' })
  async saveCredentials(
    @Param('key') key: string,
    @Body() dto: SaveCredentialsDto,
    @CurrentPrincipal() principal: RequestPrincipal,
    @Req() req: Request,
  ) {
    const providerKey = key.toUpperCase();
    const result = await this.integrations.saveCredentials(
      providerKey,
      { credentials: dto.credentials, companyId: null },
      this.actor(principal, req),
    );

    await this.audit.record({
      actorUserId: principal.userId,
      action: 'integration.credentials_updated',
      targetType: 'INTEGRATION_PROVIDER',
      targetId: providerKey,
      summary: `Updated ${dto.credentials.length} credential key(s) for ${providerKey}.`,
      // Keys only. A value must never reach the audit log.
      metadata: { credentialKeys: dto.credentials.map((c) => c.key) },
      ipAddress: req.ip ?? null,
      userAgent: req.headers['user-agent'] ?? null,
    });

    return result;
  }

  @Put(':key/enabled')
  @RequirePermissions('platform.integration.manage')
  @ApiOperation({ summary: 'Enable or disable a provider for the deployment' })
  async setEnabled(
    @Param('key') key: string,
    @Body() dto: SetEnabledDto,
    @CurrentPrincipal() principal: RequestPrincipal,
    @Req() req: Request,
  ) {
    const providerKey = key.toUpperCase();
    const result = await this.integrations.setEnabled(
      providerKey,
      { enabled: dto.enabled, reason: dto.reason, companyId: null },
      this.actor(principal, req),
    );

    await this.audit.record({
      actorUserId: principal.userId,
      action: dto.enabled ? 'integration.enabled' : 'integration.disabled',
      targetType: 'INTEGRATION_PROVIDER',
      targetId: providerKey,
      summary: `${dto.enabled ? 'Enabled' : 'Disabled'} ${providerKey}${
        dto.reason ? `: ${dto.reason}` : '.'
      }`,
      ipAddress: req.ip ?? null,
      userAgent: req.headers['user-agent'] ?? null,
    });

    return result;
  }

  @Post(':key/verify')
  @RequirePermissions('platform.integration.verify')
  @ApiOperation({
    summary: 'Run a live connection test',
    description:
      'Reports VERIFIED only when a real call succeeded. An adapter whose vendor call is not ' +
      'implemented reports INCOMPLETE rather than claiming success.',
  })
  async verify(
    @Param('key') key: string,
    @CurrentPrincipal() principal: RequestPrincipal,
    @Req() req: Request,
  ) {
    const providerKey = key.toUpperCase();
    const result = await this.integrations.verify(
      providerKey,
      null,
      this.actor(principal, req),
    );

    await this.audit.record({
      actorUserId: principal.userId,
      action: 'integration.verified',
      targetType: 'INTEGRATION_PROVIDER',
      targetId: providerKey,
      summary: `Verification for ${providerKey} returned ${result.provider.verificationStatus}.`,
      metadata: { status: result.provider.verificationStatus },
      ipAddress: req.ip ?? null,
      userAgent: req.headers['user-agent'] ?? null,
    });

    return result;
  }
}
