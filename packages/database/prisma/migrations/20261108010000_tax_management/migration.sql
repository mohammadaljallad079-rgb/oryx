-- Tax management: a tenant-configurable list of taxes.
--
-- The company already carries one default rate (`defaultTaxRateBp`), but the
-- operator had to type a percentage into every document line. This table gives
-- the tenant a managed list to pick from, with a scope and an application level.
CREATE TYPE "TaxScope" AS ENUM ('SALES', 'PURCHASES', 'BOTH');
CREATE TYPE "TaxApplication" AS ENUM ('LINE', 'TOTAL');

CREATE TABLE "TaxRate" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "rateBp" INTEGER NOT NULL DEFAULT 0,
    "scope" "TaxScope" NOT NULL DEFAULT 'BOTH',
    "applicationLevel" "TaxApplication" NOT NULL DEFAULT 'LINE',
    "pricesIncludeTax" BOOLEAN NOT NULL DEFAULT false,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaxRate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TaxRate_companyId_code_key" ON "TaxRate"("companyId", "code");
CREATE INDEX "TaxRate_companyId_isActive_idx" ON "TaxRate"("companyId", "isActive");

-- At most one default per company. A partial unique index is not expressible in
-- the Prisma schema, so it is written by hand and must stay.
CREATE UNIQUE INDEX "TaxRate_company_default_key" ON "TaxRate"("companyId") WHERE "isDefault";

ALTER TABLE "TaxRate" ADD CONSTRAINT "TaxRate_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
