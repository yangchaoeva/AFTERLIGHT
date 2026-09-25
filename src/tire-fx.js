import {getVehicle} from './vehicle-catalog.js';
import * as THREE from 'three';
export class TireFX {
 constructor(scene){
  const canvas=document.createElement('canvas');canvas.width=64;canvas.height=64;
  const ctx=canvas.getContext('2d'),g=ctx.createRadialGradient(32,32,1,32,32,32);
  g.addColorStop(0,'rgba(215,224,230,.65)');g.addColorStop(.4,'rgba(194,210,218,.32)');g.addColorStop(1,'rgba(180,199,213,0)');ctx.fillStyle=g;ctx.fillRect(0,0,64,64);
  this.texture=new THREE.CanvasTexture(canvas);this.puffs=[];this.cursor=0;this.accum=0;
  for(let i=0;i<90;i++){
   const mat=new THREE.SpriteMaterial({map:this.texture,transparent:true,opacity:0,depthWrite:false,color:'#d4dce3'});
   const mesh=new THREE.Sprite(mat);mesh.visible=false;scene.add(mesh);this.puffs.push({mesh,life:0,velocity:new THREE.Vector3(),max:1});
  }
  this.marks=[];this.markCursor=0;
  const geometry=new THREE.PlaneGeometry(.25,.65);geometry.rotateX(-Math.PI/2);
  for(let i=0;i<220;i++){const mesh=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({color:'#171b20',transparent:true,opacity:0,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2}));mesh.visible=false;scene.add(mesh);this.marks.push({mesh,life:0});}
 }
 reset(){for(const p of this.puffs){p.life=0;p.mesh.visible=false;}for(const p of this.marks){p.life=0;p.mesh.visible=false;}this.accum=0;}
 update(player,track,dt,active){
  for(const p of this.puffs)if(p.life>0){p.life-=dt;p.mesh.visible=p.life>0;p.mesh.position.addScaledVector(p.velocity,dt);const a=1-p.life/p.max;p.mesh.scale.setScalar(.3+a*1.5);p.mesh.material.opacity=Math.sin(Math.min(1,a)*Math.PI)*.48;}
  for(const p of this.marks)if(p.life>0){p.life-=dt;p.mesh.visible=p.life>0;p.mesh.material.opacity=Math.min(.22,p.life*.045);}
  if(!active||!player||player.speed<2||!(player.handbrake||player.slip>.42))return;
  this.accum+=dt;
  while(this.accum>.035){this.accum-=.035;const s=track.sample(player.t),f=new THREE.Vector3(Math.sin(player.heading),0,Math.cos(player.heading)),r=new THREE.Vector3(f.z,0,-f.x);
   for(const side of [-1,1]){
    const position=player.position.clone().addScaledVector(f,getVehicle(player.model).design?.rearAxle??-getVehicle(player.model).wheelbase/2).addScaledVector(r,side*(getVehicle(player.model).halfWidth-.15));
    position.y=s.position.y+.13;
    const p=this.puffs[this.cursor++%this.puffs.length];p.life=p.max=.8+Math.random()*.5;p.mesh.visible=true;p.mesh.position.copy(position);p.velocity.set((Math.random()-.5)*.8,.5+Math.random()*.35,(Math.random()-.5)*.8).addScaledVector(f,-player.speed*.03);p.mesh.material.opacity=0;
    const mark=this.marks[this.markCursor++%this.marks.length];mark.life=6;mark.mesh.visible=true;mark.mesh.position.copy(position);mark.mesh.position.y=s.position.y+.054;mark.mesh.rotation.set(-Math.asin(s.tangent.y),player.heading,0,'YXZ');mark.mesh.scale.z=(player.speed*.035+.25)/.65;mark.mesh.material.opacity=.22;
   }
  }
 }
 get activeCount(){return this.puffs.filter(p=>p.life>0).length;}
}
