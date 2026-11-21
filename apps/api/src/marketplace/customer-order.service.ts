import { BadRequestException, ConflictException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { AuditService } from '../common/audit.service';
import { DocumentSequenceService } from '../common/document-sequence.service';
import { InventoryService } from '../inventory/inventory.service';
import { NotificationService } from '../notifications/notification.service';
import { basisPointsOfMinor, lineAmountMinor, sumMinor } from '@oryx/shared';
import { ERROR_CODES, badRequest, conflict, notFound } from '../common/errors';

/** How long a consumer order may sit unconfirmed before it is auto-cancelled. */
const ORDER_HOLD_MINUTES = 30;

/** The transitions a consumer order may take. Enforced server-side. */
const TRANSITIONS: Record<string, string[]> = {
  PENDING: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['PREPARING', 'CANCELLED'],
  PREPARING: ['READY', 'CANCELLED'],
  READY: ['OUT_FOR_DELIVERY', 'COMPLETED', 'CANCELLED'],
  OUT_FOR_DELIVERY: ['DELIVERED', 'CANCELLED'],
  DELIVERED: ['COMPLETED'],
  COMPLETED: [],
  CANCELLED: [],
};

/** A status a customer is still allowed to cancel from. */
const CUSTOMER_CANCELLABLE = new Set(['PENDING', 'CONFIRMED']);

export interface PlaceOrderInput {
  /** A customer-chosen address id; its text is copied onto the order. */
  addressId?: string | null;
  paymentMethod?: 'CASH' | 'CARD_TERMINAL' | 'BANK_TRANSFER' | 'BENEFITPAY' | 'CARD_ONLINE';
  notes?: string | null;
  /** A client key so a retried checkout returns the same order rather than a second one. */
  idempotencyKey?: string | null;
}

/**
 * Consumer marketplace orders.
 *
 * ## What is authoritative
 *
 * The subtotal, tax and total are computed here, inside the placement
 * transaction, from the catalogue price and the product's own tax rate. A total
 * or a unit price sent by the client is never read. The order line stores the
 * price as a snapshot, so a later catalogue edit cannot rewrite a historical
 * order.
 *
 * ## Ownership
 *
 * Every read and write is scoped by `customerAccountId` from the verified token.
 * A booking or order id that belongs to another account is a 404, not a leak.
 *
 * ## Idempotency
 *
 * `(customerAccountId, idempotencyKey)` is unique. A retried checkout — the
 * common case when a phone loses signal after the request left but before the
 * response arrived — returns the order that was already placed rather than
 * placing a second one.
 *
 * ## Stock
 *
 * Placement issues stock through the shared `InventoryService.recordMovement`,
 * the one place stock changes. A cancelled order reverses exactly the lines it
 * issued, so the ledger stays balanced. When no warehouse exists the order is
 * still placed and the stock step is skipped rather than failing: a catalogue
 * that does not track stock is a legitimate configuration.
 */
@Injectable()
export class CustomerOrderService {
  private readonly logger = new Logger(CustomerOrderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly sequences: DocumentSequenceService,
    private readonly inventory: InventoryService,
    private readonly notifications: NotificationService,
  ) {}

  /** The customer's own order history, newest first. */
  async listOrders(customerAccountId: string, params: { page: number; pageSize: number; status?: string }) {
    const where = {
      customerAccountId,
      ...(params.status ? { status: params.status as never } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.customerOrder.findMany({
        where,
        orderBy: [{ placedAt: 'desc' }, { id: 'desc' }],
        skip: (params.page - 1) * params.pageSize,
        take: params.pageSize,
        include: { lines: true },
      }),
      this.prisma.customerOrder.count({ where }),
    ]);
    return { items: rows.map((row) => this.toSummary(row)), total, page: params.page, pageSize: params.pageSize };
  }

  /** One of the caller's orders, with its lines and status trail. */
  async getOrder(customerAccountId: string, orderId: string) {
    const order = await this.prisma.customerOrder.findFirst({
      where: { id: orderId, customerAccountId },
      include: {
        lines: true,
        events: { orderBy: { createdAt: 'asc' } },
        paymentIntent: { select: { id: true, status: true, amountMinor: true, currency: true } },
      },
    });
    if (!order) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Order not found.');
    return this.toDetail(order);
  }

  /**
   * Place an order from the caller's cart.
   *
   * Runs in one transaction: the cart is read, each line's price re-read from the
   * catalogue, the totals computed, the order and its lines written, the status
   * trail started and the cart emptied. If any step fails the whole thing rolls
   * back, so a failure never leaves a half-placed order or an emptied cart.
   */
  async placeOrder(customerAccountId: string, input: PlaceOrderInput) {
    if (input.idempotencyKey) {
      const existing = await this.prisma.customerOrder.findUnique({
        where: { customerAccountId_idempotencyKey: { customerAccountId, idempotencyKey: input.idempotencyKey } },
        include: { lines: true, events: { orderBy: { createdAt: 'asc' } } },
      });
      // A retried checkout returns the original order. This is the whole point of
      // the key: the customer pressed "place order" once, so they get one order.
      if (existing) return this.toDetail(existing);
    }

    const cart = await this.prisma.cart.findUnique({
      where: { customerAccountId },
      include: {
        items: {
          include: {
            product: {
              select: {
                id: true,
                sku: true,
                nameEn: true,
                nameAr: true,
                salesPriceMinor: true,
                taxRateBp: true,
                isActive: true,
                trackStock: true,
              },
            },
          },
        },
      },
    });

    if (!cart || cart.items.length === 0) {
      throw badRequest(ERROR_CODES.VALIDATION_FAILED, 'Your cart is empty.');
    }

    const inactive = cart.items.find((line) => !line.product.isActive);
    if (inactive) {
      throw conflict(
        ERROR_CODES.RESOURCE_NOT_FOUND,
        `"${inactive.product.nameEn}" is no longer available. Remove it from the cart and try again.`,
      );
    }

    // A client-chosen address is validated against the caller's own addresses,
    // and its text is copied so a later edit cannot rewrite a placed order.
    const address = input.addressId
      ? await this.prisma.customerAddress.findFirst({
          where: { id: input.addressId, accountId: customerAccountId },
        })
      : await this.prisma.customerAddress.findFirst({
          where: { accountId: customerAccountId, isDefault: true },
        });
    if (input.addressId && !address) {
      throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Address not found.');
    }

    const warehouse = await this.prisma.warehouse.findFirst({
      where: { companyId: cart.companyId, isActive: true },
      orderBy: { createdAt: 'asc' },
    });

    const placed = await this.prisma.$transaction(async (tx) => {
      const reference = await this.sequences.next(tx, cart.companyId, 'customerOrder');

      const lines = cart.items.map((line) => {
        // `lineAmountMinor` takes a quantity scaled by 10^4, exactly as the
        // inventory ledger does. Passing a whole count here would price an order
        // at a ten-thousandth of its value — the defect this guards against.
        const lineSubtotal = lineAmountMinor(line.quantity * 10_000, line.product.salesPriceMinor);
        const lineTax = basisPointsOfMinor(lineSubtotal, line.product.taxRateBp);
        return {
          productId: line.productId,
          sku: line.product.sku,
          nameEn: line.product.nameEn,
          nameAr: line.product.nameAr,
          quantity: line.quantity,
          unitPriceMinor: line.product.salesPriceMinor,
          taxRateBp: line.product.taxRateBp,
          lineSubtotalMinor: lineSubtotal,
          lineTaxMinor: lineTax,
          lineTotalMinor: lineSubtotal + lineTax,
          trackStock: line.product.trackStock,
        };
      });

      const subtotalMinor = sumMinor(lines.map((line) => line.lineSubtotalMinor));
      const taxMinor = sumMinor(lines.map((line) => line.lineTaxMinor));
      const totalMinor = subtotalMinor + taxMinor;

      const order = await tx.customerOrder.create({
        data: {
          reference,
          customerAccountId,
          companyId: cart.companyId,
          status: 'PENDING',
          paymentMethod: (input.paymentMethod ?? 'CASH') as never,
          idempotencyKey: input.idempotencyKey ?? null,
          addressLabel: address?.label ?? null,
          addressLine1: address?.addressLine1 ?? null,
          addressLine2: address?.addressLine2 ?? null,
          addressCity: address?.city ?? null,
          addressCountryCode: address?.countryCode ?? null,
          subtotalMinor,
          taxMinor,
          totalMinor,
          notes: input.notes ?? null,
          lines: {
            create: lines.map(({ trackStock: _trackStock, ...line }) => line),
          },
          events: { create: { status: 'PENDING', actor: 'CUSTOMER', note: 'Order placed.' } },
        },
        include: { lines: true, events: { orderBy: { createdAt: 'asc' } } },
      });

      // Issue stock for the lines that track it. A catalogue that does not track
      // stock (a service) has nothing to issue and is skipped.
      if (warehouse) {
        for (const line of lines) {
          if (!line.trackStock) continue;
          await this.inventory.recordMovement(tx, {
            companyId: cart.companyId,
            warehouseId: warehouse.id,
            productId: line.productId,
            movementType: 'ISSUE',
            quantity: -line.quantity * 10_000,
            source: 'MARKETPLACE_ORDER',
            sourceId: order.id,
            memo: `Marketplace order ${reference}`,
            occurredAt: new Date(),
            actorUserId: 'system',
            allowNegative: true,
          });
        }
      }

      // The cart is emptied only once the order row exists. A rollback above
      // therefore leaves the cart intact.
      await tx.cartItem.deleteMany({ where: { cartId: cart.id } });

      return order;
    });

    await this.audit.record({
      action: 'customer.order.placed',
      targetType: 'CUSTOMER_ORDER',
      targetId: placed.id,
      summary: `Consumer order ${placed.reference} placed (${placed.totalMinor} minor).`,
      metadata: { reference: placed.reference, totalMinor: placed.totalMinor },
    });

    // A notification is best-effort: a failure to record one must not fail a
    // placed order, which has already committed.
    await this.notify(placed.id, customerAccountId, cart.companyId, 'order.placed', {
      reference: placed.reference,
    });

    return this.toDetail(placed);
  }

  /** Cancel the caller's own order, while the server says it may be cancelled. */
  async cancelOrder(customerAccountId: string, orderId: string, reason?: string | null) {
    const order = await this.prisma.customerOrder.findFirst({
      where: { id: orderId, customerAccountId },
      include: { lines: true },
    });
    if (!order) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Order not found.');
    if (!CUSTOMER_CANCELLABLE.has(order.status)) {
      throw conflict(ERROR_CODES.VALIDATION_FAILED, `An order that is ${order.status} cannot be cancelled.`);
    }

    const warehouse = await this.prisma.warehouse.findFirst({
      where: { companyId: order.companyId, isActive: true },
      orderBy: { createdAt: 'asc' },
    });

    const cancelled = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.customerOrder.update({
        where: { id: order.id },
        data: {
          status: 'CANCELLED',
          cancelledAt: new Date(),
          cancellationReason: reason ?? null,
          events: { create: { status: 'CANCELLED', actor: 'CUSTOMER', note: reason ?? 'Cancelled by customer.' } },
        },
        include: { lines: true, events: { orderBy: { createdAt: 'asc' } } },
      });

      // Return the stock the order issued. The reversal mirrors the issue line
      // for line, so the stock ledger nets to zero for this order.
      if (warehouse) {
        for (const line of updated.lines) {
          const product = await tx.product.findUnique({
            where: { id: line.productId },
            select: { trackStock: true },
          });
          if (!product?.trackStock) continue;
          await this.inventory.recordMovement(tx, {
            companyId: order.companyId,
            warehouseId: warehouse.id,
            productId: line.productId,
            movementType: 'RECEIPT',
            quantity: line.quantity * 10_000,
            source: 'MARKETPLACE_ORDER_CANCEL',
            sourceId: order.id,
            memo: `Cancellation of order ${order.reference}`,
            occurredAt: new Date(),
            actorUserId: 'system',
            allowNegative: true,
          });
        }
      }

      return updated;
    });

    await this.audit.record({
      action: 'customer.order.cancelled',
      targetType: 'CUSTOMER_ORDER',
      targetId: order.id,
      summary: `Consumer order ${order.reference} cancelled by the customer.`,
      metadata: { reason: reason ?? null },
    });

    await this.notify(order.id, customerAccountId, order.companyId, 'order.cancelled', {
      reference: order.reference,
    });

    return this.toDetail(cancelled);
  }

  /**
   * Orders placed against a company's catalogue, for the merchant portal.
   *
   * Scoped by `companyId` from the provider's own membership, never from the
   * request, so a merchant sees only its own orders.
   */
  async listForCompany(companyId: string, params: { page: number; pageSize: number; status?: string }) {
    const where = {
      companyId,
      ...(params.status ? { status: params.status as never } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.customerOrder.findMany({
        where,
        orderBy: [{ placedAt: 'desc' }, { id: 'desc' }],
        skip: (params.page - 1) * params.pageSize,
        take: params.pageSize,
        include: { lines: true },
      }),
      this.prisma.customerOrder.count({ where }),
    ]);
    return {
      items: rows.map((row) => ({
        ...this.toSummary(row),
        customerAccountId: row.customerAccountId,
      })),
      total,
      page: params.page,
      pageSize: params.pageSize,
    };
  }

  /** One order within a company, for the merchant portal. */
  async getForCompany(companyId: string, orderId: string) {
    const order = await this.prisma.customerOrder.findFirst({
      where: { id: orderId, companyId },
      include: {
        lines: true,
        events: { orderBy: { createdAt: 'asc' } },
        paymentIntent: { select: { id: true, status: true, amountMinor: true, currency: true } },
      },
    });
    if (!order) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Order not found.');
    return { ...this.toDetail(order), customerAccountId: order.customerAccountId };
  }

  /**
   * Move an order to a new status, enforcing the transition graph.
   *
   * Called by the merchant portal. A transition that the graph does not allow is
   * a 409, and a second application of the same transition is rejected by the
   * status check rather than writing a duplicate event.
   */
  async transition(
    orderId: string,
    next: string,
    actor: string,
    note?: string | null,
    scope?: { companyId?: string },
  ) {
    const order = await this.prisma.customerOrder.findFirst({
      where: { id: orderId, ...(scope?.companyId ? { companyId: scope.companyId } : {}) },
    });
    if (!order) throw notFound(ERROR_CODES.RESOURCE_NOT_FOUND, 'Order not found.');
    if (order.status === next) {
      throw conflict(ERROR_CODES.VALIDATION_FAILED, `The order is already ${next}.`);
    }
    const allowed = TRANSITIONS[order.status] ?? [];
    if (!allowed.includes(next)) {
      throw conflict(
        ERROR_CODES.VALIDATION_FAILED,
        `An order that is ${order.status} cannot become ${next}.`,
      );
    }

    const stamps: Record<string, Date> = {};
    if (next === 'CONFIRMED') stamps.confirmedAt = new Date();
    if (next === 'COMPLETED') stamps.completedAt = new Date();
    if (next === 'CANCELLED') stamps.cancelledAt = new Date();

    const updated = await this.prisma.customerOrder.update({
      where: { id: order.id },
      data: {
        status: next as never,
        ...stamps,
        events: { create: { status: next as never, actor, note: note ?? null } },
      },
      include: { lines: true, events: { orderBy: { createdAt: 'asc' } } },
    });

    await this.audit.record({
      action: `customer.order.${next.toLowerCase()}`,
      targetType: 'CUSTOMER_ORDER',
      targetId: order.id,
      summary: `Order ${order.reference} moved to ${next} by ${actor}.`,
      metadata: { from: order.status, to: next },
    });

    await this.notify(
      order.id,
      order.customerAccountId,
      order.companyId,
      `order.${next.toLowerCase()}`,
      { reference: order.reference },
    );

    return this.toDetail(updated);
  }

  /** Record an in-app notification for an order event, never failing the caller. */
  private async notify(
    orderId: string,
    customerAccountId: string,
    companyId: string,
    event: string,
    variables: Record<string, string | number>,
  ) {
    try {
      await this.notifications.notify({
        companyId,
        customerAccountId,
        channel: 'IN_APP',
        category: 'order',
        templateKey: event,
        variables,
        fallbackSubject: `Order ${variables.reference ?? ''}`.trim(),
        fallbackBody: `Order ${variables.reference ?? ''} update: ${event.replace('order.', '')}.`,
        entityType: 'CUSTOMER_ORDER',
        entityId: orderId,
      });
    } catch (error) {
      this.logger.warn(`Order notification ${event} for ${orderId} failed: ${String(error)}`);
    }
  }

  private toSummary(order: {
    id: string;
    reference: string;
    status: string;
    paymentMethod: string;
    subtotalMinor: number;
    taxMinor: number;
    deliveryMinor: number;
    totalMinor: number;
    currency: string;
    placedAt: Date;
    lines: Array<{ id: string; sku: string; nameEn: string; nameAr: string; quantity: number; unitPriceMinor: number; lineTotalMinor: number }>;
  }) {
    return {
      id: order.id,
      reference: order.reference,
      status: order.status,
      paymentMethod: order.paymentMethod,
      subtotalMinor: order.subtotalMinor,
      taxMinor: order.taxMinor,
      deliveryMinor: order.deliveryMinor,
      totalMinor: order.totalMinor,
      currency: order.currency,
      placedAt: order.placedAt,
      itemCount: order.lines.reduce((sum, line) => sum + line.quantity, 0),
      lines: order.lines.map((line) => ({
        id: line.id,
        sku: line.sku,
        nameEn: line.nameEn,
        nameAr: line.nameAr,
        quantity: line.quantity,
        unitPriceMinor: line.unitPriceMinor,
        lineTotalMinor: line.lineTotalMinor,
      })),
    };
  }

  private toDetail(order: Parameters<CustomerOrderService['toSummary']>[0] & {
    addressLabel?: string | null;
    addressLine1?: string | null;
    addressLine2?: string | null;
    addressCity?: string | null;
    addressCountryCode?: string | null;
    notes?: string | null;
    cancellationReason?: string | null;
    confirmedAt?: Date | null;
    cancelledAt?: Date | null;
    completedAt?: Date | null;
    events?: Array<{ status: string; note: string | null; actor: string; createdAt: Date }>;
    paymentIntent?: { id: string; status: string; amountMinor: number; currency: string } | null;
  }) {
    return {
      ...this.toSummary(order),
      address: order.addressLine1
        ? {
            label: order.addressLabel ?? null,
            line1: order.addressLine1,
            line2: order.addressLine2 ?? null,
            city: order.addressCity ?? null,
            countryCode: order.addressCountryCode ?? null,
          }
        : null,
      notes: order.notes ?? null,
      cancellationReason: order.cancellationReason ?? null,
      confirmedAt: order.confirmedAt ?? null,
      cancelledAt: order.cancelledAt ?? null,
      completedAt: order.completedAt ?? null,
      /** True while the server would still accept a cancellation. */
      cancellable: CUSTOMER_CANCELLABLE.has(order.status),
      payment: order.paymentIntent
        ? {
            intentId: order.paymentIntent.id,
            status: order.paymentIntent.status,
            amountMinor: order.paymentIntent.amountMinor,
            currency: order.paymentIntent.currency,
          }
        : null,
      events: (order.events ?? []).map((event) => ({
        status: event.status,
        note: event.note,
        actor: event.actor,
        createdAt: event.createdAt,
      })),
    };
  }
}
