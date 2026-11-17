-- A sales document line can now carry a flat discount in minor units, applied
-- after the percentage discount, so an operator can give "10% and 1.000 BD off"
-- as the approved workflow allows. Existing lines default to zero.
ALTER TABLE "QuotationLine"   ADD COLUMN "discountAmountMinor" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "SalesOrderLine"  ADD COLUMN "discountAmountMinor" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "SalesInvoiceLine" ADD COLUMN "discountAmountMinor" INTEGER NOT NULL DEFAULT 0;
