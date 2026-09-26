import test from 'node:test';
import assert from 'node:assert/strict';
import {newDesign,validateDesign,DesignStore,normalizeDesign,repairAll,repairIssue,restoreOriginal,setActualScale,groupDesignIssues} from '../src/custom-track.js';
import {createTrack} from '../src/track.js';
import {createDriver,resetDriver,resolveCars,stepDriver,aiControls,updateRaceProgress,gridSlot} from '../src/physics.js';
import {VEHICLE_LIST} from '../src/vehicle-catalog.js';
import {certifyRace,certifyRaceAsync,designFingerprint} from '../src/custom-race-check.js';

const ellipse=()=>{const d=newDesign('环海试验线');d.raw=Array.from({length:320},(_,i)=>{const t=2*Math.PI*i/320;return [300*Math.cos(t),190*Math.sin(t)];});d.closed=true;return d;};
const eight=()=>{const d=newDesign('八字桥');d.raw=Array.from({length:500},(_,i)=>{const t=2*Math.PI*i/500+.45;return [300*Math.sin(t),170*Math.sin(2*t)];});d.closed=true;return d;};

test('raw strokes stay intact; closure is explicit and drafts remain saveable',()=>{
 const d=ellipse(),raw=structuredClone(d.raw);d.closed=false;
 assert.equal(validateDesign(d).status,'draft');assert.ok(validateDesign(d).issues.some(i=>i.code==='open'));
 d.closed=true;const result=validateDesign(d);assert.deepEqual(d.raw,raw);assert.equal(result.status,'drive');assert.equal(result.geometryReady,true);
 const state=new Map(),store=new DesignStore({getItem:k=>state.get(k),setItem:(k,v)=>state.set(k,v)});
 store.save(d);const copy=new DesignStore({getItem:k=>state.get(k),setItem:(k,v)=>state.set(k,v)}).get(d.id);
 assert.deepEqual(copy.raw,raw);assert.deepEqual(validateDesign(copy).centerline,result.centerline);
 store.delete(d.id);assert.equal(store.get(d.id),null);
});

test('far endpoints are never silently connected and tiny loops cannot be driven',()=>{
 const d=ellipse();d.raw=d.raw.slice(0,200);d.closed=false;assert.equal(validateDesign(d).status,'draft');assert.ok(validateDesign(d).issues.some(i=>i.code==='open'));
 const tiny=ellipse();tiny.raw=tiny.raw.map(([x,z])=>[x*.1,z*.1]);assert.equal(validateDesign(tiny).status,'draft');
});

test('figure eight keeps crossing order and clears stacked road sections',()=>{
 const result=validateDesign(eight());assert.equal(result.status,'drive');assert.equal(result.crossings.length,1);assert.ok(result.crossings[0].clearance>=7.7);
 const c=result.crossings[0],a=result.centerline[Math.round(c.first)],b=result.centerline[Math.round(c.second)];
 assert.ok(Math.abs(a[1]-b[1])>=7.7);
 const track=createTrack({id:'custom-test',knots:result.centerline,width:12,checkpoints:16,sampleCount:2000});
 const upper=track.nearest({x:c.point[0],y:Math.max(a[1],b[1]),z:c.point[1]});
 const lower=track.nearest({x:c.point[0],y:Math.min(a[1],b[1]),z:c.point[1]});
 assert.ok(Math.abs(upper.position.y-lower.position.y)>5);
 const carA=createDriver(track,{id:'a',model:'aurora',isPlayer:true}),carB=createDriver(track,{id:'b',model:'aurora'});
 resetDriver(carA,track,upper.t,0);resetDriver(carB,track,lower.t,0);
 const before=carA.position.distanceTo(carB.position);resolveCars([carA,carB],track,1/60);
 assert.equal(carA.position.distanceTo(carB.position),before);
});

test('malformed and excessive designs fail promptly without losing valid drafts',()=>{
 const d=ellipse();assert.throws(()=>normalizeDesign({...d,raw:[[Infinity,0]]}));
 assert.throws(()=>normalizeDesign({...d,raw:Array(2501).fill([0,0])}));
 const zig=ellipse();zig.raw=Array.from({length:300},(_,i)=>[i*4-600,(i%2)*50]);
 assert.equal(validateDesign(zig).status,'draft');
});

