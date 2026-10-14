/**
 * End-to-end verification of the Execution 01.1 security changes against a
 * running API instance:
 *
 *   1. login issues an HttpOnly refresh cookie and no refresh token in the body
 *   2. the refresh cookie is usable and rotates
 *   3. a state-changing request without the CSRF header is rejected
 *   4. TOTP enrollment, challenge and recovery-code login work end to end
 *   5. replaying an accepted TOTP code is rejected
 *
 * Usage: node scripts/verify-security-flow.mjs
 */

import { createHash, createHmac } from 'node:crypto';

const BASE = process.env.ORYX_API ?? 'http://localhost:3001/api/v1';
const EMAIL = process.env.SEED_SUPER_ADMIN_EMAIL ?? 'superadmin@oryx.local';
const PASSWORD = process.env.SEED_SUPER_ADMIN_PASSWORD ?? 'ChangeMe!Oryx2026';

let pass = 0;
let fail = 0;

function check(name, ok, detail = '') {
  if (ok) {
    pass += 1;
    console.log(`  PASS  ${name}`);
  } else {
    fail += 1;
    console.log(`  FAIL  ${name} ${detail}`);
  }
}

/** Minimal cookie jar so the script behaves like a browser. */
class Jar {
  constructor() {
    this.cookies = new Map();
  }
  store(res) {
    const raw = res.headers.getSetCookie?.() ?? [];
    for (const line of raw) {
      const [pair] = line.split(';');
      const idx = pair.indexOf('=');
      if (idx > 0) this.cookies.set(pair.slice(0, idx).trim(), pair.slice(idx + 1).trim());
    }
  }
  header() {
    return [...this.cookies.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
  }
  get(name) {
    return this.cookies.get(name);
  }
  rawHeader(name) {
    const line = (this.lastRaw ?? []).find((l) => l.startsWith(`${name}=`));
    return line ?? '';
  }
}

async function req(path, { method = 'GET', body, jar, token, csrf, raw } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  if (jar) headers.Cookie = jar.header();
  if (csrf) headers['x-oryx-csrf'] = csrf;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (jar) {
    jar.lastRaw = res.headers.getSetCookie?.() ?? [];
    jar.store(res);
  }
  const text = await res.text();
  let parsed = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }
  return { status: res.status, body: parsed, res };
}

