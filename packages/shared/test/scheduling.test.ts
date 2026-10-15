import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SLOT_STEP_MINUTES,
  bookingResourceKey,
  generateAvailableSlots,
  intervalsOverlap,
  minutesFromDayStart,
  occupiesSlot,
  overlaps,
  validateSlot,
  windowsForDay,
  SchedulingError,
} from '../src/scheduling';

/**
 * The scheduling engine is shared by inspections, workshop work and marketplace
 * providers. These tests pin the arithmetic that decides what a customer may
 * book, so the three workflows cannot drift apart.
 *
 * Slots are computed from local midnight, so the tests use a fixed UTC midnight
 * and never depend on the machine timezone.
 */
const DAY = new Date('2026-03-02T00:00:00.000Z');
const at = (minute: number) => new Date(DAY.getTime() + minute * 60_000).toISOString();

/** Sunday 09:00–17:00. */
const sundayHours = [
  { dayOfWeek: 0, opensMinute: 9 * 60, closesMinute: 17 * 60, isClosed: false },
];

describe('scheduling — working hours', () => {
  it('returns the opening windows for an open day', () => {
    const windows = windowsForDay(sundayHours, 0);
    expect(windows).toEqual([{ opensMinute: 540, closesMinute: 1020 }]);
  });

  it('returns nothing for a day with no recurring hours', () => {
    expect(windowsForDay(sundayHours, 3)).toEqual([]);
  });

  it('returns nothing for a day explicitly marked closed', () => {
    const hours = [{ dayOfWeek: 0, opensMinute: 540, closesMinute: 1020, isClosed: true }];
    expect(windowsForDay(hours, 0)).toEqual([]);
  });

  it('lets a dated exception replace the recurring hours (a holiday)', () => {
    const windows = windowsForDay(sundayHours, 0, {
      isClosed: true,
      opensMinute: null,
      closesMinute: null,
    });
    expect(windows).toEqual([]);
  });

  it('lets a dated exception extend the day (a special shift)', () => {
    const windows = windowsForDay(sundayHours, 0, {
      isClosed: false,
      opensMinute: 8 * 60,
      closesMinute: 22 * 60,
    });
    expect(windows).toEqual([{ opensMinute: 480, closesMinute: 1320 }]);
  });

  it('rejects a window that closes before it opens', () => {
    const hours = [{ dayOfWeek: 0, opensMinute: 1020, closesMinute: 540, isClosed: false }];
    expect(() => windowsForDay(hours, 0)).toThrow(SchedulingError);
  });

  it('orders multiple windows deterministically', () => {
    const hours = [
      { dayOfWeek: 0, opensMinute: 900, closesMinute: 1020, isClosed: false },
      { dayOfWeek: 0, opensMinute: 540, closesMinute: 720, isClosed: false },
    ];
    expect(windowsForDay(hours, 0).map((w) => w.opensMinute)).toEqual([540, 900]);
  });
});

