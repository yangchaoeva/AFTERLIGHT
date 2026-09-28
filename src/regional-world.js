import * as THREE from 'three';
import {createHarborCoast} from './harbor-coast.js';
import {lakeRadius,createHarborLake} from './harbor-lake.js';
import {buildSky,buildRoad,buildNightDetails,batchStaticMeshes,makeRibbon,addBox as box,addCylinderBetween as beam,addTextPanel as panel,localFrame,instance,seeded} from './world.js';

const V=(x,y,z)=>new THREE.Vector3(x,y,z);
const mat=(color,roughness=.7,metalness=.1)=>new THREE.MeshStandardMaterial({color,roughness,metalness});

function detailTexture(kind){
  const c=document.createElement('canvas');c.width=c.height=512;const x=c.getContext('2d'),rng=seeded(1923);
  x.fillStyle=kind==='stone'?'#999082':'#aaa9a0';x.fillRect(0,0,512,512);
  for(let i=0;i<28000;i++){const g=Math.floor(65+rng()*145);x.fillStyle=`rgba(${g},${g},${g},${.08+rng()*.25})`;const size=.5+rng()*3;x.fillRect(rng()*512,rng()*512,size,size);}
  if(kind==='stone')for(let i=0;i<18;i++){
    const y=i*29+rng()*14;x.beginPath();x.moveTo(0,y);for(let u=0;u<=512;u+=16)x.lineTo(u,y+Math.sin(u*.025+i)*5+rng()*3);x.strokeStyle=i%3?'#574b3b12':'#e3d9c00c';x.lineWidth=1+rng()*4;x.stroke();
  }
  else for(let i=0;i<8;i++){x.strokeStyle='#62676845';x.lineWidth=2;x.strokeRect((i%4)*128,Math.floor(i/4)*256,128,256);}
  const texture=new THREE.CanvasTexture(c);texture.colorSpace=THREE.SRGBColorSpace;texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.anisotropy=8;return texture;
}

// A road-conforming height field keeps every shoulder attached to the authored
// elevation. Bridge sections intentionally leave a valley beneath the deck.
function landscape(scene,track,mountain){
  const coast=mountain?null:createHarborCoast(track);
  const samples=Array.from({length:720},(_,i)=>track.sample(i/720));
  const bridge=mountain?[.61,.68]:[.235,.335];
  const nearest=(x,z)=>{
    let best=Infinity,result;
    samples.forEach((s,i)=>{const d=(s.position.x-x)**2+(s.position.z-z)**2;if(d<best){best=d;result={y:s.position.y,t:i/720,d:Math.sqrt(d)};}});
    return result;
  };
  const height=(x,z)=>{
    const s=nearest(x,z),noise=Math.sin(x*.012)*Math.cos(z*.017)*18+Math.sin((x+z)*.034)*4;
    const base=mountain?s.y+Math.min(160,s.d*.72)*Math.sin(x*.004+z*.003)+noise:3+Math.sin(x*.005)*.6;
    const overBridge=s.t>bridge[0]&&s.t<bridge[1];
    const floor=overBridge?(mountain?s.y-55:0):s.y-.65;
    const blend=THREE.MathUtils.smoothstep(s.d,track.width/2+6,mountain?88:65);
    const ground=THREE.MathUtils.lerp(floor,base,blend);
    return mountain?ground:coast.height(x,z,s,ground);
  };
  const geo=new THREE.PlaneGeometry(3200,3200,240,240);geo.rotateX(-Math.PI/2);
  const p=geo.attributes.position,colors=[];
  for(let i=0;i<p.count;i++){
    const x=p.getX(i),z=p.getZ(i),y=height(x,z);p.setY(i,y);
    const shade=.88+.12*Math.sin(x*.11+z*.08);
    const c=new THREE.Color(mountain?(y>285?'#abb3ad':y>185?'#727d68':x>150?'#9d7960':'#577064'):(y<2?'#818173':y<5?'#717c6d':'#697276'));
    c.multiplyScalar(shade);colors.push(c.r,c.g,c.b);
  }
  geo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geo.computeVertexNormals();
  const texture=detailTexture('stone');texture.repeat.set(150,150);
  const mesh=new THREE.Mesh(geo,new THREE.MeshStandardMaterial({map:texture,bumpMap:texture,bumpScale:mountain?.6:.035,vertexColors:true,roughness:1}));mesh.receiveShadow=true;scene.add(mesh);
  // Fine ribbons cover coarse terrain triangles at the roadside.
  for(const side of [-1,1])scene.add(new THREE.Mesh(makeRibbon(track,side*(track.width/2+2.8),5.6,-.10),mat(mountain?'#958f7c':'#7b8588')));
  // Sample the rendered triangles for shoreline overlays, avoiding terrain poking through.
  const surfaceHeight=(x,z)=>{
    const gx=THREE.MathUtils.clamp((x+1600)/3200*240,0,239.999),gz=THREE.MathUtils.clamp((z+1600)/3200*240,0,239.999);
    const ix=Math.floor(gx),iz=Math.floor(gz),u=gx-ix,v=gz-iz,a=iz*241+ix;
    const h00=p.getY(a),h10=p.getY(a+1),h01=p.getY(a+241),h11=p.getY(a+242);
    return u+v<=1?h00+(h10-h00)*u+(h01-h00)*v:h11+(h01-h11)*(1-u)+(h10-h11)*(1-v);
  };
  const dryFootprint=(x,z,r=12)=>[[0,0],[-r,-r],[-r,r],[r,-r],[r,r]].every(([dx,dz])=>height(x+dx,z+dz)>1.7);
  return {height,surfaceHeight,nearest,bridge,dryFootprint};
}

