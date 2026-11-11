-- Optional whole-amount cash rounding.
--
-- A tenant may round an issued document total to the nearest whole (or half)
-- major unit at cash settlement. The rounding difference is posted to a
-- dedicated gain/loss account so the ledger still balances against the rounded
-- receivable. `NONE` is the default, so existing tenants keep exact totals.
CREATE TYPE "RoundingMode" AS ENUM ('NONE', 'NEAREST_WHOLE', 'NEAREST_HALF');

ALTER TABLE "Company" ADD COLUMN "roundingMode" "RoundingMode" NOT NULL DEFAULT 'NONE';
ALTER TABLE "Quotation" ADD COLUMN "roundingMinor" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "SalesOrder" ADD COLUMN "roundingMinor" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "SalesInvoice" ADD COLUMN "roundingMinor" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "CreditNote" ADD COLUMN "roundingMinor" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "PosSale" ADD COLUMN "roundingMinor" INTEGER NOT NULL DEFAULT 0;
