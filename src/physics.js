import * as THREE from 'three';
import { wrap01 } from './track.js';

import {VEHICLES,getVehicle} from './vehicle-catalog.js';
export {VEHICLES} from './vehicle-catalog.js';
export const angleDelta = (a,b) => Math.atan2(Math.sin(a-b),Math.cos(a-b));
const damp=(a,b,k,dt)=>THREE.MathUtils.lerp(a,b,1-Math.exp(-k*dt));
export const steeringLimit = speed => .50/(1+Math.abs(speed)*.075+speed*speed*.003);
// +Z is forward, so camera/driver-right is local -X. Keep AI's internal
// curvature convention and convert human controls once at the boundary.
export const driverSteering = (left,right,axis=0) => left||right?Number(left)-Number(right):-axis;
export const playerSteeringLimit = speed => .72/(1+Math.abs(speed)*.065+speed*speed*.0022);

export function gridSlot(index,track){return {t:-(8+Math.floor(index/2)*14+(index%2)*1.8)/track.length,lane:(index%2?1:-1)*Math.min(3,track.width/2-2),gridIndex:index};}

export function createDriver(track,{id='player',name='你',model='aurora',t=0,lane=0,isPlayer=false,gridIndex=0}={}) {
  const s=track.sample(t);
  return {id,name,model,isPlayer,gridLane:lane,laneGoal:lane,driveTime:0,laneChangeCooldown:0,reactionDelay:.08+(gridIndex%4)*.045,position:s.position.clone().addScaledVector(s.right,lane),
    heading:s.heading,velocityHeading:s.heading,speed:0,steer:0,throttle:0,brake:0,
    slip:0,roll:0,pitch:0,handbrake:0,handbrakePulse:0,handbrakeHeld:false,t:wrap01(t),startT:t,progress:0,offset:lane,
    checkpoint:1,lastCheckpointT:wrap01(t),checkpointsPassed:0,lap:0,lapTimes:[],
    lastLapTime:0,finishTime:null,penalty:0,collisionCooldown:0,offroadTime:0,
    targetLane:lane,preferredLane:lane,stuckTime:0,respawns:0,distance:0};
}

export function resetDriver(driver,track,t=driver.t,lane=0) {
  const s=track.sample(t);
  driver.position.copy(s.position).addScaledVector(s.right,lane);
  driver.heading=s.heading;driver.velocityHeading=s.heading;
  driver.speed=0;driver.steer=0;driver.slip=0;driver.offset=lane;driver.t=wrap01(t);
  driver.offroadTime=0;driver.stuckTime=0;driver.gridLane=lane;driver.laneGoal=lane;driver.targetLane=lane;driver.driveTime=0;driver.laneChangeCooldown=0;
  driver.handbrake=0;driver.handbrakePulse=0;driver.handbrakeHeld=false;
}

