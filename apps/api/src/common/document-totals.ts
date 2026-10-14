import { basisPointsOfMinor, lineAmountMinor, sumMinor } from '@oryx/shared';

/**
 * A priced document line before rounding.
 *
 * `quantity` is scaled by 10^4, prices/costs are minor units, and the two rates
 * are basis points (1500 = 15.00%).
 */
export interface PricedLineInput {
  quantity: number;
  unitPriceMinor: number;
  discountPercentBp?: number;
  taxPercentBp?: number;
}

export interface PricedLine extends Required<Omit<PricedLineInput, never>> {
  lineSubtotalMinor: number;
  discountMinor: number;
  taxMinor: number;
  lineTotalMinor: number;
}

export interface DocumentTotals {
  lines: PricedLine[];
  subtotalMinor: number;
  discountMinor: number;
  taxMinor: number;
  totalMinor: number;
}

/**
 * Price a document's lines exactly once each.
 *
 * Every rounding step is a single half-up operation on integers, so the totals
 * are deterministic and reproducible: the same input always yields the same
 * minor-unit totals on the API, in the UI and in a report. The subtotal is the
 * sum of the rounded line subtotals (not a re-rounded aggregate), which is what
 * makes `subtotal - discount + tax === total` hold exactly.
 */
export function computeDocumentTotals(lines: PricedLineInput[]): DocumentTotals {
  const priced: PricedLine[] = lines.map((line) => {
    const discountPercentBp = line.discountPercentBp ?? 0;
    const taxPercentBp = line.taxPercentBp ?? 0;
    const lineSubtotalMinor = lineAmountMinor(line.quantity, line.unitPriceMinor);
    const discountMinor = basisPointsOfMinor(lineSubtotalMinor, discountPercentBp);
    const net = lineSubtotalMinor - discountMinor;
    const taxMinor = basisPointsOfMinor(net, taxPercentBp);
    return {
      quantity: line.quantity,
      unitPriceMinor: line.unitPriceMinor,
      discountPercentBp,
      taxPercentBp,
      lineSubtotalMinor,
      discountMinor,
      taxMinor,
      lineTotalMinor: net + taxMinor,
    };
  });

  const subtotalMinor = sumMinor(priced.map((l) => l.lineSubtotalMinor));
  const discountMinor = sumMinor(priced.map((l) => l.discountMinor));
  const taxMinor = sumMinor(priced.map((l) => l.taxMinor));
  const totalMinor = sumMinor(priced.map((l) => l.lineTotalMinor));

  return { lines: priced, subtotalMinor, discountMinor, taxMinor, totalMinor };
}

/**
 * Split a document's tax total back across lines so the tax that is posted to
 * VAT payable equals the tax that is charged. Uses the line tax figures, which
 * already sum exactly to the document tax total.
 */
export function lineTaxTotal(totals: DocumentTotals): number {
  return sumMinor(totals.lines.map((l) => l.taxMinor));
}
