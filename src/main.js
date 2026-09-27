import {RaceArchive} from './race-history.js';
import {HistoryScreen} from './history-ui.js';
import {chasePose} from './camera-rig.js';
import {RaceIntro} from './race-intro.js';
import './race-intro.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import '@fontsource/barlow-condensed/500.css';
import '@fontsource/barlow-condensed/600.css';
import '@fontsource/manrope/400.css';
import '@fontsource/manrope/600.css';
import '@fontsource/manrope/800.css';
import './style.css';
import './race-presentation.css';
import { mountUI,timeString } from './ui.js';
import { createTrack,wrap01 } from './track.js';
import {createRegionalWorld} from './regional-world.js';
import {createCustomWorld} from './custom-world.js';
import {DesignStore,validateDesign} from './custom-track.js';
import {TrackEditor} from './track-editor.js';
import { createCar,updateCar,setCarLightMode,cycleCarLightMode,configureDynamicCarLights } from './vehicle.js';
import { createWorld } from './world.js';
import { RaceAudio } from './audio.js';
import { VEHICLES,createDriver,resetDriver,stepDriver,aiControls,resolveCars,updateRaceProgress,ranking,steeringLimit,playerSteeringLimit,driverSteering,gridSlot } from './physics.js';
import {createCockpit} from './cockpit.js';
import {Garage} from './garage.js';
import {normalizeGarage,GARAGE_KEY} from './garage-state.js';
import {VEHICLE_LIST} from './vehicle-catalog.js';
import {simulatedPerformance} from './vehicle-performance.js';
import {disposeVehicle,showroomPose} from './showroom-scene.js';
import {TireFX} from './tire-fx.js';
import {RaceStats} from './race-stats.js';
import {LeaderboardScreen} from './leaderboard-screen.js';
import {leaderboardApiUrl, getLeaderboardProfile, submitLeaderboardScore} from './leaderboard-client.js';

const $=mountUI();
const archive=new RaceArchive({getItem:key=>localStorage.getItem(key),setItem:(key,value)=>localStorage.setItem(key,value)});
const designStore=new DesignStore({getItem:key=>localStorage.getItem(key),setItem:(key,value)=>localStorage.setItem(key,value)});
let historyScreen,leaderboardScreen,raceSession=null;
let trackEditor,practiceReturnId=null;
const settings=readSave('afterlight.settings',{quality:'medium',sound:true,voice:true,dynamicCamera:true,fps:false});
let state='loading',selectedModel='aurora',paint='#b8d9cf',mode='race',difficulty='normal',theme='day';
let savedGarage=normalizeGarage(readSave(GARAGE_KEY,{}));selectedModel=savedGarage.selected;paint=savedGarage.colors[selectedModel];
let garage,garageReturn='menu',raceIntro=null;
let renderer,scene,camera,world,track,controls,heroCar,drivers=[],carMeshes=[],player;
let coastEnvironment,studioEnvironment,studioFloor,studioLighting,coastBackground;
const circuitCache=new Map();
let elapsed=0,raceTime=0,accumulator=0,countdownTime=0,countdownNumber=-1,totalLaps=2;
let cameraMode=0,menuTime=0,lastHud=0,lastPosition=8,lastOvertake=-20,toastUntil=0;
let eventUntil=0,lastFrame=performance.now(),fpsElapsed=0,fpsFrames=0,frameCount=0;
let resumeState='racing',studioView='orbit',studioTransition=0,heldButtons=new Set();
const keys=new Set(),touch={left:false,right:false,throttle:false,brake:false};
const audio=new RaceAudio();
const stats=new RaceStats(),counterValues={};
let cockpit=null,tireFX=null,finishSequence=null,passFlashUntil=0;
let playerLightProfile={tint:'#dff7ff',brightness:4.8,beam:110,highBeam:440,ambientBrightness:2.2};
const up=new THREE.Vector3(0,1,0),camPos=new THREE.Vector3(),camTarget=new THREE.Vector3();
const aimTarget=new THREE.Vector3(),lastPlayerPosition=new THREE.Vector3(),cameraTravel=new THREE.Vector3();
const carColors=['#d9d6cc','#d46d4e','#536f84','#dfb64c','#97b09a','#9380a9','#454d54'];

function readSave(key,fallback){try{return {...fallback,...JSON.parse(localStorage.getItem(key)||'{}')};}catch{return fallback;}}
function writeSave(key,data){try{localStorage.setItem(key,JSON.stringify(data));}catch{/* storage is optional */}}
function show(id,visible=true){$(id).hidden=!visible;}
function toast(text,duration=3){$('toast').textContent=text;show('toast');toastUntil=elapsed+duration;}
function banner(title,subtitle,duration=3){$('event-banner').innerHTML=`<strong>${title}</strong><small>${subtitle}</small>`;show('event-banner');eventUntil=elapsed+duration;}
const disposeCar=disposeVehicle;

function setQuality(){
 const quality=settings.quality;
 renderer.setPixelRatio(Math.min(devicePixelRatio,quality==='high'?1.75:quality==='medium'?1.25:1));
 renderer.shadowMap.enabled=quality!=='low';
 renderer.setSize(innerWidth,innerHeight);
 if(world?.sunLight){world.sunLight.shadow.mapSize.set(quality==='high'?2048:1024,quality==='high'?2048:1024);world.sunLight.shadow.map?.dispose();world.sunLight.shadow.map=null;}
}
function syncSettings(){
 $('quality').value=settings.quality;$('sound-enabled').checked=settings.sound;
 $('voice-enabled').checked=settings.voice;$('dynamic-camera').checked=settings.dynamicCamera;
 $('show-fps').checked=settings.fps;show('fps',settings.fps);
 audio.setMuted(!settings.sound);audio.setVoiceEnabled(settings.voice);
 if(renderer)setQuality();
}

function positionHero(){
 const s=track.sample(.825);
 heroCar.position.copy(s.position).addScaledVector(s.right,-.2);
 heroCar.rotation.set(0,s.heading+.07,0);
}
function selectCar(model){
 selectedModel=model;disposeCar(heroCar);
 heroCar=createCar({model,color:paint,detail:'high'});heroCar.name='hero-car';scene.add(heroCar);positionHero();
 document.querySelectorAll('[data-model]').forEach(e=>e.classList.toggle('selected',e.dataset.model===model));
 const spec=VEHICLES[model];
 $('hero-car-name').textContent=spec.label;
 $('hero-car-sub').textContent=spec.layout;
 $('studio-name').textContent=spec.label;$('studio-power').textContent=`${simulatedPerformance(model).accelerationSeconds.toFixed(2)} s`;
 $('studio-mass').textContent=`${spec.mass} KG`;$('studio-speed').textContent=`${Math.round(spec.topSpeed*3.6)} KM/H`;
 $('studio-layout').textContent=spec.layout.split(' · ')[0];
 $('studio-desc').textContent=spec.description;
 let triangles=0;heroCar.traverse(o=>{if(o.isMesh)triangles+=(o.geometry.index?.count||o.geometry.attributes.position.count)/3;});
 $('mesh-stat').textContent=`${Math.round(triangles).toLocaleString()} TRIANGLES · 可导出 GLB`;
 if(state==='studio')setStudioView(studioView,true);
}

