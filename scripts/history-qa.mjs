import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const b=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist','--no-sandbox']});
const errors=[];const report={};
try{
const p=await b.newPage({viewport:{width:1440,height:900}});p.on('pageerror',e=>errors.push(e.message));
await p.addInitScript(()=>{if(!localStorage.getItem('qa-seeded')){localStorage.setItem('afterlight.records',JSON.stringify({'harbor.day.time.normal.aurora':999}));localStorage.setItem('qa-seeded','1');}});
await p.goto('http://127.0.0.1:5173/?qa');await p.waitForFunction(()=>window.__afterlight?.state==='menu',null,{timeout:90000});
report.nav=await p.locator('.topnav button').evaluateAll(a=>a.map(e=>getComputedStyle(e).color));assert.ok(report.nav.every(c=>c==='rgb(228, 183, 108)'));
await p.locator('#loading').waitFor({state:'hidden'});await p.screenshot({path:'artifacts/history/home.png'});
await p.locator('#open-history').click();assert.equal(await p.locator('.history-row').count(),0);await p.keyboard.press('Escape');
async function start(){await p.locator('#play').click();await p.locator('#mode').selectOption('time');await p.locator('#start-race').click();await p.waitForFunction(()=>__afterlight.state==='intro');await p.locator('#intro-skip').click();await p.waitForFunction(()=>__afterlight.state==='racing',null,{timeout:60000});}
await start();await p.evaluate(()=>__afterlight.qaDrive(400));await p.locator('#skip-cinema').click();assert.match(await p.locator('#record-badge').innerText(),/新纪录/);await p.waitForTimeout(1200);await p.screenshot({path:'artifacts/history/new-record.png'});
report.first=await p.evaluate(()=>JSON.parse(localStorage.getItem('afterlight.history.v1'))[0]);assert.equal(report.first.newRecord,'improved');assert.equal(report.first.previousBest,999);
await p.locator('#result-home').click();await start();await p.keyboard.press('KeyR');await p.evaluate(()=>__afterlight.qaDrive(400));await p.locator('#skip-cinema').click();assert.equal(await p.locator('#record-badge').isVisible(),false);
await p.locator('#result-home').click();await start();await p.keyboard.down('KeyW');await p.waitForTimeout(1100);await p.keyboard.up('KeyW');await p.keyboard.press('Escape');await p.locator('#quit').click();await p.locator('#open-history').click();assert.equal(await p.locator('.history-row').count(),3);report.entries=await p.evaluate(()=>JSON.parse(localStorage.getItem('afterlight.history.v1')));assert.equal(report.entries[0].status,'retired');await p.screenshot({path:'artifacts/history/history-desktop.png'});
await p.locator('#history-mode').selectOption('race');assert.equal(await p.locator('.history-row').count(),0);await p.locator('#history-mode').selectOption('all');
await p.reload();await p.waitForFunction(()=>window.__afterlight?.state==='menu',null,{timeout:90000});await p.locator('#open-history').click();assert.equal(await p.locator('.history-row').count(),3);
await p.setViewportSize({width:390,height:844});await p.screenshot({path:'artifacts/history/history-mobile.png'});report.mobileOverflow=await p.locator('#history-screen').evaluate(e=>e.scrollWidth>e.clientWidth);assert.equal(report.mobileOverflow,false);await p.locator('#history-back').click();await p.screenshot({path:'artifacts/history/home-mobile.png'});await p.locator('#open-history').click();assert.ok(await p.locator('#history-screen').isVisible());
report.errors=errors;assert.deepEqual(errors,[]);await fs.writeFile('artifacts/history/integration.json',JSON.stringify(report,null,2));console.log('PASS history, records, persistence, mobile, navigation',report.first.totalTime);
}finally{await b.close();}

