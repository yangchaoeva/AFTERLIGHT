import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { GhostLapRecorder, PBGhostStore, PBTimeTrialGhost, formatPBGhostDelta, ghostPoseAtProgress, ghostPoseAtTime, ghostTimeAtProgress } from '../src/pb-ghost.js';

function memoryStorage() {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), values };
}

const state = (progress, offset = 0, heading = 0) => ({ progress, offset, heading });

test('Time Trial ghost records about every 100 ms with route pose and an exact finish sample', () => {
  const recorder = new GhostLapRecorder('coast');
  assert.equal(recorder.sample(0, state(0)), true);
  assert.equal(recorder.sample(50, state(.05)), false);
  assert.equal(recorder.sample(101, state(.1, 1, .2)), true);
  assert.equal(recorder.sample(202, state(.2, 2, .4)), true);
  const ghost = recorder.finish(251, state(.24, 2.4, .5));
  assert.equal(ghost.trackId, 'coast');
  assert.deepEqual(ghost.samples.map(s => s.elapsedMs), [0, 101, 202, 251]);
  assert.equal(ghost.samples.at(-1).t, 1);
  assert.equal(ghost.samples.at(-1).offset, 2.4);
});

test('PB store keeps one fastest valid ghost per track and preserves it after invalid runs', () => {
  const store = new PBGhostStore(memoryStorage());
  const make = (trackId, elapsedMs) => {
    const recorder = new GhostLapRecorder(trackId);
    recorder.sample(0, state(0)); recorder.sample(elapsedMs - 100, state(.9));
    return recorder.finish(elapsedMs, state(.95));
  };
  assert.equal(store.saveIfBetter('coast', make('coast', 80_000)), true);
  assert.equal(store.saveIfBetter('coast', make('coast', 81_000)), false);
  assert.equal(store.saveIfBetter('coast', make('coast', 79_000)), true);
  assert.equal(store.load('coast').elapsedMs, 79_000);
  assert.equal(store.load('mountain'), null);
  assert.equal(store.saveIfBetter('mountain', make('coast', 70_000)), false);
});

test('ghost delta is measured at matching progress and headings interpolate across the angle seam', () => {
  const recorder = new GhostLapRecorder('harbor');
  recorder.sample(0, state(0, 0, 3.1));
  recorder.sample(1000, state(.5, 2, -3.1));
  const ghost = recorder.finish(2000, state(.9, 0, 0));
  assert.equal(ghostTimeAtProgress(ghost, .25), 500);
  assert.equal(formatPBGhostDelta(262, ghost, .25), 'PB -0.238');
  assert.equal(formatPBGhostDelta(917, ghost, .25), 'PB +0.417');
  const pose = ghostPoseAtProgress(ghost, .25);
  assert.ok(Math.abs(Math.abs(pose.heading) - Math.PI) < .05);
});

test('Ghost visual pose is interpolated on the PB elapsed-time axis', () => {
  const recorder = new GhostLapRecorder('coast');
  recorder.sample(0, state(0, 0, 3.1));
  recorder.sample(1000, state(.2, 2, -3.1));
  recorder.sample(2000, state(.5, 4, -2.8));
  const ghost = recorder.finish(3000, state(.8, 6, -2.5));
  const exact = ghostPoseAtTime(ghost, 1000);
  assert.equal(exact.t, .2);
  assert.equal(exact.offset, 2);
  assert.ok(Math.abs(exact.heading + 3.1) < 1e-12);
  const mid = ghostPoseAtTime(ghost, 500);
  assert.equal(mid.t, .1);
  assert.equal(mid.offset, 1);
  assert.ok(Math.abs(Math.abs(mid.heading) - Math.PI) < .05, 'heading uses the short arc through the ±π seam');
});

