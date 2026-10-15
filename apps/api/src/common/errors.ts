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

  // ------------------------------------------------------------ Execution 02
  PERIOD_NOT_OPEN: 'accounting.period_not_open',
  PERIOD_LOCKED: 'accounting.period_locked',
  UNBALANCED_ENTRY: 'accounting.unbalanced_entry',
  ACCOUNT_NOT_POSTABLE: 'accounting.account_not_postable',
  DOCUMENT_IMMUTABLE: 'erp.document_immutable',
  INSUFFICIENT_STOCK: 'inventory.insufficient_stock',
  NEGATIVE_STOCK: 'inventory.negative_stock',
  CASHIER_SESSION_CLOSED: 'pos.session_closed',
  CASHIER_SESSION_ALREADY_OPEN: 'pos.session_already_open',
  CREDIT_LIMIT_EXCEEDED: 'sales.credit_limit_exceeded',
  DOCUMENT_ALREADY_POSTED: 'erp.document_already_posted',
  OVER_ALLOCATION: 'erp.over_allocation',

  // ------------------------------------------------------------ Execution 03
  PAYROLL_ALREADY_POSTED: 'payroll.already_posted',
  PAYROLL_PERIOD_LOCKED: 'payroll.period_locked',
  PAYROLL_NO_EMPLOYEES: 'payroll.no_employees',
  PAYROLL_ALREADY_APPROVED: 'payroll.already_approved',
  LEAVE_INSUFFICIENT_BALANCE: 'hr.leave_insufficient_balance',
  LEAVE_OVERLAP: 'hr.leave_overlap',
  VEHICLE_VIN_EXISTS: 'automotive.vin_exists',
  VEHICLE_VIN_INVALID: 'automotive.vin_invalid',
  INSPECTION_ALREADY_APPROVED: 'automotive.inspection_already_approved',
  INSPECTION_NOT_COMPLETE: 'automotive.inspection_not_complete',
  JOB_CARD_STATE: 'automotive.job_card_state',
  ESTIMATE_NOT_APPROVED: 'automotive.estimate_not_approved',
  RESERVATION_ALREADY_ISSUED: 'automotive.reservation_already_issued',
  PROVIDER_NOT_APPROVED: 'marketplace.provider_not_approved',
  OPPORTUNITY_ALREADY_CONVERTED: 'crm.opportunity_already_converted',
  DUPLICATE_CUSTOMER: 'crm.duplicate_customer',

  // ------------------------------------------------------------ Execution 04
  CUSTOMER_ACCOUNT_EXISTS: 'customer.account_exists',
  CUSTOMER_ACCOUNT_INACTIVE: 'customer.account_inactive',
  CUSTOMER_RESET_INVALID: 'customer.reset_invalid',
  CUSTOMER_RESET_EXPIRED: 'customer.reset_expired',
  CUSTOMER_OWNERSHIP_DENIED: 'customer.ownership_denied',
  CUSTOMER_VEHICLE_LIMIT: 'customer.vehicle_limit',
  BOOKING_SLOT_UNAVAILABLE: 'booking.slot_unavailable',
  BOOKING_OUTSIDE_HOURS: 'booking.outside_hours',
  BOOKING_CLOSED: 'booking.closed',
  BOOKING_STATE: 'booking.invalid_state',
  BOOKING_HOLD_EXPIRED: 'booking.hold_expired',
  BOOKING_NOTICE_REQUIRED: 'booking.notice_required',
  PAYMENT_INTENT_NOT_FOUND: 'payment.intent_not_found',
  PAYMENT_ALREADY_SUCCEEDED: 'payment.already_succeeded',
  PAYMENT_IDEMPOTENT_REPLAY: 'payment.idempotent_replay',
  PAYMENT_INVALID_SIGNATURE: 'payment.invalid_signature',
  PAYMENT_PROVIDER_NOT_CONFIGURED: 'payment.provider_not_configured',
  PAYMENT_REFUND_EXCEEDS: 'payment.refund_exceeds_amount',
  PAYMENT_AMOUNT_MISMATCH: 'payment.amount_mismatch',
  REVIEW_ALREADY_SUBMITTED: 'marketplace.review_already_submitted',
  REVIEW_INVALID_RATING: 'marketplace.review_invalid_rating',
  REVIEW_NOT_ELIGIBLE: 'marketplace.review_not_eligible',
  DISPUTE_STATE: 'marketplace.dispute_invalid_state',
  APPLICATION_STATE: 'marketplace.application_invalid_state',
  APPLICATION_ALREADY_REVIEWED: 'marketplace.application_already_reviewed',
  APPLICATION_PENDING: 'marketplace.application_pending',
  PROVIDER_SCOPE_DENIED: 'marketplace.provider_scope_denied',
  PROVIDER_STATE: 'marketplace.provider_invalid_state',
  REQUEST_STATE: 'marketplace.request_invalid_state',
  REQUEST_ALREADY_ASSIGNED: 'marketplace.request_already_assigned',
  SETTLEMENT_STATE: 'marketplace.settlement_invalid_state',
  PAYMENT_STATE: 'payment.invalid_state',
  NOTIFICATION_CHANNEL_UNAVAILABLE: 'notification.channel_unavailable',
} as const;
