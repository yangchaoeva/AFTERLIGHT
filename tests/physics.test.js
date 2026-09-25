import {VEHICLE_LIST} from '../src/vehicle-catalog.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createTrack} from '../src/track.js';
import {createDriver,stepDriver,aiControls,resolveCars,updateRaceProgress,gridSlot,resetDriver,VEHICLES} from '../src/physics.js';

const track=createTrack();
test('all eight opponents finish two laps at every difficulty without recovery',()=>{
 for(const difficulty of ['easy','normal','hard']){
  const drivers=Array.from({length:8},(_,i)=>createDriver(track,{id:String(i),model:VEHICLE_LIST[i%VEHICLE_LIST.length].id,...gridSlot(i,track)}));
  // Keep classified cars moving, matching live gameplay instead of freezing blockers at the finish.
  let maxStuck=0,seconds=0;
  for(let tick=0;tick<180*60;tick++){
   seconds=(tick+1)/60;
   for(const d of drivers){stepDriver(d,aiControls(d,track,drivers,difficulty),track,1/60);maxStuck=Math.max(maxStuck,d.stuckTime);assert.ok(Number.isFinite(d.position.x+d.position.z+d.heading+d.speed));}
   resolveCars(drivers,track,1/60);
   drivers.forEach(d=>updateRaceProgress(d,track,seconds,2));
   if(drivers.every(d=>d.finishTime!==null))break;
  }
  assert.ok(drivers.every(d=>d.lap===2&&d.checkpointsPassed===24),`${difficulty}: all sequential gates and laps`);
  assert.ok(maxStuck<6,`${difficulty}: no stalled AI`);
  assert.ok(drivers.every(d=>d.finishTime>80&&d.finishTime<160));
  console.log(`${difficulty}: ${Math.min(...drivers.map(d=>d.finishTime)).toFixed(2)}–${Math.max(...drivers.map(d=>d.finishTime)).toFixed(2)} seconds`);
 }
});

test('crossing the start from a negative grid position never counts as a lap',()=>{
 const d=createDriver(track,{t:-5/track.length});
 d.progress=8/track.length;
 assert.equal(updateRaceProgress(d,track,1,1),null);assert.equal(d.lap,0);assert.equal(d.checkpoint,1);
});

test('checkpoint order prevents shortcuts and reverse crossings from awarding laps',()=>{
 const d=createDriver(track,{t:0});d.progress=.9;
 assert.equal(updateRaceProgress(d,track,10,1),null);assert.equal(d.checkpointsPassed,0);
 d.progress=1/12+.001;updateRaceProgress(d,track,11,1);assert.equal(d.checkpointsPassed,1);
 d.progress=1/12-.001;updateRaceProgress(d,track,12,1);
 d.progress=1/12+.001;updateRaceProgress(d,track,13,1);
 assert.equal(d.checkpointsPassed,1);assert.equal(d.lap,0);
});

test('single lap completes only after 12 gates and includes reset penalty',()=>{
 const d=createDriver(track,{t:0});d.penalty=3;
 for(let n=1;n<=12;n++){d.progress=n/12+.0001;updateRaceProgress(d,track,n*5,1);}
 assert.equal(d.lap,1);assert.equal(d.finishTime,63);assert.deepEqual(d.lapTimes,[60]);
 const saved=d.finishTime;updateRaceProgress(d,track,80,1);assert.equal(d.finishTime,saved);
});

test('brakes decelerate all cars and reset restores a stationary aligned vehicle',()=>{
 for(const model of Object.keys(VEHICLES)){
  const d=createDriver(track,{model,t:.08,lane:2});
  for(let i=0;i<150;i++)stepDriver(d,{throttle:1,steer:0},track,1/60);
  assert.ok(d.speed>12);
  const before=d.speed;
  for(let i=0;i<50;i++)stepDriver(d,{brake:1},track,1/60);
  assert.ok(d.speed<before*.35);
  resetDriver(d,track,.15);assert.equal(d.speed,0);assert.equal(d.offset,0);
  assert.ok(Math.abs(d.heading-track.sample(.15).heading)<1e-9);
 }
});
