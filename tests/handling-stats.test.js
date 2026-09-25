import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createDriver,stepDriver,driverSteering} from '../src/physics.js';
import {RaceStats} from '../src/race-stats.js';
const straight={width:1000,length:10000,nearest(p){return {t:p.z/10000,offset:p.x,position:new THREE.Vector3(0,0,p.z),right:new THREE.Vector3(1,0,0),heading:0};},sample(){return {position:new THREE.Vector3(),right:new THREE.Vector3(1,0,0),heading:0};}};
test('A goes screen-left and D screen-right from behind a +Z-forward vehicle',()=>{
 for(const [left,right,sign] of [[true,false,1],[false,true,-1]]){
  const d=createDriver(straight,{isPlayer:true});d.speed=25;
  for(let i=0;i<18;i++)stepDriver(d,{steer:driverSteering(left,right),digital:true},straight,1/60);
  // Camera screen-right is -X when the camera looks along +Z.
  assert.ok(d.position.x*sign>0);assert.ok(d.heading*sign>0);
 }
 assert.equal(driverSteering(false,false,1),-1);assert.equal(driverSteering(false,false,-1),1);
});
test('player can turn a tighter radius than the prior AI steering envelope',()=>{
 const player=createDriver(straight,{isPlayer:true}),oldEnvelope=createDriver(straight,{});
 for(const d of [player,oldEnvelope])d.speed=25;
 for(let i=0;i<40;i++)for(const d of [player,oldEnvelope])stepDriver(d,{steer:1,throttle:1},straight,1/60);
 assert.ok(player.heading>oldEnvelope.heading*1.3);
});
test('a one-frame handbrake tap brakes sharply then releases; stopping stays finite',()=>{
 const d=createDriver(straight,{isPlayer:true});d.speed=30;
 stepDriver(d,{handbrake:true,throttle:1},straight,1/60);
 for(let i=0;i<17;i++)stepDriver(d,{throttle:1},straight,1/60);
 assert.ok(d.speed<22,`tap speed ${d.speed}`);assert.ok(d.slip>.3);
 for(let i=0;i<3;i++)stepDriver(d,{},straight,1/60);assert.equal(d.handbrake,0);
 for(let i=0;i<180;i++)stepDriver(d,{handbrake:true},straight,1/60);
 assert.equal(d.speed,0);assert.ok(Number.isFinite(d.heading));
});
test('statistics are time weighted, count real passes once, ignore jitter and freeze at finish',()=>{
 const stats=new RaceStats(),p={id:'p',startT:0,progress:0,speed:10},a={id:'a',startT:0,progress:.01,finishTime:null};
 stats.baseline(p,[p,a]);stats.update(p,[p,a],{length:1000},2);
 p.speed=30;stats.update(p,[p,a],{length:1000},1);assert.ok(Math.abs(stats.snapshot().average-60)<1e-8);assert.equal(stats.snapshot().top,108);
 p.progress=.014;assert.equal(stats.update(p,[p,a],{length:1000},.1),1);
 p.progress=.01;stats.update(p,[p,a],{length:1000},.1);p.progress=.014;stats.update(p,[p,a],{length:1000},.1);assert.equal(stats.overtakes,1);
 stats.finished=true;const frozen=stats.snapshot();p.speed=100;stats.update(p,[p,a],{length:1000},10);assert.deepEqual(stats.snapshot(),frozen);
});
test('reset relocation cannot generate a fake pass',()=>{
 const stats=new RaceStats(),p={id:'p',startT:0,progress:0,speed:20},a={id:'a',startT:0,progress:.01,finishTime:null};stats.baseline(p,[p,a]);
 p.progress=.02;stats.resetPosition(p,[p,a]);stats.update(p,[p,a],{length:1000},.1);assert.equal(stats.overtakes,0);
});
