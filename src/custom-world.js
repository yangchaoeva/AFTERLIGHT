import * as THREE from 'three';
import {buildSky,buildRoad,buildNightDetails,makeRibbon,localFrame,addBox} from './world.js';
import {inPolygon} from './custom-track.js';

const material=(color,roughness=.83,metalness=.05)=>new THREE.MeshStandardMaterial({color,roughness,metalness});
function proximity(p,points,closed=true){let best=Infinity;for(let i=0;i<points.length-(closed?0:1);i++){const a=points[i],b=points[(i+1)%points.length],dx=b[0]-a[0],dz=b[1]-a[1],t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dz)/(dx*dx+dz*dz||1)));best=Math.min(best,Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dz));}return best;}
function surfaceHeight(x,z,design,roadSamples,halfWidth){
  const p=[x,z];let height=1.2+Math.sin(x*.011)*Math.cos(z*.009)*1.2,wet=false;
  for(const region of design.terrain){
    if(region.points.length<2)continue;
    if(region.type==='mountain'&&region.points.length>=3){const d=proximity(p,region.points);if(inPolygon(p,region.points))height=Math.max(height,1.2+Math.min(36,d*.75));}
    if(region.type==='lake'&&region.points.length>=3&&inPolygon(p,region.points)){height=-2.3;wet=true;}
    if(region.type==='river'&&proximity(p,region.points,false)<12){height=-2.3;wet=true;}
  }
  let near=Infinity,roadY=Infinity,lowerRoad=Infinity;
  for(const s of roadSamples){const d=Math.hypot(x-s.x,z-s.z);if(d<near){near=d;roadY=s.y;}if(d<halfWidth+8)lowerRoad=Math.min(lowerRoad,s.y);}
  if(!wet&&near<halfWidth+13){const blend=THREE.MathUtils.clamp((near-halfWidth-3)/10,0,1);height=THREE.MathUtils.lerp((Number.isFinite(lowerRoad)?lowerRoad:roadY)-.8,height,blend);}
  return height;
}
function terrainMesh(group,design,track){
  const b=track.bounds,rangeX=Math.max(600,b.max.x-b.min.x+350),rangeZ=Math.max(600,b.max.z-b.min.z+350);
  const center=b.getCenter(new THREE.Vector3()),nx=Math.min(180,Math.ceil(rangeX/10)),nz=Math.min(180,Math.ceil(rangeZ/10));
  const roadSamples=Array.from({length:Math.min(650,Math.ceil(track.length/9))},(_,i)=>track.sample(i/Math.min(650,Math.ceil(track.length/9))).position);
  const positions=[],colors=[],indices=[];
  const grass=new THREE.Color('#667d69'),rock=new THREE.Color('#938c78'),sand=new THREE.Color('#a39c7e');
  for(let iz=0;iz<=nz;iz++)for(let ix=0;ix<=nx;ix++){
    const x=center.x-rangeX/2+ix*rangeX/nx,z=center.z-rangeZ/2+iz*rangeZ/nz;
    const y=surfaceHeight(x,z,design,roadSamples,track.width/2);positions.push(x,y,z);
    const c=(y>17?rock:y<0?sand:grass).clone();c.multiplyScalar(.88+.13*(Math.sin(x*.043)*Math.cos(z*.036)*.5+.5));colors.push(c.r,c.g,c.b);
    if(ix<nx&&iz<nz){const a=iz*(nx+1)+ix;indices.push(a,a+nx+1,a+1,a+1,a+nx+1,a+nx+2);}
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometry.setIndex(indices);geometry.computeVertexNormals();
  const mesh=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({vertexColors:true,roughness:1,side:THREE.DoubleSide}));mesh.receiveShadow=true;group.add(mesh);return {mesh,roadSamples};
}
function water(group,design){
  const canvas=document.createElement('canvas');canvas.width=canvas.height=256;const ctx=canvas.getContext('2d');ctx.fillStyle='#568fa0';ctx.fillRect(0,0,256,256);
  let seed=413;const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  for(let i=0;i<1100;i++){ctx.strokeStyle=`rgba(199,226,224,${.015+rand()*.065})`;ctx.lineWidth=.5+rand()*1.4;const x=rand()*256,y=rand()*256;ctx.beginPath();ctx.moveTo(x,y);ctx.quadraticCurveTo(x+7,y-2,x+16+rand()*17,y+rand()*2);ctx.stroke();}
  const texture=new THREE.CanvasTexture(canvas);texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.repeat.set(3,3);
  const mat=new THREE.MeshStandardMaterial({color:'#286477',map:texture,metalness:.17,roughness:.42,transparent:true,opacity:.94,side:THREE.DoubleSide});
  const surfaces=[];
  for(const region of design.terrain){
    if(region.type==='lake'&&region.points.length>=3){
      const shape=new THREE.Shape();region.points.forEach(([x,z],i)=>i?shape.lineTo(x,-z):shape.moveTo(x,-z));shape.closePath();
      const mesh=new THREE.Mesh(new THREE.ShapeGeometry(shape),mat);mesh.rotation.x=-Math.PI/2;mesh.position.y=1.7;group.add(mesh);surfaces.push(mesh);
    }
    if(region.type==='river'&&region.points.length>=2){
      const v=[],idx=[];for(let i=0;i<region.points.length;i++){const p=region.points[i],a=region.points[Math.max(0,i-1)],b=region.points[Math.min(i+1,region.points.length-1)],dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz)||1;for(const side of [-1,1])v.push(p[0]-side*dz/len*11,1.7,p[1]+side*dx/len*11);if(i)idx.push(i*2-2,i*2-1,i*2,i*2-1,i*2+1,i*2);}
      const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(v,3));geometry.setIndex(idx);geometry.computeVertexNormals();const mesh=new THREE.Mesh(geometry,mat);group.add(mesh);surfaces.push(mesh);
    }
  }
  return {surfaces,texture};
}
function scenery(group,design,track,roadSamples){
  let seed=track.length|0;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const trunks=[],crowns=[],stones=[];const count=Math.min(420,Math.floor(track.length/16));
  for(let i=0;i<count;i++){
    const s=track.sample((i+.37)/count),side=random()<.5?-1:1,offset=track.width/2+17+random()*75;
    const x=s.position.x+s.right.x*side*offset,z=s.position.z+s.right.z*side*offset;
    if(roadSamples.some(p=>Math.hypot(p.x-x,p.z-z)<track.width/2+11))continue;
    const y=surfaceHeight(x,z,design,roadSamples,track.width/2);
    if(y<0)continue;
    if(y>15){stones.push({x,y,z,size:1.8+random()*3.5,angle:random()*6.28});continue;}
    const height=6+random()*10;trunks.push({x,y,z,height,angle:random()*6.28});crowns.push({x,y,z,height,angle:random()*6.28});
  }
  const dummy=new THREE.Object3D();
  const addInstances=(geometry,mat,items,place)=>{if(!items.length)return;const mesh=new THREE.InstancedMesh(geometry,mat,items.length);items.forEach((item,i)=>{place(item);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);});mesh.instanceMatrix.needsUpdate=true;mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);};
  addInstances(new THREE.CylinderGeometry(.32,.52,1,6),material('#574d3e',1),trunks,t=>{dummy.position.set(t.x,t.y+t.height*.24,t.z);dummy.rotation.set(0,t.angle,0);dummy.scale.set(1,t.height*.48,1);});
  addInstances(new THREE.ConeGeometry(1,1,7),material('#304d40',.95),crowns,t=>{dummy.position.set(t.x,t.y+t.height*.68,t.z);dummy.rotation.set(0,t.angle,0);dummy.scale.set(2.5+t.height*.13,t.height*.74,2.5+t.height*.13);});
  addInstances(new THREE.DodecahedronGeometry(1,0),material('#8d8879',.98),stones,t=>{dummy.position.set(t.x,t.y+t.size*.23,t.z);dummy.rotation.set(.2,t.angle,.15);dummy.scale.set(t.size*1.4,t.size*.65,t.size);});
}
export function createCustomWorld(scene,renderer,track,design){
  const prior=new Set(scene.children),sky=buildSky(scene,renderer),ground=new THREE.Group();scene.add(ground);
  const terrain=terrainMesh(ground,design,track),waterFeatures=water(ground,design);scenery(ground,design,track,terrain.roadSamples);
  const roadMesh=buildRoad(scene,track),bridgeMat=material('#b7bbaf'),steel=material('#84999b',.55,.65);
  const bridgeSamples=[];
  for(let i=0;i<track.length;i+=16){const s=track.sample(i/track.length),h=surfaceHeight(s.position.x,s.position.z,design,terrain.roadSamples,track.width/2);if(s.position.y-h>3)bridgeSamples.push(i/track.length);}
  if(bridgeSamples.length){
    const deck=new THREE.InstancedMesh(new THREE.BoxGeometry(track.width+1,1,16),bridgeMat,bridgeSamples.length);
    const beams=new THREE.InstancedMesh(new THREE.BoxGeometry(.28,1.1,16),steel,bridgeSamples.length*2);
    const dummy=new THREE.Object3D();
    bridgeSamples.forEach((t,i)=>{const s=track.sample(t),g=localFrame(s);dummy.quaternion.copy(g.quaternion);dummy.position.copy(s.position).addScaledVector(s.up,-.55);dummy.updateMatrix();deck.setMatrixAt(i,dummy.matrix);
      for(const [j,side]of [-1,1].entries()){dummy.position.copy(s.position).addScaledVector(s.right,side*(track.width/2+1)).addScaledVector(s.up,-.6);dummy.updateMatrix();beams.setMatrixAt(i*2+j,dummy.matrix);}
    });deck.instanceMatrix.needsUpdate=true;beams.instanceMatrix.needsUpdate=true;deck.castShadow=true;deck.receiveShadow=true;beams.receiveShadow=true;scene.add(deck,beams);
  }
  for(const t of bridgeSamples.filter((_,i)=>i%5===0)){
    const s=track.sample(t);if((track.crossings||[]).some(c=>Math.min(Math.abs(t-c.first*8/track.length),Math.abs(t-c.second*8/track.length))<.035))continue;
    for(const side of [-1,1]){const x=s.position.x+s.right.x*side*(track.width/2+1.4),z=s.position.z+s.right.z*side*(track.width/2+1.4),base=surfaceHeight(x,z,design,terrain.roadSamples,track.width/2),height=s.position.y-base-.8;
      if(height>3&&height<100){const support=new THREE.Mesh(new THREE.CylinderGeometry(.62,.9,height,7),bridgeMat);support.position.set(x,base+height/2,z);support.castShadow=true;scene.add(support);}
    }
  }
  const start=localFrame(track.sample(0));scene.add(start);for(const side of [-1,1])addBox(start,steel,[side*(track.width/2+1),3,0],[.25,6,.5]);addBox(start,steel,[0,6,0],[track.width+3,.45,.6]);
  const night=buildNightDetails(scene,track),root=new THREE.Group();root.name=track.english;
  [...scene.children].filter(c=>!prior.has(c)).forEach(c=>root.add(c));scene.add(root);
  let theme='day';
  return {root,roadMesh,terrain,night,sunDirection:sky.sunDirection,sunLight:sky.sunLight,hemiLight:sky.hemi,skyMesh:sky.sky,
    get theme(){return theme;},
    setTheme(value='day'){theme=value==='night'?'night':'day';const dark=theme==='night';night.group.visible=dark;sky.sky.visible=!dark;sky.sunLight.intensity=dark?.28:3.2;sky.hemi.intensity=dark?.18:.55;scene.fog=new THREE.FogExp2(dark?'#081324':'#bdc6c3',dark?.00043:.00031);return theme;},
    update(time){sky.update(time);waterFeatures.texture.offset.set(time*.004,time*.002);for(const [i,w]of waterFeatures.surfaces.entries())w.position.y=1.7+Math.sin(time*.75+i)*.08;},
    dispose(){waterFeatures.texture.dispose();sky.environment.dispose();root.traverse(o=>{o.geometry?.dispose();if(o.material){for(const m of Array.isArray(o.material)?o.material:[o.material])m.dispose();}});root.removeFromParent();},
  };
}
