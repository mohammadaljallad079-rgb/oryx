-- CreateEnum
CREATE TYPE "InspectionArea" AS ENUM ('PAINT_BODY', 'CHASSIS_UNDERCARRIAGE', 'INTERIOR', 'EXTERIOR', 'ENGINE_COMPARTMENT', 'ROAD_TEST', 'COMPUTER_UNIT');

-- CreateEnum
CREATE TYPE "InspectionResult" AS ENUM ('UNSET', 'PASS', 'FAIL', 'NA');

-- CreateEnum
CREATE TYPE "PaintCondition" AS ENUM ('PAINT', 'FILLER', 'CHANGE', 'SECTIONED');

-- CreateEnum
CREATE TYPE "ChassisCondition" AS ENUM ('UNSET', 'OK', 'DAMAGE');

-- CreateEnum
CREATE TYPE "InspectionSessionStatus" AS ENUM ('DRAFT', 'IN_PROGRESS', 'PENDING_REVIEW', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateTable
CREATE TABLE "InspectionSession" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "jobNumber" TEXT NOT NULL,
    "bookingId" TEXT,
    "customerId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "branchId" TEXT,
    "status" "InspectionSessionStatus" NOT NULL DEFAULT 'DRAFT',
    "inspectorUserId" TEXT,
    "inspectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "customerName" TEXT NOT NULL,
    "contactNumber" TEXT,
    "plateNumber" TEXT,
    "make" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "modelYear" INTEGER NOT NULL,
    "odometer" INTEGER,
    "color" TEXT,
    "vin" TEXT NOT NULL,
    "selectedAreas" "InspectionArea"[],
    "generalRemarks" TEXT,
    "interiorRemarks" TEXT,
    "exteriorRemarks" TEXT,
    "engineRemarks" TEXT,
    "roadTestRemarks" TEXT,
    "finalAssessment" TEXT,
    "submittedById" TEXT,
    "submittedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNotes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InspectionSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InspectionSectionResult" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "area" "InspectionArea" NOT NULL,
    "remarks" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InspectionSectionResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InspectionItemResult" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "itemKey" TEXT NOT NULL,
    "result" "InspectionResult" NOT NULL DEFAULT 'UNSET',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InspectionItemResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InspectionBodyMarker" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "condition" "PaintCondition" NOT NULL,
    "x" DOUBLE PRECISION NOT NULL,
    "y" DOUBLE PRECISION NOT NULL,
    "panelKey" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InspectionBodyMarker_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InspectionChassisRegion" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "regionKey" TEXT NOT NULL,
    "condition" "ChassisCondition" NOT NULL DEFAULT 'UNSET',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InspectionChassisRegion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InspectionDiagnosticEntry" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "faultCode" TEXT,
    "description" TEXT NOT NULL,
    "observation" TEXT,
    "severity" "FindingSeverity" NOT NULL DEFAULT 'INFO',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InspectionDiagnosticEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InspectionAttachment" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "mediaAssetId" TEXT,
    "sectionArea" "InspectionArea",
    "itemKey" TEXT,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "caption" TEXT,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InspectionAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InspectionSession_bookingId_key" ON "InspectionSession"("bookingId");

-- CreateIndex
CREATE INDEX "InspectionSession_companyId_status_idx" ON "InspectionSession"("companyId", "status");

-- CreateIndex
CREATE INDEX "InspectionSession_companyId_vehicleId_idx" ON "InspectionSession"("companyId", "vehicleId");

-- CreateIndex
CREATE INDEX "InspectionSession_companyId_customerId_idx" ON "InspectionSession"("companyId", "customerId");

-- CreateIndex
CREATE UNIQUE INDEX "InspectionSession_companyId_jobNumber_key" ON "InspectionSession"("companyId", "jobNumber");

-- CreateIndex
CREATE INDEX "InspectionSectionResult_companyId_idx" ON "InspectionSectionResult"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "InspectionSectionResult_sessionId_area_key" ON "InspectionSectionResult"("sessionId", "area");

-- CreateIndex
CREATE INDEX "InspectionItemResult_sectionId_idx" ON "InspectionItemResult"("sectionId");

-- CreateIndex
CREATE UNIQUE INDEX "InspectionItemResult_sessionId_itemKey_key" ON "InspectionItemResult"("sessionId", "itemKey");

-- CreateIndex
CREATE INDEX "InspectionBodyMarker_sessionId_idx" ON "InspectionBodyMarker"("sessionId");

-- CreateIndex
CREATE INDEX "InspectionBodyMarker_sectionId_idx" ON "InspectionBodyMarker"("sectionId");

-- CreateIndex
CREATE INDEX "InspectionChassisRegion_sectionId_idx" ON "InspectionChassisRegion"("sectionId");

-- CreateIndex
CREATE UNIQUE INDEX "InspectionChassisRegion_sessionId_regionKey_key" ON "InspectionChassisRegion"("sessionId", "regionKey");

-- CreateIndex
CREATE INDEX "InspectionDiagnosticEntry_sessionId_idx" ON "InspectionDiagnosticEntry"("sessionId");

-- CreateIndex
CREATE INDEX "InspectionAttachment_companyId_sessionId_idx" ON "InspectionAttachment"("companyId", "sessionId");

-- AddForeignKey
ALTER TABLE "InspectionSession" ADD CONSTRAINT "InspectionSession_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InspectionSession" ADD CONSTRAINT "InspectionSession_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InspectionSession" ADD CONSTRAINT "InspectionSession_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InspectionSession" ADD CONSTRAINT "InspectionSession_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "InspectionBooking"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InspectionSession" ADD CONSTRAINT "InspectionSession_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InspectionSectionResult" ADD CONSTRAINT "InspectionSectionResult_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InspectionSectionResult" ADD CONSTRAINT "InspectionSectionResult_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "InspectionSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InspectionItemResult" ADD CONSTRAINT "InspectionItemResult_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InspectionItemResult" ADD CONSTRAINT "InspectionItemResult_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "InspectionSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InspectionItemResult" ADD CONSTRAINT "InspectionItemResult_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "InspectionSectionResult"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InspectionBodyMarker" ADD CONSTRAINT "InspectionBodyMarker_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InspectionBodyMarker" ADD CONSTRAINT "InspectionBodyMarker_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "InspectionSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InspectionBodyMarker" ADD CONSTRAINT "InspectionBodyMarker_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "InspectionSectionResult"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InspectionChassisRegion" ADD CONSTRAINT "InspectionChassisRegion_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InspectionChassisRegion" ADD CONSTRAINT "InspectionChassisRegion_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "InspectionSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InspectionChassisRegion" ADD CONSTRAINT "InspectionChassisRegion_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "InspectionSectionResult"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InspectionDiagnosticEntry" ADD CONSTRAINT "InspectionDiagnosticEntry_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InspectionDiagnosticEntry" ADD CONSTRAINT "InspectionDiagnosticEntry_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "InspectionSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InspectionDiagnosticEntry" ADD CONSTRAINT "InspectionDiagnosticEntry_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "InspectionSectionResult"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InspectionAttachment" ADD CONSTRAINT "InspectionAttachment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InspectionAttachment" ADD CONSTRAINT "InspectionAttachment_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "InspectionSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
