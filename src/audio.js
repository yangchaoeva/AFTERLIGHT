import {getVehicle} from './vehicle-catalog.js';
// Original real-time racing sound design. No sound starts before start(), which
// must be called from a player gesture. speed is metres/second; dt is seconds.
const LINES = Object.freeze({
  welcome: '欢迎来到逐光海岸。享受驾驶。',
  ready: '引擎就绪，准备起跑。',
  three: '三', two: '二', one: '一', go: '出发！',
  finalLap: '最后一圈，保持节奏。',
  finish: '比赛完成。漂亮的驾驶！',
  reset: '已返回赛道。',
  overtake: '漂亮的超车！',
});

const clamp = (value, low = 0, high = 1) => Math.max(low, Math.min(high, Number(value) || 0));
const approach = (from, to, dt, rate) => from + (to - from) * (1 - Math.exp(-rate * dt));

export class RaceAudio {
  constructor() {
    this.context = null;
    this.master = null;
    this.muted = false;
    this.voiceEnabled = true;
    this.paused = false;
    this.destroyed = false;
    this.started = false;
    this.rpm = 1050;
    this.gear = 0;
    this.shiftTime = 0;
    this.speed = 0;
    this.throttle = 0;
    this.slip = 0;
    this.sources = [];
    this.voices = new Map();
    this.voiceSource = null;
    this.loading = null;
    this.lastSpoken = new Map();
  }