function setPaint(color){paint=color;if(heroCar)heroCar.userData.paint.color.set(color);document.querySelectorAll('[data-paint]').forEach(e=>e.classList.toggle('selected',e.dataset.paint===color));}

function openGarage(){
 garageReturn=state==='studio'?'studio':'menu';state='garage';hideModals();show('toast',false);show('event-banner',false);show('menu',false);show('studio',false);controls.enabled=false;keys.clear();audio.pause();garage.open(savedGarage);
}

function openStudio(){
 state='studio';show('menu',false);show('studio');heroCar.visible=true;controls.enabled=true;
 controls.minDistance=2;controls.maxDistance=16;controls.maxPolarAngle=Math.PI*.49;
 controls.minPolarAngle=.18;controls.enablePan=false;setStudioView('orbit',true);
 scene.environment=studioEnvironment;scene.environmentIntensity=1;
 scene.background=new THREE.Color('#122229');scene.fog=null;
 for(const child of scene.children)if(child!==heroCar&&child!==studioFloor&&child!==studioLighting)child.visible=false;
 studioFloor.visible=true;studioLighting.visible=true;
 heroCar.position.set(0,0,0);heroCar.rotation.set(0,0,0);setStudioView('orbit',true);
 audio.start().then(()=>audio.say('welcome'));
}
function setStudioView(view,snap=false){
 studioView=view;document.querySelectorAll('[data-view]').forEach(e=>e.classList.toggle('active',e.dataset.view===view));
 const p=heroCar.position,rotation=heroCar.quaternion;
 const pose=showroomPose(VEHICLES[selectedModel],view),local=pose.position;
 const targetOffset=new THREE.Vector3(...pose.target);
 camPos.set(...local).applyQuaternion(rotation).add(p);
 camTarget.copy(targetOffset).applyQuaternion(rotation).add(p);
 if(snap){camera.position.copy(camPos);controls.target.copy(camTarget);controls.update();}
 else studioTransition=1;
}

function saveSession(status){
 if(!raceSession||!player||raceTime<=0||practiceReturnId)return null;
 return archive.add({id:raceSession.id,startedAt:raceSession.startedAt,finishedAt:new Date().toISOString(),circuit:track.id,circuitName:track.name,mode,difficulty,theme,model:selectedModel,paint,status,rank:status==='finished'?ranking(drivers).indexOf(player)+1:null,rankFinal:drivers.every(d=>d.finishTime!==null),totalTime:player.finishTime??raceTime+player.penalty,penalty:player.penalty,bestLap:player.lapTimes.length?Math.min(...player.lapTimes):null,...stats.snapshot()});
}
function openHistory(){historyScreen.open();state='history';show('menu',false);show('toast',false);keys.clear();}
function closeHistory(){historyScreen.close();state='menu';show('menu');$('open-history').focus();}
function openLeaderboard(){
 state='leaderboard';show('menu',false);show('toast',false);keys.clear();
 leaderboardScreen.open({track:$('circuit').value||track.id,mode:$('mode').value});
}
function closeLeaderboard(){leaderboardScreen.close();state='menu';show('menu');$('open-leaderboard').focus();}
async function submitGlobalResult(){
 if(!raceSession||!player||practiceReturnId||raceSession.leaderboardState==='sending'||raceSession.leaderboardState==='sent')return;
 if(!leaderboardApiUrl()){
   raceSession.leaderboardState='offline';$('leaderboard-upload').textContent='成绩已保存在本机；在线排行榜 API 尚未配置。';$('leaderboard-retry').hidden=true;return;
 }
 const raceFinal=drivers.every(d=>d.finishTime!==null);
 const placement=mode==='race'&&raceFinal?ranking(drivers).indexOf(player)+1:null;
 const bestLap=Math.min(...player.lapTimes);
 if(!Number.isFinite(player.finishTime)||!Number.isFinite(bestLap))return;
 const session=raceSession;session.leaderboardState='sending';
 $('leaderboard-upload').textContent='正在提交匿名成绩到全球排行榜…';$('leaderboard-retry').hidden=true;
 const profile=getLeaderboardProfile();
 try{
   await submitLeaderboardScore({runId:session.id,trackId:track.id,mode,theme,difficulty,vehicleId:selectedModel,elapsedMs:Math.round(player.finishTime*1000),placement:mode==='race'?placement:null,bestLapMs:Math.round(bestLap*1000),penaltyMs:Math.round(player.penalty*1000)},profile);
   if(raceSession!==session)return;
   session.leaderboardState='sent';$('leaderboard-upload').textContent='已提交全球排行榜 · '+(mode==='race'?(placement===null?'竞速成绩已登记 · 名次待定':`最终第 ${placement} 名`):'单圈成绩已登记');
 }catch(error){
   if(raceSession!==session)return;
   session.leaderboardState='failed';$('leaderboard-upload').textContent=`本机成绩已保存，在线提交失败：${error.message||'网络错误'}`;$('leaderboard-retry').hidden=false;
 }
}

function returnMenu(){
 const editorId=practiceReturnId;
 if(player&&player.finishTime===null)saveSession('retired');raceSession=null;
 practiceReturnId=null;
 raceIntro?.dispose();raceIntro=null;
 state='menu';hideModals();show('hud',false);show('studio',false);show('menu');
 controls.enabled=false;carMeshes.forEach(disposeCar);carMeshes=[];drivers=[];player=null;cockpit=null;finishSequence=null;show('finish-cinema',false);camera.layers.set(0);camera.layers.enable(1);camera.near=.12;
 for(const child of scene.children)child.visible=true;
 circuitCache.forEach(entry=>entry.world.root.visible=entry.world===world);
 if(coastBackground)world.skyMesh.visible=false;
 studioFloor.visible=false;studioLighting.visible=false;
 world.setTheme('day');document.body.classList.remove('night-theme');
 if(coastBackground)world.skyMesh.visible=false;
 scene.environment=coastEnvironment;scene.environmentIntensity=.8;scene.background=coastBackground;
 scene.fog=new THREE.FogExp2('#b6c4cb',.00023);
 heroCar.visible=true;positionHero();keys.clear();audio.pause();camera.fov=43;camera.updateProjectionMatrix();menuCamera(1,true);
 tireFX.reset();
 if(editorId){openTrackEditor(designStore.get(editorId),true);}
}
function hideModals(){['race-modal','settings-modal','pause-modal','result-modal'].forEach(id=>show(id,false));}

function drawMap(canvas,vehicles=[],mapTrack=track){
 const ctx=canvas.getContext('2d'),w=canvas.width,h=canvas.height,pad=20;
 ctx.clearRect(0,0,w,h);
 const points=mapTrack.positions,b=mapTrack.bounds,center=b.getCenter(new THREE.Vector3());
 const scale=Math.min((w-2*pad)/(b.max.x-b.min.x),(h-2*pad)/(b.max.z-b.min.z));
 const project=p=>[w/2+(p.x-center.x)*scale,h/2+(p.z-center.z)*scale];
 ctx.lineCap='round';ctx.lineJoin='round';
 function route(width,color){ctx.strokeStyle=color;ctx.lineWidth=width;ctx.beginPath();for(let i=0;i<points.length;i+=7){const [x,y]=project(points[i]);if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);}ctx.closePath();ctx.stroke();}
 route(canvas.id==='minimap'?13:8,'#0c263399');route(canvas.id==='minimap'?4:3,'#cfdbcfb0');
 const [sx,sy]=project(mapTrack.sample(0).position);ctx.fillStyle='#e4b76c';ctx.fillRect(sx-4,sy-4,8,8);
 for(const d of [...vehicles].sort((a,b)=>Number(a.isPlayer)-Number(b.isPlayer))){
   const [x,y]=project(d.position);ctx.fillStyle=d.isPlayer?'#efc37b':'#f1f1de';ctx.beginPath();ctx.arc(x,y,d.isPlayer?7:3.5,0,Math.PI*2);ctx.fill();
   if(d.isPlayer){ctx.save();ctx.translate(x,y);ctx.rotate(-d.heading+Math.PI);ctx.beginPath();ctx.moveTo(0,-15);ctx.lineTo(-5,-7);ctx.lineTo(5,-7);ctx.closePath();ctx.fill();ctx.restore();}
 }
}

