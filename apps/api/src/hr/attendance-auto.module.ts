import { Module } from '@nestjs/common';
import { AttendanceAutoService } from './attendance-auto.service';

/**
 * Automatic attendance, kept out of the heavy `HrModule` so `AuthModule` can
 * depend on it without importing the whole HR graph (documents, payroll,
 * posting). Prisma and Audit are `@Global`, so nothing else needs importing.
 */
@Module({
  providers: [AttendanceAutoService],
  exports: [AttendanceAutoService],
})
export class AttendanceAutoModule {}
