/*
  Adds a rotation family id to refresh tokens.

  A family groups every rotation of one login, so revoking a compromised chain
  does not disturb the user's other devices.

  The column is added nullable, backfilled, then made required, so the migration
  is safe on a populated table. Each pre-existing row becomes the root of its own
  family: those rows predate the feature and have no successor chain to rebuild.
*/

-- AlterTable: add nullable first
ALTER TABLE "RefreshToken" ADD COLUMN "familyId" TEXT;

-- Backfill: every existing token becomes the root of its own family.
UPDATE "RefreshToken" SET "familyId" = "id" WHERE "familyId" IS NULL;

-- AlterTable: now safe to require
ALTER TABLE "RefreshToken" ALTER COLUMN "familyId" SET NOT NULL;

-- CreateIndex
CREATE INDEX "RefreshToken_familyId_idx" ON "RefreshToken"("familyId");
