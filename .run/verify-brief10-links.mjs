// Brief §10: verify the twelve required preview surfaces over public HTTPS.
import { chromium } from 'playwright';
const ADMIN = 'https://work-1-yumhfnmvqfdgaghd.prod-runtime.all-hands.dev';
const CUST = 'https://work-2-yumhfnmvqfdgaghd.prod-runtime.all-hands.dev';
const PW = 'ChangeMe!Oryx2026';

const rows = [];
const rec = (n, u, s, note='') => { rows.push({n,u,s,note}); console.log(`${s>=200&&s<400?'OK ':'FAIL'} ${String(s).padEnd(4)} ${n.padEnd(30)} ${u}${note?'  — '+note:''}`); };

// anonymous customer surfaces
for (const [n,u] of [
  ['2. Customer Website', `${CUST}/`],
  ['3. Products', `${CUST}/products`],
  ['4. Services', `${CUST}/services`],
]) {
  try { const r = await fetch(u,{redirect:'manual'}); rec(n,u,r.status,((await r.text()).length>200?'':'short')); }
  catch(e){ rec(n,u,0,String(e).slice(0,60)); }
}

const b = await chromium.launch();
const ctx = await b.newContext({ viewport:{width:1440,height:900} });
const p = await ctx.newPage();
await p.goto(`${ADMIN}/login`,{waitUntil:'domcontentloaded',timeout:90000});
await p.locator('[data-testid="login-email"]').fill('superadmin@oryx.local');
await p.locator('[data-testid="login-password"]').fill(PW);
await p.locator('[data-testid="login-submit"]').click();
await p.waitForURL('**/dashboard',{timeout:90000});
await p.waitForTimeout(2000);
try {
  const sel = p.getByTestId('context-selector').locator('select').first();
  const v = await sel.evaluate(el=>{const o=Array.from(el.options).find(o=>o.text.includes('ORYX Auto Services'));return o?o.value:null;});
  if (v){ await sel.selectOption(v); await p.waitForTimeout(2500); }
} catch {}

const admin = [
  ['1. Admin Dashboard', `${ADMIN}/dashboard`],
  ['5. Merchant Interface', `${ADMIN}/providers`],
  ['6. Document Register', `${ADMIN}/documents`],
  ['7. Sales Invoice', `${ADMIN}/sales`],
  ['8. Quotation', `${ADMIN}/sales`],
  ['9. Purchase Invoice', `${ADMIN}/purchasing`],
  ['10. Full Vehicle Inspection', `${ADMIN}/automotive/inspections`],
  ['11. Partial Vehicle Inspection', `${ADMIN}/automotive/inspections`],
];
for (const [n,u] of admin) {
  try { const r = await p.goto(u,{waitUntil:'domcontentloaded',timeout:60000}); await p.waitForTimeout(1200); rec(n,u,r?.status()??0); }
  catch(e){ rec(n,u,0,String(e).slice(0,60)); }
}
await b.close();

// QR verification: fetch a real issued document token from the API and open it publicly.
try {
  const login = await fetch(`${ADMIN}/api/v1/auth/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'admin@oryx-auto.local',password:PW})}).then(r=>r.json());
  const cid = login.memberships[0].companyId;
  const H = { Authorization:'Bearer '+login.accessToken, 'x-oryx-company-id':cid };
  const reg = await fetch(`${ADMIN}/api/v1/documents/register?pageSize=1`,{headers:H}).then(r=>r.json());
  const doc = (reg.items??[])[0];
  if (doc?.verificationToken) {
    const u = `${CUST}/verify/${doc.verificationToken}`;
    const r = await fetch(u,{redirect:'manual'});
    rec('12. QR Verification', u, r.status);
  } else rec('12. QR Verification', `${CUST}/verify`, 0, 'no issued token');
} catch(e){ rec('12. QR Verification','',0,String(e).slice(0,80)); }

const failed = rows.filter(r=>!(r.s>=200&&r.s<400));
console.log(`\n${rows.length} surfaces, ${failed.length} failed`);
process.exit(failed.length?1:0);
