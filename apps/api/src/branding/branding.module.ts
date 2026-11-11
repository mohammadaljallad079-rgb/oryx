import { Module } from '@nestjs/common';

import { BrandingController } from './branding.controller';
import { BrandingService } from './branding.service';

/**
 * Per-company visual identity.
 *
 * Registered after `CompaniesController` so the static `/companies/:id/branding`
 * routes are matched before any future catch-all on the same prefix.
 */
@Module({
  controllers: [BrandingController],
  providers: [BrandingService],
  exports: [BrandingService],
})
export class BrandingModule {}
