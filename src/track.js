import * as THREE from 'three';
import {CIRCUITS} from './circuits.js';
export {CIRCUITS} from './circuits.js';

export const wrap01 = t => ((t % 1) + 1) % 1;
export const TRACK_NAME = '金潮海岸';

export function createTrack(id='coast') {
  // One authored circuit: the low coast, the inland climbing esses and the viaduct.
  const definition=typeof id==='object'?id:CIRCUITS[id]||CIRCUITS.coast;
  const knots = definition.knots.map(p => new THREE.Vector3(...p));
  const curve = new THREE.CatmullRomCurve3(knots, true, 'centripetal');
  curve.arcLengthDivisions = 5000;
  const length = curve.getLength();
  const count = definition.sampleCount||2400;
  const positions = Array.from({length:count}, (_,i)=>curve.getPointAt(i/count));
  const tangents = Array.from({length:count}, (_,i)=>curve.getTangentAt(i/count));
  const rights = tangents.map(v=>new THREE.Vector3(v.z,0,-v.x).normalize());
  const ups = tangents.map((v,i)=>new THREE.Vector3().crossVectors(v,rights[i]).normalize());
  const curvatures = tangents.map((v,i)=>{
    const prev=tangents[(i-4+count)%count], next=tangents[(i+4)%count];
    const angle = Math.atan2(prev.z*next.x-prev.x*next.z,prev.x*next.x+prev.z*next.z);
    return angle/(length*8/count);
  });
  const v=new THREE.Vector3();
  function sample(t) {
    const f=wrap01(t)*count, i=Math.floor(f)%count,j=(i+1)%count,a=f-i;
    const tangent=tangents[i].clone().lerp(tangents[j],a).normalize();
    const right=rights[i].clone().lerp(rights[j],a).normalize();
    return {position:positions[i].clone().lerp(positions[j],a),tangent,right,
      up:new THREE.Vector3().crossVectors(tangent,right).normalize(),
      heading:Math.atan2(tangent.x,tangent.z),curvature:THREE.MathUtils.lerp(curvatures[i],curvatures[j],a)};
  }
  function nearest(position, hint=null) {
    const hasHeight=Number.isFinite(position.y);
    let best=0,bestD=Infinity;
    const center=hint===null?0:Math.round(wrap01(hint)*count);
    const span=hint===null?count:90;
    const step=hint===null?8:2;
    for(let n=hint===null?0:-span;n<(hint===null?count:span);n+=step){
      const i=(center+n+count)%count,p=positions[i];
      const d=(position.x-p.x)**2+(position.z-p.z)**2+(hasHeight?(position.y-p.y)**2*2:0);
      if(d<bestD){bestD=d;best=i;}
    }
    let fine=best;
    for(let n=-step;n<=step;n++){
      const i=(best+n+count)%count,p=positions[i];
      const d=(position.x-p.x)**2+(position.z-p.z)**2+(hasHeight?(position.y-p.y)**2*2:0);
      if(d<bestD){bestD=d;fine=i;}
    }
    // The closest point can lie BEFORE the nearest vertex. Project onto both
    // adjacent segments to avoid snapping forward at every sample midpoint.
    let projectedT=0,projectedD=Infinity;
    for(const i of [(fine-1+count)%count,fine]){
      const p=positions[i],q=positions[(i+1)%count];
      const dx=q.x-p.x,dz=q.z-p.z;
      const a=THREE.MathUtils.clamp(((position.x-p.x)*dx+(position.z-p.z)*dz)/(dx*dx+dz*dz),0,1);
      const dy=q.y-p.y;
      const distance=(position.x-p.x-a*dx)**2+(position.z-p.z-a*dz)**2+(hasHeight?(position.y-p.y-a*dy)**2*2:0);
      if(distance<projectedD){projectedD=distance;projectedT=(i+a)/count;}
    }
    const t=wrap01(projectedT),s=sample(t);
    v.set(position.x,hasHeight?position.y:s.position.y,position.z).sub(s.position);
    return {...s,t,distance:Math.hypot(v.x,v.z),offset:v.dot(s.right)};
  }
  const bounds=new THREE.Box3().setFromPoints(positions);
  return {...definition,curve,length,sample,nearest,positions,bounds,elevation:bounds.max.y-bounds.min.y};
}
