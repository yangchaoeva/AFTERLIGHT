import {chromium} from '@playwright/test';
import fs from 'node:fs/promises';
await fs.mkdir('artifacts/garage',{recursive:true});
const b=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist','--disable-gpu-sandbox','--no-sandbox']});
try{
 const p=await b.newPage({viewport:{width:1280,height:800}}),errors=[];p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await p.route('**/model-inspect.html',r=>r.fulfill({contentType:'text/html',body:'<html><body style="margin:0"></body></html>'}));await p.goto('http://127.0.0.1:5173/model-inspect.html');
 await p.evaluate(async()=>{
  const THREE=await import('/node_modules/three/build/three.module.js');const {RoomEnvironment}=await import('/node_modules/three/examples/jsm/environments/RoomEnvironment.js');
  const {createShowroomScene,showroomPose,disposeVehicle}=await import('/src/showroom-scene.js'),{createCar,updateCar}=await import('/src/vehicle.js'),{VEHICLE_LIST}=await import('/src/vehicle-catalog.js');
  const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(innerWidth,innerHeight);renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;document.body.append(renderer.domElement);
  const pmrem=new THREE.PMREMGenerator(renderer),room=new RoomEnvironment(),target=pmrem.fromScene(room,.025);room.dispose();pmrem.dispose();
  const scene=createShowroomScene(target.texture),camera=new THREE.PerspectiveCamera(38,innerWidth/innerHeight,.05,100);let car;
  window.modelQA={ids:VEHICLE_LIST.filter(s=>s.premium).map(s=>s.id),draw(id,view,steer=0){disposeVehicle(car);const spec=VEHICLE_LIST.find(s=>s.id===id);car=createCar({model:id});scene.add(car);const pose=showroomPose(spec,view);camera.position.fromArray(pose.position);camera.lookAt(...pose.target);updateCar(car,{steer,speed:5,brake:.5});renderer.render(scene,camera);return {drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles};}};
 });
 for(const id of await p.evaluate(()=>modelQA.ids))for(const view of ['orbit','rear','side','wheel','front']){
  const info=await p.evaluate(({id,view})=>modelQA.draw(id,view,view==='wheel'?.5:0),{id,view});await p.screenshot({path:`artifacts/garage/${id}-${view}.png`});console.log(id,view,info);
 }
 if(errors.length)throw Error(errors.join('\n'));
}finally{await b.close();}
