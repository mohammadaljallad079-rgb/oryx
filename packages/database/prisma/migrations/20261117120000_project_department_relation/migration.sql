-- Projects use the same company-owned department catalogue as HR.
-- Detach any legacy invalid references before enforcing the foreign key.
UPDATE "Project" p
SET "departmentId" = NULL
WHERE p."departmentId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "Department" d
    WHERE d."id" = p."departmentId" AND d."companyId" = p."companyId"
  );

ALTER TABLE "Project"
  ADD CONSTRAINT "Project_departmentId_fkey"
  FOREIGN KEY ("departmentId") REFERENCES "Department"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Project_companyId_departmentId_idx"
  ON "Project"("companyId", "departmentId");
