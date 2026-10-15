-- CreateEnum
CREATE TYPE "IntegrationScope" AS ENUM ('PLATFORM', 'COMPANY');

-- CreateEnum
CREATE TYPE "IntegrationVerificationStatus" AS ENUM ('UNVERIFIED', 'VERIFIED', 'FAILED', 'INCOMPLETE');

-- CreateTable
CREATE TABLE "IntegrationProvider" (
    "id" TEXT NOT NULL,
    "providerKey" TEXT NOT NULL,
    "scope" "IntegrationScope" NOT NULL DEFAULT 'PLATFORM',
    "companyId" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "disabledReason" TEXT,
    "verificationStatus" "IntegrationVerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "lastCheckedAt" TIMESTAMP(3),
    "lastCheckMessage" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntegrationProvider_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegrationCredential" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "credentialKey" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "hint" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntegrationCredential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegrationCheck" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "status" "IntegrationVerificationStatus" NOT NULL,
    "message" TEXT NOT NULL,
    "durationMs" INTEGER,
    "actorUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IntegrationCheck_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IntegrationProvider_scope_companyId_idx" ON "IntegrationProvider"("scope", "companyId");

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationProvider_providerKey_scope_companyId_key" ON "IntegrationProvider"("providerKey", "scope", "companyId");

-- CreateIndex
CREATE INDEX "IntegrationCredential_providerId_idx" ON "IntegrationCredential"("providerId");

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationCredential_providerId_credentialKey_key" ON "IntegrationCredential"("providerId", "credentialKey");

-- CreateIndex
CREATE INDEX "IntegrationCheck_providerId_createdAt_idx" ON "IntegrationCheck"("providerId", "createdAt");

-- AddForeignKey
ALTER TABLE "IntegrationProvider" ADD CONSTRAINT "IntegrationProvider_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationCredential" ADD CONSTRAINT "IntegrationCredential_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "IntegrationProvider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationCheck" ADD CONSTRAINT "IntegrationCheck_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "IntegrationProvider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Postgres treats NULLs as distinct in a unique index, so the composite
-- (providerKey, scope, companyId) index does not prevent two platform-scoped
-- rows for the same provider. This partial index closes that gap so the
-- deployment can hold exactly one platform configuration per provider.
CREATE UNIQUE INDEX "IntegrationProvider_platform_key"
  ON "IntegrationProvider"("providerKey")
  WHERE "companyId" IS NULL;
