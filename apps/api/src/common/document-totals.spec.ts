import { computeDocumentTotals } from './document-totals';

describe('VAT before sales discounts', () => {
  it('calculates VAT on the original line value then subtracts a fixed discount', () => {
    // BHD: two units at 10.000, VAT 10% on 20.000, then discount 1.500.
    const priced = computeDocumentTotals([
      { quantity: 20_000, unitPriceMinor: 10_000, discountAmountMinor: 1_500, taxPercentBp: 1_000 },
    ], 'NONE', 3);
    expect(priced.lines[0].unitPriceMinor).toBe(10_000);
    expect(priced.subtotalMinor).toBe(20_000);
    expect(priced.discountMinor).toBe(1_500);
    expect(priced.taxMinor).toBe(2_000);
    expect(priced.totalMinor).toBe(20_500);
  });

  it('matches quotation Q00002: 28.000 plus 10% tax less 1.000 discount equals 29.800 BHD', () => {
    const priced = computeDocumentTotals([
      { quantity: 10_000, unitPriceMinor: 28_000, discountAmountMinor: 1_000, taxPercentBp: 1_000 },
    ], 'NONE', 3);
    expect(priced.subtotalMinor).toBe(28_000);
    expect(priced.taxMinor).toBe(2_800);
    expect(priced.discountMinor).toBe(1_000);
    expect(priced.totalMinor).toBe(29_800);
  });

  it('retains compatibility with legacy percentage discounts', () => {
    const priced = computeDocumentTotals([
      { quantity: 10_000, unitPriceMinor: 10_000, discountPercentBp: 1_000, taxPercentBp: 1_000 },
    ], 'NONE', 3);
    expect(priced.discountMinor).toBe(1_000);
    expect(priced.taxMinor).toBe(1_000);
    expect(priced.totalMinor).toBe(10_000);
  });

  it('never discounts below zero and still charges VAT on the original price', () => {
    const priced = computeDocumentTotals([
      { quantity: 10_000, unitPriceMinor: 5_000, discountAmountMinor: 8_000, taxPercentBp: 1_000 },
    ], 'NONE', 3);
    expect(priced.discountMinor).toBe(5_000);
    expect(priced.taxMinor).toBe(500);
    expect(priced.totalMinor).toBe(500);
  });
});
