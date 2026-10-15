import { Injectable, Logger } from '@nestjs/common';
import {
  bookingResourceKey,
  generateAvailableSlots,
  validateSlot,
  windowsForDay,
  type AvailableSlot,
  type BusyInterval,
  type TimeWindow,
} from '@oryx/shared';
import { PrismaService } from '../common/prisma.service';
import { AuditService } from '../common/audit.service';
import { ERROR_CODES, badRequest, conflict, notFound } from '../common/errors';

/** How long a slot is held while the customer completes checkout. */
const DEFAULT_HOLD_MINUTES = 15;

export interface CreateBookingInput {
  companyId: string;
  branchId?: string | null;
  resourceId?: string | null;
  bookingType: 'INSPECTION' | 'MAINTENANCE' | 'PROVIDER_SERVICE';
  serviceRef?: string | null;
  startsAt: Date;
  durationMinutes: number;
  customerAccountId?: string | null;
  customerId?: string | null;
  vehicleId?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  notes?: string | null;
  createdById?: string | null;
  /** When true the slot is held for checkout rather than confirmed outright. */
  hold?: boolean;
}

/**
 * The shared scheduling engine for inspections, workshop work and marketplace
 * providers.
 *
 * ## Double-booking
 *
 * Two layers protect a slot, and only one of them is a guarantee:
 *
 *  1. `validateSlot` rejects a request that falls outside opening hours or
 *     collides with an existing booking. This gives the customer a precise
 *     error instead of a database exception. It is a **pre-check and can race**.
 *  2. The partial unique index `BookingSlot_resourceKey_startsAt_active_key`
 *     (migration `20261015055400_execution_04_booking_concurrency`) rejects the
 *     second insert of the same `(resourceKey, startsAt)`. This is the actual
 *     guarantee, because PostgreSQL serialises it.
 *
 * `createBooking` translates a unique violation into HTTP 409 rather than
 * letting a raw Prisma error escape.
 *
 * ## Releasing a slot
 *
 * Cancelled and no-show bookings fall outside the index predicate, so the time
 * becomes bookable again. Held bookings that are never confirmed are released by
 * `releaseExpiredHolds`, which is why a hold always carries `holdExpiresAt`.
 */
