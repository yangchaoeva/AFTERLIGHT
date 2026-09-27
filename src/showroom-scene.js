import * as THREE from 'three';

export function createShowroomScene(environment){
  const scene=new THREE.Scene();scene.background=new THREE.Color('#17191c');scene.environment=environment;scene.environmentIntensity=.8;scene.fog=new THREE.Fog('#17191c',12,42);
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(120,120),new THREE.MeshStandardMaterial({color:'#101216',roughness:.78,metalness:.04,envMapIntensity:.12}));
  floor.rotation.x=-Math.PI/2;floor.position.y=-.012;floor.receiveShadow=true;scene.add(floor);
  const platform=new THREE.Mesh(new THREE.CylinderGeometry(3.5,3.54,.045,100),new THREE.MeshStandardMaterial({color:'#15181c',roughness:.72,metalness:.05,envMapIntensity:.15}));platform.position.y=-.036;platform.receiveShadow=true;scene.add(platform);
  const key=new THREE.DirectionalLight('#fff6e9',2.8);key.position.set(-3,6,5);key.castShadow=true;
  key.shadow.mapSize.set(1024,1024);Object.assign(key.shadow.camera,{left:-5,right:5,top:5,bottom:-5,near:.1,far:18});key.shadow.normalBias=.018;key.shadow.bias=-.00015;key.shadow.radius=3;scene.add(key);
  const fill=new THREE.DirectionalLight('#dae4ef',1.2);fill.position.set(5,3,1);scene.add(fill);
  const rim=new THREE.DirectionalLight('#fff7eb',1.7);rim.position.set(-1,4,-5);scene.add(rim);
  scene.add(new THREE.HemisphereLight('#d6e2e7','#282b2e',.5));
  return scene;
}

export function disposeVehicle(car){
  if(!car)return;const geometries=new Set(),materials=new Set(),textures=new Set();
  car.traverse(o=>{if(o.userData.sharedVehicleAsset)return;if(o.geometry)geometries.add(o.geometry);if(o.material)for(const m of [].concat(o.material)){materials.add(m);for(const value of Object.values(m))if(value?.isTexture)textures.add(value);}});
  geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());car.removeFromParent();
}

export function showroomPose(spec,view='orbit'){
  const size=spec.length/4.6,axle=spec.design?.frontAxle??spec.wheelbase/2;
  const poses={orbit:{position:[4.5*size,1.95,5.0*size],target:[0,.68,0]},front:{position:[2.7*size,1.28,5.1*size],target:[0,.72,spec.length*.30]},wheel:{position:[2.2,.58,axle+.74],target:[spec.halfWidth-.1,spec.wheelRadius,axle]},rear:{position:[-4.5*size,1.85,-5.1*size],target:[0,.72,-.5]},side:{position:[6.8*size,1.25,0],target:[0,.72,0]}};
  return poses[view]||poses.orbit;
}