function bridgeDeck(scene,track,terrain,palette,mountain){
  const [a,b]=terrain.bridge;
  const deckMaterial=palette.concrete.clone();deckMaterial.side=THREE.DoubleSide;
  const deck=new THREE.Mesh(makeRibbon(track,0,track.width+1.3,-.32,a,b),deckMaterial);deck.receiveShadow=true;scene.add(deck);
  for(let t=a;t<b;t+=24/track.length){
    const s=track.sample(t),g=localFrame(s);scene.add(g);
    const h=mountain?56:Math.max(5,s.position.y+11);
    for(const side of [-1,1]){
      if(mountain||t<=.27||t>=.307)box(g,palette.concrete,[side*4,-h/2-.5,0],[1.3,h,2]);
      if(!mountain)box(g,palette.steel,[side*(track.width/2-.6),-.8,0],[.6,1.3,25]);
      box(g,palette.steel,[side*(track.width/2+1),2.7,0],[.23,5.4,.25]);
    }
    box(g,palette.concrete,[0,-1,0],[track.width+2,1.2,2.4]);
  }
  // Paired cable-stayed portals and cables anchored along the actual curved deck.
  for(const t of [a+.012,b-.018]){
    const s=track.sample(t),g=localFrame(s);scene.add(g);
    for(const side of [-1,1]){
      box(g,palette.steel,[side*(track.width/2+2),12,0],[.8,24,1.1]);
      for(const shift of [-.018,-.009,.009,.018]){
        const q=track.sample(t+shift).position.clone().addScaledVector(track.sample(t+shift).right,side*(track.width/2+1));
        const top=s.position.clone().addScaledVector(s.right,side*(track.width/2+2)).add(V(0,23,0));
        beam(scene,top,q,.065,palette.cable,6);
      }
    }
    box(g,palette.steel,[0,23.6,0],[track.width+4,.6,1.1]);
  }
}

