CREATE TABLE "MaintenanceService" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "descriptionEn" TEXT,
    "descriptionAr" TEXT,
    "priceMinor" INTEGER NOT NULL DEFAULT 0,
    "durationMinutes" INTEGER NOT NULL DEFAULT 60,
    "imageUrl" TEXT,
    "branchIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isPublished" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MaintenanceService_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MaintenanceService_companyId_code_key" ON "MaintenanceService"("companyId", "code");
CREATE INDEX "MaintenanceService_companyId_isActive_isPublished_idx" ON "MaintenanceService"("companyId", "isActive", "isPublished");
ALTER TABLE "MaintenanceService" ADD CONSTRAINT "MaintenanceService_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Idempotent starter content for the approved ORYX Auto Services tenant.
-- The uniqueness key ensures a later admin edit is never overwritten.
INSERT INTO "MaintenanceService"
("id", "companyId", "code", "nameEn", "nameAr", "descriptionEn", "descriptionAr", "priceMinor", "durationMinutes", "imageUrl", "sortOrder", "updatedAt")
SELECT
  'ms_' || substr(md5(c."id" || ':' || demo.code), 1, 24),
  c."id", demo.code, demo.name_en, demo.name_ar, demo.desc_en, demo.desc_ar,
  demo.price_minor, demo.duration_min, demo.image_url, demo.sort_order, CURRENT_TIMESTAMP
FROM "Company" c
CROSS JOIN (VALUES
  ('OIL_CHANGE', 'Engine Oil & Filter', 'تغيير زيت المحرك والفلتر',
    'Premium oil and filter replacement with visual checks', 'تبديل زيت المحرك والفلتر مع فحص بصري',
    12000, 45, '/media/hero-maintenance.jpg', 1),
  ('BRAKE_SERVICE', 'Brake System Service', 'صيانة نظام الفرامل',
    'Brake inspection and replacement service', 'فحص وصيانة وتبديل مكونات الفرامل',
    18000, 90, '/media/about-workshop.jpg', 2),
  ('AC_SERVICE', 'Air Conditioning Service', 'صيانة المكيف',
    'A/C inspection, fault diagnosis and servicing', 'فحص نظام التكييف وتشخيص الأعطال وصيانته',
    15000, 75, '/media/workshop-artdeco.jpg', 3),
  ('ENGINE_DIAG', 'Engine Diagnostics', 'تشخيص أعطال المحرك',
    'Electronic engine fault diagnosis and reporting', 'فحص إلكتروني لأعطال المحرك وإعداد تقرير',
    10000, 60, '/media/hero-maintenance.jpg', 4)
) AS demo(code, name_en, name_ar, desc_en, desc_ar, price_minor, duration_min, image_url, sort_order)
WHERE c."code" = 'ORYX-AUTO'
ON CONFLICT ("companyId", "code") DO NOTHING;