describe('scheduling — slot generation', () => {
  const windows = [{ opensMinute: 540, closesMinute: 1020 }];

  it('offers slots across the whole open window', () => {
    const slots = generateAvailableSlots({
      dayStart: DAY,
      durationMinutes: 60,
      windows,
      stepMinutes: 60,
    });
    // 09:00 … 16:00 inclusive: the last start that still ends by 17:00.
    expect(slots.map((s) => s.startMinute)).toEqual([540, 600, 660, 720, 780, 840, 900, 960]);
    expect(slots[0].startsAt).toBe(at(540));
    expect(slots[0].endsAt).toBe(at(600));
  });

  it('never offers a slot that would run past closing time', () => {
    const slots = generateAvailableSlots({
      dayStart: DAY,
      durationMinutes: 90,
      windows,
      stepMinutes: 30,
    });
    for (const slot of slots) {
      expect(slot.endMinute).toBeLessThanOrEqual(1020);
    }
    expect(slots.at(-1)!.startMinute).toBe(930);
  });

  it('returns nothing when the business is closed', () => {
    expect(generateAvailableSlots({ dayStart: DAY, durationMinutes: 60, windows: [] })).toEqual([]);
  });

  it('removes slots that overlap an existing booking', () => {
    const slots = generateAvailableSlots({
      dayStart: DAY,
      durationMinutes: 60,
      windows,
      stepMinutes: 60,
      busy: [{ startMinute: 660, endMinute: 720 }],
    });
    expect(slots.map((s) => s.startMinute)).not.toContain(660);
    expect(slots.map((s) => s.startMinute)).toContain(600);
    expect(slots.map((s) => s.startMinute)).toContain(720);
  });

  it('applies a buffer around an existing booking', () => {
    const slots = generateAvailableSlots({
      dayStart: DAY,
      durationMinutes: 60,
      windows,
      stepMinutes: 60,
      busy: [{ startMinute: 660, endMinute: 720 }],
      bufferMinutes: 30,
    });
    // 10:00–11:00 is busy, so a 30-minute buffer blocks 09:30–11:30. The 09:00
    // slot ends exactly when the buffer begins and stays bookable; 11:00 does
    // not, because it starts inside the buffer.
    expect(slots.map((s) => s.startMinute)).toEqual([540, 780, 840, 900, 960]);
  });

  it('honours the minimum notice period', () => {
    const slots = generateAvailableSlots({
      dayStart: DAY,
      durationMinutes: 60,
      windows,
      stepMinutes: 60,
      now: new Date(DAY.getTime() + 600 * 60_000), // 10:00
      minimumNoticeMinutes: 120,
    });
    // Earliest bookable instant is 12:00.
    expect(slots[0].startMinute).toBe(720);
  });

  it('caps the number of returned slots when asked', () => {
    const slots = generateAvailableSlots({
      dayStart: DAY,
      durationMinutes: 60,
      windows,
      stepMinutes: 30,
      maxSlots: 3,
    });
    expect(slots).toHaveLength(3);
  });

  it('does not offer the same start time twice when windows overlap', () => {
    const slots = generateAvailableSlots({
      dayStart: DAY,
      durationMinutes: 60,
      windows: [
        { opensMinute: 540, closesMinute: 900 },
        { opensMinute: 600, closesMinute: 1020 },
      ],
      stepMinutes: 60,
    });
    const starts = slots.map((s) => s.startMinute);
    expect(new Set(starts).size).toBe(starts.length);
  });

  it('uses a 30-minute default step', () => {
    expect(DEFAULT_SLOT_STEP_MINUTES).toBe(30);
  });

  it('rejects a zero-length service', () => {
    expect(() => generateAvailableSlots({ dayStart: DAY, durationMinutes: 0, windows })).toThrow(
      SchedulingError,
    );
  });

  it('rejects a non-integer step', () => {
    expect(() =>
      generateAvailableSlots({ dayStart: DAY, durationMinutes: 30, windows, stepMinutes: 1.5 }),
    ).toThrow(SchedulingError);
  });

  it('rejects a negative buffer', () => {
    expect(() =>
      generateAvailableSlots({ dayStart: DAY, durationMinutes: 30, windows, bufferMinutes: -5 }),
    ).toThrow(SchedulingError);
  });
});

