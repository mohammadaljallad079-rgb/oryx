-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "JournalSourceType" ADD VALUE 'PAYMENT';
ALTER TYPE "JournalSourceType" ADD VALUE 'REFUND';
ALTER TYPE "JournalSourceType" ADD VALUE 'PROVIDER_COMMISSION';
ALTER TYPE "JournalSourceType" ADD VALUE 'PROVIDER_SETTLEMENT';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationProviderState" ADD VALUE 'PENDING';
ALTER TYPE "NotificationProviderState" ADD VALUE 'ERROR';
