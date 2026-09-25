export class RaceStats {
 constructor(){this.reset();}
 reset(){this.time=0;this.distance=0;this.topSpeed=0;this.overtakes=0;this.finished=false;this.opponents=new Map();this.suppress=0;}
 baseline(player,drivers){
  this.opponents.clear();for(const d of drivers)if(d!==player)this.opponents.set(d.id,{armed:player.startT+player.progress<d.startT+d.progress});
 }
 resetPosition(player,drivers){this.baseline(player,drivers);this.suppress=1;}
 update(player,drivers,track,dt){
  if(this.finished)return 0;
  this.time+=dt;this.distance+=Math.max(0,player.speed)*dt;this.topSpeed=Math.max(this.topSpeed,player.speed);
  this.suppress=Math.max(0,this.suppress-dt);let passes=0;
  for(const d of drivers){
   if(d===player||d.finishTime!==null)continue;
   const gap=((player.startT+player.progress)-(d.startT+d.progress))*track.length;
   const record=this.opponents.get(d.id)||{armed:gap< -2};
   if(gap< -5)record.armed=true;
   if(record.armed&&gap>2){if(this.suppress===0&&gap<80){passes++;this.overtakes++;}record.armed=false;}
   this.opponents.set(d.id,record);
  }
  return passes;
 }
 snapshot(){return {average:this.time>0?this.distance/this.time*3.6:0,top:this.topSpeed*3.6,overtakes:this.overtakes,time:this.time};}
}
