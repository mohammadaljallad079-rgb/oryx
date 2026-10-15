/**
 * ORYX booking / scheduling engine.
 *
 * One engine schedules every automotive workflow: vehicle inspections, workshop
 * maintenance and marketplace provider services. Keeping the arithmetic here —
 * pure, dependency-free and unit tested — is what stops the three workflows from
 * drifting into three incompatible notions of "available".
 *
 * ## Why the arithmetic is minute-based
 *
 * A slot is computed from the **start of the local business day** plus a number
 * of minutes. The caller resolves that day start (it owns the branch timezone),
 * so this module never touches `Date` timezone conversion and cannot be wrong
 * about DST or a UTC offset. The engine then only compares integers.
 *
 * ## Availability is a pre-check, not the guarantee
 *
 * `generateAvailableSlots` decides what to *offer*. It cannot prevent a race:
 * two customers can both be offered the same slot and both submit. The hard
 * guarantee against double-booking is the partial unique index on
 * `(resourceKey, startsAt)` in PostgreSQL (migration
 * `20261015055400_execution_04_booking_concurrency`), which makes the second
 * insert fail. This module therefore also exports `overlaps` so the API can
 * produce a clear 409 message when that constraint fires.
 */

export const MINUTES_PER_DAY = 24 * 60;

/** Default granularity at which slots are offered. */
export const DEFAULT_SLOT_STEP_MINUTES = 30;

export interface TimeWindow {
  /** Minutes from local midnight, inclusive. */
  opensMinute: number;
  /** Minutes from local midnight, exclusive. */
  closesMinute: number;
}

/** An already-occupied interval, measured from the same local midnight. */
export interface BusyInterval {
  startMinute: number;
  endMinute: number;
}

export interface AvailableSlot {
  /** ISO instant. */
  startsAt: string;
  endsAt: string;
  startMinute: number;
  endMinute: number;
}

export interface SlotGenerationInput {
  /** UTC instant of local midnight for the day being planned. */
  dayStart: Date;
  /** How long the service takes. Must be positive. */
  durationMinutes: number;
  /** Opening windows for the day. An empty list means the business is closed. */
  windows: readonly TimeWindow[];
  /** Already-booked intervals for the resource, from the same local midnight. */
  busy?: readonly BusyInterval[];
  /** Offer granularity. Defaults to 30 minutes. */
  stepMinutes?: number;
  /** Current instant, used with `minimumNoticeMinutes`. */
  now?: Date;
  /** Earliest a customer may book, in minutes from now. */
  minimumNoticeMinutes?: number;
  /** Clean-down / handover gap reserved around each existing booking. */
  bufferMinutes?: number;
  /** Upper bound on how many slots to return. */
  maxSlots?: number;
}

export class SchedulingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SchedulingError';
  }
}

function assertFiniteInteger(value: number, label: string): void {
  if (!Number.isInteger(value) || !Number.isFinite(value)) {
    throw new SchedulingError(`${label} must be a finite integer.`);
  }
}

/** True when two half-open intervals `[start, end)` overlap. */
export function overlaps(a: BusyInterval, b: BusyInterval): boolean {
  return a.startMinute < b.endMinute && b.startMinute < a.endMinute;
}

/**
 * Normalise working hours into windows for a specific weekday.
 *
 * `dayOfWeek` is 0 = Sunday … 6 = Saturday (the Gulf working week). A closed day
 * yields no windows, which is what makes `generateAvailableSlots` return an
 * empty list instead of inventing hours.
 *
 * A dated exception, when present, **replaces** the recurring hours for that
 * day: a public holiday closes the branch even though Sunday is normally open,
 * and a special extended shift opens it beyond the usual closing time.
 */
