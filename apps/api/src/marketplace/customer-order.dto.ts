import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Request bodies for consumer orders.
 *
 * Note what is **absent**: there is no price, no subtotal and no total. The
 * server computes every figure from the catalogue inside the placement
 * transaction, so a client cannot propose what it would like to pay. `companyId`
 * is absent for the same reason — it is taken from the cart, which is itself
 * tied to the authenticated principal.
 */

const PAYMENT_METHODS = ['CASH', 'CARD_TERMINAL', 'BANK_TRANSFER', 'BENEFITPAY', 'CARD_ONLINE'] as const;

export class PlaceOrderDto {
  @ApiPropertyOptional({ description: 'A saved address id; its text is copied onto the order' })
  @IsOptional()
  @IsString()
  addressId?: string;

  @ApiPropertyOptional({ enum: PAYMENT_METHODS, default: 'CASH' })
  @IsOptional()
  @IsIn(PAYMENT_METHODS as unknown as string[])
  paymentMethod?: (typeof PAYMENT_METHODS)[number];

  @ApiPropertyOptional({ description: 'A note for the seller' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @ApiPropertyOptional({
    description:
      'A client key so a retried checkout returns the same order rather than placing a second one.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  idempotencyKey?: string;
}

export class CancelOrderDto {
  @ApiPropertyOptional({ description: 'Why the order is being cancelled' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;
}
