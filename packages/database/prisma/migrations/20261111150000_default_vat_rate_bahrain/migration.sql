-- Align the default VAT rate with Bahrain's standard rate (10%).
--
-- The column was introduced at 1500 (15%), but Bahrain's statutory standard VAT
-- rate is 10%, and the approved reference documents print VAT 10%. A tenant that
-- has already chosen its own rate is left untouched: only rows still carrying the
-- old platform default are moved.
ALTER TABLE "Company" ALTER COLUMN "defaultTaxRateBp" SET DEFAULT 1000;

UPDATE "Company" SET "defaultTaxRateBp" = 1000 WHERE "defaultTaxRateBp" = 1500;

-- Where the platform seed is present and 15% is still the tenant default, hand
-- the default to the seeded 10% row. The `VAT15` row is cleared first so the
-- partial unique index `TaxRate_company_default_key` never sees two defaults,
-- and the promotion only runs for a company that is left with no default at all
-- (a tenant that chose some other tax keeps it).
UPDATE "TaxRate" SET "isDefault" = false, "updatedAt" = NOW()
 WHERE "code" = 'VAT15' AND "isDefault" = true
   AND EXISTS (
     SELECT 1 FROM "TaxRate" v10
      WHERE v10."companyId" = "TaxRate"."companyId" AND v10."code" = 'VAT10'
   );

UPDATE "TaxRate" SET "isDefault" = true, "updatedAt" = NOW()
 WHERE "code" = 'VAT10' AND "isDefault" = false
   AND NOT EXISTS (
     SELECT 1 FROM "TaxRate" d
      WHERE d."companyId" = "TaxRate"."companyId" AND d."isDefault" = true
   );

-- The seeded catalogue was created at the old 15% rate. Re-align only the
-- platform's own seeded SKUs/services that still sit at exactly 1500, so a rate
-- an operator set by hand on any other row is never touched.
UPDATE "Product" SET "taxRateBp" = 1000, "updatedAt" = NOW()
 WHERE "taxRateBp" = 1500
   AND "sku" IN (
     'AC-REFRIGERANT','BATTERY-70AH','BELT-TIMING','BRAKE-DISC-F','BRAKE-FLUID-DOT4',
     'BRAKE-PAD-F','BRAKE-PAD-R','BULB-H4','CARPET-SET','COOLANT-GREEN','FILTER-AIR',
     'FILTER-CABIN','FILTER-FUEL','FILTER-OIL','OIL-10W40','OIL-5W30','OIL-GEAR-75W90',
     'SHOCK-FRONT','SPARK-PLUG','SVC-INSPECT','SVC-OIL-CHANGE','SVC-WHEEL-ALIGN',
     'TYRE-205-55','WIPER-BLADE'
   );

UPDATE "InspectionService" SET "taxPercentBp" = 1000, "updatedAt" = NOW()
 WHERE "taxPercentBp" = 1500 AND "code" IN ('BASIC', 'FULL');
