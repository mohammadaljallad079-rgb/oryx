const BASE='http://127.0.0.1:3001/api/v1';
const login=await fetch(`${BASE}/auth/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'admin@oryx-auto.local',password:'ChangeMe!Oryx2026'})}).then(r=>r.json());
const cid=login.memberships[0].companyId;
const H={Authorization:`Bearer ${login.accessToken}`,'x-oryx-company-id':cid,'Content-Type':'application/json','x-oryx-csrf':login.csrfToken};
const get=async p=>{const r=await fetch(`${BASE}${p}`,{headers:H});let b;try{b=await r.json()}catch{b=null}return{status:r.status,body:b}};
const rec=(n,ok,d)=>console.log(`${ok===true?'PASS':ok===false?'FAIL':'??'}  ${n}  ${d??''}`);

// §5 tax
let r=await get('/tax'); rec('§5 tax list', r.status===200, `${r.body?.total} taxes`);
// §12 barcode
r=await get('/inventory/products?pageSize=5');
const pr=r.body?.items??[]; rec('§12 product list', r.status===200, `${pr.length}`);
if(pr[0]) rec('§12 barcode field', 'barcode' in pr[0], Object.keys(pr[0]).filter(k=>/barcode|image|min|reorder/i.test(k)).join(','));
r=await get('/inventory/products?search=BRAKE'); rec('§12 search by name', r.status===200, `${(r.body?.items??[]).length}`);
// §13 POS
r=await get('/sales/pos-sales'); rec('§13 POS sales', r.status===200, `${(r.body?.items??[]).length}`);
r=await get('/sales/cashier-sessions'); rec('§13 cashier sessions', r.status===200);
// §14 HR
r=await get('/hr/employees?pageSize=3'); rec('§14 employees', r.status===200, `${(r.body?.items??[]).length}`);
r=await get('/hr/attendance?pageSize=3'); rec('§14 attendance', r.status===200, `${r.status}`);
r=await get('/hr/payroll-runs?pageSize=3'); rec('§14 payroll runs', r.status===200, `${r.status}`);
// §9 companies
r=await get('/companies?pageSize=5'); rec('§9 company list', r.status===200, `${r.body?.total}`);
r=await get(`/companies/${cid}`); rec('§9 company detail', r.status===200, Object.keys(r.body??{}).filter(k=>/status|currency|rounding|tax/i.test(k)).join(','));
// §10 customers bilingual
r=await get('/sales/customers?pageSize=3');
const cu=r.body?.items??[]; rec('§10 customers', r.status===200, `${cu.length}`);
if(cu[0]) rec('§10 customer names', 'nameAr' in cu[0]&&'nameEn' in cu[0], Object.keys(cu[0]).filter(k=>/name/i.test(k)).join(','));
// §8 super admin
r=await get('/documents/register'); rec('§8 document register', r.status===200, `${(r.body?.items??r.body??[]).length}`);
// §3 document forms — check line fields
r=await get('/sales/invoices?pageSize=1');
const inv=(r.body?.items??[])[0];
rec('§3 invoice detail fields', Boolean(inv), inv?Object.keys(inv).join(','):'none');
// §11 dropdown sources
for(const p of ['/sales/customers','/purchasing/suppliers','/inventory/products','/inventory/warehouses','/hr/employees','/tax','/inventory/categories']){
  const rr=await get(p); rec(`§11 ${p}`, rr.status===200, `${rr.status}`);
}
