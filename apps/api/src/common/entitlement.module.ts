import { Global, Module } from '@nestjs/common';
import { EntitlementService } from './entitlement.service';
import { PrismaModule } from './prisma.module';

@Global()
@Module({
  imports: [PrismaModule],
  providers: [EntitlementService],
  exports: [EntitlementService],
})
export class EntitlementModule {}
