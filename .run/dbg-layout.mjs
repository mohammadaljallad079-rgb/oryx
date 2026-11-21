const BASE='http://127.0.0.1:3001';
const login=await (await fetch(`${BASE}/api/v1/auth/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'admin@oryx-auto.local',password:'ChangeMe!Oryx2026'})})).json();
const token=login.accessToken; const companyId=login.companyId??login.memberships?.[0]?.companyId;
const H={'Authorization':`Bearer ${token}`,'x-oryx-company-id':companyId,'Content-Type':'application/json'};
console.log('companyId',companyId);
const r=await fetch(`${BASE}/api/v1/sales/customers`,{method:'POST',headers:H,body:JSON.stringify({nameEn:'Dbg '+Date.now(),phone:'37702020',addressLine:'Villa 1455, road 5455, block 555',city:'Manama',taxNumber:'200001111222111'})});
console.log('customer POST',r.status, (await r.text()).slice(0,300));
