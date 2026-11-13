/*
  Storefront follow-up.

  `ContactMessage` was created by the immediately preceding migration and has
  never been written to, so adding its required `companyId` is safe. The column
  is backfilled from the first active company only to satisfy the NOT NULL
  constraint; every row written by the application supplies the real tenant.
*/

-- DropIndex
DROP INDEX "ContactMessage_status_createdAt_idx";

-- AlterTable
ALTER TABLE "BookingSlot" ADD COLUMN     "guestEmail" TEXT,
ADD COLUMN     "guestName" TEXT,
ADD COLUMN     "guestPhone" TEXT;

-- AlterTable
ALTER TABLE "Branch" ADD COLUMN     "descriptionAr" TEXT,
ADD COLUMN     "descriptionEn" TEXT,
ADD COLUMN     "email" TEXT,
ADD COLUMN     "imageUrl" TEXT,
ADD COLUMN     "isPublished" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "latitude" DECIMAL(10,7),
ADD COLUMN     "longitude" DECIMAL(10,7),
ADD COLUMN     "servicesOffered" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "whatsapp" TEXT;

-- AlterTable
ALTER TABLE "ContactMessage" ADD COLUMN     "companyId" TEXT;
UPDATE "ContactMessage" SET "companyId" = (SELECT "id" FROM "Company" ORDER BY "createdAt" ASC LIMIT 1) WHERE "companyId" IS NULL;
ALTER TABLE "ContactMessage" ALTER COLUMN "companyId" SET NOT NULL;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "imageUrl" TEXT;

-- CreateIndex
CREATE INDEX "ContactMessage_companyId_status_createdAt_idx" ON "ContactMessage"("companyId", "status", "createdAt");

-- AddForeignKey
ALTER TABLE "ContactMessage" ADD CONSTRAINT "ContactMessage_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
