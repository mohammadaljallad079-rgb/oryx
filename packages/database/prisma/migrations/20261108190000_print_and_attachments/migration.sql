-- Print metadata on the company profile. These feed the address block, contact
-- bar and commercial-registration line of the approved printed documents.
ALTER TABLE "Company" ADD COLUMN "phone" TEXT;
ALTER TABLE "Company" ADD COLUMN "email" TEXT;
ALTER TABLE "Company" ADD COLUMN "website" TEXT;
ALTER TABLE "Company" ADD COLUMN "addressLine" TEXT;
ALTER TABLE "Company" ADD COLUMN "crNumber" TEXT;
ALTER TABLE "Company" ADD COLUMN "printNoteEn" TEXT;
ALTER TABLE "Company" ADD COLUMN "printNoteAr" TEXT;
