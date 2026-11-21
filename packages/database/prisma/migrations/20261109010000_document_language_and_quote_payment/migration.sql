-- Document language and quotation settlement fields.
--
-- `Company.documentLocale` decides the reading direction of an issued document:
-- an Arabic invoice prints right-to-left, an English one left-to-right. Both
-- languages' labels are always printed; this only chooses the flow. Default
-- `en` matches the pre-existing render path, which fell back to left-to-right
-- whenever no locale was set, so no existing document changes direction.
--
-- `Quotation` and `SalesOrder` gain the same `paymentMethod`/`salespersonName`
-- pair the invoice already carries, because the approved printed quotation and
-- order show a "Payment" line and a "Staf Name" exactly as the invoice does.
ALTER TABLE "Company" ADD COLUMN "documentLocale" "Locale" NOT NULL DEFAULT 'en';
ALTER TABLE "Quotation" ADD COLUMN "paymentMethod" "PaymentMethod" NOT NULL DEFAULT 'CASH';
ALTER TABLE "Quotation" ADD COLUMN "salespersonName" TEXT;
ALTER TABLE "Quotation" ADD COLUMN "paymentReference" TEXT;
ALTER TABLE "SalesOrder" ADD COLUMN "paymentMethod" "PaymentMethod" NOT NULL DEFAULT 'CASH';
ALTER TABLE "SalesOrder" ADD COLUMN "salespersonName" TEXT;
