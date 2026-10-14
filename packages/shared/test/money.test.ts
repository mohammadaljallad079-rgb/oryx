import { describe, expect, it } from 'vitest';
import {
  addMinor,
  allocateMinor,
  basisPointsOfMinor,
  fromMinor,
  fromQuantity,
  isBalanced,
  lineAmountMinor,
  subMinor,
  sumMinor,
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
});
