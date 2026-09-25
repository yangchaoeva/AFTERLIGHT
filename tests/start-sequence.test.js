import test from 'node:test';import assert from 'node:assert/strict';import * as THREE from 'three';
import {createTrack} from '../src/track.js';import {VEHICLE_LIST} from '../src/vehicle-catalog.js';import {createDriver,aiControls,stepDriver,resolveCars,gridSlot} from '../src/physics.js';import {introPose,INTRO_DURATION} from '../src/race-intro.js';import {chasePose} from '../src/camera-rig.js';
for(const id of ['coast','harbor','mountain']){
 const track=createTrack(id);
 test(`${id}: eight mixed cars launch without contact or merging columns`,()=>{for(const difficulty of ['easy','normal','hard']){
 const ds=Array.from({length:8},(_,i)=>createDriver(track,{id:String(i),model:VEHICLE_LIST[(i+2)%5].id,...gridSlot(i,track)}));let pushes=0;
 for(let tick=0;tick<6*60;tick++){for(const d of ds)stepDriver(d,aiControls(d,track,ds,difficulty),track,1/60);const before=ds.map(d=>d.position.clone());resolveCars(ds,track,1/60);ds.forEach((d,i)=>{if(before[i].distanceTo(d.position)>1e-6)pushes++;assert.ok(Math.abs(d.targetLane-d.gridLane)<1e-8);assert.equal(Math.sign(d.offset),Math.sign(d.gridLane));});}
 assert.equal(pushes,0,`${difficulty}: collision corrections`);assert.ok(ds.every(d=>d.distance>30));console.log(id,difficulty,'contact-free launch');
 }});
 test(`${id}: cinematic endpoint exactly matches live third-person pose`,()=>{for(const index of [0,7]){const d=createDriver(track,{...gridSlot(index,track)}),end=chasePose(d,track),pose=introPose(track,INTRO_DURATION,16/9,end);assert.ok(pose.position.distanceTo(end.position)<1e-7);assert.ok(pose.target.distanceTo(end.target)<1e-7);assert.equal(pose.fov,end.fov);const before=introPose(track,INTRO_DURATION-1/60,16/9,end);assert.ok(before.position.distanceTo(end.position)<.12);}});
}
test('AI queues behind a stationary car rather than launching into it',()=>{const track=createTrack('harbor'),lead=createDriver(track,{...gridSlot(0,track)}),follower=createDriver(track,{...gridSlot(2,track)});for(let i=0;i<6*60;i++){stepDriver(follower,aiControls(follower,track,[lead,follower]),track,1/60);const before=follower.position.clone();resolveCars([lead,follower],track,1/60);assert.ok(before.distanceTo(follower.position)<1e-6);}assert.ok(follower.speed<.5);});
