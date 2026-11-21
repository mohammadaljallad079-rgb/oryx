import { docStamp, quantity } from './html.util';

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

/**
 * The approved documents' date stamp.
 *
 * The reference prints "Sat 20/09/2026, 3:30 PM" — a short weekday, dd/mm/yyyy
 * and a 12-hour clock in Bahrain time. Both the financial sheets and the
 * inspection report must agree on that shape, so the formatter lives in one
 * place and this pins it.
 */
describe('document date stamp', () => {
  it('formats an instant as weekday, dd/mm/yyyy and a 12-hour time', () => {
    expect(docStamp(new Date('2026-09-20T12:30:00.000Z'))).toBe('Sun 20/09/2026, 3:30 PM');
  });

  it('keeps a late-evening instant on the same Bahrain day', () => {
    // 23:30 in Bahrain is 20:30 UTC; a naive formatter would print 8:30 PM and
    // may roll the calendar day, which would misdate a document issued at night.
    expect(docStamp(new Date('2026-09-20T20:30:00.000Z'))).toBe('Sun 20/09/2026, 11:30 PM');
  });

  it('renders an em dash for a missing or invalid value', () => {
    expect(docStamp(null)).toBe('—');
    expect(docStamp('not-a-date')).toBe('—');
  });
});
