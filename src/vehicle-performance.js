import * as THREE from 'three';
import {createDriver,stepDriver} from './physics.js';
const track={width:100,length:1e6,sample(t){return {position:new THREE.Vector3(0,0,t*1e6),right:new THREE.Vector3(1,0,0),heading:0};},nearest(p){return {...this.sample(p.z/1e6),t:p.z/1e6,offset:p.x};}};
const cache=new Map();
// Actual game-physics bench: level dry road, no steering/collisions, dt=1/120 s.
// Displayed as a simulation, not real-world or manufacturer performance.
export function simulatedPerformance(model){
  if(cache.has(model))return cache.get(model);
  const d=createDriver(track,{model}),dt=1/120;let seconds=0;
  while(d.speed<100/3.6&&seconds<30){stepDriver(d,{throttle:1},track,dt);seconds+=dt;}
  d.speed=100/3.6;const start=d.position.z;let stopTime=0;
  while(d.speed>0&&stopTime<10){stepDriver(d,{brake:1},track,dt);stopTime+=dt;}
  const result={accelerationSeconds:seconds,brakingMetres:d.position.z-start};cache.set(model,result);return result;
}
