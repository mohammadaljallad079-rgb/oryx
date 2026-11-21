CREATE TABLE "StockProductCategory" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StockProductCategory_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "StockProductCategory_companyId_name_key" ON "StockProductCategory"("companyId", "name");
CREATE INDEX "StockProductCategory_companyId_idx" ON "StockProductCategory"("companyId");
