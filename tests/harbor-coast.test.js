import test from 'node:test';
import assert from 'node:assert/strict';
import {createTrack} from '../src/track.js';
import {createHarborCoast,HARBOR_CHANNEL} from '../src/harbor-coast.js';
const track=createTrack('harbor'),coast=createHarborCoast(track);
function height(x,z){const s=track.nearest({x,z});return coast.height(x,z,{...s,d:s.distance},s.position.y-.65);}

test('navigation channel stays submerged all the way from lake through bridge to sea',()=>{
  for(let i=1;i<HARBOR_CHANNEL.length;i++){
    const a=HARBOR_CHANNEL[i-1],b=HARBOR_CHANNEL[i];
    for(let n=0;n<=30;n++)for(const offset of [-25,0,25]){
      const x=a[0]+(b[0]-a[0])*n/30,z=a[1]+(b[1]-a[1])*n/30+offset;
      assert.ok(height(x,z)<-2,`channel blocked at ${x},${z}`);
    }
  }
});
test('all sides have open sea and the full elevated bridge has water underneath',()=>{
  for(const [x,z]of [[-1100,0],[1200,0],[0,-1000],[0,1100]])assert.ok(height(x,z)<-5);
  for(let i=0;i<90;i++){const s=track.sample(.236+i/90*.098);assert.ok(height(s.position.x,s.position.z)<0);}
});
test('coastal excavation preserves dry ground under non-bridge driving lanes',()=>{
  for(let i=0;i<1800;i++){
    const s=track.sample(i/1800);if(i/1800>.233&&i/1800<.337)continue;
    for(const side of [-1,1]){
      const p=s.position.clone().addScaledVector(s.right,side*track.width/2);
      assert.ok(height(p.x,p.z)>s.position.y-1,`road undermined at ${i/1800}`);
    }
  }
});
