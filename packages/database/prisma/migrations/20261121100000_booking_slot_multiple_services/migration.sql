-- A booking reserves ONE resource/time interval even when multiple services are selected.
-- Preserve all historical bookings; legacy serviceRef stays for compatibility.
ALTER TABLE "BookingSlot"
ADD COLUMN "serviceRefs" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
UPDATE "BookingSlot"
SET "serviceRefs" = ARRAY["serviceRef"]
WHERE "serviceRef" IS NOT NULL
  AND cardinality("serviceRefs") = 0;
