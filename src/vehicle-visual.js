import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const MODEL_ID = 'green-bug';
const MODEL_URL = `${import.meta.env?.BASE_URL || '/'}assets/vehicles/candidates/green-bug/green_bug_stylized_scifi_car_free.glb`;
const WHEEL_NAME = /(wheel|tire|tyre)[ _.-]*(fl|fr|rl|rr|front.?left|front.?right|rear.?left|rear.?right)|(fl|fr|rl|rr)[ _.-]*(wheel|tire|tyre)/i;
const WHEEL_KEYS = ['fl', 'fr', 'rl', 'rr'];
const GREEN_BUG_WHEELS = {
  fl: ['Circle.003', 'Circle.003_MatWheel_0'],
  fr: ['Circle.002', 'Circle.002_MatWheel_0'],
  rl: ['Circle.004', 'Circle.004_MatWheel_0'],
  rr: ['Circle.001', 'Circle.001_MatWheel_0'],
};
const defaultLoader = new GLTFLoader();
const defaultCache = new Map();
const customLoaderCaches = new WeakMap();

/** Loads the Green Bug visual only for a selected player car or an explicit showroom preview. */
export function loadVehicleVisual(car, { vehicleId = MODEL_ID, isPlayer = false, preview = false, loader = defaultLoader } = {}) {
  if (vehicleId !== MODEL_ID || (!isPlayer && !preview)) return Promise.resolve({ loaded: false, reason: 'not-green-bug-preview' });
  const token = car.userData.visualLoadToken = (car.userData.visualLoadToken || 0) + 1;
  const cache = loader === defaultLoader ? defaultCache : getLoaderCache(loader);
  const cached = cache.has(MODEL_URL);
  let request = cache.get(MODEL_URL);
  if (!request) {
    request = loader.loadAsync(MODEL_URL);
    cache.set(MODEL_URL, request);
    request.catch(() => { if (cache.get(MODEL_URL) === request) cache.delete(MODEL_URL); });
  }
  return request.then(gltf => {
    if (!car.parent || car.userData.visualLoadToken !== token) return { loaded: false, reason: 'vehicle-disposed', cacheHit: cached };
    const visualRoot = new THREE.Group();
    visualRoot.name = 'Green Bug imported visual root';
    visualRoot.add(gltf.scene.clone(true));
    const calibration = calibrate(visualRoot);
    const { wheels, ...inspection } = inspectScene(visualRoot);
    // Green Bug has no paint-only material; preserve all supplied materials and maps.
    visualRoot.traverse(object => {
      object.layers.mask = car.layers.mask;
      if (object.isMesh) {
        object.userData.sharedVehicleAsset = true;
        object.castShadow = true;
        object.receiveShadow = true;
      }
    });

    const fallbackBody = car.userData.body;
    if (fallbackBody) fallbackBody.visible = false;
    car.userData.wheels?.forEach(wheel => { wheel.pivot.visible = false; });
    car.add(visualRoot);
    car.userData.importedVisual = visualRoot;
    car.userData.importedWheels = wheels;
    car.userData.visualStatus = {
      loaded: true, url: MODEL_URL, cacheHit: cached, ...calibration, ...inspection,
      wheelNames: Object.fromEntries(Object.entries(wheels).map(([key, wheel]) => [key, wheel.pivot?.name || wheel.spin?.name])),
    };
    console.info('Green Bug glTF visual loaded.', car.userData.visualStatus);
    return car.userData.visualStatus;
  }).catch(error => {
    car.userData.visualStatus = { loaded: false, reason: 'load-failed', message: error?.message || String(error), cacheHit: cached };
    console.info('Optional Green Bug glTF unavailable; keeping generated vehicle visual.', error);
    return car.userData.visualStatus;
  });
}

export function updateImportedWheels(car, steer, speed, dt) {
  const wheels = car?.userData?.importedWheels;
  if (!wheels) return;
  for (const key of WHEEL_KEYS) {
    const wheel = wheels[key];
    if (!wheel) continue;
    if (key === 'fl' || key === 'fr') {
      const steeringAngle = (key === 'fl' ? 1 : -1) * steer * .44;
      wheel.pivot.rotation.y = steeringAngle === 0 ? 0 : steeringAngle;
    }
    wheel.spin.rotation.x += speed * dt / (wheel.radius || car.userData.wheelRadius || .37);
  }
}

export function calibrate(root) {
  root.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(root);
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  if (!size.x || !size.y || !size.z) throw new Error('glTF has empty geometry');
  const scale = 4.61 / size.z;
  // The downloaded hierarchy is already Y-up and +Z-forward.
  root.scale.setScalar(scale);
  root.position.set(-center.x * scale, -bounds.min.y * scale, -center.z * scale);
  return {
    scale,
    sourceSize: size.toArray(),
    alignedSize: [size.x * scale, size.y * scale, size.z * scale],
    sourceCenter: center.toArray(),
    sourceGroundY: bounds.min.y,
    offset: root.position.toArray(),
    forward: '+Z', up: '+Y',
  };
}

export function inspectScene(root) {
  const nodes = [];
  const meshes = [];
  const materials = new Set();
  let triangles = 0;
  root.traverse(node => {
    if (node.name) nodes.push(node.name);
    if (node.isMesh) {
      meshes.push(node.name);
      const index = node.geometry.index;
      triangles += (index?.count ?? node.geometry.attributes.position?.count ?? 0) / 3;
      for (const material of [].concat(node.material || [])) materials.add(material);
    }
  });
  const wheels = {};
  for (const key of WHEEL_KEYS) {
    const names = GREEN_BUG_WHEELS[key];
    const pivot = root.getObjectByName(names[0]);
    const spin = root.getObjectByName(names[1]);
    if (pivot?.isObject3D && spin?.isMesh && pivot.getObjectById(spin.id) === spin) {
      spin.geometry.computeBoundingBox();
      const extent = spin.geometry.boundingBox.getSize(new THREE.Vector3());
      // Green Bug's wheel axle is local X, so Y/Z are the tire's radial dimensions.
      wheels[key] = { pivot, spin, radius: Math.max(extent.y, extent.z) * .5 * root.scale.x };
    }
  }
  // Generic name matching stays available for other vehicles.
  if (Object.keys(wheels).length !== 4) {
    const inferred = {};
    root.traverse(node => {
      if (!node.isMesh || !WHEEL_NAME.test(node.name)) return;
      const name = node.name.toLowerCase().replace(/[^a-z0-9]+/g, ' ');
      const side = /left|(^| )(fl|rl)( |$)/.test(name) ? 'l' : /right|(^| )(fr|rr)( |$)/.test(name) ? 'r' : '';
      const axle = /front|(^| )(fl|fr)( |$)/.test(name) ? 'f' : /rear|(^| )(rl|rr)( |$)/.test(name) ? 'r' : '';
      if (side && axle) inferred[`${axle}${side}`] ||= { pivot: node, spin: node };
    });
    return { nodes, meshes, materialNames: [...materials].map(material => material.name), triangles, wheels: inferred };
  }
  return { nodes, meshes, materialNames: [...materials].map(material => material.name), triangles, wheels };
}

function getLoaderCache(loader) {
  let cache = customLoaderCaches.get(loader);
  if (!cache) { cache = new Map(); customLoaderCaches.set(loader, cache); }
  return cache;
}
