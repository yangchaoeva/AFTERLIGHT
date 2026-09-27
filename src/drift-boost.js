export const DRIFT_BOOST_RULES = Object.freeze({
  rulesetVersion: 'chase-v2',
  minSpeed: 18,
  minSlip: 0.055,
  maxSlip: 0.58,
  minForwardSpeed: 12,
  maxOffset: 12,
  maxSteer: 0.92,
  minDriftDuration: 0.25,
  energyRate: 24,
  boostDuration: 1.8,
  accelerationMultiplier: 1.55,
  topSpeedBonus: 2.5,
});

export const CLASSIC_RULESET_VERSION = 'classic-v1';

export function isDriftBoostEnabled(mode, requested) { return mode === 'time' && requested === true; }

export function isValidDrift(driver, resetting = false) {
  const r = DRIFT_BOOST_RULES;
  return !resetting && !!driver && driver.speed >= r.minSpeed &&
    driver.speed * Math.cos(driver.heading - driver.velocityHeading) >= r.minForwardSpeed &&
    driver.slip >= r.minSlip && driver.slip <= r.maxSlip &&
    driver.collisionCooldown <= 0 && Math.abs(driver.offset) <= r.maxOffset &&
    Math.abs(driver.steer || 0) <= r.maxSteer;
}

export function driftDebugState(driver, { resetting = false } = {}) {
  const r = DRIFT_BOOST_RULES;
  const candidate = !!driver && driver.speed >= r.minSpeed &&
    driver.slip >= r.minSlip && driver.slip <= r.maxSlip;
  let rejectReason = '';
  if (resetting) rejectReason = 'RESETTING';
  else if (!driver) rejectReason = 'NO_DRIVER';
  else if (driver.speed < r.minSpeed) rejectReason = 'LOW_SPEED';
  else if (driver.slip < r.minSlip) rejectReason = 'SLIP_TOO_LOW';
  else if (driver.slip > r.maxSlip) rejectReason = 'SLIP_TOO_HIGH';
  else if (driver.collisionCooldown > 0) rejectReason = 'COLLISION';
  else if (Math.abs(driver.offset) > r.maxOffset) rejectReason = 'OFFSET';
  else if (Math.abs(driver.steer || 0) > r.maxSteer) rejectReason = 'STEER';
  else if (driver.speed * Math.cos(driver.heading - driver.velocityHeading) < r.minForwardSpeed) rejectReason = 'NOT_FORWARD';
  return { candidate, valid: isValidDrift(driver, resetting), rejectReason };
}

export class DriftBoost {
  constructor() { this.reset(); }

  reset() {
    this.energy = 0;
    this.boostActive = false;
    this.boostRemaining = 0;
    this.driftDuration = 0;
  }

  update(driver, dt, { enabled = true, resetting = false, activate = false } = {}) {
    if (!enabled) { this.reset(); return this.snapshot(); }
    const delta = Math.max(0, Math.min(0.1, Number(dt) || 0));
    if (this.boostActive) {
      this.boostRemaining = Math.max(0, this.boostRemaining - delta);
      if (this.boostRemaining === 0) this.boostActive = false;
    }
    if (isValidDrift(driver, resetting)) {
      this.driftDuration += delta;
      if (this.driftDuration >= DRIFT_BOOST_RULES.minDriftDuration) {
        this.energy = Math.min(100, this.energy + DRIFT_BOOST_RULES.energyRate * delta);
      }
    } else this.driftDuration = 0;
    if (activate && this.energy >= 100 && !this.boostActive) {
      this.energy = 0;
      this.boostActive = true;
      this.boostRemaining = DRIFT_BOOST_RULES.boostDuration;
      this.driftDuration = 0;
    }
    return this.snapshot();
  }

  snapshot() {
    return { energy: this.energy, boostActive: this.boostActive, boostRemaining: this.boostRemaining, boostReady: this.energy >= 100 };
  }
}

export function effectiveVehiclePerformance(base, boostActive) {
  return boostActive
    ? { ...base, acceleration: base.acceleration * DRIFT_BOOST_RULES.accelerationMultiplier, topSpeed: base.topSpeed + DRIFT_BOOST_RULES.topSpeedBonus }
    : base;
}
