import * as THREE from 'three';
import { createCar } from './vehicle.js';
import { disposeVehicle } from './showroom-scene.js';

export const PB_GHOST_VERSION = 1;
export const PB_GHOST_KEY = 'afterlight.pb-ghost.v1';
export const PB_GHOST_SAMPLE_MS = 100;
export const CLASSIC_RULESET_VERSION = 'classic-v1';

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const finite = value => typeof value === 'number' && Number.isFinite(value);

function normalizeTrackId(trackId) {
  return typeof trackId === 'string' && trackId.length > 0 && trackId.length <= 100 ? trackId : null;
}

export function validateGhost(ghost, expectedTrack = null, expectedRuleset = null) {
  if (!ghost || ghost.version !== PB_GHOST_VERSION || !normalizeTrackId(ghost.trackId)) return false;
  if (!['classic-v1', 'chase-v2'].includes(ghost.rulesetVersion || CLASSIC_RULESET_VERSION)) return false;
  if (expectedTrack && ghost.trackId !== expectedTrack) return false;
  if (expectedRuleset && (ghost.rulesetVersion || CLASSIC_RULESET_VERSION) !== expectedRuleset) return false;
  if (!Number.isSafeInteger(ghost.elapsedMs) || ghost.elapsedMs <= 0 || ghost.elapsedMs > 1_800_000) return false;
  if (!Array.isArray(ghost.samples) || ghost.samples.length < 2 || ghost.samples.length > 18_001) return false;
  let previousMs = -1, previousT = -1;
  for (const sample of ghost.samples) {
    if (!Number.isSafeInteger(sample.elapsedMs) || sample.elapsedMs < 0 || sample.elapsedMs <= previousMs ||
        !finite(sample.t) || sample.t < 0 || sample.t > 1.001 || sample.t < previousT ||
        !finite(sample.offset) || Math.abs(sample.offset) > 100 ||
        !finite(sample.heading) || Math.abs(sample.heading) > Math.PI * 20) return false;
    previousMs = sample.elapsedMs;
    previousT = sample.t;
  }
  return ghost.samples[0].elapsedMs === 0 && ghost.samples.at(-1).elapsedMs <= ghost.elapsedMs + 1;
}

export class GhostLapRecorder {
  constructor(trackId, sampleIntervalMs = PB_GHOST_SAMPLE_MS, rulesetVersion = CLASSIC_RULESET_VERSION) {
    this.trackId = normalizeTrackId(trackId);
    this.rulesetVersion = rulesetVersion;
    this.sampleIntervalMs = clamp(Math.round(sampleIntervalMs), 50, 500);
    this.samples = [];
    this.nextSampleMs = 0;
    this.valid = !!this.trackId;
  }

  sample(elapsedMs, driver, force = false) {
    if (!this.valid || !finite(elapsedMs) || elapsedMs < 0 || !driver ||
        !finite(driver.progress) || !finite(driver.offset) || !finite(driver.heading)) return false;
    const ms = Math.max(0, Math.round(elapsedMs));
    if (!force && ms + 1 < this.nextSampleMs) return false;
    const last = this.samples.at(-1);
    if (last && ms <= last.elapsedMs) {
      if (force && ms === last.elapsedMs) {
        last.t = clamp(Math.max(last.t, driver.progress), 0, 1);
        last.offset = driver.offset;
        last.heading = driver.heading;
        return true;
      }
      return false;
    }
    this.samples.push({
      elapsedMs: ms,
      t: clamp(Math.max(last?.t ?? 0, driver.progress), 0, 1),
      offset: driver.offset,
      heading: driver.heading,
    });
    this.nextSampleMs = ms + this.sampleIntervalMs;
    return true;
  }

  finish(elapsedMs, driver) {
    if (!this.valid || !this.sample(elapsedMs, { ...driver, progress: 1 }, true)) return null;
    const ghost = { version: PB_GHOST_VERSION, trackId: this.trackId, rulesetVersion: this.rulesetVersion, elapsedMs: Math.round(elapsedMs), samples: this.samples.map(sample => ({ ...sample })) };
    return validateGhost(ghost, this.trackId, this.rulesetVersion) ? ghost : null;
  }

