import * as THREE from 'three';
import {addBox as box,addCylinderBetween as beam,instance,seeded,batchStaticMeshes} from './world.js';

const V=(x,y,z)=>new THREE.Vector3(x,y,z);
export const HARBOR_LAKE={x:0,z:40,rx:175,rz:235,level:1};
const contour=a=>1+.045*Math.sin(a*3)+.025*Math.cos(a*5);
export function lakePoint(a,r=1){
  const l=HARBOR_LAKE,f=contour(a)*r;
  return V(l.x+l.rx*Math.cos(a)*f,l.level,l.z+l.rz*Math.sin(a)*f);
}
export function lakeRadius(x,z){
  const l=HARBOR_LAKE,u=(x-l.x)/l.rx,v=(z-l.z)/l.rz;
  return Math.hypot(u,v)/contour(Math.atan2(v,u));
}
export function carveLake(x,z,ground){
  const r=lakeRadius(x,z);
  if(r>=1.14)return ground;
  const bed=.55-9*Math.max(0,1-r*r);
  return THREE.MathUtils.lerp(bed,ground,THREE.MathUtils.smoothstep(r,1,1.14));
}
const material=(color,roughness=.65,metalness=.08)=>new THREE.MeshStandardMaterial({color,roughness,metalness});

function boat(kind,color){
  const g=new THREE.Group();g.name=`Lake ${kind}`;
  const length=kind==='yacht'?26:kind==='sailboat'?22:kind==='tug'?20:15,width=kind==='tug'?7:kind==='yacht'?6.4:4.6;
  const paint=material(color,.43,.15),cream=material('#c9ccc5',.55),glass=material('#193a42',.26,.25),steel=material('#768584',.42,.5),rubber=material('#202e30'),teak=material('#796348');
  const rings=[[-.5,.58],[-.42,.9],[-.2,1],[.12,.98],[.31,.74],[.43,.35],[.5,.012]],cross=[[-1,1.1],[-1,-.12],[-.65,-1.12],[0,-1.5],[.65,-1.12],[1,-.12],[1,1.1]];
  const vertices=[],indices=[];
  rings.forEach(([z,w])=>cross.forEach(([x,y])=>vertices.push(x*width*.5*w,y,z*length)));
  for(let i=0;i<rings.length-1;i++)for(let j=0;j<cross.length;j++){
    const a=i*7+j,b=i*7+(j+1)%7,c=a+7,d=b+7;indices.push(a,b,c,b,d,c);
  }
  // Close the transom and bow as well as the deck, rather than using a box hull.
  for(const end of [0,rings.length-1])for(let j=1;j<6;j++){
    const a=end*7;end?indices.push(a,a+j,a+j+1):indices.push(a,a+j+1,a+j);
  }
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geo.setIndex(indices);geo.computeVertexNormals();
  const hull=new THREE.Mesh(geo,paint);hull.castShadow=true;hull.receiveShadow=true;g.add(hull);
  box(g,teak,[0,1.15,-length*.10],[width*.76,.12,length*.56]);
  for(let z=-length*.35;z<length*.17;z+=.55)box(g,steel,[0,1.22,z],[width*.72,.012,.018],0,false);
  // Raked bow rails, stanchions and portholes.
  for(const side of [-1,1]){
    const points=rings.slice(0,-1).map(([z,w])=>V(side*width*.47*w,2.0,z*length));
    for(let i=0;i<points.length;i++){
      beam(g,points[i].clone().setY(1.15),points[i],.035,steel,6);
      if(i)beam(g,points[i-1],points[i],.028,steel,6);
    }
    for(let z=-length*.28;z<length*.21;z+=2.8){
      const port=new THREE.Mesh(new THREE.CircleGeometry(.26,16),glass);port.rotation.y=side*Math.PI/2;port.position.set(side*(width*.49),.55,z);g.add(port);
    }
  }
  if(kind==='sailboat'){
    box(g,cream,[0,1.7,-2],[3,1.1,6]);box(g,glass,[0,2.05,.99],[2.5,.55,.06]);
    beam(g,V(0,1.2,1),V(0,19,1),.10,steel,10);beam(g,V(0,3,1),V(0,3,-7),.07,steel,8);
    const sailMat=material('#b7c0b8',.96);sailMat.side=THREE.DoubleSide;
    // Curved sail panels catch the breeze; narrow seams describe sewn cloth.
    for(const forward of [false,true]){
      const pos=[],ix=[],n=14;
      for(let row=0;row<=n;row++){
        const v=row/n,y=3+v*(forward?12:15),reach=(1-v)*(forward?7:-8);
        for(let col=0;col<=n;col++){const u=col/n;pos.push(Math.sin(u*Math.PI)*(1-v)*.8,y,1+u*reach);if(row<n&&col<n){const a=row*(n+1)+col;ix.push(a,a+1,a+n+1,a+1,a+n+2,a+n+1);}}
      }
      const sg=new THREE.BufferGeometry();sg.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));sg.setIndex(ix);sg.computeVertexNormals();const sail=new THREE.Mesh(sg,sailMat);sail.castShadow=true;g.add(sail);
    }
    for(const side of [-1,1])beam(g,V(side*width*.45,1.2,-4),V(0,18.5,1),.018,steel,4);
  }else{
    const cabinLength=kind==='yacht'?10:kind==='tug'?7:4;
    box(g,cream,[0,2.4,-1],[width*.74,2.5,cabinLength]);
    box(g,glass,[0,2.8,cabinLength/2-.96],[width*.64,1.3,.09]);
    for(const side of [-1,1]){
      box(g,glass,[side*width*.375,2.8,-1],[.08,1.3,cabinLength*.83]);
      for(let z=-cabinLength/2;z<cabinLength/2;z+=2)box(g,cream,[side*width*.383,2.8,z-1],[.1,1.45,.09]);
    }
    box(g,cream,[0,3.75,-1],[width*.82,.22,cabinLength+1]);
    if(kind==='yacht'){
      box(g,teak,[0,3.9,-1],[width*.66,.12,7]);box(g,cream,[0,4.5,-3],[3.5,1.1,1]);
      beam(g,V(-2,3.9,1),V(-2,6,0),.1,steel);beam(g,V(2,3.9,1),V(2,6,0),.1,steel);box(g,cream,[0,6,0],[4.8,.18,4]);
    }
    if(kind==='tug'){
      box(g,paint,[0,4.7,-4],[1.5,2.1,1.8]);box(g,rubber,[0,5.9,-4],[1.7,.35,2]);
      for(const side of [-1,1])for(let z=-6;z<=5;z+=2.5){const fender=new THREE.Mesh(new THREE.TorusGeometry(.55,.19,8,16),rubber);fender.rotation.y=Math.PI/2;fender.position.set(side*width*.5,.3,z);g.add(fender);}
    }
    beam(g,V(0,3.8,-1),V(0,7.2,-1),.045,steel,6);box(g,cream,[0,6.3,-1],[2.7,.12,.2]);
  }
  const ring=new THREE.Mesh(new THREE.TorusGeometry(.42,.12,8,24),material('#b55d3c'));ring.position.set(0,2.3,-length*.5-.04);g.add(ring);
  batchStaticMeshes(g,new Set());
  return g;
}