export function windowsForDay(
  hours: readonly { dayOfWeek: number; opensMinute: number; closesMinute: number; isClosed: boolean }[],
  dayOfWeek: number,
  exception?: { isClosed: boolean; opensMinute: number | null; closesMinute: number | null } | null,
): TimeWindow[] {
  if (exception) {
    if (exception.isClosed) return [];
    if (exception.opensMinute !== null && exception.closesMinute !== null) {
      if (exception.closesMinute <= exception.opensMinute) {
        throw new SchedulingError('An exception closing time must be after its opening time.');
      }
      return [{ opensMinute: exception.opensMinute, closesMinute: exception.closesMinute }];
    }
    // An exception that only re-opens a normally closed day still needs hours;
    // fall through to the recurring definition when one exists.
  }

  const windows: TimeWindow[] = [];
  for (const h of hours) {
    if (h.dayOfWeek !== dayOfWeek || h.isClosed) continue;
    if (h.closesMinute <= h.opensMinute) {
      throw new SchedulingError('A closing time must be after its opening time.');
    }
    windows.push({ opensMinute: h.opensMinute, closesMinute: h.closesMinute });
  }
  // Deterministic order so slot output does not depend on row order.
  return windows.sort((a, b) => a.opensMinute - b.opensMinute);
}

/**
 * Compute the bookable start times for one day.
 *
 * A slot is offered when the whole service fits inside an opening window, does
 * not overlap an existing booking (plus its buffer), and respects the minimum
 * notice. Results are sorted by start time and de-duplicated, so a service that
 * could start in two overlapping windows is offered once.
 */
export function generateAvailableSlots(input: SlotGenerationInput): AvailableSlot[] {
  const {
    dayStart,
    durationMinutes,
    windows,
    busy = [],
    stepMinutes = DEFAULT_SLOT_STEP_MINUTES,
    now,
    minimumNoticeMinutes = 0,
    bufferMinutes = 0,
    maxSlots,
  } = input;

  assertFiniteInteger(durationMinutes, 'durationMinutes');
  if (durationMinutes <= 0) throw new SchedulingError('A service must last at least one minute.');
  assertFiniteInteger(stepMinutes, 'stepMinutes');
  if (stepMinutes <= 0) throw new SchedulingError('The slot step must be at least one minute.');
  assertFiniteInteger(minimumNoticeMinutes, 'minimumNoticeMinutes');
  assertFiniteInteger(bufferMinutes, 'bufferMinutes');
  if (bufferMinutes < 0) throw new SchedulingError('The buffer cannot be negative.');
  if (!(dayStart instanceof Date) || Number.isNaN(dayStart.getTime())) {
    throw new SchedulingError('dayStart must be a valid date.');
  }

  if (windows.length === 0) return [];

  // The earliest instant a booking may start, expressed in day-relative minutes.
  // A cut-off that falls outside this day leaves the whole day bookable.
  let earliestMinute = -Infinity;
  if (now) {
    const noticeMs = minimumNoticeMinutes * 60_000;
    const earliestInstant = now.getTime() + noticeMs;
    earliestMinute = Math.ceil((earliestInstant - dayStart.getTime()) / 60_000);
  }

  // Widen each busy interval by the buffer so the gap is enforced on both sides.
  const blocked: BusyInterval[] = busy.map((b) => ({
    startMinute: b.startMinute - bufferMinutes,
    endMinute: b.endMinute + bufferMinutes,
  }));

  const seen = new Set<number>();
  const slots: AvailableSlot[] = [];

  for (const window of windows) {
    if (window.closesMinute <= window.opensMinute) {
      throw new SchedulingError('A window must close after it opens.');
    }
    // Offer on the step grid anchored to the window opening, so a 09:05 opening
    // with a 30-minute step offers 09:05, 09:35, … rather than drifting.
    for (
      let start = window.opensMinute;
      start + durationMinutes <= window.closesMinute;
      start += stepMinutes
    ) {
      if (start < earliestMinute) continue;
      const candidate: BusyInterval = { startMinute: start, endMinute: start + durationMinutes };
      if (blocked.some((b) => overlaps(candidate, b))) continue;
      if (seen.has(start)) continue;
      seen.add(start);
      slots.push({
        startMinute: candidate.startMinute,
        endMinute: candidate.endMinute,
        startsAt: new Date(dayStart.getTime() + candidate.startMinute * 60_000).toISOString(),
        endsAt: new Date(dayStart.getTime() + candidate.endMinute * 60_000).toISOString(),
      });
    }
  }

  slots.sort((a, b) => a.startMinute - b.startMinute);
  return typeof maxSlots === 'number' ? slots.slice(0, maxSlots) : slots;
}

