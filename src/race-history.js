import {CIRCUITS} from './circuits.js';
import {VEHICLES} from './vehicle-catalog.js';
export const HISTORY_KEY='afterlight.history.v1';
const positive=n=>Number.isFinite(n)&&n>0;
const nonnegative=n=>Number.isFinite(n)&&n>=0?n:0;
export const recordKey=r=>`${r.circuit}.${r.theme}.${r.mode}.${r.mode==='time'?'solo':r.difficulty}.${r.model}`;
function validEntry(r){
 if(!r||typeof r.id!=='string'||!CIRCUITS[r.circuit]||!VEHICLES[r.model]||!['day','night'].includes(r.theme)||!['race','time'].includes(r.mode)||!['easy','normal','hard'].includes(r.difficulty)||!['finished','retired'].includes(r.status)||!positive(r.totalTime)||!Number.isFinite(Date.parse(r.startedAt)))return null;
 return {...r,id:r.id.slice(0,100),rank:Number.isInteger(r.rank)&&r.rank>=1&&r.rank<=8?r.rank:null,rankFinal:!!r.rankFinal,bestLap:positive(r.bestLap)?r.bestLap:null,penalty:nonnegative(r.penalty),average:nonnegative(r.average),top:nonnegative(r.top),overtakes:Math.floor(nonnegative(r.overtakes)),newRecord:['first','improved'].includes(r.newRecord)?r.newRecord:null};
}
export class RaceArchive{
 constructor(storage){this.storage=storage;this.error=false;this.entries=[];this.records={};try{const raw=JSON.parse(storage.getItem(HISTORY_KEY)||'[]');this.entries=Array.isArray(raw)?raw.map(validEntry).filter(Boolean):[];const seen=new Set();this.entries=this.entries.filter(r=>!seen.has(r.id)&&seen.add(r.id));}catch{this.error=true;}try{const old=JSON.parse(storage.getItem('afterlight.records')||'{}');if(old&&typeof old==='object')for(const [key,value]of Object.entries(old))if(positive(value))this.records[key]=value;}catch{this.error=true;}}
 persist(){try{this.storage.setItem(HISTORY_KEY,JSON.stringify(this.entries));this.storage.setItem('afterlight.records',JSON.stringify(this.records));this.error=false;}catch{this.error=true;}}
 previous(r){let values=[this.records[recordKey(r)]];if(r.mode==='time')for(const difficulty of ['easy','normal','hard'])values.push(this.records[`${r.circuit}.${r.theme}.time.${difficulty}.${r.model}`]);values.push(...this.entries.filter(e=>e.status==='finished'&&recordKey(e)===recordKey(r)).map(e=>e.totalTime));values=values.filter(positive);return values.length?Math.min(...values):null;}
 add(data){const existing=this.entries.find(e=>e.id===data.id);if(existing)return existing;const r=validEntry(data);if(!r)return null;const previous=r.status==='finished'?this.previous(r):null;r.previousBest=previous;r.newRecord=r.status==='finished'?(previous===null?'first':r.totalTime<previous-.0005?'improved':null):null;r.improvement=r.newRecord==='improved'?previous-r.totalTime:0;if(r.newRecord)this.records[recordKey(r)]=r.totalTime;this.entries.unshift(r);this.persist();return r;}
 updateRank(id,rank,final){const r=this.entries.find(r=>r.id===id);if(r&&r.status==='finished'&&(r.rank!==rank||r.rankFinal!==final)){r.rank=rank;r.rankFinal=final;this.persist();}}
 best(circuit,mode){const values=this.entries.filter(r=>r.circuit===circuit&&r.mode===mode&&r.status==='finished');for(const [key,totalTime]of Object.entries(this.records)){const [c,theme,m,difficulty,model]=key.split('.');if(c===circuit&&m===mode&&VEHICLES[model]&&['day','night'].includes(theme)&&positive(totalTime))values.push({circuit,theme,mode,difficulty,model,totalTime});}return values.sort((a,b)=>a.totalTime-b.totalTime)[0]||null;}
}
