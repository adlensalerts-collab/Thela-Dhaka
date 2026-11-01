import type { TrafficItem } from '../world/traffic';
import type { PedestrianNPC } from '../pedestrians';

export type SoundscapeZone = 'bazaar' | 'intersection' | 'avenue' | 'alley';

export interface AmbientAudioSnapshot {
  zone: SoundscapeZone;
  zoneLabel: string;
  zoneBnLabel: string;
  trafficLevel: number; // 0..1
  crowdLevel: number;   // 0..1
}

export interface AmbientUpdateParams {
  playerX: number;
  playerZ: number;
  cameraYaw: number;
  isPlaying: boolean;
  isPaused: boolean;
  isAlert: boolean;
  isSelling: boolean;
  muted: boolean;
  traffic: TrafficItem[];
  pedestrians: PedestrianNPC[];
  stalls: ReadonlyArray< readonly [number, number] >;
  playerStall?: { x: number; z: number } | null;
}

const AMBIENT_STORAGE_KEY = 'thela_dhaka_ambient_audio_v1';
const STREET_COORDS = [-80, -40, 0, 40, 80];

export function loadAmbientVolume(): number {
  try {
    const raw = localStorage.getItem(AMBIENT_STORAGE_KEY);
    if (!raw) return 0.75;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.volume === 'number') {
      return Math.max(0, Math.min(1, parsed.volume));
    }
  } catch {
    // ignore storage errors
  }
  return 0.75;
}

export function saveAmbientVolume(volume: number): void {
  try {
    const clamped = Math.max(0, Math.min(1, volume));
    localStorage.setItem(AMBIENT_STORAGE_KEY, JSON.stringify({ volume: clamped }));
  } catch {
    // ignore storage errors
  }
}

/**
 * Location-aware layered Web Audio soundscape manager for Thela Dhaka.
 * Synthesizes continuous spatial layers (distant traffic rumble, motor pass-bys,
 * bazaar crowd chatter, and tree-canopy breeze) plus directional one-shot Dhaka
 * street sounds (rickshaw bells, bus horns, tea-stall clinks, crows, police whistle).
 */
export class AmbientAudioManager {
  private ctx: AudioContext | null = null;
  private initialized = false;
  private disposed = false;

  private masterGain: GainNode | null = null;
  private trafficDroneGain: GainNode | null = null;
  private trafficFilter: BiquadFilterNode | null = null;
  private engineNearGain: GainNode | null = null;
  private engineNearOsc: OscillatorNode | null = null;
  private engineNearFilter: BiquadFilterNode | null = null;
  private engineNearPanner: StereoPannerNode | null = null;

  private crowdGain: GainNode | null = null;
  private crowdFilterA: BiquadFilterNode | null = null;
  private crowdFilterB: BiquadFilterNode | null = null;

  private breezeGain: GainNode | null = null;

  private sources: AudioScheduledSourceNode[] = [];

  private userVolume: number = loadAmbientVolume();
  private muted: boolean = false;

  // Smoothed spatial levels (0..1)
  private smoothTraffic = 0.25;
  private smoothCrowd = 0.15;
  private smoothNearMotor = 0;
  private smoothNearPan = 0;

  // Timers for intermittent spatial one-shots
  private hornCooldown = 2.2;
  private bellCooldown = 1.6;
  private bazaarChimeCooldown = 3.0;
  private birdCooldown = 4.5;
  private whistleCooldown = 0;
  private wasAlert = false;

  private currentSnapshot: AmbientAudioSnapshot = {
    zone: 'avenue',
    zoneLabel: 'Gulistan Avenue',
    zoneBnLabel: 'গুলিস্তান সড়ক',
    trafficLevel: 0.25,
    crowdLevel: 0.15
  };

  constructor(existingCtx?: AudioContext | null) {
    if (existingCtx) {
      this.ctx = existingCtx;
    }
  }

  public attachContext(ctx: AudioContext | null) {
    if (this.disposed || !ctx) return;
    if (this.ctx !== ctx) {
      this.ctx = ctx;
      this.initialized = false;
    }
  }

  public setVolume(v: number) {
    this.userVolume = Math.max(0, Math.min(1, v));
    saveAmbientVolume(this.userVolume);
  }

  public getVolume(): number {
    return this.userVolume;
  }

