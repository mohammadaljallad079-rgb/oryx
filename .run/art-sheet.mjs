import { chromium } from 'playwright';
import { readdirSync } from 'fs';

const dir = 'apps/customer/public/art';
const files = readdirSync(dir).filter((f) => f.endsWith('.svg')).sort();
const cells = files
  .map(
    (f) => `<figure><img src="file:///workspace/project/oryx/${dir}/${f}" width="360"/><figcaption>${f}</figcaption></figure>`,
  )
  .join('');
const html = `<html><body style="background:#111;color:#fff;font-family:sans-serif;margin:0;padding:16px">
<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:14px">${cells}</div></body></html>`;

const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1220, height: 900 } });
await p.setContent(html, { waitUntil: 'networkidle' });
await p.waitForTimeout(600);
await p.screenshot({ path: 'docs/audit/exec07/art-contact-sheet.png', fullPage: true });
await b.close();
console.log('wrote contact sheet for', files.length, 'files');
