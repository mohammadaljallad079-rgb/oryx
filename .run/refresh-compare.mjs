import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
const BASE='http://127.0.0.1:3001';
const login=await (await fetch(`${BASE}/api/v1/auth/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'admin@oryx-auto.local',password:'ChangeMe!Oryx2026'})})).json();
const token=login.accessToken; const companyId=login.companyId??login.memberships?.[0]?.companyId;
const H={'Authorization':`Bearer ${token}`,'x-oryx-company-id':companyId,'Content-Type':'application/json'};
async function issue(type, listPath, pick){
  const list=await (await fetch(`${BASE}/api/v1${listPath}?pageSize=5`,{headers:H})).json();
  const row=pick(list.items);
  const iss=await (await fetch(`${BASE}/api/v1/documents/issue`,{method:'POST',headers:H,body:JSON.stringify({type,sourceId:row.id})})).json();
  const buf=Buffer.from(await (await fetch(`${BASE}/api/v1/documents/${iss.id}/file`,{headers:H})).arrayBuffer());
  return {number:iss.documentNumber,buf};
}
const inv=await issue('SALES_INVOICE','/sales/invoices',(x)=>x.find(r=>r.status!=='DRAFT')??x[0]);
const q=await issue('QUOTATION','/sales/quotations',(x)=>x.find(r=>r.status==='DRAFT')??x[0]);
writeFileSync(`.run/pdf-compare/invoice-${inv.number}-p1.pdf`,inv.buf);
writeFileSync(`.run/pdf-compare/quotation-${q.number}-p1.pdf`,q.buf);
console.log('invoice',inv.number,'quotation',q.number);
const b=await chromium.launch(); const p=await (await b.newContext({viewport:{width:1242,height:1756}})).newPage();
for (const [f,out] of [[`.run/pdf-compare/invoice-${inv.number}-p1.pdf`,`invoice-${inv.number}-p1.png`],[`.run/pdf-compare/quotation-${q.number}-p1.pdf`,`quotation-${q.number}-p1.png`]]) {
  await p.goto('file://'+process.cwd()+'/'+f,{waitUntil:'load'}); await p.waitForTimeout(1500);
  await p.screenshot({path:`.run/pdf-compare/${out}`,fullPage:true});
  console.log('shot',out);
}
await b.close();
