import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import {
  CompanyUsersController,
  InvitationsController,
  PermissionsController,
  RoleDetailController,
  RolesController,
  UsersController,
} from './rbac.controller';
import { RbacService } from './rbac.service';

@Module({
  imports: [AuthModule],
  controllers: [
    PermissionsController,
    RolesController,
    RoleDetailController,
    CompanyUsersController,
    InvitationsController,
    UsersController,
  ],
  providers: [RbacService],
  exports: [RbacService],
})
export class RbacModule {}
