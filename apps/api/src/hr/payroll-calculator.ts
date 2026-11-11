import { basisPointsOfMinor, hoursAmountMinor, sumMinor } from '@oryx/shared';

/**
 * Payroll calculation.
 *
 * A payslip is derived from the employee's effective salary structure and its
 * components, all in integer minor units. Hours and leave days are hundredths
 * of a unit, so overtime is `hoursAmountMinor(hours, hourlyRateMinor)` with
 * `hours` scaled by 100 and the hourly rate derived from the monthly basic.
 *
 * The calculation is pure: the same structure and the same inputs always yield
 * the same payslip, which is what lets a run be re-calculated before approval
 * and frozen afterwards.
 */

export interface SalaryComponentInput {
  type: 'ALLOWANCE' | 'DEDUCTION';
  code: string;
  nameEn: string;
  nameAr: string;
  amountMinor: number;
  isPercentage: boolean;
  percentBp: number;
  sortOrder?: number;
}

export interface PayslipLineResult {
  type: 'ALLOWANCE' | 'DEDUCTION';
  code: string;
  nameEn: string;
  nameAr: string;
  amountMinor: number;
  sortOrder: number;
}

export interface PayslipResult {
  basicMinor: number;
  allowancesMinor: number;
  deductionsMinor: number;
  grossMinor: number;
  netMinor: number;
  lines: PayslipLineResult[];
}

/** Hours in hundredths (250 = 2.5 h). A standard month is 30 days × 8 h. */
export const STANDARD_MONTH_HOURS = 24000;

/** Monthly basic salary divided by the standard month, in minor units. */
export function hourlyRateMinor(basicMinor: number, standardMonthHours = STANDARD_MONTH_HOURS): number {
  if (standardMonthHours <= 0) return 0;
  return Math.round((basicMinor * 100) / standardMonthHours);
}

/** Monthly basic divided by the standard 30-day month, in minor units per day. */
export function dailyRateMinor(basicMinor: number): number {
  return Math.round((basicMinor * 100) / 3000);
}

/**
 * Policy inputs the payroll run applies. The values arrive from the company's
 * `AttendancePolicy`; the calculator stays pure and does not read the database.
 */
export interface PayrollPolicy {
  /** Pay overtime at all. */
  overtimeEnabled: boolean;
  /** Overtime multiplier in basis points (15000 = 150%). */
  overtimeMultiplierBp: number;
  /** Standard daily hours in hundredths, used to derive the hourly rate. */
  standardDailyHours: number;
  /** Deduct late minutes from pay. */
  deductLate: boolean;
  /** Deduct early-leave minutes from pay. */
  deductEarlyLeave: boolean;
  /** Deduct full absent days from pay. */
  deductAbsence: boolean;
}

/** Attendance totals for one employee across the payroll period. */
export interface AttendanceTotals {
  /** Overtime minutes to pay. */
  overtimeMinutes: number;
  /** Late minutes across the period. */
  lateMinutes: number;
  /** Early-leave minutes across the period. */
  earlyLeaveMinutes: number;
  /** Whole absent days to deduct. */
  absenceDays: number;
  /** Net worked minutes across the period (informational). */
  workedMinutes: number;
}

export const DEFAULT_PAYROLL_POLICY: PayrollPolicy = {
  overtimeEnabled: true,
  overtimeMultiplierBp: 15000,
  standardDailyHours: 800,
  deductLate: false,
  deductEarlyLeave: false,
  deductAbsence: true,
};

/**
 * Compute a payslip from a basic salary, its components and any period inputs.
 *
 * `overtimeHours` is in hundredths of an hour; `unpaidLeaveDays` is in
 * hundredths of a day and is deducted at the daily rate (basic / 30).
 *
 * When `attendance` and `policy` are supplied the run additionally pays overtime
 * (at `policy.overtimeMultiplierBp`) and deducts late/early/absence according to
 * the policy. The monetary rules all live here, so the run and a re-calculation
 * can never disagree.
 */
