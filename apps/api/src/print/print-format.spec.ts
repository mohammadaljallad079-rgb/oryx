import { amountInWords, toPrintLines, toPrintTotals } from './print-format';

/**
 * The print model's field mapping.
 *
 * The approved form (`oryx 22 (1).pdf`) prints a whole quantity as "1" (never
 * "1.0000") and every amount with the currency's symbol ("8.250 BD", never
 * "8.250 BHD"), and its totals agree with its own lines. These assertions pin
 * that mapping so a regression in the formatter is caught before it reaches a
 * printed page.
 */
describe('print-format', () => {
  it('trims a whole quantity to the bare integer the form prints', () => {
    // quantity is 10^4-scaled, so 10000 is one whole unit.
    const [line] = toPrintLines(
      [{ description: 'Oil', quantity: 10000, unitPriceMinor: 750, discountPercentBp: 0, taxPercentBp: 1000 }],
      'BHD',
    );
    expect(line.quantity).toBe('1');
  });

  it('keeps a fractional quantity at its own precision', () => {
    const [line] = toPrintLines(
      [{ description: 'Labour', quantity: 25000, unitPriceMinor: 1000, discountPercentBp: 0, taxPercentBp: 0 }],
      'BHD',
    );
    expect(line.quantity).toBe('2.5');
  });

  it('prints amounts with the approved currency symbol, not the ISO code', () => {
    const [line] = toPrintLines(
      [{ description: 'Oil', quantity: 10000, unitPriceMinor: 750, discountPercentBp: 0, taxPercentBp: 1000 }],
      'BHD',
    );
    // 0.750 net + 10% tax = 0.825, printed with the symbol the form uses.
    expect(line.amount).toBe('0.825 BD');
  });

  it('prints the totals block with the currency symbol and a plain tax label', () => {
    const totals = toPrintTotals({
      subtotalMinor: 9500,
      discountMinor: 0,
      taxMinor: 950,
      totalMinor: 10450,
      currency: 'BHD',
      taxRateBp: 1000,
    });
    expect(totals.untaxedAmount).toBe('9.500 BD');
    expect(totals.total).toBe('10.450 BD');
    expect(totals.taxLabel).toBe('Tax 10%');
  });

  it('states the rate the document charged, not the ratio a discount distorts', () => {
    // A 10% line rate applied after a discount yields a tax/subtotal ratio of
    // 9.65%; the approved form prints the stated rate ("Tax 10%").
    const totals = toPrintTotals({
      subtotalMinor: 32000,
      discountMinor: 1125,
      taxMinor: 3088,
      totalMinor: 33963,
      currency: 'BHD',
      taxRateBp: 1000,
    });
    expect(totals.taxLabel).toBe('Tax 10%');
  });

  it('renders a two-decimal currency at its own scale with its own symbol', () => {
    const totals = toPrintTotals({
      subtotalMinor: 950,
      discountMinor: 0,
      taxMinor: 95,
      totalMinor: 1045,
      currency: 'SAR',
    });
    expect(totals.untaxedAmount).toBe('9.50 SAR');
    expect(totals.total).toBe('10.45 SAR');
  });

  it('writes the amount in the currency\'s own subdivision', () => {
    // BHD is subdivided into 1000 fils, so 37500 minor units is 37.500 BD.
    expect(amountInWords(37500, 'BHD')).toBe('Thirty-Seven Bahraini Dinar and Five Hundred Fils Only');
  });
});
