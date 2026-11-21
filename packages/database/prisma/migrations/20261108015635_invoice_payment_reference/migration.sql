-- The bank/reference printed beneath "Payment at Account" on the invoice.
--
-- The approved printed invoice carries the same settlement reference the
-- quotation does. `Quotation` already stores it; the invoice form collects it,
-- so the invoice column has to exist for the value to survive a save and be
-- printed on a reprint.
ALTER TABLE "SalesInvoice" ADD COLUMN "paymentReference" TEXT;
