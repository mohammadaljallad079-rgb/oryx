-- AlterTable
ALTER TABLE "Company" ALTER COLUMN "currency" SET DEFAULT 'BHD';

-- AlterTable
ALTER TABLE "Plan" ALTER COLUMN "currency" SET DEFAULT 'BHD';

-- The platform base currency is the Bahraini Dinar. Existing rows still carry
-- the old SAR default; move them to BHD so the program shows one currency.
UPDATE "Company" SET "currency" = 'BHD' WHERE "currency" = 'SAR';
UPDATE "Plan" SET "currency" = 'BHD' WHERE "currency" = 'SAR';
