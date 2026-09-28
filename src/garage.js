import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {GARAGE_VEHICLE_LIST,PAINTS,GREEN_BUG_ID,getVehicle} from './vehicle-catalog.js';
import {GarageSelection} from './garage-state.js';
import {simulatedPerformance} from './vehicle-performance.js';
import {createCar} from './vehicle.js';
import {createShowroomScene,showroomPose,disposeVehicle} from './showroom-scene.js';
import {loadVehicleVisual} from './vehicle-visual.js';
import './garage.css';

const colors=spec=>[...new Map([{color:spec.color,name:'原厂主题色'},...PAINTS].map(p=>[p.color,p])).values()];
export class Garage{
 constructor(renderer,environment,{onConfirm,onCancel}){
  this.renderer=renderer;this.environment=environment;this.onConfirm=onConfirm;this.onCancel=onCancel;this.selection=new GarageSelection();this.thumbnails=new Map();this.active=false;
  const slots=Math.max(6,GARAGE_VEHICLE_LIST.length);
  document.querySelector('#app').insertAdjacentHTML('beforeend',`<section id="garage" class="garage-screen" hidden aria-label="独立选车车库">
   <header class="garage-header"><button id="garage-back" class="garage-back">← 返回</button><div><small>AFTERLIGHT / COASTAL COLLECTION</small><h1>选择你的下一程。</h1></div><span id="garage-count">${String(GARAGE_VEHICLE_LIST.length).padStart(2,'0')} 辆座驾</span></header>
   <div class="garage-stage" id="garage-stage" aria-label="三维车辆预览，可拖动旋转及双指缩放"></div>
   <nav class="garage-views" aria-label="车辆镜头">${[['orbit','默认视角'],['front','前脸'],['wheel','轮组'],['rear','尾部']].map(([view,label])=>`<button data-garage-view="${view}">${label}</button>`).join('')}</nav>
   <aside class="garage-details"><div class="garage-kicker" id="garage-subtitle"></div><h2 id="garage-name"></h2><p id="garage-description"></p><div class="garage-drive"><span id="garage-layout"></span><span id="garage-mass"></span></div>
   <dl class="garage-performance"><div><dt>模拟 0–100 km/h</dt><dd id="garage-acceleration"></dd></div><div><dt>模拟 100–0 km/h 制动距离</dt><dd id="garage-braking"></dd></div><div><dt>游戏极速上限</dt><dd id="garage-speed"></dd></div></dl><p class="garage-metric-note">按本游戏平直干燥路面模拟，仅用于车型比较。</p>
   <div class="garage-paint-title">车身颜色 <span id="garage-color-name"></span></div><div class="garage-paints" id="garage-paints"></div>
   <button id="garage-confirm" class="garage-confirm">驾驶此车 <span>↗</span></button><small class="garage-confirm-note">确认后应用车辆与车漆；返回可取消本次修改。</small></aside>
   <footer class="garage-bottom"><div class="garage-collection-label"><span>THE COLLECTION</span><small>拖动旋转 · 滚轮 / 双指缩放 · ← → 切车 · Enter 确认 · Esc 返回</small></div><div class="garage-cards" id="garage-cards">${GARAGE_VEHICLE_LIST.map((s,i)=>`<button class="garage-card" data-garage-model="${s.id}" aria-label="预览 ${s.label}" aria-pressed="false"><span class="garage-card-index">${String(i+1).padStart(2,'0')}</span><img alt="${s.label} 实车缩略图" width="320" height="176"><strong>${s.label}</strong><small>${s.name} / ${s.drivetrain}</small></button>`).join('')}${Array.from({length:slots-GARAGE_VEHICLE_LIST.length},()=>'<div class="garage-empty" aria-label="敬请期待，尚未开放"><span>＋</span><strong>敬请期待</strong><small>下一段旅程</small></div>').join('')}</div></footer></section>`);
  this.ui=document.querySelector('#garage');this.stage=document.querySelector('#garage-stage');
  this.scene=createShowroomScene(environment);this.camera=new THREE.PerspectiveCamera(38,1,.05,100);
  this.controls=new OrbitControls(this.camera,this.stage);this.controls.enableDamping=true;this.controls.dampingFactor=.09;this.controls.enablePan=false;this.controls.minDistance=1.25;this.controls.maxDistance=12;this.controls.minPolarAngle=.18;this.controls.maxPolarAngle=Math.PI*.48;this.controls.enabled=false;
  this.controls.addEventListener('start',()=>{this.cameraTransition=0;});
  this.$('garage-back').onclick=()=>this.cancel();this.$('garage-confirm').onclick=()=>this.confirm();
  this.$('garage-cards').onclick=e=>{const card=e.target.closest('[data-garage-model]');if(card)this.requestPreview(card.dataset.garageModel);};
  this.ui.querySelectorAll('[data-garage-view]').forEach(b=>b.onclick=()=>this.setView(b.dataset.garageView));
  this.$('garage-paints').onclick=e=>{const swatch=e.target.closest('[data-garage-color]');if(swatch){this.selection.color(swatch.dataset.garageColor);if(this.car)this.car.userData.paint.color.set(this.selection.paint);this.paintUI();}};
  this.keyHandler=e=>{
    if(!this.active)return;
    if(['ArrowLeft','ArrowRight','Enter','Escape'].includes(e.code)){e.preventDefault();e.stopImmediatePropagation();}
    if(e.repeat)return;
    if(e.code==='ArrowLeft'||e.code==='ArrowRight'){this.selection.move(e.code==='ArrowRight'?1:-1);this.requestPreview(this.selection.preview);}
    if(e.code==='Enter')this.confirm();if(e.code==='Escape')this.cancel();
  };
  window.addEventListener('keydown',this.keyHandler,true);
 }
 $(id){return document.getElementById(id);}
 open(saved,id){this.selection=new GarageSelection(saved);this.selection.begin(id);this.active=true;this.ui.hidden=false;this.controls.enabled=true;this.showPreview(this.selection.preview);this.ensureThumbnails();this.$('garage-back').focus();}
 close(){this.active=false;clearTimeout(this.switchTimer);this.pending=null;this.ui.hidden=true;this.controls.enabled=false;disposeVehicle(this.car);this.car=null;}
 cancel(){this.selection.cancel();this.close();this.onCancel();}
 confirm(){if(this.pending)this.showPreview(this.pending);const saved=this.selection.confirm();this.close();this.onConfirm(saved);}
 requestPreview(id){this.selection.select(id);this.pending=this.selection.preview;clearTimeout(this.switchTimer);this.stage.classList.add('changing');this.$('garage-confirm').disabled=true;this.switchTimer=setTimeout(()=>this.showPreview(this.pending),80);}
 showPreview(id){
  clearTimeout(this.switchTimer);this.selection.select(id);this.pending=null;
  const next=createCar({model:this.selection.preview,color:this.selection.paint,detail:'high'});
  disposeVehicle(this.car);this.car=next;this.scene.add(next);next.userData.brakeLights.forEach(m=>m.emissiveIntensity=.3);
  if(this.selection.preview===GREEN_BUG_ID)loadVehicleVisual(next,{vehicleId:this.selection.preview,preview:true});
  const spec=this.selection.spec,metrics=simulatedPerformance(spec.id);
  this.$('garage-name').textContent=spec.label;this.$('garage-subtitle').textContent=spec.subtitle;this.$('garage-description').textContent=spec.description;
  this.$('garage-layout').textContent=spec.layout;this.$('garage-mass').textContent=`模拟质量 ${spec.mass} kg`;
  this.$('garage-acceleration').textContent=`${metrics.accelerationSeconds.toFixed(2)} s`;this.$('garage-braking').textContent=`${metrics.brakingMetres.toFixed(1)} m`;this.$('garage-speed').textContent=`${Math.round(spec.topSpeed*3.6)} km/h`;
  this.$('garage-paints').innerHTML=colors(spec).map(p=>`<button class="garage-swatch" data-garage-color="${p.color}" style="--paint:${p.color}" aria-label="${p.name}"></button>`).join('');
  this.$('garage-paints').hidden=spec.paintable===false;this.$('garage-paints').previousElementSibling.hidden=spec.paintable===false;
  this.ui.querySelectorAll('[data-garage-model]').forEach(b=>{b.classList.toggle('selected',b.dataset.garageModel===spec.id);b.setAttribute('aria-pressed',String(b.dataset.garageModel===spec.id));});
  const cards=this.$('garage-cards'),card=this.ui.querySelector(`[data-garage-model="${spec.id}"]`),cr=cards.getBoundingClientRect(),br=card.getBoundingClientRect();
  if(br.left<cr.left)cards.scrollLeft-=cr.left-br.left;else if(br.right>cr.right)cards.scrollLeft+=br.right-cr.right;
  this.paintUI();this.setView('orbit',true);this.enterTime=0;this.stage.classList.remove('changing');this.$('garage-confirm').disabled=false;
 }
 paintUI(){const paint=this.selection.paint;this.ui.querySelectorAll('[data-garage-color]').forEach(b=>{b.classList.toggle('selected',b.dataset.garageColor===paint);b.setAttribute('aria-pressed',String(b.dataset.garageColor===paint));});this.$('garage-color-name').textContent=colors(this.selection.spec).find(p=>p.color===paint)?.name||'自选车漆';}
 setView(view,snap=false){this.view=view;const pose=showroomPose(this.selection.spec,view);this.targetPosition=new THREE.Vector3(...pose.position);this.targetAim=new THREE.Vector3(...pose.target);this.cameraTransition=snap?0:1;this.ui.querySelectorAll('[data-garage-view]').forEach(b=>b.classList.toggle('active',b.dataset.garageView===view));if(snap){this.camera.position.copy(this.targetPosition);this.controls.target.copy(this.targetAim);this.controls.update();}}
 update(dt){
  if(!this.active)return;
  if(this.cameraTransition>0){const a=1-Math.exp(-dt*10);this.camera.position.lerp(this.targetPosition,a);this.controls.target.lerp(this.targetAim,a);this.cameraTransition-=dt;}
  this.enterTime=Math.min(.22,(this.enterTime||0)+dt);if(this.car)this.car.position.x=.16*(1-this.enterTime/.22)**2;
  this.controls.update();
  const r=this.renderer,bounds=this.stage.getBoundingClientRect(),width=innerWidth,height=innerHeight;
  this.camera.aspect=bounds.width/Math.max(1,bounds.height);this.camera.updateProjectionMatrix();
  r.setScissorTest(false);r.setViewport(0,0,width,height);r.setClearColor('#17191c');r.clear();
  r.setViewport(bounds.x,height-bounds.bottom,bounds.width,bounds.height);r.setScissor(bounds.x,height-bounds.bottom,bounds.width,bounds.height);r.setScissorTest(true);r.render(this.scene,this.camera);
  r.setScissorTest(false);r.setViewport(0,0,width,height);
 }
 async ensureThumbnails(){
  if(this.generating||this.thumbnails.size===GARAGE_VEHICLE_LIST.length)return;this.generating=true;
  const r=this.renderer,target=new THREE.WebGLRenderTarget(320,176),scene=createShowroomScene(this.environment),camera=new THREE.PerspectiveCamera(38,320/176,.05,100),pixels=new Uint8Array(320*176*4);
  target.texture.colorSpace=THREE.SRGBColorSpace;
  try{for(const spec of GARAGE_VEHICLE_LIST){
    if(this.thumbnails.has(spec.id))continue;await new Promise(requestAnimationFrame);
    const car=createCar({model:spec.id,detail:'low'});scene.add(car);if(spec.id===GREEN_BUG_ID)await loadVehicleVisual(car,{vehicleId:spec.id,preview:true});const pose=showroomPose(spec);camera.position.fromArray(pose.position);camera.lookAt(...pose.target);
    const previous=r.getRenderTarget();r.setRenderTarget(target);r.render(scene,camera);r.readRenderTargetPixels(target,0,0,320,176,pixels);r.setRenderTarget(previous);
    const canvas=document.createElement('canvas');canvas.width=320;canvas.height=176;const ctx=canvas.getContext('2d'),data=ctx.createImageData(320,176);
    for(let y=0;y<176;y++)data.data.set(pixels.subarray((175-y)*320*4,(176-y)*320*4),y*320*4);ctx.putImageData(data,0,0);
    const url=canvas.toDataURL('image/png');this.thumbnails.set(spec.id,url);this.ui.querySelector(`[data-garage-model="${spec.id}"] img`).src=url;disposeVehicle(car);
  }}finally{target.dispose();scene.traverse(o=>{if(o.userData.sharedVehicleAsset)return;o.geometry?.dispose();if(o.material){o.material.map?.dispose();o.material.dispose();}if(o.isLight)o.dispose?.();});this.generating=false;}
 }
 get telemetry(){return {preview:this.car?.userData.model,pending:this.pending,paint:this.selection.paint,view:this.view,thumbnails:this.thumbnails.size,camera:this.camera.position.toArray(),geometries:this.renderer.info.memory.geometries,textures:this.renderer.info.memory.textures};}
}
