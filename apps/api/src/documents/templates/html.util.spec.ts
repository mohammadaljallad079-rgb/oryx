import { quantity } from './html.util';

/**
 * The invoice/quotation quantity column.
 *
 * `line.quantity` is stored scaled by `QUANTITY_SCALE` (10^4) — the same
 * convention `lineAmountMinor` consumes — so the printed figure must be divided
 * back down. Rendering the raw integer printed "10,000" for a single unit on a
 * real invoice, which misstates the document.
 */
describe('document html quantity', () => {
  it('prints one unit for the scaled value of one', () => {
    expect(quantity(10_000)).toBe('1');
  });

  it('prints a whole count without trailing zeros', () => {
    expect(quantity(20_000)).toBe('2');
  });

  it('keeps a genuine fractional quantity', () => {
    expect(quantity(25_000)).toBe('2.5');
  });

  it('keeps two decimal places when they carry information', () => {
    expect(quantity(12_500)).toBe('1.25');
  });

  it('prints zero for an empty line', () => {
    expect(quantity(0)).toBe('0');
  });
});