  public setMuted(muted: boolean) {
    this.muted = muted;
    if (this.ctx && this.masterGain) {
      const now = this.ctx.currentTime;
      const target = this.muted ? 0.0001 : Math.max(0.0001, this.userVolume);
      this.masterGain.gain.setTargetAtTime(target, now, 0.08);
    }
  }

  public getSnapshot(): AmbientAudioSnapshot {
    return this.currentSnapshot;
  }

  private ensureGraph() {
    if (this.initialized || this.disposed || !this.ctx) return;
    if (this.ctx.state === 'suspended') {
      // Do not build or start oscillators until user gesture resumes or tries to resume
      try {
        this.ctx.resume().catch(() => {});
      } catch {
        // ignore
      }
      if (this.ctx.state === 'suspended') return;
    }

    try {
      const ctx = this.ctx;
      const now = ctx.currentTime;

      // Master output gain
      this.masterGain = ctx.createGain();
      this.masterGain.gain.setValueAtTime(this.muted ? 0.0001 : Math.max(0.0001, this.userVolume), now);
      this.masterGain.connect(ctx.destination);

      // Shared 4-second brown/pink noise buffers for organic loopable textures
      const sampleRate = ctx.sampleRate;
      const bufferLen = sampleRate * 4;

      const brownBuffer = ctx.createBuffer(1, bufferLen, sampleRate);
      const brownData = brownBuffer.getChannelData(0);
      let lastOut = 0;
      for (let i = 0; i < bufferLen; i++) {
        const white = Math.random() * 2 - 1;
        brownData[i] = (lastOut + 0.025 * white) / 1.025;
        lastOut = brownData[i];
        brownData[i] *= 2.8;
      }

      const pinkBuffer = ctx.createBuffer(1, bufferLen, sampleRate);
      const pinkData = pinkBuffer.getChannelData(0);
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < bufferLen; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.96900 * b2 + white * 0.1538520;
        b3 = 0.86650 * b3 + white * 0.3104856;
        b4 = 0.55000 * b4 + white * 0.5329522;
        b5 = -0.7616 * b5 - white * 0.0168980;
        pinkData[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.045;
        b6 = white * 0.115926;
      }

      // =========================================================
      // LAYER 1: Distant Dhaka Traffic & City Rumble
      // =========================================================
      const trafficNoise = ctx.createBufferSource();
      trafficNoise.buffer = brownBuffer;
      trafficNoise.loop = true;

      this.trafficFilter = ctx.createBiquadFilter();
      this.trafficFilter.type = 'lowpass';
      this.trafficFilter.frequency.setValueAtTime(210, now);
      this.trafficFilter.Q.setValueAtTime(0.9, now);

      this.trafficDroneGain = ctx.createGain();
      this.trafficDroneGain.gain.setValueAtTime(0.01, now);

      trafficNoise.connect(this.trafficFilter);
      this.trafficFilter.connect(this.trafficDroneGain);
      this.trafficDroneGain.connect(this.masterGain);
      trafficNoise.start(now);
      this.sources.push(trafficNoise);

      // =========================================================
      // LAYER 2: Nearby CNG / Bus Motor Chug (Spatial Pan + Doppler)
      // =========================================================
      this.engineNearOsc = ctx.createOscillator();
      this.engineNearOsc.type = 'sawtooth';
      this.engineNearOsc.frequency.setValueAtTime(62, now);

      // Add subtle 14Hz sputter LFO for authentic 3-wheeler CNG / bus cadence
      const sputterLfo = ctx.createOscillator();
      sputterLfo.type = 'sine';
      sputterLfo.frequency.setValueAtTime(14.5, now);
      const sputterGain = ctx.createGain();
      sputterGain.gain.setValueAtTime(9, now);
      sputterLfo.connect(sputterGain);
      sputterGain.connect(this.engineNearOsc.frequency);

      this.engineNearFilter = ctx.createBiquadFilter();
      this.engineNearFilter.type = 'bandpass';
      this.engineNearFilter.frequency.setValueAtTime(165, now);
      this.engineNearFilter.Q.setValueAtTime(1.8, now);

      this.engineNearGain = ctx.createGain();
      this.engineNearGain.gain.setValueAtTime(0.0001, now);

      if (typeof ctx.createStereoPanner === 'function') {
        this.engineNearPanner = ctx.createStereoPanner();
        this.engineNearOsc.connect(this.engineNearFilter);
        this.engineNearFilter.connect(this.engineNearGain);
        this.engineNearGain.connect(this.engineNearPanner);
        this.engineNearPanner.connect(this.masterGain);
      } else {
        this.engineNearOsc.connect(this.engineNearFilter);
        this.engineNearFilter.connect(this.engineNearGain);
        this.engineNearGain.connect(this.masterGain);
      }

      this.engineNearOsc.start(now);
      sputterLfo.start(now);
      this.sources.push(this.engineNearOsc, sputterLfo);

      // =========================================================
      // LAYER 3: Busy Bazaar & Sidewalk Crowd Chatter
      // =========================================================
      const crowdNoiseA = ctx.createBufferSource();
      crowdNoiseA.buffer = pinkBuffer;
      crowdNoiseA.loop = true;

      const crowdNoiseB = ctx.createBufferSource();
      crowdNoiseB.buffer = pinkBuffer;
      crowdNoiseB.loop = true;

      // Dual vocal-formant filters to emulate indistinct Bengali bazaar murmur
      this.crowdFilterA = ctx.createBiquadFilter();
      this.crowdFilterA.type = 'bandpass';
      this.crowdFilterA.frequency.setValueAtTime(520, now);
      this.crowdFilterA.Q.setValueAtTime(2.6, now);

      this.crowdFilterB = ctx.createBiquadFilter();
      this.crowdFilterB.type = 'bandpass';
      this.crowdFilterB.frequency.setValueAtTime(1180, now);
      this.crowdFilterB.Q.setValueAtTime(3.1, now);

      // Syllabic LFOs modulate filter centers so the murmur sounds like lively conversation
      const chatterLfoA = ctx.createOscillator();
      chatterLfoA.type = 'sine';
      chatterLfoA.frequency.setValueAtTime(2.4, now);
      const chatterLfoGainA = ctx.createGain();
      chatterLfoGainA.gain.setValueAtTime(110, now);
      chatterLfoA.connect(chatterLfoGainA);
      chatterLfoGainA.connect(this.crowdFilterA.frequency);

      const chatterLfoB = ctx.createOscillator();
      chatterLfoB.type = 'triangle';
      chatterLfoB.frequency.setValueAtTime(3.7, now);
      const chatterLfoGainB = ctx.createGain();
      chatterLfoGainB.gain.setValueAtTime(210, now);
      chatterLfoB.connect(chatterLfoGainB);
      chatterLfoGainB.connect(this.crowdFilterB.frequency);

      this.crowdGain = ctx.createGain();
      this.crowdGain.gain.setValueAtTime(0.005, now);

      crowdNoiseA.connect(this.crowdFilterA);
      crowdNoiseB.connect(this.crowdFilterB);
      this.crowdFilterA.connect(this.crowdGain);
      this.crowdFilterB.connect(this.crowdGain);
      this.crowdGain.connect(this.masterGain);

      crowdNoiseA.start(now, 0);
      crowdNoiseB.start(now, 1.7);
      chatterLfoA.start(now);
      chatterLfoB.start(now);
      this.sources.push(crowdNoiseA, crowdNoiseB, chatterLfoA, chatterLfoB);

      // =========================================================
      // LAYER 4: Quiet Alley / Tree Canopy Breeze
      // =========================================================
      const breezeNoise = ctx.createBufferSource();
      breezeNoise.buffer = pinkBuffer;
      breezeNoise.loop = true;

      const breezeFilter = ctx.createBiquadFilter();
      breezeFilter.type = 'bandpass';
      breezeFilter.frequency.setValueAtTime(980, now);
      breezeFilter.Q.setValueAtTime(1.2, now);

      this.breezeGain = ctx.createGain();
      this.breezeGain.gain.setValueAtTime(0.008, now);

      breezeNoise.connect(breezeFilter);
      breezeFilter.connect(this.breezeGain);
      this.breezeGain.connect(this.masterGain);
      breezeNoise.start(now, 0.8);
      this.sources.push(breezeNoise);

      this.initialized = true;
    } catch {
      // Web Audio blocked or unavailable
    }
  }

