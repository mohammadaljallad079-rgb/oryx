import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CustomerPlane } from '../auth/auth.decorators';
import {
  CustomerAuthGuard,
  CurrentCustomer,
  type CustomerPrincipal,
} from '../customer/customer-auth.guard';
import { IntegrationsService } from './integrations.service';

/**
 * What a signed-in customer is actually allowed to choose.
 *
 * The customer website and the mobile app read this before rendering a payment
 * method or a notification preference, so a method that no gateway can process
 * is never offered. This is a whitelist derived from real provider state, not a
 * hard-coded list, so turning a gateway on in the Integrations Center makes it
 * appear here without a code change.
 */
@ApiTags('customer-integrations')
@ApiBearerAuth()
@CustomerPlane()
@Controller('customer/capabilities')
@UseGuards(CustomerAuthGuard)
export class CustomerCapabilitiesController {
  constructor(private readonly integrations: IntegrationsService) {}

  @Get()
  @ApiOperation({ summary: 'Payment methods and channels available to this customer' })
  async capabilities(@CurrentCustomer() customer: CustomerPrincipal) {
    const operational = await this.integrations.publicCapabilities(
      customer.defaultCompanyId ?? null,
    );
    return {
      payments: {
        // Cash and bank transfer are records, not gateway calls; they are always
        // available. The online methods depend on real gateway state.
        cash: operational['CASH'] === true,
        bankTransfer: true,
        benefitPay: operational['BENEFITPAY'] === true,
        cardOnline: operational['CARD_ONLINE'] === true,
        cardTerminal: true,
      },
      channels: {
        inApp: operational['IN_APP'] === true,
        email: operational['EMAIL'] === true,
        sms: operational['SMS'] === true,
        whatsapp: operational['WHATSAPP'] === true,
        push: operational['PUSH'] === true,
      },
    };
  }
}