  invalidate() { this.valid = false; }
}

export class PBGhostStore {
  constructor(storage = globalThis.localStorage) { this.storage = storage; }
  key(trackId, rulesetVersion = CLASSIC_RULESET_VERSION) { const id = normalizeTrackId(trackId); return id ? `${PB_GHOST_KEY}.${encodeURIComponent(id)}.${rulesetVersion}` : null; }
  load(trackId, rulesetVersion = CLASSIC_RULESET_VERSION) {
    try {
      const key = this.key(trackId, rulesetVersion), legacyKey = rulesetVersion === CLASSIC_RULESET_VERSION ? `${PB_GHOST_KEY}.${encodeURIComponent(trackId)}` : null;
      const parsed = key && JSON.parse(this.storage?.getItem(key) || (legacyKey ? this.storage?.getItem(legacyKey) : null) || 'null');
      return validateGhost(parsed, trackId, rulesetVersion) ? parsed : null;
    } catch { return null; }
  }
  saveIfBetter(trackId, ghost, rulesetVersion = ghost?.rulesetVersion || CLASSIC_RULESET_VERSION) {
    const key = this.key(trackId, rulesetVersion);
    if (!key || !this.storage || !validateGhost(ghost, trackId, rulesetVersion)) return false;
    const old = this.load(trackId, rulesetVersion);
    if (old && old.elapsedMs <= ghost.elapsedMs) return false;
    try { this.storage?.setItem(key, JSON.stringify(ghost)); return true; }
    catch { return false; }
  }
}

function bracketAtProgress(samples, progress) {
  const t = clamp(progress, 0, 1);
  if (t <= samples[0].t) return [samples[0], samples[0], 0];
  const last = samples.at(-1);
  if (t >= last.t) return [last, last, 0];
  let lo = 0, hi = samples.length - 1;
  while (lo + 1 < hi) {
    const mid = (lo + hi) >> 1;
    if (samples[mid].t < t) lo = mid;
    else hi = mid;
  }
  const a = samples[lo], b = samples[hi], span = b.t - a.t;
  return [a, b, span > 1e-8 ? clamp((t - a.t) / span, 0, 1) : 1];
}

function bracketAtTime(samples, elapsedMs) {
  const time = Math.max(0, elapsedMs);
  if (time <= samples[0].elapsedMs) return [samples[0], samples[0], 0];
  const last = samples.at(-1);
  if (time >= last.elapsedMs) return [last, last, 0];
  let lo = 0, hi = samples.length - 1;
  while (lo + 1 < hi) {
    const mid = (lo + hi) >> 1;
    if (samples[mid].elapsedMs < time) lo = mid;
    else hi = mid;
  }
  const a = samples[lo], b = samples[hi], span = b.elapsedMs - a.elapsedMs;
  return [a, b, span > 0 ? clamp((time - a.elapsedMs) / span, 0, 1) : 1];
}

function interpolatePose(a, b, alpha) {
  const headingDelta = THREE.MathUtils.euclideanModulo(b.heading - a.heading + Math.PI, Math.PI * 2) - Math.PI;
  return {
    t: a.t + (b.t - a.t) * alpha,
    offset: a.offset + (b.offset - a.offset) * alpha,
    heading: THREE.MathUtils.euclideanModulo(a.heading + headingDelta * alpha + Math.PI, Math.PI * 2) - Math.PI,
  };
}

export function ghostTimeAtProgress(ghost, progress) {
  if (!validateGhost(ghost)) return null;
  const [a, b, alpha] = bracketAtProgress(ghost.samples, progress);
  return a.elapsedMs + (b.elapsedMs - a.elapsedMs) * alpha;
}

export function ghostPoseAtProgress(ghost, progress) {
  if (!validateGhost(ghost)) return null;
  const [a, b, alpha] = bracketAtProgress(ghost.samples, progress);
  return interpolatePose(a, b, alpha);
}

// Visual playback follows the PB lap's time axis, independently from HUD delta.
export function ghostPoseAtTime(ghost, elapsedMs) {
  if (!validateGhost(ghost) || !finite(elapsedMs)) return null;
  const [a, b, alpha] = bracketAtTime(ghost.samples, elapsedMs);
  return interpolatePose(a, b, alpha);
}

