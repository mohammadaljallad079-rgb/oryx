-- Execution 20 — supplemental storefront schema.
-- The base storefront migration (20261113174116_storefront_public_website)
-- already creates the shared enums, ContactMessage, WebOrder, WebOrderLine,
-- CustomerWishlistItem and their common indexes/relations. This migration
-- adds only the remaining storefront fields and SiteContent.
-- All additions are guarded so an environment that already has an additive
-- field does not fail or lose existing data.

-- Add guest contact fields to booking slots.
ALTER TABLE "BookingSlot"
  ADD COLUMN IF NOT EXISTS "guestEmail" TEXT,
  ADD COLUMN IF NOT EXISTS "guestName" TEXT,
  ADD COLUMN IF NOT EXISTS "guestPhone" TEXT;

-- Add public branch profile fields.
ALTER TABLE "Branch"
  ADD COLUMN IF NOT EXISTS "descriptionAr" TEXT,
  ADD COLUMN IF NOT EXISTS "descriptionEn" TEXT,
  ADD COLUMN IF NOT EXISTS "email" TEXT,
  ADD COLUMN IF NOT EXISTS "imageUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "isPublished" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "latitude" DECIMAL(10,7),
  ADD COLUMN IF NOT EXISTS "longitude" DECIMAL(10,7),
  ADD COLUMN IF NOT EXISTS "servicesOffered" TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS "whatsapp" TEXT;

-- Add the product image field; the remaining product storefront fields are
-- already supplied by the base storefront migration.
ALTER TABLE "Product"
  ADD COLUMN IF NOT EXISTS "imageUrl" TEXT;

-- Public website content, localized by locale.
CREATE TABLE IF NOT EXISTS "SiteContent" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL DEFAULT 'website',
    "locale" "Locale" NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SiteContent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "SiteContent_key_locale_key"
  ON "SiteContent"("key", "locale");

-- The base migration creates ContactMessage before companyId was introduced.
-- Preserve existing messages by deriving their company from the selected
-- branch. If a legacy message has no branch, only use a fallback when the
-- database contains exactly one company; never guess across tenants.
ALTER TABLE "ContactMessage"
  ADD COLUMN IF NOT EXISTS "companyId" TEXT;

UPDATE "ContactMessage" AS cm
SET "companyId" = b."companyId"
FROM "Branch" AS b
WHERE cm."branchId" = b."id"
  AND cm."companyId" IS NULL;

DO $$
DECLARE
  sole_company_id TEXT;
BEGIN
  SELECT MIN("id") INTO sole_company_id
  FROM "Company"
  HAVING COUNT(*) = 1;

  IF sole_company_id IS NOT NULL THEN
    UPDATE "ContactMessage"
    SET "companyId" = sole_company_id
    WHERE "companyId" IS NULL;
  END IF;

  IF EXISTS (SELECT 1 FROM "ContactMessage" WHERE "companyId" IS NULL) THEN
    RAISE EXCEPTION 'Cannot safely assign companyId to legacy ContactMessage rows. Assign each row to its correct company, then rerun this migration.';
  END IF;
END $$;

ALTER TABLE "ContactMessage"
  ALTER COLUMN "companyId" SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ContactMessage_companyId_fkey'
      AND conrelid = '"ContactMessage"'::regclass
  ) THEN
    ALTER TABLE "ContactMessage"
      ADD CONSTRAINT "ContactMessage_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "Company"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "ContactMessage_companyId_status_createdAt_idx"
  ON "ContactMessage"("companyId", "status", "createdAt");
