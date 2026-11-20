-- Additive only: one optional column on Employee.
-- Existing rows keep NULL and every current query is unaffected.
ALTER TABLE "Employee" ADD COLUMN "nationality" TEXT;
