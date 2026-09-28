import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
await fs.mkdir('artifacts/circuits',{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist','--disable-gpu-sandbox','--no-sandbox']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}});page.setDefaultTimeout(90000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',msg=>{if(msg.type()==='error')errors.push(msg.text());});
 await page.goto('http://127.0.0.1:5173/?qa',{waitUntil:'networkidle'});
 await page.waitForFunction(()=>window.__afterlight?.state==='menu',null,{timeout:90000});
 const reports=[];
 for(const id of ['harbor','mountain','coast']){
   await page.locator('#play').click();await page.locator('#circuit').selectOption(id);await page.screenshot({path:`artifacts/circuits/${id}-brief.png`});
   await page.locator('#theme').selectOption('day');await page.locator('#start-race').click();
   await page.waitForFunction(()=>window.__afterlight.state==='racing',null,{timeout:90000});
   assert.equal(await page.evaluate(()=>window.__afterlight.track.id),id);
   assert.deepEqual(await page.evaluate(()=>window.__afterlight.telemetry.visibleWorlds),[id]);
   for(const t of (id==='harbor'?[0,.08,.28,.48,.8]:id==='mountain'?[0,.2,.42,.64,.92]:[0])){
     await page.evaluate(t=>window.__afterlight.qaLocate(t),t);await page.waitForTimeout(300);
     await page.screenshot({path:`artifacts/circuits/${id}-${t}.png`});
   }
   // Reset for full sequential-lap test; qaLocate is only a camera inspection helper.
   await page.keyboard.press('Escape');await page.locator('#restart').click();
   await page.waitForFunction(()=>window.__afterlight.state==='racing',null,{timeout:90000});
   await page.evaluate(()=>window.__afterlight.qaDrive(660));
   const telemetry=await page.evaluate(()=>window.__afterlight.telemetry);
   assert.ok(telemetry.drivers.every(d=>d.finishTime!==null&&d.lap===2));
   await page.locator('#skip-cinema').click();await page.screenshot({path:`artifacts/circuits/${id}-results.png`});
   reports.push({id,track:await page.evaluate(()=>window.__afterlight.track),raceFinished:true});
   await page.locator('#result-home').click();
   if(id!=='coast'){
     await page.locator('#play').click();await page.locator('#theme').selectOption('night');await page.locator('#mode').selectOption('time');await page.locator('#start-race').click();
     await page.waitForFunction(()=>window.__afterlight.state==='racing',null,{timeout:90000});
     await page.keyboard.press('KeyC');await page.keyboard.press('KeyL');await page.screenshot({path:`artifacts/circuits/${id}-night.png`});
     assert.equal(await page.evaluate(()=>window.__afterlight.telemetry.lightMode),2);
     await page.keyboard.press('Escape');await page.locator('#quit').click();
     await page.locator('#showroom').click();await page.locator('#studio-back').click();
     assert.deepEqual(await page.evaluate(()=>window.__afterlight.telemetry.visibleWorlds),[id]);
     await page.locator('#play').click();await page.locator('#mode').selectOption('race');await page.locator('[data-close="race-modal"]').click();
   }
   console.log(`Verified ${id}`);
 }
 await page.setViewportSize({width:390,height:844});await page.locator('#play').click();await page.locator('#circuit').selectOption('mountain');await page.screenshot({path:'artifacts/circuits/mobile-brief.png'});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await fs.writeFile('artifacts/circuits/report.json',JSON.stringify({reports,errors},null,2));
 assert.deepEqual(errors,[]);console.log(JSON.stringify(reports));
}finally{await browser.close();}
