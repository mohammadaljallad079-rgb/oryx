import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { TenantCompanyService } from './tenant-company.service';

@Global()
@Module({
  providers: [PrismaService, TenantCompanyService],
  exports: [PrismaService, TenantCompanyService],
})
export class PrismaModule {}