export function createHarborLake(scene,terrain,p){
  const root=new THREE.Group();root.name='Harbor lake, channel and surrounding sea';scene.add(root);
  const time={value:0};
  const waterMat=new THREE.MeshStandardMaterial({color:'#173e43',roughness:.73,metalness:.06,envMapIntensity:.18});
  waterMat.onBeforeCompile=shader=>{
    shader.uniforms.lakeTime=time;
    const waves=`uniform float lakeTime; varying vec2 vLakeXZ;
      float swell(vec2 p){return .075*sin(dot(p,vec2(.19,.08))+lakeTime*.85)+.04*sin(dot(p,vec2(-.12,.31))-lakeTime*.67);}`;
    shader.vertexShader=waves+'\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\ntransformed.y += swell(position.xz); vLakeXZ=position.xz;');
    shader.vertexShader=shader.vertexShader.replace('#include <beginnormal_vertex>',`#include <beginnormal_vertex>
      objectNormal=normalize(vec3((swell(position.xz-vec2(.1,0.))-swell(position.xz+vec2(.1,0.)))/.2,1.,(swell(position.xz-vec2(0.,.1))-swell(position.xz+vec2(0.,.1)))/.2));`);
    shader.fragmentShader='uniform float lakeTime; varying vec2 vLakeXZ;\n'+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\nfloat lakeFade=1.-smoothstep(160.,1200.,length(vViewPosition));\ndiffuseColor.rgb *= .97 + .04*lakeFade*sin(dot(vLakeXZ,vec2(.63,.29))+lakeTime*.65)*cos(dot(vLakeXZ,vec2(-.21,.44))-lakeTime*.43);');
    shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
      vec2 p=vLakeXZ;
      float ripple=lakeFade*sin(p.x*1.7+lakeTime*.7+sin(p.y*.23))*cos(p.y*1.3-lakeTime*.5);
      normal=normalize(normal+(viewMatrix*vec4(ripple*.075,0.,ripple*.055,0.)).xyz);`);
  };
  waterMat.customProgramCacheKey=()=> 'harbor-water-v1';
  const positions=[],uv=[],idx=[],rings=164,segments=192;
  for(let j=0;j<=rings;j++)for(let i=0;i<=segments;i++){
    const angle=i/segments*Math.PI*2,radius=j<=144?j*10:1440*Math.pow(12000/1440,(j-144)/20);
    const q=V(Math.cos(angle)*radius,1,40+Math.sin(angle)*radius);positions.push(q.x,q.y,q.z);uv.push(i/segments,j/rings);
    if(j<rings&&i<segments){const a=j*(segments+1)+i;idx.push(a,a+1,a+segments+1,a+1,a+segments+2,a+segments+1);}
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.setIndex(idx);geometry.computeVertexNormals();
  const water=new THREE.Mesh(geometry,waterMat);water.name='Continuous lake-channel-sea with soft waves';water.receiveShadow=true;root.add(water);
  // Dense shoreline apron covers the coarse terrain grid and exposes a sloped bank.
  const shorePos=[],shoreIndices=[];
  for(let j=0;j<=8;j++)for(let i=0;i<=segments;i++){
    const r=.965+j/8*.175,q=lakePoint(i/segments*Math.PI*2,r);
    q.y=j===0?.65:Math.max(terrain.height(q.x,q.z)+.12,terrain.surfaceHeight(q.x,q.z)+.06);shorePos.push(...q.toArray());
    if(j<8&&i<segments){const a=j*(segments+1)+i;shoreIndices.push(a,a+1,a+segments+1,a+1,a+segments+2,a+segments+1);}
  }
  const shoreGeo=new THREE.BufferGeometry();shoreGeo.setAttribute('position',new THREE.Float32BufferAttribute(shorePos,3));shoreGeo.setIndex(shoreIndices);shoreGeo.computeVertexNormals();
  const bank=new THREE.Mesh(shoreGeo,material('#626b59',.97));bank.material.polygonOffset=true;bank.material.polygonOffsetFactor=-1;bank.material.polygonOffsetUnits=-3;bank.receiveShadow=true;root.add(bank);
  const rng=seeded(763),rocks=[];
  for(let i=0;i<170;i++){const q=lakePoint(i/170*Math.PI*2,1.02+rng()*.035);q.y=terrain.height(q.x,q.z)+.2;if(q.y<.7)continue;rocks.push({p:q,s:V(.8+rng()*1.5,.4+rng()*.6,.8+rng()*1.2),r:rng()*6});}
  instance(root,new THREE.IcosahedronGeometry(1,1),p.rock,rocks,true);
  const crowns=[],trunks=[],reeds=[];
  for(let i=0;i<80;i++){
    const a=i/80*Math.PI*2;
    if(Math.sin(a*4+.7)<-.2)continue;
    const q=lakePoint(a,1.09+rng()*.035);
    if(terrain.nearest(q.x,q.z).d<23||terrain.height(q.x,q.z)<1.4)continue;
    q.y=Math.max(terrain.height(q.x,q.z),terrain.surfaceHeight(q.x,q.z));
    const h=4+rng()*4;
    trunks.push({p:q.clone().add(V(0,h*.35,0)),s:V(.18,h*.7,.18)});
    crowns.push({p:q.clone().add(V(0,h*.8,0)),s:V(h*.36,h*.4,h*.33),r:rng()*6,color:i%2?'#47624d':'#63744c'});
  }
  for(let i=0;i<210;i++){
    const a=i/210*Math.PI*2;if(Math.cos(a*5)<.1)continue;
    const q=lakePoint(a,.997+rng()*.017);if(terrain.height(q.x,q.z)<.3)continue;q.y=Math.max(.8,terrain.surfaceHeight(q.x,q.z));
    const h=.6+rng()*.85;reeds.push({p:q.add(V(0,h/2,0)),s:V(.25,h,.25),r:rng()*6});
  }
  instance(root,new THREE.CylinderGeometry(.7,1,1,6),p.bark,trunks);
  instance(root,new THREE.IcosahedronGeometry(1,2),material('#ffffff',.95),crowns,true);
  instance(root,new THREE.ConeGeometry(1,1,5),material('#656b44',.95),reeds);
  // A timber jetty and mooring bollards anchor the boats to the city scenery.
  const pier=new THREE.Group();pier.position.set(-178,2.15,35);root.add(pier);
  for(let x=-12;x<=32;x+=.65)box(pier,p.wood,[x,0,0],[.59,.32,5],0,false);
  for(let x=-10;x<=30;x+=8)for(const side of [-1,1]){
    box(pier,p.steel,[x,-2.5,side*2],[.25,5,.25]);box(pier,p.steel,[x,.48,side*2.1],[.16,.9,.16]);
  }
  const specs=[['yacht','#c4c7bf',-135,47,1.6],['sailboat','#b5c4c2',50,-62,.5],['tug','#a46743',86,151,-.8],['launch','#4d777b',-57,194,2.2],['tug','#52767a',355,-89,1.73],['yacht','#aebbb7',-760,-180,.7],['sailboat','#c2b7a5',-160,-615,-.7],['launch','#8c7365',800,-125,1.65]];
  const boats=specs.map(([kind,color,x,z,heading],i)=>{
    const model=boat(kind,color);model.position.set(x,1,z);model.rotation.y=heading;root.add(model);
    return {model,x,z,heading,phase:i*1.7};
  });
  // Low-key port/starboard buoys mark the opening without flooding it with light.
  for(const [x,z,width] of [[240,-65,67],[380,-94,73],[640,-130,92],[870,-153,110]])for(const side of [-1,1]){
    const buoy=new THREE.Group();buoy.position.set(x,1,z+side*(width-14));root.add(buoy);
    const paint=material(side===1?'#91493d':'#3e7761',.72);
    const float=new THREE.Mesh(new THREE.CylinderGeometry(.7,1.05,.75,16),paint);float.position.y=.15;buoy.add(float);
    box(buoy,paint,[0,1.25,0],[.22,2.2,.22]);
    const cap=new THREE.Mesh(new THREE.ConeGeometry(.38,.75,12),paint);cap.position.y=2.5;buoy.add(cap);
  }
  batchStaticMeshes(root,new Set([water,bank,...boats.map(b=>b.model)]));
  return {root,boats,water,update(t){time.value=t;for(const b of boats){b.model.position.y=1+Math.sin(t*.6+b.phase)*.055;b.model.rotation.z=Math.sin(t*.43+b.phase)*.008;b.model.rotation.x=Math.sin(t*.51+b.phase)*.005;}},setTheme(dark){waterMat.envMapIntensity=dark?.10:.18;waterMat.color.set(dark?'#112c34':'#173e43');}};
}
