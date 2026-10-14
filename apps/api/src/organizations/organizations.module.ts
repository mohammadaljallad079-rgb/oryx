import { Module } from '@nestjs/common';
import { BranchesController, CompaniesController } from './organizations.controller';
import { OrganizationsService } from './organizations.service';

@Module({
  controllers: [CompaniesController, BranchesController],
  providers: [OrganizationsService],
  exports: [OrganizationsService],
})
export class OrganizationsModule {}
