import { Module } from '@nestjs/common';
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
