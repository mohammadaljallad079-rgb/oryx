-- The point-of-sale receipt as an official document.
--
-- A cashier sale already creates a paid sales invoice; the receipt the customer
-- is handed is a separate artefact that carries the till reference, so it needs
-- its own document type rather than reusing the invoice's.
ALTER TYPE "OfficialDocumentType" ADD VALUE IF NOT EXISTS 'POS_RECEIPT';