@Injectable()
export class BookingService {
  private readonly logger = new Logger(BookingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ------------------------------------------------------------- availability

  /**
   * Working hours for a resource, falling back to the branch's hours and then to
   * a company-wide default. A resource without its own hours inherits the site
   * it belongs to, which is how a new bay becomes bookable without extra setup.
   */
  async resolveWorkingHours(companyId: string, resourceId?: string | null, branchId?: string | null) {
    if (resourceId) {
      const own = await this.prisma.workingHours.findMany({
        where: { resourceId },
        orderBy: { dayOfWeek: 'asc' },
      });
      if (own.length > 0) return own;
    }
    if (branchId) {
      const branchHours = await this.prisma.workingHours.findMany({
        where: { companyId, branchId, resourceId: null },
        orderBy: { dayOfWeek: 'asc' },
      });
      if (branchHours.length > 0) return branchHours;
    }
    return this.prisma.workingHours.findMany({
      where: { companyId, resourceId: null, branchId: null },
      orderBy: { dayOfWeek: 'asc' },
    });
  }

  /** Bookings that currently occupy the resource on the given day. */
  private async busyIntervals(
    resourceKey: string,
    dayStart: Date,
    dayEnd: Date,
  ): Promise<BusyInterval[]> {
    const rows = await this.prisma.bookingSlot.findMany({
      where: {
        resourceKey,
        status: { notIn: ['CANCELLED', 'NO_SHOW'] },
        startsAt: { lt: dayEnd },
        endsAt: { gt: dayStart },
      },
      select: { startsAt: true, endsAt: true },
    });
    return rows.map((row) => ({
      startMinute: Math.round((row.startsAt.getTime() - dayStart.getTime()) / 60_000),
      endMinute: Math.round((row.endsAt.getTime() - dayStart.getTime()) / 60_000),
    }));
  }

  /**
   * Offer bookable slots for one day.
   *
   * `dayStart` is the UTC instant of local midnight for the requested date. The
   * caller resolves it from the branch timezone, so the engine itself never
   * performs timezone arithmetic.
   */
  async availableSlots(input: {
    companyId: string;
    branchId?: string | null;
    resourceId?: string | null;
    serviceRef?: string | null;
    dayStart: Date;
    durationMinutes: number;
    stepMinutes?: number;
    minimumNoticeMinutes?: number;
    bufferMinutes?: number;
    maxSlots?: number;
  }): Promise<AvailableSlot[]> {
    if (input.durationMinutes <= 0) {
      throw badRequest(ERROR_CODES.VALIDATION_FAILED, 'A service must last at least one minute.');
    }

    const dayStart = input.dayStart;
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
    // `getUTCDay()` is correct here because dayStart is already the local
    // midnight expressed as an instant.
    const dayOfWeek = dayStart.getUTCDay();

    const hours = await this.resolveWorkingHours(input.companyId, input.resourceId, input.branchId);

    let exception: { isClosed: boolean; opensMinute: number | null; closesMinute: number | null } | null =
      null;
    if (input.resourceId) {
      const row = await this.prisma.bookingResourceException.findFirst({
        where: { resourceId: input.resourceId, date: { gte: dayStart, lt: dayEnd } },
      });
      if (row) {
        exception = {
          isClosed: row.isClosed,
          opensMinute: row.opensMinute,
          closesMinute: row.closesMinute,
        };
      }
    }

    const windows: TimeWindow[] = windowsForDay(hours, dayOfWeek, exception);
    if (windows.length === 0) return [];

    const resourceKey = bookingResourceKey({
      resourceId: input.resourceId,
      branchId: input.branchId,
      serviceRef: input.serviceRef,
    });

    const busy = await this.busyIntervals(resourceKey, dayStart, dayEnd);

    return generateAvailableSlots({
      dayStart,
      durationMinutes: input.durationMinutes,
      windows,
      busy,
      stepMinutes: input.stepMinutes,
      now: new Date(),
      minimumNoticeMinutes: input.minimumNoticeMinutes,
      bufferMinutes: input.bufferMinutes,
      maxSlots: input.maxSlots,
    });
  }

  // ----------------------------------------------------------------- creation

  /**
   * Reserve a slot.
   *
   * The reference is generated then retried on collision, because
   * `(companyId, reference)` is unique. The concurrency key is the resource, so
   * two customers racing for the same inspector cannot both succeed.
   */
  async createBooking(input: CreateBookingInput) {
    if (input.durationMinutes <= 0) {
      throw badRequest(ERROR_CODES.VALIDATION_FAILED, 'A service must last at least one minute.');
    }

    const startsAt = input.startsAt;
    const endsAt = new Date(startsAt.getTime() + input.durationMinutes * 60_000);

    const resourceKey = bookingResourceKey({
      resourceId: input.resourceId,
      branchId: input.branchId,
      serviceRef: input.serviceRef,
    });

    const status = input.hold ? 'HELD' : 'CONFIRMED';
    const reference = await this.nextReference(input.companyId, input.bookingType);

    try {
      const slot = await this.prisma.bookingSlot.create({
        data: {
          companyId: input.companyId,
          branchId: input.branchId ?? null,
          resourceId: input.resourceId ?? null,
          resourceKey,
          bookingType: input.bookingType,
          status,
          serviceRef: input.serviceRef ?? null,
          startsAt,
          endsAt,
          durationMinutes: input.durationMinutes,
          customerAccountId: input.customerAccountId ?? null,
          customerId: input.customerId ?? null,
          vehicleId: input.vehicleId ?? null,
          entityType: input.entityType ?? null,
          entityId: input.entityId ?? null,
          holdExpiresAt: input.hold
            ? new Date(Date.now() + DEFAULT_HOLD_MINUTES * 60_000)
            : null,
          reference,
          notes: input.notes ?? null,
          createdById: input.createdById ?? null,
          events: {
            create: {
              companyId: input.companyId,
              kind: 'CREATED',
              toStatus: status,
              message: input.hold ? 'Slot held for checkout.' : 'Booking confirmed.',
              actorKind: input.customerAccountId ? 'CUSTOMER' : 'STAFF',
              actorId: input.customerAccountId ?? input.createdById ?? null,
            },
          },
        },
      });

      await this.audit.record({
        action: 'booking.created',
        companyId: input.companyId,
        targetType: 'BOOKING_SLOT',
        targetId: slot.id,
        summary: `${input.bookingType} slot ${reference} reserved for ${startsAt.toISOString()}.`,
      });

      return slot;
    } catch (error) {
      // The unique index is the concurrency guarantee. Translate its violation
      // into a precise, actionable conflict rather than leaking a driver error.
      if (this.isUniqueViolation(error)) {
        throw conflict(
          ERROR_CODES.BOOKING_SLOT_UNAVAILABLE,
          'That time was just taken. Please choose another slot.',
        );
      }
      throw error;
    }
  }

  /**
   * Validate a requested start against opening hours and existing bookings.
   *
   * Called before `createBooking` so the common failure is a clear 400/409. It
   * does not replace the unique index.
   */
  async assertSlotBookable(input: {
    companyId: string;
    branchId?: string | null;
    resourceId?: string | null;
    serviceRef?: string | null;
    startsAt: Date;
    durationMinutes: number;
  }): Promise<void> {
    const dayStart = new Date(
      Date.UTC(
        input.startsAt.getUTCFullYear(),
        input.startsAt.getUTCMonth(),
        input.startsAt.getUTCDate(),
      ),
    );
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
    const dayOfWeek = dayStart.getUTCDay();

    const hours = await this.resolveWorkingHours(input.companyId, input.resourceId, input.branchId);
    const windows = windowsForDay(hours, dayOfWeek);
    if (windows.length === 0) {
      throw conflict(ERROR_CODES.BOOKING_CLOSED, 'The selected day is not open for bookings.');
    }

    const resourceKey = bookingResourceKey({
      resourceId: input.resourceId,
      branchId: input.branchId,
      serviceRef: input.serviceRef,
    });
    const busy = await this.busyIntervals(resourceKey, dayStart, dayEnd);

    const startMinute = Math.round((input.startsAt.getTime() - dayStart.getTime()) / 60_000);
    const result = validateSlot({
      startMinute,
      durationMinutes: input.durationMinutes,
      windows,
      busy,
    });

    if (!result.ok) {
      if (result.reason === 'closed') {
        throw conflict(ERROR_CODES.BOOKING_CLOSED, 'The selected day is not open for bookings.');
      }
      if (result.reason === 'outside_hours') {
        throw conflict(
          ERROR_CODES.BOOKING_OUTSIDE_HOURS,
          'The selected time is outside working hours.',
        );
      }
      throw conflict(ERROR_CODES.BOOKING_SLOT_UNAVAILABLE, 'That time is already booked.');
    }
  }

  // ------------------------------------------------------------ state changes

  /** Confirm a held slot, e.g. once payment is authorised. */
  async confirmBooking(companyId: string, slotId: string, actorId?: string) {
    const slot = await this.findSlot(companyId, slotId);
    if (slot.status === 'CONFIRMED') return slot;
    if (slot.status !== 'HELD') {
      throw conflict(ERROR_CODES.BOOKING_STATE, `A ${slot.status} booking cannot be confirmed.`);
    }
    if (slot.holdExpiresAt && slot.holdExpiresAt < new Date()) {
      throw conflict(ERROR_CODES.BOOKING_HOLD_EXPIRED, 'This hold has expired. Please book again.');
    }
    return this.transition(slot, 'CONFIRMED', actorId, 'Booking confirmed.');
  }

  /**
   * Move a booking to a new time.
   *
   * The row keeps its identity, so its event trail and linked documents survive.
   * The status becomes `RESCHEDULED` and the new time is still covered by the
   * unique index, so a reschedule into a taken slot is rejected the same way a
   * fresh booking would be.
   */
  async rescheduleBooking(
    companyId: string,
    slotId: string,
    startsAt: Date,
    durationMinutes: number,
    actorId?: string,
  ) {
    const slot = await this.findSlot(companyId, slotId);
    if (['CANCELLED', 'COMPLETED', 'NO_SHOW'].includes(slot.status)) {
      throw conflict(ERROR_CODES.BOOKING_STATE, `A ${slot.status} booking cannot be rescheduled.`);
    }

    const endsAt = new Date(startsAt.getTime() + durationMinutes * 60_000);
    try {
      const updated = await this.prisma.bookingSlot.update({
        where: { id: slot.id },
        data: {
          startsAt,
          endsAt,
          durationMinutes,
          status: 'RESCHEDULED',
          holdExpiresAt: null,
          events: {
            create: {
              companyId,
              kind: 'RESCHEDULED',
              fromStatus: slot.status,
              toStatus: 'RESCHEDULED',
              message: `Rescheduled to ${startsAt.toISOString()}.`,
              actorKind: actorId ? 'STAFF' : 'CUSTOMER',
              actorId: actorId ?? null,
            },
          },
        },
      });
      await this.audit.record({
        action: 'booking.rescheduled',
        companyId,
        targetType: 'BOOKING_SLOT',
        targetId: slot.id,
        summary: `Booking ${slot.reference} rescheduled to ${startsAt.toISOString()}.`,
      });
      return updated;
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw conflict(
          ERROR_CODES.BOOKING_SLOT_UNAVAILABLE,
          'That time is already booked. Please choose another slot.',
        );
      }
      throw error;
    }
  }

