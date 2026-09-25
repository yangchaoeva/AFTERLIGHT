import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createTrack} from '../src/track.js';
import {updateCar} from '../src/vehicle.js';

for(const id of ['coast','harbor','mountain']){
  test(`${id}: road projection stays continuous on both sides of sample vertices and across the seam`,()=>{
    const track=createTrack(id);
    for(let i=0;i<2400;i+=3){
      for(const fraction of [.2,.49,.51,.8,2.8]){
        const t=(i+fraction)/2400,p=track.sample(t).position;
        for(const hint of [t,null]){
          const nearest=track.nearest(p,hint);
          assert.ok(nearest.position.distanceTo(p)<1e-6,`road snapped at ${t}`);
          assert.ok(nearest.distance<1e-6);
        }
      }
    }
  });
}

test('body remains stable while wheels steer/rotate and brake lamps respond',()=>{
  const wheel={front:true,pivot:new THREE.Object3D(),spin:new THREE.Object3D()};
  const body=new THREE.Object3D(),brakeLight={emissiveIntensity:0};
  const car={userData:{body,wheels:[wheel],wheelRadius:.37,speed:0,brakeLights:[brakeLight]}};
  body.position.y=.003;body.rotation.x=.04;body.rotation.z=-.05;
  for(let i=0;i<180;i++){
    const speed=i<90?i*.5:(180-i)*.5;
    updateCar(car,{speed,steer:.5,brake:i>=90?1:0,time:i/60,dt:1/60});
    assert.equal(body.position.y,0);assert.equal(body.rotation.x,0);assert.equal(body.rotation.z,0);
  }
  assert.ok(wheel.spin.rotation.x>0);assert.equal(wheel.pivot.rotation.y,.22);
  assert.equal(brakeLight.emissiveIntensity,5);
});
