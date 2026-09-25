import * as THREE from 'three';
export const INTRO_DURATION=15;
const smooth=t=>{t=THREE.MathUtils.clamp(t,0,1);return t*t*t*(t*(t*6-15)+10);};
export function introPose(track,time,aspect=16/9,landing=null){
 const center=track.bounds.getCenter(new THREE.Vector3()),radius=track.bounds.getSize(new THREE.Vector3()).length()/2;
 const fov=48,half=Math.min(THREE.MathUtils.degToRad(fov/2),Math.atan(Math.tan(THREE.MathUtils.degToRad(fov/2))*aspect));
 const distance=radius/Math.sin(half)*1.16,angle=-.25+Math.min(time,4.5)*.09;
 const overview=center.clone().add(new THREE.Vector3(Math.sin(angle)*.28,1,Math.cos(angle)*.28).normalize().multiplyScalar(distance));
 const tourStart={coast:.72,harbor:.31,mountain:.54}[track.id]??.2;
 const t=tourStart+Math.max(0,time-4.5)*.016,s=track.sample(t),ahead=track.sample(t+.022);
 const fly=s.position.clone().addScaledVector(s.right,track.id==='mountain'?100:75);fly.y+=track.id==='mountain'?145:110;
 const target=ahead.position.clone();target.y+=8;
 if(time<4.5)return {position:overview,target:center,fov,phase:0};
 if(time<7){const a=smooth((time-4.5)/2.5);return {position:overview.lerp(fly,a),target:center.lerp(target,a),fov,phase:1};}
 if(time<10)return {position:fly,target,fov,phase:1};
 const grid=track.sample(0),end=grid.position.clone().addScaledVector(grid.tangent,-36).addScaledVector(grid.right,16);end.y+=18;
 const a=smooth((time-10)/(INTRO_DURATION-10));
 const position=fly.lerp(landing?.position??end,a);position.y+=Math.sin(Math.PI*a)*80;
 return {position,target:target.lerp(landing?.target??grid.position.clone().add(new THREE.Vector3(0,2,0)),a),fov:48+((landing?.fov??57)-48)*a,phase:2};
}
export class RaceIntro{
 constructor(scene,track,{mode,difficulty,theme,onDone,landingPose}){
  this.landingPose=landingPose;this.scene=scene;this.track=track;this.onDone=onDone;this.time=0;this.fog=scene.fog;scene.fog=null;
  if(theme==='night'){this.fill=new THREE.HemisphereLight('#9ebbd9','#304359',1.35);scene.add(this.fill);}
  let ui=document.getElementById('race-intro');
  if(!ui){ui=document.createElement('section');ui.id='race-intro';ui.innerHTML=`<div class="intro-top"><span>AFTERLIGHT <b> / COURSE RECON</b></span><button id="intro-skip">跳过航拍 ↗ <small>SPACE / ENTER</small></button></div><div class="intro-title"><div class="intro-eyebrow"></div><h1></h1><p></p><div class="intro-facts"></div></div><div class="intro-bottom"><span id="intro-shot"></span><div class="intro-timeline"><i></i></div><span id="intro-time"></span></div>`;document.getElementById('app').append(ui);}
  this.ui=ui;ui.hidden=false;ui.querySelector('h1').textContent=track.name;ui.querySelector('.intro-eyebrow').textContent=`${track.english} / ${theme==='night'?'NIGHT EDITION':'GOLDEN HOUR'}`;
  ui.querySelector('p').textContent=track.description;
  const level={coast:'入门 · 流畅长弯',harbor:'进阶 · 城区复合弯',mountain:'挑战 · 高差连续弯'}[track.id];
  const difficultyLabel=mode==='time'?'无对手':({easy:'简单',normal:'标准',hard:'困难'}[difficulty]);
  ui.querySelector('.intro-facts').innerHTML=[['赛道难度',level],['比赛模式',mode==='time'?'单圈计时':'八车竞速 · 两圈'],['对手难度',difficultyLabel],['赛道长度',`${(track.length/1000).toFixed(2)} KM`],['垂直高差',`${Math.round(track.elevation)} M`]].map(([a,b])=>`<div><small>${a}</small><strong>${b}</strong></div>`).join('');
  ui.querySelector('#intro-skip').onclick=()=>this.skip();
  ui.animate([{opacity:0},{opacity:1}],{duration:650});
  const pts=track.positions.filter((_,i)=>i%3===0).map(p=>p.clone().add(new THREE.Vector3(0,5,0)));pts.push(pts[0].clone());
  this.line=new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),new THREE.LineBasicMaterial({color:'#edcb86',transparent:true,opacity:.85,depthTest:false,toneMapped:false}));this.line.frustumCulled=false;this.line.renderOrder=5;scene.add(this.line);
 }
 skip(){if(!this.skipFrom&&this.lastPose){this.skipFrom={position:this.lastPose.position.clone(),target:this.lastPose.target.clone(),fov:this.lastPose.fov};this.skipTime=0;}}
 update(dt,camera){
  this.time=Math.min(INTRO_DURATION,this.time+dt);let pose=introPose(this.track,this.time,camera.aspect,this.landingPose);
  let landingBlend=smooth((this.time-10)/(INTRO_DURATION-10)),done=this.time>=INTRO_DURATION;
  if(this.skipFrom){this.skipTime+=dt;const a=smooth(this.skipTime/1.2);landingBlend=a;done=this.skipTime>=1.2;pose={position:this.skipFrom.position.clone().lerp(this.landingPose.position,a),target:this.skipFrom.target.clone().lerp(this.landingPose.target,a),fov:THREE.MathUtils.lerp(this.skipFrom.fov,this.landingPose.fov,a),phase:2};}
  this.lastPose=pose;
  if(this.fill)this.fill.intensity=1.35*(1-landingBlend);
  if(this.fog&&landingBlend>0){this.blendFog??=this.fog.clone();if(this.fog.isFogExp2)this.blendFog.density=this.fog.density*landingBlend;else {this.blendFog.near=THREE.MathUtils.lerp(camera.far,this.fog.near,landingBlend);this.blendFog.far=THREE.MathUtils.lerp(camera.far,this.fog.far,landingBlend);}this.scene.fog=this.blendFog;}
  camera.position.copy(pose.position);camera.lookAt(pose.target);camera.fov=pose.fov;camera.updateProjectionMatrix();
  this.line.material.opacity=.85*(1-smooth((this.time-4.5)/2))*(1-landingBlend);this.ui.dataset.phase=pose.phase;
  this.ui.querySelector('#intro-shot').textContent=['01 / 全境俯瞰 · CIRCUIT OVERVIEW','02 / 沿线掠影 · ROUTE EXPLORATION','03 / 发车准备 · STARTING GRID'][pose.phase];
  this.ui.querySelector('.intro-timeline i').style.transform=`scaleX(${Math.min(1,Math.max(this.time/INTRO_DURATION,this.skipFrom?landingBlend:0))})`;this.ui.querySelector('#intro-time').textContent=`${String(Math.max(0,Math.ceil(this.skipFrom?1.2-this.skipTime:INTRO_DURATION-this.time))).padStart(2,'0')} SEC`;
  if(done)this.onDone();
 }
 dispose(){this.fill?.removeFromParent();this.fill?.dispose();this.scene.fog=this.fog;this.line.removeFromParent();this.line.geometry.dispose();this.line.material.dispose();this.ui.hidden=true;this.ui.querySelector('#intro-skip').onclick=null;}
}
