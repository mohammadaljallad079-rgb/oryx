-- CreateEnum
CREATE TYPE "PartCondition" AS ENUM ('NEW', 'REFURBISHED');

-- CreateEnum
CREATE TYPE "FulfilmentMethod" AS ENUM ('COLLECTION', 'DELIVERY');

-- CreateEnum
CREATE TYPE "ContactMessageStatus" AS ENUM ('NEW', 'READ', 'HANDLED');

-- CreateEnum
CREATE TYPE "WebOrderStatus" AS ENUM ('PENDING', 'CONFIRMED', 'PAID', 'CANCELLED');

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "brand" TEXT,
ADD COLUMN     "compareAtPriceMinor" INTEGER,
ADD COLUMN     "descriptionAr" TEXT,
ADD COLUMN     "descriptionEn" TEXT,
ADD COLUMN     "engineType" TEXT,
ADD COLUMN     "isFeatured" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isPublished" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "partCategoryKey" TEXT,
ADD COLUMN     "partCondition" "PartCondition" NOT NULL DEFAULT 'NEW',
ADD COLUMN     "warrantyAr" TEXT,
ADD COLUMN     "warrantyEn" TEXT;

-- CreateTable
CREATE TABLE "CustomerWishlistItem" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerWishlistItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContactMessage" (
    "id" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "subject" TEXT,
    "message" TEXT NOT NULL,
    "branchId" TEXT,
    "locale" TEXT NOT NULL DEFAULT 'ar',
    "status" "ContactMessageStatus" NOT NULL DEFAULT 'NEW',
    "handledById" TEXT,
    "handledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContactMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebOrder" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "branchId" TEXT,
    "orderNumber" TEXT NOT NULL,
    "customerAccountId" TEXT NOT NULL,
    "customerId" TEXT,
    "salesInvoiceId" TEXT,
    "paymentIntentId" TEXT,
    "fulfilment" "FulfilmentMethod" NOT NULL DEFAULT 'COLLECTION',
    "deliveryAddress" JSONB,
    "contactName" TEXT NOT NULL,
    "contactPhone" TEXT NOT NULL,
    "contactEmail" TEXT,
    "notes" TEXT,
    "subtotalMinor" INTEGER NOT NULL DEFAULT 0,
    "discountMinor" INTEGER NOT NULL DEFAULT 0,
    "taxMinor" INTEGER NOT NULL DEFAULT 0,
    "shippingMinor" INTEGER NOT NULL DEFAULT 0,
    "totalMinor" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'BHD',
    "currencyScale" INTEGER NOT NULL DEFAULT 3,
    "status" "WebOrderStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WebOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebOrderLine" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPriceMinor" INTEGER NOT NULL,
    "taxPercentBp" INTEGER NOT NULL DEFAULT 0,
    "lineTotalMinor" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "WebOrderLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CustomerWishlistItem_accountId_idx" ON "CustomerWishlistItem"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerWishlistItem_accountId_productId_key" ON "CustomerWishlistItem"("accountId", "productId");

-- CreateIndex
CREATE INDEX "ContactMessage_status_createdAt_idx" ON "ContactMessage"("status", "createdAt");

-- CreateIndex
CREATE INDEX "WebOrder_customerAccountId_createdAt_idx" ON "WebOrder"("customerAccountId", "createdAt");

-- CreateIndex
CREATE INDEX "WebOrder_companyId_status_idx" ON "WebOrder"("companyId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "WebOrder_companyId_orderNumber_key" ON "WebOrder"("companyId", "orderNumber");

-- CreateIndex
CREATE INDEX "WebOrderLine_orderId_idx" ON "WebOrderLine"("orderId");

-- CreateIndex
CREATE INDEX "WebOrderLine_productId_idx" ON "WebOrderLine"("productId");

-- CreateIndex
CREATE INDEX "Product_companyId_isPublished_partCategoryKey_idx" ON "Product"("companyId", "isPublished", "partCategoryKey");

-- AddForeignKey
ALTER TABLE "CustomerWishlistItem" ADD CONSTRAINT "CustomerWishlistItem_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "CustomerAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerWishlistItem" ADD CONSTRAINT "CustomerWishlistItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactMessage" ADD CONSTRAINT "ContactMessage_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactMessage" ADD CONSTRAINT "ContactMessage_handledById_fkey" FOREIGN KEY ("handledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebOrder" ADD CONSTRAINT "WebOrder_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebOrder" ADD CONSTRAINT "WebOrder_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebOrder" ADD CONSTRAINT "WebOrder_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebOrder" ADD CONSTRAINT "WebOrder_customerAccountId_fkey" FOREIGN KEY ("customerAccountId") REFERENCES "CustomerAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebOrder" ADD CONSTRAINT "WebOrder_salesInvoiceId_fkey" FOREIGN KEY ("salesInvoiceId") REFERENCES "SalesInvoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebOrder" ADD CONSTRAINT "WebOrder_paymentIntentId_fkey" FOREIGN KEY ("paymentIntentId") REFERENCES "PaymentIntent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebOrderLine" ADD CONSTRAINT "WebOrderLine_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "WebOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebOrderLine" ADD CONSTRAINT "WebOrderLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
