-- AlterTable
ALTER TABLE "Employee" ADD COLUMN     "bankAccountIban" TEXT,
ADD COLUMN     "bankName" TEXT,
ADD COLUMN     "contractType" "ContractType" NOT NULL DEFAULT 'PERMANENT',
ADD COLUMN     "nationality" TEXT;

-- AlterTable
ALTER TABLE "EntityAttachment" ADD COLUMN     "checksum" TEXT,
ADD COLUMN     "isConfidential" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isPrimary" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "EmployeePenalty" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "actionType" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "effectiveDate" TIMESTAMP(3) NOT NULL,
    "amountMinor" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'SAR',
    "decidedByName" TEXT,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeePenalty_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeBonus" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'BONUS',
    "reason" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'SAR',
    "payPeriodId" TEXT,
    "approvedAt" TIMESTAMP(3),
    "payslipId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeeBonus_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EmployeePenalty_companyId_employeeId_idx" ON "EmployeePenalty"("companyId", "employeeId");

-- CreateIndex
CREATE INDEX "EmployeePenalty_companyId_effectiveDate_idx" ON "EmployeePenalty"("companyId", "effectiveDate");

-- CreateIndex
CREATE INDEX "EmployeeBonus_companyId_employeeId_idx" ON "EmployeeBonus"("companyId", "employeeId");

-- CreateIndex
CREATE INDEX "EmployeeBonus_companyId_payslipId_idx" ON "EmployeeBonus"("companyId", "payslipId");

-- AddForeignKey
ALTER TABLE "EmployeePenalty" ADD CONSTRAINT "EmployeePenalty_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeePenalty" ADD CONSTRAINT "EmployeePenalty_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeBonus" ADD CONSTRAINT "EmployeeBonus_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeBonus" ADD CONSTRAINT "EmployeeBonus_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeBonus" ADD CONSTRAINT "EmployeeBonus_payPeriodId_fkey" FOREIGN KEY ("payPeriodId") REFERENCES "PayrollPeriod"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeBonus" ADD CONSTRAINT "EmployeeBonus_payslipId_fkey" FOREIGN KEY ("payslipId") REFERENCES "Payslip"("id") ON DELETE SET NULL ON UPDATE CASCADE;