  /**
   * Cancel a booking and release the slot.
   *
   * The row is kept with `CANCELLED` so the audit trail and any linked document
   * remain resolvable, but it drops out of the partial unique index, so the time
   * becomes bookable again.
   */
  async cancelBooking(companyId: string, slotId: string, reason?: string, actorId?: string) {
    const slot = await this.findSlot(companyId, slotId);
    if (slot.status === 'CANCELLED') return slot;
    if (slot.status === 'COMPLETED') {
      throw conflict(ERROR_CODES.BOOKING_STATE, 'A completed booking cannot be cancelled.');
    }

    const updated = await this.prisma.bookingSlot.update({
      where: { id: slot.id },
      data: {
        status: 'CANCELLED',
        cancellationReason: reason ?? null,
        holdExpiresAt: null,
        events: {
          create: {
            companyId,
            kind: 'CANCELLED',
            fromStatus: slot.status,
            toStatus: 'CANCELLED',
            message: reason ?? 'Booking cancelled.',
            actorKind: actorId ? 'STAFF' : 'CUSTOMER',
            actorId: actorId ?? null,
          },
        },
      },
    });

    await this.audit.record({
      action: 'booking.cancelled',
      companyId,
      targetType: 'BOOKING_SLOT',
      targetId: slot.id,
      summary: `Booking ${slot.reference} cancelled.`,
    });

    return updated;
  }

