-- AlterTable
ALTER TABLE "CmsBanner" ADD COLUMN     "mediaAssetId" TEXT;

-- AlterTable
ALTER TABLE "ServiceCategory" ADD COLUMN     "descriptionAr" TEXT,
ADD COLUMN     "descriptionEn" TEXT,
ADD COLUMN     "imageAssetId" TEXT;

-- CreateTable
CREATE TABLE "CmsMediaFolder" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CmsMediaFolder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CmsMediaAsset" (
    "id" TEXT NOT NULL,
    "folderId" TEXT,
    "originalName" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "dominantColor" TEXT,
    "blurDataUrl" TEXT,
    "variants" JSONB NOT NULL DEFAULT '{}',
    "focalX" DOUBLE PRECISION NOT NULL DEFAULT 50,
    "focalY" DOUBLE PRECISION NOT NULL DEFAULT 50,
    "altAr" TEXT,
    "altEn" TEXT,
    "caption" TEXT,
    "credit" TEXT,
    "licenseNote" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdByUserId" TEXT,

    CONSTRAINT "CmsMediaAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CmsMediaAssetVersion" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "actorUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CmsMediaAssetVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CmsContentBlock" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "locale" "Locale" NOT NULL,
    "value" TEXT NOT NULL,
    "body" TEXT,
    "mediaAssetId" TEXT,
    "linkUrl" TEXT,
    "linkLabel" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedByUserId" TEXT,

    CONSTRAINT "CmsContentBlock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CmsContentRevision" (
    "id" TEXT NOT NULL,
    "blockId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "actorUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CmsContentRevision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CmsMediaFolder_slug_key" ON "CmsMediaFolder"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "CmsMediaAsset_storageKey_key" ON "CmsMediaAsset"("storageKey");

-- CreateIndex
CREATE INDEX "CmsMediaAsset_folderId_idx" ON "CmsMediaAsset"("folderId");

-- CreateIndex
CREATE INDEX "CmsMediaAsset_createdAt_idx" ON "CmsMediaAsset"("createdAt");

-- CreateIndex
CREATE INDEX "CmsMediaAssetVersion_assetId_createdAt_idx" ON "CmsMediaAssetVersion"("assetId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CmsMediaAssetVersion_assetId_revision_key" ON "CmsMediaAssetVersion"("assetId", "revision");

-- CreateIndex
CREATE INDEX "CmsContentBlock_isPublished_idx" ON "CmsContentBlock"("isPublished");

-- CreateIndex
CREATE UNIQUE INDEX "CmsContentBlock_key_locale_key" ON "CmsContentBlock"("key", "locale");

-- CreateIndex
CREATE INDEX "CmsContentRevision_blockId_createdAt_idx" ON "CmsContentRevision"("blockId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CmsContentRevision_blockId_revision_key" ON "CmsContentRevision"("blockId", "revision");

-- CreateIndex
CREATE INDEX "CmsBanner_mediaAssetId_idx" ON "CmsBanner"("mediaAssetId");

-- CreateIndex
CREATE INDEX "ServiceCategory_imageAssetId_idx" ON "ServiceCategory"("imageAssetId");

-- AddForeignKey
ALTER TABLE "CmsBanner" ADD CONSTRAINT "CmsBanner_mediaAssetId_fkey" FOREIGN KEY ("mediaAssetId") REFERENCES "CmsMediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceCategory" ADD CONSTRAINT "ServiceCategory_imageAssetId_fkey" FOREIGN KEY ("imageAssetId") REFERENCES "CmsMediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CmsMediaAsset" ADD CONSTRAINT "CmsMediaAsset_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "CmsMediaFolder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CmsMediaAsset" ADD CONSTRAINT "CmsMediaAsset_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CmsMediaAssetVersion" ADD CONSTRAINT "CmsMediaAssetVersion_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "CmsMediaAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CmsContentBlock" ADD CONSTRAINT "CmsContentBlock_mediaAssetId_fkey" FOREIGN KEY ("mediaAssetId") REFERENCES "CmsMediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CmsContentBlock" ADD CONSTRAINT "CmsContentBlock_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

