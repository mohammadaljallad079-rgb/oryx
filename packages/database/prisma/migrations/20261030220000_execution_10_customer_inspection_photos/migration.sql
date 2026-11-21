-- CreateTable
CREATE TABLE "CustomerInspectionPhoto" (
    "id" TEXT NOT NULL,
    "customerAccountId" TEXT NOT NULL,
    "vehicleId" TEXT,
    "mediaAssetId" TEXT,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "caption" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerInspectionPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CustomerInspectionPhoto_customerAccountId_createdAt_idx" ON "CustomerInspectionPhoto"("customerAccountId", "createdAt");

-- CreateIndex
CREATE INDEX "CustomerInspectionPhoto_mediaAssetId_idx" ON "CustomerInspectionPhoto"("mediaAssetId");

-- CreateIndex
CREATE INDEX "CustomerInspectionPhoto_vehicleId_idx" ON "CustomerInspectionPhoto"("vehicleId");

-- AddForeignKey
ALTER TABLE "CustomerInspectionPhoto" ADD CONSTRAINT "CustomerInspectionPhoto_customerAccountId_fkey" FOREIGN KEY ("customerAccountId") REFERENCES "CustomerAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerInspectionPhoto" ADD CONSTRAINT "CustomerInspectionPhoto_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerInspectionPhoto" ADD CONSTRAINT "CustomerInspectionPhoto_mediaAssetId_fkey" FOREIGN KEY ("mediaAssetId") REFERENCES "CmsMediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
