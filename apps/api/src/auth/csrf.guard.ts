import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ERROR_CODES, forbidden } from '../common/errors';
import { CookieService } from './cookie.service';

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
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(private readonly cookies: CookieService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<{
      method: string;
      cookies?: Record<string, string>;
      headers: Record<string, string | string[] | undefined>;
    }>();

    const method = req.method.toUpperCase();
    if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return true;

    // No refresh cookie presented => nothing ambient to protect.
    if (!this.cookies.readRefreshToken(req as never)) return true;

    if (!this.cookies.verifyCsrf(req as never)) {
      throw forbidden(
        ERROR_CODES.CSRF_TOKEN_INVALID,
        'CSRF token is missing or does not match the session cookie.',
      );
    }
    return true;
  }
}