test('stopped player does not stop Ghost; pose follows elapsed time and freezes when paused timer is held', () => {
  const storage = memoryStorage();
  const store = new PBGhostStore(storage);
  const recorder = new GhostLapRecorder('coast');
  recorder.sample(0, state(0));
  recorder.sample(1000, state(.2));
  recorder.sample(2000, state(.5));
  store.saveIfBetter('coast', recorder.finish(3000, state(.8)));

  const scene = new THREE.Scene();
  const controller = new PBTimeTrialGhost(scene, { storage, vehicleFactory: () => new THREE.Group(), dispose: mesh => mesh.removeFromParent() });
  const driver = { ...state(.1), startT: 0 }; // Player progress remains fixed while the race timer advances.
  controller.begin('coast', 'time', 'aurora', driver);
  const track = { sample: t => ({ position: new THREE.Vector3(t * 100, 0, 0), right: new THREE.Vector3(0, 0, 1), tangent: new THREE.Vector3(0, 0, 1) }) };

  controller.update(track, driver, 0);
  const stoppedPlayerPose = controller.mesh.position.x;
  controller.update(track, driver, 1000);
  const movingGhostPose = controller.mesh.position.x;
  assert.equal(stoppedPlayerPose, 0);
  assert.equal(movingGhostPose, 20, 'at one second Ghost reaches the one-second PB sample');
  assert.notEqual(movingGhostPose, stoppedPlayerPose, 'Ghost advances although player progress is unchanged');

  const beforePause = controller.mesh.position.clone();
  // During pause, the game does not advance raceTime; repeated renders receive the same timer value.
  controller.update(track, driver, 1000);
  controller.update(track, driver, 1000);
  assert.ok(controller.mesh.position.distanceTo(beforePause) < 1e-9);
  assert.equal(controller.delta(1000, driver.progress), 'PB +0.500');
  assert.equal(controller.delta(1500, driver.progress), 'PB +1.000', 'delta can grow at frozen player progress');
  controller.dispose();
});

test('a Retry after a new PB reloads the latest ghost from time zero', () => {
  const storage = memoryStorage(), store = new PBGhostStore(storage);
  const make = (lapMs, startT) => {
    const recorder = new GhostLapRecorder('coast');
    recorder.sample(0, state(0));
    recorder.sample(lapMs - 100, state(.8, startT));
    return recorder.finish(lapMs, state(.9, startT));
  };
  store.saveIfBetter('coast', make(1000, 0));
  assert.equal(store.saveIfBetter('coast', make(900, 7)), true);

  const scene = new THREE.Scene();
  const controller = new PBTimeTrialGhost(scene, { storage, vehicleFactory: () => new THREE.Group(), dispose: mesh => mesh.removeFromParent() });
  controller.begin('coast', 'time', 'aurora', { ...state(0), startT: 0 });
  const track = { sample: t => ({ position: new THREE.Vector3(t * 10, 0, 0), right: new THREE.Vector3(0, 0, 1), tangent: new THREE.Vector3(0, 0, 1) }) };
  controller.update(track, { ...state(0), startT: 0 }, 0);
  assert.equal(controller.ghost.elapsedMs, 900);
  assert.equal(controller.mesh.position.x, 0, 'the refreshed Ghost is positioned at its start when Retry begins');
  controller.update(track, { ...state(0), startT: 0 }, 800);
  assert.equal(controller.mesh.position.x, 8, 'Retry replays the improved PB trajectory, not the previous lap');
  assert.equal(controller.mesh.position.z, 7);
  assert.equal(store.load('coast').elapsedMs, 900, 'loading for Retry does not write another PB');
  controller.dispose();
});

test('invalidated or unfinished attempts cannot produce or replace a PB ghost', () => {
  const recorder = new GhostLapRecorder('mountain');
  recorder.sample(0, state(0)); recorder.sample(100, state(.1)); recorder.invalidate();
  assert.equal(recorder.finish(200, state(.2)), null);
  const store = new PBGhostStore(memoryStorage());
  assert.equal(store.saveIfBetter('mountain', null), false);
  assert.equal(store.load('mountain'), null);
});

test('Race mode does not load, record or render a PB ghost', () => {
  const scene = { add() { throw new Error('Race must not add a Ghost mesh'); } };
  const controller = new PBTimeTrialGhost(scene, { storage: memoryStorage() });
  controller.begin('coast', 'race', 'aurora', state(0));
  controller.sample(100, state(.1));
  assert.equal(controller.ghost, null);
  assert.equal(controller.recorder, null);
  assert.equal(controller.delta(200, .2), '');
  controller.dispose();
});
