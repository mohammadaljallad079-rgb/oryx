-- Company finance defaults: the presentation currency and the default tax rate.
--
-- `functionalCurrency` is nullable on purpose. A tenant that has not chosen one
-- reports in its primary `currency`, so NULL means "follow the primary" rather
-- than a value that must be backfilled.
--
-- `defaultTaxRateBp` carries the 15% Bahraini VAT rate the platform already
-- seeded into every new line, so existing rows keep the behaviour they had.
ALTER TABLE "Company" ADD COLUMN     "functionalCurrency" TEXT;
ALTER TABLE "Company" ADD COLUMN     "defaultTaxRateBp" INTEGER NOT NULL DEFAULT 1500;
