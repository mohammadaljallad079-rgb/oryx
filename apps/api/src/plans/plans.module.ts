import { Module } from '@nestjs/common';
import { PlansController, SubscriptionsController } from './plans.controller';
import { PlansService } from './plans.service';

@Module({
  controllers: [PlansController, SubscriptionsController],
  providers: [PlansService],
  exports: [PlansService],
})
export class PlansModule {}
