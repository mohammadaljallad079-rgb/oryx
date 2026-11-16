-- The module catalog editor can override a module's tile artwork, so the tile
-- base name becomes a stored column instead of a compile-time constant.
ALTER TABLE "Module" ADD COLUMN "tileImage" TEXT;

-- A module can be retired from navigation without deleting its catalog row
-- (and therefore without breaking the plans that license it).
ALTER TABLE "Module" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;
