-- CreateEnum
CREATE TYPE "CustomerRfqStatus" AS ENUM ('OPEN', 'QUOTED', 'ACCEPTED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "CustomerRfqQuoteStatus" AS ENUM ('SUBMITTED', 'ACCEPTED', 'REJECTED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "CustomerReturnStatus" AS ENUM ('REQUESTED', 'APPROVED', 'RECEIVED', 'REFUNDED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RecoveryUrgency" AS ENUM ('STANDARD', 'URGENT', 'CRITICAL');

-- CreateEnum
CREATE TYPE "RecoveryStatus" AS ENUM ('REQUESTED', 'ASSIGNED', 'EN_ROUTE', 'ON_SITE', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AiSuggestionReview" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "MarketplaceProvider" ADD COLUMN     "latitude" DECIMAL(10,7),
ADD COLUMN     "longitude" DECIMAL(10,7);

-- CreateTable
CREATE TABLE "CustomerRfq" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "customerAccountId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "vehicleId" TEXT,
    "categoryKey" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "status" "CustomerRfqStatus" NOT NULL DEFAULT 'OPEN',
    "acceptedQuoteId" TEXT,
    "expiresAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerRfq_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerRfqQuote" (
    "id" TEXT NOT NULL,
    "rfqId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "priceMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'BHD',
    "leadTimeDays" INTEGER,
    "note" TEXT,
    "status" "CustomerRfqQuoteStatus" NOT NULL DEFAULT 'SUBMITTED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerRfqQuote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerOrderReturn" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "customerAccountId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "CustomerReturnStatus" NOT NULL DEFAULT 'REQUESTED',
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3),
    "refundedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerOrderReturn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerOrderReturnLine" (
    "id" TEXT NOT NULL,
    "returnId" TEXT NOT NULL,
    "orderLineId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerOrderReturnLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecoveryRequest" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "customerAccountId" TEXT,
    "vehicleId" TEXT,
    "providerId" TEXT,
    "pickupLatitude" DECIMAL(10,7) NOT NULL,
    "pickupLongitude" DECIMAL(10,7) NOT NULL,
    "pickupLabel" TEXT,
    "contactPhone" TEXT NOT NULL,
    "issue" TEXT NOT NULL,
    "urgency" "RecoveryUrgency" NOT NULL DEFAULT 'STANDARD',
    "status" "RecoveryStatus" NOT NULL DEFAULT 'REQUESTED',
    "assignedAt" TIMESTAMP(3),
    "enRouteAt" TIMESTAMP(3),
    "onSiteAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancellationReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecoveryRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecoveryTrackingEvent" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "status" "RecoveryStatus" NOT NULL,
    "note" TEXT,
    "actor" TEXT NOT NULL DEFAULT 'SYSTEM',
    "actorUserId" TEXT,
    "latitude" DECIMAL(10,7),
    "longitude" DECIMAL(10,7),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecoveryTrackingEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FleetAccount" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "customerAccountId" TEXT NOT NULL,
    "contactName" TEXT,
    "contactPhone" TEXT,
    "contactEmail" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FleetAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FleetVehicle" (
    "id" TEXT NOT NULL,
    "fleetId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FleetVehicle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Driver" (
    "id" TEXT NOT NULL,
    "fleetId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "licenceNumber" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Driver_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiSuggestion" (
    "id" TEXT NOT NULL,
    "customerAccountId" TEXT,
    "photoId" TEXT,
    "vehicleId" TEXT,
    "companyId" TEXT,
    "providerKey" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "confidence" DECIMAL(4,3),
    "summary" TEXT NOT NULL,
    "reviewStatus" "AiSuggestionReview" NOT NULL DEFAULT 'PENDING',
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "costMinor" INTEGER NOT NULL DEFAULT 0,
    "latencyMs" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiSuggestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiUsageCounter" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "requestCount" INTEGER NOT NULL DEFAULT 0,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "costMinor" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiUsageCounter_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CustomerRfq_customerAccountId_createdAt_idx" ON "CustomerRfq"("customerAccountId", "createdAt");

-- CreateIndex
CREATE INDEX "CustomerRfq_status_idx" ON "CustomerRfq"("status");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerRfq_companyId_reference_key" ON "CustomerRfq"("companyId", "reference");

-- CreateIndex
CREATE INDEX "CustomerRfqQuote_providerId_idx" ON "CustomerRfqQuote"("providerId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerRfqQuote_rfqId_providerId_key" ON "CustomerRfqQuote"("rfqId", "providerId");

-- CreateIndex
CREATE INDEX "CustomerOrderReturn_customerAccountId_createdAt_idx" ON "CustomerOrderReturn"("customerAccountId", "createdAt");

-- CreateIndex
CREATE INDEX "CustomerOrderReturn_orderId_idx" ON "CustomerOrderReturn"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerOrderReturn_companyId_reference_key" ON "CustomerOrderReturn"("companyId", "reference");

-- CreateIndex
CREATE INDEX "CustomerOrderReturnLine_returnId_idx" ON "CustomerOrderReturnLine"("returnId");

-- CreateIndex
CREATE INDEX "RecoveryRequest_companyId_status_idx" ON "RecoveryRequest"("companyId", "status");

-- CreateIndex
CREATE INDEX "RecoveryRequest_customerAccountId_createdAt_idx" ON "RecoveryRequest"("customerAccountId", "createdAt");

-- CreateIndex
CREATE INDEX "RecoveryRequest_providerId_idx" ON "RecoveryRequest"("providerId");

-- CreateIndex
CREATE UNIQUE INDEX "RecoveryRequest_companyId_reference_key" ON "RecoveryRequest"("companyId", "reference");

-- CreateIndex
CREATE INDEX "RecoveryTrackingEvent_requestId_createdAt_idx" ON "RecoveryTrackingEvent"("requestId", "createdAt");

-- CreateIndex
CREATE INDEX "FleetAccount_customerAccountId_idx" ON "FleetAccount"("customerAccountId");

-- CreateIndex
CREATE INDEX "FleetVehicle_vehicleId_idx" ON "FleetVehicle"("vehicleId");

-- CreateIndex
CREATE UNIQUE INDEX "FleetVehicle_fleetId_vehicleId_key" ON "FleetVehicle"("fleetId", "vehicleId");

-- CreateIndex
CREATE INDEX "Driver_fleetId_idx" ON "Driver"("fleetId");

-- CreateIndex
CREATE INDEX "AiSuggestion_customerAccountId_createdAt_idx" ON "AiSuggestion"("customerAccountId", "createdAt");

-- CreateIndex
CREATE INDEX "AiSuggestion_reviewStatus_idx" ON "AiSuggestion"("reviewStatus");

-- CreateIndex
CREATE INDEX "AiSuggestion_companyId_createdAt_idx" ON "AiSuggestion"("companyId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AiUsageCounter_companyId_day_key" ON "AiUsageCounter"("companyId", "day");

-- AddForeignKey
ALTER TABLE "CustomerRfq" ADD CONSTRAINT "CustomerRfq_customerAccountId_fkey" FOREIGN KEY ("customerAccountId") REFERENCES "CustomerAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerRfq" ADD CONSTRAINT "CustomerRfq_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerRfq" ADD CONSTRAINT "CustomerRfq_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerRfqQuote" ADD CONSTRAINT "CustomerRfqQuote_rfqId_fkey" FOREIGN KEY ("rfqId") REFERENCES "CustomerRfq"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerRfqQuote" ADD CONSTRAINT "CustomerRfqQuote_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "MarketplaceProvider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerOrderReturn" ADD CONSTRAINT "CustomerOrderReturn_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "CustomerOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerOrderReturn" ADD CONSTRAINT "CustomerOrderReturn_customerAccountId_fkey" FOREIGN KEY ("customerAccountId") REFERENCES "CustomerAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerOrderReturn" ADD CONSTRAINT "CustomerOrderReturn_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerOrderReturnLine" ADD CONSTRAINT "CustomerOrderReturnLine_returnId_fkey" FOREIGN KEY ("returnId") REFERENCES "CustomerOrderReturn"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerOrderReturnLine" ADD CONSTRAINT "CustomerOrderReturnLine_orderLineId_fkey" FOREIGN KEY ("orderLineId") REFERENCES "CustomerOrderLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerOrderReturnLine" ADD CONSTRAINT "CustomerOrderReturnLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecoveryRequest" ADD CONSTRAINT "RecoveryRequest_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecoveryRequest" ADD CONSTRAINT "RecoveryRequest_customerAccountId_fkey" FOREIGN KEY ("customerAccountId") REFERENCES "CustomerAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecoveryRequest" ADD CONSTRAINT "RecoveryRequest_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecoveryRequest" ADD CONSTRAINT "RecoveryRequest_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "MarketplaceProvider"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecoveryTrackingEvent" ADD CONSTRAINT "RecoveryTrackingEvent_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "RecoveryRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FleetAccount" ADD CONSTRAINT "FleetAccount_customerAccountId_fkey" FOREIGN KEY ("customerAccountId") REFERENCES "CustomerAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FleetVehicle" ADD CONSTRAINT "FleetVehicle_fleetId_fkey" FOREIGN KEY ("fleetId") REFERENCES "FleetAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FleetVehicle" ADD CONSTRAINT "FleetVehicle_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Driver" ADD CONSTRAINT "Driver_fleetId_fkey" FOREIGN KEY ("fleetId") REFERENCES "FleetAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiSuggestion" ADD CONSTRAINT "AiSuggestion_customerAccountId_fkey" FOREIGN KEY ("customerAccountId") REFERENCES "CustomerAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiSuggestion" ADD CONSTRAINT "AiSuggestion_photoId_fkey" FOREIGN KEY ("photoId") REFERENCES "CustomerInspectionPhoto"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiSuggestion" ADD CONSTRAINT "AiSuggestion_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiSuggestion" ADD CONSTRAINT "AiSuggestion_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