export interface SlotValidationInput {
  /** Minutes from local midnight at which the service would begin. */
  startMinute: number;
  durationMinutes: number;
  windows: readonly TimeWindow[];
  busy?: readonly BusyInterval[];
  bufferMinutes?: number;
}

export interface SlotValidationResult {
  ok: boolean;
  reason?: 'closed' | 'outside_hours' | 'conflict';
}

/**
 * Server-side check that a requested start time is genuinely bookable.
 *
 * The API runs this before writing, so an obviously invalid request is answered
 * with a precise 400/409 instead of a raw constraint violation. It is *not* the
 * concurrency guarantee — the unique index is.
 */
export function validateSlot(input: SlotValidationInput): SlotValidationResult {
  const { startMinute, durationMinutes, windows, busy = [], bufferMinutes = 0 } = input;
  if (windows.length === 0) return { ok: false, reason: 'closed' };

  const candidate: BusyInterval = { startMinute, endMinute: startMinute + durationMinutes };
  const inside = windows.some(
    (w) => candidate.startMinute >= w.opensMinute && candidate.endMinute <= w.closesMinute,
  );
  if (!inside) return { ok: false, reason: 'outside_hours' };

  const blocked = busy.map((b) => ({
    startMinute: b.startMinute - bufferMinutes,
    endMinute: b.endMinute + bufferMinutes,
  }));
  if (blocked.some((b) => overlaps(candidate, b))) return { ok: false, reason: 'conflict' };

  return { ok: true };
}

/**
 * Minutes from local midnight for an instant, given that day's local midnight.
 * Returns a negative number for an instant on an earlier day and a value beyond
 * 1440 for a later one, which lets callers bucket a range of instants by day.
 */
export function minutesFromDayStart(instant: Date, dayStart: Date): number {
  return Math.round((instant.getTime() - dayStart.getTime()) / 60_000);
}

/** True when two `[start, end)` instants overlap. Used to detect conflicts. */
export function intervalsOverlap(
  a: { startsAt: Date; endsAt: Date },
  b: { startsAt: Date; endsAt: Date },
): boolean {
  return a.startsAt < b.endsAt && b.startsAt < a.endsAt;
}

/** Statuses that occupy a slot. Cancelled and no-show bookings release it. */
export const ACTIVE_BOOKING_STATUSES = [
  'HELD',
  'CONFIRMED',
  'RESCHEDULED',
  'IN_PROGRESS',
  'COMPLETED',
] as const;

export function occupiesSlot(status: string): boolean {
  return (ACTIVE_BOOKING_STATUSES as readonly string[]).includes(status);
}

/**
 * Build the concurrency key for a slot.
 *
 * When a resource is chosen the key is that resource, so two bookings on the
 * same inspector collide. When no resource is chosen the key falls back to a
 * deterministic scope key, so resource-less bookings for the same branch and
 * service still serialise instead of silently stacking up.
 */
export function bookingResourceKey(input: {
  resourceId?: string | null;
  branchId?: string | null;
  serviceRef?: string | null;
}): string {
  if (input.resourceId) return input.resourceId;
  const branch = input.branchId ?? 'nobranch';
  const service = input.serviceRef ?? 'noservice';
  return `branch:${branch}|service:${service}`;
}