function container(scene,p,palette,color,rng){
  const g=new THREE.Group();g.position.copy(p);scene.add(g);
  const paint=palette.containers[color];
  const levels=rng()>.6?3:2;
  for(let level=0;level<levels;level++){
    const y=level*2.65+1.3;
    box(g,paint,[0,y,0],[12.2,2.55,2.45]);
    for(let x=-5.8;x<6;x+=.58)for(const side of [-1,1])box(g,paint,[x,y,side*1.255],[.075,2.38,.06],0,false);
    for(const side of [-1,1]){
      box(g,palette.steel,[side*6.13,y,0],[.045,2.3,.05],0,false);
      box(g,palette.cable,[side*6.16,y,.85],[.04,2.2,.04],0,false);
    }
  }
}

function harbor(scene,track,terrain,p){
  const rng=seeded(8787);
  // Lake, navigation channel and outer sea share one continuous animated surface.
  // Quays and individually ribbed containers create a low, close technical sector.
  for(let i=0;i<120;i++){
    const t=(i/120)*.23,s=track.sample(t),side=i%2?1:-1;
    const position=s.position.clone().addScaledVector(s.right,side*(23+(i%3)*14));
    position.y=terrain.height(position.x,position.z);
    if(terrain.nearest(position.x,position.z).d>17&&lakeRadius(position.x,position.z)>1.22&&terrain.dryFootprint(position.x,position.z,8))container(scene,position,p,i%p.containers.length,rng);
  }
  // Dock cranes: braced portal, operator cab, cantilever boom, trolley and cables.
  for(const z of [-430,90,280,470]){
    const g=new THREE.Group();g.position.set(700,3,z);scene.add(g);
    box(g,p.concrete,[0,-.9,0],[78,1.8,70]);
    for(const x of [-30,30])for(const dz of [-26,26])box(g,p.concrete,[x,-7,dz],[2.5,13,2.5]);
    for(const x of [-12,12])for(const z of [-8,8]){
      box(g,p.orange,[x,24,z],[1.8,48,1.8]);box(g,p.steel,[x,1,z],[4,2,5]);
      beam(g,V(x,5,z),V(-x,42,z),.3,p.orange,8);
    }
    box(g,p.orange,[0,47,0],[29,2,20]);box(g,p.orange,[28,53,0],[100,1.8,4]);
    for(let x=-18;x<76;x+=9){beam(g,V(x,53,-1.8),V(x+9,59,-1.8),.16,p.orange,6);beam(g,V(x,59,-1.8),V(x+9,53,-1.8),.16,p.orange,6);}
    box(g,p.steel,[8,50,0],[6,3,4]);box(g,p.glass,[8,49.4,-2.1],[4.9,1.6,.1]);
    for(const z of [-1.2,1.2])beam(g,V(42,53,z),V(42,13,z),.045,p.cable,6);
    box(g,p.orange,[42,12.5,0],[12,.6,3]);
  }
  // Cargo ship with a stepped deckhouse, windows and stacked freight.
  const ship=new THREE.Group();ship.position.set(965,2,0);scene.add(ship);
  box(ship,p.navy,[0,4,0],[52,13,220]);box(ship,p.orange,[0,10,0],[53,1,212]);
  for(let i=0;i<7;i++)for(let j=0;j<3;j++)box(ship,p.containers[(i+j)%5],[(j-1)*14,16,-70+i*20],[12,10,17]);
  for(let level=0;level<4;level++){
    box(ship,p.concrete,[0,16+level*5,88],[44-level*5,5,32]);
    for(let x=-16;x<=16;x+=4)box(ship,p.glass,[x,17+level*5,71.8],[2.5,2,.12],0,false);
  }
  // Warehouse canopies create a tight industrial passage beside the return leg.
  for(let i=0;i<7;i++){
    const s=track.sample(.76+i*.024),g=localFrame(s);scene.add(g);
    const side=i%2?1:-1;
    const center=s.position.clone().addScaledVector(s.right,side*29);
    if(lakeRadius(center.x,center.z)<1.24||!terrain.dryFootprint(center.x,center.z,22))continue;
    box(g,p.concrete,[side*29,8,0],[26,16,34]);
    box(g,p.steel,[side*29,16.4,0],[29,.8,37]);
    for(let z=-12;z<=12;z+=8){
      box(g,p.containers[i%5],[side*15.8,4.2,z],[.2,8,6]);
      box(g,p.glass,[side*15.6,11.5,z],[.12,2.3,6]);
      box(g,p.steel,[side*12,8.6,z],[7,.25,7]);
    }
  }
  // Waterfront city blocks: setbacks, balconies, mullioned glass and roof plant.
  for(let i=0;i<72;i++){
    const t=.36+i/72*.37,s=track.sample(t),side=i%2?1:-1;
    const pos=s.position.clone().addScaledVector(s.right,side*(34+(i%3)*32));
    if(terrain.nearest(pos.x,pos.z).d<22||lakeRadius(pos.x,pos.z)<1.26||!terrain.dryFootprint(pos.x,pos.z,19))continue;
    if(t<.44&&side===-1)continue; // Open a viewing corridor on the bridge descent.
    const g=new THREE.Group();g.position.set(pos.x,terrain.height(pos.x,pos.z),pos.z);g.rotation.y=s.heading;scene.add(g);
    const h=18+(i%7)*8,w=18+(i%3)*3;
    box(g,i%2?p.concrete:p.navy,[0,h/2,0],[w,h,23]);
    box(g,p.glass,[0,h*.5,-11.56],[w-1,h-3,.14]);
    for(const side of [-1,1]){
      box(g,p.glass,[side*(w/2+.06),h*.5,0],[.12,h-3,20]);
      for(let y=4;y<h;y+=4){box(g,p.concrete,[side*(w/2+.2),y,0],[.4,.25,24],0,false);for(let z=-9;z<=9;z+=3)box(g,p.steel,[side*(w/2+.15),y+1.8,z],[.22,3.7,.12],0,false);}
    }
    for(let y=4;y<h;y+=4){box(g,p.steel,[0,y,-11.8],[w+1,.22,.48],0,false);for(let x=-w/2+2;x<w/2;x+=3.6)box(g,p.concrete,[x,y+1.8,-11.75],[.18,3.7,.25],0,false);}
    box(g,p.concrete,[0,1,-15],[w+3,2,6]);box(g,p.steel,[0,h+1.2,0],[w*.65,2.4,14]);
    for(let x=-5;x<=5;x+=5)box(g,p.steel,[x,h+3,1],[3,1.3,4]);
    if(i%3===0){box(g,p.orange,[0,3,-13],[w,1,3]);panel(g,['QUAY CAFE','CHROME WORKS','ASTERA MOTORS'][i%3],w-1,1.2,[0,3,-14.55],{fontSize:60});}
  }
  // Sidewalk detail: bollards, planters, benches and street-light standards.
  for(let i=0;i<90;i++){
    const t=.35+i/90*.4,s=track.sample(t),side=i%2?1:-1,g=localFrame(s);scene.add(g);
    const x=side*(track.width/2+6);
    box(g,p.concrete,[x,-.15,0],[7,.35,19]);
    if(i%3===0){
      box(g,p.steel,[x,4,0],[.12,8,.12]);box(g,p.steel,[x-side*1.1,7.95,0],[2.3,.12,.12]);box(g,p.tunnelLight,[x-side*2.1,7.83,0],[.8,.08,.35]);
      box(g,p.concrete,[x,.7,5],[3.5,1.4,2]);const shrub=new THREE.Mesh(new THREE.IcosahedronGeometry(1,1),p.pine);shrub.position.set(x,1.8,5);shrub.scale.set(1.8,1,1.2);g.add(shrub);
    }else{
      box(g,p.wood,[x,.75,0],[3,.15,.7]);box(g,p.wood,[x,1.1,.36],[3,.65,.12]);for(const dx of [-1,1])box(g,p.steel,[x+dx,.35,0],[.1,.7,.6]);
      box(g,p.steel,[x-side*2,.65,3],[.16,1.3,.16]);
    }
  }
  for(const [t,text] of [[.07,'CONTAINER RUN'],[.26,'SKYDOCK / 52 M'],[.48,'OLD QUARTER'],[.80,'WAREHOUSE DISTRICT']])sign(scene,track,t,text,p);
}

