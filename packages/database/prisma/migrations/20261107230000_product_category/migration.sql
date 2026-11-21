-- Product merchandise category.
--
-- The point-of-sale groups its product grid by category chips. A free-text
-- column is enough: the till only needs to group and filter, and the value is
-- company-scoped by the row it lives on. Nullable so existing products are
-- unaffected and simply appear without a category.
ALTER TABLE "Product" ADD COLUMN "category" TEXT;
