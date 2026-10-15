import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { CookieService } from '../auth/cookie.service';
import { CustomerAuthService } from './customer-auth.service';
import {
  CurrentCustomer,
  CustomerAuthGuard,
  CustomerPublic,
  type CustomerPrincipal,
} from './customer-auth.guard';
import {
  CustomerChangePasswordDto,
  CustomerForgotPasswordDto,
  CustomerLoginDto,
  CustomerMfaCodeDto,
  CustomerMfaVerifyLoginDto,
  CustomerRefreshDto,
  CustomerRegisterDto,
  CustomerResetPasswordDto,
  UpdateCustomerProfileDto,
} from './customer.dto';
import { ERROR_CODES, notFound } from '../common/errors';
import { CustomerPlane } from '../auth/auth.decorators';

interface RequestLike {
  headers: Record<string, string | string[] | undefined>;
  ip?: string;
  cookies?: Record<string, string>;
  customer?: CustomerPrincipal;
}

function meta(req: RequestLike) {
  const ua = req.headers['user-agent'];
  return { ip: req.ip, userAgent: Array.isArray(ua) ? ua[0] : ua };
}

/**
 * Consumer authentication for the customer website and mobile application.
 *
 * The refresh token is delivered in an HttpOnly cookie scoped to
 * `/api/v1/customer`, exactly as the staff plane does, and the body only carries
 * the short-lived access token. A native mobile client that cannot use cookies
 * may read `refreshToken` from the response body and store it in the platform
 * keychain; the web client never sees it.
 */
@ApiTags('customer-auth')
@CustomerPlane()
@Controller('customer/auth')
@UseGuards(CustomerAuthGuard)
export class CustomerAuthController {
  constructor(
    private readonly auth: CustomerAuthService,
    private readonly cookies: CookieService,
  ) {}

  private refreshTtlSeconds(): number {
    return Number(process.env.JWT_REFRESH_TTL ?? 2592000);
  }

  /** Attach cookies and hide the refresh token from browser clients. */
  private complete<T extends { refreshToken?: string; csrfToken?: string }>(
    res: Response,
    session: T,
    exposeRefreshToken: boolean,
  ): Omit<T, 'refreshToken'> | T {
    if (session.refreshToken) {
      session.csrfToken = this.cookies.setCustomerSession(res, session.refreshToken, this.refreshTtlSeconds());
      if (!exposeRefreshToken) delete session.refreshToken;
    }
    return session;
  }

  private wantsBodyToken(req: RequestLike): boolean {
    const raw = req.headers['x-oryx-client'];
    const value = Array.isArray(raw) ? raw[0] : raw;
    return value === 'mobile';
  }

  @CustomerPublic()
  @Throttle({ default: { limit: Number(process.env.AUTH_THROTTLE_LIMIT ?? 10), ttl: 60_000 } })
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Register a customer account' })
  async register(
    @Body() dto: CustomerRegisterDto,
    @Req() req: RequestLike,
    @Res({ passthrough: true }) res: Response,
  ) {
    const session = await this.auth.register({ ...dto, meta: meta(req) });
    return this.complete(res, session, this.wantsBodyToken(req));
  }

  @CustomerPublic()
  @Throttle({ default: { limit: Number(process.env.AUTH_THROTTLE_LIMIT ?? 10), ttl: 60_000 } })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sign in; returns an MFA challenge when TOTP is enabled' })
  async login(
    @Body() dto: CustomerLoginDto,
    @Req() req: RequestLike,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.login(dto.email, dto.password, meta(req));
    if ('mfaRequired' in result) return result;
    return this.complete(res, result, this.wantsBodyToken(req));
  }

