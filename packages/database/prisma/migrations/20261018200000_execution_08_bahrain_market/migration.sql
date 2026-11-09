-- AlterTable
ALTER TABLE "Account" ALTER COLUMN "currency" SET DEFAULT 'BHD';

-- AlterTable
ALTER TABLE "Branch" ALTER COLUMN "timezone" SET DEFAULT 'Asia/Bahrain';

-- AlterTable
ALTER TABLE "Company" ALTER COLUMN "currency" SET DEFAULT 'BHD',
ALTER COLUMN "timezone" SET DEFAULT 'Asia/Bahrain';

-- AlterTable
ALTER TABLE "CreditNote" ALTER COLUMN "currency" SET DEFAULT 'BHD';

-- AlterTable
ALTER TABLE "Customer" ALTER COLUMN "currency" SET DEFAULT 'BHD';

-- AlterTable
ALTER TABLE "EmployeeAdvance" ALTER COLUMN "currency" SET DEFAULT 'BHD';

-- AlterTable
ALTER TABLE "EmploymentContract" ALTER COLUMN "currency" SET DEFAULT 'BHD';

-- AlterTable
ALTER TABLE "JournalEntry" ALTER COLUMN "currency" SET DEFAULT 'BHD';

-- AlterTable
ALTER TABLE "Lead" ALTER COLUMN "currency" SET DEFAULT 'BHD';

-- AlterTable
ALTER TABLE "MarketplaceCommission" ALTER COLUMN "currency" SET DEFAULT 'BHD';

-- AlterTable
ALTER TABLE "Opportunity" ALTER COLUMN "currency" SET DEFAULT 'BHD';

-- AlterTable
ALTER TABLE "Payment" ALTER COLUMN "currency" SET DEFAULT 'BHD';

-- AlterTable
ALTER TABLE "PayrollRun" ALTER COLUMN "currency" SET DEFAULT 'BHD';

-- AlterTable
ALTER TABLE "Payslip" ALTER COLUMN "currency" SET DEFAULT 'BHD';

-- AlterTable
ALTER TABLE "Plan" ALTER COLUMN "currency" SET DEFAULT 'BHD';

-- AlterTable
ALTER TABLE "PosSale" ALTER COLUMN "currency" SET DEFAULT 'BHD';

-- AlterTable
ALTER TABLE "ProviderServiceListing" ALTER COLUMN "currency" SET DEFAULT 'BHD';

-- AlterTable
ALTER TABLE "ProviderSettlement" ALTER COLUMN "currency" SET DEFAULT 'BHD';

-- AlterTable
ALTER TABLE "PurchaseOrder" ALTER COLUMN "currency" SET DEFAULT 'BHD';

-- AlterTable
ALTER TABLE "PurchaseReturn" ALTER COLUMN "currency" SET DEFAULT 'BHD';

-- AlterTable
ALTER TABLE "Quotation" ALTER COLUMN "currency" SET DEFAULT 'BHD';

-- AlterTable
ALTER TABLE "RepairEstimate" ALTER COLUMN "currency" SET DEFAULT 'BHD';

-- AlterTable
ALTER TABLE "SalaryStructure" ALTER COLUMN "currency" SET DEFAULT 'BHD';

-- AlterTable
ALTER TABLE "SalesInvoice" ALTER COLUMN "currency" SET DEFAULT 'BHD';

-- AlterTable
ALTER TABLE "SalesOrder" ALTER COLUMN "currency" SET DEFAULT 'BHD';

-- AlterTable
ALTER TABLE "Subscription" ALTER COLUMN "currency" SET DEFAULT 'BHD';

-- AlterTable
ALTER TABLE "Supplier" ALTER COLUMN "currency" SET DEFAULT 'BHD';

-- AlterTable
ALTER TABLE "SupplierInvoice" ALTER COLUMN "currency" SET DEFAULT 'BHD';

-- CreateTable
CREATE TABLE "ServiceArea" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "countryCode" TEXT NOT NULL DEFAULT 'BH',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceArea_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ServiceArea_code_key" ON "ServiceArea"("code");

-- CreateIndex
CREATE INDEX "ServiceArea_countryCode_isActive_idx" ON "ServiceArea"("countryCode", "isActive");

