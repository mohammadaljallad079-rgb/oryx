-- Additive only: existing inspections and invoices remain untouched.
ALTER TABLE "InspectionSession"
  ADD COLUMN "billingServiceIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "invoiceId" TEXT;

CREATE UNIQUE INDEX "InspectionSession_invoiceId_key" ON "InspectionSession"("invoiceId");
CREATE INDEX "InspectionSession_companyId_invoiceId_idx" ON "InspectionSession"("companyId", "invoiceId");

-- Legacy InspectionReport.invoiceId remains readable for old booked inspections.
-- Backfill linking is deliberately performed after tenant-scoped validation in code.

ALTER TABLE "InspectionSession"
  ADD CONSTRAINT "InspectionSession_invoiceId_fkey"
  FOREIGN KEY ("invoiceId") REFERENCES "SalesInvoice"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
