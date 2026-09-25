import {MathUtils} from 'three';
import {carveLake} from './harbor-lake.js';

// The navigation channel crosses the EXISTING elevated bridge, never a ground road.
export const HARBOR_CHANNEL=[[105,-20,64],[245,-65,67],[380,-94,73],[530,-115,86],[760,-145,100],[1120,-170,130]];
export function channelDistance(x,z){
  let best=Infinity;
  for(let i=1;i<HARBOR_CHANNEL.length;i++){
    const a=HARBOR_CHANNEL[i-1],b=HARBOR_CHANNEL[i],dx=b[0]-a[0],dz=b[1]-a[1];
    const t=MathUtils.clamp(((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz),0,1);
    best=Math.min(best,Math.hypot(x-a[0]-dx*t,z-a[1]-dz*t)-MathUtils.lerp(a[2],b[2],t));
  }
  return best;
}

export function createHarborCoast(track){
  const outline=Array.from({length:240},(_,i)=>track.sample(i/240).position);
  function inside(x,z){
    let result=false;
    for(let i=0,j=outline.length-1;i<outline.length;j=i++){
      const a=outline[i],b=outline[j];
      if((a.z>z)!==(b.z>z)&&x<(b.x-a.x)*(z-a.z)/(b.z-a.z)+a.x)result=!result;
    }
    return result;
  }
  function height(x,z,s,ground){
    const bridge=s.t>.235&&s.t<.335;
    let y=carveLake(x,z,ground);
    if(!inside(x,z)){
      const shoreWidth=48+8*Math.sin(x*.013+z*.009);
      y=MathUtils.lerp(y,-14,MathUtils.smoothstep(s.d,17,shoreWidth));
    }
    // Open water below the full bridge span; no raised strip sealing its underside.
    if(bridge)y=MathUtils.lerp(-10,y,MathUtils.smoothstep(s.d,38,92));
    const channel=channelDistance(x,z);
    if((bridge||s.d>22)&&channel<30){
      y=Math.min(y,MathUtils.lerp(-11,ground,MathUtils.smoothstep(channel,-16,30)));
    }
    return y;
  }
  return {inside,height};
}
