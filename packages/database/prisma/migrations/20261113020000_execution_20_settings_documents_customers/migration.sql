-- Execution 20 — per-company settings, unified documents and customer types.

-- CreateEnum
CREATE TYPE "SettingNamespace" AS ENUM ('GENERAL', 'INVOICING', 'ACCOUNTING', 'TAX', 'HR', 'INVENTORY', 'SALES', 'MAINTENANCE', 'DOCUMENTS');

-- CreateEnum
CREATE TYPE "CustomerType" AS ENUM ('INDIVIDUAL', 'COMPANY');

-- AlterTable: Customer gains the company/individual split and richer fields.
ALTER TABLE "Customer"
    ADD COLUMN "type" "CustomerType" NOT NULL DEFAULT 'INDIVIDUAL',
    ADD COLUMN "crNumber" TEXT,
    ADD COLUMN "crExpiresAt" TIMESTAMP(3),
    ADD COLUMN "website" TEXT,
    ADD COLUMN "contactPersonName" TEXT,
    ADD COLUMN "contactPersonPhone" TEXT,
    ADD COLUMN "contactPersonEmail" TEXT,
    ADD COLUMN "nationalId" TEXT,
    ADD COLUMN "state" TEXT,
    ADD COLUMN "postalCode" TEXT;

-- AlterTable: EntityAttachment becomes the unified document store.
ALTER TABLE "EntityAttachment"
    ADD COLUMN "category" TEXT,
    ADD COLUMN "title" TEXT,
    ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "CustomerBranch" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contactName" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "addressLine" TEXT,
    "city" TEXT,
    "countryCode" TEXT,
    "isHeadOffice" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerBranch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanySetting" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "namespace" "SettingNamespace" NOT NULL,
    "value" JSONB NOT NULL,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanySetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanySettingRevision" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "namespace" "SettingNamespace" NOT NULL,
    "value" JSONB NOT NULL,
    "changedById" TEXT,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompanySettingRevision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Customer_companyId_type_idx" ON "Customer"("companyId", "type");

-- CreateIndex
CREATE INDEX "CustomerBranch_companyId_customerId_idx" ON "CustomerBranch"("companyId", "customerId");

-- CreateIndex
CREATE INDEX "CompanySetting_companyId_idx" ON "CompanySetting"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "CompanySetting_companyId_namespace_key" ON "CompanySetting"("companyId", "namespace");

-- CreateIndex
CREATE INDEX "CompanySettingRevision_companyId_namespace_changedAt_idx" ON "CompanySettingRevision"("companyId", "namespace", "changedAt");

-- CreateIndex
CREATE INDEX "EntityAttachment_companyId_category_idx" ON "EntityAttachment"("companyId", "category");

-- AddForeignKey
ALTER TABLE "CustomerBranch" ADD CONSTRAINT "CustomerBranch_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerBranch" ADD CONSTRAINT "CustomerBranch_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanySetting" ADD CONSTRAINT "CompanySetting_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanySettingRevision" ADD CONSTRAINT "CompanySettingRevision_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
