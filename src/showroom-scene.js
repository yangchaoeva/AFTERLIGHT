import * as THREE from 'three';

export function createShowroomScene(environment){
  const scene=new THREE.Scene();scene.background=new THREE.Color('#17191c');scene.environment=environment;scene.environmentIntensity=1.05;scene.fog=new THREE.Fog('#17191c',12,42);
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(120,120),new THREE.MeshBasicMaterial({color:'#34383d',toneMapped:false}));
  floor.rotation.x=-Math.PI/2;floor.position.y=-.012;scene.add(floor);
  const platform=new THREE.Mesh(new THREE.CylinderGeometry(3.5,3.54,.045,100),new THREE.MeshStandardMaterial({color:'#15181c',roughness:.72,metalness:.05,envMapIntensity:.15}));platform.position.y=-.036;platform.receiveShadow=true;scene.add(platform);
  const shadowCanvas=document.createElement('canvas');shadowCanvas.width=shadowCanvas.height=128;
  const shadowContext=shadowCanvas.getContext('2d');const shadowGradient=shadowContext.createRadialGradient(64,64,10,64,64,63);
  shadowGradient.addColorStop(0,'rgba(0,0,0,.45)');shadowGradient.addColorStop(.58,'rgba(0,0,0,.2)');shadowGradient.addColorStop(1,'rgba(0,0,0,0)');
  shadowContext.fillStyle=shadowGradient;shadowContext.fillRect(0,0,128,128);
  const contactShadow=new THREE.Mesh(new THREE.PlaneGeometry(3.1,5.8),new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(shadowCanvas),transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1}));
  contactShadow.rotation.x=-Math.PI/2;contactShadow.position.y=.001;scene.add(contactShadow);
  const key=new THREE.DirectionalLight('#fff1d7',3.1);key.position.set(-4,7,5);key.castShadow=true;
  key.shadow.mapSize.set(2048,2048);Object.assign(key.shadow.camera,{left:-5,right:5,top:5,bottom:-5,near:.1,far:18});key.shadow.normalBias=.018;key.shadow.bias=-.00015;key.shadow.radius=3;scene.add(key);
  const fill=new THREE.DirectionalLight('#d4e4ef',.85);fill.position.set(5,2,2);scene.add(fill);
  const rim=new THREE.DirectionalLight('#f6d8ab',2.15);rim.position.set(-1,5,-5);scene.add(rim);
  const side=new THREE.DirectionalLight('#e5f0f5',.8);side.position.set(5,4,-3);scene.add(side);
  scene.add(new THREE.HemisphereLight('#d6e2e7','#282b2e',.42));
  return scene;
}

export function disposeVehicle(car){
  if(!car)return;const geometries=new Set(),materials=new Set(),textures=new Set();
  car.traverse(o=>{if(o.userData.sharedVehicleAsset)return;if(o.geometry)geometries.add(o.geometry);if(o.material)for(const m of [].concat(o.material)){materials.add(m);for(const value of Object.values(m))if(value?.isTexture)textures.add(value);}});
  geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());car.removeFromParent();
}

export function showroomPose(spec,view='orbit'){
  const size=spec.length/4.6,axle=spec.design?.frontAxle??spec.wheelbase/2;
  const poses={orbit:{position:[4.0*size,1.8,4.5*size],target:[0,.68,0]},front:{position:[2.7*size,1.28,5.1*size],target:[0,.72,spec.length*.30]},wheel:{position:[2.2,.58,axle+.74],target:[spec.halfWidth-.1,spec.wheelRadius,axle]},rear:{position:[-4.5*size,1.85,-5.1*size],target:[0,.72,-.5]},side:{position:[6.8*size,1.25,0],target:[0,.72,0]}};
  return poses[view]||poses.orbit;
}