  @CustomerPublic()
  @Throttle({ default: { limit: Number(process.env.AUTH_THROTTLE_LIMIT ?? 10), ttl: 60_000 } })
  @Post('mfa/verify-login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Complete sign-in by verifying a TOTP code' })
  async verifyMfaLogin(
    @Body() dto: CustomerMfaVerifyLoginDto,
    @Req() req: RequestLike,
    @Res({ passthrough: true }) res: Response,
  ) {
    const session = await this.auth.loginWithMfa(dto.challengeToken, dto.code, meta(req));
    return this.complete(res, session, this.wantsBodyToken(req));
  }

  @CustomerPublic()
  @Throttle({ default: { limit: Number(process.env.REFRESH_THROTTLE_LIMIT ?? 120), ttl: 60_000 } })
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rotate the customer refresh token' })
  async refresh(
    @Body() dto: CustomerRefreshDto,
    @Req() req: RequestLike,
    @Res({ passthrough: true }) res: Response,
  ) {
    const token = this.cookies.readCustomerRefreshToken(req as never) ?? dto.refreshToken;
    if (!token) {
      throw notFound(ERROR_CODES.AUTH_TOKEN_INVALID, 'No refresh token was presented.');
    }
    const session = await this.auth.refresh(token, meta(req));
    return this.complete(res, session, this.wantsBodyToken(req));
  }

  @CustomerPublic()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Sign out of the current session' })
  async logout(
    @Body() dto: CustomerRefreshDto,
    @Req() req: RequestLike,
    @Res({ passthrough: true }) res: Response,
  ) {
    const token = this.cookies.readCustomerRefreshToken(req as never) ?? dto.refreshToken;
    await this.auth.logout(token);
    this.cookies.clearCustomerSession(res);
  }

  @CustomerPublic()
  @Throttle({ default: { limit: Number(process.env.AUTH_THROTTLE_LIMIT ?? 10), ttl: 60_000 } })
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request a password reset link' })
  async forgotPassword(@Body() dto: CustomerForgotPasswordDto, @Req() req: RequestLike) {
    const result = await this.auth.requestPasswordReset(dto.email, meta(req));
    // The response is identical whether or not the address is registered, so
    // the endpoint cannot be used to enumerate accounts. The token is surfaced
    // only outside production, where the email adapter is not configured.
    const body: Record<string, unknown> = { requested: true };
    if (process.env.NODE_ENV !== 'production' && result.token) {
      body.resetToken = result.token;
      body.note = 'Returned only in non-production because no email provider is configured.';
    }
    return body;
  }

  @CustomerPublic()
  @Throttle({ default: { limit: Number(process.env.AUTH_THROTTLE_LIMIT ?? 10), ttl: 60_000 } })
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Complete a password reset' })
  async resetPassword(@Body() dto: CustomerResetPasswordDto) {
    await this.auth.resetPassword(dto.token, dto.password);
    return { reset: true };
  }

  @ApiBearerAuth()
  @Get('me')
  @ApiOperation({ summary: 'Current customer profile' })
  async me(@CurrentCustomer() customer: CustomerPrincipal) {
    return this.auth.getProfile(customer.accountId);
  }

  @ApiBearerAuth()
  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Change the account password; revokes all sessions' })
  async changePassword(
    @CurrentCustomer() customer: CustomerPrincipal,
    @Body() dto: CustomerChangePasswordDto,
  ) {
    await this.auth.changePassword(customer.accountId, dto.currentPassword, dto.newPassword);
    return { changed: true };
  }

  @ApiBearerAuth()
  @Post('logout-all')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sign out of every device' })
  async logoutAll(@CurrentCustomer() customer: CustomerPrincipal) {
    const count = await this.auth.logoutAll(customer.accountId);
    return { revokedSessions: count };
  }

  @ApiBearerAuth()
  @Get('sessions')
  @ApiOperation({ summary: 'List active sessions' })
  async sessions(@CurrentCustomer() customer: CustomerPrincipal) {
    return this.auth.listSessions(customer.accountId);
  }

  @ApiBearerAuth()
  @Post('mfa/enroll')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Begin TOTP enrollment' })
  async enrollMfa(@CurrentCustomer() customer: CustomerPrincipal) {
    return this.auth.beginMfaEnrollment(customer.accountId);
  }

  @ApiBearerAuth()
  @Post('mfa/confirm')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Activate TOTP enrollment by verifying a code' })
  async confirmMfa(@CurrentCustomer() customer: CustomerPrincipal, @Body() dto: CustomerMfaCodeDto) {
    return this.auth.confirmMfaEnrollment(customer.accountId, dto.code);
  }

  @ApiBearerAuth()
  @Post('mfa/disable')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Disable TOTP (requires the account password)' })
  async disableMfa(
    @CurrentCustomer() customer: CustomerPrincipal,
    @Body() dto: CustomerChangePasswordDto,
  ) {
    await this.auth.disableMfa(customer.accountId, dto.currentPassword);
    return { mfaEnabled: false };
  }

  @ApiBearerAuth()
  @Post('profile')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update the customer profile and locale/theme preferences' })
  async updateProfile(
    @CurrentCustomer() customer: CustomerPrincipal,
    @Body() dto: UpdateCustomerProfileDto,
  ) {
    return this.auth.updateProfile(customer.accountId, dto);
  }
}
