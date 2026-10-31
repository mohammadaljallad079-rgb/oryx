import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';

import { Public } from '../auth/auth.decorators';
import { CustomerHomepageService } from './customer-homepage.service';

/**
 * The customer homepage.
 *
 * Public by design: the marketplace home is the first thing a visitor sees, and
 * requiring a session to render it would put a sign-in wall in front of the
 * product. Nothing here is customer-specific — no cart, no favourites, no
 * profile — so there is nothing to leak to an anonymous caller.
 *
 * The customer-scoped endpoints live behind `CustomerAuthGuard` in
 * `CustomerCartController` and `CustomerFavoritesController`.
 */
@ApiTags('customer-homepage')
@Controller('customer/homepage')
export class CustomerHomepageController {
  constructor(private readonly homepage: CustomerHomepageService) {}

  @Get()
  // Public: the marketplace home is what a visitor sees before signing in, and
  // nothing here is customer-specific.
  @Public()
  @ApiOperation({ summary: 'Approved homepage content for a locale' })
  @ApiQuery({ name: 'locale', required: false, enum: ['ar', 'en'] })
  @ApiQuery({ name: 'companyId', required: false, type: String })
  async get(
    @Query('locale') locale?: string,
    @Query('companyId') companyId?: string,
  ) {
    // Arabic is the default, matching the app's own default locale.
    const resolved = locale === 'en' ? 'en' : 'ar';
    return this.homepage.getHomepage(resolved, companyId);
  }
}
