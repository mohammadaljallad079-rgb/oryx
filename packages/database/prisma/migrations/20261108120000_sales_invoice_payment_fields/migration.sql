-- Invoice settlement method and salesperson.
--
-- The official invoice template prints a "Payment" line and the "Staf Name"
-- that issued the document. Both belong to the invoice itself, not only to the
-- cash receipt that later settles it, so a reprint of an invoice always shows
-- how it was paid. Defaults keep every existing invoice valid.
ALTER TABLE "SalesInvoice" ADD COLUMN "paymentMethod" "PaymentMethod" NOT NULL DEFAULT 'CASH';
ALTER TABLE "SalesInvoice" ADD COLUMN "salespersonName" TEXT;
