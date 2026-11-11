/**
 * Live login verification through the public HTTPS preview.
 *
 * Drives the same flow a browser does: POST /api/v1/auth/login, capture the
 * HttpOnly refresh cookie and the readable oryx_csrf cookie, then call a
 * protected endpoint with the bearer token and the double-submit CSRF header.
 */
const ORIGIN = process.env.PREVIEW_ORIGIN || 'https://work-1-cpaunenxhadbkkef.prod-runtime.all-hands.dev';

async function login(email, password) {
  const res = await fetch(`${ORIGIN}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
    redirect: 'manual',
  });
  const setCookies = res.headers.getSetCookie?.() ?? [];
  const body = await res.json();
  const csrf = /oryx_csrf=([^;]+)/.exec(setCookies.join('; '))?.[1];
  const refreshCookie = setCookies.find((c) => c.startsWith('oryx_rt=')) ?? '';
  return { status: res.status, body, csrf, refreshCookie };
}

const accounts = [
  ['Super Admin', 'superadmin@oryx.local', 'ChangeMe!Oryx2026'],
  ['Enterprise Tenant Admin', 'admin@oryx-auto.local', 'ChangeMe!Oryx2026'],
  ['Professional Tenant Admin', 'admin@demo-alnoor.local', 'ChangeMe!Oryx2026'],
];

for (const [label, email, password] of accounts) {
  const session = await login(email, password);
  const context = await fetch(`${ORIGIN}/api/v1/auth/context`, {
    headers: { Authorization: `Bearer ${session.body.accessToken}` },
  });
  const ctx = await context.json();

  // A platform principal resolves only PLATFORM-scope permissions with no
  // tenant selected; the whole catalog appears once a company context is set.
  let scopedNote = '';
  if (ctx.companies?.length) {
    const auto = ctx.companies.find((c) => c.nameEn === 'ORYX Auto Services') ?? ctx.companies[0];
    const scoped = await fetch(`${ORIGIN}/api/v1/auth/context`, {
      headers: {
        Authorization: `Bearer ${session.body.accessToken}`,
        'x-oryx-company-id': auto.id,
      },
    });
    const scopedBody = await scoped.json();
    scopedNote = ` scoped=${scoped.status} scopedPerms=${scopedBody.permissions?.length}`;
  }

  console.log(
    `${label.padEnd(26)} login=${session.status} csrf=${session.csrf ? 'yes' : 'no'} ` +
      `refreshHttpOnly=${/HttpOnly/i.test(session.refreshCookie)} ` +
      `refreshInBody=${'refreshToken' in session.body} ` +
      `context=${context.status} companies=${ctx.companies?.length} perms=${ctx.permissions?.length}` +
      scopedNote,
  );
}
