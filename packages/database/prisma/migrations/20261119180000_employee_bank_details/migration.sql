-- Additive only: three optional payroll bank columns on Employee.
-- Existing rows keep NULL and every current query is unaffected.
ALTER TABLE "Employee"
  ADD COLUMN "bankName" TEXT,
  ADD COLUMN "bankAccountName" TEXT,
  ADD COLUMN "bankIban" TEXT;