function createSelectedTrack(id){
 if(!id.startsWith('custom-'))return createTrack(id);
 const design=designStore.get(id);
 if(!design)throw Error('这条玩家赛道已不存在');
 const result=validateDesign(design);
 if(result.status==='draft')throw Error('这条草稿还不能驾驶，请先修正标记的问题');
 const definition={id,name:design.name,english:'PLAYER CIRCUIT',tag:'玩家手绘',description:`你绘制的 ${result.length} 米闭环赛道 · ${result.crossings.length} 处立体交叉`,knots:result.centerline,width:design.width,checkpoints:Math.max(12,Math.min(30,Math.floor(result.length/120))),sampleCount:Math.max(900,Math.min(3600,Math.ceil(result.length/2))),slopeGravity:true};
 const custom=createTrack(definition);custom.customStatus=result.status;custom.design=design;custom.crossings=result.crossings;return custom;
}

function syncCustomCircuits(changedId=null){
 if(changedId&&circuitCache.has(changedId)){
   if(track?.id===changedId)selectCircuit('harbor');
   const entry=circuitCache.get(changedId);entry.world.dispose?.();circuitCache.delete(changedId);
 }
 const select=$('circuit'),previous=select.value;
 select.querySelectorAll('option[data-custom]').forEach(option=>option.remove());
 for(const design of designStore.items){
   const result=validateDesign(design);if(result.status==='draft')continue;
   const option=document.createElement('option');option.value=design.id;option.dataset.custom='';option.textContent=`玩家创作 · ${design.name}`;select.append(option);
 }
 select.value=[...select.options].some(o=>o.value===previous)?previous:'harbor';
}

function openTrackEditor(design=null,preserve=false){
 hideModals();show('menu',false);show('hud',false);show('toast',false);keys.clear();state='editor';
 if(preserve&&design)trackEditor.resume(design);else trackEditor.open(design);
}

function circuitBrief(){
 const preview=createSelectedTrack($('circuit').value);
 const raceOption=$('mode').querySelector('option[value="race"]');raceOption.disabled=preview.customStatus==='drive';
 if(raceOption.disabled&&$('mode').value==='race')$('mode').value='time';
 $('difficulty').disabled=$('mode').value==='time';
 $('race-title').textContent=`下一站，${preview.name}。`;
 $('brief-distance').textContent=`${(preview.length/1000).toFixed(2)} KM · ${$('mode').value==='time'?1:2} 圈`;
 $('circuit-description').textContent=preview.description;
 $('circuit-elevation').textContent=`高差 ${Math.round(preview.elevation)} M · ${preview.width} M 路宽 · ${preview.checkpoints} 检查点`;
 drawMap($('brief-map'),[],preview);
 const c=$('elevation-profile'),ctx=c.getContext('2d');ctx.clearRect(0,0,c.width,c.height);
 ctx.beginPath();preview.positions.forEach((p,i)=>{const x=i/(preview.positions.length-1)*c.width,y=c.height-8-(p.y-preview.bounds.min.y)/Math.max(1,preview.elevation)*(c.height-16);i?ctx.lineTo(x,y):ctx.moveTo(x,y);});
 ctx.strokeStyle='#e4b76c';ctx.lineWidth=2;ctx.stroke();ctx.lineTo(c.width,c.height);ctx.lineTo(0,c.height);ctx.closePath();ctx.fillStyle='#e4b76c22';ctx.fill();
}

function buildCircuitWorld(nextTrack){
 if(nextTrack.id.startsWith('custom-'))return createCustomWorld(scene,renderer,nextTrack,designStore.get(nextTrack.id));
 if(nextTrack.id!=='coast')return createRegionalWorld(scene,renderer,nextTrack);
 const prior=new Set(scene.children),next=createWorld(scene,renderer,nextTrack);next.root=new THREE.Group();next.root.name=nextTrack.english;[...scene.children].filter(c=>!prior.has(c)).forEach(c=>next.root.add(c));scene.add(next.root);return next;
}

function selectCircuit(id){
 if(!circuitCache.has(id)){
   const nextTrack=createSelectedTrack(id),nextWorld=buildCircuitWorld(nextTrack);
   nextWorld.sunLight.shadow.camera.layers.enable(1);
   circuitCache.set(id,{track:nextTrack,world:nextWorld});
 }
 const selected=circuitCache.get(id);track=selected.track;world=selected.world;
 circuitCache.forEach(entry=>entry.world.root.visible=entry.world===world);
 scene.environment=coastEnvironment;setQuality();
 document.querySelector('.hero-cn').textContent=`逐光 · ${track.name}`;
 document.querySelector('.hero .eyebrow').textContent=`${track.english} · ${track.tag}`;
 document.querySelector('.hero p').textContent=track.description;
 $('track-length').textContent=`${(track.length/1000).toFixed(2)} KM · 高差 ${Math.round(track.elevation)} M`;
 document.querySelector('.mini-caption').firstChild.textContent=`${track.english} / `;
 document.querySelector('#result-modal .eyebrow').textContent=`${track.english} / CLASSIFIED`;
 document.querySelector('.cinema-bottom small').textContent=track.english;
 document.querySelector('.location strong').textContent=track.name;
 document.querySelector('.location small').textContent=track.english;
}

function finishIntro(){
 if(!raceIntro)return;raceIntro.dispose();raceIntro=null;state='countdown';countdownTime=0;countdownNumber=-1;accumulator=0;keys.clear();Object.keys(touch).forEach(k=>touch[k]=false);show('hud');show('countdown');raceCamera(1,true);audio.say('ready');
}

