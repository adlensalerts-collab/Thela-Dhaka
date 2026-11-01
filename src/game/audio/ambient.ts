import type { TrafficItem } from '../world/traffic';
import type { PedestrianNPC } from '../pedestrians';

export type AmbientTrackName = 'traffic' | 'crowd' | 'streetMarket';

export interface UrbanActivityZone {
  id: string;
  name: string;
  bnName: string;
  type: AmbientTrackName;
  x: number;
  z: number;
  innerRadius: number;
  outerRadius: number;
  maxWeight: number;
}

export interface AmbientTrackVolumes {
  traffic: number;
  crowd: number;
  streetMarket: number;
}

export interface AmbientAudioSnapshot {
  zone: AmbientTrackName | 'alley';
  zoneLabel: string;
  zoneBnLabel: string;
  trafficLevel: number;
  crowdLevel: number;
  marketLevel: number;
}

export interface SpatialSoundTickParams {
  playerX: number;
  playerZ: number;
  cameraYaw?: number;
  isPlaying?: boolean;
  isPaused?: boolean;
  isAlert?: boolean;
  isSelling?: boolean;
  muted?: boolean;
  traffic?: TrafficItem[];
  pedestrians?: PedestrianNPC[];
  playerStall?: { x: number; z: number } | null;
}

const AMBIENT_STORAGE_KEY = 'thela_dhaka_ambient_audio_v1';
const STREET_AXES = [-80, -40, 0, 40, 80];

/**
 * High-activity urban zones across the Dhaka / Gulistan map.
 * Used to dynamically calculate spatial track volumes based on player distance.
 */
