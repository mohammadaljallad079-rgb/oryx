-- UI font scale preference and richer employee document categories.
--
-- `preferredFontScale` persists the operator's chosen UI text size so it
-- survives sign-out, matching the existing theme/locale preferences. The new
-- `PASSPORT` and `VISA` categories let an HR team classify the two documents
-- that a Gulf-region employee file almost always holds, instead of filing them
-- under a generic `IDENTITY`/`OTHER`.
--
-- Guarded with IF NOT EXISTS so a database that already carries the values is a
-- no-op rather than an error that aborts the migration.
DO $$ BEGIN
  CREATE TYPE "FontScale" AS ENUM ('SM', 'MD', 'LG');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "preferredFontScale" "FontScale" NOT NULL DEFAULT 'MD';

ALTER TYPE "EmployeeDocumentCategory" ADD VALUE IF NOT EXISTS 'PASSPORT';
ALTER TYPE "EmployeeDocumentCategory" ADD VALUE IF NOT EXISTS 'VISA';
