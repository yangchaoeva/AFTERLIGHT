import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import * as THREE from 'three';
import { createCar } from '../src/vehicle.js';
import { inspectScene, loadVehicleVisual, updateImportedWheels } from '../src/vehicle-visual.js';
import { disposeVehicle } from '../src/showroom-scene.js';

test('archived concept glTF and every relative buffer/image dependency are present', async () => {
  const root = join(process.cwd(), 'public/assets/vehicles/afterlight-concept/my_futuristic_concept_car');
  const gltf = JSON.parse(await readFile(join(root, 'scene.gltf'), 'utf8'));
  const refs = [gltf.buffers.map(item => item.uri), gltf.images.map(item => item.uri)].flat();
  for (const ref of refs) assert.ok((await stat(join(root, ref))).isFile(), `missing glTF dependency: ${ref}`);
  assert.equal(gltf.accessors[gltf.meshes[0].primitives[0].indices].count / 3, 36266);
  assert.equal(gltf.materials.length, 1);
  assert.equal(refs.length, 4);
  assert.ok((await stat(join(root, 'license.txt'))).isFile());
});

function fixtureLoader(scene, failure) {
  return { loadAsync: async () => { if (failure) throw new Error('offline'); return { scene }; } };
}

test('optional glTF failure preserves the fallback car and its physics-facing root', async () => {
  const scene = new THREE.Scene(), car = createCar({ model: 'aurora' }); scene.add(car);
  const position = car.position.clone(), body = car.userData.body;
  const result = await loadVehicleVisual(car, { vehicleId: 'green-bug', isPlayer: true, loader: fixtureLoader(null, true) });
  assert.equal(result.loaded, false);
  assert.equal(body.visible, true);
  assert.deepEqual(car.position.toArray(), position.toArray());
  assert.equal(car.userData.wheels.length, 4);
});

function greenBugFixture() {
  const scene = new THREE.Group();
  const mainMaterial = new THREE.MeshStandardMaterial({ name: 'MatMain', color: '#6a9674', metalness: .3, roughness: .4 });
  const wheelMaterial = new THREE.MeshStandardMaterial({ name: 'MatWheel', color: '#202020' });
  const body = new THREE.Mesh(new THREE.BoxGeometry(300, 200, 600), mainMaterial);
  body.name = 'Plane_MatMain_0'; body.position.y = 110; scene.add(body);
  for (const [pivotName, meshName, x, z] of [
    ['Circle.003', 'Circle.003_MatWheel_0', -132, 165], ['Circle.002', 'Circle.002_MatWheel_0', 128, 165],
    ['Circle.004', 'Circle.004_MatWheel_0', -132, -166], ['Circle.001', 'Circle.001_MatWheel_0', 128, -166],
  ]) {
    const pivot = new THREE.Group(); pivot.name = pivotName; pivot.position.set(x, 63, z);
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(63, 63, 30, 12), wheelMaterial); mesh.name = meshName;
    // CylinderGeometry's native Y axis is rotated to the audited local X wheel axis.
    mesh.rotation.z = Math.PI / 2; pivot.add(mesh); scene.add(pivot);
  }
  return { scene, mainMaterial, wheelMaterial };
}

test('Green Bug uses explicit four wheel pivots, only front steer, and all four roll in both directions', async () => {
  const fixture = greenBugFixture(), loader = fixtureLoader(fixture.scene);
  const inspected = inspectScene(fixture.scene);
  assert.equal(Object.keys(inspected.wheels).length, 4);
  const world = new THREE.Scene(), car = createCar({ model: 'aurora', color: '#123456' }); world.add(car);
  const rootPosition = car.position.clone(), rootQuaternion = car.quaternion.clone(), rootScale = car.scale.clone();
  const fallbackBody = car.userData.body;
  const status = await loadVehicleVisual(car, { vehicleId: 'green-bug', isPlayer: true, loader });
  assert.equal(status.loaded, true);
  assert.equal(status.forward, '+Z'); assert.equal(status.up, '+Y');
  assert.equal(car.userData.importedVisual.parent, car);
  assert.equal(fallbackBody.visible, false);
  assert.equal(car.userData.importedWheels.fl.pivot.name, 'Circle.003');
  assert.equal(car.userData.importedWheels.fr.pivot.name, 'Circle.002');
  assert.equal(car.userData.importedWheels.rl.pivot.name, 'Circle.004');
  assert.equal(car.userData.importedWheels.rr.pivot.name, 'Circle.001');
  assert.equal(car.userData.importedWheels.fl.spin.material, fixture.wheelMaterial);
  assert.equal(car.userData.importedVisual.getObjectByName('Plane_MatMain_0').material, fixture.mainMaterial);
  updateImportedWheels(car, 1, 20, 1 / 60);
  assert.ok(car.userData.importedWheels.fl.spin.rotation.x !== 0);
  assert.ok(car.userData.importedWheels.fr.spin.rotation.x !== 0);
  assert.ok(car.userData.importedWheels.rl.spin.rotation.x !== 0);
  assert.ok(car.userData.importedWheels.rr.spin.rotation.x !== 0);
  assert.ok(car.userData.importedWheels.fl.pivot.rotation.y > 0);
  assert.ok(car.userData.importedWheels.fr.pivot.rotation.y < 0);
  assert.equal(car.userData.importedWheels.rl.pivot.rotation.y, 0);
  assert.equal(car.userData.importedWheels.rr.pivot.rotation.y, 0);
  const forwardRotation = car.userData.importedWheels.fl.spin.rotation.x;
  updateImportedWheels(car, 0, -20, 1 / 60);
  assert.equal(car.userData.importedWheels.fl.spin.rotation.x, 0);
  assert.ok(forwardRotation > 0);
  assert.deepEqual(car.position.toArray(), rootPosition.toArray());
  assert.deepEqual(car.quaternion.toArray(), rootQuaternion.toArray());
  assert.deepEqual(car.scale.toArray(), rootScale.toArray());
});

test('Fast Retry style recreation shares one GLB load and never disposes its cached geometry/materials', async () => {
  const fixture = greenBugFixture(); let loads = 0;
  const loader = { loadAsync: async () => { loads++; return { scene: fixture.scene }; } };
  let sharedGeometry;
  for (let i = 0; i < 5; i++) {
    const world = new THREE.Scene(), car = createCar({ model: 'aurora' }); world.add(car);
    const status = await loadVehicleVisual(car, { vehicleId: 'green-bug', isPlayer: true, loader });
    assert.equal(status.loaded, true);
    assert.equal(status.cacheHit, i > 0);
    const wheel = car.userData.importedWheels.fl;
    assert.equal(wheel.pivot.rotation.y, 0);
    assert.ok(Math.abs(wheel.spin.rotation.x) < 1e-12);
    sharedGeometry ||= wheel.spin.geometry;
    assert.equal(wheel.spin.geometry, sharedGeometry);
    disposeVehicle(car);
    assert.equal(sharedGeometry.attributes.position.count > 0, true);
    assert.equal(fixture.wheelMaterial.color.getHex(), new THREE.Color('#202020').getHex());
  }
  assert.equal(loads, 1);
});
