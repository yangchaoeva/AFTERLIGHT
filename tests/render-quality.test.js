import test from 'node:test';
import assert from 'node:assert/strict';
import {pixelRatioForQuality} from '../src/render-quality.js';

test('quality presets cap rendering while native uses the display pixel ratio',()=>{
  assert.equal(pixelRatioForQuality('low',2),1);
  assert.equal(pixelRatioForQuality('medium',2),1.25);
  assert.equal(pixelRatioForQuality('high',2),1.75);
  assert.equal(pixelRatioForQuality('native',2),2);
  assert.equal(pixelRatioForQuality('native',3),3);
  assert.equal(pixelRatioForQuality('high',1),1);
  assert.equal(pixelRatioForQuality('unknown',2),1.25);
});