function setupRace(){
 const selectedDesign=designStore.get($('circuit').value);
 if(selectedDesign){const result=validateDesign(selectedDesign);if(result.status==='draft'||$('mode').value==='race'&&!result.raceReady){toast('这条赛道尚未通过当前模式的检查，请回到编辑器修正。',5);return;}}
 if(player&&player.finishTime===null)saveSession('retired');
 raceSession={id:crypto.randomUUID(),startedAt:new Date().toISOString()};
 raceIntro?.dispose();raceIntro=null;
 selectCircuit($('circuit').value);
 mode=$('mode').value;difficulty=$('difficulty').value;theme=$('theme').value==='random'?(Math.random()<.5?'day':'night'):$('theme').value;totalLaps=mode==='time'?1:2;
 world.setTheme(theme);document.body.classList.toggle('night-theme',theme==='night');
 if(theme==='day'&&coastBackground)world.skyMesh.visible=false;
 if(theme==='night'){scene.background=new THREE.Color('#06101f');scene.environmentIntensity=.34;}else{scene.background=coastBackground;scene.environmentIntensity=.8;}
 hideModals();show('menu',false);show('studio',false);show('hud');controls.enabled=false;heroCar.visible=false;
 carMeshes.forEach(disposeCar);carMeshes=[];drivers=[];
 const names=['MIRA','ELIO','KAI','NOVA','REN','SORA','LUKA'];
 if(mode==='race')for(let i=0;i<7;i++){
   const slot=gridSlot(i,track);
   const d=createDriver(track,{id:`ai${i}`,name:names[i],model:VEHICLE_LIST[(i+2)%VEHICLE_LIST.length].id,...slot});
   drivers.push(d);
 }
 player=createDriver(track,{id:'player',name:'你',model:selectedModel,...(mode==='race'?gridSlot(7,track):{t:-5/track.length,lane:0}),isPlayer:true});
 drivers.push(player);
   drivers.forEach((d,i)=>{
     const car=createCar({model:d.model,color:d.isPlayer?paint:carColors[i%7],detail:d.isPlayer?'high':'low'});
     if(d.isPlayer)configureDynamicCarLights(car);
     const aiProfile={tint:['#e7f8ff','#ffe5b4','#b9d8ff'][i%3],brightness:2.4+(i%3)*.9,beam:8+(i%3)*4,highBeam:18+(i%3)*7,ambientBrightness:1.4+(i%2)*.8};
     const initialMode=theme==='night'?(d.isPlayer?1:(i%2===0?(i%3===0?2:1):0)):0;
     setCarLightMode(car,initialMode,d.isPlayer?playerLightProfile:aiProfile);d.lightMode=initialMode;d.lightProfile=d.isPlayer?playerLightProfile:aiProfile;
     if(d.isPlayer){
       car.traverse(o=>o.layers.set(1));
       // The car uses layer 1 for the cockpit camera, but its lights must also
       // reach the default world layer or they cannot illuminate the road.
       [...car.userData.beamLights,...car.userData.ambientPointLights].forEach(light=>{light.layers.enable(0);light.layers.enable(1);});
       cockpit=createCockpit(paint,VEHICLES[d.model]);car.add(cockpit.group);
     }
     scene.add(car);carMeshes.push(car);
   });
 stats.reset();stats.baseline(player,drivers);tireFX.reset();finishSequence=null;show('finish-cinema',false);passFlashUntil=0;$('hud').classList.remove('finish-mode');
 for(const key of Object.keys(counterValues))delete counterValues[key];
 $('pass-label').textContent='当前排名 · POSITION';$('silver-total').textContent=`/${String(drivers.length).padStart(2,'0')}`;
 raceTime=0;accumulator=0;countdownTime=0;countdownNumber=-1;lastPosition=drivers.length;lastOvertake=-20;
 cameraMode=0;camera.layers.set(0);camera.layers.enable(1);camera.near=.12;camera.fov=57;camera.updateProjectionMatrix();keys.clear();state='countdown';$('hud').classList.remove('cockpit-mode');
 $('hud-car').textContent=VEHICLES[selectedModel].label;$('competitors').textContent=`/ ${drivers.length}`;
 $('lap-label').textContent=mode==='time'?'TIME ATTACK / 计时':'LAP / 圈数';
 $('route-title').textContent=`${track.name}${theme==='night'?' · 暗夜':''}`;
 $('route-subtitle').textContent=`${track.english} / ${theme==='night'?'NIGHT RUN':'DAY RUN'}`;
 show('leaderboard',mode==='race');show('countdown');show('event-banner',false);
 updateMeshes(0);raceCamera(1,true);updateHUD();
 state='intro';show('hud',false);show('countdown',false);show('toast',false);
 raceIntro=new RaceIntro(scene,track,{mode,difficulty,theme,onDone:finishIntro,landingPose:chasePose(player,track)});raceIntro.update(0,camera);audio.start();
}

function inputState(){
 let throttle=keys.has('KeyW')||keys.has('ArrowUp')||touch.throttle?1:0;
 let brake=keys.has('KeyS')||keys.has('ArrowDown')||touch.brake?1:0;
 let steer=driverSteering(keys.has('KeyA')||keys.has('ArrowLeft')||touch.left,keys.has('KeyD')||keys.has('ArrowRight')||touch.right);
 let handbrake=keys.has('Space'),digital=true;
 const pad=navigator.getGamepads?.()?.find(p=>p?.connected);
 if(pad){
   const axis=Math.abs(pad.axes[0])>.12?pad.axes[0]:0;
   if(axis){steer=driverSteering(false,false,axis);digital=false;}
   throttle=Math.max(throttle,pad.buttons[7]?.value||0);brake=Math.max(brake,pad.buttons[6]?.value||0);handbrake||=pad.buttons[0]?.pressed;
   for(const [index,action] of [[9,'pause'],[3,'camera'],[2,'reset']]){
     if(pad.buttons[index]?.pressed&&!heldButtons.has(index)){heldButtons.add(index);if(action==='pause')togglePause();if(action==='camera')cycleCamera();if(action==='reset')resetPlayer();}
     if(!pad.buttons[index]?.pressed)heldButtons.delete(index);
   }
 }
 return {throttle,brake,steer,handbrake,digital};
}

function resetPlayer(){
 if(state!=='racing'||!player)return;
 const checkpointT=Math.max(0,(player.checkpoint-1)/track.checkpoints);
 const safeT=Math.max(checkpointT,player.startT+player.progress-4/track.length);
 resetDriver(player,track,safeT,0);player.progress=safeT-player.startT;player.penalty+=3;player.respawns++;
 stats.resetPosition(player,drivers);
 toast('已返回赛道 · 罚时 +3 秒');audio.say('reset');raceCamera(1,true);
}

function cycleCamera(){cameraMode=(cameraMode+1)%3;toast(['追尾镜头','驾驶席 · 车内第一人称','远景追尾'][cameraMode],1.5);$('hud').classList.toggle('cockpit-mode',cameraMode===1);if(player){updateMeshes(0);raceCamera(1,true);}}
function cyclePlayerLights(){
 if(!player||!['racing','countdown'].includes(state))return;
 const car=carMeshes[drivers.indexOf(player)];
 const mode=cycleCarLightMode(car,playerLightProfile);player.lightMode=mode;
 const labels=['车灯关闭','近光灯 · 夜间','远光灯 · 穿透','蓝红氛围灯 · 展示'];
 toast(`${labels[mode]} · L 切换`,1.4);
}
function togglePause(){
 if(state==='racing'||state==='countdown'){
   resumeState=state;state='paused';show('pause-modal');audio.pause();keys.clear();
 } else if(state==='paused'){
   hideModals();state=resumeState;audio.resume();lastFrame=performance.now();keys.clear();
 }
}