function sign(scene,track,t,text,p){
  const g=localFrame(track.sample(t));scene.add(g);
  box(g,p.steel,[-track.width/2-3,3.6,0],[.16,7.2,.16]);
  const board=panel(g,text,7,1.2,[-track.width/2-3,6.7,0],{fontSize:64,background:'#102936',accent:'#e7b465'});board.rotation.y=Math.PI;
}

function mountain(scene,track,terrain,p){
  const rng=seeded(5203),trees=[],trunks=[],rocks=[];
  for(let i=0;i<1450;i++){
    const x=(rng()-.5)*2550,z=(rng()-.5)*2550,near=terrain.nearest(x,z);
    if(near.d<20||near.d>600)continue;
    const y=terrain.height(x,z),h=8+rng()*16;
    if(y<282&&x<350){trees.push({p:V(x,y+h*.60,z),s:V(h*.25,h*.6,h*.25),color:i%3?'#294a40':'#466350'});trunks.push({p:V(x,y+h*.26,z),s:V(.35,h*.6,.35)});}
    else rocks.push({p:V(x,y-1,z),s:V(4+rng()*11,6+rng()*17,4+rng()*12),r:rng()*6,color:x>200?'#99705a':'#7c8580'});
  }
  // Add a denser near-road forest and tiered crowns, keeping the driving corridor clear.
  for(let i=0;i<500;i++){
    const s=track.sample(i/500),side=i%2?1:-1,point=s.position.clone().addScaledVector(s.right,side*(22+rng()*40));
    if(terrain.nearest(point.x,point.z).d<18||point.y>280)continue;
    const y=terrain.height(point.x,point.z),h=9+rng()*10;
    trees.push({p:V(point.x,y+h*.58,point.z),s:V(h*.23,h*.65,h*.23),color:i%2?'#375d4f':'#28443c'});
    trunks.push({p:V(point.x,y+h*.25,point.z),s:V(.3,h*.55,.3)});
  }
  const crown=new THREE.ConeGeometry(1,1,12,5);const cp=crown.attributes.position;
  for(let i=0;i<cp.count;i++){const a=Math.atan2(cp.getZ(i),cp.getX(i)),factor=1+.17*Math.sin(a*5+cp.getY(i)*16);cp.setX(i,cp.getX(i)*factor);cp.setZ(i,cp.getZ(i)*factor);}crown.computeVertexNormals();
  instance(scene,crown,p.pine,trees,true);
  instance(scene,crown,p.pine,trees.map(o=>({...o,p:o.p.clone().add(V(0,o.s.y*.23,0)),s:o.s.clone().multiply(V(.74,.9,.74))})),true);
  instance(scene,crown,p.pine,trees.map(o=>({...o,p:o.p.clone().add(V(0,o.s.y*.43,0)),s:o.s.clone().multiply(V(.5,.75,.5))})),true);
  instance(scene,new THREE.CylinderGeometry(.6,1,1,7),p.bark,trunks);
  instance(scene,new THREE.IcosahedronGeometry(1,1),p.rock,rocks,true);
  // Roadside stratified rock cuts only occupy the outside of the carriageway.
  for(let i=0;i<75;i++){
    const t=.11+i/75*.39,s=track.sample(t),pos=s.position.clone().addScaledVector(s.right,-(20+rng()*10));
    if(terrain.nearest(pos.x,pos.z).d<17)continue;
    const g=new THREE.Group();g.position.copy(pos);scene.add(g);
    for(let layer=0;layer<4;layer++){const rock=new THREE.Mesh(new THREE.IcosahedronGeometry(1,1),layer%2?p.sand:p.rock);rock.position.set(Math.sin(layer)*1.2,layer*2.2-2,0);rock.scale.set(5+layer,2.4,6+layer);rock.rotation.y=s.heading+.15*layer;g.add(rock);}
  }
  // A barrel-vault gallery follows the road's own frame, leaving its interior clear.
  const start=.405,end=.445,n=Math.ceil((end-start)*track.length/5),pos=[],uv=[],idx=[],r=track.width/2+3;
  for(let i=0;i<=n;i++){
    const s=track.sample(start+(end-start)*i/n);
    for(let k=0;k<=24;k++){
      const a=k/24*Math.PI,v=s.position.clone().addScaledVector(s.right,Math.cos(a)*r).addScaledVector(s.up,2+Math.sin(a)*r*.65);
      pos.push(...v.toArray());uv.push(k/24*Math.PI*r*2/8,i/n*((end-start)*track.length)/8);
      if(i<n&&k<24){const j=i*25+k;idx.push(j,j+1,j+25,j+1,j+26,j+25);}
    }
    if(i%2===0){const g=localFrame(s);scene.add(g);
    const arch=new THREE.Mesh(new THREE.TorusGeometry(r,.18,6,28,Math.PI),p.steel);arch.scale.y=.65;arch.position.y=2;g.add(arch);
    for(const side of [-1,1]){
      box(g,p.concrete,[side*r,1,0],[.65,2,1]);box(g,p.tunnelLight,[side*(r-.25),3.8,0],[.16,.2,1.8],0,false);
    }}
  }
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geo.setIndex(idx);geo.computeVertexNormals();
  const roofMat=p.concrete.clone();roofMat.side=THREE.DoubleSide;roofMat.bumpScale=.012;const roof=new THREE.Mesh(geo,roofMat);roof.castShadow=true;roof.receiveShadow=true;scene.add(roof);
  for(const t of [start,end]){
    const g=localFrame(track.sample(t));scene.add(g);
    for(const side of [-1,1])box(g,p.sand,[side*(r+1),4,0],[2,9,3]);
    const arch=new THREE.Mesh(new THREE.TorusGeometry(r,.65,8,36,Math.PI),p.sand);arch.scale.y=.65;arch.position.y=2;g.add(arch);
  }
  // Snow-capped peaks frame the climb; a reservoir gives the return a different palette.
  for(let i=0;i<9;i++){
    const x=600+i*155,z=-950+Math.sin(i)*170,h=360+(i%4)*75;
    const peak=new THREE.Mesh(new THREE.ConeGeometry(200,h,7),p.rock);peak.position.set(x,h/2+100,z);scene.add(peak);
    const cap=new THREE.Mesh(new THREE.ConeGeometry(61,h*.305,7),p.snow);cap.position.set(x,100+h-h*.1525,z);scene.add(cap);
  }
  const lake=new THREE.Mesh(new THREE.CircleGeometry(175,80),new THREE.MeshStandardMaterial({color:'#2b8990',metalness:.45,roughness:.23}));lake.rotation.x=-Math.PI/2;lake.scale.y=1.8;lake.position.set(-930,54,300);scene.add(lake);
  // Alpine village and a lookout platform break the forest silhouette.
  for(let i=0;i<9;i++){
    const s=track.sample(.91+i*.006),point=s.position.clone().addScaledVector(s.right,35+(i%3)*16);
    if(terrain.nearest(point.x,point.z).d<22)continue;
    const g=new THREE.Group();g.position.set(point.x,terrain.height(point.x,point.z),point.z);scene.add(g);
    box(g,p.wood,[0,3,0],[11,6,9]);const roof=new THREE.Mesh(new THREE.ConeGeometry(9,4,4),p.slate);roof.rotation.y=Math.PI/4;roof.scale.z=.85;roof.position.y=8;g.add(roof);
    for(const x of [-3,3]){box(g,p.glass,[x,3.4,4.55],[2,2,.1]);box(g,p.wood,[x,3.4,4.7],[.13,2.2,.15]);}
    box(g,p.wood,[0,1,7],[14,.3,5]);for(const x of [-6,6])box(g,p.wood,[x,1.7,9],[.15,1.4,.15]);
  }
  for(const [t,text] of [[.08,'RED ROCK ASCENT'],[.20,'SWITCHBACK / BRAKE'],[.40,'RIDGE GALLERY'],[.57,'SUMMIT DESCENT'],[.65,'RAVEN VIADUCT'],[.89,'CEDAR VILLAGE']])sign(scene,track,t,text,p);
}