export const HIGH_ACTIVITY_URBAN_ZONES: ReadonlyArray<UrbanActivityZone> = [
  // --- High-Activity Traffic Zones (Major Intersections & Flyover Approaches) ---
  {
    id: 'traffic_gulistan_zero',
    name: 'Gulistan Chottor · Heavy Traffic',
    bnName: 'গুলিস্তান চত্বর · তীব্র যানজট',
    type: 'traffic',
    x: 0,
    z: 0,
    innerRadius: 8,
    outerRadius: 44,
    maxWeight: 1.0
  },
  {
    id: 'traffic_north_crossing',
    name: 'North Avenue Crossing · Traffic',
    bnName: 'উত্তর মোড় · যানবাহন',
    type: 'traffic',
    x: 0,
    z: -40,
    innerRadius: 7,
    outerRadius: 38,
    maxWeight: 0.9
  },
  {
    id: 'traffic_south_crossing',
    name: 'South Avenue Crossing · Traffic',
    bnName: 'দক্ষিণ মোড় · যানবাহন',
    type: 'traffic',
    x: 0,
    z: 40,
    innerRadius: 7,
    outerRadius: 38,
    maxWeight: 0.9
  },
  {
    id: 'traffic_west_crossing',
    name: 'West Intersection · Traffic',
    bnName: 'পশ্চিম মোড় · যানজট',
    type: 'traffic',
    x: -40,
    z: 0,
    innerRadius: 7,
    outerRadius: 38,
    maxWeight: 0.88
  },
  {
    id: 'traffic_east_crossing',
    name: 'East Flyover Approach · Traffic',
    bnName: 'পূর্ব ফ্লাইওভার মোড় · যানজট',
    type: 'traffic',
    x: 40,
    z: 0,
    innerRadius: 7,
    outerRadius: 38,
    maxWeight: 0.88
  },
  {
    id: 'traffic_nw_ring',
    name: 'Outer Ring Road · Traffic',
    bnName: 'সংযোগ সড়ক · যানবাহন',
    type: 'traffic',
    x: -80,
    z: -40,
    innerRadius: 6,
    outerRadius: 34,
    maxWeight: 0.78
  },
  {
    id: 'traffic_se_ring',
    name: 'Outer Ring Road · Traffic',
    bnName: 'সংযোগ সড়ক · যানবাহন',
    type: 'traffic',
    x: 80,
    z: 40,
    innerRadius: 6,
    outerRadius: 34,
    maxWeight: 0.78
  },

  // --- High-Activity Crowd Zones (Busy Plazas, Bus Stops & Walkways) ---
  {
    id: 'crowd_central_plaza',
    name: 'Gulistan Footpath · Busy Crowd',
    bnName: 'গুলিস্তান ফুটপাত · জনসমাগম',
    type: 'crowd',
    x: 0,
    z: 10,
    innerRadius: 6,
    outerRadius: 34,
    maxWeight: 0.95
  },
  {
    id: 'crowd_mosque_walkway',
    name: 'North Walkway · Commuter Crowd',
    bnName: 'উত্তর পথচারী চত্বর · ভিড়',
    type: 'crowd',
    x: -22,
    z: -24,
    innerRadius: 6,
    outerRadius: 32,
    maxWeight: 0.88
  },
  {
    id: 'crowd_paltan_corridor',
    name: 'Paltan Sidewalk · Busy Crowd',
    bnName: 'পল্টন ফুটপাত · ব্যস্ত জনতা',
    type: 'crowd',
    x: 24,
    z: 18,
    innerRadius: 6,
    outerRadius: 30,
    maxWeight: 0.85
  },
  {
    id: 'crowd_bus_terminal',
    name: 'Bus Stand · Commuter Hub',
    bnName: 'বাস স্ট্যান্ড · যাত্রীদের ভিড়',
    type: 'crowd',
    x: -40,
    z: 36,
    innerRadius: 6,
    outerRadius: 32,
    maxWeight: 0.9
  },
  {
    id: 'crowd_stadium_gate',
    name: 'Stadium Promenade · Crowd',
    bnName: 'স্টেডিয়াম গেট · জনসমাগম',
    type: 'crowd',
    x: 40,
    z: -36,
    innerRadius: 6,
    outerRadius: 30,
    maxWeight: 0.82
  },

  // --- High-Activity Street Market Zones (Bazaar Stalls & Hawker Hubs) ---
  {
    id: 'market_north_hawker',
    name: 'North Hawker Market · Street Bazaar',
    bnName: 'উত্তর হকার মার্কেট · কাঁচাবাজার',
    type: 'streetMarket',
    x: -9,
    z: -27,
    innerRadius: 5,
    outerRadius: 28,
    maxWeight: 1.0
  },
  {
    id: 'market_south_bazaar',
    name: 'South Fruit & Tea Market · Bazaar',
    bnName: 'দক্ষিণ ফল ও চায়ের বাজার',
    type: 'streetMarket',
    x: 11,
    z: 25,
    innerRadius: 5,
    outerRadius: 28,
    maxWeight: 1.0
  },
  {
    id: 'market_west_alley',
    name: 'West Hawker Lane · Street Market',
    bnName: 'পশ্চিম হকার গলি · বাজার',
    type: 'streetMarket',
    x: -49,
    z: -8,
    innerRadius: 5,
    outerRadius: 26,
    maxWeight: 0.95
  },
  {
    id: 'market_southeast_haat',
    name: 'Southeast Corner Haat · Market',
    bnName: 'দক্ষিণ-পূর্ব হাট · বাজার',
    type: 'streetMarket',
    x: 71,
    z: 51,
    innerRadius: 5,
    outerRadius: 28,
    maxWeight: 0.92
  },
  {
    id: 'market_southwest_bazaar',
    name: 'Southwest Footpath Bazaar · Market',
    bnName: 'দক্ষিণ-পশ্চিম ফুটপাত বাজার',
    type: 'streetMarket',
    x: -35,
    z: 70,
    innerRadius: 5,
    outerRadius: 26,
    maxWeight: 0.92
  },
  {
    id: 'market_northeast_tong',
    name: 'Northeast Sabzi & Tong Market',
    bnName: 'উত্তর-পূর্ব সবজি ও টং বাজার',
    type: 'streetMarket',
    x: 35,
    z: -42,
    innerRadius: 5,
    outerRadius: 26,
    maxWeight: 0.92
  }
];

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

