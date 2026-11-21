-- Payment received-by name.
--
-- The printed receipt and payment voucher carry a "المستلم / Received By" line,
-- but the Payment row had no field to hold it, so the printed name was always
-- blank. Store it, nullable for historical rows.
ALTER TABLE "Payment" ADD COLUMN "receivedByName" TEXT;
