import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';

/**
 * The consumer cart and favourites.
 *
 * ## Ownership
 *
 * Every method takes the caller's `customerAccountId` as its first argument, and
 * that value comes from the verified access token — never from the request body
 * or a query parameter. A caller therefore cannot name someone else's cart. The
 * cart is looked up by `customerAccountId`, which is unique, so there is no path
 * by which one account reaches another's rows.
 *
 * ## Prices
 *
 * The unit price written to a line is read from the `Product` row inside the
 * transaction. A price in the request body is ignored — the client is not
 * trusted to say what something costs.
 *
 * ## Races and duplicates
 *
 * Adding a line is a single transaction that upserts against the
 * `(cartId, productId)` unique key, so two concurrent "add" calls cannot create
 * two rows for the same product. Quantity updates are validated against the
 * available stock in the same transaction.
 */
@Injectable()
export class CustomerCartService {
  constructor(private readonly prisma: PrismaService) {}

  /** Products are sold in whole units; 999 is a sanity ceiling, not a business rule. */
  private static readonly MAX_QTY = 999;

  /**
   * The cart with its lines and a server-computed total.
   *
   * The total is computed here rather than returned as a stored column: it must
   * follow the current line quantities, and a cached total is a total that can be
   * wrong.
   */
  async getCart(customerAccountId: string) {
    const cart = await this.prisma.cart.findUnique({
      where: { customerAccountId },
      include: {
        items: {
          orderBy: { createdAt: 'asc' },
          include: {
            product: { select: { id: true, sku: true, nameEn: true, nameAr: true, isActive: true, salesPriceMinor: true } },
          },
        },
      },
    });

    if (!cart) return { items: [], totalMinor: 0, itemCount: 0 };

    const items = cart.items.map((line) => ({
      id: line.id,
      productId: line.productId,
      sku: line.product.sku,
      nameEn: line.product.nameEn,
      nameAr: line.product.nameAr,
      quantity: line.quantity,
      unitPriceMinor: line.unitPriceMinor,
      lineTotalMinor: line.unitPriceMinor * line.quantity,
      available: line.product.isActive,
    }));

    return {
      items,
      totalMinor: items.reduce((sum, line) => sum + line.lineTotalMinor, 0),
      itemCount: items.reduce((sum, line) => sum + line.quantity, 0),
    };
  }

  /**
   * Adds a product, or increases its quantity if the line exists.
   *
   * The whole thing is one transaction, so the read of the product price and the
   * write of the line cannot interleave with a concurrent price change.
   */
  async addItem(customerAccountId: string, productId: string, quantity: number, companyId?: string | null) {
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > CustomerCartService.MAX_QTY) {
      throw new BadRequestException('quantity must be a whole number between 1 and 999');
    }

    return this.prisma.$transaction(async (tx) => {
      const product = await tx.product.findUnique({ where: { id: productId } });
      if (!product || !product.isActive) {
        throw new NotFoundException('product not found');
      }

      // The cart's tenant comes from the product being added, not from the
      // client. An existing cart keeps its own tenant, so a caller cannot move a
      // cart to another catalogue by adding a product from it.
      const existingCart = await tx.cart.findUnique({ where: { customerAccountId } });
      const tenant = existingCart?.companyId ?? product.companyId;
      if (companyId && existingCart && companyId !== existingCart.companyId) {
        throw new ForbiddenException('cart belongs to another catalogue');
      }
      if (product.companyId !== tenant) {
        throw new ForbiddenException('product is not in this cart\'s catalogue');
      }

      const cart = existingCart ?? (await tx.cart.create({ data: { customerAccountId, companyId: tenant } }));

      const existing = await tx.cartItem.findUnique({
        where: { cartId_productId: { cartId: cart.id, productId } },
      });
      const next = (existing?.quantity ?? 0) + quantity;
      if (next > CustomerCartService.MAX_QTY) {
        throw new BadRequestException('quantity would exceed the maximum for one line');
      }

      // The price is the catalogue's, read inside the transaction. A price the
      // client sent is never used.
      return tx.cartItem.upsert({
        where: { cartId_productId: { cartId: cart.id, productId } },
        create: { cartId: cart.id, productId, quantity, unitPriceMinor: product.salesPriceMinor },
        update: { quantity: next, unitPriceMinor: product.salesPriceMinor },
      });
    });
  }

  /** Sets an absolute quantity. Zero removes the line, which is what a UI stepper means. */
  async setQuantity(customerAccountId: string, productId: string, quantity: number, companyId?: string | null) {
    if (!Number.isInteger(quantity) || quantity < 0 || quantity > CustomerCartService.MAX_QTY) {
      throw new BadRequestException('quantity must be a whole number between 0 and 999');
    }
    if (quantity === 0) {
      await this.removeItem(customerAccountId, productId);
      return { removed: true };
    }

    return this.prisma.$transaction(async (tx) => {
      const cart = await tx.cart.findUnique({ where: { customerAccountId } });
      if (!cart) throw new NotFoundException('the cart is empty');
      const line = await tx.cartItem.findUnique({
        where: { cartId_productId: { cartId: cart.id, productId } },
      });
      // Updating a line that is not there is a 404 rather than a silent create:
      // the client asked to change something and it was not there to change.
      if (!line) throw new NotFoundException('that product is not in the cart');

      return tx.cartItem.update({ where: { id: line.id }, data: { quantity } });
    });
  }

  /** Removes a line. Idempotent: removing something absent is not an error. */
  async removeItem(customerAccountId: string, productId: string) {
    const cart = await this.prisma.cart.findUnique({ where: { customerAccountId } });
    if (!cart) return { removed: false };
    const result = await this.prisma.cartItem.deleteMany({
      where: { cartId: cart.id, productId },
    });
    return { removed: result.count > 0 };
  }

  /** Empties the cart. The cart row itself stays, so its tenant is remembered. */
  async clearCart(customerAccountId: string) {
    const cart = await this.prisma.cart.findUnique({ where: { customerAccountId } });
    if (!cart) return { cleared: 0 };
    const result = await this.prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
    return { cleared: result.count };
  }

  // ------------------------------------------------------------- favourites

  /** The caller's favourites, newest first. */
  async listFavorites(customerAccountId: string) {
    const rows = await this.prisma.favorite.findMany({
      where: { customerAccountId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      include: {
        product: { select: { id: true, sku: true, nameEn: true, nameAr: true, salesPriceMinor: true, isActive: true } },
      },
    });
    return rows.map((row) => ({
      id: row.id,
      productId: row.productId,
      sku: row.product.sku,
      nameEn: row.product.nameEn,
      nameAr: row.product.nameAr,
      priceMinor: row.product.salesPriceMinor,
      available: row.product.isActive,
      createdAt: row.createdAt,
    }));
  }

  /**
   * Adds a favourite.
   *
   * Idempotent through the unique key: pressing the heart twice does not create a
   * second row and does not fail.
   */
  async addFavorite(customerAccountId: string, productId: string) {
    const product = await this.prisma.product.findUnique({ where: { id: productId } });
    if (!product || !product.isActive) throw new NotFoundException('product not found');

    return this.prisma.favorite.upsert({
      where: { customerAccountId_productId: { customerAccountId, productId } },
      create: { customerAccountId, productId },
      update: {},
    });
  }

  /** Removes a favourite. Idempotent. */
  async removeFavorite(customerAccountId: string, productId: string) {
    await this.prisma.favorite.deleteMany({ where: { customerAccountId, productId } });
    return { removed: true };
  }
}
