import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from './common/prisma.module';
import { AuditModule } from './common/audit.module';
import { EntitlementModule } from './common/entitlement.module';
import { SecurityModule } from './common/security.module';
import { AuthModule } from './auth/auth.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { RbacModule } from './rbac/rbac.module';
import { ModulesModule } from './modules/modules.module';
import { PlansModule } from './plans/plans.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { AuditControllerModule } from './audit/audit.module';
import { CmsModule } from './cms/cms.module';
import { SupportModule } from './support/support.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env', '../../.env'] }),
    ThrottlerModule.forRoot([
      {
        ttl: Number(process.env.THROTTLE_TTL ?? 60) * 1000,
        limit: Number(process.env.THROTTLE_LIMIT ?? 120),
      },
    ]),
    PrismaModule,
    AuditModule,
    EntitlementModule,
    SecurityModule,
    AuthModule,
    OrganizationsModule,
    RbacModule,
    ModulesModule,
    PlansModule,
    DashboardModule,
    AuditControllerModule,
    CmsModule,
    SupportModule,
    HealthModule,
  ],
  providers: [
    // Global rate limiting; sensitive auth routes override with @Throttle.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
