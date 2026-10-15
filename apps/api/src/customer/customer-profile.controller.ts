import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CustomerProfileService } from './customer-profile.service';
import {
  CurrentCustomer,
  CustomerAuthGuard,
  type CustomerPrincipal,
} from './customer-auth.guard';
import { CustomerPlane } from '../auth/auth.decorators';
import {
  CustomerAddressDto,
  CustomerPrivacyDto,
  CustomerVehicleDto,
  UpdateCustomerPreferencesDto,
  UpdateCustomerVehicleDto,
} from './customer.dto';

/**
 * Customer-owned profile data: addresses, privacy, notification preferences and
 * the vehicle garage.
 *
 * Every route resolves the account from the bearer token via `CurrentCustomer`
 * and never from the path or body, so ownership isolation does not depend on the
 * caller supplying the right id.
 */
@ApiTags('customer-profile')
@ApiBearerAuth()
@CustomerPlane()
@Controller('customer')
@UseGuards(CustomerAuthGuard)
export class CustomerProfileController {
  constructor(private readonly profiles: CustomerProfileService) {}

  // --------------------------------------------------------------- addresses

  @Get('addresses')
  @ApiOperation({ summary: 'List the customer addresses' })
  async listAddresses(@CurrentCustomer() customer: CustomerPrincipal) {
    return this.profiles.listAddresses(customer.accountId);
  }

  @Post('addresses')
  @ApiOperation({ summary: 'Add an address' })
  async createAddress(
    @CurrentCustomer() customer: CustomerPrincipal,
    @Body() dto: CustomerAddressDto,
  ) {
    return this.profiles.createAddress(customer.accountId, dto);
  }

  @Patch('addresses/:id')
  @ApiOperation({ summary: 'Update an address' })
  async updateAddress(
    @CurrentCustomer() customer: CustomerPrincipal,
    @Param('id') id: string,
    @Body() dto: CustomerAddressDto,
  ) {
    return this.profiles.updateAddress(customer.accountId, id, dto);
  }

  @Delete('addresses/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete an address' })
  async deleteAddress(@CurrentCustomer() customer: CustomerPrincipal, @Param('id') id: string) {
    await this.profiles.deleteAddress(customer.accountId, id);
  }

  // ----------------------------------------------------------------- privacy

  @Get('privacy')
  @ApiOperation({ summary: 'Read account privacy settings' })
  async getPrivacy(@CurrentCustomer() customer: CustomerPrincipal) {
    return this.profiles.getPrivacy(customer.accountId);
  }

  @Patch('privacy')
  @ApiOperation({ summary: 'Update account privacy settings' })
  async updatePrivacy(
    @CurrentCustomer() customer: CustomerPrincipal,
    @Body() dto: CustomerPrivacyDto,
  ) {
    return this.profiles.updatePrivacy(customer.accountId, dto);
  }

  @Post('privacy/data-export')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request a copy of the account data' })
  async requestExport(@CurrentCustomer() customer: CustomerPrincipal) {
    return this.profiles.requestDataAction(customer.accountId, 'EXPORT');
  }

  @Post('privacy/deletion')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request account deletion' })
  async requestDeletion(@CurrentCustomer() customer: CustomerPrincipal) {
    return this.profiles.requestDataAction(customer.accountId, 'DELETION');
  }

  // -------------------------------------------------- notification preferences

  @Get('notification-preferences')
  @ApiOperation({ summary: 'List notification preferences' })
  async listPreferences(@CurrentCustomer() customer: CustomerPrincipal) {
    return this.profiles.listNotificationPreferences(customer.accountId);
  }

  @Patch('notification-preferences')
  @ApiOperation({ summary: 'Update notification preferences' })
  async setPreferences(
    @CurrentCustomer() customer: CustomerPrincipal,
    @Body() dto: UpdateCustomerPreferencesDto,
  ) {
    return this.profiles.setNotificationPreferences(customer.accountId, dto.preferences);
  }

  // ------------------------------------------------------------ vehicle garage

  @Get('vehicles')
  @ApiOperation({ summary: 'List the vehicles in the customer garage' })
  async listVehicles(@CurrentCustomer() customer: CustomerPrincipal) {
    return this.profiles.listVehicles(customer.accountId);
  }

  @Post('vehicles')
  @ApiOperation({ summary: 'Register a vehicle in the garage' })
  async createVehicle(
    @CurrentCustomer() customer: CustomerPrincipal,
    @Body() dto: CustomerVehicleDto,
  ) {
    return this.profiles.createVehicle(customer.accountId, dto);
  }

  @Get('vehicles/:id')
  @ApiOperation({ summary: 'Read one owned vehicle' })
  async getVehicle(@CurrentCustomer() customer: CustomerPrincipal, @Param('id') id: string) {
    return this.profiles.getVehicle(customer.accountId, id);
  }

  @Patch('vehicles/:id')
  @ApiOperation({ summary: 'Update an owned vehicle' })
  async updateVehicle(
    @CurrentCustomer() customer: CustomerPrincipal,
    @Param('id') id: string,
    @Body() dto: UpdateCustomerVehicleDto,
  ) {
    return this.profiles.updateVehicle(customer.accountId, id, dto);
  }

  @Delete('vehicles/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove a vehicle from the garage' })
  async removeVehicle(@CurrentCustomer() customer: CustomerPrincipal, @Param('id') id: string) {
    return this.profiles.removeVehicle(customer.accountId, id);
  }

  @Get('vehicles/:id/history')
  @ApiOperation({ summary: 'Full service history for an owned vehicle' })
  async vehicleHistory(@CurrentCustomer() customer: CustomerPrincipal, @Param('id') id: string) {
    return this.profiles.vehicleServiceHistory(customer.accountId, id);
  }
}