/** Generate a TOTP code for a base32 secret (RFC 6238, SHA-1, 6 digits). */
function totp(secret, atMs = Date.now()) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const clean = secret.replace(/=+$/, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const out = [];
  for (const ch of clean) {
    const idx = alphabet.indexOf(ch);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  const key = Buffer.from(out);
  const step = Math.floor(atMs / 1000 / 30);
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const hmac = createHmac('sha1', key).update(counter).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return String(binary % 1_000_000).padStart(6, '0');
}

async function main() {
  console.log('ORYX security flow verification\n');

  // ---------------------------------------------------------- 1. login + cookie
  const jar = new Jar();
  const login = await req('/auth/login', { method: 'POST', body: { email: EMAIL, password: PASSWORD }, jar });

  if (login.status === 200 && login.body?.mfaRequired) {
    console.log('  NOTE  Super Admin requires MFA; completing the challenge first.\n');
    const verify = await req('/auth/mfa/verify-login', {
      method: 'POST',
      body: { challengeToken: login.body.challengeToken, code: process.env.ORYX_TOTP ?? '' },
      jar,
    });
    check('MFA challenge completes with a provided code', verify.status === 200, `status=${verify.status}`);
    if (verify.status !== 200) {
      console.log('\n  Provide ORYX_TOTP=<6-digit code> to continue the authenticated checks.');
      console.log(`\n${pass} passed, ${fail} failed`);
      process.exit(fail > 0 ? 1 : 0);
    }
  } else {
    check('login succeeds', login.status === 200, `status=${login.status}`);
  }

  const setCookie = jar.lastRaw ?? [];
  const refreshCookieLine = setCookie.find((l) => l.startsWith('oryx_rt='));
  check('refresh cookie is set', Boolean(refreshCookieLine), JSON.stringify(setCookie).slice(0, 160));
  check('refresh cookie is HttpOnly', /HttpOnly/i.test(refreshCookieLine ?? ''));
  check('refresh cookie is scoped to the auth path', /Path=\/api\/v1\/auth/i.test(refreshCookieLine ?? ''));
  check('CSRF cookie is set', Boolean(jar.get('oryx_csrf')));
  check(
    'refresh token is NOT returned in the JSON body',
    login.body?.refreshToken === undefined && login.body?.accessToken !== undefined,
  );

  const accessToken = login.body?.accessToken ?? (await req('/auth/refresh', { method: 'POST', body: {}, jar })).body
    ?.accessToken;
  const csrf = jar.get('oryx_csrf');

  // -------------------------------------------------------------- 2. refresh
  const rotated = await req('/auth/refresh', { method: 'POST', body: {}, jar, csrf });
  check('refresh with cookie + CSRF header succeeds', rotated.status === 200, `status=${rotated.status}`);
  check('refresh returns a new access token', Boolean(rotated.body?.accessToken));

  // ----------------------------------------------------------------- 3. CSRF
  const noCsrf = await req('/auth/profile', {
    method: 'PATCH',
    body: { preferredTheme: 'dark' },
    jar,
    token: rotated.body?.accessToken,
  });
  check(
    'state-changing request WITHOUT the CSRF header is rejected',
    noCsrf.status === 403 && noCsrf.body?.code === 'auth.csrf_token_invalid',
    `status=${noCsrf.status} code=${noCsrf.body?.code}`,
  );

  const withCsrf = await req('/auth/profile', {
    method: 'PATCH',
    body: { preferredTheme: 'dark' },
    jar,
    token: rotated.body?.accessToken,
    csrf: jar.get('oryx_csrf'),
  });
  check('state-changing request WITH the CSRF header succeeds', withCsrf.status === 200, `status=${withCsrf.status}`);

  // ------------------------------------------------------------------- 4. MFA
  const token = rotated.body?.accessToken ?? accessToken;
  const status = await req('/auth/mfa/status', { token, jar, csrf: jar.get('oryx_csrf') });
  check('MFA status endpoint responds', status.status === 200, `status=${status.status}`);

  if (!status.body?.enabled) {
    const enroll = await req('/auth/mfa/enroll', {
      method: 'POST',
      body: {},
      token,
      jar,
      csrf: jar.get('oryx_csrf'),
    });
    check('MFA enrollment starts and returns a QR code', enroll.status === 200 && Boolean(enroll.body?.qrDataUrl));
    check('provisioning URI uses otpauth://totp', String(enroll.body?.otpauthUri ?? '').startsWith('otpauth://totp/'));

    const secret = enroll.body?.secret;
    const code = totp(secret);
    const confirm = await req('/auth/mfa/enroll/confirm', {
      method: 'POST',
      body: { code },
      token,
      jar,
      csrf: jar.get('oryx_csrf'),
    });
    check('enrollment confirms with a valid TOTP code', confirm.status === 200, `status=${confirm.status}`);
    check('recovery codes are issued once', (confirm.body?.recoveryCodes ?? []).length === 10);

    // Replay of the same code must fail.
    const replay = await req('/auth/mfa/enroll/confirm', {
      method: 'POST',
      body: { code },
      token,
      jar,
      csrf: jar.get('oryx_csrf'),
    });
    check('replaying the enrollment code is rejected', replay.status >= 400, `status=${replay.status}`);

    // Login now requires the second factor.
    const jar2 = new Jar();
    const login2 = await req('/auth/login', { method: 'POST', body: { email: EMAIL, password: PASSWORD }, jar: jar2 });
    check('login now returns an MFA challenge', login2.status === 200 && login2.body?.mfaRequired === true);
    check('no access token is issued before the second factor', login2.body?.accessToken === undefined);

    const verify2 = await req('/auth/mfa/verify-login', {
      method: 'POST',
      body: { challengeToken: login2.body?.challengeToken, code: totp(secret, Date.now() + 31_000) },
      jar: jar2,
    });
    check('MFA login completes and issues a session', verify2.status === 200 && Boolean(verify2.body?.accessToken));

    // A recovery code works exactly once.
    const recovery = (confirm.body?.recoveryCodes ?? [])[0];
    const jar3 = new Jar();
    const login3 = await req('/auth/login', { method: 'POST', body: { email: EMAIL, password: PASSWORD }, jar: jar3 });
    const recVerify = await req('/auth/mfa/verify-login', {
      method: 'POST',
      body: { challengeToken: login3.body?.challengeToken, code: recovery },
      jar: jar3,
    });
    check('a recovery code completes the login', recVerify.status === 200, `status=${recVerify.status}`);

    const jar4 = new Jar();
    const login4 = await req('/auth/login', { method: 'POST', body: { email: EMAIL, password: PASSWORD }, jar: jar4 });
    const recReuse = await req('/auth/mfa/verify-login', {
      method: 'POST',
      body: { challengeToken: login4.body?.challengeToken, code: recovery },
      jar: jar4,
    });
    check('a used recovery code cannot be reused', recReuse.status >= 400, `status=${recReuse.status}`);
  } else {
    console.log('  NOTE  MFA already enabled; skipping enrollment assertions.');
  }

  // -------------------------------------------------------- 5. logout clears
  const logout = await req('/auth/logout', { method: 'POST', body: {}, token, jar, csrf: jar.get('oryx_csrf') });
  check('logout succeeds', logout.status === 200, `status=${logout.status}`);
  const cleared = (jar.lastRaw ?? []).filter((l) => l.startsWith('oryx_rt='));
  check(
    'logout clears the refresh cookie',
    cleared.some((l) => /oryx_rt=;/.test(l) || /Expires=Thu, 01 Jan 1970/i.test(l)),
    JSON.stringify(cleared),
  );

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
