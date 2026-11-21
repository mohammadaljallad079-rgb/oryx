ALTER TABLE "WorkOrder"
  ADD COLUMN "scheduledStartAt" TIMESTAMP(3),
  ADD COLUMN "scheduledEndAt" TIMESTAMP(3);

CREATE INDEX "WorkOrder_companyId_scheduledStartAt_idx"
  ON "WorkOrder"("companyId", "scheduledStartAt");
