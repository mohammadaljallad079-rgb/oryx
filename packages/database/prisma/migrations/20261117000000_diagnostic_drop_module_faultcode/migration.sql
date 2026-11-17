-- The approved computer-unit check records a fault's description, an optional
-- observation and its severity only. The module name and fault code fields were
-- removed from the form, the API and the schema, so their columns are dropped.
-- The table held no rows carrying either value when this migration ran, so no
-- data is lost.
ALTER TABLE "InspectionDiagnosticEntry" DROP COLUMN IF EXISTS "module";
ALTER TABLE "InspectionDiagnosticEntry" DROP COLUMN IF EXISTS "faultCode";
