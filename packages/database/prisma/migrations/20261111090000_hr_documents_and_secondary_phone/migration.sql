-- HR: employee secondary phone and uploaded document files.
--
-- `secondaryPhone` gives an employee a second reachable number beside the
-- primary one, and `fileAssetId` links an employee document to the stored upload
-- backing it (the binary lives in the attachment store, not in the database).
-- Guarded with IF NOT EXISTS so a database that already carries the columns is a
-- no-op rather than an error that aborts the migration.
ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "secondaryPhone" TEXT;
ALTER TABLE "EmployeeDocument" ADD COLUMN IF NOT EXISTS "fileAssetId" TEXT;
