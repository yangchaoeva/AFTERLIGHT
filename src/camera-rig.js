import * as THREE from 'three';
// Shared by cinematic landing and live chase camera; no duplicate endpoint offsets.
export function chasePose(driver,track,far=false){
 const p=driver.position,dir=new THREE.Vector3(Math.sin(driver.heading),0,Math.cos(driver.heading)),slope=track.sample(driver.t).tangent.y;
 const distance=far?11:7.4,height=far?4.7:3;
 const position=p.clone().addScaledVector(dir,-distance);position.y+=height-slope*distance;
 const target=p.clone().addScaledVector(dir,10+driver.speed*.08);target.y+=1.1+slope*12;
 return {position,target,fov:57};
}
