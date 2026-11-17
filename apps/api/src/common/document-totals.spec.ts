import { computeDocumentTotals } from './document-totals';

/**
 * The flat line discount composes with the percentage discount: the percentage
 * is taken first, then the flat amount is subtracted, and the flat amount is
 * clamped so it can never push the net (and the tax base) below zero.
 */
describe('computeDocumentTotals — flat line discount', () => {
  it('applies the percentage first, then the flat amount', () => {
    const totals = computeDocumentTotals([
      // 2 × 10.000 = 20.000; 10% = 2.000; flat 1.000 → net 17.000; VAT 10% = 1.700.
      { quantity: 20_000, unitPriceMinor: 10_000, discountPercentBp: 1_000, discountAmountMinor: 1_000, taxPercentBp: 1_000 },
    ]);
    expect(totals.lines[0].lineSubtotalMinor).toBe(20_000);
    expect(totals.lines[0].discountMinor).toBe(3_000);
    expect(totals.lines[0].taxMinor).toBe(1_700);
    expect(totals.lines[0].lineTotalMinor).toBe(18_700);
    expect(totals.discountMinor).toBe(3_000);
    expect(totals.totalMinor).toBe(18_700);
  });

  it('clamps the flat amount to the line so the net never goes negative', () => {
    const totals = computeDocumentTotals([
      { quantity: 10_000, unitPriceMinor: 5_000, discountPercentBp: 0, discountAmountMinor: 9_999, taxPercentBp: 1_000 },
    ]);
    // The line is 5.000; the requested 9.999 flat discount is clamped to 5.000.
    expect(totals.lines[0].discountAmountMinor).toBe(5_000);
    expect(totals.lines[0].discountMinor).toBe(5_000);
    expect(totals.lines[0].lineTotalMinor).toBe(0);
    expect(totals.totalMinor).toBe(0);
  });

  it('leaves a line with no flat discount unchanged', () => {
    const totals = computeDocumentTotals([
      { quantity: 10_000, unitPriceMinor: 1_000, discountPercentBp: 1_000, taxPercentBp: 1_000 },
    ]);
    expect(totals.lines[0].discountAmountMinor).toBe(0);
    expect(totals.lines[0].discountMinor).toBe(100);
    expect(totals.lines[0].taxMinor).toBe(90);
    expect(totals.lines[0].lineTotalMinor).toBe(990);
  });
});
