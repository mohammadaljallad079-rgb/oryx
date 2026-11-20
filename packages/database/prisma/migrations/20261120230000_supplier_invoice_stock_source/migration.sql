-- Direct supplier invoices can receive physical inventory without a separate PO.
ALTER TYPE "StockMovementSource" ADD VALUE IF NOT EXISTS 'SUPPLIER_INVOICE';