test('eight AI can finish a checked player-made crossing circuit',()=>{
 const d=eight();d.raw=Array.from({length:500},(_,i)=>{const t=2*Math.PI*i/500+1.2;return [300*Math.sin(t),170*Math.sin(2*t)];});
 const result=validateDesign(d);assert.equal(result.status,'drive');assert.equal(result.geometryReady,true);
 const check=certifyRace(d,result);assert.equal(check.passed,true);
 d.certification={fingerprint:designFingerprint(d),passed:true,checkedAt:new Date().toISOString()};assert.equal(validateDesign(d).status,'race');
 const track=createTrack({id:d.id,knots:result.centerline,width:d.width,checkpoints:16,sampleCount:2000,slopeGravity:true});
 const drivers=Array.from({length:8},(_,i)=>createDriver(track,{id:String(i),model:VEHICLE_LIST[i%VEHICLE_LIST.length].id,...gridSlot(i,track)}));
 let maxStuck=0;
 for(let tick=0;tick<600*60;tick++){
  for(const driver of drivers){stepDriver(driver,aiControls(driver,track,drivers,'normal'),track,1/60);maxStuck=Math.max(maxStuck,driver.stuckTime);}
  resolveCars(drivers,track,1/60);
  drivers.forEach(driver=>updateRaceProgress(driver,track,(tick+1)/60,2));
  if(drivers.every(driver=>driver.finishTime!==null))break;
 }
 assert.ok(drivers.every(driver=>driver.finishTime!==null),drivers.map(d=>`${d.lap}/${d.checkpointsPassed}`).join(','));
 assert.ok(maxStuck<6,`AI stalled ${maxStuck}s`);
});

test('multiple overpasses retain travel order and pass eight-car certification',()=>{
 const d=newDesign('七交叉');d.raw=Array.from({length:850},(_,i)=>{const t=2*Math.PI*i/850+.7;return [300*Math.sin(2*t),220*Math.sin(3*t)];});d.closed=true;
 const result=validateDesign(d);assert.equal(result.crossings.length,7);assert.equal(result.geometryReady,true);
 assert.ok(result.crossings.every(c=>c.clearance>=7.7));assert.equal(certifyRace(d,result).passed,true);
});

test('degenerate and dense noisy strokes stay drafts in bounded time',()=>{
 const d=ellipse();d.raw=Array.from({length:2000},()=>[0,0]);assert.equal(validateDesign(d).status,'draft');
 const scribble=ellipse();scribble.raw=Array.from({length:1600},(_,i)=>[i%2?480:-480,Math.floor(i/2)%2?380:-380]);
 const start=performance.now(),result=validateDesign(scribble);assert.equal(result.status,'draft');assert.ok(performance.now()-start<1000);
});

test('water crossing lifts the road and editing invalidates race certification',()=>{
 const d=ellipse();d.terrain=[{type:'lake',points:[[260,-40],[340,-40],[340,40],[260,40]]}];
 let result=validateDesign(d);assert.equal(result.status,'drive');assert.ok(result.elevation>=5);
 d.certification={fingerprint:designFingerprint(d),passed:true,checkedAt:new Date().toISOString()};result=validateDesign(d);assert.equal(result.status,'race');
 d.raw[3][0]+=3;assert.equal(validateDesign(d).status,'drive');
});

test('choosing the second pass as upper persists across a nearby control-point edit',()=>{
 const d=eight();let result=validateDesign(d),crossing=result.crossings[0];
 d.overrides[crossing.id]={upper:'second',point:crossing.point};result=validateDesign(d);assert.equal(result.crossings[0].upper,'second');
 d.raw[40][0]+=2;result=validateDesign(d);assert.equal(result.crossings[0].upper,'second');
});

test('chunked browser certification matches the synchronous result',async()=>{
 const d=ellipse(),r=validateDesign(d);const direct=certifyRace(d,r),chunked=await certifyRaceAsync(d,r);
 assert.deepEqual(chunked,direct);
});

test('feedback sketch auto-closes, locally smooths, scales for real driving, and keeps original stroke',()=>{
 const d=newDesign('0.40 km验收');d.raw=[[-75,-50],[75,-50],[75,40],[-50,40],[-65,30],[-47,35],[-65,22],[-47,27],[-62,15],[-47,20],[-57,5],[-50,-10],[-25,-10]].map(([x,z])=>[x*.75,z*.75]);
 d.terrain=[{type:'lake',points:[[-20,-20],[5,-20],[5,5],[-20,5]]}];const original=structuredClone(d.raw),before=validateDesign(d);
 assert.equal(before.length,403);assert.equal(before.status,'draft');assert.equal(before.issues[0].code,'open');
 const fixed=repairAll(d);assert.equal(fixed.result.status,'drive');assert.ok(fixed.result.length>=800&&fixed.result.length<1200);assert.ok(fixed.design.route.length>original.length);assert.deepEqual(fixed.design.raw,original);assert.ok(fixed.design.scale>2&&fixed.design.scale<2.5);assert.ok(fixed.design.repairLog.some(item=>item.type==='closure'));assert.ok(fixed.design.repairLog.some(item=>item.type==='grid-relocate'));assert.equal(fixed.result.geometryReady,true);assert.equal(certifyRace(fixed.design,fixed.result).passed,true);assert.notEqual(fixed.design.terrain[0].points[0][0],-20);
 const restored=restoreOriginal(fixed.design);assert.deepEqual(restored.raw,original);assert.equal(restored.route,null);assert.equal(restored.scale,1);assert.equal(validateDesign(restored).length,403);
});

