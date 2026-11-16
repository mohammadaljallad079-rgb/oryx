-- CreateEnum
CREATE TYPE "CustomerKind" AS ENUM ('INDIVIDUAL', 'COMPANY');

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "contactPersonName" TEXT,
ADD COLUMN     "contactPersonPhone" TEXT,
ADD COLUMN     "crExpiryDate" TIMESTAMP(3),
ADD COLUMN     "crNumber" TEXT,
ADD COLUMN     "kind" "CustomerKind" NOT NULL DEFAULT 'INDIVIDUAL',
ADD COLUMN     "nationalId" TEXT,
ADD COLUMN     "parentCustomerId" TEXT,
ADD COLUMN     "website" TEXT;

-- CreateTable
CREATE TABLE "CustomerBranch" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "contactName" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "addressLine" TEXT,
    "city" TEXT,
    "countryCode" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerBranch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanySetting" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "section" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanySetting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CustomerBranch_companyId_customerId_idx" ON "CustomerBranch"("companyId", "customerId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerBranch_companyId_code_key" ON "CustomerBranch"("companyId", "code");

-- CreateIndex
CREATE INDEX "CompanySetting_companyId_idx" ON "CompanySetting"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "CompanySetting_companyId_section_key" ON "CompanySetting"("companyId", "section");

-- CreateIndex
CREATE INDEX "Customer_companyId_kind_idx" ON "Customer"("companyId", "kind");

-- CreateIndex
CREATE INDEX "Customer_parentCustomerId_idx" ON "Customer"("parentCustomerId");

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_parentCustomerId_fkey" FOREIGN KEY ("parentCustomerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerBranch" ADD CONSTRAINT "CustomerBranch_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerBranch" ADD CONSTRAINT "CustomerBranch_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanySetting" ADD CONSTRAINT "CompanySetting_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