export function stepDriver(d,input,track,dt) {
  d.driveTime=(d.driveTime||0)+dt;d.laneChangeCooldown=Math.max(0,(d.laneChangeCooldown||0)-dt);
  const spec=VEHICLES[d.model]||VEHICLES.aurora;
  d.throttle=THREE.MathUtils.clamp(input.throttle||0,0,1);
  d.brake=THREE.MathUtils.clamp(input.brake||0,0,1);
  d.steer=damp(d.steer,THREE.MathUtils.clamp(input.steer||0,-1,1),input.digital?10:13,dt);
  if(input.handbrake&&!d.handbrakeHeld)d.handbrakePulse=.30;
  d.handbrakeHeld=!!input.handbrake;
  d.handbrakePulse=Math.max(0,d.handbrakePulse-dt);
  d.handbrake=input.handbrake||d.handbrakePulse>0?1:0;
  if(d.handbrake)d.throttle*=.05;
  const v=Math.max(0,d.speed);
  let a=spec.acceleration*(1-.68*Math.min(1,v/spec.topSpeed))*d.throttle;
  a-=1.0+v*v*.00034+spec.braking*d.brake;
  if(track.slopeGravity)a-=9.81*track.sample(d.t).tangent.y;
  if(d.handbrake)a-=32;
  if(Math.abs(d.offset)>track.width/2-.7)a-=4+v*.10;
  d.speed=THREE.MathUtils.clamp(v+a*dt,0,spec.topSpeed);
  const wheelAngle=d.steer*(d.isPlayer?playerSteeringLimit(v):steeringLimit(v));
  const rawYaw=v*Math.tan(wheelAngle)/spec.wheelbase*spec.agility;
  const maxYaw=spec.grip/Math.max(v,7)*(d.isPlayer?1.48:1)*(d.handbrake?1.12:1);
  const yaw=THREE.MathUtils.clamp(rawYaw,-maxYaw,maxYaw);
  d.heading+=yaw*dt;
  const lag=d.handbrake?spec.handbrakeResponse:spec.slipResponse;
  d.velocityHeading+=angleDelta(d.heading,d.velocityHeading)*(1-Math.exp(-lag*dt));
  d.slip=Math.min(1,Math.abs(angleDelta(d.heading,d.velocityHeading))*4+(d.handbrake&&v>3?.48:0));
  d.speed*=1-Math.min(.23,d.slip*.09)*dt;
  d.position.x+=Math.sin(d.velocityHeading)*d.speed*dt;
  d.position.z+=Math.cos(d.velocityHeading)*d.speed*dt;
  const nearest=track.nearest(d.position,d.t);
  let delta=nearest.t-d.t;
  if(delta>.5)delta-=1;
  if(delta<-.5)delta+=1;
  d.progress+=delta;
  d.distance+=Math.max(0,delta)*track.length;
  d.t=nearest.t;d.offset=nearest.offset;
  d.position.y=nearest.position.y;
  const barrier=track.width/2-spec.halfWidth;
  if(Math.abs(d.offset)>barrier) {
    const side=Math.sign(d.offset);
    d.position.addScaledVector(nearest.right,-side*(Math.abs(d.offset)-barrier));
    const headingError=angleDelta(d.heading,nearest.heading);
    d.speed*=1-Math.min(.7,Math.abs(headingError)*.9)*Math.min(1,dt*12);
    d.heading+=angleDelta(nearest.heading,d.heading)*Math.min(1,dt*4);
    d.velocityHeading=d.heading;d.offset=side*barrier;
    d.collisionCooldown=.2;
  }
  d.collisionCooldown=Math.max(0,d.collisionCooldown-dt);
  d.stuckTime=d.speed<2&&d.throttle>.2?d.stuckTime+dt:0;
  return nearest;
}

export function aiControls(d,track,drivers,difficulty='normal') {
  const skill={easy:.70,normal:.84,hard:.98}[difficulty]||.84;
  const s=track.sample(d.t),speed=d.speed;
  const ahead=Math.max(12,speed*.85);
  const aim=track.sample(d.t+ahead/track.length);
  const launching=d.driveTime<6||(d.distance<80&&d.driveTime<10);
  let lane=launching?d.gridLane:d.laneGoal;
  let desired=(VEHICLES[d.model].topSpeed-8)*skill;
  for(let dist=8;dist<=120;dist+=14){
    const c=Math.abs(track.sample(d.t+dist/track.length).curvature);
    const safe=Math.sqrt((VEHICLES[d.model].grip*.78)/Math.max(c,.001));
    const brakingReach=Math.sqrt(safe*safe+2*13*dist);
    desired=Math.min(desired,brakingReach*skill);
  }
  const relative=other=>{let t=other.t-d.t;if(t>.5)t-=1;if(t<-.5)t+=1;return t*track.length;};
  const traffic=drivers.filter(other=>other!==d).map(other=>({other,gap:relative(other)}));
  // Keep both launch columns intact. Later, reserve a clear adjacent lane before moving.
  const leader=traffic.filter(({other,gap})=>gap>0&&gap<55&&Math.abs(other.offset-d.offset)<2.5).sort((a,b)=>a.gap-b.gap)[0];
  if(!launching&&leader&&leader.gap<38&&leader.other.speed<speed+3&&d.laneChangeCooldown===0&&Math.abs(d.offset-lane)<.7){
    const candidate=lane>=0?-Math.min(3.2,track.width/2-2):Math.min(3.2,track.width/2-2);
    const safe=traffic.every(({other,gap})=>{
      const inCorridor=Math.min(other.offset,other.targetLane)<=Math.max(d.offset,candidate)+2.5&&Math.max(other.offset,other.targetLane)>=Math.min(d.offset,candidate)-2.5;
      const rearRoom=10+Math.max(0,other.speed-speed)*1.5;
      const inTarget=Math.abs(other.offset-candidate)<2.55||Math.abs(other.targetLane-candidate)<2.55;
      return !(inCorridor&&Math.abs(gap)<6)&&(!inTarget||gap < -rearRoom||gap > Math.max(14,speed*.65));
    });
    if(safe){lane=candidate;d.laneGoal=candidate;d.laneChangeCooldown=3.5;}
  }
  for(const {other,gap} of traffic){
    if(gap<=0||gap>65)continue;
    const sharesLane=Math.abs(other.offset-d.offset)<2.55||Math.abs(other.offset-lane)<2.55;
    if(!sharesLane)continue;
    const bumperGap=gap-(getVehicle(d.model).length+getVehicle(other.model).length)/2;
    const headway=2.5+speed*(launching?.18:.65);
    desired=Math.min(desired,Math.max(0,other.speed+(bumperGap-headway)*1.25));
  }
  // Bound requested lateral velocity instead of cutting across the grid.
  d.targetLane+=THREE.MathUtils.clamp(lane-d.targetLane,-.9/60,.9/60);
  const target=aim.position.addScaledVector(aim.right,d.targetLane);
  const targetHeading=Math.atan2(target.x-d.position.x,target.z-d.position.z);
  const error=angleDelta(targetHeading,d.heading);
  const curvature=2*Math.sin(error)/ahead;
  const steer=THREE.MathUtils.clamp(Math.atan(VEHICLES[d.model].wheelbase*curvature/VEHICLES[d.model].agility)/(d.isPlayer?playerSteeringLimit(speed):steeringLimit(speed)),-1,1);
  const launchThrottle=launching?THREE.MathUtils.clamp((d.driveTime-d.reactionDelay)/.4,0,1):1;
  return {steer,throttle:THREE.MathUtils.clamp((desired-speed)*.45,0,1)*launchThrottle,brake:d.driveTime<d.reactionDelay?1:THREE.MathUtils.clamp((speed-desired)*.25,0,1)};
}

