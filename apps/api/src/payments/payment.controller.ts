import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  RawBodyRequest,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { Public, RequirePermissions } from '../auth/auth.decorators';
import { PrincipalGuard } from '../auth/principal.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { CurrentPrincipal, type RequestPrincipal } from '../auth/auth.decorators';
import { PaymentService } from './payment.service';
import {
  CancelIntentDto,
  ConfirmManualIntentDto,
  CreateIntentDto,
  ReconcileDto,
  RequestRefundDto,
} from './payment.dto';

/**
 * Payment intents, refunds and reconciliation on the staff plane.
 *
 * Refund approval and reconciliation are separated by permission, so a front
 * desk operator can take a payment but cannot move money back out without the
 * matching authority.
 */
@ApiTags('payments')
@ApiBearerAuth()
@Controller('payments')
@UseGuards(PrincipalGuard, PermissionsGuard)
export class PaymentController {
  constructor(private readonly payments: PaymentService) {}

  @Get('providers')
  @RequirePermissions('erp.payments.read')
  @ApiOperation({
    summary: 'List payment providers and whether each can actually transact',
  })
  async providers() {
    return this.payments.providerStatus();
  }

  @Post('intents')
  @RequirePermissions('erp.payments.manage')
  @ApiOperation({ summary: 'Create a payment intent' })
  async createIntent(
    @Body() dto: CreateIntentDto,
    @CurrentPrincipal() principal: RequestPrincipal,
  ) {
    return this.payments.createIntent({
      companyId: principal.company?.companyId ?? dto.branchId ?? '',
      branchId: dto.branchId ?? null,
      customerId: dto.customerId ?? null,
      targetType: dto.targetType,
      targetId: dto.targetId,
      amountMinor: dto.amountMinor,
      currency: dto.currency,
      provider: dto.provider,
      description: dto.description,
      idempotencyKey: dto.idempotencyKey,
      createdById: principal.userId,
      returnUrl: dto.returnUrl,
    });
  }

  @Get('intents')
  @RequirePermissions('erp.payments.read')
  @ApiOperation({ summary: 'List payment intents with optional status and target filters' })
  async listIntents(
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '25',
    @Query('targetType') targetType?: string,
    @Query('status') status?: string,
    @CurrentPrincipal() principal?: RequestPrincipal,
  ) {
    return this.payments.listIntents(principal?.company?.companyId ?? '', {
      page: Math.max(1, Number(page) || 1),
      pageSize: Math.min(100, Math.max(1, Number(pageSize) || 25)),
      targetType,
      status,
    });
  }

  @Get('intents/:id')
  @RequirePermissions('erp.payments.read')
  @ApiOperation({ summary: 'Read a payment intent with its transactions and refunds' })
  async getIntent(@Param('id') id: string, @CurrentPrincipal() principal: RequestPrincipal) {
    return this.payments.getIntent(principal.company?.companyId ?? '', id);
  }

  @Post('intents/:id/confirm')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('erp.payments.manage')
  @ApiOperation({ summary: 'Confirm a manual payment once the funds are received' })
  async confirmManual(
    @Param('id') id: string,
    @Body() dto: ConfirmManualIntentDto,
    @CurrentPrincipal() principal: RequestPrincipal,
  ) {
    return this.payments.confirmManualIntent(id, dto.providerReference, principal.userId);
  }

  @Post('intents/:id/cancel')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('erp.payments.manage')
  @ApiOperation({ summary: 'Cancel an unsettled payment intent' })
  async cancelIntent(
    @Param('id') id: string,
    @Body() dto: CancelIntentDto,
    @CurrentPrincipal() principal: RequestPrincipal,
  ) {
    return this.payments.cancelIntent(id, dto.reason);
  }

  @Post('intents/:id/refunds')
  @RequirePermissions('erp.payments.manage')
  @ApiOperation({ summary: 'Request a refund against a settled payment' })
  async requestRefund(
    @Param('id') id: string,
    @Body() dto: RequestRefundDto,
    @CurrentPrincipal() principal: RequestPrincipal,
  ) {
    return this.payments.requestRefund({
      intentId: id,
      amountMinor: dto.amountMinor,
      reason: dto.reason,
      requestedById: principal.userId,
    });
  }

  /**
   * Approve and process a refund.
   *
   * Requires a distinct permission from requesting one, so the same operator
   * cannot both ask for and release money.
   */
  @Post('refunds/:id/approve')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('erp.payments.reconcile')
  @ApiOperation({ summary: 'Approve and process a refund' })
  async approveRefund(@Param('id') id: string, @CurrentPrincipal() principal: RequestPrincipal) {
    return this.payments.approveRefund(id, principal.userId);
  }

  @Post('reconciliations')
  @RequirePermissions('erp.payments.reconcile')
  @ApiOperation({ summary: 'Reconcile a provider for a business day' })
  async reconcile(@Body() dto: ReconcileDto, @CurrentPrincipal() principal: RequestPrincipal) {
    return this.payments.reconcile({
      companyId: principal.company?.companyId ?? '',
      provider: dto.provider,
      businessDate: new Date(dto.businessDate),
      externalCount: dto.externalCount,
      externalMinor: dto.externalMinor,
      notes: dto.notes,
      actorUserId: principal.userId,
    });
  }

  @Get('reconciliations')
  @RequirePermissions('erp.payments.read')
  @ApiOperation({ summary: 'List reconciliations, optionally only the breaks' })
  async listReconciliations(
    @CurrentPrincipal() principal: RequestPrincipal,
    @Query('onlyUnmatched') onlyUnmatched?: string,
  ) {
    return this.payments.listReconciliations(
      principal.company?.companyId ?? '',
      onlyUnmatched === 'true',
    );
  }
}

/**
 * Gateway webhooks.
 *
 * Public because a gateway cannot present a bearer token. Trust comes from the
 * HMAC signature over the raw body, which `PaymentService` verifies before any
 * state change; an unsigned or mis-signed event is recorded and rejected.
 */
@ApiTags('payment-webhooks')
@Controller('payments/webhooks')
export class PaymentWebhookController {
  constructor(private readonly payments: PaymentService) {}

  @Public()
  @Post(':provider')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Receive a payment provider webhook' })
  async handle(
    @Param('provider') provider: string,
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-oryx-signature') signature: string | undefined,
    @Headers('x-oryx-event-id') eventId: string | undefined,
    @Headers('x-oryx-event-type') eventType: string | undefined,
    @Body() payload: unknown,
  ) {
    // The raw body is required for signature verification: parsing to JSON and
    // re-serialising would change the bytes and break the HMAC.
    const rawBody = req.rawBody ?? Buffer.from(JSON.stringify(payload ?? {}));
    return this.payments.handleWebhook({
      provider,
      rawBody,
      signature,
      eventId: eventId ?? 'unknown',
      eventType: eventType ?? 'unknown',
      payload,
    });
  }
}