describe('scheduling — slot validation', () => {
  const windows = [{ opensMinute: 540, closesMinute: 1020 }];

  it('accepts a slot inside the opening window', () => {
    expect(validateSlot({ startMinute: 600, durationMinutes: 60, windows })).toEqual({ ok: true });
  });

  it('rejects a slot that starts before opening', () => {
    expect(validateSlot({ startMinute: 500, durationMinutes: 60, windows })).toEqual({
      ok: false,
      reason: 'outside_hours',
    });
  });

  it('rejects a slot that runs past closing', () => {
    expect(validateSlot({ startMinute: 1000, durationMinutes: 60, windows })).toEqual({
      ok: false,
      reason: 'outside_hours',
    });
  });

  it('reports a closed day distinctly from an out-of-hours slot', () => {
    expect(validateSlot({ startMinute: 600, durationMinutes: 60, windows: [] })).toEqual({
      ok: false,
      reason: 'closed',
    });
  });

  it('rejects a slot that collides with an existing booking', () => {
    expect(
      validateSlot({
        startMinute: 660,
        durationMinutes: 60,
        windows,
        busy: [{ startMinute: 660, endMinute: 720 }],
      }),
    ).toEqual({ ok: false, reason: 'conflict' });
  });

  it('allows a back-to-back slot when no buffer is configured', () => {
    expect(
      validateSlot({
        startMinute: 720,
        durationMinutes: 60,
        windows,
        busy: [{ startMinute: 660, endMinute: 720 }],
      }),
    ).toEqual({ ok: true });
  });

  it('rejects a back-to-back slot when a buffer is configured', () => {
    expect(
      validateSlot({
        startMinute: 720,
        durationMinutes: 60,
        windows,
        busy: [{ startMinute: 660, endMinute: 720 }],
        bufferMinutes: 15,
      }),
    ).toEqual({ ok: false, reason: 'conflict' });
  });
});

describe('scheduling — interval arithmetic', () => {
  it('treats intervals as half-open so touching intervals do not overlap', () => {
    expect(overlaps({ startMinute: 0, endMinute: 60 }, { startMinute: 60, endMinute: 120 })).toBe(false);
  });

  it('detects a genuine overlap', () => {
    expect(overlaps({ startMinute: 0, endMinute: 90 }, { startMinute: 60, endMinute: 120 })).toBe(true);
  });

  it('detects containment as an overlap', () => {
    expect(overlaps({ startMinute: 0, endMinute: 180 }, { startMinute: 60, endMinute: 90 })).toBe(true);
  });

  it('compares instants with the same half-open rule', () => {
    const a = { startsAt: new Date('2026-03-02T09:00:00Z'), endsAt: new Date('2026-03-02T10:00:00Z') };
    const b = { startsAt: new Date('2026-03-02T10:00:00Z'), endsAt: new Date('2026-03-02T11:00:00Z') };
    expect(intervalsOverlap(a, b)).toBe(false);
  });

  it('converts an instant to minutes from the start of the day', () => {
    expect(minutesFromDayStart(new Date(DAY.getTime() + 615 * 60_000), DAY)).toBe(615);
  });

  it('returns a negative value for an instant on the previous day', () => {
    expect(minutesFromDayStart(new Date(DAY.getTime() - 60 * 60_000), DAY)).toBe(-60);
  });
});

describe('scheduling — slot occupancy', () => {
  it('treats live statuses as occupying the slot', () => {
    for (const status of ['HELD', 'CONFIRMED', 'RESCHEDULED', 'IN_PROGRESS', 'COMPLETED']) {
      expect(occupiesSlot(status)).toBe(true);
    }
  });

  it('releases the slot when cancelled or marked no-show', () => {
    expect(occupiesSlot('CANCELLED')).toBe(false);
    expect(occupiesSlot('NO_SHOW')).toBe(false);
  });
});

describe('scheduling — concurrency key', () => {
  it('uses the resource id when a resource is chosen', () => {
    expect(bookingResourceKey({ resourceId: 'res-1', branchId: 'b1', serviceRef: 's1' })).toBe('res-1');
  });

  it('falls back to a deterministic branch/service key', () => {
    expect(bookingResourceKey({ branchId: 'b1', serviceRef: 's1' })).toBe('branch:b1|service:s1');
  });

  it('is stable for the same scope, so resource-less bookings serialise', () => {
    expect(bookingResourceKey({ branchId: 'b1', serviceRef: 's1' })).toBe(
      bookingResourceKey({ branchId: 'b1', serviceRef: 's1' }),
    );
  });

  it('distinguishes different services in the same branch', () => {
    expect(bookingResourceKey({ branchId: 'b1', serviceRef: 's1' })).not.toBe(
      bookingResourceKey({ branchId: 'b1', serviceRef: 's2' }),
    );
  });

  it('handles a missing branch and service without collapsing to an empty key', () => {
    expect(bookingResourceKey({})).toBe('branch:nobranch|service:noservice');
  });
});
