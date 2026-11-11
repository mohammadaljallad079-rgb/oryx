import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { ERROR_CODES, forbidden } from '../common/errors';
import { CookieService } from './cookie.service';
import { CSRF_EXEMPT_KEY, CUSTOMER_PLANE_KEY } from './auth.decorators';

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
 * Routes marked `@CsrfExempt()` are skipped entirely. Only session-establishing
 * endpoints carry that marker: they authenticate from the request body, not
 * from the cookie, so the cookie adds no authority. Exempting them is what lets
 * a device with a stale HttpOnly refresh cookie sign in again — the browser
 * cannot clear that cookie from script, so without the exemption the guard
 * would answer 403 forever.
 *
 * Customer-plane routes are skipped: `CustomerAuthGuard`'s own cookie pair is
 * validated in the branch below, and the staff cookie must not gate them.
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(
    private readonly cookies: CookieService,
    private readonly reflector: Reflector,
    private readonly config: ConfigService,
  ) {}

  /**
   * Origin allowlist for session-establishing endpoints.
   *
   * A request with no `Origin` header (a native client, a server-to-server
   * call, or a same-origin GET-shaped POST from curl) is allowed: there is no
   * cross-site page driving it. When an `Origin` is present it must be one of
   * the configured CORS origins, which is exactly the set of first-party apps
   * that are allowed to sign a user in.
   */
  private originAllowed(req: { headers: Record<string, string | string[] | undefined> }): boolean {
    const raw = req.headers.origin;
    const origin = Array.isArray(raw) ? raw[0] : raw;
    if (!origin) return true;
    const allowed = (this.config.get<string>('CORS_ORIGINS') ?? 'http://localhost:3000')
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean);
    return allowed.includes(origin);
  }

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<{
      method: string;
      cookies?: Record<string, string>;
      headers: Record<string, string | string[] | undefined>;
    }>();

    const method = req.method.toUpperCase();
    if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return true;

    // Session-establishing endpoints authenticate from the body, so the refresh
    // cookie grants them nothing and must not be able to block them. They still
    // get an explicit Origin allowlist check, so a cross-site page cannot force
    // a login (login CSRF) even though the double-submit check is skipped.
    const isExempt = this.reflector.getAllAndOverride<boolean>(CSRF_EXEMPT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isExempt) {
      if (!this.originAllowed(req)) {
        throw forbidden(
          ERROR_CODES.CSRF_TOKEN_INVALID,
          'Request origin is not allowed for this endpoint.',
        );
      }
      return true;
    }

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
