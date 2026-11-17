-- Preserve the tenant-configured method chosen at issue time while the
-- existing PaymentMethod enum continues to drive accounting categorisation.
ALTER TABLE "SalesInvoice"
  ADD COLUMN "paymentMethodCode" TEXT,
  ADD COLUMN "paymentMethodLabelEn" TEXT,
  ADD COLUMN "paymentMethodLabelAr" TEXT;
ALTER TABLE "Quotation"
  ADD COLUMN "paymentMethodCode" TEXT,
  ADD COLUMN "paymentMethodLabelEn" TEXT,
  ADD COLUMN "paymentMethodLabelAr" TEXT;
ALTER TABLE "PosSale"
  ADD COLUMN "paymentMethodCode" TEXT,
  ADD COLUMN "paymentMethodLabelEn" TEXT,
  ADD COLUMN "paymentMethodLabelAr" TEXT;
