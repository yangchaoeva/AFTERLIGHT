import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist','--disable-gpu-sandbox','--no-sandbox']});
const page=await browser.newPage({viewport:{width:1600,height:1000}});
const errors=[],requests=[];
page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push(r.url()));
await page.goto('http://127.0.0.1:4180/?qa',{waitUntil:'networkidle'});
await page.waitForFunction(()=>window.__afterlight?.state==='menu',null,{timeout:45000});
assert.equal(await page.evaluate(()=>typeof window.__afterlight.qaDrive),'undefined');
await page.waitForTimeout(750);await page.screenshot({path:'artifacts/preview.png'});
await page.locator('#play').click();await page.locator('#start-race').click();
await page.waitForFunction(()=>window.__afterlight.state==='racing',null,{timeout:30000});
const timing=await page.evaluate(()=>new Promise(resolve=>{
 const times=[];let previous=performance.now();
 function frame(now){times.push(now-previous);previous=now;if(times.length>=180){const samples=times.slice(1).sort((a,b)=>a-b);resolve({frames:samples.length,averageMs:samples.reduce((a,b)=>a+b,0)/samples.length,p95Ms:samples[Math.floor(samples.length*.95)]});}else requestAnimationFrame(frame);}
 requestAnimationFrame(frame);
}));
await page.keyboard.down('KeyW');await page.waitForTimeout(2000);await page.keyboard.up('KeyW');
const telemetry=await page.evaluate(()=>window.__afterlight.telemetry);
assert.ok(telemetry.drivers.at(-1).speed>5);assert.equal(telemetry.audio.state,'running');assert.equal(telemetry.audio.voices,10);
await page.keyboard.press('KeyC');await page.waitForTimeout(500);await page.screenshot({path:'artifacts/11-cockpit-camera.png'});
assert.equal(await page.evaluate(()=>window.__afterlight.telemetry.cameraLayers),5);
await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>window.__afterlight.state),'paused');
await page.locator('#quit').click();
assert.deepEqual(errors,[]);assert.ok(requests.every(url=>url.startsWith('http://127.0.0.1:4180/')||url.startsWith('data:')||url.startsWith('blob:')));
const report={timing,telemetry,errors,allRequestsLocal:true};await fs.writeFile('artifacts/production-smoke.json',JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));await browser.close();
