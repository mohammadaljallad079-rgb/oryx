-- Automotive: a catalogue picture for an inspection service.
--
-- The picture references the shared media library (`CmsMediaAsset`), so the
-- bytes are re-encoded and stored once rather than a second image store being
-- created. Guarded with IF NOT EXISTS so a database that already carries the
-- column is a no-op rather than an error that aborts the migration.
ALTER TABLE "InspectionService" ADD COLUMN IF NOT EXISTS "imageAssetId" TEXT;

CREATE INDEX IF NOT EXISTS "InspectionService_imageAssetId_idx" ON "InspectionService"("imageAssetId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'InspectionService_imageAssetId_fkey'
  ) THEN
    ALTER TABLE "InspectionService"
      ADD CONSTRAINT "InspectionService_imageAssetId_fkey"
      FOREIGN KEY ("imageAssetId") REFERENCES "CmsMediaAsset"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
