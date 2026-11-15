-- EntityAttachment.updatedAt was created with a database DEFAULT in
-- 20261113020000_execution_20_settings_documents_customers, but the Prisma
-- schema declares it `@updatedAt`, which the client always supplies on insert
-- and update and which carries no database default. The stray default made
-- `prisma migrate diff` report the migration history as drifted from the schema.
-- Drop it so the database matches the schema again.
ALTER TABLE "EntityAttachment" ALTER COLUMN "updatedAt" DROP DEFAULT;
