import * as THREE from 'three';
import {Parts,surface,smoothProfile,interior} from './vehicle-primitives.js';

// Independent body construction for the heritage coupe: separate cabin opening,
// front/rear deck lofts and side shoulder strips; no scaled copy of the legacy car.
export function buildPremiumCar(spec,m,high){
  const d=spec.design,{nose,tail,frontAxle,rearAxle,roofY,roofFront,roofBack,windBase,rearBase,roofHalf,cabinShift}=d;
  const half=spec.halfWidth,r=spec.wheelRadius,archRadius=r+.047;
  const car=new THREE.Group();car.name=spec.label;
  const body=new THREE.Group();body.name='stable coachwork';car.add(body);
  const wing=new THREE.Group();wing.name='rear aero';body.add(wing);
  const p=new Parts(),nu=high?40:22,nv=high?110:54;
  m.paint.roughness=.25;m.paint.metalness=.65;m.paint.clearcoatRoughness=.12;m.paint.envMapIntensity=1.1;
  m.glass.color.set('#72818a');m.glass.opacity=.32;m.glass.metalness=.12;m.glass.roughness=.12;
  m.lens.transparent=true;m.lens.opacity=.22;m.lens.depthWrite=false;m.lens.color.set('#cbd8db');
  m.rim.color.set('#9b9d95');m.rim.roughness=.32;
  const width=z=>half*smoothProfile(d.widths??[[tail,.90],[tail+.20,.98],[rearAxle,1],[-.55,.95],[.30,.945],[frontAxle,1],[nose-.20,.98],[nose,.92]],z);
  const height=z=>smoothProfile(d.tops??[[tail,.83],[tail+.25,.91],[rearAxle,.96],[-.6,.975],[windBase,.96],[1.3,.92],[nose-.30,.88],[nose,.865]],z);
  const arch=z=>{const dist=Math.min(Math.abs(z-frontAxle),Math.abs(z-rearAxle));return dist<archRadius?r+Math.sqrt(archRadius**2-dist**2):.19;};
  const crown=(u,z)=>{
    const shoulder=Math.max(height(z)+.04,arch(z)+.053);
    const edge=THREE.MathUtils.smoothstep(Math.abs(u),.57,1);
    return height(z)+.035*(1-u*u)+(shoulder-height(z))*edge+(d.muscle&&z>windBase?.055*Math.sin(Math.PI*(z-windBase)/(nose-windBase))*Math.exp(-u*u*9):0);
  };
  const cabinWidth=.77;
  // The cabin is open below the glass, allowing seats and console to be seen.
  for(const [a,b]of [[tail,rearBase],[windBase,nose]])p.add(surface((u,v)=>{const z=a+(b-a)*v;return [(u*2-1)*width(z),crown(u*2-1,z),z];},nu,high?38:20,true),m.paint);
  for(const side of [-1,1]){
    p.add(surface((u,v)=>{const z=rearBase+(windBase-rearBase)*v,x=THREE.MathUtils.lerp(cabinWidth,width(z),u);return [side*x,crown(x/width(z),z),z];},14,40,side>0),m.paint);
    p.add(surface((u,v)=>{const z=tail+(nose-tail)*u,y=THREE.MathUtils.lerp(arch(z),crown(1,z),v),waist=.035*Math.sin(v*Math.PI);return [side*(width(z)-waist-.04*(1-v)),y,z];},nv,16,side>0),m.paint);
    for(const axle of [frontAxle,rearAxle]){
      const points=[];
      for(let i=0;i<=48;i++){const a=Math.PI*i/48,z=axle+archRadius*Math.cos(a);points.push([side*(width(z)-.023),r+archRadius*Math.sin(a),z]);}
      p.tube(points,.013,m.paint,48);p.tube(points.map(([x,y,z])=>[x-side*.018,y-.008,z]),.009,m.black,48);
      p.add(surface((u,v)=>{const a=u*Math.PI,z=axle+Math.cos(a)*(archRadius+.012);return [side*THREE.MathUtils.lerp(half-.47,width(z)-.043,v),r+Math.sin(a)*(archRadius+.012),z];},high?40:24,4,side<0),m.black);
    }
    p.box([.055,.065,frontAxle-rearAxle-.82],m.carbon,[side*(half-.07),.18,(frontAxle+rearAxle)/2],[0,0,0],.015);
    const doorRear=rearAxle+.51,doorFront=frontAxle-.46;
    const pts=[[doorRear,.94],[doorRear,.53],[doorRear+.08,.27],[doorFront-.08,.27],[doorFront,.55],[doorFront,.94]].map(([z,y])=>[side*(width(z)-.025),y,z]);
    p.tube(pts,.003,m.black,46);
    p.box([.025,.036,.16],m.black,[side*(width(doorRear+.17)-.012),.867,doorRear+.17],[0,0,0],.012);
    p.box([.029,.016,.12],m.chrome,[side*(width(doorRear+.17)+.001),.87,doorRear+.17],[0,0,0],.005);
  }
  p.box([1.38,.06,spec.length-.18],m.black,[0,.17,(nose+tail)/2],[0,0,0],.02);
  // End caps have a real inset grille opening, with a rear wall and deep jambs.
  for(const [z,front]of [[nose,true],[tail,false]]){
    if(!front)p.add(surface((u,v)=>[(u*2-1)*width(z),THREE.MathUtils.lerp(.29,crown(u*2-1,z),v),z],32,10,true),m.paint);
    else{
      p.add(surface((u,v)=>[(u*2-1)*width(z),THREE.MathUtils.lerp(.65,crown(u*2-1,z),v),z+.018*Math.sin(u*Math.PI)],32,8),m.paint);
      p.box([width(z)*2,.12,.22],m.paint,[0,.24,z-.055],[0,0,0],.035);
      for(const side of [-1,1])p.box([.17,.32,.22],m.paint,[side*(width(z)-.085),.465,z-.055],[0,side*.05,0],.025);
      p.box([1.49,.31,.022],m.black,[0,.475,z-.17],[0,0,0],.012);
      for(const side of [-1,1])p.box([.025,.32,.20],m.black,[side*.76,.47,z-.07],[0,0,0],.007);
      for(let y=.37;y<.64;y+=.049)p.box([1.48,.013,.085],m.carbon,[0,y,z-.07],[0,0,0],.003);
      if(high)for(let x=-.68;x<.7;x+=.11)p.box([.009,.24,.016],m.brake,[x,.48,z-.085],[0,0,0],.001);
      p.box([1.82,.04,.25],m.carbon,[0,.17,z+.018],[0,0,0],.01);
    }
  }
  // Distinct squared roofline and softly crowned glazing.
  p.add(surface((u,v)=>{const x=(u*2-1)*roofHalf,z=roofBack+(roofFront-roofBack)*v;return [x,roofY+.038*(1-(u*2-1)**2)+.009*Math.sin(v*Math.PI),z];},nu,24,true),m.paint);
  const glassFn=(front,u,v)=>{
    const base=front?windBase:rearBase,top=front?roofFront:roofBack,x=(u*2-1)*THREE.MathUtils.lerp(cabinWidth,roofHalf,v);
    return [x,THREE.MathUtils.lerp(height(base)+.02,roofY,v)+.014*(1-(u*2-1)**2),THREE.MathUtils.lerp(base,top,v)];
  };
  for(const front of [true,false]){
    const fn=(u,v)=>glassFn(front,u,v);p.add(surface(fn,32,24,!front),m.glass);
    for(const v of [0,1])p.tube(Array.from({length:25},(_,i)=>fn(i/24,v)),.014,m.black,32);
  }
  for(const side of [-1,1]){
    const edge=side>0?1:0;
    p.tube([glassFn(true,edge,0),glassFn(true,edge,.5),glassFn(true,edge,1)],.029,m.paint,22);
    p.tube([glassFn(false,edge,0),glassFn(false,edge,.5),glassFn(false,edge,1)],.052,m.paint,22);
    p.tube([[side*roofHalf,roofY,roofBack],[side*roofHalf,roofY+.008,(roofFront+roofBack)/2],[side*roofHalf,roofY,roofFront]],.026,m.paint,32);
    p.add(surface((u,v)=>{
      const z=THREE.MathUtils.lerp(THREE.MathUtils.lerp(rearBase,windBase,u),THREE.MathUtils.lerp(roofBack,roofFront,u),v);
      return [side*THREE.MathUtils.lerp(cabinWidth,roofHalf,v),THREE.MathUtils.lerp(height(z)+.015,roofY,v),z];
    },30,20,side>0),m.glass);
    p.tube([[side*cabinWidth,height(rearBase)+.014,rearBase],[side*cabinWidth,.992,-.3],[side*cabinWidth,height(windBase)+.014,windBase]],.012,m.black,30);
    p.tube([[side*roofHalf,roofY-.01,roofBack+.19],[side*cabinWidth,.977,rearBase+.4]],.017,m.black,20);
    const mirrorZ=windBase-.10;
    p.tube([[side*.76,.99,mirrorZ],[side*.93,1.02,mirrorZ],[side*1.015,1.04,mirrorZ]],.015,m.black,12);
    p.box([.23,.09,.14],m.paint,[side*1.02,1.045,mirrorZ],[0,side*-.12,0],.035);
    p.box([.19,.065,.009],m.chrome,[side*1.02,1.045,mirrorZ-.075],[0,side*-.12,0],.02);
    const seam=[];
    for(let i=0;i<=30;i++){const z=windBase+.02+(nose-windBase-.17)*i/30,x=side*.54;seam.push([x,crown(x/width(z),z)+.003,z]);}
    p.tube(seam,.0026,m.black,38);
  }
  interior(p,m,cabinShift,high);
  if(d.muscle){
    for(const side of [-1,1]){
      p.box([.59,.14,.11],m.black,[side*.62,.785,nose+.024],[0,side*-.06,0],.03);
      for(let i=0;i<3;i++){
        p.box([.12,.058,.034],m.chrome,[side*(.43+i*.16),.787,nose+.075],[0,0,0],.012);
        p.box([.088,.029,.013],m.white,[side*(.43+i*.16),.79,nose+.096],[0,0,0],.009);
      }
      p.box([.54,.10,.014],m.lens,[side*.62,.79,nose+.112],[0,side*-.06,0],.02);
      p.box([.55,.015,.02],m.white,[side*.62,.849,nose+.088],[0,0,0],.006);
      const z=1.23,x=side*.43;
      p.box([.19,.012,.43],m.black,[x,crown(x/width(z),z)+.008,z],[0,side*.1,0],.025);
      for(let i=0;i<6;i++)p.box([.16,.011,.014],m.carbon,[x,crown(x/width(z),z)+.018,z-.15+i*.06],[0,0,0],.003);
      p.box([.72,.21,.10],m.black,[side*.49,.785,tail-.022],[0,0,0],.025);
      for(let i=0;i<3;i++){
        p.box([.081,.14,.028],m.red,[side*(.28+i*.19),.795,tail-.086],[0,0,side*-.13],.018);
        p.box([.11,.17,.014],m.lens,[side*(.28+i*.19),.795,tail-.107],[0,0,side*-.13],.018);
      }
      p.box([.23,.10,.20],m.chrome,[side*.70,.30,tail-.055],[0,0,0],.028);
      p.box([.18,.064,.025],m.black,[side*.70,.30,tail-.165],[0,0,0],.018);
    }
    p.box([1.83,.065,.20],m.paint,[0,1.012,tail+.075],[-.17,0,0],.025);
  }else{
  // Heritage optics: two recessed projectors per side, dark bezels, clear covers.
  for(const side of [-1,1]){
    p.box([.57,.17,.12],m.black,[side*.59,.773,nose+.009],[0,side*-.02,0],.018);
    for(const x of [.45,.70]){
      p.add(new THREE.CylinderGeometry(.058,.064,.048,24),m.chrome,[side*x,.78,nose+.060],[Math.PI/2,0,0]);
      p.add(new THREE.CircleGeometry(.040,24),m.white,[side*x,.78,nose+.086]);
      p.add(new THREE.TorusGeometry(.054,.006,6,28),m.white,[side*x,.78,nose+.086]);
    }
    p.box([.54,.145,.014],m.lens,[side*.59,.773,nose+.096],[0,0,0],.016);
    p.box([.055,.11,.02],m.amber,[side*.835,.773,nose+.085],[0,0,0],.007);
    p.box([.66,.22,.10],m.black,[side*.49,.73,tail-.027],[0,0,0],.024);
    for(const x of [.32,.64]){
      p.add(new THREE.CylinderGeometry(.089,.098,.024,32),m.black,[side*x,.73,tail-.08],[Math.PI/2,0,0]);
      p.add(new THREE.TorusGeometry(.067,.013,8,32),m.red,[side*x,.73,tail-.101]);
      p.add(new THREE.CircleGeometry(.045,28),m.red,[side*x,.73,tail-.103],[0,Math.PI,0]);
    }
    p.add(new THREE.CylinderGeometry(.059,.063,.18,24,1,true),m.chrome,[side*.57,.29,tail-.04],[Math.PI/2,0,0]);
    p.add(new THREE.CircleGeometry(.051,24),m.black,[side*.57,.29,tail-.135],[0,Math.PI,0]);
    p.box([.035,.12,.13],m.carbon,[side*.54,.96,tail+.27],[-.1,0,0],.007);
  }
  p.box([1.59,.048,.28],m.paint,[0,1.035,tail+.27],[-.065,0,0],.018);
  }
  p.box([1.6,.07,.30],m.carbon,[0,.21,tail+.025],[0,0,0],.018);
  for(const x of [-.6,-.3,0,.3,.6])p.box([.015,.10,.31],m.carbon,[x,.225,tail+.02],[-.1,0,0],.004);
  p.box([.34,.12,.024],m.black,[0,.48,tail-.055],[0,0,0],.01);
  // A small original split-chevron badge, not a manufacturer emblem.
  for(const side of [-1,1])p.box([.012,.047,.014],m.chrome,[side*.014,.84,nose+.03],[0,0,side*-.4],.003);
  p.finish(body);
  return {car,body,wing};
}
