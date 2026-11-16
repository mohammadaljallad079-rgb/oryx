-- The return's refund method: how the credited amount is actually given back.
-- CREDIT_ACCOUNT preserves the historical behaviour (the value stays on the
-- customer's account); the other values settle the credit to a real account.
CREATE TYPE "RefundMethod" AS ENUM ('CREDIT_ACCOUNT', 'CASH', 'BANK_TRANSFER', 'CARD');

ALTER TABLE "CreditNote"
  ADD COLUMN "refundMethod" "RefundMethod" NOT NULL DEFAULT 'CREDIT_ACCOUNT';
