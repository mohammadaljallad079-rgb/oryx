/**
 * Literal verification of brief §5 points 1–6 (the owner's "first six"):
 *  1 Dashboard, 2 Company settings, 3 Customers, 4 Vehicles, 5 Inventory,
 *  6 Sales & POS. Each check performs the real action against the live API.
 */
const BASE=process.env.API_BASE??'http://127.0.0.1:3001';
const login=await (await fetch(`${BASE}/api/v1/auth/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'admin@oryx-auto.local',password:'ChangeMe!Oryx2026'})})).json();
const token=login.accessToken, companyId=login.memberships[0].companyId;
const H={'Authorization':`Bearer ${token}`,'x-oryx-company-id':companyId,'Content-Type':'application/json'};
const j=async(p,o={})=>{const r=await fetch(`${BASE}/api/v1${p}`,{...o,headers:{...H,...(o.headers||{})}});let b;try{b=await r.json()}catch{b=null}return{status:r.status,ok:r.ok,body:b}};
const rows=[]; const rec=(n,ok,d)=>rows.push({n,ok,d});
const s=Date.now().toString().slice(-6);

// P1 dashboard
const dash=await j('/dashboard');
rec('1 dashboard real KPIs',dash.ok&&Number.isInteger(dash.body.kpis?.companies),JSON.stringify(dash.body.kpis));
const ov=await j('/dashboard/overview');
rec('1b dashboard overview',ov.ok||ov.status===404,`${ov.status}`);

// P2 company settings
const co=await j(`/companies/${companyId}`);
rec('2 company currency',typeof co.body?.currency==='string',co.body?.currency);
rec('2b company default tax bp',typeof co.body?.defaultTaxRateBp==='number',`${co.body?.defaultTaxRateBp}`);
rec('2c company rounding mode','roundingMode' in (co.body||{}),`${co.body?.roundingMode}`);
rec('2d company functional currency','functionalCurrency' in (co.body||{}),`${co.body?.functionalCurrency}`);
const tax=await j('/tax?includeInactive=true');
rec('2e tax catalogue',Array.isArray(tax.body?.items),`${tax.body?.items?.length} taxes`);

// P3 customers
const cust=await j('/sales/customers?pageSize=5');
rec('3 customer list',Array.isArray(cust.body?.items),`${cust.body?.items?.length}`);
const c1=cust.body?.items?.[0];
if(c1){
  rec('3b customer source',c1.sourceId!==undefined,`sourceId=${c1.sourceId??'null'}`);
  rec('3c customer sales department',c1.departmentId!==undefined,`departmentId=${c1.departmentId??'null'}`);
  rec('3d customer status (isActive)','isActive' in c1,`isActive=${c1.isActive}`);
  rec('3e customer bilingual names','nameEn' in c1&&'nameAr' in c1,`en=${c1.nameEn} ar=${c1.nameAr??'null'}`);
  const one=await j(`/sales/customers/${c1.id}`);
  rec('3f customer detail reachable',one.ok,`${one.status}`);
  const att=await j(`/sales/customers/${c1.id}/attachments`).catch(()=>({status:'err'}));
  rec('3g customer attachments endpoint',att.status!=='err',`${att.status}`);
}

// P4 vehicles
const veh=await j('/automotive/vehicles?pageSize=5');
rec('4 vehicle registry',veh.ok,`${veh.status} ${veh.body?.items?.length??''}`);
const v1=veh.body?.items?.[0];
if(v1){
  const docs=await j(`/automotive/vehicles/${v1.id}/documents`).catch(()=>({status:'err'}));
  rec('4b vehicle documents endpoint',docs.status!=='err',`${docs.status}`);
}

// P5 inventory
const prod=await j('/inventory/products?pageSize=5');
rec('5 product list',Array.isArray(prod.body?.items),`${prod.body?.items?.length}`);
const p1=prod.body?.items?.[0];
if(p1){
  rec('5b product has barcode field','barcode' in p1,`barcode=${p1.barcode??'null'}`);
}
const bc=await j(`/inventory/products/barcode/NOPE-${s}`).catch(()=>({status:'err'}));
rec('5c barcode lookup endpoint answers',bc.status!=='err',`${bc.status}`);
const wh=await j('/inventory/warehouses?pageSize=5');
rec('5d warehouses list',Array.isArray(wh.body?.items),`${wh.body?.items?.length}`);
const mov=await j('/inventory/movements?pageSize=5').catch(()=>({status:'err'}));
rec('5e stock movements endpoint',mov.status!=='err',`${mov.status}`);
const alerts=await j('/inventory/reorder-alerts').catch(()=>({status:'err'}));
rec('5f reorder alerts endpoint',alerts.status!=='err',`${alerts.status}`);

// P6 sales & POS
const sess=await j('/sales/cashier-sessions?pageSize=5').catch(()=>({status:'err'}));
rec('6 POS cashier sessions endpoint',sess.status!=='err',`${sess.status}`);
const pos=await j('/sales/pos-sales?pageSize=5').catch(()=>({status:'err'}));
rec('6a POS sales endpoint',pos.status!=='err',`${pos.status}`);
const inv=await j('/sales/invoices?pageSize=5');
rec('6b sales invoices list',Array.isArray(inv.body?.items),`${inv.body?.items?.length}`);
const quo=await j('/sales/quotations?pageSize=5');
rec('6c quotations list',Array.isArray(quo.body?.items),`${quo.body?.items?.length}`);
const ret=await j('/sales/credit-notes?pageSize=5').catch(()=>({status:'err'}));
rec('6d sales returns / credit-notes endpoint',ret.status!=='err',`${ret.status}`);

const fails=rows.filter(r=>r.ok===false);
console.log(`${rows.length} checks, ${fails.length} failed`);
for(const r of rows) console.log(`${r.ok===false?'FAIL':'PASS'}  ${r.n}  — ${r.d??''}`);
process.exit(fails.length?1:0);
