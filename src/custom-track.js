// All coordinates are metres on the editor's X/Z plane. No online service is used.
import {createTrack} from './track.js';
import {designFingerprint} from './custom-race-check.js';
export const DESIGN_VERSION=1;
export const DESIGN_KEY='afterlight.player-tracks.v1';
const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const cross=(a,b)=>a[0]*b[1]-a[1]*b[0];
const sub=(a,b)=>[a[0]-b[0],a[1]-b[1]];
const lerp=(a,b,t)=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1];
const pointSegment=(p,a,b)=>{const d=sub(b,a),f=clamp(dot(sub(p,a),d)/(dot(d,d)||1),0,1);return {distance:distance(p,lerp(a,b,f)),fraction:f};};
const loopDistance=(a,b,n)=>Math.min(Math.abs(a-b),n-Math.abs(a-b));
function issue(code,severity,point,message,fix){return {code,severity,point,message,fix};}
function intersection(a,b,c,d){
  const r=sub(b,a),s=sub(d,c),den=cross(r,s);
  if(Math.abs(den)<1e-8)return null;
  const u=cross(sub(c,a),r)/den,t=cross(sub(c,a),s)/den;
  return t>=0&&t<=1&&u>=0&&u<=1?{point:lerp(a,b,t),t,u,angle:Math.acos(clamp(Math.abs(dot(r,s))/(Math.hypot(...r)*Math.hypot(...s)||1),-1,1))}:null;
}
function resample(points,step=7,loop=true){
  const result=[points[0]],closed=loop?[...points,points[0]]:points;
  let carry=0;
  for(let i=0;i<closed.length-1;i++){
    const a=closed[i],b=closed[i+1],length=distance(a,b);
    if(length<.001)continue;
    let at=step-carry;
    while(at<length){result.push(lerp(a,b,at/length));at+=step;}
    carry=length-(at-step);
  }
  if(loop&&distance(result[0],result.at(-1))<step*.5)result.pop();
  return result;
}
export function newDesign(name='未命名赛道'){
  return {version:DESIGN_VERSION,id:`custom-${crypto.randomUUID()}`,name,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),raw:[],route:null,closed:false,rawClosed:false,width:12,terrain:[],originalTerrain:null,scale:1,overrides:{},repairLog:[],smooth:.22};
}
export function normalizeDesign(input){
  if(!input||input.version!==DESIGN_VERSION||typeof input.id!=='string'||!/^custom-[a-z0-9-]{10,80}$/i.test(input.id))throw Error('赛道文件版本或 ID 无效');
  const points=Array.isArray(input.raw)?input.raw:[];
  if(points.length>2500)throw Error('控制点超过 2500 个，请局部简化笔迹');
  const raw=points.map(p=>[Number(p[0]),Number(p[1])]);
  if(raw.some(p=>p.some(v=>!Number.isFinite(v)||Math.abs(v)>5000)))throw Error('存在无效或超出 5 公里画布的坐标');
  const terrain=Array.isArray(input.terrain)?input.terrain:[];
  if(terrain.length>30)throw Error('地貌区域超过 30 个');
  const safeTerrain=terrain.map(region=>{
    if(!['mountain','river','lake'].includes(region.type)||!Array.isArray(region.points)||region.points.length>1000)throw Error('地貌数据无效');
    const rp=region.points.map(p=>[Number(p[0]),Number(p[1])]);
    if(rp.some(p=>p.some(v=>!Number.isFinite(v)||Math.abs(v)>5000)))throw Error('地貌坐标无效');
    return {type:region.type,points:rp};
  });
  const route=Array.isArray(input.route)?input.route.map(p=>[Number(p[0]),Number(p[1])]):null;
  if(route?.length>6000)throw Error('修整路线超过 6000 个采样点，请缩短或简化设计');
  if(route?.some(p=>p.some(v=>!Number.isFinite(v)||Math.abs(v)>5000)))throw Error('修整后的路线坐标无效');
  if(Array.isArray(input.originalTerrain)&&input.originalTerrain.length>30)throw Error('原始地貌区域超过 30 个');
  const originalTerrain=Array.isArray(input.originalTerrain)?input.originalTerrain.map(region=>{
    if(!['mountain','river','lake'].includes(region?.type)||!Array.isArray(region.points)||region.points.length>1000)throw Error('原始地貌数据无效');
    const points=region.points.map(p=>[Number(p[0]),Number(p[1])]);if(points.some(p=>p.some(v=>!Number.isFinite(v)||Math.abs(v)>5000)))throw Error('原始地貌坐标无效');return {type:region.type,points};
  }):null;
  return {version:DESIGN_VERSION,id:input.id,name:String(input.name||'未命名赛道').slice(0,40),createdAt:String(input.createdAt||new Date().toISOString()),updatedAt:String(input.updatedAt||new Date().toISOString()),raw,route,closed:!!input.closed,rawClosed:input.rawClosed??!!input.closed,routeLooped:!!input.routeLooped,width:clamp(Number(input.width)||12,8,18),terrain:safeTerrain,originalTerrain,scale:clamp(Number(input.scale)||1,.1,4),overrides:input.overrides&&typeof input.overrides==='object'?input.overrides:{},repairLog:Array.isArray(input.repairLog)?input.repairLog.slice(-40):[],smooth:clamp(Number.isFinite(Number(input.smooth))?Number(input.smooth):.22,0,.45),certification:input.certification&&typeof input.certification==='object'?{fingerprint:String(input.certification.fingerprint||''),passed:input.certification.passed===true,checkedAt:String(input.certification.checkedAt||'')}:null};
}
export function validateDesign(input){
  const design=normalizeDesign(input),issues=[],raw=design.route?.length?design.route:design.raw;
  if(raw.length<2)return {design,issues:[issue('few-points','error',raw[0]||[0,0],'路线笔迹太短','继续绘制一段有长度的路线')],status:'draft',crossings:[],centerline:[],length:0,geometryReady:false};
  let rough=[raw[0]];
  for(const p of raw.slice(1))if(distance(p,rough.at(-1))>=2)rough.push(p);
  if(rough.length<3)return {design,issues:[issue('degenerate','error',rough[0],'笔迹几乎重合，无法形成道路','重新绘制较大的闭环')],status:'draft',crossings:[],centerline:rough,length:0,elevation:0};
  const rawLength=rough.reduce((sum,p,i)=>sum+(i?distance(p,rough[i-1]):0),0)+(design.closed?distance(rough[0],rough.at(-1)):0);
  if(!design.closed){
    if(rawLength>12000)return {design,issues:[issue('length','error',rough[0],`开放路线约 ${Math.round(rawLength/1000)} km，超过当前可生成范围`,'先按建议比例缩小，再补齐闭环'),issue('open','error',rough.at(-1),`路线尚未闭合，开放长度 ${Math.round(rawLength)} m`,'缩放后规划顺滑回程，形成闭环')],crossings:[],centerline:rough.map(p=>[p[0],5,p[1]]),length:Math.round(rawLength),elevation:0,status:'draft',geometryReady:false};
    const open=resample(rough,8,false),clean=open.map((p,i)=>{if(i===0||i===open.length-1)return p;const prev=open[i-1],next=open[i+1],deviation=pointSegment(p,prev,next).distance,amount=deviation>7?0:design.smooth;return [p[0]*(1-amount)+(prev[0]+next[0])*amount*.5,p[1]*(1-amount)+(prev[1]+next[1])*amount*.5];});
    issues.push(issue('open','error',rough.at(-1),`路线尚未闭合，开放长度 ${Math.round(rawLength)} m，端点相距 ${Math.round(distance(rough[0],rough.at(-1)))} m`,'自动规划顺滑连接段，形成闭环'));
    return {design,issues,crossings:[],centerline:clean.map(p=>[p[0],5,p[1]]),length:Math.round(rawLength),elevation:0,status:'draft',geometryReady:false};
  }
  const gap=distance(rough[0],rough.at(-1));
  const start=sub(rough[1],rough[0]),arrival=gap<3?sub(rough.at(-1),rough.at(-2)):sub(rough[0],rough.at(-1));
  const tangentAngle=Math.acos(clamp(dot(start,arrival)/(Math.hypot(...start)*Math.hypot(...arrival)||1),-1,1));
  if(design.closed&&tangentAngle>1.35)issues.push(issue('seam','error',rough[0],'起终点连接处转向过急','圆顺闭环接缝，保留两侧主要路线'));
  if(rawLength>12000)return {design,issues:[...issues,issue('length','error',rough[0],`笔迹总长约 ${Math.round(rawLength/1000)} km，超过当前生成上限`,'缩短路线或删除远距离重复描线')],status:'draft',crossings:[],centerline:rough,length:Math.round(rawLength),elevation:0};
  if(gap<3)rough.pop();
  const simplified=[rough[0]];
  for(let i=1;i<rough.length-1;i++){
    const a=simplified.at(-1),b=rough[i],c=rough[i+1];
    if(pointSegment(b,a,c).distance>1.7||distance(a,b)>16)simplified.push(b);
  }
  simplified.push(rough.at(-1));
  if(simplified.length<3)return {design,issues:[...issues,issue('degenerate','error',rough[0],'路线缺少足够的形状变化','扩大路线并增加转弯')],status:'draft',crossings:[],centerline:[]};
  const base=resample(simplified,8,true);
  const smooth=base.map((p,i)=>{
    const prev=base[(i-1+base.length)%base.length],next=base[(i+1)%base.length];
    const deviation=pointSegment(p,prev,next).distance;
    const amount=deviation>7?0:design.smooth;
    return [p[0]*(1-amount)+(prev[0]+next[0])*amount*.5,p[1]*(1-amount)+(prev[1]+next[1])*amount*.5];
  });
  const n=smooth.length;
  if(n>1500)issues.push(issue('length','error',smooth[0],'赛道超过可实时生成的长度','分段删除重复描线或缩小路线'));
  if(n<75)issues.push(issue('small','error',smooth[0],'闭环长度不足 600 m','把主要弯道拉远，扩大闭环'));
  const xs=smooth.map(p=>p[0]),zs=smooth.map(p=>p[1]);
  if(Math.max(...xs)-Math.min(...xs)<35||Math.max(...zs)-Math.min(...zs)<35)issues.push(issue('flat','error',smooth[0],'路线过于狭长，无法布置安全弯道','增加横向空间和回程间距'));
  for(let i=0;i<n;i++){
    const a=smooth[(i-1+n)%n],b=smooth[i],c=smooth[(i+1)%n],u=sub(b,a),v=sub(c,b);
    const angle=Math.acos(clamp(dot(u,v)/(Math.hypot(...u)*Math.hypot(...v)||1),-1,1));
    if(angle>1.2)issues.push(issue('sharp','error',b,'道路存在过紧尖角','拖动该点，增加转弯半径'));
  }
  const crossings=[];
  for(let i=0;i<n;i++)for(let j=i+1;j<n;j++){
    if(loopDistance(i,j,n)<Math.max(5,Math.ceil(design.width/8)+2))continue;
    const a=smooth[i],b=smooth[(i+1)%n],c=smooth[j],d=smooth[(j+1)%n];
    if(Math.abs(a[0]-c[0])>55&&Math.abs(a[0]-d[0])>55&&Math.abs(b[0]-c[0])>55&&Math.abs(b[0]-d[0])>55)continue;
    const hit=intersection(a,b,c,d);
    if(hit){
      const id=`${Math.round(hit.point[0]/10)}:${Math.round(hit.point[1]/10)}`;
      const saved=design.overrides[id]??Object.values(design.overrides).find(value=>value&&typeof value==='object'&&Array.isArray(value.point)&&distance(value.point,hit.point)<15);
      crossings.push({...hit,id,first:i+hit.t,second:j+hit.u,upper:(typeof saved==='string'?saved:saved?.upper)==='second'?'second':'first'});
      if(hit.angle<.42)issues.push(issue('tangent','error',hit.point,'两段道路近乎切向接触，桥面难以分层','拉开两段路线，形成更明确的交叉角度'));
      if(Math.min(i,j,n-i,n-j)<Math.ceil(100/8))issues.push(issue('start-cross','error',hit.point,'交叉靠近起终点与发车区','把起点沿路线移到更长的直段'));
    }else{
      const m=Math.min(pointSegment(a,c,d).distance,pointSegment(b,c,d).distance,pointSegment(c,a,b).distance,pointSegment(d,a,b).distance);
      const nearCrossing=crossings.some(hit=>loopDistance(i,hit.first,n)*8<design.width*2.2&&loopDistance(j,hit.second,n)*8<design.width*2.2);
      if(m<design.width+2&&!nearCrossing&&issues.filter(e=>e.code==='overlap').length<18)issues.push(issue('overlap','error',lerp(a,c,.5),'两段非相邻道路边缘重叠','在标记处拉开道路，或改成明确的立体交叉'));
    }
  }
  for(let i=issues.length-1;i>=0;i--)if(issues[i].code==='overlap'&&crossings.some(c=>distance(issues[i].point,c.point)<design.width*2.2))issues.splice(i,1);
  if(crossings.length>12)issues.push(issue('many-crossings','error',smooth[0],'交叉超过 12 个，生成负担过大','减少重复描线或拆分复杂交叉'));
  const y=new Array(n).fill(5),grade=.09,clearance=8;
  for(const region of design.terrain){
    if(region.type==='mountain'&&region.points.length>=3){
      for(let i=0;i<n;i++)if(inPolygon(smooth[i],region.points))y[i]=Math.max(y[i],20);
    }
    if(region.type==='lake'&&region.points.length>=3){
      for(let i=0;i<n;i++)if(inPolygon(smooth[i],region.points))y[i]=Math.max(y[i],11);
    }
    if(region.type==='river'&&region.points.length>=2){
      for(let i=0;i<n;i++)for(let j=0;j<region.points.length-1;j++)if(pointSegment(smooth[i],region.points[j],region.points[j+1]).distance<16){y[i]=Math.max(y[i],11);break;}
    }
  }
  // Solve all crossing and slope constraints on the same periodic height field.
  for(let pass=0;pass<24;pass++){
    for(const c of crossings){const upper=Math.round(c.upper==='first'?c.first:c.second)%n,lower=Math.round(c.upper==='first'?c.second:c.first)%n;y[upper]=Math.max(y[upper],y[lower]+clearance);}
    for(let i=0;i<n;i++){const j=(i+1)%n;y[j]=Math.max(y[j],y[i]-grade*8);}
    for(let i=n-1;i>=0;i--){const j=(i+1)%n;y[i]=Math.max(y[i],y[j]-grade*8);}
  }
  for(const c of crossings){
    const upper=Math.round(c.upper==='first'?c.first:c.second)%n,lower=Math.round(c.upper==='first'?c.second:c.first)%n;
    c.clearance=y[upper]-y[lower];
    if(c.clearance<clearance-.3)issues.push(issue('bridge-conflict','error',c.point,'桥梁净空与连续引坡相互冲突','将相邻交叉点移远，或交换其中一处的上层路段'));
  }
  if(Math.max(...y)>120)issues.push(issue('height-conflict','error',smooth[0],'多处交叉与引坡约束导致道路高差过大','拉开相邻交叉，或改变其中一处的上下通行顺序'));
  for(let i=0;i<n;i++)if(Math.abs(y[i]-y[(i+1)%n])>grade*8+.2){issues.push(issue('grade','error',smooth[i],'道路坡度超出安全范围','拉长桥梁引坡或移开附近交叉点'));break;}
  if(!issues.some(e=>e.severity==='error')){
    const fitted=createTrack({id:'validation',knots:smooth.map((p,i)=>[p[0],y[i],p[1]]),width:design.width,checkpoints:12,sampleCount:Math.max(600,Math.min(2000,n*2))});
    const samples=Array.from({length:n},(_,i)=>fitted.sample(i/n).position),nearCross=point=>crossings.some(c=>distance(point,c.point)<design.width*2.5);
    for(let i=0;i<n;i++){
      const a=samples[i],b=samples[(i+1)%n];
      for(let j=i+1;j<n;j++){
        if(loopDistance(i,j,n)<Math.max(5,Math.ceil(design.width/8)+2))continue;
        const c=samples[j],d=samples[(j+1)%n];
        if(Math.min(Math.abs(a.x-c.x),Math.abs(a.x-d.x),Math.abs(b.x-c.x),Math.abs(b.x-d.x))>design.width+20)continue;
        const pa=[a.x,a.z],pb=[b.x,b.z],pc=[c.x,c.z],pd=[d.x,d.z],hit=intersection(pa,pb,pc,pd);
        if(hit){
          const ay=a.y+(b.y-a.y)*hit.t,by=c.y+(d.y-c.y)*hit.u;
          if(Math.abs(ay-by)<7.2&&!nearCross(hit.point)){issues.push(issue('fitted-cross','error',hit.point,'生成后的道路产生新的平面交叉，净空不足','拉开附近控制点或降低局部平滑程度'));break;}
          if(Math.abs(ay-by)<7.2&&nearCross(hit.point)){issues.push(issue('fitted-clearance','error',hit.point,'生成后的桥下净空不足','调整交叉位置，增加两侧引坡长度'));break;}
        }else{
          const m=Math.min(pointSegment(pa,pc,pd).distance,pointSegment(pb,pc,pd).distance,pointSegment(pc,pa,pb).distance,pointSegment(pd,pa,pb).distance);
          if(m<design.width+1&&!nearCross(lerp(pa,pc,.5))&&Math.min(Math.abs(a.y-c.y),Math.abs(a.y-d.y),Math.abs(b.y-c.y),Math.abs(b.y-d.y))<3.5){issues.push(issue('fitted-overlap','error',lerp(pa,pc,.5),'生成后的道路边缘重叠','在标记处拉开控制点'));break;}
        }
      }
      if(issues.some(e=>e.code.startsWith('fitted-')))break;
    }
  }
  const straight=Array.from({length:15},(_,i)=>{const a=smooth[i],b=smooth[i+1],c=smooth[i+2];return Math.abs(cross(sub(b,a),sub(c,b)))/(distance(a,b)*distance(b,c)||1);});
  const turnSum=smooth.reduce((sum,p,i)=>{const a=smooth[(i-1+n)%n],c=smooth[(i+1)%n],u=sub(p,a),v=sub(c,p);return sum+Math.acos(clamp(dot(u,v)/(Math.hypot(...u)*Math.hypot(...v)||1),-1,1));},0);
  const turnDensity=turnSum/Math.max(.1,n*8/1000),difficulty=turnDensity>18?'高 · 连续急弯':turnDensity>9?'中 · 复合弯':'低 · 流畅';
  const gridClear=straight.every(v=>v<.14)&&crossings.every(c=>Math.min(c.first,c.second,n-c.first,n-c.second)*8>100);
  const geometryReady=!issues.some(e=>e.severity==='error')&&design.width>=12&&gridClear;
  if(!issues.some(e=>e.severity==='error')){
    if(design.width<12)issues.push(issue('grid-width','warning',smooth[0],'道路宽度不足以布置双列发车','将道路宽度调整到至少 12 m，然后重新验证边缘与车辆碰撞'));
    if(!gridClear)issues.push(issue('grid','warning',smooth[0],'发车区没有足够的双列直道','优先把起点移到现有平顺直段；必要时局部拉直约 120 m，并重新验证道路与八车发车'));
  }
  const raceReady=geometryReady&&design.certification?.passed===true&&design.certification.fingerprint===designFingerprint(design);
  if(geometryReady&&!raceReady)issues.push(issue('ai-check','warning',smooth[0],'八车比赛尚需通过 AI 两圈检查','点击“八车竞速”运行检查，成功后会保存认证'));
  return {design,issues,crossings,centerline:smooth.map((p,i)=>[p[0],y[i],p[1]]),length:Math.round(n*8),elevation:Math.max(...y)-Math.min(...y),difficulty,status:issues.some(e=>e.severity==='error')?'draft':raceReady?'race':'drive',raceReady,geometryReady};
}
const unit=(a,b)=>{const d=distance(a,b)||1;return [(b[0]-a[0])/d,(b[1]-a[1])/d];};
function cubic(start,end,startDir,endDir,step=8){
 const gap=distance(start,end),handle=Math.min(gap*.48,Math.max(12,gap*.34)),a=[start[0]+startDir[0]*handle,start[1]+startDir[1]*handle],b=[end[0]-endDir[0]*handle,end[1]-endDir[1]*handle],count=Math.max(4,Math.min(90,Math.ceil(gap/step)));
 return Array.from({length:count+1},(_,i)=>{const t=i/count,u=1-t;return [start[0]*u**3+3*a[0]*u*u*t+3*b[0]*u*t*t+end[0]*t**3,start[1]*u**3+3*a[1]*u*u*t+3*b[1]*u*t*t+end[1]*t**3];});
}
function offsetLine(points,offset){return points.map((p,i)=>{const before=points[Math.max(0,i-1)],after=points[Math.min(points.length-1,i+1)],a=unit(before,p),b=unit(p,after),n1=[-a[1],a[0]],n2=[-b[1],b[0]],nx=n1[0]+n2[0],nz=n1[1]+n2[1],len=Math.hypot(nx,nz)||1,bis=[nx/len,nz/len],dotN=bis[0]*n1[0]+bis[1]*n1[1],scale=offset/clamp(Math.abs(dotN),.45,1);return [p[0]+bis[0]*scale,p[1]+bis[1]*scale];});}
function pathCollisionScore(path,original,width){let score=0;for(let i=1;i<path.length;i++)for(let j=1;j<original.length;j++){if(Math.abs(i-j)<5||distance(path[i],original[j])<width*2)continue;const hit=intersection(path[i-1],path[i],original[j-1],original[j]);if(hit)score+=1000;else{const gap=Math.min(pointSegment(path[i],original[j-1],original[j]).distance,pointSegment(original[j],path[i-1],path[i]).distance);if(gap<width+4)score+=(width+4-gap)*4;}}return score;}
function closeRoute(line,width){
 const points=resample(line,8,false);if(points.length<3)return null;
 const startDir=unit(points[0],points[1]),endDir=unit(points.at(-2),points.at(-1)),gap=distance(points.at(-1),points[0]);
 if(gap<=150){if(gap<2)return points;const join=cubic(points.at(-1),points[0],endDir,startDir,8);return [...points,...join.slice(1)];}
 const candidates=[-1,1].map(side=>{
  const parallel=offsetLine(points,side*Math.max(width*2.2,26)),endCap=cubic(points.at(-1),parallel.at(-1),endDir,[-endDir[0],-endDir[1]],8),startCap=cubic(parallel[0],points[0],[-startDir[0],-startDir[1]],startDir,8);
  const route=[...points,...endCap.slice(1),...parallel.slice(0,-1).reverse(),...startCap.slice(1,-1)];
  return {route,score:pathCollisionScore(parallel,points,width)};
 });
 candidates.sort((a,b)=>a.score-b.score);return candidates[0].route;
}
function roundCorners(line,{closed=true,center=null,radius=22}={}){
 const n=line.length,out=[];if(n<5)return line.map(p=>[...p]);
 for(let i=0;i<n;i++){
  const p=line[i],prev=line[(i-1+n)%n],next=line[(i+1)%n];
  if(!closed&&(i===0||i===n-1)){out.push([...p]);continue;}
  const near=!center||distance(p,center)<70,vin=unit(prev,p),vout=unit(p,next),turn=Math.acos(clamp(dot(vin,vout),-1,1));
  if(!near||turn<1.2){out.push([...p]);continue;}
  const trim=Math.min(radius,Math.min(distance(prev,p),distance(p,next))*.38),a=[p[0]-vin[0]*trim,p[1]-vin[1]*trim],b=[p[0]+vout[0]*trim,p[1]+vout[1]*trim];
  if(out.length===0||distance(out.at(-1),a)>2)out.push(a);
  for(let k=1;k<5;k++){const t=k/5,u=1-t;out.push([u*u*a[0]+2*u*t*p[0]+t*t*b[0],u*u*a[1]+2*u*t*p[1]+t*t*b[1]]);}
  out.push(b);
 }
 return out;
}
function ensureRoute(design,result){
 if(!design.route?.length)design.route=result.centerline.map(p=>[p[0],p[2]??p[1]]);design.routeLooped=design.closed;
 design.originalTerrain??=structuredClone(design.terrain);
 design.certification=null;
}
function pushApart(design,result,center){
 ensureRoute(design,result);const line=resample(design.route,8,design.closed),n=line.length;if(n<16)return false;
 let at=0,best=Infinity;for(let i=0;i<n;i++){const d=distance(line[i],center);if(d<best){best=d;at=i;}}
 let tangent=unit(line[(at-1+n)%n],line[(at+1)%n]),normal=[-tangent[1],tangent[0]],bestSide=1,bestScore=Infinity;
 for(const side of [-1,1]){const candidate=line.map((p,i)=>{const dist=Math.min((i-at+n)%n,(at-i+n)%n),w=dist<10?(1+Math.cos(Math.PI*dist/10))*.5:0;return [p[0]+normal[0]*side*22*w,p[1]+normal[1]*side*22*w];}),score=pathCollisionScore(candidate.slice(Math.max(0,at-10),Math.min(n,at+11)),line,design.width);if(score<bestScore){bestScore=score;bestSide=side;}}
 const span=Math.min(40,n/4),shifted=line.map((p,i)=>{const dist=Math.min((i-at+n)%n,(at-i+n)%n),w=dist<span?(1+Math.cos(Math.PI*dist/span))*.5:0;return [p[0]+normal[0]*bestSide*22*w,p[1]+normal[1]*bestSide*22*w];});
 design.route=shifted;return true;
}
function applyScale(design,result,newScale){
 ensureRoute(design,result);const old=design.scale||1,ratio=newScale/old;if(Math.abs(ratio-1)<.005)return false;
 const xs=design.route.map(p=>p[0]),zs=design.route.map(p=>p[1]),center=[(Math.min(...xs)+Math.max(...xs))/2,(Math.min(...zs)+Math.max(...zs))/2],transform=p=>[center[0]+(p[0]-center[0])*ratio,center[1]+(p[1]-center[1])*ratio];
 design.route=design.route.map(transform);design.terrain=design.terrain.map(r=>({...r,points:r.points.map(transform)}));design.repairLog.push({type:'scale',from:old,to:newScale,at:Date.now()});design.scale=newScale;design.certification=null;return true;
}
export function recommendedScale(design,result){
 const length=Math.max(1,result.length||0),target=length<850?850:length>11800?10500:length;
 return clamp((design.scale||1)*target/length,.1,4);
}
function groupedIssues(issues){
 const groups=[];for(const problem of issues){const type=problem.code==='sharp'?'sharp':problem.code.includes('overlap')||problem.code==='tangent'?'overlap':problem.code;let group=groups.find(g=>g.type===type&&distance(g.point,problem.point)<58);if(!group){group={type,point:problem.point,items:[]};groups.push(group);}group.items.push(problem);}
 return groups;
}
function gridWindow(line,at,back=120,ahead=32){
 const n=line.length,indices=[at];let behind=0,here=at;
 while(behind<back&&indices.length<n){const previous=(here-1+n)%n;behind+=distance(line[previous],line[here]);indices.unshift(previous);here=previous;}
 if(behind<back)return null;
 let forward=0;here=at;
 while(forward<ahead&&indices.length<n){const next=(here+1)%n;forward+=distance(line[here],line[next]);indices.push(next);here=next;}
 if(forward<ahead)return null;
 const first=line[indices[0]],last=line[indices.at(-1)],axis=sub(last,first),axisLength=Math.hypot(...axis)||1;
 let turn=0,deviation=0,travel=0;const stations=[-behind];
 for(let j=1;j<indices.length;j++){travel+=distance(line[indices[j-1]],line[indices[j]]);stations.push(travel-behind);}
 for(let j=1;j<indices.length-1;j++){
  const a=line[indices[j-1]],b=line[indices[j]],c=line[indices[j+1]],u=sub(b,a),v=sub(c,b);
  turn=Math.max(turn,Math.abs(cross(u,v))/(Math.hypot(...u)*Math.hypot(...v)||1));
  deviation=Math.max(deviation,Math.abs(cross(sub(b,first),axis))/axisLength);
 }
 return {indices,stations,turn,deviation,behind,forward};
}
function repairGrid(design,result){
 const line=design.route?.length?design.route:result.centerline.map(p=>[p[0],p[2]]),n=line.length;
 if(n<25||result.length<600)return false;
 const clearOfCrossing=window=>!result.crossings.some(hit=>window.indices.some(i=>distance(line[i],hit.point)<design.width*2.5));
 const candidates=[];
 for(let i=0;i<n;i++){const window=gridWindow(line,i);if(!window||!clearOfCrossing(window))continue;const shift=Math.min(i,n-i)*result.length/n;candidates.push({index:i,window,score:window.deviation*2+window.turn*42+shift*.012});}
 candidates.sort((a,b)=>a.score-b.score);
 const attemptLimit=result.length>5000?2:result.length>2500?8:28;
 const tryRoute=(route,entry,type,moved=0)=>{
  const proposal={...design,route,routeLooped:true,certification:null},checked=validateDesign(proposal);
  if(!checked.geometryReady||checked.status==='draft')return false;
  design.route=route;design.routeLooped=true;design.certification=null;
  design.repairLog.push({type,at:Date.now(),from:line[0],to:route[0],moved:Math.round(moved)});
  return true;
 };
 // Reordering a closed loop changes only the start/finish and preserves every bend.
 for(const entry of candidates.filter(c=>c.window.turn<.12&&c.window.deviation<5).slice(0,attemptLimit)){
  const route=[...line.slice(entry.index),...line.slice(0,entry.index)];
  if(tryRoute(route,entry,'grid-relocate',0))return true;
 }
 // If no long straight exists, try a small local adjustment. Reject any edit that
 // moves the drawn road by more than 14 m or creates a new road/bridge conflict.
 for(const entry of candidates.slice(0,Math.min(20,attemptLimit))){
  const window=gridWindow(line,entry.index,160,65);if(!window||!clearOfCrossing(window)||window.deviation>12)continue;
  const a=line[window.indices[0]],b=line[window.indices.at(-1)],total=window.behind+window.forward,adjusted=line.map(p=>[...p]);let moved=0;
  for(let j=1;j<window.indices.length-1;j++){
    const station=window.stations[j],t=(station+window.behind)/total,target=lerp(a,b,t),fade=clamp((station+window.behind)/28,0,1)*clamp((window.forward-station)/28,0,1),next=lerp(line[window.indices[j]],target,fade),delta=distance(next,line[window.indices[j]]);
    moved=Math.max(moved,delta);adjusted[window.indices[j]]=next;
  }
  if(moved>14||moved<.5)continue;
  const route=[...adjusted.slice(entry.index),...adjusted.slice(0,entry.index)];
  if(tryRoute(route,entry,'grid-straighten',moved))return true;
 }
 return false;
}
function repairOne(design,result,group){
 if(['open','seam'].includes(group.type)){
  if(group.type==='seam'&&design.closed){ensureRoute(design,result);design.route=roundCorners(resample(design.route,8,true),{closed:true,center:group.point,radius:26});design.routeLooped=true;design.certification=null;design.repairLog.push({type:'seam-round',at:Date.now()});return true;}
  const source=design.route?.length?design.route:design.raw,oldLength=source.length,closed=closeRoute(source,design.width);if(!closed)return false;
  design.originalTerrain??=structuredClone(design.terrain);design.route=closed;design.closed=true;design.routeLooped=true;design.certification=null;design.repairLog.push({type:'closure',at:Date.now(),added:Math.max(0,closed.length-oldLength)});return true;
 }
 if(group.type==='small'||group.items.some(p=>p.code==='small'||p.code==='length')){const scale=recommendedScale(design,result);if(Math.abs(scale-(design.scale||1))>.005)return applyScale(design,result,scale);}
 if(group.type==='sharp'){ensureRoute(design,result);design.route=roundCorners(resample(design.route,8,design.closed),{closed:design.closed,center:group.point});design.certification=null;design.repairLog.push({type:'round',point:group.point,at:Date.now()});return true;}
 if(group.type==='grid-width'&&design.width<12){design.width=12;design.certification=null;design.repairLog.push({type:'grid-width',at:Date.now()});return true;}
 if(group.type==='grid'||group.type==='start-cross')return repairGrid(design,result);
 if(group.type==='overlap'||['bridge-conflict','fitted-clearance','fitted-cross'].includes(group.items[0].code)){const changed=pushApart(design,result,group.point);if(changed)design.repairLog.push({type:'separate',point:group.point,at:Date.now()});return changed;}
 return false;
}
export function groupDesignIssues(issues){return groupedIssues(issues);}
export function issueRepairable(problem){return ['open','seam','small','length','sharp','overlap','tangent','fitted-overlap','fitted-clearance','fitted-cross','bridge-conflict','start-cross','grid','grid-width'].includes(problem?.code);}
export function repairIssue(input,problem){
 const design=normalizeDesign(input),before=validateDesign(design),group=groupedIssues(before.issues).find(g=>g.items.includes(problem)||g.type===problem.code)||groupedIssues(before.issues).sort((a,b)=>distance(a.point,problem.point)-distance(b.point,problem.point))[0];
 if(!group)return {design,result:before,changed:false};
 if(group.items.some(p=>p.code==='small')||problem.code==='small'){const scale=recommendedScale(design,before);const changed=applyScale(design,before,scale);return {design,result:validateDesign(design),changed};}
 const changed=repairOne(design,before,group);return {design,result:validateDesign(design),changed};
}
export function repairAll(input){
 let design=normalizeDesign(input),result=validateDesign(design),changed=0;
 const priority=group=>group.items.some(p=>['open','seam'].includes(p.code))?0:group.items.some(p=>['small','length'].includes(p.code))?1:group.type==='sharp'?2:3;
 for(let pass=0;pass<7;pass++){
  if(result.status!=='draft'&&result.length>=800){
    const gridGroup=groupedIssues(result.issues).find(group=>group.type==='grid-width'||group.type==='grid');
    if(gridGroup&&repairOne(design,result,gridGroup)){changed++;result=validateDesign(design);continue;}
    break;
  }
  if(result.status!=='draft'&&result.length<800){const scale=recommendedScale(design,result);if(Math.abs(scale-design.scale)>.005){applyScale(design,result,scale);changed++;result=validateDesign(design);continue;}break;}
  const groups=groupedIssues(result.issues).sort((a,b)=>priority(a)-priority(b));if(result.length>12000){const lengthGroup=groups.find(group=>group.items.some(item=>item.code==='length'));if(lengthGroup&&repairOne(design,result,lengthGroup)){changed++;result=validateDesign(design);continue;}}let applied=false;
  for(const group of groups){const before=JSON.stringify([design.route,design.closed,design.scale]);if(repairOne(design,result,group)){changed++;applied=true;result=validateDesign(design);if(result.status!=='draft')break;if(before===JSON.stringify([design.route,design.closed,design.scale]))continue;}}
  if(!applied)break;
 }
 return {design,result,changed};
}
export function restoreOriginal(input){const design=normalizeDesign(input);design.route=null;design.closed=design.rawClosed;design.routeLooped=false;design.terrain=design.originalTerrain?structuredClone(design.originalTerrain):design.terrain;design.scale=1;design.certification=null;design.repairLog=[];return design;}
export function setActualScale(input,result,newScale){const design=normalizeDesign(input),changed=applyScale(design,result,clamp(newScale,.1,4));return {design,result:validateDesign(design),changed};}
export function inPolygon(point,polygon){let inside=false;for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){const a=polygon[i],b=polygon[j];if((a[1]>point[1])!==(b[1]>point[1])&&point[0]<(b[0]-a[0])*(point[1]-a[1])/(b[1]-a[1])+a[0])inside=!inside;}return inside;}
export class DesignStore{
  constructor(storage){this.storage=storage;try{const data=JSON.parse(storage.getItem(DESIGN_KEY)||'[]');this.items=Array.isArray(data)?data.map(d=>{try{return normalizeDesign(d);}catch{return null;}}).filter(Boolean):[];}catch{this.items=[];}}
  save(design){const copy=normalizeDesign({...design,updatedAt:new Date().toISOString()});const at=this.items.findIndex(d=>d.id===copy.id);if(at<0)this.items.unshift(copy);else this.items[at]=copy;this.storage.setItem(DESIGN_KEY,JSON.stringify(this.items));return copy;}
  delete(id){this.items=this.items.filter(d=>d.id!==id);this.storage.setItem(DESIGN_KEY,JSON.stringify(this.items));}
  get(id){return this.items.find(d=>d.id===id)||null;}
}
