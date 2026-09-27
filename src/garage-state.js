import {VEHICLES,GARAGE_VEHICLE_LIST,getVehicle} from './vehicle-catalog.js';
export const GARAGE_KEY='afterlight.garage.v1';
const validColor=v=>typeof v==='string'&&/^#[0-9a-f]{6}$/i.test(v);
export function normalizeGarage(raw={}){
  return {selected:VEHICLES[raw?.selected]?raw.selected:GARAGE_VEHICLE_LIST[0].id,colors:Object.fromEntries(GARAGE_VEHICLE_LIST.map(s=>[s.id,validColor(raw?.colors?.[s.id])?raw.colors[s.id]:s.color]))};
}
export class GarageSelection{
  constructor(saved){this.saved=normalizeGarage(saved);this.cancel();}
  begin(id=this.saved.selected){this.preview=VEHICLES[id]?id:this.saved.selected;this.colors={...this.saved.colors};}
  select(id){if(VEHICLES[id])this.preview=id;}
  color(value){if(validColor(value))this.colors[this.preview]=value;}
  move(delta){const index=GARAGE_VEHICLE_LIST.findIndex(s=>s.id===this.preview);this.select(GARAGE_VEHICLE_LIST[(index+delta+GARAGE_VEHICLE_LIST.length)%GARAGE_VEHICLE_LIST.length].id);}
  confirm(){this.saved=normalizeGarage({selected:this.preview,colors:{...this.saved.colors,[this.preview]:this.paint}});return structuredClone(this.saved);}
  cancel(){this.begin();}
  get spec(){return getVehicle(this.preview);}
  get paint(){return this.colors[this.preview];}
}