  public update(dt: number, params: AmbientUpdateParams) {
    if (this.disposed) return;
    this.muted = params.muted;

    // Ensure Web Audio graph is running if context is ready
    this.ensureGraph();

    // 1. Compute spatial location metrics
    const { playerX, playerZ, cameraYaw, traffic, pedestrians, stalls, playerStall } = params;

    // Road & intersection proximity
    let minStreetDistX = 999;
    let minStreetDistZ = 999;
    for (let i = 0; i < STREET_COORDS.length; i++) {
      const sc = STREET_COORDS[i];
      const dx = Math.abs(playerX - sc);
      const dz = Math.abs(playerZ - sc);
      if (dx < minStreetDistX) minStreetDistX = dx;
      if (dz < minStreetDistZ) minStreetDistZ = dz;
    }

    const onStreetX = Math.max(0, 1 - minStreetDistX / 18);
    const onStreetZ = Math.max(0, 1 - minStreetDistZ / 18);
    const intersectionFactor = onStreetX * onStreetZ;
    const roadProximity = Math.min(1, Math.max(onStreetX, onStreetZ) + intersectionFactor * 0.45);

    // Dynamic traffic proximity & closest motor vehicle
    let trafficScore = roadProximity * 0.35;
    let nearestMotorDist = 999;
    let nearestMotorPan = 0;
    let nearestMotorSpeed = 0;
    let nearestRickshawDist = 999;
    let nearestRickshawPan = 0;

    const rightX = Math.cos(cameraYaw);
    const rightZ = Math.sin(cameraYaw);

    for (let i = 0; i < traffic.length; i++) {
      const v = traffic[i];
      const dx = v.mesh.position.x - playerX;
      const dz = v.mesh.position.z - playerZ;
      const dist = Math.hypot(dx, dz);
      if (dist < 48) {
        const weight = v.kind === 'bus' ? 1.35 : v.kind === 'cng' ? 1.0 : v.kind === 'car' ? 0.9 : 0.45;
        trafficScore += (1 - dist / 48) * 0.22 * weight;
      }

      const pan = dist > 0.5 ? Math.max(-0.9, Math.min(0.9, (dx * rightX + dz * rightZ) / dist)) : 0;

      if (v.kind === 'rickshaw') {
        if (dist < nearestRickshawDist) {
          nearestRickshawDist = dist;
          nearestRickshawPan = pan;
        }
      } else {
        if (dist < nearestMotorDist) {
          nearestMotorDist = dist;
          nearestMotorPan = pan;
          nearestMotorSpeed = Math.abs(v.v) + (v.kind === 'bus' ? -8 : v.kind === 'cng' ? 12 : 0);
        }
      }
    }

    const targetTrafficLevel = Math.max(0.08, Math.min(1, trafficScore));

    // Crowd & bazaar proximity (pedestrians + market stalls + central Gulistan hub)
    let crowdScore = 0;
    let nearbyPeds = 0;
    for (let i = 0; i < pedestrians.length; i++) {
      const ped = pedestrians[i];
      const dx = ped.mesh.position.x - playerX;
      const dz = ped.mesh.position.z - playerZ;
      const dist = Math.hypot(dx, dz);
      if (dist < 24) {
        nearbyPeds++;
        crowdScore += (1 - dist / 24) * 0.24;
      }
    }

    let nearestStallDist = 999;
    let nearestStallPan = 0;
    for (let i = 0; i < stalls.length; i++) {
      const [sx, sz] = stalls[i];
      const dx = sx - playerX;
      const dz = sz - playerZ;
      const dist = Math.hypot(dx, dz);
      if (dist < nearestStallDist) {
        nearestStallDist = dist;
        nearestStallPan = dist > 0.5 ? Math.max(-0.85, Math.min(0.85, (dx * rightX + dz * rightZ) / dist)) : 0;
      }
      if (dist < 26) {
        crowdScore += (1 - dist / 26) * 0.42;
      }
    }

    if (playerStall) {
      const dist = Math.hypot(playerStall.x - playerX, playerStall.z - playerZ);
      if (dist < 24) {
        crowdScore += (1 - dist / 24) * 0.45;
      }
    }

    if (params.isSelling) {
      crowdScore += 0.35;
    }

    const targetCrowdLevel = Math.max(0.04, Math.min(1, crowdScore));

    // Smoothly interpolate levels
    const lerpRate = Math.min(1, dt * 2.8);
    this.smoothTraffic += (targetTrafficLevel - this.smoothTraffic) * lerpRate;
    this.smoothCrowd += (targetCrowdLevel - this.smoothCrowd) * lerpRate;

    const targetNearMotor = nearestMotorDist < 24 ? Math.pow(1 - nearestMotorDist / 24, 1.5) : 0;
    this.smoothNearMotor += (targetNearMotor - this.smoothNearMotor) * Math.min(1, dt * 5);
    this.smoothNearPan += (nearestMotorPan - this.smoothNearPan) * Math.min(1, dt * 6);

    // Classify current acoustic zone for HUD display
    let zone: SoundscapeZone = 'avenue';
    let zoneLabel = 'Main Road · Traffic';
    let zoneBnLabel = 'মূল সড়ক · যানজট';

    if (this.smoothCrowd >= 0.48 || nearestStallDist < 14) {
      zone = 'bazaar';
      zoneLabel = 'Busy Bazaar · Crowd Chatter';
      zoneBnLabel = 'ব্যস্ত বাজার · জনসমাগম';
    } else if (intersectionFactor > 0.42 || this.smoothTraffic >= 0.62) {
      zone = 'intersection';
      zoneLabel = 'Busy Intersection · Heavy Traffic';
      zoneBnLabel = 'ব্যস্ত মোড় · তীব্র যানবাহন';
    } else if (roadProximity < 0.35 && this.smoothCrowd < 0.25) {
      zone = 'alley';
      zoneLabel = 'Quiet Lane · Distant City';
      zoneBnLabel = 'নীরব গলি · দূরবর্তী শহর';
    }

    this.currentSnapshot = {
      zone,
      zoneLabel,
      zoneBnLabel,
      trafficLevel: this.smoothTraffic,
      crowdLevel: this.smoothCrowd
    };

    // 2. Apply continuous Web Audio layer parameters if initialized
    if (!this.initialized || !this.ctx || !this.masterGain) return;

    const now = this.ctx.currentTime;
    const stateScale = params.muted
      ? 0.0001
      : params.isPlaying && !params.isPaused
      ? Math.max(0.0001, this.userVolume)
      : Math.max(0.0001, this.userVolume * 0.28); // softer background ambiance in menu/pause

    this.masterGain.gain.setTargetAtTime(stateScale, now, 0.12);

    if (this.trafficDroneGain && this.trafficFilter) {
      const droneVol = 0.025 + this.smoothTraffic * 0.14;
      const cutoff = 140 + this.smoothTraffic * 260;
      this.trafficDroneGain.gain.setTargetAtTime(droneVol, now, 0.15);
      this.trafficFilter.frequency.setTargetAtTime(cutoff, now, 0.15);
    }

    if (this.engineNearGain && this.engineNearOsc && this.engineNearFilter) {
      const motorVol = 0.0001 + this.smoothNearMotor * 0.065;
      const motorPitch = 54 + Math.max(-10, Math.min(28, nearestMotorSpeed * 1.4)) + this.smoothNearMotor * 14;
      this.engineNearGain.gain.setTargetAtTime(motorVol, now, 0.1);
      this.engineNearOsc.frequency.setTargetAtTime(motorPitch, now, 0.1);
      this.engineNearFilter.frequency.setTargetAtTime(140 + this.smoothNearMotor * 190, now, 0.1);
      if (this.engineNearPanner) {
        this.engineNearPanner.pan.setTargetAtTime(this.smoothNearPan, now, 0.1);
      }
    }

    if (this.crowdGain) {
      const chatterVol = 0.004 + Math.pow(this.smoothCrowd, 1.15) * 0.15;
      this.crowdGain.gain.setTargetAtTime(chatterVol, now, 0.18);
    }

    if (this.breezeGain) {
      const quietness = Math.max(0.1, 1 - Math.max(this.smoothTraffic, this.smoothCrowd) * 0.75);
      this.breezeGain.gain.setTargetAtTime(0.006 + quietness * 0.026, now, 0.25);
    }

    // Do not trigger one-shot spatial events when muted or not actively playing
    if (params.muted || !params.isPlaying || params.isPaused || this.userVolume <= 0.01) {
      this.wasAlert = params.isAlert;
      return;
    }

    // 3. Trigger location-aware spatial one-shot sounds
    // Police whistle on alert start or during active pursuit
    if (params.isAlert && !this.wasAlert) {
      this.playPoliceWhistle(0);
      this.whistleCooldown = 5.5 + Math.random() * 3.5;
    } else if (params.isAlert) {
      this.whistleCooldown -= dt;
      if (this.whistleCooldown <= 0) {
        this.playPoliceWhistle((Math.random() - 0.5) * 0.5);
        this.whistleCooldown = 6.5 + Math.random() * 4.5;
      }
    }
    this.wasAlert = params.isAlert;

    // Rickshaw bell chime when rickshaws are near or in busy bazaar/intersection
    this.bellCooldown -= dt * (0.6 + this.smoothTraffic * 1.1 + this.smoothCrowd * 0.5);
    if (this.bellCooldown <= 0) {
      if (nearestRickshawDist < 32 || Math.random() < this.smoothTraffic * 0.65) {
        const distAtten = nearestRickshawDist < 32 ? Math.max(0.2, 1 - nearestRickshawDist / 36) : 0.25 + Math.random() * 0.25;
        const pan = nearestRickshawDist < 32 ? nearestRickshawPan : (Math.random() - 0.5) * 1.4;
        this.playSpatialRickshawBell(distAtten, pan);
      }
      this.bellCooldown = 2.6 + Math.random() * 4.2;
    }

    // Distant bus horn / CNG beep based on traffic density
    this.hornCooldown -= dt * (0.5 + this.smoothTraffic * 1.35);
    if (this.hornCooldown <= 0) {
      if (nearestMotorDist < 42 || Math.random() < this.smoothTraffic * 0.75) {
        const isHeavyHorn = Math.random() < 0.42;
        const distAtten = nearestMotorDist < 42 ? Math.max(0.18, 1 - nearestMotorDist / 48) : 0.22 + Math.random() * 0.25;
        const pan = nearestMotorDist < 42 ? nearestMotorPan : (Math.random() - 0.5) * 1.5;
        this.playSpatialTrafficHorn(distAtten, pan, isHeavyHorn);
      }
      this.hornCooldown = 3.2 + Math.random() * 4.8;
    }

    // Bazaar tea-stall cup clink / vendor call accent in busy crowd areas
    this.bazaarChimeCooldown -= dt * (0.4 + this.smoothCrowd * 1.5);
    if (this.bazaarChimeCooldown <= 0) {
      if (this.smoothCrowd > 0.28 || nearbyPeds >= 2 || nearestStallDist < 22) {
        const atten = Math.min(0.85, 0.25 + this.smoothCrowd * 0.65);
        const pan = nearestStallDist < 25 ? nearestStallPan : (Math.random() - 0.5) * 1.2;
        this.playBazaarTeaClink(atten, pan);
      }
      this.bazaarChimeCooldown = 3.5 + Math.random() * 5.0;
    }

    // Distant Dhaka crow / bird call in quieter tree-lined lanes
    this.birdCooldown -= dt;
    if (this.birdCooldown <= 0) {
      if (this.smoothTraffic < 0.65) {
        const pan = (Math.random() - 0.5) * 1.5;
        this.playDistantCrow(0.25 + (1 - this.smoothTraffic) * 0.35, pan);
      }
      this.birdCooldown = 6.5 + Math.random() * 7.5;
    }
  }

