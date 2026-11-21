-- Native (ERP mobile) session labelling.
--
-- Additive only: two columns on "RefreshToken". No existing column is altered
-- or dropped, so applying this to a live database cannot lose data. Every
-- existing row becomes a WEB session, which is exactly what it is: before this
-- migration only browser clients could hold a refresh token.
--
-- `deviceKind` lets the session list distinguish a browser from a native device
-- so a lost phone can be revoked on its own, and lets the rotation path carry
-- the device identity forward instead of silently relabelling a rotated mobile
-- session as a web one.

-- AlterTable
ALTER TABLE "RefreshToken" ADD COLUMN     "deviceKind" TEXT NOT NULL DEFAULT 'WEB',
ADD COLUMN     "deviceName" TEXT;
