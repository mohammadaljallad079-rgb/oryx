-- AlterTable
ALTER TABLE "CmsBanner" ADD COLUMN     "publishedAt" TIMESTAMP(3),
ADD COLUMN     "status" "CmsStatus" NOT NULL DEFAULT 'DRAFT';
