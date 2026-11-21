-- Support invoice settlement on credit while retaining the standard receivable workflow.
ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'CREDIT';