  async start() {
    if (this.destroyed) return false;
    const Context = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!Context) return false;
    try {
      if (!this.context) {
        this.context = new Context({ latencyHint: 'interactive' });
        this.buildGraph();
      }
      if (this.context.state === 'suspended') await this.context.resume();
      this.started = true;
      this.paused = false;
      this.loading ||= this.loadVoices();
      await this.loading;
      return !this.destroyed && this.context?.state === 'running';
    } catch {
      // Audio is an enhancement: unavailable devices or autoplay policies must
      // never stop the race or throw into the animation loop.
      return false;
    }
  }

  buildGraph() {
    const ctx = this.context;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.72;
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -12;
    limiter.knee.value = 15;
    limiter.ratio.value = 5;
    limiter.attack.value = 0.006;
    limiter.release.value = 0.14;
    this.master.connect(limiter);
    limiter.connect(ctx.destination);

    this.engine = ctx.createGain();
    this.engine.gain.value = 0.06;
    this.engineFilter = ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 780;
    this.engineFilter.Q.value = 0.65;
    this.engineFilter.connect(this.engine);
    this.engine.connect(this.master);

    // A rounded pulse bank makes individual exhaust events audible at idle.
    // The separate crank, firing and body layers retain weight as RPM rises.
    const real = new Float32Array(20);
    const imaginary = new Float32Array(20);
    for (let harmonic = 1; harmonic < imaginary.length; harmonic++) {
      imaginary[harmonic] = Math.sin(harmonic * 0.95) / (harmonic ** 1.35);
    }
    const exhaustWave = ctx.createPeriodicWave(real, imaginary);
    this.crank = this.oscillator('sine', 18, 0.32, this.engineFilter);
    this.firing = this.oscillator('sine', 72, 0.46, this.engineFilter);
    this.firing.setPeriodicWave(exhaustWave);
    this.body = this.oscillator('triangle', 36, 0.21, this.engineFilter);
    this.overtone = this.oscillator('sine', 108, 0.07, this.engineFilter);

    this.flutter = ctx.createOscillator();
    this.flutter.frequency.value = 9;
    this.flutterDepth = ctx.createGain();
    this.flutterDepth.gain.value = 0.007;
    this.flutter.connect(this.flutterDepth);
    this.flutterDepth.connect(this.engine.gain);
    this.flutter.start();
    this.sources.push(this.flutter);

    this.noise = this.makeNoise();
    this.combustion = this.noiseLayer('bandpass', 520, 0.8, this.engineFilter);
    this.combustion.gain.gain.value = 0.05;
    this.wind = this.noiseLayer('lowpass', 550, 0.3, this.master);
    this.road = this.noiseLayer('bandpass', 190, 0.4, this.master);
    this.tire = this.noiseLayer('bandpass', 2100, 1.9, this.master);
    this.tireTone = ctx.createGain();
    this.tireTone.gain.value = 0;
    this.tireTone.connect(this.master);
    this.squeal = this.oscillator('sine', 1080, 0.12, this.tireTone);

    this.voiceGain = ctx.createGain();
    this.voiceGain.gain.value = 0.84;
    this.voiceGain.connect(this.master);
  }

  oscillator(type, frequency, volume, output) {
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.value = frequency;
    gain.gain.value = volume;
    oscillator.connect(gain);
    gain.connect(output);
    oscillator.start();
    this.sources.push(oscillator);
    return oscillator;
  }

  makeNoise() {
    const ctx = this.context;
    const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * 3), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let smoothed = 0;
    for (let index = 0; index < data.length; index++) {
      const white = Math.random() * 2 - 1;
      smoothed = smoothed * 0.89 + white * 0.11;
      data[index] = white * 0.54 + smoothed * 0.46;
    }
    return buffer;
  }

  noiseLayer(type, frequency, q, output) {
    const ctx = this.context;
    const source = ctx.createBufferSource();
    source.buffer = this.noise;
    source.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = frequency;
    filter.Q.value = q;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    source.connect(filter);
    filter.connect(gain);
    gain.connect(output);
    source.start(0, Math.random() * 2);
    this.sources.push(source);
    return { gain, filter, source };
  }

  async loadVoices() {
    if (typeof fetch !== 'function' || typeof location === 'undefined') return;
    const base = import.meta.env?.BASE_URL || './';
    const directory = new URL(`${base}audio/`, location.href);
    const ctx = this.context;
    await Promise.allSettled(Object.keys(LINES).map(async (key) => {
      const response = await fetch(new URL(`${key}.wav`, directory));
      if (!response.ok) return;
      const buffer = await ctx.decodeAudioData(await response.arrayBuffer());
      if (!this.destroyed) this.voices.set(key, buffer);
    }));
  }

  parameter(parameter, value, smoothing = 0.07) {
    if (!this.context || !Number.isFinite(value)) return;
    parameter.setTargetAtTime(value, this.context.currentTime, smoothing);
  }

  update({ speed = 0, throttle = 0, brake = 0, slip = 0, model = '', dt = 1 / 60 } = {}) {
    if (!this.context || this.destroyed || this.paused || !this.started) return;
    const elapsed = clamp(dt, 0.001, 0.1);
    this.speed = approach(this.speed, clamp(Math.abs(speed), 0, 150), elapsed, 9);
    this.throttle = approach(this.throttle, clamp(throttle), elapsed, 7);
    this.slip = approach(this.slip, clamp(Math.abs(slip)), elapsed, 11);
    const thresholds = [15, 28, 43, 60, 80];
    let nextGear = this.gear;
    if (this.gear < 5 && this.speed > thresholds[this.gear]) nextGear++;
    if (this.gear > 0 && this.speed < thresholds[this.gear - 1] - 5) nextGear--;
    if (nextGear !== this.gear) {
      this.gear = nextGear;
      this.shiftTime = 0.19;
    }
    this.shiftTime = Math.max(0, this.shiftTime - elapsed);
    const ratios = [285, 184, 131, 103, 81, 67];
    const wantedRpm = clamp(1000 + this.speed * ratios[this.gear] + this.throttle * 570, 900, 8100);
    this.rpm = approach(this.rpm, wantedRpm, elapsed, this.shiftTime > 0 ? 17 : 7);
    const modelName = String(typeof model === 'object' ? model?.id || model?.name || '' : model).toLowerCase();
    const engine=getVehicle(modelName).engine;
    const lightEngine=engine==='light';
    const supercar=engine==='supercar';
    const firingOrder = lightEngine ? 3 : supercar ? 5 : 4;
    const crankHz = this.rpm / 60;
    const t = this.context.currentTime;
    const irregularity = 1 + Math.sin(t * 8.7) * 0.0018 + Math.sin(t * 12.3) * 0.001;
    this.parameter(this.crank.frequency, crankHz * irregularity, 0.035);
    this.parameter(this.body.frequency, crankHz * (engine==='muscle'?1.505:2.008), 0.035);
    this.parameter(this.firing.frequency, crankHz * firingOrder * irregularity, 0.035);
    this.parameter(this.overtone.frequency, crankHz * (firingOrder + 2), 0.04);
    this.parameter(this.flutter.frequency, clamp(crankHz * 0.5, 8, 40));
    const shiftDip = this.shiftTime > 0 ? 0.50 : 1;
    const load = 0.12 + this.throttle * 0.88;
    const voiced = this.voiceSource ? 0.66 : 1;
    this.parameter(this.engine.gain, (0.15 + load * 0.27 + this.speed / 700) * shiftDip * voiced, 0.05);
    this.parameter(this.flutterDepth.gain, 0.003 + load * 0.01);
    this.parameter(this.engineFilter.frequency, 540 + this.rpm * 0.16 + load * 1550);
    this.parameter(this.combustion.gain.gain, 0.045 + load * 0.15);
    this.parameter(this.combustion.filter.frequency, 300 + this.rpm * 0.10);
    const velocity = clamp(this.speed / 100);
    this.parameter(this.wind.gain.gain, velocity ** 1.8 * 0.16 * voiced, 0.17);
    this.parameter(this.wind.filter.frequency, 260 + velocity * 1600, 0.2);
    this.parameter(this.road.gain.gain, Math.sqrt(velocity) * 0.065 * voiced, 0.15);
    this.parameter(this.road.filter.frequency, 110 + velocity * 380);
    const tireLoad = Math.max(this.slip, clamp(brake) * velocity * 0.22);
    const tireVolume = clamp((tireLoad - 0.10) / 0.90) * clamp(this.speed / 8);
    this.parameter(this.tire.gain.gain, tireVolume ** 1.5 * 0.20 * voiced, 0.07);
    this.parameter(this.tireTone.gain, tireVolume ** 1.6 * 0.32 * voiced, 0.08);
    this.parameter(this.squeal.frequency, 880 + tireLoad * 450 + Math.sin(t * 14) * 28, 0.045);
    this.parameter(this.tire.filter.frequency, 1800 + tireLoad * 950);
  }

  tone(frequency, duration = 0.16, volume = 0.16, delay = 0) {
    if (!this.context || this.muted || this.paused || this.destroyed) return;
    const ctx = this.context;
    const oscillator = ctx.createOscillator();
    const envelope = ctx.createGain();
    const time = ctx.currentTime + delay;
    oscillator.type = 'sine';
    oscillator.frequency.value = frequency;
    envelope.gain.setValueAtTime(0, time);
    envelope.gain.linearRampToValueAtTime(volume, time + 0.009);
    envelope.gain.exponentialRampToValueAtTime(0.001, time + duration);
    oscillator.connect(envelope);
    envelope.connect(this.master);
    oscillator.start(time);
    oscillator.stop(time + duration + 0.025);
    oscillator.onended = () => { oscillator.disconnect(); envelope.disconnect(); };
  }

  say(key) {
    const text = LINES[key];
    if (!text || this.destroyed || this.muted || this.paused || !this.started) return text || '';
    const now = Date.now();
    const cooldown = key === 'overtake' ? 14000 : key === 'reset' ? 3500 : 250;
    if (now - (this.lastSpoken.get(key) || 0) < cooldown) return text;
    this.lastSpoken.set(key, now);
    if (['three', 'two', 'one'].includes(key)) this.tone(660, 0.16, 0.15);
    if (key === 'go') { this.tone(990, 0.32, 0.17); this.tone(1320, 0.25, 0.07, 0.08); }
    if (key === 'finish') {
      [659.25, 783.99, 987.77].forEach((hz, i) => this.tone(hz, 0.6, 0.06, i * 0.11));
    }
    if (!this.voiceEnabled) return text;
    this.stopVoice();
    const buffer = this.voices.get(key);
    if (buffer && this.context?.state === 'running') {
      const source = this.context.createBufferSource();
      source.buffer = buffer;
      source.connect(this.voiceGain);
      source.onended = () => {
        source.disconnect();
        if (this.voiceSource === source) this.voiceSource = null;
      };
      this.voiceSource = source;
      source.start();
    } else if (globalThis.speechSynthesis && globalThis.SpeechSynthesisUtterance) {
      const utterance = new SpeechSynthesisUtterance(text);
      const voices = speechSynthesis.getVoices();
      utterance.voice = voices.find((voice) => voice.lang?.toLowerCase() === 'zh-cn') || null;
      utterance.lang = 'zh-CN';
      utterance.rate = ['three', 'two', 'one', 'go'].includes(key) ? 1.2 : 1.06;
      utterance.pitch = 0.95;
      utterance.volume = 0.75;
      speechSynthesis.speak(utterance);
    }
    return text;
  }

  stopVoice() {
    if (this.voiceSource) {
      try { this.voiceSource.stop(); } catch { /* already ended */ }
      this.voiceSource = null;
    }
    globalThis.speechSynthesis?.cancel();
  }

  setMuted(value) {
    this.muted = Boolean(value);
    if (this.master) this.parameter(this.master.gain, this.muted ? 0 : 0.72, 0.04);
    if (this.muted) this.stopVoice();
  }

  setVoiceEnabled(value) {
    this.voiceEnabled = Boolean(value);
    if (!this.voiceEnabled) this.stopVoice();
  }

  pause() {
    this.paused = true;
    this.stopVoice();
    if (this.context?.state === 'running') this.context.suspend().catch(() => {});
  }

  async resume() {
    this.paused = false;
    if (this.destroyed) return;
    if (!this.context) return this.start();
    try { if (this.context.state === 'suspended') await this.context.resume(); } catch { /* optional audio */ }
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.stopVoice();
    for (const source of this.sources) {
      try { source.stop(); source.disconnect(); } catch { /* stopped or closed */ }
    }
    this.sources.length = 0;
    this.voices.clear();
    if (this.context && this.context.state !== 'closed') this.context.close().catch(() => {});
    this.context = null;
  }
}
