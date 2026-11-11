#!/usr/bin/env node
/**
 * Security checks for the native (ERP mobile) staff-session contract.
 *
 * Run against a live API:
 *   node scripts/verify-native-session.mjs
 *
 * These assertions are the ones the owner asked for: the browser path must not
 * change, a native session must be labelled and rotatable, MFA must not be
 * bypassable, and a revoked session must stop working.
 */
import { createHash } from 'node:crypto';

const BASE = process.env.ORYX_API ?? 'http://127.0.0.1:3001/api/v1';
const EMAIL = process.env.ORYX_VERIFY_EMAIL ?? 'superadmin@oryx.local';
const PASSWORD = process.env.ORYX_VERIFY_PASSWORD ?? 'ChangeMe!Oryx2026';

let passed = 0;
let failed = 0;

function check(name, ok, detail = '') {
  if (ok) {
    passed += 1;
    console.log(`  PASS  ${name}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

async function call(path, { method = 'GET', token, body, headers = {} } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
    redirect: 'manual',
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { status: res.status, json, raw: text, setCookie: res.headers.getSetCookie?.() ?? [] };
}

function hasCookie(cookies, name) {
  return cookies.some((c) => c.startsWith(`${name}=`));
}

console.log(`Native session verification against ${BASE}\n`);

// ---------------------------------------------------------------- browser path
console.log('Browser path must be unchanged');
{
  const res = await call('/auth/login', { method: 'POST', body: { email: EMAIL, password: PASSWORD } });
  check('browser login succeeds', res.status === 200 || res.status === 201, `status ${res.status}`);
  check('browser login never returns refreshToken in the body', !res.json?.refreshToken);
  check('browser login sets the HttpOnly refresh cookie', hasCookie(res.setCookie, 'oryx_rt'));
  const refreshCookie = res.setCookie.find((c) => c.startsWith('oryx_rt=')) ?? '';
  check('refresh cookie is HttpOnly', /HttpOnly/i.test(refreshCookie));
  check('refresh cookie is scoped to /api/v1/auth', /Path=\/api\/v1\/auth/i.test(refreshCookie));
  check('browser login still returns an access token', Boolean(res.json?.accessToken));
}

// ----------------------------------------------------------------- mobile path
console.log('\nNative path is opt-in and device-labelled');
let mobileRefresh = '';
let mobileAccess = '';
{
  const res = await call('/auth/login', {
    method: 'POST',
    body: { email: EMAIL, password: PASSWORD },
    headers: { 'x-oryx-client': 'mobile' },
  });
  check('mobile login succeeds', res.status === 200 || res.status === 201, `status ${res.status}`);
  check('mobile login returns refreshToken in the body', typeof res.json?.refreshToken === 'string');
  check('mobile login still sets the refresh cookie', hasCookie(res.setCookie, 'oryx_rt'));
  check('mobile login returns an access token', Boolean(res.json?.accessToken));
  mobileRefresh = res.json?.refreshToken ?? '';
  mobileAccess = res.json?.accessToken ?? '';
}

// An unrecognised client marker must not be treated as native.
{
  const res = await call('/auth/login', {
    method: 'POST',
    body: { email: EMAIL, password: PASSWORD },
    headers: { 'x-oryx-client': 'something-else' },
  });
  check('an unknown x-oryx-client value does not expose the token', !res.json?.refreshToken);
}

// --------------------------------------------------------------- device label
console.log('\nSession list reports the device class');
{
  const res = await call('/auth/sessions', { token: mobileAccess });
  const sessions = res.json?.sessions ?? [];
  const mobile = sessions.filter((s) => s.deviceKind === 'MOBILE');
  check('sessions endpoint responds', res.status === 200, `status ${res.status}`);
  check('the mobile session is labelled MOBILE', mobile.length >= 1);
  check('the session list never exposes a token hash', !JSON.stringify(sessions).includes('tokenHash'));
}

// ------------------------------------------------------------------- rotation
console.log('\nRotation preserves the device class and invalidates the old token');
let rotatedRefresh = '';
{
  const res = await call('/auth/refresh', {
    method: 'POST',
    body: { refreshToken: mobileRefresh },
    headers: { 'x-oryx-client': 'mobile' },
  });
  check('refresh succeeds', res.status === 200 || res.status === 201, `status ${res.status}`);
  check('refresh returns a new refresh token', typeof res.json?.refreshToken === 'string');
  check('the new token differs from the old one', res.json?.refreshToken !== mobileRefresh);
  rotatedRefresh = res.json?.refreshToken ?? '';

  const sessions = await call('/auth/sessions', { token: res.json?.accessToken });
  const rows = sessions.json?.sessions ?? [];
  check('the rotated session stays labelled MOBILE', rows.some((s) => s.deviceKind === 'MOBILE'));
}

// ------------------------------------------------------------- MFA is required
console.log('\nMFA cannot be bypassed by the mobile header');
{
  // The seeded super admin has no TOTP enrolled, so this asserts the header does
  // not itself skip the challenge step: a wrong code is still refused.
  const res = await call('/auth/mfa/verify-login', {
    method: 'POST',
    body: { challengeToken: 'not-a-real-challenge', code: '000000' },
    headers: { 'x-oryx-client': 'mobile' },
  });
  check('a forged MFA challenge is refused', res.status === 401 || res.status === 400, `status ${res.status}`);
  check('a refused MFA step issues no token', !res.json?.refreshToken && !res.json?.accessToken);
}

// ------------------------------------------------------------- revocation wins
console.log('\nA revoked session stops working');
{
  const sessions = await call('/auth/sessions', { token: mobileAccess });
  const mobile = (sessions.json?.sessions ?? []).find((s) => s.deviceKind === 'MOBILE');
  if (mobile) {
    const revoke = await call(`/auth/sessions/${mobile.id}`, { method: 'DELETE', token: mobileAccess });
    check('revoking a session succeeds', revoke.status === 200, `status ${revoke.status}`);
    const after = await call('/auth/refresh', {
      method: 'POST',
      body: { refreshToken: rotatedRefresh },
      headers: { 'x-oryx-client': 'mobile' },
    });
    check('a revoked token cannot be refreshed', after.status === 401, `status ${after.status}`);
  } else {
    check('a mobile session was found to revoke', false);
  }
}

// ------------------------------------------------------------- replay detection
console.log('\nA replayed (already rotated) token is refused');
{
  const again = await call('/auth/refresh', {
    method: 'POST',
    body: { refreshToken: mobileRefresh },
    headers: { 'x-oryx-client': 'mobile' },
  });
  check('replaying an old refresh token is refused', again.status === 401, `status ${again.status}`);
}

// ------------------------------------------------------------------ CSRF guard
console.log('\nCSRF double-submit is still enforced');
{
  const res = await fetch(`${BASE}/auth/logout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: 'oryx_rt=forged' },
    body: JSON.stringify({}),
  });
  check('an unsafe request with the refresh cookie but no CSRF header is rejected', res.status === 403, `status ${res.status}`);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
