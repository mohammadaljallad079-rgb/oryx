-- Company registration number and registered address.
--
-- The approved document footer prints the issuer's commercial registration
-- number ("CR 146375-2") separately from its VAT number, and a registered street
-- address. Both live on the company record, so the columns are added here.
-- Guarded with IF NOT EXISTS because a database provisioned from a sibling
-- branch may already carry them; the statement is then a no-op rather than an
-- error that would abort the migration.
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "crNumber" TEXT;
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "addressLine" TEXT;
