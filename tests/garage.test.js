import test from 'node:test';
import assert from 'node:assert/strict';
import {GarageSelection,normalizeGarage} from '../src/garage-state.js';
import {VEHICLE_LIST,GARAGE_VEHICLE_LIST,GREEN_BUG_ID,VEHICLES} from '../src/vehicle-catalog.js';
import {createCar,updateCar,setCarLightMode} from '../src/vehicle.js';
import {disposeVehicle} from '../src/showroom-scene.js';
import {simulatedPerformance} from '../src/vehicle-performance.js';
test('garage transactions cancel drafts, confirm only current paint, and sanitize storage',()=>{
 const g=new GarageSelection();g.select('nightslash');g.color('#123456');g.cancel();assert.equal(g.preview,'aurora');assert.notEqual(g.colors.nightslash,'#123456');
 g.select('nightslash');g.color('#123456');g.confirm();g.select('tempest');g.color('#654321');g.confirm();assert.equal(g.saved.colors.nightslash,'#123456');assert.equal(g.saved.colors.tempest,'#654321');
 g.move(1);assert.equal(g.preview,GREEN_BUG_ID);g.move(-1);assert.equal(g.preview,'tempest');g.select('empty');assert.equal(g.preview,'tempest');assert.equal(normalizeGarage({selected:'bad',colors:{aurora:'javascript:'}}).selected,'aurora');
});
test('Green Bug is selectable in both showrooms, keeps Aurora physics tuning, and stays out of the AI fleet',()=>{
 const g=new GarageSelection();g.begin(GREEN_BUG_ID);assert.equal(g.preview,GREEN_BUG_ID);assert.equal(VEHICLES[GREEN_BUG_ID].wheelbase,VEHICLES.aurora.wheelbase);assert.equal(VEHICLES[GREEN_BUG_ID].length,VEHICLES.aurora.length);assert.equal(VEHICLES[GREEN_BUG_ID].halfWidth,VEHICLES.aurora.halfWidth);assert.equal(VEHICLES[GREEN_BUG_ID].acceleration,VEHICLES.aurora.acceleration);assert.equal(VEHICLES[GREEN_BUG_ID].paintable,false);assert.equal(VEHICLE_LIST.length,5);assert.equal(GARAGE_VEHICLE_LIST.length,6);assert.ok(!VEHICLE_LIST.some(s=>s.id===GREEN_BUG_ID));
 g.confirm();assert.equal(normalizeGarage(g.saved).selected,GREEN_BUG_ID);
});
for(const spec of GARAGE_VEHICLE_LIST)test(`${spec.id}: real finite mesh, stationary calipers, steering, brake and headlight modes`,()=>{
 const car=createCar({model:spec.id});let vertices=0;
 car.traverse(o=>{if(o.geometry){const a=o.geometry.attributes.position.array;assert.ok(a.every(Number.isFinite));vertices+=a.length/3;}});assert.ok(vertices>1000);
 const w=car.userData.wheels[0],fixed=w.pivot.children.filter(c=>c!==w.spin);assert.ok(fixed.length>0);const rotations=fixed.map(c=>c.rotation.toArray());
 updateCar(car,{speed:20,steer:1,brake:1});assert.ok(w.spin.rotation.x>0);assert.equal(w.pivot.rotation.y,.44);assert.deepEqual(fixed.map(c=>c.rotation.toArray()),rotations);assert.equal(car.userData.brakeLights[0].emissiveIntensity,5);
 for(let mode=0;mode<4;mode++){setCarLightMode(car,mode);assert.equal(car.userData.lightMode,mode);assert.equal(car.userData.beamLights[0].visible,mode===1||mode===2);}disposeVehicle(car);
});
test('new vehicle tradeoffs use actual simulated performance',()=>{const n=simulatedPerformance('nightslash'),t=simulatedPerformance('tempest');assert.ok(t.accelerationSeconds<n.accelerationSeconds);assert.ok(t.brakingMetres>n.brakingMetres);console.log({nightslash:n,tempest:t});});
