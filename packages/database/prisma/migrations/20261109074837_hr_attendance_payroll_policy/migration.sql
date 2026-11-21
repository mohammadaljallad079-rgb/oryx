-- AlterTable
ALTER TABLE "AttendanceRecord" ADD COLUMN     "breakMinutes" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "checkInAccuracy" DOUBLE PRECISION,
ADD COLUMN     "checkInDistanceM" INTEGER,
ADD COLUMN     "checkInLat" DOUBLE PRECISION,
ADD COLUMN     "checkInLng" DOUBLE PRECISION,
ADD COLUMN     "checkInSiteId" TEXT,
ADD COLUMN     "checkInSource" TEXT,
ADD COLUMN     "checkOutDistanceM" INTEGER,
ADD COLUMN     "checkOutLat" DOUBLE PRECISION,
ADD COLUMN     "checkOutLng" DOUBLE PRECISION,
ADD COLUMN     "checkOutSiteId" TEXT,
ADD COLUMN     "checkOutSource" TEXT,
ADD COLUMN     "earlyLeaveMinutes" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "fallbackReason" TEXT,
ADD COLUMN     "lateMinutes" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "netMinutes" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Payslip" ADD COLUMN     "absenceDays" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lateMinutes" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "overtimeMinutes" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "paidLeaveDays" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "workedMinutes" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "SalaryStructure" ADD COLUMN     "dailyHours" INTEGER,
ADD COLUMN     "effectiveTo" TIMESTAMP(3),
ADD COLUMN     "overtimeRateMinor" INTEGER,
ADD COLUMN     "weeklyHours" INTEGER,
ADD COLUMN     "workingDays" TEXT;

-- CreateTable
CREATE TABLE "AttendanceBreak" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "attendanceRecordId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "minutes" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AttendanceBreak_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkSite" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "branchId" TEXT,
    "code" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "radiusMeters" INTEGER NOT NULL DEFAULT 150,
    "wifiSsids" TEXT,
    "wifiBssids" TEXT,
    "qrSecret" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkSite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttendancePolicy" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "graceMinutes" INTEGER NOT NULL DEFAULT 10,
    "standardDailyHours" INTEGER NOT NULL DEFAULT 800,
    "standardWeeklyHours" INTEGER NOT NULL DEFAULT 4000,
    "workingDays" TEXT NOT NULL DEFAULT '1,2,3,4,5',
    "overtimeEnabled" BOOLEAN NOT NULL DEFAULT true,
    "overtimeMultiplierBp" INTEGER NOT NULL DEFAULT 15000,
    "overtimeThresholdHours" INTEGER NOT NULL DEFAULT 0,
    "deductLate" BOOLEAN NOT NULL DEFAULT false,
    "deductEarlyLeave" BOOLEAN NOT NULL DEFAULT false,
    "deductAbsence" BOOLEAN NOT NULL DEFAULT true,
    "requireLocation" BOOLEAN NOT NULL DEFAULT false,
    "allowFallback" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AttendancePolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalaryChangeLog" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "structureId" TEXT,
    "previousBasicMinor" INTEGER,
    "newBasicMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'BHD',
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "reason" TEXT,
    "changedById" TEXT NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SalaryChangeLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AttendanceBreak_attendanceRecordId_idx" ON "AttendanceBreak"("attendanceRecordId");

-- CreateIndex
CREATE INDEX "AttendanceBreak_companyId_employeeId_idx" ON "AttendanceBreak"("companyId", "employeeId");

-- CreateIndex
CREATE INDEX "WorkSite_companyId_idx" ON "WorkSite"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkSite_companyId_code_key" ON "WorkSite"("companyId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "AttendancePolicy_companyId_key" ON "AttendancePolicy"("companyId");

-- CreateIndex
CREATE INDEX "SalaryChangeLog_companyId_employeeId_idx" ON "SalaryChangeLog"("companyId", "employeeId");

-- CreateIndex
CREATE INDEX "SalaryChangeLog_companyId_changedAt_idx" ON "SalaryChangeLog"("companyId", "changedAt");

-- CreateIndex
CREATE INDEX "AttendanceRecord_companyId_status_idx" ON "AttendanceRecord"("companyId", "status");

-- AddForeignKey
ALTER TABLE "AttendanceBreak" ADD CONSTRAINT "AttendanceBreak_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceBreak" ADD CONSTRAINT "AttendanceBreak_attendanceRecordId_fkey" FOREIGN KEY ("attendanceRecordId") REFERENCES "AttendanceRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceBreak" ADD CONSTRAINT "AttendanceBreak_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkSite" ADD CONSTRAINT "WorkSite_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkSite" ADD CONSTRAINT "WorkSite_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendancePolicy" ADD CONSTRAINT "AttendancePolicy_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalaryChangeLog" ADD CONSTRAINT "SalaryChangeLog_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalaryChangeLog" ADD CONSTRAINT "SalaryChangeLog_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
