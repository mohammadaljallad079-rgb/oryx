-- AlterEnum
ALTER TYPE "InspectionBookingStatus" ADD VALUE 'DRAFT';

-- DropForeignKey
ALTER TABLE "InspectionBooking" DROP CONSTRAINT "InspectionBooking_serviceId_fkey";

-- AlterTable
ALTER TABLE "InspectionBooking" ADD COLUMN     "inspectionTypes" TEXT[] DEFAULT ARRAY[]::TEXT[],
ALTER COLUMN "serviceId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Vehicle" ALTER COLUMN "vin" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "InspectionBooking_companyId_customerId_idx" ON "InspectionBooking"("companyId", "customerId");

-- AddForeignKey
ALTER TABLE "InspectionBooking" ADD CONSTRAINT "InspectionBooking_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "InspectionService"("id") ON DELETE SET NULL ON UPDATE CASCADE;