function finishRace(){
 state=drivers.every(d=>d.finishTime!==null)?'finished':'finishing';show('countdown',false);audio.say('finish');
 stats.finished=true;finishSequence={time:0,showResults:false};cameraMode=0;
 camera.layers.set(0);camera.layers.enable(1);camera.near=.12;$('hud').classList.remove('cockpit-mode');$('hud').classList.add('finish-mode');show('finish-cinema');
 $('finish-status').textContent=`P${String(ranking(drivers).indexOf(player)+1).padStart(2,'0')} / FINISH LINE CROSSED`;
 const entry=saveSession('finished');finishSequence.record=entry;
 if(entry)void submitGlobalResult();
 const badge=$('record-badge');badge.hidden=!entry?.newRecord;
 if(entry?.newRecord){badge.innerHTML=`${entry.newRecord==='improved'?'↗ 新纪录':'首条纪录'} <small>${entry.newRecord==='improved'?`提升 ${timeString(entry.improvement)}`:'本组首次完赛'} · 同车型 / 同比赛条件</small>`;$('finish-status').textContent+=entry.newRecord==='improved'?' / NEW RECORD':' / FIRST RECORD';}
 $('record-note').textContent=practiceReturnId?'自由试驾不计入本地成绩；返回后可以继续修改这条赛道。':`${entry?.previousBest?'此前最佳 '+timeString(entry.previousBest):'首次建立本组成绩'} · ${VEHICLES[selectedModel].name} · ${player.penalty?`罚时 ${player.penalty} 秒已计入总成绩`:'无复位罚时'}${archive.error?' · 本地保存失败':''}。`;
 renderResults();
}
function revealResults(){if(!finishSequence)return;finishSequence.showResults=true;finishSequence.time=Math.max(9,finishSequence.time);show('hud',false);show('finish-cinema',false);show('result-modal');$('record-badge').classList.remove('record-pop');void $('record-badge').offsetWidth;$('record-badge').classList.add('record-pop');renderResults();}
function renderResults(){
 const results=ranking(drivers),rank=results.indexOf(player)+1,bestLap=Math.min(...player.lapTimes);
 const final=drivers.every(d=>d.finishTime!==null);
 if(raceSession)archive.updateRank(raceSession.id,rank,final);
 $('result-title').textContent=mode==='time'?'TIME. WELL SPENT.':!final?'ACROSS THE LINE.':rank===1?'THE COAST IS YOURS.':'CHASE COMPLETE.';
 $('result-sub').textContent=!final?'你已冲线。其他车手仍在比赛，最终名次将包含复位罚时。':rank===1&&mode==='race'?'冠军。这条赛道，记住了你的名字。':'冲线。每一个弯，都有再快一点的可能。';
 $('result-position').textContent=mode==='time'?'TIME ATTACK':`${final?'':'暂列 '}${String(rank).padStart(2,'0')} / 08`;
 $('result-hero-rank').textContent=mode==='time'?'TT':`P${String(rank).padStart(2,'0')}`;
 $('result-time').textContent=timeString(player.finishTime);$('result-lap').textContent=timeString(bestLap);
 $('result-list').innerHTML=results.map((d,i)=>`<div class="result-row ${d.isPlayer?'player':''}"><span>${String(i+1).padStart(2,'0')}</span><span>${d.name} · ${VEHICLES[d.model].label}</span><span>${d.finishTime!==null?timeString(d.finishTime):'未完赛 · '+Math.min(99,Math.floor((d.startT+d.progress)/totalLaps*100))+'%'}</span></div>`).join('');
}

function simulate(dt){
 if(state==='countdown'){
   countdownTime+=dt;
   const number=countdownTime<1?4:countdownTime<2?3:countdownTime<3?2:countdownTime<4?1:0;
   if(number!==countdownNumber){countdownNumber=number;$('countdown').innerHTML=number===4?`<div><small>${track.english}</small><span style="font-size:64px">READY</span></div>`:number===0?'<div>GO<small>去追逐你的光</small></div>':`<div>${number}</div>`;if(number<4)audio.say(['go','one','two','three'][number]);}
   if(countdownTime>=4.55){state='racing';show('countdown',false);}
   return;
 }
 if(state!=='racing'&&state!=='finishing')return;
 const input=state==='racing'?inputState():{};if(state!=='racing'&&state!=='finishing')return;
 raceTime+=dt;
 for(const d of drivers){
   const controls=d.isPlayer&&state==='racing'?input:aiControls(d,track,drivers,difficulty);
   stepDriver(d,controls,track,dt);
   if(!d.isPlayer&&d.stuckTime>6){const t=Math.max((d.checkpoint-1)/track.checkpoints,d.startT+d.progress-5/track.length);resetDriver(d,track,t,0);d.progress=t-d.startT;d.penalty+=3;}
 }
 resolveCars(drivers,track,dt);
 if(state==='racing'){const passes=stats.update(player,drivers,track,dt);if(passes)showPass(passes);}
 for(const d of drivers){
   const event=updateRaceProgress(d,track,raceTime,totalLaps);
   if(d.isPlayer&&event==='lap'){banner('FINAL LAP','最后一圈 · 保持节奏',3);audio.say('finalLap');}
   if(d.isPlayer&&event==='finish'){finishRace();break;}
 }
 if(state==='finishing'&&drivers.every(d=>d.finishTime!==null)){state='finished';renderResults();}
}

function updateMeshes(dt){
 for(let i=0;i<drivers.length;i++){
   const d=drivers[i],car=carMeshes[i],s=track.sample(d.t);
   car.position.copy(d.position);car.rotation.set(-Math.asin(s.tangent.y),d.heading,0,'YXZ');
   updateCar(car,{steer:d.steer*(d.isPlayer?playerSteeringLimit(d.speed):steeringLimit(d.speed))/.44,speed:d.speed,brake:Math.max(d.brake,d.handbrake),time:elapsed,dt});
   car.visible=true;
 }
 if(cockpit){cockpit.group.visible=cameraMode===1&&!finishSequence;cockpit.update(player,dt);}
}

function menuCamera(dt,snap=false){
 const p=heroCar.position;
 const angle=.85+menuTime*(Math.PI*2/120);
 const offset=new THREE.Vector3(-Math.sin(angle)*9.4,2.4,Math.cos(angle)*9.4).applyQuaternion(heroCar.quaternion);
 camPos.copy(p).add(offset);
 const right=new THREE.Vector3(offset.z,0,-offset.x).normalize();
 camTarget.copy(p).add(new THREE.Vector3(0,.7,0)).addScaledVector(right,-1.75);
 // View offset makes deliberate space for the title without altering car geometry.
 if(snap)camera.position.copy(camPos);else camera.position.lerp(camPos,1-Math.exp(-2*dt));
 camera.lookAt(camTarget);
}

function raceCamera(dt,snap=false){
 if(!player)return;
 const p=player.position,dir=new THREE.Vector3(Math.sin(player.heading),0,Math.cos(player.heading));
 const ground=track.sample(player.t);
 camera.layers.set(0);camera.layers.enable(cameraMode===1?2:1);camera.near=cameraMode===1?.025:.12;
 if(cameraMode===1){
   const q=carMeshes[drivers.indexOf(player)].quaternion;
   camPos.copy(cockpit.eye).applyQuaternion(q).add(p);
   camTarget.copy(cockpit.eye).add(new THREE.Vector3(0,.01,40)).applyQuaternion(q).add(p);
 }
 else {
   const pose=chasePose(player,track,cameraMode===2);camPos.copy(pose.position);camTarget.copy(pose.target);
 }
 if(snap||cameraMode===1){camera.position.copy(camPos);aimTarget.copy(camTarget);}else{
   // Follow translation immediately; ease only the framing through turns/slopes.
   // Damping world-space height and aim separately makes the car bob in frame.
   cameraTravel.subVectors(p,lastPlayerPosition);
   camera.position.add(cameraTravel);aimTarget.add(cameraTravel);
   const follow=1-Math.exp(-12*dt);
   camera.position.lerp(camPos,follow);aimTarget.lerp(camTarget,follow);
 }
 lastPlayerPosition.copy(p);
 camera.lookAt(aimTarget);
 const targetFov=cameraMode===1?78:57+(settings.dynamicCamera?Math.min(9,player.speed*.12):0);
 camera.fov=THREE.MathUtils.lerp(camera.fov,targetFov,1-Math.exp(-3*dt));camera.updateProjectionMatrix();
}

