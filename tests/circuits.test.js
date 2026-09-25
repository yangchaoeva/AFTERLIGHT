import {VEHICLE_LIST} from '../src/vehicle-catalog.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createTrack} from '../src/track.js';
import {createDriver,stepDriver,aiControls,resolveCars,updateRaceProgress,gridSlot} from '../src/physics.js';

for(const id of ['harbor','mountain']){
 const track=createTrack(id);
 test(`${id}: slope resists uphill acceleration and assists downhill acceleration`,()=>{
   for(const sign of [-1,1]){
     const t=Array.from({length:1000},(_,i)=>i/1000).find(t=>track.sample(t).tangent.y*sign>.08);
     assert.notEqual(t,undefined);
     const driver=createDriver(track,{t}),flatDriver=createDriver(track,{t});
     driver.speed=flatDriver.speed=20;
     stepDriver(driver,{throttle:1},track,1/60);
     stepDriver(flatDriver,{throttle:1},{...track,slopeGravity:false},1/60);
     assert.ok((flatDriver.speed-driver.speed)*sign>0);
   }
 });
 test(`${id}: closed road, finite frames, both turn directions and usable grades`,()=>{
   let left=0,right=0,maxGrade=0;
   for(let i=0;i<2400;i++){
     const s=track.sample(i/2400);
     assert.ok(Number.isFinite(s.position.length()+s.heading+s.curvature));
     assert.ok(Math.abs(s.tangent.dot(s.right))<.001);
     maxGrade=Math.max(maxGrade,Math.abs(s.tangent.y)/Math.hypot(s.tangent.x,s.tangent.z));
     if(s.curvature>.004)left++;if(s.curvature<-.004)right++;
   }
   assert.ok(left>40&&right>40);assert.ok(maxGrade<.32,`grade ${maxGrade}`);
   assert.ok(track.elevation>(id==='mountain'?240:40));
   assert.ok(track.sample(0).position.distanceTo(track.sample(1).position)<1e-7);
   console.log(`${id}: ${(track.length/1000).toFixed(2)} km, ${track.elevation.toFixed(0)} m relief, ${(maxGrade*100).toFixed(1)}% max grade`);
 });
 test(`${id}: eight AI complete two laps at all difficulties without recovery`,()=>{
   for(const difficulty of ['easy','normal','hard']){
     const drivers=Array.from({length:8},(_,i)=>createDriver(track,{id:String(i),model:VEHICLE_LIST[i%VEHICLE_LIST.length].id,...gridSlot(i,track)}));
     // Keep classified cars moving, matching live gameplay instead of freezing blockers at the finish.
     let maxStuck=0;
     for(let tick=0;tick<660*60;tick++){
       for(const d of drivers){stepDriver(d,aiControls(d,track,drivers,difficulty),track,1/60);maxStuck=Math.max(maxStuck,d.stuckTime);}
       resolveCars(drivers,track,1/60);
       drivers.forEach(d=>updateRaceProgress(d,track,(tick+1)/60,2));
       if(drivers.every(d=>d.finishTime!==null))break;
     }
     assert.ok(drivers.every(d=>d.lap===2&&d.checkpointsPassed===track.checkpoints*2),`${difficulty}: ${drivers.map(d=>`${d.lap}/${d.checkpointsPassed}`).join(',')}`);
     assert.ok(maxStuck<6,`${difficulty}: stalled ${maxStuck}`);
     console.log(`${id} ${difficulty}: last finisher ${Math.max(...drivers.map(d=>d.finishTime)).toFixed(1)} s`);
   }
 });
}
