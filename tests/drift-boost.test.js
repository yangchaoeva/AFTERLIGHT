import test from 'node:test';
import assert from 'node:assert/strict';
import { DriftBoost, DRIFT_BOOST_RULES, driftDebugState, effectiveVehiclePerformance, isDriftBoostEnabled } from '../src/drift-boost.js';
import { createTrack } from '../src/track.js';
import { createDriver, stepDriver } from '../src/physics.js';
import { PBGhostStore, GhostLapRecorder } from '../src/pb-ghost.js';
import { normalizeScore, parseBoardFilters } from '../worker/leaderboard-core.js';
import { submitLeaderboardScore } from '../src/leaderboard-client.js';

const drifting = (patch = {}) => ({ speed: 30, slip: .3, collisionCooldown: 0, offset: 1, steer: .5, heading: 0, velocityHeading: .1, ...patch });
const charge = boost => { for (let i = 0; i < 60; i++) boost.update(drifting(), .1); };

test('valid high-speed slip charges only after the minimum drift duration', () => {
  const boost = new DriftBoost();
  boost.update(drifting(), .1); boost.update(drifting(), .1);
  assert.equal(boost.energy, 0);
  boost.update(drifting(), .1);
  assert.ok(boost.energy > 0);
});

test('low slip without a meaningful slide does not charge', () => {
  const boost = new DriftBoost();
  for (let i = 0; i < 60; i++) boost.update(drifting({ slip: DRIFT_BOOST_RULES.minSlip - .001 }), .1);
  assert.equal(boost.energy, 0);
});

test('low speed, collision, reset and extreme spin do not charge; stopped drift preserves energy', () => {
  const boost = new DriftBoost();
  for (const state of [drifting({ speed: 4 }), drifting({ collisionCooldown: .2 }), drifting({ slip: .9 }), drifting({ steer: 1 })])
    for (let i = 0; i < 20; i++) boost.update(state, .1);
  boost.update(drifting(), .1, { resetting: true });
  assert.equal(boost.energy, 0);
  charge(boost);
  const energy = boost.energy;
  boost.update(drifting({ speed: 0 }), .1);
  assert.equal(boost.energy, energy);
});

test('development debug state identifies the primary drift rejection reason', () => {
  assert.deepEqual(driftDebugState(drifting({ speed: 2, slip: .2 })), { candidate: false, valid: false, rejectReason: 'LOW_SPEED' });
  assert.equal(driftDebugState(drifting({ speed: 30, slip: .01 })).rejectReason, 'SLIP_TOO_LOW');
  assert.equal(driftDebugState(drifting({ speed: 30, slip: .2, collisionCooldown: .1 })).rejectReason, 'COLLISION');
  assert.equal(driftDebugState(drifting({ speed: 30, slip: .2 })).candidate, true);
  assert.equal(driftDebugState(drifting({ speed: 30, slip: .2 }), { resetting: true }).rejectReason, 'RESETTING');
});

test('Shift activation requires 100 energy and boost lasts the configured duration', () => {
  const boost = new DriftBoost();
  boost.update(drifting(), .1, { activate: true });
  assert.equal(boost.boostActive, false);
  charge(boost);
  assert.equal(boost.energy, 100);
  boost.update(drifting(), .1, { activate: true });
  assert.equal(boost.energy, 0);
  assert.equal(boost.boostActive, true);
  const duration = boost.boostRemaining;
  for (let i = 0; i < Math.ceil(duration / .1); i++) boost.update(drifting({ speed: 0 }), .1);
  assert.equal(boost.boostActive, false);
  assert.equal(boost.boostRemaining, 0);
});

