-- Execution 20 — sales documents print model.
--
-- The printed invoice carries a "Payment" line and a salesperson, and the
-- printed receipt carries a "Received By" line, so each document captures those
-- values itself rather than only on the cash receipt that later settles it.

-- AlterTable
ALTER TABLE "SalesInvoice" ADD COLUMN     "paymentMethod" "PaymentMethod" NOT NULL DEFAULT 'CASH',
ADD COLUMN     "salespersonName" TEXT,
ADD COLUMN     "paymentReference" TEXT;

-- AlterTable
ALTER TABLE "Quotation" ADD COLUMN     "salespersonName" TEXT;

-- AlterTable
ALTER TABLE "SalesOrder" ADD COLUMN     "salespersonName" TEXT;

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "receivedByName" TEXT;
