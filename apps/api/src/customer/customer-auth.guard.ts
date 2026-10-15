import {
  CanActivate,
  ExecutionContext,
  Injectable,
  createParamDecorator,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../common/prisma.service';
import { ERROR_CODES, unauthorized } from '../common/errors';

export const CUSTOMER_PUBLIC_KEY = 'oryx:customerPublic';

/**
 * Marks a customer route as reachable without an access token (registration,
 * sign-in, password reset). It does **not** make the route public to staff
 * principals — the two pipelines are separate.
 */
export const CustomerPublic = () => SetMetadata(CUSTOMER_PUBLIC_KEY, true);

/** The resolved consumer identity, attached to the request by the guard. */
export interface CustomerPrincipal {
  accountId: string;
  email: string;
  fullName: string;
  preferredLocale: 'ar' | 'en';
  preferredTheme: 'dark' | 'light';
  /** Session id, so a single device can be signed out. */
  sessionId: string;
  /** Tenant the account's garage is registered against, when it has one. */
  defaultCompanyId: string | null;
}

export interface CustomerTokenPayload {
  sub: string;
  email: string;
  /** Audience discriminator; always `'customer'` for this pipeline. */
  typ: 'customer';
  sessionId: string;
}

interface RequestLike {
  headers: Record<string, string | string[] | undefined>;
  customer?: CustomerPrincipal;
}

export function extractBearer(req: RequestLike): string | undefined {
  const raw = req.headers['authorization'];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) return undefined;
  const [scheme, token] = value.split(' ');
  if (!scheme || scheme.toLowerCase() !== 'bearer' || !token) return undefined;
  return token;
}

/**
 * Resolves the consumer principal for the customer website and mobile app.
 *
 * This is a separate pipeline from `PrincipalGuard` on purpose. The two guards
 * read the same bearer header but validate different audiences and populate
 * different request properties, so a consumer token can never satisfy a staff
 * guard and a staff token can never satisfy this one. That separation is the
 * primary defence for vehicle ownership and marketplace isolation.
 */
@Injectable()
export class CustomerAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(CUSTOMER_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const req = context.switchToHttp().getRequest<RequestLike>();
    const token = extractBearer(req);

    if (!token) {
      if (isPublic) return true;
      throw unauthorized(ERROR_CODES.AUTH_TOKEN_INVALID, 'Missing access token.');
    }

    let payload: CustomerTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<CustomerTokenPayload>(token, {
        secret: this.config.get<string>('JWT_ACCESS_SECRET'),
      });
    } catch {
      if (isPublic) return true;
      throw unauthorized(ERROR_CODES.AUTH_TOKEN_EXPIRED, 'Access token is invalid or expired.');
    }

    // A staff token presented here must not resolve to a consumer identity.
    if (payload.typ !== 'customer') {
      throw unauthorized(
        ERROR_CODES.AUTH_TOKEN_INVALID,
        'This endpoint requires a customer account token.',
      );
    }

    const account = await this.prisma.customerAccount.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        fullName: true,
        status: true,
        preferredLocale: true,
        preferredTheme: true,
        defaultCompanyId: true,
      },
    });
    if (!account) {
      throw unauthorized(ERROR_CODES.AUTH_TOKEN_INVALID, 'Customer account no longer exists.');
    }
    if (account.status === 'SUSPENDED' || account.status === 'CLOSED') {
      throw unauthorized(ERROR_CODES.CUSTOMER_ACCOUNT_INACTIVE, 'This customer account is not active.');
    }

    req.customer = {
      accountId: account.id,
      email: account.email,
      fullName: account.fullName,
      preferredLocale: account.preferredLocale,
      preferredTheme: account.preferredTheme,
      sessionId: payload.sessionId,
      defaultCompanyId: account.defaultCompanyId,
    };
    return true;
  }
}

/**
 * Injects the authenticated consumer identity.
 *
 * Throws when no consumer is present, so a controller that forgets to guard a
 * route fails loudly at the first access instead of silently reading
 * `undefined.accountId` and returning another customer's data.
 */
export const CurrentCustomer = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): CustomerPrincipal => {
    const req = ctx.switchToHttp().getRequest<RequestLike>();
    if (!req.customer) throw new Error('Customer principal not resolved for this route');
    return req.customer;
  },
);
