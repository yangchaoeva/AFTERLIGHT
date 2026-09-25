import test from 'node:test';
import assert from 'node:assert/strict';
import {createTrack} from '../src/track.js';
import {HARBOR_LAKE,lakePoint,lakeRadius,carveLake} from '../src/harbor-lake.js';

test('harbor lake has a submerged basin and leaves the road and shoulders intact',()=>{
  const track=createTrack('harbor');
  assert.ok(carveLake(HARBOR_LAKE.x,HARBOR_LAKE.z,3)<HARBOR_LAKE.level-8);
  for(let i=0;i<720;i++){
    const a=i/720*Math.PI*2,water=lakePoint(a),bank=lakePoint(a,1.14);
    assert.ok(Math.abs(lakeRadius(water.x,water.z)-1)<1e-9);
    assert.ok(carveLake(water.x,water.z,3)<HARBOR_LAKE.level);
    assert.ok(track.nearest(bank).distance>track.width/2+18);
    const s=track.sample(i/720);
    for(const offset of [-12,0,12]){
      const p=s.position.clone().addScaledVector(s.right,offset);
      assert.equal(carveLake(p.x,p.z,s.position.y),s.position.y);
    }
  }
});
