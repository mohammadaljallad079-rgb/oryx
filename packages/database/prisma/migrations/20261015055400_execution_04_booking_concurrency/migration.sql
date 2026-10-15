-- Execution 04 — booking concurrency control.
--
-- The scheduling engine must never allow two live bookings to occupy the same
-- resource at the same start time. A read-then-write availability check cannot
-- provide that guarantee: two concurrent requests can both observe a free slot
-- and both insert. This partial unique index moves the guarantee into
-- PostgreSQL, so the second inserter receives a unique violation (SQLSTATE
-- 23505) which the API translates into HTTP 409 Conflict.
--
-- CANCELLED rows are excluded so a cancelled slot frees the time for reuse, and
-- NO_SHOW rows are excluded for the same reason: the customer did not consume
-- the slot. COMPLETED rows stay in the index, because history must not be
-- overwritten by a late booking for the same time.
CREATE UNIQUE INDEX "BookingSlot_resourceKey_startsAt_active_key"
  ON "BookingSlot" ("resourceKey", "startsAt")
  WHERE "status" NOT IN ('CANCELLED', 'NO_SHOW');