  private connectWithPan(node: AudioNode, pan: number) {
    if (!this.ctx || !this.masterGain) return;
    if (typeof this.ctx.createStereoPanner === 'function') {
      const panner = this.ctx.createStereoPanner();
      panner.pan.setValueAtTime(Math.max(-1, Math.min(1, pan)), this.ctx.currentTime);
      node.connect(panner);
      panner.connect(this.masterGain);
    } else {
      node.connect(this.masterGain);
    }
  }

  private playSpatialRickshawBell(intensity: number, pan: number) {
    if (!this.ctx || !this.masterGain) return;
    try {
      const now = this.ctx.currentTime;
      const vol = 0.055 * intensity;
      [0, 0.085].forEach((delay) => {
        const osc = this.ctx!.createOscillator();
        const gain = this.ctx!.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(1310, now + delay);
        osc.frequency.exponentialRampToValueAtTime(1490, now + delay + 0.035);
        gain.gain.setValueAtTime(vol, now + delay);
        gain.gain.exponentialRampToValueAtTime(0.0005, now + delay + 0.14);
        osc.connect(gain);
        this.connectWithPan(gain, pan);
        osc.start(now + delay);
        osc.stop(now + delay + 0.15);
      });
    } catch {
      // ignore
    }
  }

  private playSpatialTrafficHorn(intensity: number, pan: number, isBusHorn: boolean) {
    if (!this.ctx || !this.masterGain) return;
    try {
      const now = this.ctx.currentTime;
      const duration = isBusHorn ? 0.34 + Math.random() * 0.18 : 0.14 + Math.random() * 0.08;
      const baseFreq = isBusHorn ? 235 + Math.random() * 25 : 440 + Math.random() * 60;
      const vol = (isBusHorn ? 0.048 : 0.04) * intensity;

      const osc1 = this.ctx.createOscillator();
      const osc2 = this.ctx.createOscillator();
      const filter = this.ctx.createBiquadFilter();
      const gain = this.ctx.createGain();

      osc1.type = 'sawtooth';
      osc2.type = 'sawtooth';
      osc1.frequency.setValueAtTime(baseFreq, now);
      osc2.frequency.setValueAtTime(baseFreq * 1.24, now); // minor/major third horn interval

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(isBusHorn ? 680 : 1150, now);

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(vol, now + 0.025);
      gain.gain.setValueAtTime(vol * 0.85, now + duration - 0.04);
      gain.gain.exponentialRampToValueAtTime(0.0005, now + duration);

      osc1.connect(filter);
      osc2.connect(filter);
      filter.connect(gain);
      this.connectWithPan(gain, pan);

      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + duration + 0.01);
      osc2.stop(now + duration + 0.01);
    } catch {
      // ignore
    }
  }

  private playBazaarTeaClink(intensity: number, pan: number) {
    if (!this.ctx || !this.masterGain) return;
    try {
      const now = this.ctx.currentTime;
      const vol = 0.032 * intensity;
      // Double glass/spoon clink common at Dhaka tong (tea) stalls
      [0, 0.065].forEach((delay, idx) => {
        const osc = this.ctx!.createOscillator();
        const gain = this.ctx!.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(idx === 0 ? 2480 : 2890, now + delay);
        gain.gain.setValueAtTime(vol, now + delay);
        gain.gain.exponentialRampToValueAtTime(0.0004, now + delay + 0.075);
        osc.connect(gain);
        this.connectWithPan(gain, pan);
        osc.start(now + delay);
        osc.stop(now + delay + 0.08);
      });
    } catch {
      // ignore
    }
  }

  private playDistantCrow(intensity: number, pan: number) {
    if (!this.ctx || !this.masterGain) return;
    try {
      const now = this.ctx.currentTime;
      const vol = 0.028 * intensity;
      const osc = this.ctx.createOscillator();
      const filter = this.ctx.createBiquadFilter();
      const gain = this.ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(590, now);
      osc.frequency.linearRampToValueAtTime(510, now + 0.16);

      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1050, now);
      filter.Q.setValueAtTime(3.0, now);

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(vol, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0005, now + 0.18);

      osc.connect(filter);
      filter.connect(gain);
      this.connectWithPan(gain, pan);

      osc.start(now);
      osc.stop(now + 0.19);
    } catch {
      // ignore
    }
  }

  private playPoliceWhistle(pan: number) {
    if (!this.ctx || !this.masterGain) return;
    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const trillLfo = this.ctx.createOscillator();
      const trillGain = this.ctx.createGain();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(2680, now);

      trillLfo.type = 'sine';
      trillLfo.frequency.setValueAtTime(34, now);
      trillGain.gain.setValueAtTime(95, now);

      trillLfo.connect(trillGain);
      trillGain.connect(osc.frequency);

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.065, now + 0.03);
      gain.gain.setValueAtTime(0.06, now + 0.28);
      gain.gain.exponentialRampToValueAtTime(0.0005, now + 0.38);

      osc.connect(gain);
      this.connectWithPan(gain, pan);

      osc.start(now);
      trillLfo.start(now);
      osc.stop(now + 0.39);
      trillLfo.stop(now + 0.39);
    } catch {
      // ignore
    }
  }

  public dispose() {
    this.disposed = true;
    for (const src of this.sources) {
      try {
        src.stop();
        src.disconnect();
      } catch {
        // ignore
      }
    }
    this.sources = [];
    try {
      this.masterGain?.disconnect();
    } catch {
      // ignore
    }
    this.masterGain = null;
    this.initialized = false;
  }
}