function finishCamera(dt){
 if(!finishSequence||!player)return;
 finishSequence.time+=dt;const t=finishSequence.time;
 if(t>=9&&!finishSequence.showResults)revealResults();
 const p=player.position,heading=player.heading;
 let offset,target=new THREE.Vector3(0,.7,0),fov=43;
 if(t<2.7){offset=new THREE.Vector3(-4.1+t*.35,1.3,5.8-t*.18);}
 else if(t<5.3){const a=(t-2.7)/2.6;offset=new THREE.Vector3(-3.8,.80+a*.22,-1.6-2.2*a);target.set(-.2,.65,-.7);fov=40;}
 else {const a=.3+(t-5.3)*.28;offset=new THREE.Vector3(-Math.cos(a)*7.5,2.35+Math.sin(a*.4)*.25,Math.sin(a)*7.5);}
 const q=new THREE.Quaternion().setFromAxisAngle(up,heading);
 camPos.copy(offset).applyQuaternion(q).add(p);camTarget.copy(target).applyQuaternion(q).add(p);
 if(finishSequence.showResults){const screenRight=new THREE.Vector3().subVectors(camTarget,camPos).cross(up).normalize();camTarget.addScaledVector(screenRight,1.6);}
 camera.position.lerp(camPos,1-Math.exp(-5*dt));aimTarget.lerp(camTarget,1-Math.exp(-5*dt));camera.lookAt(aimTarget);
 camera.fov=THREE.MathUtils.lerp(camera.fov,fov,1-Math.exp(-4*dt));camera.updateProjectionMatrix();
}

function showPass(count){
 const rank=ranking(drivers).indexOf(player)+1;
 $('pass-label').textContent=`超越 +${count} · 现居第 ${rank} 名`;passFlashUntil=elapsed+2.8;
 if(!matchMedia('(prefers-reduced-motion: reduce)').matches){
  $('silver-rank').getAnimations().forEach(a=>a.cancel());
  $('silver-rank').animate([{transform:'translateX(44px) scale(1.25)',opacity:0,filter:'blur(7px)'},{transform:'translateX(-3px) scale(1.03)',opacity:1,filter:'blur(0)',offset:.55},{transform:'none',opacity:1}],{duration:650,easing:'cubic-bezier(.16,1,.3,1)'});
  $('telemetry-panel').animate([{backgroundColor:'#c5eaff35'},{backgroundColor:'#c5eaff00'}],{duration:1100});
 }
 if(raceTime-lastOvertake>4){audio.say('overtake');lastOvertake=raceTime;}
}
function updateCounters(dt){
 if(!player)return;const data=stats.snapshot();
 const values={'stat-average':data.average,'stat-top':data.top,'stat-passes':data.overtakes,'result-average':data.average,'result-top':data.top,'result-passes':data.overtakes};
 for(const [id,target] of Object.entries(values)){
  const result=id.startsWith('result-');if(result&&!finishSequence?.showResults)continue;
  counterValues[id]??=0;counterValues[id]+= (target-counterValues[id])*(1-Math.exp(-(result?3.5:9)*dt));
  $(id).textContent=String(Math.round(counterValues[id])).padStart(id==='stat-passes'?2:result?1:3,'0');
 }
 if(elapsed>passFlashUntil)$('pass-label').textContent='当前排名 · POSITION';
}

function updateShadow(){
 if(!world.sunLight)return;
 const focus=player&&(state!=='menu'&&state!=='studio')?player.position:heroCar.position;
 world.sunLight.target.position.copy(focus);world.sunLight.position.copy(focus).addScaledVector(world.sunDirection,180);
 const shadow=world.sunLight.shadow.camera;
 shadow.left=-55;shadow.right=55;shadow.top=55;shadow.bottom=-55;shadow.near=.5;shadow.far=400;shadow.updateProjectionMatrix();
 world.sunLight.target.updateMatrixWorld();
}

function updateHUD(){
 if(!player)return;
 const ordered=ranking(drivers),rank=ordered.indexOf(player)+1;
 $('silver-rank').textContent=String(rank).padStart(2,'0');$('stat-lap').textContent=String(Math.min(totalLaps,player.lap+1)).padStart(2,'0');$('stat-laps').textContent=` / ${String(totalLaps).padStart(2,'0')}`;
 $('position').textContent=rank;$('speed').textContent=String(Math.round(player.speed*3.6)).padStart(3,'0');
 $('gear').textContent=player.speed<1?'N':Math.min(7,1+Math.floor(player.speed/13));
 $('lap').textContent=`${Math.min(totalLaps,player.lap+1)} / ${totalLaps}`;$('timer').textContent=timeString(raceTime+player.penalty);
 $('rpm').style.width=`${18+((player.speed%13)/13)*80}%`;
 const progress=THREE.MathUtils.clamp((player.startT+player.progress)/totalLaps,0,1);
 $('race-progress').style.width=`${progress*100}%`;$('distance-left').textContent=`${((1-progress)*totalLaps*track.length/1000).toFixed(2)} KM`;
 $('drive-assist').textContent=player.slip>.24?'SLIP · 控制油门':'TCS · ABS';
 $('leaderboard').innerHTML=ordered.slice(0,4).map((d,i)=>`<div class="leader-row ${d.isPlayer?'player':''}"><b>${i+1}</b><span>${d.name}</span><span>${d.isPlayer?'YOU':d.finishTime!==null?'FIN':`${Math.max(0,((ordered[0].startT+ordered[0].progress)-(d.startT+d.progress))*track.length/Math.max(d.speed,20)).toFixed(1)}s`}</span></div>`).join('');
 drawMap($('minimap'),drivers);
 lastPosition=rank;
}

async function exportModel(){
 const button=$('export-model');button.disabled=true;button.textContent='导出中…';
 try{
   const model=createCar({model:selectedModel,color:paint,detail:'high'});
   model.traverse(o=>{o.userData={};});
   const data=await new GLTFExporter().parseAsync(model,{binary:true,onlyVisible:true});
   const url=URL.createObjectURL(new Blob([data],{type:'model/gltf-binary'}));
   const a=document.createElement('a');a.href=url;a.download=`AFTERLIGHT-${selectedModel}.glb`;a.click();
   setTimeout(()=>URL.revokeObjectURL(url),10000);disposeCar(model);toast('原创模型已导出，可在 Blender 等三维软件中打开。');
 }catch(error){console.error(error);toast('模型导出失败，请重试。');}finally{button.disabled=false;button.textContent='导出 GLB ↓';}
}

