import {createTrack} from './track.js';
import {createDriver,stepDriver,aiControls,resolveCars,updateRaceProgress,gridSlot} from './physics.js';
import {VEHICLE_LIST} from './vehicle-catalog.js';

export function designFingerprint(design){
 const source=JSON.stringify([design.raw,design.route,design.closed,design.scale,design.width,design.terrain,design.overrides,design.smooth]);
 let hash=2166136261;for(let i=0;i<source.length;i++)hash=Math.imul(hash^source.charCodeAt(i),16777619);
 return (hash>>>0).toString(36);
}

function raceCheckRunner(design,result){
 if(!result.geometryReady)return {advance:()=>({passed:false,reason:'道路或发车区仍有问题',point:result.issues[0]?.point||[0,0]})};
 const track=createTrack({id:design.id,knots:result.centerline,width:design.width,checkpoints:Math.max(12,Math.min(30,Math.floor(result.length/120))),sampleCount:Math.max(900,Math.min(3600,Math.ceil(result.length/2))),slopeGravity:true});
 const maxTicks=Math.ceil(Math.min(1500,Math.max(550,track.length*2/16+120))*60);
 const levels=['easy','normal','hard'];let level=0,tick=0,slowest=0;
 let drivers=Array.from({length:8},(_,i)=>createDriver(track,{id:String(i),model:VEHICLE_LIST[i%VEHICLE_LIST.length].id,...gridSlot(i,track)}));
 return {get difficulty(){return levels[level]||'done';},advance(ticks){
  for(let step=0;step<ticks;step++){
   const difficulty=levels[level];
   for(const driver of drivers){stepDriver(driver,aiControls(driver,track,drivers,difficulty),track,1/60);if(driver.stuckTime>8||driver.respawns>0)return {passed:false,reason:`${difficulty} 难度的 AI 在急弯或坡道长时间停滞`,point:[driver.position.x,driver.position.z]};}
   resolveCars(drivers,track,1/60);drivers.forEach(driver=>updateRaceProgress(driver,track,(tick+1)/60,2));tick++;
   if(drivers.every(driver=>driver.finishTime!==null)){
    slowest=Math.max(slowest,...drivers.map(d=>d.finishTime));level++;if(level===levels.length)return {passed:true,slowest};
    drivers=Array.from({length:8},(_,i)=>createDriver(track,{id:String(i),model:VEHICLE_LIST[i%VEHICLE_LIST.length].id,...gridSlot(i,track)}));tick=0;
   }else if(tick>=maxTicks){const unfinished=drivers.find(driver=>driver.finishTime===null);return {passed:false,reason:`${difficulty} 难度八车未能在合理时间内全部完成两圈`,point:[unfinished.position.x,unfinished.position.z]};}
  }
  return null;
 }};
}
export function certifyRace(design,result){const runner=raceCheckRunner(design,result);for(;;){const value=runner.advance(2000);if(value)return value;}}
export async function certifyRaceAsync(design,result,onProgress=()=>{}){const runner=raceCheckRunner(design,result);for(;;){const value=runner.advance(300);if(value)return value;onProgress(runner.difficulty);await new Promise(resolve=>setTimeout(resolve,0));}}
