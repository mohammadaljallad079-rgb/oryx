import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { AuditService } from '../common/audit.service';
import { deriveAttendance, zonedDateKey } from './attendance-calculator';

/**
 * Automatic attendance driven by the sign-in / sign-out lifecycle.
 *
 * When a user who is linked to an employee record signs in, the day's check-in
 * is stamped; when they sign out, the check-out is stamped and the day's
 * worked, late, early-leave and overtime minutes are derived from the assigned
 * shift and the company's attendance policy — exactly the arithmetic a manual
 * punch would produce. No form is filled in by hand.
 *
 * It is deliberately best-effort: a failure here must never block a login or a
 * logout, so every error is swallowed after being logged. It is also
 * conservative about the policy — when the policy *requires* a verified
 * location and does not allow a fallback, the punch is skipped rather than
 * recorded as if it were verified, because a sign-in carries no GPS fix.
 */
@Injectable()
export class AttendanceAutoService {
  private readonly logger = new Logger(AttendanceAutoService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Stamp a check-in for every employee record linked to this user. */
  async recordLogin(userId: string, meta: { ip?: string; userAgent?: string } = {}): Promise<void> {
    try {
      const employees = await this.prisma.employee.findMany({
        where: { userId, status: { notIn: ['TERMINATED', 'SUSPENDED'] } },
      });
      for (const employee of employees) {
        await this.checkIn(employee, meta);
      }
    } catch (error) {
      this.logger.warn(
        `Automatic check-in skipped for user ${userId}: ${(error as Error).message}`,
      );
    }
  }

  /** Stamp a check-out for any employee record of this user with an open day. */
  async recordLogout(userId: string, meta: { ip?: string; userAgent?: string } = {}): Promise<void> {
    try {
      const employees = await this.prisma.employee.findMany({ where: { userId } });
      for (const employee of employees) {
        await this.checkOut(employee.id, employee.companyId, meta);
      }
    } catch (error) {
      this.logger.warn(
        `Automatic check-out skipped for user ${userId}: ${(error as Error).message}`,
      );
    }
  }

  private async checkIn(
    employee: { id: string; companyId: string },
    meta: { ip?: string; userAgent?: string },
  ): Promise<void> {
    const at = new Date();
    const tz = await this.companyTimeZone(employee.companyId);
    const workDate = zonedDateKey(at, tz);

    const existing = await this.prisma.attendanceRecord.findUnique({
      where: { employeeId_workDate: { employeeId: employee.id, workDate } },
    });
    // A day already opened (or closed) is left untouched; the sign-in only ever
    // creates the first check-in of the day.
    if (existing?.checkInAt) return;

    const policy = await this.ensurePolicy(employee.companyId);
    // A sign-in cannot present a GPS/Wi-Fi/QR fix, so when the policy demands a
    // verified location with no fallback allowed, we do not fabricate one.
    if (policy.requireLocation && !policy.allowFallback) return;

    const shift = await this.activeShift(employee.companyId, employee.id);
    const record = await this.prisma.attendanceRecord.upsert({
      where: { employeeId_workDate: { employeeId: employee.id, workDate } },
      create: {
        companyId: employee.companyId,
        employeeId: employee.id,
        shiftId: shift?.id ?? null,
        workDate,
        checkInAt: at,
        status: 'PRESENT',
        checkInSource: 'AUTO_LOGIN',
        fallbackReason: policy.requireLocation ? 'AUTO_LOGIN' : null,
      },
      update: {
        checkInAt: at,
        shiftId: shift?.id ?? null,
        status: 'PRESENT',
        checkInSource: 'AUTO_LOGIN',
        fallbackReason: policy.requireLocation ? 'AUTO_LOGIN' : null,
      },
    });
    await this.audit.record({
      actorUserId: null,
      companyId: employee.companyId,
      action: 'hr.attendance_auto_check_in',
      targetType: 'ATTENDANCE_RECORD',
      targetId: record.id,
      summary: `Automatic check-in on sign-in${meta.ip ? ` from ${meta.ip}` : ''}`,
      ipAddress: meta.ip ?? null,
      userAgent: meta.userAgent ?? null,
    });
  }

  private async checkOut(
    employeeId: string,
    companyId: string,
    meta: { ip?: string; userAgent?: string },
  ): Promise<void> {
    // The open day, not necessarily today: an overnight shift opened yesterday
    // is closed on the sign-out that ends it.
    const record = await this.prisma.attendanceRecord.findFirst({
      where: { employeeId, checkInAt: { not: null }, checkOutAt: null },
      orderBy: { checkInAt: 'desc' },
      include: { breaks: true },
    });
    if (!record || !record.checkInAt) return;
    // An open break would make the derived minutes ambiguous; leave it for a
    // manager rather than guessing.
    if (record.breaks.some((b) => !b.endedAt)) return;

    const at = new Date();
    const policy = await this.ensurePolicy(companyId);
    const tz = await this.companyTimeZone(companyId);
    const shift = record.shiftId
      ? await this.prisma.shift.findFirst({ where: { id: record.shiftId, companyId } })
      : await this.activeShift(companyId, employeeId);
    const takenBreak = record.breaks.reduce((sum, b) => sum + b.minutes, 0);
    const derived = deriveAttendance({
      checkIn: record.checkInAt,
      checkOut: at,
      shift,
      breakMinutes: takenBreak,
      graceMinutes: policy.graceMinutes,
      timeZone: tz,
    });

    const updated = await this.prisma.attendanceRecord.update({
      where: { id: record.id },
      data: {
        checkOutAt: at,
        workedMinutes: derived.workedMinutes,
        breakMinutes: derived.breakMinutes,
        netMinutes: derived.netMinutes,
        lateMinutes: derived.lateMinutes,
        earlyLeaveMinutes: derived.earlyLeaveMinutes,
        overtimeMinutes: derived.overtimeMinutes,
        status: derived.status,
        checkOutSource: 'AUTO_LOGOUT',
      },
    });
    await this.audit.record({
      actorUserId: null,
      companyId,
      action: 'hr.attendance_auto_check_out',
      targetType: 'ATTENDANCE_RECORD',
      targetId: updated.id,
      summary: `Automatic check-out on sign-out: ${derived.netMinutes} net minutes, ${derived.overtimeMinutes} overtime`,
      ipAddress: meta.ip ?? null,
      userAgent: meta.userAgent ?? null,
    });
  }

  private async activeShift(companyId: string, employeeId: string) {
    const now = new Date();
    const assignment = await this.prisma.employeeShift.findFirst({
      where: {
        companyId,
        employeeId,
        effectiveFrom: { lte: now },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: now } }],
      },
      orderBy: { effectiveFrom: 'desc' },
      include: { shift: true },
    });
    return assignment?.shift ?? null;
  }

  private async ensurePolicy(companyId: string) {
    const existing = await this.prisma.attendancePolicy.findUnique({ where: { companyId } });
    if (existing) return existing;
    return this.prisma.attendancePolicy.create({ data: { companyId } });
  }

  private async companyTimeZone(companyId: string): Promise<string> {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { timezone: true },
    });
    return company?.timezone ?? 'Asia/Bahrain';
  }
}