function bindUI(){
 $('play').onclick=$('nav-race').onclick=()=>{show('race-modal');circuitBrief();};
 $('circuit').onchange=circuitBrief;
 $('create-track').onclick=()=>openTrackEditor();
 $('my-tracks').onclick=()=>openTrackEditor(designStore.items[0]||null);
 $('showroom').onclick=$('nav-studio').onclick=openStudio;
 $('open-garage').onclick=$('studio-choose').onclick=()=>openGarage();
 $('open-history').onclick=openHistory;
 $('open-leaderboard').onclick=openLeaderboard;
 $('leaderboard-retry').onclick=()=>{if(raceSession)raceSession.leaderboardState='failed';submitGlobalResult();};
 $('studio-back').onclick=returnMenu;$('nav-settings').onclick=()=>show('settings-modal');
 $('start-race').onclick=setupRace;$('resume').onclick=togglePause;
 $('restart').onclick=$('result-retry').onclick=setupRace;
 $('quit').onclick=$('result-home').onclick=returnMenu;
 $('pause-settings').onclick=()=>show('settings-modal');
 document.querySelectorAll('[data-close]').forEach(e=>e.onclick=()=>show(e.dataset.close,false));

 document.querySelectorAll('[data-paint]').forEach(e=>e.onclick=()=>{openGarage();garage.selection.color(e.dataset.paint);garage.car.userData.paint.color.set(e.dataset.paint);garage.paintUI();});
 document.querySelectorAll('[data-view]').forEach(e=>e.onclick=()=>setStudioView(e.dataset.view));
 $('export-model').onclick=exportModel;
 $('skip-cinema').onclick=revealResults;
 $('mode').onchange=()=>{$('difficulty').disabled=$('mode').value==='time';circuitBrief();};
 $('theme').onchange=()=>{const value=$('theme').value;$('brief-atmosphere').textContent=value==='night'?'夜间路面 · 霓虹潮汐':value==='random'?'昼夜随机 · 每次不同':'干燥路面 · 黄金时刻';};
 for(const [id,key] of [['quality','quality'],['sound-enabled','sound'],['voice-enabled','voice'],['dynamic-camera','dynamicCamera'],['show-fps','fps']])$(id).onchange=()=>{settings[key]=id==='quality'?$(id).value:$(id).checked;syncSettings();writeSave('afterlight.settings',settings);};
 window.addEventListener('keydown',e=>{
   if(state==='editor')return;
   if(state==='history'){if(e.code==='Escape'){e.preventDefault();closeHistory();}return;}
   if(state==='leaderboard'){if(e.code==='Escape'){e.preventDefault();closeLeaderboard();}return;}
   if(state==='intro'&&['Space','Enter','Escape'].includes(e.code)){e.preventDefault();raceIntro.skip();return;}
   if(['SELECT','INPUT','TEXTAREA'].includes(document.activeElement?.tagName))return;
   if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code))e.preventDefault();
   keys.add(e.code);if(e.repeat)return;
   if(e.code==='Escape'){if(!$('settings-modal').hidden)show('settings-modal',false);else if(!$('race-modal').hidden)show('race-modal',false);else if(state==='studio')returnMenu();else togglePause();}
   if(e.code==='KeyC'&&['racing','countdown'].includes(state))cycleCamera();
   if(e.code==='KeyL'&&['racing','countdown'].includes(state))cyclePlayerLights();
   if(e.code==='KeyR')resetPlayer();
   if(e.code==='KeyM'){settings.sound=!settings.sound;syncSettings();writeSave('afterlight.settings',settings);toast(settings.sound?'声音已开启':'声音已关闭',1.5);}
 });
 window.addEventListener('keyup',e=>keys.delete(e.code));
 window.addEventListener('blur',()=>{keys.clear();Object.keys(touch).forEach(k=>touch[k]=false);if(['racing','countdown'].includes(state))togglePause();});
 document.addEventListener('visibilitychange',()=>{if(document.hidden&&['racing','countdown'].includes(state))togglePause();});
 document.querySelectorAll('[data-touch]').forEach(button=>{
   button.addEventListener('pointerdown',e=>{e.preventDefault();button.setPointerCapture(e.pointerId);touch[button.dataset.touch]=true;});
   for(const event of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(event,()=>touch[button.dataset.touch]=false);
 });
 window.addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});
 controls.addEventListener('start',()=>studioTransition=0);
}

function frame(now){
 requestAnimationFrame(frame);
 const dt=Math.min((now-lastFrame)/1000,.07);lastFrame=now;elapsed+=dt;menuTime+=dt;frameCount++;
 if(state==='garage'){garage.update(dt);return;}
 if(state==='intro'){if(!document.hidden)raceIntro.update(dt,camera);}
 else if(state==='racing'||state==='countdown'||state==='finishing'){
   accumulator+=dt*(finishSequence ? (finishSequence.showResults ? .55 : .32) : 1);
   while(accumulator>=1/60){simulate(1/60);accumulator-=1/60;}
   updateMeshes(dt);if(!finishSequence)raceCamera(dt);
   audio.update({speed:player.speed,throttle:player.throttle,brake:player.brake,slip:player.slip,model:selectedModel,dt});
 } else if(state==='menu'||state==='history'||state==='leaderboard')menuCamera(dt);
 else if(state==='finished')audio.update({speed:0,throttle:0,brake:0,slip:0,model:selectedModel,dt});
 else if(state==='studio'){
   if(studioTransition>0){camera.position.lerp(camPos,1-Math.exp(-6*dt));controls.target.lerp(camTarget,1-Math.exp(-6*dt));studioTransition-=dt;}
   controls.update();updateCar(heroCar,{steer:Math.sin(elapsed*.6)*.12,speed:0,brake:0,time:elapsed,dt});
   audio.update({speed:0,throttle:0,brake:0,slip:0,model:selectedModel,dt});
 }
 if(finishSequence)finishCamera(dt);
 tireFX.update(player,track,state==='paused'?0:dt,state==='racing');updateCounters(dt);
 world.update(elapsed,dt);updateShadow();
 if(elapsed-lastHud>.09){lastHud=elapsed;if(player)updateHUD();if(state==='finishing')renderResults();}
 if(elapsed>toastUntil)show('toast',false);if(elapsed>eventUntil)show('event-banner',false);
 renderer.render(scene,camera);
 fpsElapsed+=dt;fpsFrames++;
 if(fpsElapsed>.7){$('fps').textContent=`${Math.round(fpsFrames/fpsElapsed)} FPS · ${renderer.info.render.calls} CALLS · ${(renderer.info.render.triangles/1000000).toFixed(2)}M TRI`;fpsElapsed=0;fpsFrames=0;}
}