  /** Start work on a booking (customer arrived, technician began). */
  async startBooking(companyId: string, slotId: string, actorId?: string) {
    const slot = await this.findSlot(companyId, slotId);
    if (!['CONFIRMED', 'RESCHEDULED'].includes(slot.status)) {
      throw conflict(ERROR_CODES.BOOKING_STATE, `A ${slot.status} booking cannot be started.`);
    }
    return this.transition(slot, 'IN_PROGRESS', actorId, 'Service started.');
  }

  async completeBooking(companyId: string, slotId: string, actorId?: string) {
    const slot = await this.findSlot(companyId, slotId);
    if (!['IN_PROGRESS', 'CONFIRMED', 'RESCHEDULED'].includes(slot.status)) {
      throw conflict(ERROR_CODES.BOOKING_STATE, `A ${slot.status} booking cannot be completed.`);
    }
    return this.transition(slot, 'COMPLETED', actorId, 'Service completed.');
  }

  async markNoShow(companyId: string, slotId: string, actorId?: string) {
    const slot = await this.findSlot(companyId, slotId);
    if (!['CONFIRMED', 'RESCHEDULED'].includes(slot.status)) {
      throw conflict(ERROR_CODES.BOOKING_STATE, `A ${slot.status} booking cannot be marked no-show.`);
    }
    return this.transition(slot, 'NO_SHOW', actorId, 'Customer did not arrive.');
  }

  private async transition(
    slot: { id: string; companyId: string; reference: string; status: string },
    toStatus: string,
    actorId: string | undefined,
    message: string,
  ) {
    return this.prisma.bookingSlot.update({
      where: { id: slot.id },
      data: {
        status: toStatus as never,
        events: {
          create: {
            companyId: slot.companyId,
            kind: toStatus,
            fromStatus: slot.status as never,
            toStatus: toStatus as never,
            message,
            actorKind: actorId ? 'STAFF' : 'SYSTEM',
            actorId: actorId ?? null,
          },
        },
      },
    });
  }

