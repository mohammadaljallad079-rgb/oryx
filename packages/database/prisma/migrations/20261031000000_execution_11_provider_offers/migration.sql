-- Execution 11 — real merchant promotions.
--
-- A provider publishes promotional offers that the customer app reads. Scoped
-- to the provider (a marketplace artifact), not to a tenant company.

-- CreateTable
CREATE TABLE "ProviderOffer" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "titleEn" TEXT NOT NULL,
    "titleAr" TEXT NOT NULL,
    "description" TEXT,
    "categoryKey" TEXT,
    "percentOffBp" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProviderOffer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProviderOffer_providerId_isActive_idx" ON "ProviderOffer"("providerId", "isActive");

-- CreateIndex
CREATE INDEX "ProviderOffer_categoryKey_idx" ON "ProviderOffer"("categoryKey");

-- AddForeignKey
ALTER TABLE "ProviderOffer" ADD CONSTRAINT "ProviderOffer_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "MarketplaceProvider"("id") ON DELETE CASCADE ON UPDATE CASCADE;
