-- CreateEnum
CREATE TYPE "CustomerOrderStatus" AS ENUM ('PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY', 'DELIVERED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CustomerOrderPaymentMethod" AS ENUM ('CASH', 'CARD_TERMINAL', 'BANK_TRANSFER', 'BENEFITPAY', 'CARD_ONLINE');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "StockMovementSource" ADD VALUE 'MARKETPLACE_ORDER';
ALTER TYPE "StockMovementSource" ADD VALUE 'MARKETPLACE_ORDER_CANCEL';

-- CreateTable
CREATE TABLE "CustomerOrder" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "customerAccountId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "status" "CustomerOrderStatus" NOT NULL DEFAULT 'PENDING',
    "paymentIntentId" TEXT,
    "paymentMethod" "CustomerOrderPaymentMethod" NOT NULL DEFAULT 'CASH',
    "addressLabel" TEXT,
    "addressLine1" TEXT,
    "addressLine2" TEXT,
    "addressCity" TEXT,
    "addressCountryCode" TEXT,
    "subtotalMinor" INTEGER NOT NULL,
    "taxMinor" INTEGER NOT NULL DEFAULT 0,
    "deliveryMinor" INTEGER NOT NULL DEFAULT 0,
    "totalMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'BHD',
    "notes" TEXT,
    "cancellationReason" TEXT,
    "placedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "idempotencyKey" TEXT,

    CONSTRAINT "CustomerOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerOrderLine" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPriceMinor" INTEGER NOT NULL,
    "taxRateBp" INTEGER NOT NULL DEFAULT 0,
    "lineSubtotalMinor" INTEGER NOT NULL,
    "lineTaxMinor" INTEGER NOT NULL DEFAULT 0,
    "lineTotalMinor" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerOrderLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerOrderEvent" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "status" "CustomerOrderStatus" NOT NULL,
    "note" TEXT,
    "actor" TEXT NOT NULL DEFAULT 'SYSTEM',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerOrderEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CustomerOrder_customerAccountId_placedAt_idx" ON "CustomerOrder"("customerAccountId", "placedAt");

-- CreateIndex
CREATE INDEX "CustomerOrder_companyId_status_idx" ON "CustomerOrder"("companyId", "status");

-- CreateIndex
CREATE INDEX "CustomerOrder_paymentIntentId_idx" ON "CustomerOrder"("paymentIntentId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerOrder_companyId_reference_key" ON "CustomerOrder"("companyId", "reference");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerOrder_customerAccountId_idempotencyKey_key" ON "CustomerOrder"("customerAccountId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "CustomerOrderLine_orderId_idx" ON "CustomerOrderLine"("orderId");

-- CreateIndex
CREATE INDEX "CustomerOrderLine_productId_idx" ON "CustomerOrderLine"("productId");

-- CreateIndex
CREATE INDEX "CustomerOrderEvent_orderId_createdAt_idx" ON "CustomerOrderEvent"("orderId", "createdAt");

-- AddForeignKey
ALTER TABLE "CustomerOrder" ADD CONSTRAINT "CustomerOrder_customerAccountId_fkey" FOREIGN KEY ("customerAccountId") REFERENCES "CustomerAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerOrder" ADD CONSTRAINT "CustomerOrder_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerOrder" ADD CONSTRAINT "CustomerOrder_paymentIntentId_fkey" FOREIGN KEY ("paymentIntentId") REFERENCES "PaymentIntent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerOrderLine" ADD CONSTRAINT "CustomerOrderLine_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "CustomerOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerOrderLine" ADD CONSTRAINT "CustomerOrderLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerOrderEvent" ADD CONSTRAINT "CustomerOrderEvent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "CustomerOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
