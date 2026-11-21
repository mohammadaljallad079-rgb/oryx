-- AlterTable
ALTER TABLE "Account" ALTER COLUMN "currency" SET DEFAULT 'BHD';

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

-- Align existing rows that still carry the old SAR default with the platform
-- base currency, so every stored document reports BHD.
UPDATE "Account" SET "currency" = 'BHD' WHERE "currency" = 'SAR';
UPDATE "CreditNote" SET "currency" = 'BHD' WHERE "currency" = 'SAR';
UPDATE "Customer" SET "currency" = 'BHD' WHERE "currency" = 'SAR';
UPDATE "EmployeeAdvance" SET "currency" = 'BHD' WHERE "currency" = 'SAR';
UPDATE "EmploymentContract" SET "currency" = 'BHD' WHERE "currency" = 'SAR';
UPDATE "JournalEntry" SET "currency" = 'BHD' WHERE "currency" = 'SAR';
UPDATE "Lead" SET "currency" = 'BHD' WHERE "currency" = 'SAR';
UPDATE "MarketplaceCommission" SET "currency" = 'BHD' WHERE "currency" = 'SAR';
UPDATE "Opportunity" SET "currency" = 'BHD' WHERE "currency" = 'SAR';
UPDATE "Payment" SET "currency" = 'BHD' WHERE "currency" = 'SAR';
UPDATE "PayrollRun" SET "currency" = 'BHD' WHERE "currency" = 'SAR';
UPDATE "Payslip" SET "currency" = 'BHD' WHERE "currency" = 'SAR';
UPDATE "PosSale" SET "currency" = 'BHD' WHERE "currency" = 'SAR';
UPDATE "ProviderServiceListing" SET "currency" = 'BHD' WHERE "currency" = 'SAR';
UPDATE "ProviderSettlement" SET "currency" = 'BHD' WHERE "currency" = 'SAR';
UPDATE "PurchaseOrder" SET "currency" = 'BHD' WHERE "currency" = 'SAR';
UPDATE "PurchaseReturn" SET "currency" = 'BHD' WHERE "currency" = 'SAR';
UPDATE "Quotation" SET "currency" = 'BHD' WHERE "currency" = 'SAR';
UPDATE "RepairEstimate" SET "currency" = 'BHD' WHERE "currency" = 'SAR';
UPDATE "SalaryStructure" SET "currency" = 'BHD' WHERE "currency" = 'SAR';
UPDATE "SalesInvoice" SET "currency" = 'BHD' WHERE "currency" = 'SAR';
UPDATE "SalesOrder" SET "currency" = 'BHD' WHERE "currency" = 'SAR';
UPDATE "Subscription" SET "currency" = 'BHD' WHERE "currency" = 'SAR';
UPDATE "Supplier" SET "currency" = 'BHD' WHERE "currency" = 'SAR';
UPDATE "SupplierInvoice" SET "currency" = 'BHD' WHERE "currency" = 'SAR';