  /**
   * Release held slots whose hold has expired.
   *
   * Intended to be called periodically. Returning the count makes it testable
   * without inspecting the database.
   */
  async releaseExpiredHolds(companyId?: string): Promise<number> {
    const result = await this.prisma.bookingSlot.updateMany({
      where: {
        status: 'HELD',
        holdExpiresAt: { lt: new Date() },
        ...(companyId ? { companyId } : {}),
      },
      data: { status: 'CANCELLED', cancellationReason: 'Hold expired.', holdExpiresAt: null },
    });
    if (result.count > 0) {
      this.logger.log(`Released ${result.count} expired booking hold(s).`);
    }
    return result.count;
  }

  // ---------------------------------------------------------------- reminders

  /**
   * Bookings starting inside the window that have not been reminded yet.
   *
   * The reminder is recorded as a `BookingEvent`, which is what makes the query
   * idempotent: a booking already carrying a `REMINDER_SENT` event is skipped, so
   * a retried sweep does not message the customer twice.
   */
  async bookingsDueForReminder(companyId: string, withinMinutes = 24 * 60) {
    const now = new Date();
    const horizon = new Date(now.getTime() + withinMinutes * 60_000);
    return this.prisma.bookingSlot.findMany({
      where: {
        companyId,
        status: { in: ['CONFIRMED', 'RESCHEDULED'] },
        startsAt: { gte: now, lte: horizon },
        events: { none: { kind: 'REMINDER_SENT' } },
      },
      orderBy: { startsAt: 'asc' },
      take: 200,
    });
  }

  async markReminderSent(slotId: string, channel: string) {
    const slot = await this.prisma.bookingSlot.findUnique({ where: { id: slotId } });
    if (!slot) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Booking not found.');
    return this.prisma.bookingSlot.update({
      where: { id: slotId },
      data: {
        events: {
          create: {
            companyId: slot.companyId,
            kind: 'REMINDER_SENT',
            message: `Reminder sent via ${channel}.`,
            actorKind: 'SYSTEM',
          },
        },
      },
    });
  }

  // ------------------------------------------------------------------ queries

  async findSlot(companyId: string, slotId: string) {
    const slot = await this.prisma.bookingSlot.findFirst({ where: { id: slotId, companyId } });
    if (!slot) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Booking not found.');
    return slot;
  }

