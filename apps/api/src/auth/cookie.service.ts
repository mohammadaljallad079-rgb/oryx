import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'node:crypto';
import type { Request, Response } from 'express';

/**
 * Refresh-token cookie and CSRF double-submit handling.
 *
 * The refresh token is delivered in an HttpOnly cookie so it is never readable
 * by JavaScript and never stored in localStorage. Because the cookie is sent
 * automatically by the browser, every state-changing request must also present
 * a CSRF token that the server can verify against a second, readable cookie
 * (double-submit pattern).
 *
 * Production requires HTTPS, so `secure` is derived from NODE_ENV and can be
 * forced explicitly with COOKIE_SECURE=true (useful behind a TLS-terminating
 * proxy).
 */

export const REFRESH_COOKIE = 'oryx_rt';
export const CSRF_COOKIE = 'oryx_csrf';
export const CSRF_HEADER = 'x-oryx-csrf';

/**
 * Customer session cookies.
 *
 * Separate names from the staff pair on purpose: one browser may hold a staff
 * session for the ERP and a consumer session for the website at the same time.
 * Sharing a name would make signing out of one silently drop the other's
 * refresh token.
 */
export const CUSTOMER_REFRESH_COOKIE = 'oryx_crt';
export const CUSTOMER_CSRF_COOKIE = 'oryx_ccsrf';

/** Path is scoped to the auth routes that actually need the refresh cookie. */
const REFRESH_COOKIE_PATH = '/api/v1/auth';
const CUSTOMER_REFRESH_COOKIE_PATH = '/api/v1/customer';

export interface CookieOptions {
  httpOnly: boolean;
  secure: boolean;
  sameSite: 'lax' | 'strict' | 'none';
  path: string;
  maxAge?: number;
  domain?: string;
}

@Injectable()
export class CookieService {
  constructor(private readonly config: ConfigService) {}

  private get isProduction(): boolean {
    return (this.config.get<string>('NODE_ENV') ?? 'development') === 'production';
  }

  private secure(): boolean {
    const explicit = this.config.get<string>('COOKIE_SECURE');
    if (explicit === 'true') return true;
    if (explicit === 'false') return false;
    return this.isProduction;
  }

  /**
   * SameSite policy. `lax` keeps the cookie usable for top-level navigation
   * while blocking cross-site POSTs; `none` is required only when the admin app
   * is served from a different site than the API and must then be paired with
   * Secure. Configure with COOKIE_SAMESITE.
   */
  private sameSite(): 'lax' | 'strict' | 'none' {
    const value = (this.config.get<string>('COOKIE_SAMESITE') ?? 'lax').toLowerCase();
    if (value === 'none') {
      // SameSite=None is only honoured by browsers on Secure cookies.
      return this.secure() ? 'none' : 'lax';
    }
    if (value === 'strict') return 'strict';
    return 'lax';
  }

  private domain(): string | undefined {
    const value = this.config.get<string>('COOKIE_DOMAIN');
    return value && value.length > 0 ? value : undefined;
  }

  /** HttpOnly refresh-token cookie: never readable by JavaScript. */
  refreshCookieOptions(maxAgeSeconds: number): CookieOptions {
    return {
      httpOnly: true,
      secure: this.secure(),
      sameSite: this.sameSite(),
      path: REFRESH_COOKIE_PATH,
      maxAge: maxAgeSeconds * 1000,
      domain: this.domain(),
    };
  }

  /**
   * CSRF cookie is intentionally readable by JavaScript: the admin app echoes
   * its value in the `x-oryx-csrf` header, and the server compares the two.
   */
  csrfCookieOptions(maxAgeSeconds: number): CookieOptions {
    return {
      httpOnly: false,
      secure: this.secure(),
      sameSite: this.sameSite(),
      path: '/',
      maxAge: maxAgeSeconds * 1000,
      domain: this.domain(),
    };
  }

