import {chromium} from '@playwright/test';
import fs from 'node:fs/promises';

const output='artifacts/quality-review';
const baseURL=process.env.QA_BASE_URL||'http://127.0.0.1:4180';
const vehicle=process.argv.find(value=>value.startsWith('--vehicle='))?.slice('--vehicle='.length)||'tempest';
const viewport=process.argv.includes('--mobile')?'mobile':'desktop';
const suffix=`${vehicle==='tempest'?'':`-${vehicle}`}${viewport==='mobile'?'-mobile':''}`;
const requestedQuality=process.argv.find(value=>value.startsWith('--quality='))?.slice('--quality='.length);
const qualities=requestedQuality?[requestedQuality]:['medium','native'];
await fs.mkdir(output,{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist','--disable-gpu-sandbox','--no-sandbox']});
const reports=[];
try{
  for(const quality of qualities){
    const context=await browser.newContext({viewport:viewport==='mobile'?{width:390,height:844}:{width:1280,height:720},deviceScaleFactor:viewport==='mobile'?3:2});
    await context.addInitScript(quality=>localStorage.setItem('afterlight.settings',JSON.stringify({quality,sound:false,voice:false,dynamicCamera:true,fps:true})),quality);
    const page=await context.newPage(),errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
    try{
      await page.goto(baseURL,{waitUntil:'domcontentloaded'});
      await page.waitForFunction(()=>window.__afterlight?.state==='menu',null,{timeout:90000});
      await page.locator('#loading').waitFor({state:'hidden',timeout:90000});
      await page.screenshot({path:`${output}/${quality}${suffix}-menu.png`});
      await page.locator('#open-garage').click();
      await page.locator(`[data-garage-model="${vehicle}"]`).click();
      await page.waitForFunction(vehicle=>window.__afterlight.telemetry.garage.preview===vehicle,vehicle);
      await page.waitForFunction(()=>window.__afterlight.telemetry.garage.thumbnails===6,null,{timeout:90000});
      await page.screenshot({path:`${output}/${quality}${suffix}-garage.png`});
      if(vehicle==='aurora')for(const view of ['front','wheel','rear']){
        await page.locator(`[data-garage-view="${view}"]`).click();
        await page.waitForTimeout(850);
        await page.screenshot({path:`${output}/${quality}${suffix}-${view}.png`});
      }
      await page.locator('#garage-back').click();
      await page.locator('#play').click();
      await page.locator('#circuit').selectOption('harbor');
      await page.locator('#start-race').click();
      await page.waitForFunction(()=>window.__afterlight.state==='intro',null,{timeout:90000});
      await page.keyboard.press('Space');
      await page.waitForFunction(()=>window.__afterlight.state==='racing',null,{timeout:30000});
      const frameTimes=await page.evaluate(()=>new Promise(resolve=>{
        const times=[];let last=performance.now();
        const frame=now=>{times.push(now-last);last=now;if(times.length<121)requestAnimationFrame(frame);else resolve(times.slice(1).sort((a,b)=>a-b));};
        requestAnimationFrame(frame);
      }));
      await page.screenshot({path:`${output}/${quality}${suffix}-race.png`});
      const result=await page.evaluate(()=>({canvas:[document.querySelector('#scene').width,document.querySelector('#scene').height],fpsText:document.querySelector('#fps').textContent,state:window.__afterlight.state,drawCalls:window.__afterlight.telemetry.drawCalls,triangles:window.__afterlight.telemetry.triangles}));
      reports.push({quality,...result,frameMs:{median:frameTimes[60],p95:frameTimes[114]},errors});
      if(errors.length)throw Error(`${quality}: ${errors.join('; ')}`);
    }finally{await context.close();}
  }
}finally{await browser.close();}
await fs.writeFile(`${output}/report${suffix}.json`,JSON.stringify(reports,null,2));
console.log(JSON.stringify(reports,null,2));
