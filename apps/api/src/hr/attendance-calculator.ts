/**
 * Attendance arithmetic.
 *
 * Given a shift's scheduled window and the punches an employee made, derive the
 * late arrival, early leave, overtime and net worked minutes. The functions are
 * pure so a check-out, a manual correction and a report all agree, and so the
 * rules can be unit-tested without a database.
 *
 * Times are handled in the company's local wall clock: a shift is stored as
 * `HH:MM` strings and a punch is anchored to the same calendar day. The caller
 * is responsible for converting an instant to the company timezone before
 * calling; these helpers compare minutes-since-midnight only.
 */

/** A wall-clock time of day as minutes since midnight. */
export function minutesOfDay(hhmm: string): number {
  const [h, m] = hhmm.split(':').map((v) => Number.parseInt(v, 10));
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 0;
  return h * 60 + m;
}

/**
 * Break an instant into the company's local wall-clock parts.
 *
 * Attendance is recorded and reported in the tenant's own timezone (a branch in
 * Bahrain must not see a 17:00 departure as 14:00 because the server runs in
 * UTC). `Intl` resolves the zone's DST rules for us, so the same instant always
 * yields the same local clock regardless of the host's setting.
 */
export function zonedParts(date: Date, timeZone: string): {
  year: number;
  month: number;
  day: number;
  minutes: number;
  weekday: number;
} {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    weekday: 'short',
  });
  const parts: Record<string, string> = {};
  for (const p of fmt.formatToParts(date)) parts[p.type] = p.value;
  const hour = Number.parseInt(parts.hour === '24' ? '0' : parts.hour, 10);
  const weekdayMap: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  return {
    year: Number.parseInt(parts.year, 10),
    month: Number.parseInt(parts.month, 10),
    day: Number.parseInt(parts.day, 10),
    minutes: hour * 60 + Number.parseInt(parts.minute, 10),
    weekday: weekdayMap[parts.weekday ?? 'Mon'] ?? 1,
  };
}

/** A UTC midnight anchor for the local calendar day of an instant. */
export function zonedDateKey(date: Date, timeZone: string): Date {
  const p = zonedParts(date, timeZone);
  return new Date(Date.UTC(p.year, p.month - 1, p.day));
}

export interface ShiftWindow {
  startTime: string;
  endTime: string;
  breakMinutes: number;
}

export interface AttendanceDerivation {
  workedMinutes: number;
  breakMinutes: number;
  netMinutes: number;
  lateMinutes: number;
  earlyLeaveMinutes: number;
  overtimeMinutes: number;
  status: 'PRESENT' | 'LATE';
}

/**
 * Derive the day's figures.
 *
 * Overtime is time worked beyond the scheduled end (net of the scheduled break);
 * late is arrival after the scheduled start; early leave is departure before the
 * scheduled end. When no shift is supplied only the raw worked time is known.
 */
export function deriveAttendance(input: {
  checkIn: Date;
  checkOut: Date;
  shift: ShiftWindow | null;
  /** Taken breaks in minutes; when zero the scheduled break is used. */
  breakMinutes?: number;
  /** Grace period before an arrival counts as late. */
  graceMinutes?: number;
  /** The company timezone the scheduled window is expressed in. */
  timeZone?: string;
}): AttendanceDerivation {
  const { checkIn, checkOut, shift } = input;
  const grace = input.graceMinutes ?? 0;
  const tz = input.timeZone ?? 'UTC';

  const worked = Math.max(0, Math.round((checkOut.getTime() - checkIn.getTime()) / 60_000));
  const scheduledBreak = shift ? shift.breakMinutes : 0;
  const breakMinutes = input.breakMinutes ?? scheduledBreak;
  const netMinutes = Math.max(0, worked - breakMinutes);

  if (!shift) {
    return {
      workedMinutes: worked,
      breakMinutes,
      netMinutes,
      lateMinutes: 0,
      earlyLeaveMinutes: 0,
      overtimeMinutes: 0,
      status: 'PRESENT',
    };
  }

  const shiftStart = minutesOfDay(shift.startTime);
  const shiftEnd = minutesOfDay(shift.endTime);
  const spansMidnight = shiftEnd <= shiftStart;

  const inMinutes = zonedParts(checkIn, tz).minutes;
  const outMinutes = zonedParts(checkOut, tz).minutes;

  const scheduledEnd = spansMidnight ? shiftEnd + 24 * 60 : shiftEnd;
  const normalisedIn = spansMidnight && inMinutes < shiftStart ? inMinutes + 24 * 60 : inMinutes;
  const normalisedOut = outMinutes < inMinutes ? outMinutes + 24 * 60 : outMinutes;

  const lateRaw = normalisedIn - shiftStart;
  const lateMinutes = lateRaw > grace ? lateRaw : 0;
  const earlyLeaveMinutes = Math.max(0, scheduledEnd - normalisedOut);
  // Overtime counts only the time worked past the scheduled end.
  const overtimeMinutes = Math.max(0, normalisedOut - scheduledEnd);

  return {
    workedMinutes: worked,
    breakMinutes,
    netMinutes,
    lateMinutes,
    earlyLeaveMinutes,
    overtimeMinutes,
    status: lateMinutes > 0 ? 'LATE' : 'PRESENT',
  };
}

/**
 * Great-circle distance in metres between two coordinates (Haversine).
 *
 * Used to decide whether a reported GPS fix is inside a worksite's radius. The
 * value is a plausibility check, never proof of presence: a spoofed coordinate
 * passes it, which is why the record also stores accuracy and the verification
 * source for a human to review.
 */
export function haversineMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6_371_000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.min(1, Math.sqrt(h))));
}