export function createRegionalWorld(scene,renderer,track){
  const prior=new Set(scene.children),mount=track.id==='mountain';
  const sky=buildSky(scene,renderer);
  const p={concrete:mat('#babdb2'),steel:mat('#344c59',.38,.75),cable:mat('#b3c5c9',.32,.8),orange:mat('#d78b43'),navy:mat('#293e50'),glass:mat('#497582',.16,.65),pine:mat('#345647'),bark:mat('#51483d'),rock:mat('#8c8d80'),sand:mat('#b29777'),snow:mat('#e3ece7'),wood:mat('#826653'),slate:mat('#3c5158'),tunnelLight:new THREE.MeshStandardMaterial({color:'#ffe4ad',emissive:'#ffc76a',emissiveIntensity:2}),containers:['#2a6671','#b8583e','#ccad58','#46667d','#557160'].map(c=>mat(c))};
  const stone=detailTexture('stone'),concrete=detailTexture('concrete');
  for(const material of [p.rock,p.sand,p.wood]){material.map=stone;material.bumpMap=stone;material.bumpScale=.22;}
  p.concrete.map=concrete;p.concrete.bumpMap=concrete;p.concrete.bumpScale=.035;
  const terrain=landscape(scene,track,mount),roadMesh=buildRoad(scene,track);
  bridgeDeck(scene,track,terrain,p,mount);
  (mount?mountain:harbor)(scene,track,terrain,p);
  const lake=mount?null:createHarborLake(scene,terrain,p);
  const gate=localFrame(track.sample(0));scene.add(gate);
  for(const side of [-1,1])box(gate,p.steel,[side*(track.width/2+2),4,0],[.7,8,1.2]);
  box(gate,p.steel,[0,7.5,0],[track.width+5,1.5,1.5]);
  const board=panel(gate,track.english,track.width+3,1.15,[0,7.5,.77],{fontSize:72});
  const rear=panel(gate,track.english,track.width+3,1.15,[0,7.5,-.77],{fontSize:72});rear.rotation.y=Math.PI;
  const night=buildNightDetails(scene,track);
  batchStaticMeshes(scene,new Set([...prior,night.group,sky.sky,roadMesh,...(lake?[lake.root]:[])]));
  const children=scene.children.filter(c=>!prior.has(c)),root=new THREE.Group();root.name=track.english;
  children.forEach(c=>root.add(c));scene.add(root);
  let theme='day';
  return {root,skyMesh:sky.sky,sunDirection:sky.sunDirection,sunLight:sky.sunLight,night,roadMesh,terrain,lake,
    get theme(){return theme;},
    setTheme(value){theme=value==='night'?'night':'day';const dark=theme==='night';lake?.setTheme(dark);night.group.visible=dark;sky.sky.visible=false;
      sky.sunLight.intensity=dark?.3:3.2;sky.sunLight.color.set(dark?'#799bda':'#ffe3b4');
      sky.hemi.intensity=dark?.18:.65;sky.hemi.color.set(dark?'#5878a0':'#bbd4e3');
      scene.fog=new THREE.FogExp2(dark?'#081324':mount?'#afc4c8':'#b8c5cd',dark?.00043:mount?.00032:.00026);
    },update(t){sky.update(t);lake?.update(t);},dispose(){sky.environment.dispose();}
  };
}
