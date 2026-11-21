-- The computer-unit inspection form no longer collects a module name or a fault
-- code, so a diagnostic entry can be recorded with a description alone. The
-- columns stay for entries created before the form change.
ALTER TABLE "InspectionDiagnosticEntry" ALTER COLUMN "module" DROP NOT NULL;
