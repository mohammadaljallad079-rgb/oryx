-- Branch management: responsible staff account, commercial registration,
-- additional contact numbers and branch specialty.
ALTER TABLE "Branch"
  ADD COLUMN "phoneNumbers" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "crNumber" TEXT,
  ADD COLUMN "specialty" TEXT,
  ADD COLUMN "responsibleUserId" TEXT;

CREATE INDEX "Branch_responsibleUserId_idx" ON "Branch"("responsibleUserId");

ALTER TABLE "Branch"
  ADD CONSTRAINT "Branch_responsibleUserId_fkey"
  FOREIGN KEY ("responsibleUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
