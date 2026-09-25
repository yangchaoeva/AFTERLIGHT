import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';

// A dedicated interior layer: exterior glazing, seats and the outer roof never
// occlude the driver's eyes. All coordinates remain in the car's local space.
export function createCockpit(color,spec={}){
 const group=new THREE.Group();group.name='driver interior';
 const leather=new THREE.MeshStandardMaterial({color:'#10171d',roughness:.76});
 const trim=new THREE.MeshStandardMaterial({color:'#3e4e58',metalness:.8,roughness:.27});
 const dark=new THREE.MeshStandardMaterial({color:'#080c10',roughness:.5});
 const glow=new THREE.MeshBasicMaterial({color:'#98d7ec'});
 const paint=new THREE.MeshPhysicalMaterial({color,metalness:.7,roughness:.24,clearcoat:1});
 function box(size,p,mat=leather,r=0){const mesh=new THREE.Mesh(new RoundedBoxGeometry(...size,2,.035),mat);mesh.position.set(...p);mesh.rotation.x=r;group.add(mesh);return mesh;}
 function bar(a,b,radius,material){const av=new THREE.Vector3(...a),bv=new THREE.Vector3(...b),delta=bv.clone().sub(av);const mesh=new THREE.Mesh(new THREE.CylinderGeometry(radius,radius,delta.length(),12),material);mesh.position.copy(av).add(bv).multiplyScalar(.5);mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize());group.add(mesh);return mesh;}
 box([2.06,.22,.57],[0,.86,.52]);box([2,.08,.37],[0,.993,.58],leather,-.15);
 box([1.95,.025,.06],[0,.91,.24],trim);box([1.84,.006,.012],[0,.936,.209],glow);
 box([.32,.55,1.0],[-.38,.52,-.1]);box([.30,.032,.46],[-.38,.807,-.01],trim,-.08);
 for(const x of [-.81,-.11,.84]){
  box([.20,.085,.05],[x,.947,.226],dark);
  for(let i=0;i<4;i++)box([.172,.006,.026],[x,.919+i*.017,.192],trim);
 }
 for(const side of [-1,1]){
  box([.11,.58,1.38],[side*1,.60,-.08]);box([.10,.043,1.15],[side*.946,.935,-.12],trim);
  bar([side*.96,.98,.78],[side*.77,1.59,.08],.035,leather);
  bar([side*.91,.99,-.75],[side*.77,1.59,-.61],.045,leather);
 }
 box([1.70,.045,1.04],[0,1.625,-.23]);
 bar([-.77,1.59,.08],[.77,1.59,.08],.022,leather);
 box([1.86,.09,1.24],[0,.79,1.31],paint,-.11);
 const screenCanvas=document.createElement('canvas');screenCanvas.width=768;screenCanvas.height=256;
 const texture=new THREE.CanvasTexture(screenCanvas);texture.colorSpace=THREE.SRGBColorSpace;
 const display=new THREE.Mesh(new THREE.PlaneGeometry(.53,.17),new THREE.MeshBasicMaterial({map:texture,toneMapped:false}));
 display.position.set(.38,1.012,.259);display.rotation.y=Math.PI;group.add(display);
 box([.60,.22,.07],[.38,1.01,.304],dark);
 const navCanvas=document.createElement('canvas');navCanvas.width=256;navCanvas.height=256;const ctx=navCanvas.getContext('2d');ctx.fillStyle='#0d1c23';ctx.fillRect(0,0,256,256);
 ctx.strokeStyle='#25424f';ctx.lineWidth=1;for(let i=0;i<256;i+=24){ctx.beginPath();ctx.moveTo(i,0);ctx.lineTo(i,256);ctx.moveTo(0,i);ctx.lineTo(256,i);ctx.stroke();}
 ctx.strokeStyle='#96dbe2';ctx.lineWidth=6;ctx.beginPath();ctx.moveTo(120,240);ctx.bezierCurveTo(25,140,224,132,112,30);ctx.stroke();ctx.fillStyle='#fff';ctx.beginPath();ctx.moveTo(120,155);ctx.lineTo(109,181);ctx.lineTo(129,181);ctx.fill();ctx.font='15px sans-serif';ctx.fillText('COASTLINE',22,27);
 const navTexture=new THREE.CanvasTexture(navCanvas);navTexture.colorSpace=THREE.SRGBColorSpace;
 const nav=new THREE.Mesh(new THREE.PlaneGeometry(.21,.19),new THREE.MeshBasicMaterial({map:navTexture,toneMapped:false}));nav.position.set(-.35,.97,.234);nav.rotation.y=Math.PI;group.add(nav);
 const wheel=new THREE.Group();wheel.position.set(.38,.876,.13);wheel.rotation.x=-.16;wheel.scale.setScalar(.89);group.add(wheel);
 const torus=new THREE.Mesh(new THREE.TorusGeometry(.184,.022,12,56),leather);wheel.add(torus);
 const seam=new THREE.Mesh(new THREE.TorusGeometry(.19,.0022,5,56),trim);seam.position.z=-.016;wheel.add(seam);
 for(const angle of [0,Math.PI,Math.PI*1.5]){const spoke=new THREE.Mesh(new RoundedBoxGeometry(.145,.031,.028,2,.01),trim);spoke.position.set(Math.cos(angle)*.085,Math.sin(angle)*.085,0);spoke.rotation.z=angle;wheel.add(spoke);}
 const hub=new THREE.Mesh(new RoundedBoxGeometry(.12,.082,.045,3,.02),dark);hub.position.z=-.018;wheel.add(hub);
 const stripe=new THREE.Mesh(new THREE.BoxGeometry(.012,.034,.037),glow);stripe.position.set(0,.179,-.003);wheel.add(stripe);
 group.traverse(o=>o.layers.set(2));
 const eye=new THREE.Vector3(.38,1.235,-.33);
 if(spec.premium){const sy=spec.design.roofY/1.625;group.scale.set(spec.halfWidth/.99,sy,1);group.position.z=spec.design.cabinShift;eye.set(.38*group.scale.x,1.235*sy,-.33+group.position.z);}
 let since=1;
 return {group,wheel,eye,update(driver,dt){
  wheel.rotation.z=-driver.steer*.65;since+=dt;if(since<.09)return;since=0;
  const c=screenCanvas.getContext('2d');c.fillStyle='#07151c';c.fillRect(0,0,768,256);
  c.fillStyle='#a0c7d5';c.font='19px sans-serif';c.textAlign='left';c.fillText('AFTERLIGHT / LIVE',24,32);
  c.fillStyle='#e8f5ff';c.font='bold 115px sans-serif';c.textAlign='center';c.fillText(String(Math.round(driver.speed*3.6)).padStart(3,'0'),380,165);
  c.font='22px sans-serif';c.fillStyle='#81b4c7';c.fillText('KM / H',380,203);
  c.fillStyle=driver.handbrake?'#ffb87e':'#9ed8c5';c.font='24px sans-serif';c.fillText(driver.handbrake?'BRAKE':'TCS  ACTIVE',125,131);
  c.fillStyle='#b5ddec';c.font='bold 68px sans-serif';c.fillText(driver.speed<1?'N':String(Math.min(7,1+Math.floor(driver.speed/13))),642,158);
  c.fillStyle='#223c48';c.fillRect(26,230,716,7);c.fillStyle='#b7e4ec';c.fillRect(26,230,716*(.15+(driver.speed%13)/13*.85),7);texture.needsUpdate=true;
 }};
}