export function resolveCars(drivers,track,dt) {
  for(let i=0;i<drivers.length;i++)for(let j=i+1;j<drivers.length;j++){
    const a=drivers[i],b=drivers[j];
    const dx=b.position.x-a.position.x,dz=b.position.z-a.position.z;
    const sa=getVehicle(a.model),sb=getVehicle(b.model);
    if(dx*dx+dz*dz>((sa.length+sb.length)/2+sa.halfWidth+sb.halfWidth)**2)continue;
    const fa=new THREE.Vector3(Math.sin(a.heading),0,Math.cos(a.heading)),ra=new THREE.Vector3(fa.z,0,-fa.x);
    const fb=new THREE.Vector3(Math.sin(b.heading),0,Math.cos(b.heading)),rb=new THREE.Vector3(fb.z,0,-fb.x);
    let overlap=Infinity,normal=null;
    for(const axis of [fa,ra,fb,rb]){
      const extent=sa.length/2*Math.abs(axis.dot(fa))+sa.halfWidth*Math.abs(axis.dot(ra))+sb.length/2*Math.abs(axis.dot(fb))+sb.halfWidth*Math.abs(axis.dot(rb));
      const distance=dx*axis.x+dz*axis.z,depth=extent-Math.abs(distance);
      if(depth<=0){normal=null;break;}
      if(depth<overlap){overlap=depth;normal=axis.clone().multiplyScalar(Math.sign(distance)||1);}
    }
    if(!normal)continue;
    a.position.addScaledVector(normal,-overlap*.5);b.position.addScaledVector(normal,overlap*.5);
    if(Math.abs(normal.dot(fa))>.65){const rear=normal.dot(fa)>0?a:b,front=rear===a?b:a;if(rear.speed>front.speed){const mean=(rear.speed+front.speed)*.5;rear.speed=mean*.94;front.speed=mean;}}
    else{a.speed*=1-.18*dt;b.speed*=1-.18*dt;}
    a.collisionCooldown=.15;b.collisionCooldown=.15;
  }
}

export function updateRaceProgress(d,track,raceTime,totalLaps) {
  if(d.finishTime!==null)return null;
  // Sequential gates. A forward crossing is required; reversing over the line never earns a lap.
  const segment=track.length/track.checkpoints;
  const nextDistance=d.checkpoint*segment;
  const absolute=(d.startT+d.progress)*track.length;
  if(absolute>=nextDistance&&absolute<nextDistance+segment*.6){
    d.checkpoint++;d.checkpointsPassed++;
    if(d.checkpointsPassed%track.checkpoints===0){
      d.lap++;
      d.lapTimes.push(raceTime-d.lastLapTime);
      d.lastLapTime=raceTime;
      if(d.lap>=totalLaps){d.finishTime=raceTime+d.penalty;return 'finish';}
      return 'lap';
    }
  }
  return null;
}

export function ranking(drivers) {
  return [...drivers].sort((a,b)=>{
    if(a.finishTime!==null&&b.finishTime!==null)return a.finishTime-b.finishTime;
    if(a.finishTime!==null)return -1;if(b.finishTime!==null)return 1;
    return (b.startT+b.progress)-(a.startT+a.progress);
  });
}
