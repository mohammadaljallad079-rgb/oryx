-- Customer attribution: the lead source the customer came from and the sales
-- department that owns them.
--
-- Both are nullable and both relations are ON DELETE SET NULL. The catalogues
-- (`LeadSource`, `Department`) are tenant-scoped and independently editable, so
-- removing a catalogue entry must not delete a customer: it only clears the
-- attribution. The columns are plain `TEXT` to match the cuid primary keys.
ALTER TABLE "Customer" ADD COLUMN     "sourceId" TEXT;
ALTER TABLE "Customer" ADD COLUMN     "departmentId" TEXT;

ALTER TABLE "Customer" ADD CONSTRAINT "Customer_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "LeadSource"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Customer_sourceId_idx" ON "Customer"("sourceId");
CREATE INDEX "Customer_departmentId_idx" ON "Customer"("departmentId");
