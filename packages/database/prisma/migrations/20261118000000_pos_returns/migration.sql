-- A point-of-sale receipt can now be returned to the till. The sale keeps its
-- original amounts; a return records its own credit note (which carries the
-- ledger posting and, when restocking, the stock receipt) and links back to the
-- receipt. Partial returns are tracked per line so the same goods cannot be
-- refunded twice.
ALTER TYPE "PosSaleStatus" ADD VALUE IF NOT EXISTS 'RETURNED';
ALTER TYPE "PosSaleStatus" ADD VALUE IF NOT EXISTS 'PARTIALLY_RETURNED';

ALTER TABLE "PosSale"     ADD COLUMN "returnCreditNoteId" TEXT;
ALTER TABLE "PosSale"     ADD COLUMN "returnedAt" TIMESTAMP(3);
ALTER TABLE "PosSaleLine" ADD COLUMN "returnedQuantity" INTEGER NOT NULL DEFAULT 0;
-- A receipt's line order must not depend on physical row order: an UPDATE (the
-- return increments returnedQuantity) can move a row in the heap. Backfill the
-- existing rows by their insertion order so historical receipts keep the order
-- they were shown in, then read paths order by this column.
ALTER TABLE "PosSaleLine" ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY "posSaleId" ORDER BY id) - 1 AS rn
  FROM "PosSaleLine"
)
UPDATE "PosSaleLine" l SET "sortOrder" = ranked.rn FROM ranked WHERE l.id = ranked.id;

ALTER TYPE "StockMovementSource" ADD VALUE IF NOT EXISTS 'POS_RETURN';
