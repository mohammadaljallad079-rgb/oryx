-- Backfill the rounding gain/loss system account (code 5930) for every company
-- that already has a chart of accounts. Posting a document whose rounding
-- difference must be absorbed now resolves role ROUNDING_GAIN_LOSS instead of
-- failing with "no active account for role ROUNDING_GAIN_LOSS".
INSERT INTO "Account" (
  "id",
  "companyId",
  "code",
  "nameEn",
  "nameAr",
  "type",
  "normalBalance",
  "level",
  "isPostable",
  "isSystem",
  "systemRole",
  "currency",
  "isActive",
  "createdAt",
  "updatedAt"
)
SELECT
  gen_random_uuid()::text,
  c."id",
  '5930',
  'Rounding gain / loss',
  'أرباح وخسائر التقريب',
  'EXPENSE'::"AccountType",
  'DEBIT'::"AccountNormalBalance",
  1,
  true,
  true,
  'ROUNDING_GAIN_LOSS',
  c."currency",
  true,
  now(),
  now()
FROM "Company" c
WHERE NOT EXISTS (
  SELECT 1 FROM "Account" a WHERE a."companyId" = c."id" AND a."code" = '5930'
);
