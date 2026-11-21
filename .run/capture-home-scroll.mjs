import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const BASE='http://127.0.0.1:8081/mobile';
const OUT='docs/audit/exec07/splash-home';
mkdirSync(OUT,{recursive:true});
const b=await chromium.launch();
for (const theme of ['light','dark']) for (const locale of ['en','ar']) {
  const ctx=await b.newContext({viewport:{width:412,height:915},deviceScaleFactor:2,locale:locale==='ar'?'ar-SA':'en-US'});
  await ctx.addInitScript(([loc,th])=>{localStorage.setItem('oryx.marketplace.session',JSON.stringify({email:'customer@oryx.demo'}));localStorage.setItem('oryx.marketplace.locale',JSON.stringify(loc));localStorage.setItem('oryx.marketplace.theme',JSON.stringify(th));},[locale,theme]);
  const p=await ctx.newPage();
  await p.goto(`${BASE}/home`,{waitUntil:'networkidle',timeout:90000});
  await p.waitForTimeout(3500);
  // find the inner scrollable container
  const info = await p.evaluate(()=>{
    const all=[...document.querySelectorAll('div')];
    let best=null;
    for(const el of all){ if(el.scrollHeight>el.clientHeight+40){ if(!best||el.scrollHeight>best.scrollHeight) best=el; } }
    return best?{sh:best.scrollHeight,ch:best.clientHeight}:null;
  });
  console.log(theme,locale,'scroller',JSON.stringify(info));
  if(!info){ await ctx.close(); continue; }
  const steps=3;
  for(let i=0;i<steps;i++){
    await p.evaluate(([i,steps])=>{
      const all=[...document.querySelectorAll('div')];
      let best=null; for(const el of all){ if(el.scrollHeight>el.clientHeight+40){ if(!best||el.scrollHeight>best.scrollHeight) best=el; } }
      if(best) best.scrollTop = (best.scrollHeight-best.clientHeight)*(i/(steps-1));
    },[i,steps]);
    await p.waitForTimeout(900);
    await p.screenshot({path:`${OUT}/home-${theme}-${locale}-part${i+1}.png`});
    const t=(await p.locator('body').innerText()).replace(/\s+/g,' ');
    console.log('  part',i+1, t.slice(0,50));
  }
  await ctx.close();
}
await b.close();