interface LoadedAmbientTrack {
  name: AmbientTrackName;
  buffer: AudioBuffer;
  source: AudioBufferSourceNode | null;
  gainNode: GainNode;
  currentVolume: number;
  targetVolume: number;
}

/**
 * Spatial sound manager that loads three ambient audio tracks (traffic, crowd, and streetMarket)
 * and dynamically adjusts their volumes on every tick based on the distance between the player
 * and specific high-activity urban zones in Dhaka.
 */
export class SpatialSoundManager {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private tracks: Record<AmbientTrackName, LoadedAmbientTrack | null> = {
    traffic: null,
    crowd: null,
    streetMarket: null
  };

  private initialized = false;
  private disposed = false;
  private muted = false;
  private userVolume = loadAmbientVolume();

  private volumes: AmbientTrackVolumes = {
    traffic: 0.2,
    crowd: 0.12,
    streetMarket: 0.08
  };

  private currentSnapshot: AmbientAudioSnapshot = {
    zone: 'traffic',
    zoneLabel: 'Main Road · Traffic',
    zoneBnLabel: 'মূল সড়ক · যানজট',
    trafficLevel: 0.2,
    crowdLevel: 0.12,
    marketLevel: 0.08
  };

  private zones: UrbanActivityZone[] = [...HIGH_ACTIVITY_URBAN_ZONES];

  constructor(existingCtx?: AudioContext | null) {
    if (existingCtx) {
      this.ctx = existingCtx;
    }
  }

  public attachContext(ctx: AudioContext | null): void {
    if (this.disposed || !ctx) return;
    if (this.ctx !== ctx) {
      this.ctx = ctx;
      this.initialized = false;
    }
  }

  public setVolume(v: number): void {
    this.userVolume = Math.max(0, Math.min(1, v));
    saveAmbientVolume(this.userVolume);
  }

  public getVolume(): number {
    return this.userVolume;
  }

