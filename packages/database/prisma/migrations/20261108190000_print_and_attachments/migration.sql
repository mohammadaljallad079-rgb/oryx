-- Print metadata on the company profile. These feed the address block, contact
-- bar and commercial-registration line of the approved printed documents.
--
-- Guarded with IF NOT EXISTS: a database provisioned from the sibling
-- registration-address migration may already carry some of these columns, so a
-- repeated column is a no-op rather than an error that aborts the migration.
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "phone" TEXT;
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "email" TEXT;
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "website" TEXT;
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "addressLine" TEXT;
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "crNumber" TEXT;
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "printNoteEn" TEXT;
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "printNoteAr" TEXT;
