-- CreateEnum
CREATE TYPE "OfficialDocumentType" AS ENUM ('VEHICLE_INSPECTION_REPORT', 'SALES_INVOICE', 'PURCHASE_INVOICE', 'SALES_ORDER', 'PURCHASE_ORDER', 'SALES_RETURN', 'PURCHASE_RETURN', 'PAYMENT_RECEIPT', 'PAYMENT_VOUCHER', 'QUOTATION', 'CUSTOMER_STATEMENT', 'SUPPLIER_STATEMENT', 'JOURNAL_ENTRY');

-- CreateEnum
CREATE TYPE "OfficialDocumentStatus" AS ENUM ('DRAFT', 'ISSUED', 'SUPERSEDED', 'CANCELLED', 'REVOKED');

-- CreateTable
CREATE TABLE "OfficialDocument" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "type" "OfficialDocumentType" NOT NULL,
    "documentNumber" TEXT NOT NULL,
    "status" "OfficialDocumentStatus" NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "seriesId" TEXT NOT NULL,
    "verificationToken" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "storageKey" TEXT,
    "byteSize" INTEGER,
    "pageCount" INTEGER,
    "issuerNameEn" TEXT NOT NULL,
    "issuerNameAr" TEXT NOT NULL,
    "issuerCode" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "issuedById" TEXT,
    "supersededAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "revokeReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OfficialDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OfficialDocumentEvent" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "detail" TEXT,
    "actorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OfficialDocumentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OfficialDocument_verificationToken_key" ON "OfficialDocument"("verificationToken");

-- CreateIndex
CREATE INDEX "OfficialDocument_companyId_type_status_idx" ON "OfficialDocument"("companyId", "type", "status");

-- CreateIndex
CREATE INDEX "OfficialDocument_companyId_sourceType_sourceId_idx" ON "OfficialDocument"("companyId", "sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "OfficialDocument_seriesId_idx" ON "OfficialDocument"("seriesId");

-- CreateIndex
CREATE UNIQUE INDEX "OfficialDocument_companyId_type_documentNumber_version_key" ON "OfficialDocument"("companyId", "type", "documentNumber", "version");

-- CreateIndex
CREATE INDEX "OfficialDocumentEvent_documentId_createdAt_idx" ON "OfficialDocumentEvent"("documentId", "createdAt");

-- CreateIndex
CREATE INDEX "OfficialDocumentEvent_companyId_idx" ON "OfficialDocumentEvent"("companyId");

-- AddForeignKey
ALTER TABLE "OfficialDocument" ADD CONSTRAINT "OfficialDocument_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfficialDocumentEvent" ADD CONSTRAINT "OfficialDocumentEvent_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfficialDocumentEvent" ADD CONSTRAINT "OfficialDocumentEvent_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "OfficialDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;
