import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Authorization failures carry a machine-readable code so the admin UI can
 * localise the message instead of parsing English text.
 */
export class AppException extends HttpException {
  constructor(
    status: HttpStatus,
    public readonly code: string,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super({ statusCode: status, error: HttpStatus[status], message, code, details }, status);
  }
}

export const forbidden = (code: string, message: string, details?: Record<string, unknown>) =>
  new AppException(HttpStatus.FORBIDDEN, code, message, details);

export const notFound = (code: string, message: string) =>
  new AppException(HttpStatus.NOT_FOUND, code, message);

export const badRequest = (code: string, message: string, details?: Record<string, unknown>) =>
  new AppException(HttpStatus.BAD_REQUEST, code, message, details);

export const conflict = (code: string, message: string) =>
  new AppException(HttpStatus.CONFLICT, code, message);

export const unauthorized = (code: string, message: string) =>
  new AppException(HttpStatus.UNAUTHORIZED, code, message);

export const tooManyRequests = (code: string, message: string) =>
  new AppException(HttpStatus.TOO_MANY_REQUESTS, code, message);

export const ERROR_CODES = {
  AUTH_INVALID_CREDENTIALS: 'auth.invalid_credentials',
  AUTH_ACCOUNT_LOCKED: 'auth.account_locked',
  AUTH_ACCOUNT_INACTIVE: 'auth.account_inactive',
  AUTH_TOKEN_EXPIRED: 'auth.token_expired',
  AUTH_TOKEN_INVALID: 'auth.token_invalid',
  AUTH_REFRESH_REVOKED: 'auth.refresh_revoked',
  AUTH_INVITATION_INVALID: 'auth.invitation_invalid',
  AUTH_INVITATION_EXPIRED: 'auth.invitation_expired',
  FORBIDDEN_PERMISSION: 'authz.permission_denied',
  FORBIDDEN_TENANT: 'authz.cross_tenant_denied',
  FORBIDDEN_BRANCH: 'authz.branch_out_of_scope',
  FORBIDDEN_MODULE_NOT_LICENSED: 'authz.module_not_licensed',
  FORBIDDEN_DELEGATION: 'authz.delegation_exceeds_scope',
  FORBIDDEN_PLATFORM_ONLY: 'authz.platform_only',
  FORBIDDEN_SUPPORT_SESSION: 'authz.support_session_required',
  CSRF_TOKEN_INVALID: 'auth.csrf_token_invalid',
  MFA_REQUIRED: 'auth.mfa_required',
  MFA_INVALID_CODE: 'auth.mfa_invalid_code',
  MFA_ALREADY_ENROLLED: 'auth.mfa_already_enrolled',
  MFA_NOT_ENROLLED: 'auth.mfa_not_enrolled',
  MFA_RECOVERY_INVALID: 'auth.mfa_recovery_invalid',
  MFA_ENROLLMENT_EXPIRED: 'auth.mfa_enrollment_expired',
  PLAN_LIMIT_EXCEEDED: 'plan.limit_exceeded',
  PLAN_NOT_ACTIVE: 'plan.not_active',
  RESOURCE_NOT_FOUND: 'resource.not_found',
  RESOURCE_CONFLICT: 'resource.conflict',
  VALIDATION_FAILED: 'request.validation_failed',
} as const;
