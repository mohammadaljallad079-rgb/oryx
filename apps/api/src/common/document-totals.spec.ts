import { computeDocumentTotals } from './document-totals';

describe('fixed sales discounts', () => {
  it('subtracts a fixed line discount before applying VAT without changing the unit price', () => {
    // BHD: two units at 10.000, fixed discount 1.500, VAT 10% on 18.500.
    const priced = computeDocumentTotals([
      { quantity: 20_000, unitPriceMinor: 10_000, discountAmountMinor: 1_500, taxPercentBp: 1_000 },
    ], 'NONE', 3);
    expect(priced.lines[0].unitPriceMinor).toBe(10_000);
    expect(priced.subtotalMinor).toBe(20_000);
    expect(priced.discountMinor).toBe(1_500);
    expect(priced.taxMinor).toBe(1_850);
    expect(priced.totalMinor).toBe(20_350);
  });

  it('retains compatibility with legacy percentage discounts', () => {
    const priced = computeDocumentTotals([
      { quantity: 10_000, unitPriceMinor: 10_000, discountPercentBp: 1_000, taxPercentBp: 1_000 },
    ], 'NONE', 3);
    expect(priced.discountMinor).toBe(1_000);
    expect(priced.taxMinor).toBe(900);
    expect(priced.totalMinor).toBe(9_900);
  });

  it('never discounts below zero or taxes a negative base', () => {
    const priced = computeDocumentTotals([
      { quantity: 10_000, unitPriceMinor: 5_000, discountAmountMinor: 8_000, taxPercentBp: 1_000 },
    ], 'NONE', 3);
    expect(priced.discountMinor).toBe(5_000);
    expect(priced.taxMinor).toBe(0);
    expect(priced.totalMinor).toBe(0);
  });
});
