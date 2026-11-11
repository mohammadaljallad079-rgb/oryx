/**
 * Proves the official invoice reproduces every reference row — including the
 * data-conditional ones (Contact No., Address:, TRN) — when the counterparty
 * actually carries that data, and that the issuer TRN strip renders.
 */
const BASE='http://127.0.0.1:3001';
const login=await (await fetch(`${BASE}/api/v1/auth/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'admin@oryx-auto.local',password:'ChangeMe!Oryx2026'})})).json();
const token=login.accessToken; const companyId=login.companyId??login.memberships?.[0]?.companyId;
const H={'Authorization':`Bearer ${token}`,'x-oryx-company-id':companyId,'Content-Type':'application/json'};
const stamp=Date.now().toString().slice(-6);

// 1. give the company a TRN so the navy strip renders
const co=await (await fetch(`${BASE}/api/v1/companies/${companyId}`,{headers:H})).json();
const origTrn=co.taxNumber ?? null;
await fetch(`${BASE}/api/v1/companies/${companyId}`,{method:'PATCH',headers:H,body:JSON.stringify({taxNumber:'200001111222111'})});

// 2. a customer that carries a phone, an address and a TRN
const cust=await (await fetch(`${BASE}/api/v1/sales/customers`,{method:'POST',headers:H,body:JSON.stringify({
  nameEn:`Official layout ${stamp}`, code:`OL${stamp}`, phone:'37702020',
  addressLine:'Villa 1455, road 5455, block 555', city:'Manama', taxNumber:'200001111222111',
})})).json();
const cid=cust.id;

const prod=await (await fetch(`${BASE}/api/v1/inventory/products?pageSize=50`,{headers:H})).json();
const p=prod.items.find(x=>x.salesPriceMinor>0)??prod.items[0];
const wh=await (await fetch(`${BASE}/api/v1/inventory/warehouses?pageSize=1`,{headers:H})).json();
const wid=wh.items[0].id, bid=wh.items[0].branchId;

const si=await (await fetch(`${BASE}/api/v1/sales/invoices`,{method:'POST',headers:H,body:JSON.stringify({
  customerId:cid, warehouseId:wid, branchId:bid, documentDate:new Date().toISOString(),
  lines:[{productId:p.id,description:'Reference row probe',quantity:1000,unitPriceMinor:7500,discountPercentBp:0,taxPercentBp:1000}],
})})).json();

const iss=await (await fetch(`${BASE}/api/v1/documents/issue`,{method:'POST',headers:H,body:JSON.stringify({type:'SALES_INVOICE',sourceId:si.id})})).json();
const buf=Buffer.from(await (await fetch(`${BASE}/api/v1/documents/${iss.id}/file`,{headers:H})).arrayBuffer());
const fs=await import('node:fs');
fs.writeFileSync('/tmp/official-layout.pdf',buf);
await fetch(`${BASE}/api/v1/companies/${companyId}`,{method:'PATCH',headers:H,body:JSON.stringify({taxNumber:origTrn})});

// 3. assert the reference rows are actually printed, not just requested
const { execFileSync } = await import('node:child_process');
const text = execFileSync('python3', ['-c',
  'import pymupdf,sys;print(" ".join(p.get_text() for p in pymupdf.open("/tmp/official-layout.pdf")))'
], { encoding: 'utf8' });
const TOKENS = ['ORYX','INVOICE','Description','Quantity','Unit Price','Taxes','Amount',
  'Total','Tax','Discount','Untaxed','Payment','Staf Name','TRN','Contact No','Address',
  'Signature','Date','Villa 1455','37702020'];
const missing = TOKENS.filter((t) => !text.toLowerCase().includes(t.toLowerCase()));
console.log(JSON.stringify({customer:cid, invoice:si.invoiceNumber, issue:iss.documentNumber,
  issueId:iss.id, bytes:buf.length, tokens:`${TOKENS.length-missing.length}/${TOKENS.length}`,
  missing}, null, 0));
if (missing.length) process.exit(1);