export function formatPBGhostDelta(elapsedMs, ghost, progress) {
  if (!finite(elapsedMs)) return '';
  const targetMs = ghostTimeAtProgress(ghost, progress);
  if (targetMs === null) return '';
  const delta = (elapsedMs - targetMs) / 1000;
  return `PB ${delta < 0 ? '-' : '+'}${Math.abs(delta).toFixed(3)}`;
}

export class PBTimeTrialGhost {
  constructor(scene, { storage = globalThis.localStorage, vehicleFactory = createCar, dispose = disposeVehicle } = {}) {
    this.scene = scene;
    this.store = new PBGhostStore(storage);
    this.vehicleFactory = vehicleFactory;
    this.disposeVehicle = dispose;
    this.trackId = null;
    this.mode = null;
    this.ghost = null;
    this.recorder = null;
    this.mesh = null;
  }

  begin(trackId, mode, vehicleId, driver, rulesetVersion = CLASSIC_RULESET_VERSION) {
    this.clearMesh();
    this.trackId = trackId;
    this.mode = mode;
    this.rulesetVersion = rulesetVersion;
    this.recorder = mode === 'time' ? new GhostLapRecorder(trackId, PB_GHOST_SAMPLE_MS, rulesetVersion) : null;
    this.ghost = mode === 'time' ? this.store.load(trackId, rulesetVersion) : null;
    if (this.ghost) this.createMesh(vehicleId);
    if (this.recorder) this.recorder.sample(0, { ...driver, progress: 0 }, true);
  }

  createMesh(vehicleId) {
    this.clearMesh();
    this.mesh = this.vehicleFactory({ model: vehicleId, color: '#9de8f6', detail: 'low' });
    this.mesh.name = 'pb-ghost';
    this.mesh.visible = false;
    const materialMap = new Map();
    const originals = new Set();
    this.mesh.traverse(object => {
      object.castShadow = false;
      object.receiveShadow = false;
      if (!object.isMesh || !object.material) return;
      object.renderOrder = 2;
      const replace = material => {
        originals.add(material);
        if (!materialMap.has(material)) materialMap.set(material, this.ghostMaterial(material));
        return materialMap.get(material);
      };
      object.material = Array.isArray(object.material) ? object.material.map(replace) : replace(object.material);
    });
    originals.forEach(material => material.dispose());
    this.scene.add(this.mesh);
  }

  ghostMaterial(material) {
    const clone = material.clone();
    clone.transparent = true;
    clone.opacity = 0.27;
    clone.depthWrite = false;
    if (clone.color) clone.color.set('#9de8f6');
    if (clone.emissive) clone.emissive.set('#17596b');
    return clone;
  }

  sample(elapsedMs, driver) { this.recorder?.sample(elapsedMs, driver); }

  invalidate() { this.recorder?.invalidate(); }

  finish(elapsedMs, driver, valid) {
    if (this.mesh) this.mesh.visible = false;
    if (!this.recorder || !valid) { this.invalidate(); return false; }
    const candidate = this.recorder.finish(elapsedMs, driver);
    if (!candidate || !this.store.saveIfBetter(this.trackId, candidate, this.rulesetVersion)) return false;
    this.ghost = candidate;
    return true;
  }

  update(track, driver, elapsedMs) {
    if (!this.mesh || !this.ghost || !driver) return;
    const pose = ghostPoseAtTime(this.ghost, elapsedMs);
    if (!pose) { this.mesh.visible = false; return; }
    const road = track.sample(driver.startT + pose.t);
    this.mesh.visible = true;
    this.mesh.position.copy(road.position).addScaledVector(road.right, pose.offset);
    this.mesh.rotation.set(-Math.asin(road.tangent.y), pose.heading, 0, 'YXZ');
  }

  delta(elapsedMs, progress) { return this.mode === 'time' ? formatPBGhostDelta(elapsedMs, this.ghost, progress) : ''; }

  clearMesh() {
    if (this.mesh) this.disposeVehicle(this.mesh);
    this.mesh = null;
  }

  dispose() { this.clearMesh(); this.recorder?.invalidate(); this.recorder = null; }
}
