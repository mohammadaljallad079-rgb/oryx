-- Retain the exact fixed discount on quotation and sales-order lines.
-- Existing percentage-discount rows continue to work: a zero amount falls back
-- to the legacy percentage until explicitly replaced.
ALTER TABLE "QuotationLine" ADD COLUMN "discountMinor" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "SalesOrderLine" ADD COLUMN "discountMinor" INTEGER NOT NULL DEFAULT 0;
