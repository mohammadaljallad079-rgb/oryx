import { describe, expect, it } from 'vitest';
import {
  addMinor,
  allocateMinor,
  basisPointsOfMinor,
  fromHours,
  fromMinor,
  fromQuantity,
  hoursAmountMinor,
  hoursToQuantity,
  isBalanced,
  lineAmountMinor,
  roundMinor,
  roundingIncrementMinor,
  subMinor,
  sumMinor,
  toHours,
  toMinor,
  toQuantity,
} from '../src/money';

/**
 * Exact monetary arithmetic is the foundation of every accounting assertion in
 * Execution 02, so it is verified directly rather than only through the API.
 */
describe('money — exact minor-unit arithmetic', () => {
  it('parses decimal strings into integer minor units without float error', () => {
    expect(toMinor('12.50')).toBe(1250);
    expect(toMinor('0.01')).toBe(1);
    expect(toMinor('1000')).toBe(100000);
    expect(toMinor('-3.5')).toBe(-350);
    expect(toMinor('1,234.56')).toBe(123456);
    expect(toMinor(19.99)).toBe(1999);
  });

  it('rejects malformed amounts and excess precision', () => {
    expect(() => toMinor('12.345')).toThrow();
    expect(() => toMinor('abc')).toThrow();
    expect(() => toMinor('1.2.3')).toThrow();
  });

  it('renders minor units back to a fixed-scale string', () => {
    expect(fromMinor(1250)).toBe('12.50');
    expect(fromMinor(-5)).toBe('-0.05');
    expect(fromMinor(100000)).toBe('1000.00');
    expect(fromMinor(0)).toBe('0.00');
  });

  it('adds and subtracts exactly, avoiding the 0.1 + 0.2 problem', () => {
    // 0.1 + 0.2 in floats is 0.30000000000000004; in minor units it is exact.
    expect(addMinor(toMinor('0.10'), toMinor('0.20'))).toBe(30);
    expect(fromMinor(addMinor(toMinor('0.10'), toMinor('0.20')))).toBe('0.30');
    expect(subMinor(1000, 250)).toBe(750);
    expect(sumMinor([1250, 2500, 750])).toBe(4500);
  });

  it('multiplies quantity by unit price with a single half-up rounding', () => {
    // 3 units at 19.99 = 59.97
    expect(lineAmountMinor(toQuantity(3), toMinor('19.99'))).toBe(5997);
    // 2.5 units at 10.00 = 25.00
    expect(lineAmountMinor(toQuantity('2.5'), toMinor('10.00'))).toBe(2500);
    // 1.3333 units at 3.00 = 3.9999 -> 4.00 rounded half-up once
    expect(lineAmountMinor(toQuantity('1.3333'), toMinor('3.00'))).toBe(400);
    expect(fromQuantity(toQuantity('2.5'))).toBe('2.5000');
  });

  it('prices labour hours at hundredths scale, not quantity scale', () => {
    // 2.5 h at 25.00/h = 62.50; using lineAmountMinor would yield 0.62.
    expect(hoursAmountMinor(toHours('2.5'), toMinor('25.00'))).toBe(6250);
    expect(lineAmountMinor(toHours('2.5'), toMinor('25.00'))).toBe(63);
    expect(hoursAmountMinor(toHours(1), toMinor('40.00'))).toBe(4000);
    expect(fromHours(toHours('2.5'))).toBe('2.50');
  });

  it('rescales labour hours onto quantity units for invoicing', () => {
    // 2.5 h becomes 25000 in 10^4 quantity units, so a 25.00 rate yields 62.50.
    expect(hoursToQuantity(toHours('2.5'))).toBe(25000);
    expect(lineAmountMinor(hoursToQuantity(toHours('2.5')), toMinor('25.00'))).toBe(6250);
  });

  it('applies basis-point percentages exactly', () => {
    // 15% VAT on 100.00 = 15.00
    expect(basisPointsOfMinor(10000, 1500)).toBe(1500);
    // 15% VAT on 0.33 = 0.0495 -> 0.05
    expect(basisPointsOfMinor(33, 1500)).toBe(5);
    // 5% discount on 99.99 = 4.9995 -> 5.00
    expect(basisPointsOfMinor(9999, 500)).toBe(500);
    // 100% = 10000 bp
    expect(basisPointsOfMinor(10000, 10000)).toBe(10000);
  });

  it('allocates a total so the parts sum exactly to the original', () => {
    // 100 split three ways leaves a 1-minor-unit remainder that must not vanish.
    const parts = allocateMinor(100, [1, 1, 1]);
    expect(sumMinor(parts)).toBe(100);
    expect(parts).toEqual([34, 33, 33]);

    const weighted = allocateMinor(1000, [3, 1]);
    expect(sumMinor(weighted)).toBe(1000);
    expect(weighted).toEqual([750, 250]);

    const negative = allocateMinor(-100, [1, 1, 1]);
    expect(sumMinor(negative)).toBe(-100);
  });

  it('detects balanced and unbalanced amounts', () => {
    expect(isBalanced([10000, -10000])).toBe(true);
    expect(isBalanced([10000, -9999])).toBe(false);
  });

  describe('whole-amount rounding', () => {
    it('exposes the increment each mode snaps to', () => {
      expect(roundingIncrementMinor('NONE', 2)).toBe(1);
      expect(roundingIncrementMinor('NEAREST_WHOLE', 2)).toBe(100);
      expect(roundingIncrementMinor('NEAREST_HALF', 2)).toBe(50);
      // A three-decimal currency (BHD) rounds to 1000 minor units per whole.
      expect(roundingIncrementMinor('NEAREST_WHOLE', 3)).toBe(1000);
      expect(roundingIncrementMinor('NEAREST_HALF', 3)).toBe(500);
    });

    it('leaves the total exact in NONE mode', () => {
      expect(roundMinor(12345, 'NONE', 2)).toEqual({ rounded: 12345, adjustment: 0 });
    });

    it('rounds half-up to the nearest whole major unit', () => {
      // 123.45 -> 123.00, a 0.45 loss (negative adjustment).
      expect(roundMinor(12345, 'NEAREST_WHOLE', 2)).toEqual({ rounded: 12300, adjustment: -45 });
      // 123.50 -> 124.00, exactly half rounds up.
      expect(roundMinor(12350, 'NEAREST_WHOLE', 2)).toEqual({ rounded: 12400, adjustment: 50 });
      // 123.51 -> 124.00.
      expect(roundMinor(12351, 'NEAREST_WHOLE', 2)).toEqual({ rounded: 12400, adjustment: 49 });
    });

    it('rounds half-up to the nearest half major unit', () => {
      expect(roundMinor(12325, 'NEAREST_HALF', 2)).toEqual({ rounded: 12350, adjustment: 25 });
      expect(roundMinor(12324, 'NEAREST_HALF', 2)).toEqual({ rounded: 12300, adjustment: -24 });
      expect(roundMinor(12375, 'NEAREST_HALF', 2)).toEqual({ rounded: 12400, adjustment: 25 });
    });

    it('rounds negatives symmetrically so a credit note mirrors an invoice', () => {
      expect(roundMinor(-12345, 'NEAREST_WHOLE', 2)).toEqual({ rounded: -12300, adjustment: 45 });
      expect(roundMinor(-12350, 'NEAREST_WHOLE', 2)).toEqual({ rounded: -12400, adjustment: -50 });
    });

    it('keeps the adjustment consistent with the rounded total', () => {
      for (const total of [1, 49, 50, 51, 99, 100, 101, 9999, 10001]) {
        const { rounded, adjustment } = roundMinor(total, 'NEAREST_WHOLE', 2);
        expect(rounded).toBe(total + adjustment);
        expect(rounded % 100).toBe(0);
      }
    });
  });
});
