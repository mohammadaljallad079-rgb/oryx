/**
 * Jest setup for the API integration suites.
 *
 * The suites perform many logins in a short window, so the login rate limiter
 * would otherwise return 429 and mask real failures. The limiter itself is
 * still exercised: a dedicated suite asserts the 429 behaviour with a low
 * limit.
 */
process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';
process.env.AUTH_THROTTLE_LIMIT = '100000';
process.env.THROTTLE_LIMIT = '1000000';

// Required so the MFA secret cipher can be constructed at boot.
process.env.MFA_ENCRYPTION_KEY =
  process.env.MFA_ENCRYPTION_KEY ?? 'test-mfa-encryption-key-min-32-characters-xyz';
