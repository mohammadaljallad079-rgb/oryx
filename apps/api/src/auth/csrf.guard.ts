import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ERROR_CODES, forbidden } from '../common/errors';
import { CookieService } from './cookie.service';
import { CUSTOMER_PLANE_KEY } from './auth.decorators';

/**
 * CSRF guard for cookie-authenticated, state-changing requests.
 *
 * The refresh token lives in an HttpOnly cookie, so a cross-site form post
 * could otherwise trigger a token rotation. Any unsafe method (POST, PUT,
 * PATCH, DELETE) that presents the refresh cookie must also present a matching
 * `x-oryx-csrf` header (double-submit pattern).
 *
 * Requests carrying no refresh cookie have no ambient authority to abuse and
 * are allowed through — this keeps the credential login endpoint usable while
 * still protecting rotation, logout and MFA flows.
 *
 * Customer-plane routes are skipped: `CustomerAuthGuard`'s own cookie pair is
 * validated in the branch below, and the staff cookie must not gate them.
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(
    private readonly cookies: CookieService,
    private readonly reflector: Reflector,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<{
      method: string;
      cookies?: Record<string, string>;
      headers: Record<string, string | string[] | undefined>;
    }>();

    const method = req.method.toUpperCase();
    if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return true;

    const isCustomerPlane = this.reflector.getAllAndOverride<boolean>(CUSTOMER_PLANE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // Staff plane: a presented refresh cookie needs a matching CSRF header.
    if (!isCustomerPlane) {
      if (this.cookies.readRefreshToken(req as never) && !this.cookies.verifyCsrf(req as never)) {
        throw forbidden(
          ERROR_CODES.CSRF_TOKEN_INVALID,
          'CSRF token is missing or does not match the session cookie.',
        );
      }
      return true;
    }

    // Customer plane: same rule against the separate customer cookie pair.
    if (
      this.cookies.readCustomerRefreshToken(req as never) &&
      !this.cookies.verifyCustomerCsrf(req as never)
    ) {
      throw forbidden(
        ERROR_CODES.CSRF_TOKEN_INVALID,
        'CSRF token is missing or does not match the session cookie.',
      );
    }

    return true;
  }
}