export function computePayslip(input: {
  basicMinor: number;
  components: SalaryComponentInput[];
  overtimeHours?: number;
  overtimeMultiplierBp?: number;
  overtimeRateMinor?: number | null;
  unpaidLeaveDays?: number;
  advanceDeductionMinor?: number;
  policy?: PayrollPolicy;
  attendance?: AttendanceTotals;
}): PayslipResult {
  const lines: PayslipLineResult[] = [];
  const policy = input.policy ?? DEFAULT_PAYROLL_POLICY;

  for (const [index, component] of input.components.entries()) {
    const amount = component.isPercentage
      ? basisPointsOfMinor(input.basicMinor, component.percentBp)
      : component.amountMinor;
    lines.push({
      type: component.type,
      code: component.code,
      nameEn: component.nameEn,
      nameAr: component.nameAr,
      amountMinor: amount,
      sortOrder: component.sortOrder ?? index,
    });
  }

  // The standard month hours drive the derived hourly rate; a per-employee
  // override changes the month length, not the pay period.
  const standardMonthHours = Math.max(
    STANDARD_MONTH_HOURS,
    policy.standardDailyHours > 0 ? policy.standardDailyHours * 30 : STANDARD_MONTH_HOURS,
  );
  const hourlyRate = input.overtimeRateMinor ?? hourlyRateMinor(input.basicMinor, standardMonthHours);
  const dayRate = dailyRateMinor(input.basicMinor);

  // Overtime is an earning; the multiplier is in basis points (15000 = 150%).
  const overtimeHours = input.attendance
    ? Math.round((input.attendance.overtimeMinutes * 100) / 60)
    : input.overtimeHours ?? 0;
  const overtimeAllowed = input.attendance ? policy.overtimeEnabled : true;
  if (overtimeAllowed && overtimeHours > 0) {
    const base = hoursAmountMinor(overtimeHours, hourlyRate);
    const multiplier = input.attendance
      ? policy.overtimeMultiplierBp
      : input.overtimeMultiplierBp ?? 10000;
    lines.push({
      type: 'ALLOWANCE',
      code: 'OVERTIME',
      nameEn: 'Overtime',
      nameAr: 'العمل الإضافي',
      amountMinor: basisPointsOfMinor(base, multiplier),
      sortOrder: 9000,
    });
  }

  // Unpaid leave reduces the basic at the daily rate (basic / 30 days).
  if (input.unpaidLeaveDays && input.unpaidLeaveDays > 0) {
    lines.push({
      type: 'DEDUCTION',
      code: 'UNPAID_LEAVE',
      nameEn: 'Unpaid leave',
      nameAr: 'إجازة غير مدفوعة',
      amountMinor: hoursAmountMinor(input.unpaidLeaveDays, dayRate),
      sortOrder: 9100,
    });
  }

  // Attendance-driven deductions, only when the policy enables them.
  if (input.attendance && input.attendance.absenceDays > 0 && policy.deductAbsence) {
    lines.push({
      type: 'DEDUCTION',
      code: 'ABSENCE',
      nameEn: 'Absence',
      nameAr: 'غياب',
      amountMinor: input.attendance.absenceDays * dayRate,
      sortOrder: 9150,
    });
  }
  if (input.attendance && policy.deductLate && input.attendance.lateMinutes > 0) {
    lines.push({
      type: 'DEDUCTION',
      code: 'LATE',
      nameEn: 'Late arrival',
      nameAr: 'تأخير',
      amountMinor: Math.round((input.attendance.lateMinutes * hourlyRate) / 60),
      sortOrder: 9160,
    });
  }
  if (input.attendance && policy.deductEarlyLeave && input.attendance.earlyLeaveMinutes > 0) {
    lines.push({
      type: 'DEDUCTION',
      code: 'EARLY_LEAVE',
      nameEn: 'Early leave',
      nameAr: 'انصراف مبكر',
      amountMinor: Math.round((input.attendance.earlyLeaveMinutes * hourlyRate) / 60),
      sortOrder: 9170,
    });
  }

  // Advance settlement is a deduction that clears part of an outstanding advance.
  if (input.advanceDeductionMinor && input.advanceDeductionMinor > 0) {
    lines.push({
      type: 'DEDUCTION',
      code: 'ADVANCE',
      nameEn: 'Advance settlement',
      nameAr: 'تسوية سلفة',
      amountMinor: input.advanceDeductionMinor,
      sortOrder: 9200,
    });
  }

  const allowanceLines = lines.filter((l) => l.type === 'ALLOWANCE');
  const deductionLines = lines.filter((l) => l.type === 'DEDUCTION');
  const allowancesMinor = sumMinor(allowanceLines.map((l) => l.amountMinor));
  const deductionsMinor = sumMinor(deductionLines.map((l) => l.amountMinor));
  const grossMinor = input.basicMinor + allowancesMinor;
  const netMinor = grossMinor - deductionsMinor;

  return {
    basicMinor: input.basicMinor,
    allowancesMinor,
    deductionsMinor,
    grossMinor,
    netMinor,
    lines: lines.sort((a, b) => a.sortOrder - b.sortOrder),
  };
}

/** Total days between two dates inclusive, in hundredths of a day. */
export function leaveDaysBetween(start: Date, end: Date): number {
  const ms = end.getTime() - start.getTime();
  const days = Math.floor(ms / 86_400_000) + 1;
  return Math.max(0, days) * 100;
}
