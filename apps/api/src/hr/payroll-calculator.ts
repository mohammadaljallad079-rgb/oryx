import { basisPointsOfMinor, lineAmountMinor, sumMinor } from '@oryx/shared';

/**
 * Payroll calculation.
 *
 * A payslip is derived from the employee's effective salary structure and its
 * components, all in integer minor units. Hours and leave days are hundredths
 * of a unit, so overtime is `lineAmountMinor(hours, hourlyRateMinor)` with
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
export function hourlyRateMinor(basicMinor: number): number {
  return Math.round((basicMinor * 100) / STANDARD_MONTH_HOURS);
}

/**
 * Compute a payslip from a basic salary, its components and any period inputs.
 *
 * `overtimeHours` is in hundredths of an hour; `unpaidLeaveDays` is in
 * hundredths of a day and is deducted at the daily rate (basic / 30).
 */
export function computePayslip(input: {
  basicMinor: number;
  components: SalaryComponentInput[];
  overtimeHours?: number;
  overtimeMultiplierBp?: number;
  unpaidLeaveDays?: number;
  advanceDeductionMinor?: number;
}): PayslipResult {
  const lines: PayslipLineResult[] = [];

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

  // Overtime is an earning; the multiplier is in basis points (15000 = 150%).
  if (input.overtimeHours && input.overtimeHours > 0) {
    const base = lineAmountMinor(input.overtimeHours, hourlyRateMinor(input.basicMinor));
    const multiplier = input.overtimeMultiplierBp ?? 10000;
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
    const dailyRate = Math.round((input.basicMinor * 100) / 3000);
    lines.push({
      type: 'DEDUCTION',
      code: 'UNPAID_LEAVE',
      nameEn: 'Unpaid leave',
      nameAr: 'إجازة غير مدفوعة',
      amountMinor: lineAmountMinor(input.unpaidLeaveDays, dailyRate),
      sortOrder: 9100,
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