  /**
   * Attach the session cookies.
   *
   * `existingCsrf` keeps the double-submit token stable across a refresh. A
   * rotated token would break any request that was built before the rotation
   * landed — two tabs refreshing at once is the everyday case: the loser's
   * request still carries the pre-rotation header while the cookie jar has
   * already absorbed the new cookie, so `CsrfGuard` rejects it with a 403 and
   * the tab silently loses its session. The CSRF token is not a credential and
   * gains nothing from per-request rotation, so it is preserved for the life of
   * the session and only minted fresh at login.
   */
  setSession(res: Response, refreshToken: string, ttlSeconds: number, existingCsrf?: string): string {
    const csrfToken = existingCsrf && existingCsrf.length > 0 ? existingCsrf : randomBytes(32).toString('base64url');
    res.cookie(REFRESH_COOKIE, refreshToken, this.refreshCookieOptions(ttlSeconds));
    res.cookie(CSRF_COOKIE, csrfToken, this.csrfCookieOptions(ttlSeconds));
    return csrfToken;
  }

  clearSession(res: Response): void {
    const base = { path: REFRESH_COOKIE_PATH, domain: this.domain() };
    res.clearCookie(REFRESH_COOKIE, base);
    res.clearCookie(CSRF_COOKIE, { path: '/', domain: this.domain() });
  }

  readRefreshToken(req: Request): string | undefined {
    const cookies = (req as Request & { cookies?: Record<string, string> }).cookies;
    return cookies?.[REFRESH_COOKIE];
  }

  /** The readable CSRF cookie, used to keep the double-submit token stable. */
  readCsrfToken(req: Request): string | undefined {
    const cookies = (req as Request & { cookies?: Record<string, string> }).cookies;
    return cookies?.[CSRF_COOKIE];
  }

  // -------------------------------------------------------------- customer plane

  /** HttpOnly refresh cookie for the customer website and mobile web. */
  setCustomerSession(res: Response, refreshToken: string, ttlSeconds: number, existingCsrf?: string): string {
    const csrfToken = existingCsrf && existingCsrf.length > 0 ? existingCsrf : randomBytes(32).toString('base64url');
    res.cookie(CUSTOMER_REFRESH_COOKIE, refreshToken, {
      ...this.refreshCookieOptions(ttlSeconds),
      path: CUSTOMER_REFRESH_COOKIE_PATH,
    });
    res.cookie(CUSTOMER_CSRF_COOKIE, csrfToken, this.csrfCookieOptions(ttlSeconds));
    return csrfToken;
  }

  clearCustomerSession(res: Response): void {
    res.clearCookie(CUSTOMER_REFRESH_COOKIE, {
      path: CUSTOMER_REFRESH_COOKIE_PATH,
      domain: this.domain(),
    });
    res.clearCookie(CUSTOMER_CSRF_COOKIE, { path: '/', domain: this.domain() });
  }

  readCustomerRefreshToken(req: Request): string | undefined {
    const cookies = (req as Request & { cookies?: Record<string, string> }).cookies;
    return cookies?.[CUSTOMER_REFRESH_COOKIE];
  }

  /** The readable customer CSRF cookie, kept stable across a refresh. */
  readCustomerCsrfToken(req: Request): string | undefined {
    const cookies = (req as Request & { cookies?: Record<string, string> }).cookies;
    return cookies?.[CUSTOMER_CSRF_COOKIE];
  }

  verifyCustomerCsrf(req: Request): boolean {
    const cookies = (req as Request & { cookies?: Record<string, string> }).cookies;
    const cookieToken = cookies?.[CUSTOMER_CSRF_COOKIE];
    const raw = req.headers[CSRF_HEADER];
    const headerToken = Array.isArray(raw) ? raw[0] : raw;
    if (!cookieToken || !headerToken) return false;
    const a = createHash('sha256').update(cookieToken).digest();
    const b = createHash('sha256').update(headerToken).digest();
    return a.equals(b);
  }

  /**
   * Constant-time comparison of the CSRF header against the CSRF cookie.
   * Uses a hash so differing lengths do not short-circuit the comparison.
   */
  verifyCsrf(req: Request): boolean {
    const cookies = (req as Request & { cookies?: Record<string, string> }).cookies;
    const cookieToken = cookies?.[CSRF_COOKIE];
    const raw = req.headers[CSRF_HEADER];
    const headerToken = Array.isArray(raw) ? raw[0] : raw;
    if (!cookieToken || !headerToken) return false;
    const a = createHash('sha256').update(cookieToken).digest();
    const b = createHash('sha256').update(headerToken).digest();
    return a.equals(b);
  }
}