async function boot(){
 try{
   renderer=new THREE.WebGLRenderer({canvas:$('scene'),antialias:true,powerPreference:'high-performance'});
   renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;
   renderer.toneMappingExposure=1.05;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
   scene=new THREE.Scene();camera=new THREE.PerspectiveCamera(43,innerWidth/innerHeight,.12,10000);camera.layers.enable(1);
   controls=new OrbitControls(camera,$('scene'));controls.enabled=false;controls.enableDamping=true;controls.dampingFactor=.07;
   setQuality();await new Promise(requestAnimationFrame);
   track=createTrack('harbor');world=buildCircuitWorld(track);
   circuitCache.set(track.id,{track,world});
   world.sunLight.shadow.camera.layers.enable(1);world.setTheme('day');tireFX=new TireFX(scene);
   const pmrem=new THREE.PMREMGenerator(renderer);
   studioEnvironment=pmrem.fromScene(new RoomEnvironment(),.035).texture;
   coastEnvironment=scene.environment;coastBackground=null;
   try{
     const hdr=await new RGBELoader().loadAsync(`${import.meta.env.BASE_URL}environment/kloppenheim_06_puresky_2k.hdr`);
     hdr.mapping=THREE.EquirectangularReflectionMapping;
     coastEnvironment=pmrem.fromEquirectangular(hdr).texture;coastBackground=hdr;
     scene.environment=coastEnvironment;scene.background=hdr;
     world.skyMesh.visible=false;
   }catch(error){console.info('Using original procedural sky fallback.');}
   pmrem.dispose();scene.environmentIntensity=.8;
   studioFloor=new THREE.Group();studioFloor.name='studio-cyclorama';studioFloor.visible=false;
   const floor=new THREE.Mesh(new THREE.CircleGeometry(300,128),new THREE.MeshStandardMaterial({color:'#0b141a',roughness:.4,metalness:.3}));
   floor.rotation.x=-Math.PI/2;floor.position.y=-.012;floor.receiveShadow=true;studioFloor.add(floor);
   const ring=new THREE.Mesh(new THREE.RingGeometry(3.6,3.615,120),new THREE.MeshBasicMaterial({color:'#637575'}));ring.rotation.x=-Math.PI/2;ring.position.y=-.006;studioFloor.add(ring);scene.add(studioFloor);
   studioLighting=new THREE.Group();studioLighting.visible=false;
   const keyLight=new THREE.DirectionalLight('#ffe7ca',3.3);keyLight.position.set(4,7,4);keyLight.castShadow=true;
   keyLight.shadow.mapSize.set(2048,2048);Object.assign(keyLight.shadow.camera,{left:-8,right:8,top:8,bottom:-8,near:.1,far:30});keyLight.shadow.normalBias=.018;studioLighting.add(keyLight);
   const fill=new THREE.HemisphereLight('#aac8e2','#142025',.6);studioLighting.add(fill);scene.add(studioLighting);
   $('loading-status').textContent='抛光车身，准备第一缕阳光';await new Promise(requestAnimationFrame);
   selectCar(selectedModel);setPaint(paint);
   garage=new Garage(renderer,studioEnvironment,{onCancel:()=>{returnMenu();if(garageReturn==='studio')openStudio();},onConfirm:saved=>{savedGarage=saved;writeSave(GARAGE_KEY,saved);paint=saved.colors[saved.selected];selectCar(saved.selected);setPaint(paint);returnMenu();show('race-modal');circuitBrief();}});
   historyScreen=new HistoryScreen(archive,closeHistory);
   leaderboardScreen=new LeaderboardScreen({onBack:closeLeaderboard});
   trackEditor=new TrackEditor(designStore,{
     onBack:()=>{state='menu';show('menu');menuCamera(1,true);},
     onSave:(design,result,deletedId)=>{syncCustomCircuits(design?.id||deletedId||null);historyScreen?.render();},
     onLaunch:(design,result,launchMode)=>{
       syncCustomCircuits(design.id);$('circuit').value=design.id;
       $('mode').value=launchMode==='race'?'race':'time';
       practiceReturnId=launchMode==='practice'?design.id:null;
       state='menu';setupRace();
     },
   });
   syncCustomCircuits();
   syncSettings();bindUI();
   selectCircuit('harbor');
   $('brief-distance').textContent=`${(track.length/1000).toFixed(2)} KM · 2 圈`;
   state='menu';menuCamera(1,true);updateShadow();
   await renderer.compileAsync(scene,camera);renderer.render(scene,camera);
   $('loading').style.opacity='0';setTimeout(()=>show('loading',false),650);
   lastFrame=performance.now();requestAnimationFrame(frame);
   // Read-only telemetry for local smoke tests; no gameplay shortcuts in the shipped UI.
   window.__afterlight={get state(){return state;},get track(){return {id:track.id,name:track.name,length:track.length,width:track.width,elevation:track.elevation};},get telemetry(){return {cameraFov:camera.fov,cameraQuaternion:camera.quaternion.toArray(),state,introTime:raceIntro?.time??null,raceTime,circuit:track.id,visibleWorlds:[...circuitCache].filter(([,entry])=>entry.world.root.visible).map(([id])=>id),theme:world.theme,nightDetailsVisible:world.night.group.visible,nightLightCount:world.night.lights.length,model:selectedModel,paint,garage:garage?.telemetry,lightMode:player?.lightMode??0,stats:stats.snapshot(),cameraMode,cameraLayers:camera.layers.mask,cameraPosition:camera.position.toArray(),finishSequence,smoke:tireFX.activeCount,audio:{state:audio.context?.state||'not-started',voices:audio.voices.size},drivers:drivers.map(d=>({id:d.id,offset:d.offset,targetLane:d.targetLane,driveTime:d.driveTime,collisionCooldown:d.collisionCooldown,t:d.t,progress:d.progress,speed:d.speed,heading:d.heading,position:d.position.toArray(),handbrake:d.handbrake,steer:d.steer,lap:d.lap,checkpoint:d.checkpoint,finishTime:d.finishTime,penalty:d.penalty,lightMode:d.lightMode})),shaderPrograms:renderer.info.programs.length,drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,frameCount};}};
   if(import.meta.env.DEV&&new URLSearchParams(location.search).has('qa')){
     window.__afterlight.qaLocate=(t)=>{resetDriver(player,track,t,0);stats.resetPosition(player,drivers);updateMeshes(0);raceCamera(1,true);};
     window.__afterlight.qaArrangePass=()=>{
       resetDriver(player,track,.10,2.6);player.progress=.10-player.startT;player.speed=35;
       drivers.filter(d=>d!==player).forEach((d,i)=>{const t=i===0?.103:.17+i*.015;resetDriver(d,track,t,-2.6);d.progress=t-d.startT;d.speed=i===0?14:40;});
       stats.reset();stats.baseline(player,drivers);updateMeshes(0);raceCamera(1,true);
     };
     window.__afterlight.qaDrive=(seconds)=>{
       for(let tick=0;tick<seconds*60;tick++){
         if(state==='racing'){
           raceTime+=1/60;
           for(const d of drivers)stepDriver(d,aiControls(d,track,drivers,difficulty),track,1/60);
           resolveCars(drivers,track,1/60);
           const passes=stats.update(player,drivers,track,1/60);if(passes)showPass(passes);
           for(const d of drivers){const event=updateRaceProgress(d,track,raceTime,totalLaps);if(d===player&&event==='finish'){finishRace();break;}}
         }else simulate(1/60);
       }
       updateMeshes(0);updateHUD();
       return window.__afterlight.telemetry;
     };
   }
 }catch(error){console.error(error);$('loading-status').textContent='场景未能启动：'+error.message;$('loading').innerHTML+='<p style="position:absolute;bottom:20%;left:15%;right:15%;text-align:center;font-size:12px">请使用支持 WebGL 2 的 Chrome 或 Edge，并开启硬件加速。刷新页面可重试。</p>';}
}
boot();
