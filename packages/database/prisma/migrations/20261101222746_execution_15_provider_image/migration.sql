-- AlterTable
ALTER TABLE "MarketplaceProvider" ADD COLUMN     "imageAssetId" TEXT;

-- AddForeignKey
ALTER TABLE "MarketplaceProvider" ADD CONSTRAINT "MarketplaceProvider_imageAssetId_fkey" FOREIGN KEY ("imageAssetId") REFERENCES "CmsMediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
