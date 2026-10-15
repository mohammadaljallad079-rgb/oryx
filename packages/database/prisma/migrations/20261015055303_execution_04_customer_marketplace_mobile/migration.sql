-- CreateEnum
CREATE TYPE "CustomerAccountStatus" AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED', 'CLOSED');

-- CreateEnum
CREATE TYPE "BookingType" AS ENUM ('INSPECTION', 'MAINTENANCE', 'PROVIDER_SERVICE');

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('HELD', 'CONFIRMED', 'RESCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "BookingResourceType" AS ENUM ('INSPECTOR', 'BAY', 'TECHNICIAN', 'PROVIDER');

-- CreateEnum
CREATE TYPE "ProviderApplicationStatus" AS ENUM ('SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "PaymentIntentStatus" AS ENUM ('REQUIRES_METHOD', 'REQUIRES_ACTION', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "PaymentTransactionType" AS ENUM ('CHARGE', 'AUTHORIZATION', 'CAPTURE', 'REFUND', 'CHARGEBACK');

-- CreateEnum
CREATE TYPE "PaymentTransactionStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED', 'VOIDED');

-- CreateEnum
CREATE TYPE "RefundStatus" AS ENUM ('REQUESTED', 'APPROVED', 'PROCESSED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('PENDING', 'PUBLISHED', 'HIDDEN', 'REJECTED');

-- CreateEnum
CREATE TYPE "DisputeStatus" AS ENUM ('OPEN', 'UNDER_REVIEW', 'AWAITING_PROVIDER', 'RESOLVED', 'ESCALATED', 'CLOSED');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('IN_APP', 'EMAIL', 'SMS', 'WHATSAPP', 'PUSH');

-- CreateEnum
CREATE TYPE "NotificationDeliveryStatus" AS ENUM ('QUEUED', 'SENT', 'DELIVERED', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "NotificationProviderState" AS ENUM ('NOT_CONFIGURED', 'CONFIGURED', 'DISABLED');

-- AlterTable
ALTER TABLE "ServiceRequest" ADD COLUMN     "customerAccountId" TEXT;

-- AlterTable
ALTER TABLE "SupportTicket" ADD COLUMN     "customerAccountId" TEXT;

-- AlterTable
ALTER TABLE "Vehicle" ADD COLUMN     "customerAccountId" TEXT;

-- CreateTable
CREATE TABLE "CustomerAccount" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "phone" TEXT,
    "status" "CustomerAccountStatus" NOT NULL DEFAULT 'PENDING',
    "preferredLocale" "Locale" NOT NULL DEFAULT 'ar',
    "preferredTheme" "Theme" NOT NULL DEFAULT 'dark',
    "defaultCompanyId" TEXT,
    "emailVerifiedAt" TIMESTAMP(3),
    "phoneVerifiedAt" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "failedLoginCount" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "mfaEnabled" BOOLEAN NOT NULL DEFAULT false,
    "mfaSecretEncrypted" TEXT,
    "mfaLastUsedStep" BIGINT,
    "mfaEnrolledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerAddress" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "label" TEXT,
    "addressLine1" TEXT NOT NULL,
    "addressLine2" TEXT,
    "city" TEXT NOT NULL,
    "area" TEXT,
    "countryCode" TEXT NOT NULL DEFAULT 'BH',
    "postalCode" TEXT,
    "latitude" DECIMAL(10,7),
    "longitude" DECIMAL(10,7),
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerAddress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerPrivacySetting" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "shareContactWithProvider" BOOLEAN NOT NULL DEFAULT true,
    "allowVehicleDiscovery" BOOLEAN NOT NULL DEFAULT false,
    "allowMarketingEmails" BOOLEAN NOT NULL DEFAULT false,
    "allowMarketingSms" BOOLEAN NOT NULL DEFAULT false,
    "allowMarketingWhatsapp" BOOLEAN NOT NULL DEFAULT false,
    "allowPushNotifications" BOOLEAN NOT NULL DEFAULT false,
    "allowAnalytics" BOOLEAN NOT NULL DEFAULT false,
    "allowThirdPartySharing" BOOLEAN NOT NULL DEFAULT false,
    "dataExportRequestedAt" TIMESTAMP(3),
    "deletionRequestedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerPrivacySetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerNotificationPreference" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "category" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerNotificationPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerRefreshToken" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "replacedBy" TEXT,
    "familyId" TEXT NOT NULL,
    "deviceKind" TEXT NOT NULL DEFAULT 'WEB',
    "deviceName" TEXT,
    "userAgent" TEXT,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerRefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerPasswordResetToken" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerPasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingResource" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "branchId" TEXT,
    "resourceType" "BookingResourceType" NOT NULL,
    "code" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "userId" TEXT,
    "providerId" TEXT,
    "capacity" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BookingResource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkingHours" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "branchId" TEXT,
    "resourceId" TEXT,
    "dayOfWeek" INTEGER NOT NULL,
    "opensMinute" INTEGER NOT NULL,
    "closesMinute" INTEGER NOT NULL,
    "isClosed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkingHours_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingResourceException" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "isClosed" BOOLEAN NOT NULL DEFAULT true,
    "opensMinute" INTEGER,
    "closesMinute" INTEGER,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BookingResourceException_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingSlot" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "branchId" TEXT,
    "resourceId" TEXT,
    "resourceKey" TEXT NOT NULL,
    "bookingType" "BookingType" NOT NULL,
    "status" "BookingStatus" NOT NULL DEFAULT 'HELD',
    "serviceRef" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "customerAccountId" TEXT,
    "customerId" TEXT,
    "vehicleId" TEXT,
    "entityType" TEXT,
    "entityId" TEXT,
    "holdExpiresAt" TIMESTAMP(3),
    "reference" TEXT NOT NULL,
    "notes" TEXT,
    "cancellationReason" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BookingSlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingEvent" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "slotId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "fromStatus" "BookingStatus",
    "toStatus" "BookingStatus",
    "message" TEXT,
    "actorKind" TEXT NOT NULL DEFAULT 'SYSTEM',
    "actorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BookingEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketplaceApplication" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "legalNameEn" TEXT NOT NULL,
    "legalNameAr" TEXT NOT NULL,
    "contactEmail" TEXT NOT NULL,
    "contactPhone" TEXT NOT NULL,
    "registrationNumber" TEXT,
    "taxNumber" TEXT,
    "countryCode" TEXT NOT NULL DEFAULT 'BH',
    "city" TEXT,
    "addressLine" TEXT,
    "categoryKeys" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "ProviderApplicationStatus" NOT NULL DEFAULT 'SUBMITTED',
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "reviewNote" TEXT,
    "providerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketplaceApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderUser" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'OWNER',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProviderUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderAvailability" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "opensMinute" INTEGER NOT NULL,
    "closesMinute" INTEGER NOT NULL,
    "isClosed" BOOLEAN NOT NULL DEFAULT false,
    "minimumNoticeMinutes" INTEGER NOT NULL DEFAULT 60,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProviderAvailability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderReview" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "serviceRequestId" TEXT,
    "bookingSlotId" TEXT,
    "customerAccountId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "title" TEXT,
    "comment" TEXT,
    "status" "ReviewStatus" NOT NULL DEFAULT 'PENDING',
    "providerReply" TEXT,
    "providerRepliedAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "moderatedById" TEXT,
    "moderationNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProviderReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketplaceDispute" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "serviceRequestId" TEXT,
    "bookingSlotId" TEXT,
    "customerAccountId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" "DisputeStatus" NOT NULL DEFAULT 'OPEN',
    "resolution" TEXT,
    "compensationMinor" INTEGER NOT NULL DEFAULT 0,
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketplaceDispute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DisputeMessage" (
    "id" TEXT NOT NULL,
    "disputeId" TEXT NOT NULL,
    "authorKind" TEXT NOT NULL,
    "authorId" TEXT,
    "body" TEXT NOT NULL,
    "isInternal" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DisputeMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentIntent" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "branchId" TEXT,
    "intentNumber" TEXT NOT NULL,
    "customerId" TEXT,
    "customerAccountId" TEXT,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'BHD',
    "currencyScale" INTEGER NOT NULL DEFAULT 3,
    "status" "PaymentIntentStatus" NOT NULL DEFAULT 'REQUIRES_METHOD',
    "provider" TEXT NOT NULL DEFAULT 'MANUAL',
    "providerReference" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "description" TEXT,
    "expiresAt" TIMESTAMP(3),
    "succeededAt" TIMESTAMP(3),
    "failedReason" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentIntent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentTransaction" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "intentId" TEXT,
    "transactionType" "PaymentTransactionType" NOT NULL,
    "status" "PaymentTransactionStatus" NOT NULL DEFAULT 'PENDING',
    "amountMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'BHD',
    "currencyScale" INTEGER NOT NULL DEFAULT 3,
    "provider" TEXT NOT NULL,
    "providerReference" TEXT,
    "rawPayload" JSONB,
    "failureReason" TEXT,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Refund" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "intentId" TEXT NOT NULL,
    "customerAccountId" TEXT,
    "refundNumber" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'BHD',
    "currencyScale" INTEGER NOT NULL DEFAULT 3,
    "reason" TEXT NOT NULL,
    "status" "RefundStatus" NOT NULL DEFAULT 'REQUESTED',
    "journalEntryId" TEXT,
    "providerReference" TEXT,
    "requestedById" TEXT,
    "approvedById" TEXT,
    "processedAt" TIMESTAMP(3),
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Refund_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentWebhookEvent" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "signatureValid" BOOLEAN NOT NULL DEFAULT false,
    "payloadHash" TEXT NOT NULL,
    "payload" JSONB,
    "processedAt" TIMESTAMP(3),
    "processResult" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentWebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentReconciliation" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "businessDate" TIMESTAMP(3) NOT NULL,
    "internalCount" INTEGER NOT NULL DEFAULT 0,
    "internalMinor" INTEGER NOT NULL DEFAULT 0,
    "externalCount" INTEGER NOT NULL DEFAULT 0,
    "externalMinor" INTEGER NOT NULL DEFAULT 0,
    "varianceMinor" INTEGER NOT NULL DEFAULT 0,
    "matched" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentReconciliation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationDelivery" (
    "id" TEXT NOT NULL,
    "companyId" TEXT,
    "customerAccountId" TEXT,
    "userId" TEXT,
    "channel" "NotificationChannel" NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'general',
    "templateKey" TEXT,
    "locale" "Locale" NOT NULL DEFAULT 'ar',
    "recipient" TEXT,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "status" "NotificationDeliveryStatus" NOT NULL DEFAULT 'QUEUED',
    "providerState" "NotificationProviderState" NOT NULL DEFAULT 'NOT_CONFIGURED',
    "provider" TEXT,
    "providerReference" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "nextAttemptAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "error" TEXT,
    "entityType" TEXT,
    "entityId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CustomerAccount_email_key" ON "CustomerAccount"("email");

-- CreateIndex
CREATE INDEX "CustomerAccount_status_idx" ON "CustomerAccount"("status");

-- CreateIndex
CREATE INDEX "CustomerAccount_defaultCompanyId_idx" ON "CustomerAccount"("defaultCompanyId");

-- CreateIndex
CREATE INDEX "CustomerAddress_accountId_idx" ON "CustomerAddress"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerPrivacySetting_accountId_key" ON "CustomerPrivacySetting"("accountId");

-- CreateIndex
CREATE INDEX "CustomerNotificationPreference_accountId_idx" ON "CustomerNotificationPreference"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerNotificationPreference_accountId_channel_category_key" ON "CustomerNotificationPreference"("accountId", "channel", "category");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerRefreshToken_tokenHash_key" ON "CustomerRefreshToken"("tokenHash");

-- CreateIndex
CREATE INDEX "CustomerRefreshToken_accountId_idx" ON "CustomerRefreshToken"("accountId");

-- CreateIndex
CREATE INDEX "CustomerRefreshToken_expiresAt_idx" ON "CustomerRefreshToken"("expiresAt");

-- CreateIndex
CREATE INDEX "CustomerRefreshToken_familyId_idx" ON "CustomerRefreshToken"("familyId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerPasswordResetToken_tokenHash_key" ON "CustomerPasswordResetToken"("tokenHash");

-- CreateIndex
CREATE INDEX "CustomerPasswordResetToken_accountId_idx" ON "CustomerPasswordResetToken"("accountId");

-- CreateIndex
CREATE INDEX "CustomerPasswordResetToken_expiresAt_idx" ON "CustomerPasswordResetToken"("expiresAt");

-- CreateIndex
CREATE INDEX "BookingResource_companyId_resourceType_idx" ON "BookingResource"("companyId", "resourceType");

-- CreateIndex
CREATE INDEX "BookingResource_companyId_branchId_idx" ON "BookingResource"("companyId", "branchId");

-- CreateIndex
CREATE UNIQUE INDEX "BookingResource_companyId_code_key" ON "BookingResource"("companyId", "code");

-- CreateIndex
CREATE INDEX "WorkingHours_companyId_dayOfWeek_idx" ON "WorkingHours"("companyId", "dayOfWeek");

-- CreateIndex
CREATE INDEX "WorkingHours_resourceId_idx" ON "WorkingHours"("resourceId");

-- CreateIndex
CREATE INDEX "BookingResourceException_companyId_date_idx" ON "BookingResourceException"("companyId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "BookingResourceException_resourceId_date_key" ON "BookingResourceException"("resourceId", "date");

-- CreateIndex
CREATE INDEX "BookingSlot_companyId_status_idx" ON "BookingSlot"("companyId", "status");

-- CreateIndex
CREATE INDEX "BookingSlot_companyId_startsAt_idx" ON "BookingSlot"("companyId", "startsAt");

-- CreateIndex
CREATE INDEX "BookingSlot_resourceKey_startsAt_idx" ON "BookingSlot"("resourceKey", "startsAt");

-- CreateIndex
CREATE INDEX "BookingSlot_customerAccountId_startsAt_idx" ON "BookingSlot"("customerAccountId", "startsAt");

-- CreateIndex
CREATE INDEX "BookingSlot_entityType_entityId_idx" ON "BookingSlot"("entityType", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "BookingSlot_companyId_reference_key" ON "BookingSlot"("companyId", "reference");

-- CreateIndex
CREATE INDEX "BookingEvent_slotId_createdAt_idx" ON "BookingEvent"("slotId", "createdAt");

-- CreateIndex
CREATE INDEX "BookingEvent_companyId_kind_idx" ON "BookingEvent"("companyId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "MarketplaceApplication_code_key" ON "MarketplaceApplication"("code");

-- CreateIndex
CREATE UNIQUE INDEX "MarketplaceApplication_providerId_key" ON "MarketplaceApplication"("providerId");

-- CreateIndex
CREATE INDEX "MarketplaceApplication_status_idx" ON "MarketplaceApplication"("status");

-- CreateIndex
CREATE INDEX "MarketplaceApplication_contactEmail_idx" ON "MarketplaceApplication"("contactEmail");

-- CreateIndex
CREATE INDEX "ProviderUser_userId_idx" ON "ProviderUser"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderUser_providerId_userId_key" ON "ProviderUser"("providerId", "userId");

-- CreateIndex
CREATE INDEX "ProviderAvailability_providerId_idx" ON "ProviderAvailability"("providerId");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderAvailability_providerId_dayOfWeek_key" ON "ProviderAvailability"("providerId", "dayOfWeek");

-- CreateIndex
CREATE INDEX "ProviderReview_providerId_status_idx" ON "ProviderReview"("providerId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderReview_customerAccountId_serviceRequestId_key" ON "ProviderReview"("customerAccountId", "serviceRequestId");

-- CreateIndex
CREATE UNIQUE INDEX "MarketplaceDispute_code_key" ON "MarketplaceDispute"("code");

-- CreateIndex
CREATE INDEX "MarketplaceDispute_status_idx" ON "MarketplaceDispute"("status");

-- CreateIndex
CREATE INDEX "MarketplaceDispute_providerId_status_idx" ON "MarketplaceDispute"("providerId", "status");

-- CreateIndex
CREATE INDEX "MarketplaceDispute_customerAccountId_idx" ON "MarketplaceDispute"("customerAccountId");

-- CreateIndex
CREATE INDEX "DisputeMessage_disputeId_createdAt_idx" ON "DisputeMessage"("disputeId", "createdAt");

-- CreateIndex
CREATE INDEX "PaymentIntent_companyId_status_idx" ON "PaymentIntent"("companyId", "status");

-- CreateIndex
CREATE INDEX "PaymentIntent_targetType_targetId_idx" ON "PaymentIntent"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "PaymentIntent_customerAccountId_idx" ON "PaymentIntent"("customerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentIntent_companyId_intentNumber_key" ON "PaymentIntent"("companyId", "intentNumber");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentIntent_companyId_idempotencyKey_key" ON "PaymentIntent"("companyId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "PaymentTransaction_companyId_status_idx" ON "PaymentTransaction"("companyId", "status");

-- CreateIndex
CREATE INDEX "PaymentTransaction_provider_providerReference_idx" ON "PaymentTransaction"("provider", "providerReference");

-- CreateIndex
CREATE INDEX "PaymentTransaction_intentId_idx" ON "PaymentTransaction"("intentId");

-- CreateIndex
CREATE INDEX "Refund_companyId_status_idx" ON "Refund"("companyId", "status");

-- CreateIndex
CREATE INDEX "Refund_intentId_idx" ON "Refund"("intentId");

-- CreateIndex
CREATE UNIQUE INDEX "Refund_companyId_refundNumber_key" ON "Refund"("companyId", "refundNumber");

-- CreateIndex
CREATE INDEX "PaymentWebhookEvent_provider_eventType_idx" ON "PaymentWebhookEvent"("provider", "eventType");

-- CreateIndex
CREATE INDEX "PaymentWebhookEvent_processedAt_idx" ON "PaymentWebhookEvent"("processedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentWebhookEvent_provider_eventId_key" ON "PaymentWebhookEvent"("provider", "eventId");

-- CreateIndex
CREATE INDEX "PaymentReconciliation_companyId_matched_idx" ON "PaymentReconciliation"("companyId", "matched");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentReconciliation_companyId_provider_businessDate_key" ON "PaymentReconciliation"("companyId", "provider", "businessDate");

-- CreateIndex
CREATE INDEX "NotificationDelivery_status_nextAttemptAt_idx" ON "NotificationDelivery"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "NotificationDelivery_customerAccountId_createdAt_idx" ON "NotificationDelivery"("customerAccountId", "createdAt");

-- CreateIndex
CREATE INDEX "NotificationDelivery_companyId_category_idx" ON "NotificationDelivery"("companyId", "category");

-- CreateIndex
CREATE INDEX "ServiceRequest_customerAccountId_idx" ON "ServiceRequest"("customerAccountId");

-- CreateIndex
CREATE INDEX "SupportTicket_customerAccountId_idx" ON "SupportTicket"("customerAccountId");

-- CreateIndex
CREATE INDEX "Vehicle_customerAccountId_idx" ON "Vehicle"("customerAccountId");

-- AddForeignKey
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_customerAccountId_fkey" FOREIGN KEY ("customerAccountId") REFERENCES "CustomerAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_customerAccountId_fkey" FOREIGN KEY ("customerAccountId") REFERENCES "CustomerAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceRequest" ADD CONSTRAINT "ServiceRequest_customerAccountId_fkey" FOREIGN KEY ("customerAccountId") REFERENCES "CustomerAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerAccount" ADD CONSTRAINT "CustomerAccount_defaultCompanyId_fkey" FOREIGN KEY ("defaultCompanyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerAddress" ADD CONSTRAINT "CustomerAddress_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "CustomerAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerPrivacySetting" ADD CONSTRAINT "CustomerPrivacySetting_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "CustomerAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerNotificationPreference" ADD CONSTRAINT "CustomerNotificationPreference_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "CustomerAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerRefreshToken" ADD CONSTRAINT "CustomerRefreshToken_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "CustomerAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerPasswordResetToken" ADD CONSTRAINT "CustomerPasswordResetToken_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "CustomerAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingResource" ADD CONSTRAINT "BookingResource_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingResource" ADD CONSTRAINT "BookingResource_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingResource" ADD CONSTRAINT "BookingResource_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "MarketplaceProvider"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkingHours" ADD CONSTRAINT "WorkingHours_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkingHours" ADD CONSTRAINT "WorkingHours_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkingHours" ADD CONSTRAINT "WorkingHours_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "BookingResource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingResourceException" ADD CONSTRAINT "BookingResourceException_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingResourceException" ADD CONSTRAINT "BookingResourceException_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "BookingResource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingSlot" ADD CONSTRAINT "BookingSlot_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingSlot" ADD CONSTRAINT "BookingSlot_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingSlot" ADD CONSTRAINT "BookingSlot_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "BookingResource"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingSlot" ADD CONSTRAINT "BookingSlot_customerAccountId_fkey" FOREIGN KEY ("customerAccountId") REFERENCES "CustomerAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingSlot" ADD CONSTRAINT "BookingSlot_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingSlot" ADD CONSTRAINT "BookingSlot_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingEvent" ADD CONSTRAINT "BookingEvent_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingEvent" ADD CONSTRAINT "BookingEvent_slotId_fkey" FOREIGN KEY ("slotId") REFERENCES "BookingSlot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceApplication" ADD CONSTRAINT "MarketplaceApplication_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "MarketplaceProvider"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderUser" ADD CONSTRAINT "ProviderUser_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "MarketplaceProvider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderAvailability" ADD CONSTRAINT "ProviderAvailability_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "MarketplaceProvider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderReview" ADD CONSTRAINT "ProviderReview_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "MarketplaceProvider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderReview" ADD CONSTRAINT "ProviderReview_serviceRequestId_fkey" FOREIGN KEY ("serviceRequestId") REFERENCES "ServiceRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderReview" ADD CONSTRAINT "ProviderReview_customerAccountId_fkey" FOREIGN KEY ("customerAccountId") REFERENCES "CustomerAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceDispute" ADD CONSTRAINT "MarketplaceDispute_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "MarketplaceProvider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceDispute" ADD CONSTRAINT "MarketplaceDispute_serviceRequestId_fkey" FOREIGN KEY ("serviceRequestId") REFERENCES "ServiceRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceDispute" ADD CONSTRAINT "MarketplaceDispute_customerAccountId_fkey" FOREIGN KEY ("customerAccountId") REFERENCES "CustomerAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DisputeMessage" ADD CONSTRAINT "DisputeMessage_disputeId_fkey" FOREIGN KEY ("disputeId") REFERENCES "MarketplaceDispute"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentIntent" ADD CONSTRAINT "PaymentIntent_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentIntent" ADD CONSTRAINT "PaymentIntent_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentIntent" ADD CONSTRAINT "PaymentIntent_customerAccountId_fkey" FOREIGN KEY ("customerAccountId") REFERENCES "CustomerAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentIntent" ADD CONSTRAINT "PaymentIntent_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentTransaction" ADD CONSTRAINT "PaymentTransaction_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentTransaction" ADD CONSTRAINT "PaymentTransaction_intentId_fkey" FOREIGN KEY ("intentId") REFERENCES "PaymentIntent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_intentId_fkey" FOREIGN KEY ("intentId") REFERENCES "PaymentIntent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_customerAccountId_fkey" FOREIGN KEY ("customerAccountId") REFERENCES "CustomerAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentReconciliation" ADD CONSTRAINT "PaymentReconciliation_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationDelivery" ADD CONSTRAINT "NotificationDelivery_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationDelivery" ADD CONSTRAINT "NotificationDelivery_customerAccountId_fkey" FOREIGN KEY ("customerAccountId") REFERENCES "CustomerAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