test('grid fix moves the start to an existing safe straight without changing track shape or lap order',()=>{
 const d=newDesign('发车位');d.raw=[[-75,-50],[75,-50],[75,40],[-50,40],[-65,30],[-47,35],[-65,22],[-47,27],[-62,15],[-47,20],[-57,5],[-50,-10],[-25,-10]].map(([x,z])=>[x*.75,z*.75]);
 const ready=repairAll(d),line=ready.design.route,at=line.length-18,misplaced={...ready.design,route:[...line.slice(at),...line.slice(0,at)],certification:null},before=validateDesign(misplaced),problem=before.issues.find(i=>i.code==='grid');
 assert.ok(problem);assert.equal(before.geometryReady,false);
 const fixed=repairIssue(misplaced,problem);assert.equal(fixed.changed,true);assert.equal(fixed.result.geometryReady,true);assert.deepEqual(fixed.design.raw,d.raw);assert.equal(fixed.design.route.length,line.length);
 const key=point=>point.map(value=>value.toFixed(5)).join(',');assert.deepEqual(fixed.design.route.map(key).sort(),line.map(key).sort());assert.ok(fixed.design.repairLog.some(item=>item.type==='grid-relocate'));
});

test('single issue repairs are actionable, grouped, undoable from saved source, and world scale changes geometry',()=>{
 const short=ellipse();short.raw=short.raw.map(([x,z])=>[x*.23,z*.23]);const report=validateDesign(short),small=report.issues.find(i=>i.code==='small');assert.ok(small);
 const scaled=repairIssue(short,small);assert.equal(scaled.changed,true);assert.ok(scaled.result.length>800);assert.notEqual(scaled.design.scale,1);assert.deepEqual(scaled.design.raw,short.raw);
 const scaledAgain=setActualScale(scaled.design,scaled.result,3);assert.equal(scaledAgain.changed,true);assert.ok(scaledAgain.result.length>scaled.result.length);
 const corner=newDesign('尖角');corner.raw=[[-220,-180],[220,-180],[220,180],[30,180],[0,0],[-30,180],[-220,180]];corner.closed=true;
 const sharp=validateDesign(corner).issues.find(i=>i.code==='sharp');assert.ok(sharp,'fixture should contain a sharp corner');const rounded=repairIssue(corner,sharp);assert.equal(rounded.changed,true);assert.ok(rounded.design.repairLog.some(item=>item.type==='round'));assert.deepEqual(rounded.design.raw,corner.raw);
 const overlapping=newDesign('近邻道路');overlapping.raw=[[-250,-120],[250,-120],[250,-100],[-250,-100],[-250,120],[250,120],[250,320],[-250,320]];overlapping.closed=true;
 const overlapReport=validateDesign(overlapping),groups=groupDesignIssues(overlapReport.issues),overlap=overlapReport.issues.find(i=>i.code==='overlap');assert.ok(overlap);assert.ok(groups.some(group=>group.type==='overlap'&&group.items.length>1));const separated=repairIssue(overlapping,overlap);assert.equal(separated.changed,true);assert.ok(separated.design.repairLog.some(item=>item.type==='separate'));assert.deepEqual(separated.design.raw,overlapping.raw);
});

test('distant open route gets a spatially separated return lane instead of a direct shortcut',()=>{
 const d=newDesign('远端开放路线');d.raw=[[0,0],[400,0],[400,300],[0,300]];const original=structuredClone(d.raw),before=validateDesign(d);assert.equal(before.length,1100);assert.equal(before.status,'draft');
 const repaired=repairAll(d);assert.equal(repaired.result.status,'drive');assert.ok(repaired.result.length>before.length+800);assert.ok(repaired.design.route.length>original.length);assert.deepEqual(repaired.design.raw,original);assert.equal(repaired.design.closed,true);assert.equal(repaired.result.crossings.length,0);
});

test('oversized open doodle is bounded and scaled before generating a return route',()=>{
 const d=newDesign('超长草图');d.raw=[[-5000,-5000],[5000,-5000],[5000,5000],[-5000,5000],[-5000,-5000]];const start=performance.now(),before=validateDesign(d);assert.equal(before.length,40000);assert.ok(before.issues.some(issue=>issue.code==='length'));
 const repaired=repairAll(d);assert.equal(repaired.result.status,'drive');assert.ok(repaired.result.length<12000);assert.ok(repaired.design.scale<1);assert.ok(performance.now()-start<5000);
});