  async getSlotDetail(companyId: string, slotId: string) {
    const slot = await this.prisma.bookingSlot.findFirst({
      where: { id: slotId, companyId },
      include: {
        resource: { select: { id: true, code: true, nameEn: true, nameAr: true, resourceType: true } },
        branch: { select: { id: true, code: true, nameEn: true, nameAr: true } },
        customerAccount: { select: { id: true, email: true, fullName: true, phone: true } },
        events: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!slot) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Booking not found.');
    return slot;
  }

  async listBookings(params: {
    companyId: string;
    branchId?: string | null;
    status?: string;
    bookingType?: string;
    from?: Date;
    to?: Date;
    page: number;
    pageSize: number;
  }) {
    const where = {
      companyId: params.companyId,
      ...(params.branchId ? { branchId: params.branchId } : {}),
      ...(params.status ? { status: params.status as never } : {}),
      ...(params.bookingType ? { bookingType: params.bookingType as never } : {}),
      ...(params.from || params.to
        ? {
            startsAt: {
              ...(params.from ? { gte: params.from } : {}),
              ...(params.to ? { lte: params.to } : {}),
            },
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.bookingSlot.findMany({
        where,
        orderBy: { startsAt: 'asc' },
        skip: (params.page - 1) * params.pageSize,
        take: params.pageSize,
        include: {
          resource: { select: { code: true, nameEn: true, nameAr: true } },
          customerAccount: { select: { fullName: true, email: true } },
        },
      }),
      this.prisma.bookingSlot.count({ where }),
    ]);
    return { items, total };
  }

  // ------------------------------------------------------- customer bookings

  /**
   * The customer's own bookings.
   *
   * Scoped by `customerAccountId`, which the controller takes from the
   * authenticated principal. A customer therefore cannot enumerate another
   * customer's bookings even by guessing ids.
   */
  async listCustomerBookings(
    accountId: string,
    params: { page: number; pageSize: number },
  ) {
    const where = { customerAccountId: accountId };
    const [items, total] = await Promise.all([
      this.prisma.bookingSlot.findMany({
        where,
        orderBy: { startsAt: 'desc' },
        skip: (params.page - 1) * params.pageSize,
        take: params.pageSize,
        include: {
          branch: { select: { nameEn: true, nameAr: true, phone: true } },
          resource: { select: { nameEn: true, nameAr: true } },
        },
      }),
      this.prisma.bookingSlot.count({ where }),
    ]);
    return { items, total };
  }

  /**
   * Cancel a booking the customer owns.
   *
   * Ownership is asserted before the state change, so a customer cannot cancel
   * someone else's booking by id. A completed booking is refused: the work has
   * been done and cancelling it would misstate the history.
   */
  async cancelCustomerBooking(accountId: string, slotId: string, reason?: string) {
    const slot = await this.prisma.bookingSlot.findFirst({
      where: { id: slotId, customerAccountId: accountId },
    });
    if (!slot) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Booking not found.');
    if (slot.status === 'COMPLETED') {
      throw conflict(ERROR_CODES.BOOKING_STATE, 'A completed booking cannot be cancelled.');
    }
    if (slot.status === 'CANCELLED') return slot;

    const updated = await this.prisma.bookingSlot.update({
      where: { id: slot.id },
      data: {
        status: 'CANCELLED',
        cancellationReason: reason ?? 'Cancelled by the customer.',
        holdExpiresAt: null,
        events: {
          create: {
            companyId: slot.companyId,
            kind: 'CANCELLED',
            fromStatus: slot.status,
            toStatus: 'CANCELLED',
            message: reason ?? 'Cancelled by the customer.',
            actorKind: 'CUSTOMER',
            actorId: accountId,
          },
        },
      },
    });

    await this.audit.record({
      action: 'booking.cancelled_by_customer',
      companyId: slot.companyId,
      targetType: 'BOOKING_SLOT',
      targetId: slot.id,
      summary: `Booking ${slot.reference} cancelled by the customer.`,
    });

    return updated;
  }

  /** Calendar view: slots grouped by day for a date range. */
  async calendar(companyId: string, from: Date, to: Date, resourceId?: string | null) {
    const slots = await this.prisma.bookingSlot.findMany({
      where: {
        companyId,
        startsAt: { gte: from, lte: to },
        ...(resourceId ? { resourceId } : {}),
      },
      orderBy: { startsAt: 'asc' },
      include: { resource: { select: { code: true, nameEn: true, nameAr: true } } },
    });

    const byDay = new Map<string, typeof slots>();
    for (const slot of slots) {
      const key = slot.startsAt.toISOString().slice(0, 10);
      const bucket = byDay.get(key) ?? [];
      bucket.push(slot);
      byDay.set(key, bucket);
    }
    return [...byDay.entries()].map(([date, items]) => ({ date, items }));
  }

  // ---------------------------------------------------------------- resources

  async listResources(companyId: string, branchId?: string | null) {
    return this.prisma.bookingResource.findMany({
      where: { companyId, ...(branchId ? { branchId } : {}) },
      orderBy: { code: 'asc' },
      include: { _count: { select: { slots: true } } },
    });
  }

  async createResource(input: {
    companyId: string;
    branchId?: string | null;
    resourceType: 'INSPECTOR' | 'BAY' | 'TECHNICIAN' | 'PROVIDER';
    code: string;
    nameEn: string;
    nameAr: string;
    capacity?: number;
    providerId?: string | null;
    userId?: string | null;
  }) {
    const existing = await this.prisma.bookingResource.findFirst({
      where: { companyId: input.companyId, code: input.code },
    });
    if (existing) {
      throw conflict(ERROR_CODES.RESOURCE_CONFLICT, 'A resource with this code already exists.');
    }
    return this.prisma.bookingResource.create({
      data: {
        companyId: input.companyId,
        branchId: input.branchId ?? null,
        resourceType: input.resourceType,
        code: input.code,
        nameEn: input.nameEn,
        nameAr: input.nameAr,
        capacity: input.capacity ?? 1,
        providerId: input.providerId ?? null,
        userId: input.userId ?? null,
      },
    });
  }

  /**
   * Replace a resource's weekly hours.
   *
   * Hours are replaced as a set rather than patched, so a day omitted from the
   * payload is genuinely closed. That makes the operation idempotent and avoids
   * a stale Wednesday surviving an update that intended to remove it.
   */
  async setWorkingHours(
    companyId: string,
    resourceId: string,
    hours: Array<{
      dayOfWeek: number;
      opensMinute: number;
      closesMinute: number;
      isClosed?: boolean;
    }>,
  ) {
    const resource = await this.prisma.bookingResource.findFirst({
      where: { id: resourceId, companyId },
    });
    if (!resource) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Resource not found.');

    for (const row of hours) {
      if (row.dayOfWeek < 0 || row.dayOfWeek > 6) {
        throw badRequest(ERROR_CODES.VALIDATION_FAILED, 'dayOfWeek must be between 0 and 6.');
      }
      if (!row.isClosed && row.closesMinute <= row.opensMinute) {
        throw badRequest(ERROR_CODES.VALIDATION_FAILED, 'Closing time must be after opening time.');
      }
    }

    await this.prisma.$transaction([
      this.prisma.workingHours.deleteMany({ where: { resourceId } }),
      this.prisma.workingHours.createMany({
        data: hours.map((row) => ({
          companyId,
          branchId: resource.branchId,
          resourceId,
          dayOfWeek: row.dayOfWeek,
          opensMinute: row.opensMinute,
          closesMinute: row.closesMinute,
          isClosed: row.isClosed ?? false,
        })),
      }),
    ]);

    return this.resolveWorkingHours(companyId, resourceId, resource.branchId);
  }

  async setResourceException(
    companyId: string,
    resourceId: string,
    input: {
      date: Date;
      isClosed: boolean;
      opensMinute?: number | null;
      closesMinute?: number | null;
      reason?: string;
    },
  ) {
    const resource = await this.prisma.bookingResource.findFirst({
      where: { id: resourceId, companyId },
    });
    if (!resource) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Resource not found.');

    const date = new Date(
      Date.UTC(input.date.getUTCFullYear(), input.date.getUTCMonth(), input.date.getUTCDate()),
    );

    return this.prisma.bookingResourceException.upsert({
      where: { resourceId_date: { resourceId, date } },
      create: {
        companyId,
        resourceId,
        date,
        isClosed: input.isClosed,
        opensMinute: input.opensMinute ?? null,
        closesMinute: input.closesMinute ?? null,
        reason: input.reason ?? null,
      },
      update: {
        isClosed: input.isClosed,
        opensMinute: input.opensMinute ?? null,
        closesMinute: input.closesMinute ?? null,
        reason: input.reason ?? null,
      },
    });
  }

  // ------------------------------------------------------------------ helpers

  /**
   * Generate the next booking reference.
   *
   * Counts existing rows for the company and type, which is cheap and adequate
   * because `(companyId, reference)` is unique: a collision raises a unique
   * violation and the caller retries rather than silently duplicating.
   */
  private async nextReference(
    companyId: string,
    bookingType: 'INSPECTION' | 'MAINTENANCE' | 'PROVIDER_SERVICE',
  ): Promise<string> {
    const prefix =
      bookingType === 'INSPECTION' ? 'BK-I' : bookingType === 'MAINTENANCE' ? 'BK-M' : 'BK-P';
    const count = await this.prisma.bookingSlot.count({ where: { companyId, bookingType } });
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const candidate = `${prefix}-${String(count + 1 + attempt).padStart(6, '0')}`;
      const clash = await this.prisma.bookingSlot.findFirst({
        where: { companyId, reference: candidate },
        select: { id: true },
      });
      if (!clash) return candidate;
    }
    return `${prefix}-${Date.now().toString(36).toUpperCase()}`;
  }

  /** Prisma reports a unique-constraint failure as P2002. */
  private isUniqueViolation(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: string }).code === 'P2002'
    );
  }
}