test('boost changes only temporary acceleration and a small top-speed allowance; reset clears all state', () => {
  const base = { acceleration: 10, topSpeed: 60, label: 'car' };
  assert.equal(effectiveVehiclePerformance(base, false), base);
  const boosted = effectiveVehiclePerformance(base, true);
  assert.equal(boosted.acceleration, 10 * DRIFT_BOOST_RULES.accelerationMultiplier);
  assert.equal(boosted.topSpeed, 62.5);
  assert.equal(base.topSpeed, 60);
  const boost = new DriftBoost(); charge(boost); boost.update(drifting(), .1, { activate: true }); boost.reset();
  assert.deepEqual(boost.snapshot(), { energy: 0, boostActive: false, boostRemaining: 0, boostReady: false });
});

test('boost reaches the physics step as a temporary acceleration/top-speed modifier', () => {
  const track = createTrack('coast');
  const normal = createDriver(track, { model: 'aurora' }), boosted = createDriver(track, { model: 'aurora' });
  normal.speed = boosted.speed = 45;
  stepDriver(normal, { throttle: 1 }, track, 1 / 60);
  stepDriver(boosted, { throttle: 1 }, track, 1 / 60, { boostActive: true });
  assert.ok(boosted.speed > normal.speed, `boosted speed ${boosted.speed} should exceed normal ${normal.speed}`);
});

test('normal vehicle physics can generate drift energy through a controlled steering slide', () => {
  const track = createTrack('coast'), driver = createDriver(track, { model: 'aurora', t: .5 }), boost = new DriftBoost();
  driver.speed = 45;
  for (let i = 0; i < 60 * 5; i++) {
    const seconds = i / 60;
    stepDriver(driver, { throttle: 1, steer: .7 * Math.sin(seconds * 2.4), digital: false }, track, 1 / 60);
    boost.update(driver, 1 / 60);
  }
  assert.ok(boost.energy >= 20, `five seconds of controlled steering produced ${boost.energy.toFixed(1)} energy`);
});

test('Race mode and retry reset cannot carry an enabled or charged boost forward', () => {
  assert.equal(isDriftBoostEnabled('time', true), true);
  assert.equal(isDriftBoostEnabled('race', true), false);
  assert.equal(isDriftBoostEnabled('time', false), false);
  const boost = new DriftBoost();
  boost.update(drifting(), .1, { enabled: false, activate: true });
  assert.deepEqual(boost.snapshot(), { energy: 0, boostActive: false, boostRemaining: 0, boostReady: false });
  charge(boost); boost.update(drifting(), .1, { activate: true });
  boost.reset();
  assert.equal(boost.energy, 0);
  assert.equal(boost.boostActive, false);
  assert.equal(boost.boostRemaining, 0);
});

test('classic and chase PB ghosts are stored separately and legacy ghost data remains classic', () => {
  const map = new Map(), storage = { getItem: k => map.get(k) ?? null, setItem: (k, v) => map.set(k, v) };
  const make = (rulesetVersion, ms) => { const r = new GhostLapRecorder('coast', 100, rulesetVersion); r.sample(0, { progress: 0, offset: 0, heading: 0 }); return r.finish(ms, { progress: 1, offset: 0, heading: 0 }); };
  const store = new PBGhostStore(storage);
  assert.equal(store.saveIfBetter('coast', make('classic-v1', 1000)), true);
  assert.equal(store.saveIfBetter('coast', make('chase-v2', 900)), true);
  assert.equal(store.load('coast').elapsedMs, 1000);
  assert.equal(store.load('coast', 'chase-v2').elapsedMs, 900);
  const legacy = make('classic-v1', 800);
  map.set('afterlight.pb-ghost.v1.coast', JSON.stringify(legacy));
  assert.equal(store.load('coast').elapsedMs, 1000, 'new classic key takes precedence over legacy record');
});

test('chase-v2 cannot enter the classic leaderboard through client, API filters or score validation', async () => {
  await assert.rejects(() => submitLeaderboardScore({ rulesetVersion: 'chase-v2' }, {}, async () => { throw new Error('must not call network'); }), /不能提交/);
  assert.throws(() => parseBoardFilters('https://api.test/api/leaderboard?track=coast&rulesetVersion=chase-v2'), /暂不支持/);
  assert.throws(() => normalizeScore({ rulesetVersion: 'chase-v2' }), /暂不支持/);
});
