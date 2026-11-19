-- Backwards compatible: existing suppliers remain COMPANY.
ALTER TABLE "Supplier"
  ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'COMPANY',
  ADD COLUMN "contactPerson" TEXT,
  ADD COLUMN "idNumber" TEXT;

ALTER TABLE "Supplier"
  ADD CONSTRAINT "Supplier_kind_check" CHECK ("kind" IN ('INDIVIDUAL', 'COMPANY'));
