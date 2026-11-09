-- Per-company visual identity.
--
-- Additive only: one new table and its foreign keys. No existing column is
-- altered or dropped, so applying this to a live database cannot lose data.
-- A company with no row resolves to the ORYX default in the API, which is why
-- every column is nullable and no backfill is required.

-- CreateTable
CREATE TABLE "CompanyBranding" (
    "companyId" TEXT NOT NULL,
    "nameEn" TEXT,
    "nameAr" TEXT,
    "logoAssetId" TEXT,
    "logoDarkAssetId" TEXT,
    "faviconAssetId" TEXT,
    "primaryColor" TEXT,
    "accentColor" TEXT,
    "supportEmail" TEXT,
    "supportPhone" TEXT,
    "websiteUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyBranding_pkey" PRIMARY KEY ("companyId")
);

-- AddForeignKey
ALTER TABLE "CompanyBranding" ADD CONSTRAINT "CompanyBranding_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyBranding" ADD CONSTRAINT "CompanyBranding_logoAssetId_fkey" FOREIGN KEY ("logoAssetId") REFERENCES "CmsMediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyBranding" ADD CONSTRAINT "CompanyBranding_logoDarkAssetId_fkey" FOREIGN KEY ("logoDarkAssetId") REFERENCES "CmsMediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyBranding" ADD CONSTRAINT "CompanyBranding_faviconAssetId_fkey" FOREIGN KEY ("faviconAssetId") REFERENCES "CmsMediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