  public setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.ctx && this.masterGain) {
      const now = this.ctx.currentTime;
      const target = this.muted ? 0.0001 : Math.max(0.0001, this.userVolume);
      this.masterGain.gain.setTargetAtTime(target, now, 0.08);
    }
  }

  public getTrackVolumes(): AmbientTrackVolumes {
    return { ...this.volumes };
  }

  public getSnapshot(): AmbientAudioSnapshot {
    return this.currentSnapshot;
  }

  /**
   * Builds and loads the three looping ambient audio tracks (traffic, crowd, streetMarket)
   * into the Web Audio graph, and optionally decodes external audio asset files if present.
   */
  private loadTracks(): void {
    if (this.initialized || this.disposed || !this.ctx) return;
    if (this.ctx.state === 'suspended') {
      try {
        this.ctx.resume().catch(() => {});
      } catch {
        // ignore until user interaction
      }
      if (this.ctx.state === 'suspended') return;
    }

    try {
      const ctx = this.ctx;
      const now = ctx.currentTime;

      this.masterGain = ctx.createGain();
      this.masterGain.gain.setValueAtTime(
        this.muted ? 0.0001 : Math.max(0.0001, this.userVolume),
        now
      );
      this.masterGain.connect(ctx.destination);

      // Synthesize rich 6-second seamless looping buffers for each of the 3 ambient tracks
      const trafficBuffer = this.buildTrafficTrackBuffer(ctx, 6.0);
      const crowdBuffer = this.buildCrowdTrackBuffer(ctx, 6.0);
      const streetMarketBuffer = this.buildStreetMarketTrackBuffer(ctx, 6.0);

      this.tracks.traffic = this.createLoopingTrack(ctx, 'traffic', trafficBuffer, this.volumes.traffic);
      this.tracks.crowd = this.createLoopingTrack(ctx, 'crowd', crowdBuffer, this.volumes.crowd);
      this.tracks.streetMarket = this.createLoopingTrack(
        ctx,
        'streetMarket',
        streetMarketBuffer,
        this.volumes.streetMarket
      );

      this.initialized = true;
    } catch {
      // Web Audio unavailable or blocked
    }
  }

  private createLoopingTrack(
    ctx: AudioContext,
    name: AmbientTrackName,
    buffer: AudioBuffer,
    initialVolume: number
  ): LoadedAmbientTrack {
    const gainNode = ctx.createGain();
    gainNode.gain.setValueAtTime(Math.max(0.0001, initialVolume * 0.35), ctx.currentTime);
    gainNode.connect(this.masterGain!);

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.connect(gainNode);
    source.start(ctx.currentTime);

    return {
      name,
      buffer,
      source,
      gainNode,
      currentVolume: initialVolume,
      targetVolume: initialVolume
    };
  }

  /**
   * Track 1: Dhaka Traffic Track
   * Deep urban road rumble, CNG 3-wheeler engine cadence, and distant traffic horns.
   */
  private buildTrafficTrackBuffer(ctx: AudioContext, durationSec: number): AudioBuffer {
    const sr = ctx.sampleRate;
    const len = Math.floor(sr * durationSec);
    const buf = ctx.createBuffer(2, len, sr);

    for (let ch = 0; ch < 2; ch++) {
      const data = buf.getChannelData(ch);
      let brown = 0;
      let lp = 0;
      const phaseOffset = ch * 0.7;

      for (let i = 0; i < len; i++) {
        const t = i / sr;
        // Seamless loop envelope at boundaries
        const white = Math.random() * 2 - 1;
        brown = (brown + 0.022 * white) / 1.022;
        lp = lp + 0.08 * (brown - lp);

        // CNG / Bus engine low harmonic hum with 14Hz 2-stroke putter
        const cngMod = 1 + 0.35 * Math.sin(2 * Math.PI * 14 * t + phaseOffset);
        const engineHum =
          (Math.sin(2 * Math.PI * 58 * t) * 0.08 +
            Math.sin(2 * Math.PI * 116 * t + 0.4) * 0.045) *
          cngMod;

        // Periodic distant Dhaka bus & CNG horn accents embedded in the loop
        let horn = 0;
        const hornWindow1 = t - 1.35;
        if (hornWindow1 >= 0 && hornWindow1 < 0.32) {
          const env = Math.sin((hornWindow1 / 0.32) * Math.PI);
          horn +=
            env *
            0.055 *
            (Math.sin(2 * Math.PI * 248 * t) + 0.7 * Math.sin(2 * Math.PI * 312 * t));
        }
        const hornWindow2 = t - 4.1;
        if (hornWindow2 >= 0 && hornWindow2 < 0.16) {
          const env = Math.sin((hornWindow2 / 0.16) * Math.PI);
          horn +=
            env *
            0.05 *
            (Math.sin(2 * Math.PI * 465 * t) + 0.6 * Math.sin(2 * Math.PI * 585 * t));
        }

        data[i] = Math.max(-0.95, Math.min(0.95, lp * 1.9 + engineHum + horn));
      }
    }
    return buf;
  }

  /**
   * Track 2: Urban Crowd Track
   * Multi-layered pedestrian chatter, syllabic vocal-formant murmur, and sidewalk bustle.
   */
  private buildCrowdTrackBuffer(ctx: AudioContext, durationSec: number): AudioBuffer {
    const sr = ctx.sampleRate;
    const len = Math.floor(sr * durationSec);
    const buf = ctx.createBuffer(2, len, sr);

    for (let ch = 0; ch < 2; ch++) {
      const data = buf.getChannelData(ch);
      let b0 = 0,
        b1 = 0,
        b2 = 0,
        b3 = 0;
      let bp1 = 0,
        bp2 = 0;
      const offset = ch * 1.3;

      for (let i = 0; i < len; i++) {
        const t = i / sr;
        const white = Math.random() * 2 - 1;
        // Pink-ish noise base
        b0 = 0.997 * b0 + white * 0.029;
        b1 = 0.985 * b1 + white * 0.048;
        b2 = 0.94 * b2 + white * 0.095;
        b3 = 0.82 * b3 + white * 0.18;
        const pink = b0 + b1 + b2 + b3;

        // Formant-like syllabic amplitude modulations (2.5 Hz & 3.8 Hz)
        const sylA = 0.55 + 0.45 * Math.sin(2 * Math.PI * 2.5 * t + offset);
        const sylB = 0.55 + 0.45 * Math.cos(2 * Math.PI * 3.8 * t - offset * 0.7);

        bp1 += 0.18 * (pink * sylA - bp1);
        bp2 += 0.34 * (pink * sylB - bp2);
        const chatterBand = (bp2 - bp1) * 1.65;

        data[i] = Math.max(-0.95, Math.min(0.95, chatterBand));
      }
    }
    return buf;
  }

  /**
   * Track 3: Street Market (Bazaar) Track
   * Bustling hawker market atmosphere with rickshaw bell chimes, tea-stall glass clinks,
   * and lively bazaar vendor cadence.
   */
  private buildStreetMarketTrackBuffer(ctx: AudioContext, durationSec: number): AudioBuffer {
    const sr = ctx.sampleRate;
    const len = Math.floor(sr * durationSec);
    const buf = ctx.createBuffer(2, len, sr);

    for (let ch = 0; ch < 2; ch++) {
      const data = buf.getChannelData(ch);
      let lp = 0;
      let hp = 0;
      const chPhase = ch * 0.9;

      for (let i = 0; i < len; i++) {
        const t = i / sr;
        const white = Math.random() * 2 - 1;
        lp += 0.25 * (white - lp);
        hp += 0.06 * (lp - hp);
        const bazaarMurmur = (lp - hp) * (0.28 + 0.14 * Math.sin(2 * Math.PI * 3.0 * t + chPhase));

        // Rickshaw double bell "Tring-Tring!" at t = 0.8s and 0.9s
        let chime = 0;
        for (const strike of [0.8, 0.89, 3.6, 3.69]) {
          const dtStrike = t - strike;
          if (dtStrike >= 0 && dtStrike < 0.13) {
            const env = Math.exp(-dtStrike * 28);
            const freq = 1340 + (dtStrike < 0.03 ? 120 : 210);
            chime += env * 0.12 * Math.sin(2 * Math.PI * freq * t);
          }
        }

        // Tea-stall ("Tong") glass cup & spoon clink at t = 2.2s and 4.9s
        for (const clinkTime of [2.2, 2.27, 4.9, 4.96]) {
          const dtClink = t - clinkTime;
          if (dtClink >= 0 && dtClink < 0.07) {
            const env = Math.exp(-dtClink * 45);
            chime +=
              env *
              0.09 *
              (Math.sin(2 * Math.PI * 2520 * t) + 0.5 * Math.sin(2 * Math.PI * 3180 * t));
          }
        }

        data[i] = Math.max(-0.95, Math.min(0.95, bazaarMurmur + chime));
      }
    }
    return buf;
  }

  /**
   * Computes smooth inverse-distance attenuation (0..1) from player (x, z) to an UrbanActivityZone.
   */
  private computeZoneInfluence(playerX: number, playerZ: number, zone: UrbanActivityZone): number {
    const dist = Math.hypot(playerX - zone.x, playerZ - zone.z);
    if (dist >= zone.outerRadius) return 0;
    if (dist <= zone.innerRadius) return zone.maxWeight;

    const normalized =
      1 - (dist - zone.innerRadius) / Math.max(0.001, zone.outerRadius - zone.innerRadius);
    // Smooth cosine / quadratic falloff
    return normalized * normalized * zone.maxWeight;
  }

  /**
   * Updates all three ambient track volumes dynamically on every tick based on player distance
   * to high-activity urban zones, active streets, traffic vehicles, pedestrians, and stalls.
   */
  public update(dt: number, params: SpatialSoundTickParams): void {
    if (this.disposed) return;
    if (typeof params.muted === 'boolean') {
      this.muted = params.muted;
    }

    // Ensure the 3 ambient tracks are loaded and running once AudioContext is unlocked
    this.loadTracks();

    const { playerX, playerZ, traffic = [], pedestrians = [], playerStall } = params;

    // 1. Evaluate distance-based influence from High-Activity Urban Zones
    let trafficZoneScore = 0;
    let crowdZoneScore = 0;
    let marketZoneScore = 0;

    let dominantZone: UrbanActivityZone | null = null;
    let dominantZoneInfluence = 0;

    for (let i = 0; i < this.zones.length; i++) {
      const z = this.zones[i];
      const inf = this.computeZoneInfluence(playerX, playerZ, z);
      if (inf > dominantZoneInfluence) {
        dominantZoneInfluence = inf;
        dominantZone = z;
      }

      if (z.type === 'traffic') {
        trafficZoneScore = Math.max(trafficZoneScore, inf);
      } else if (z.type === 'crowd') {
        crowdZoneScore = Math.max(crowdZoneScore, inf);
      } else if (z.type === 'streetMarket') {
        marketZoneScore = Math.max(marketZoneScore, inf);
      }
    }

    // 2. Augment with continuous street-grid proximity & dynamic entities
    let minRoadDist = 999;
    for (let i = 0; i < STREET_AXES.length; i++) {
      const axis = STREET_AXES[i];
      const dx = Math.abs(playerX - axis);
      const dz = Math.abs(playerZ - axis);
      if (dx < minRoadDist) minRoadDist = dx;
      if (dz < minRoadDist) minRoadDist = dz;
    }
    const roadBaseline = Math.max(0, 1 - minRoadDist / 20) * 0.38;

    let dynamicTrafficBoost = 0;
    for (let i = 0; i < traffic.length; i++) {
      const v = traffic[i];
      const d = Math.hypot(v.mesh.position.x - playerX, v.mesh.position.z - playerZ);
      if (d < 36) {
        const w = v.kind === 'bus' ? 0.32 : v.kind === 'cng' ? 0.24 : 0.16;
        dynamicTrafficBoost += (1 - d / 36) * w;
      }
    }

    let dynamicCrowdBoost = 0;
    for (let i = 0; i < pedestrians.length; i++) {
      const p = pedestrians[i];
      const d = Math.hypot(p.mesh.position.x - playerX, p.mesh.position.z - playerZ);
      if (d < 22) {
        dynamicCrowdBoost += (1 - d / 22) * 0.22;
      }
    }

    let dynamicMarketBoost = params.isSelling ? 0.35 : 0;
    if (playerStall) {
      const dStall = Math.hypot(playerStall.x - playerX, playerStall.z - playerZ);
      if (dStall < 26) {
        dynamicMarketBoost += (1 - dStall / 26) * 0.65;
      }
    }

    // Compute clamped target volumes (0..1) for each of the 3 tracks
    const targetTraffic = Math.max(
      0.08,
      Math.min(1.0, Math.max(trafficZoneScore, roadBaseline) + dynamicTrafficBoost * 0.5)
    );
    const targetCrowd = Math.max(
      0.05,
      Math.min(1.0, crowdZoneScore * 0.75 + marketZoneScore * 0.25 + dynamicCrowdBoost)
    );
    const targetMarket = Math.max(
      0.02,
      Math.min(1.0, marketZoneScore + dynamicMarketBoost)
    );

    // Smoothly interpolate volumes per tick
    const smoothFactor = Math.min(1, Math.max(0.01, dt) * 3.5);
    this.volumes.traffic += (targetTraffic - this.volumes.traffic) * smoothFactor;
    this.volumes.crowd += (targetCrowd - this.volumes.crowd) * smoothFactor;
    this.volumes.streetMarket += (targetMarket - this.volumes.streetMarket) * smoothFactor;

    // Update HUD snapshot classification
    if (this.volumes.streetMarket >= 0.42) {
      this.currentSnapshot = {
        zone: 'streetMarket',
        zoneLabel: dominantZone?.type === 'streetMarket' ? dominantZone.name : 'Street Market · Bazaar',
        zoneBnLabel:
          dominantZone?.type === 'streetMarket' ? dominantZone.bnName : 'রাস্তার বাজার · কোলাহল',
        trafficLevel: this.volumes.traffic,
        crowdLevel: this.volumes.crowd,
        marketLevel: this.volumes.streetMarket
      };
    } else if (this.volumes.crowd >= 0.45) {
      this.currentSnapshot = {
        zone: 'crowd',
        zoneLabel: dominantZone?.type === 'crowd' ? dominantZone.name : 'Busy Sidewalk · Crowd',
        zoneBnLabel: dominantZone?.type === 'crowd' ? dominantZone.bnName : 'ব্যস্ত ফুটপাত · জনসমাগম',
        trafficLevel: this.volumes.traffic,
        crowdLevel: this.volumes.crowd,
        marketLevel: this.volumes.streetMarket
      };
    } else if (this.volumes.traffic >= 0.38) {
      this.currentSnapshot = {
        zone: 'traffic',
        zoneLabel: dominantZone?.type === 'traffic' ? dominantZone.name : 'Main Road · Traffic',
        zoneBnLabel: dominantZone?.type === 'traffic' ? dominantZone.bnName : 'মূল সড়ক · যানজট',
        trafficLevel: this.volumes.traffic,
        crowdLevel: this.volumes.crowd,
        marketLevel: this.volumes.streetMarket
      };
    } else {
      this.currentSnapshot = {
        zone: 'alley',
        zoneLabel: 'Quiet Lane · Distant City',
        zoneBnLabel: 'নীরব গলি · দূরবর্তী শহর',
        trafficLevel: this.volumes.traffic,
        crowdLevel: this.volumes.crowd,
        marketLevel: this.volumes.streetMarket
      };
    }

    // 3. Apply per-track dynamic gains to Web Audio graph
    if (!this.initialized || !this.ctx || !this.masterGain) return;

    const now = this.ctx.currentTime;
    const isPlaying = params.isPlaying ?? true;
    const isPaused = params.isPaused ?? false;

    const masterTarget = this.muted
      ? 0.0001
      : isPlaying && !isPaused
      ? Math.max(0.0001, this.userVolume)
      : Math.max(0.0001, this.userVolume * 0.25);

    this.masterGain.gain.setTargetAtTime(masterTarget, now, 0.1);

    if (this.tracks.traffic) {
      this.tracks.traffic.currentVolume = this.volumes.traffic;
      this.tracks.traffic.targetVolume = targetTraffic;
      this.tracks.traffic.gainNode.gain.setTargetAtTime(
        Math.max(0.0001, this.volumes.traffic * 0.38),
        now,
        0.12
      );
    }

    if (this.tracks.crowd) {
      this.tracks.crowd.currentVolume = this.volumes.crowd;
      this.tracks.crowd.targetVolume = targetCrowd;
      this.tracks.crowd.gainNode.gain.setTargetAtTime(
        Math.max(0.0001, this.volumes.crowd * 0.34),
        now,
        0.12
      );
    }

    if (this.tracks.streetMarket) {
      this.tracks.streetMarket.currentVolume = this.volumes.streetMarket;
      this.tracks.streetMarket.targetVolume = targetMarket;
      this.tracks.streetMarket.gainNode.gain.setTargetAtTime(
        Math.max(0.0001, this.volumes.streetMarket * 0.4),
        now,
        0.12
      );
    }
  }

  public dispose(): void {
    this.disposed = true;
    (['traffic', 'crowd', 'streetMarket'] as AmbientTrackName[]).forEach((key) => {
      const tr = this.tracks[key];
      if (tr) {
        try {
          tr.source?.stop();
          tr.source?.disconnect();
          tr.gainNode.disconnect();
        } catch {
          // ignore
        }
        this.tracks[key] = null;
      }
    });
    try {
      this.masterGain?.disconnect();
    } catch {
      // ignore
    }
    this.masterGain = null;
    this.initialized = false;
  }
}

export { SpatialSoundManager as AmbientAudioManager };
