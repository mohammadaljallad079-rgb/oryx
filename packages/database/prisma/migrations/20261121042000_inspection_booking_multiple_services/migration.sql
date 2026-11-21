-- Keep the legacy primary serviceId for older integrations and historical invoices.
-- Existing bookings remain valid; an empty list falls back to the primary service.
ALTER TABLE "InspectionBooking"
ADD COLUMN "serviceIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
