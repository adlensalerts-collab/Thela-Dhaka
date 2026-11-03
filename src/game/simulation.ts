import * as THREE from 'three';
import { Obstacle, resolveMovement } from './collision';
import { SidewalkGraph } from './pathfinding';
import { PedestrianManager, PedestrianNPC } from './pedestrians';
import {
  ActionName,
  KeyBindings,
  MouseSettings,
  loadSettings,
  actionForCode,
  DEFAULT_BINDINGS,
  DEFAULT_MOUSE_SETTINGS
} from './keybindings';
import { buildPavementTrees } from './world/trees';
import { spawnTraffic, updateTraffic, type TrafficItem } from './world/traffic';
import { DamageSystem, checkVehicleImpact } from './damage';
import { createPbrMaterials, applyWorldUV } from './render/pbr';
import { setupRealisticLighting, type LightingRig } from './render/lighting';
import { SaleIndicator } from './ui/saleIndicator';
import { createHumanRig, setPushPose, animateHuman } from './world/humans';
import { buildDhakaBuilding } from './world/buildings';
import { loadDisplaySettings, type DisplaySettings } from './render/display';
import {
  QualityLevel,
  QualityPreset,
  QUALITY_PRESETS,
  defaultQuality,
  AdaptiveResolution
} from './render/quality';
import { SpatialSoundManager } from './audio/ambient';
import { GARAGE_SITES, buildGarage, entranceForSite, nearestGarage } from './world/garages';
import { AAROT_SITES, buildAarot, entranceForAarot, nearestAarot } from './world/aarots';
import { nearJunction, auditObstacles } from './world/layout';
import { buildDistrictWorld, nearestService, setServiceMode, type DistrictWorld } from './map/districtWorld';
import { GraphTraffic } from './map/graphTraffic';
import { getDistrict } from './map/districtData';
import { VIEW_DISTANCE } from './map/chunks';
import { auditDistrict } from './map/minimap';
import type { DistrictId } from './map/district';

/** M-W — play on the real OpenStreetMap district (false = old grid city, kept as a fallback). */
export const USE_REAL_MAP = true;
export const REAL_MAP_ID: DistrictId = 'newmarket';

/** Pedestrians per quality preset (crowd NPCs use the compact ~6-draw-call model). */
const PEDESTRIANS_BY_QUALITY = { low: 20, medium: 30, high: 40, ultra: 50 } as const;
/** Hotspot crowd: stand still this long inside a hotspot and customers walk over. */
const HOTSPOT_RADIUS = 30;
const HOTSPOT_DWELL_SECONDS = 4;
const HOTSPOT_COOLDOWN_SECONDS = 18;
const PEDESTRIAN_VIEW_DISTANCE = 90;
import { StaminaSystem } from './stamina';
import { WeatherSystem, type WeatherType } from './world/weather';
import { StatsTracker, type RunStats, type RunResult } from './stats';
import {
  DAY_DURATION_SECONDS,
  DAY_FIXED_COST,
  DAY_FOOD_COST,
  DAY_OPENING_CAP,
  DAY_OPENING_CASH,
  DAY_OPENING_STOCK,
  DAY_RENT_COST,
  clampDayElapsedSeconds,
  evaluateDayOutcome,
  formatDayClock,
  getDayProfitTarget,
  isDayComplete,
  normalizeDayNumber
} from './day';
import { RemoteActor } from './net/remoteActor';
import { CrowdCharacterLOD } from './world/characterVisual';

const STALL_POSITIONS = [
  [-20, 10.5, 'x'],
  [-20, -10.5, 'x'],
  [10.5, -20, 'z'],
  [50.5, 20, 'z'],
  [-50.5, 20, 'z'],
  [60, 50.5, 'x']
] as const;

export interface GameState {
  mode: 'vendor' | 'police' | 'online_vendor' | 'online_police';
  stage: 'playing' | 'paused' | 'over' | 'victory';
  cash: number;
  level: number;
  cap: number;
  stock: number;
  sales: number;
  total: number;
  heat: number;
  alert: boolean;
  escape: number;
  cooldown: number;
  sale: { seconds: number; start: number; price: number; product: string; customer: any } | null;
  rank: number;
  arrests: number;
  integrity: number;
  stall: THREE.Group | null;
  policeCash: number;
  time: number;
  /** Solo-vendor working-day number (1-indexed, distinct from cart upgrade `level`). */
  dayNumber: number;
  /** Active gameplay seconds elapsed in the current working day (0..720). */
  dayElapsedSeconds: number;
  /** Formatted HH:MM working-day clock (06:00..22:00). */
  dayClockText: string;
  /** Required net profit target for the current working day. */
  dayTarget: number;
  /** Live net profit (for solo vendor, includes pending ৳90 rent+food before closing settlement). */
  dayProfit: number;
  /** Total sales income earned during the current working day. */
  dayEarned: number;
  /** Pending daily rent+food cost (৳90 before closing, ৳0 once settled). */
  dayPendingCosts: number;
  /** Whether the daily ৳50 rent + ৳40 food has been settled for this day. */
  dayCostsSettled: boolean;
  heading: number;
  speed: number;
  score: number;
  damage: number;
  repairCost: number;
  nearGarage: boolean;
  garageDistance: number;
  repairing?: { seconds: number; start: number; cost: number; entrance: { x: number; z: number } } | null;
  nearAarot: boolean;
  aarotDistance: number;
  restocking?: { seconds: number; start: number; cost: number; needed: number; entrance: { x: number; z: number } } | null;
  ambientZone?: string;
  ambientZoneBn?: string;
  trafficNoise?: number;
  crowdNoise?: number;
  marketNoise?: number;
  fps: number;
  renderHeight: number;
  displayHz: number;
  showFps?: boolean;
  playerX: number;
  /** Angry pedestrians shown on the minimap (filled by the public-rage system, Sprint 15). */
  angryPeds?: Array<{ x: number; z: number }>;
  /** Hotspot the vendor is standing in (null when none). */
  hotspotName?: string | null;
  /** 0..1 progress toward drawing customers in a hotspot. */
  hotspotDwell?: number;
  /** Vendor health, crowd rage and angry-crowd size (public-rage system, Sprint 15). */
  health?: number;
  rage?: number;
  angryPedCount?: number;
  playerZ: number;
  officerX: number;
  officerZ: number;
  stamina: number;
  staminaLevel: number;
  staminaUpgradeCost: number | null;
  exhausted: boolean;
  weather: WeatherType;
  weatherLabel: string;
  weatherTraction: number;
  weatherVisibility: number;
}

// Module-level reusable math objects for zero garbage collection during 60 FPS loop
const _toHuman = new THREE.Vector3();
const _officerDir = new THREE.Vector3();
const _lookTarget = new THREE.Vector3();

export class GameEngine {
  container: HTMLDivElement;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  clock: THREE.Clock;
  bindings: KeyBindings;
  mouseSettings: MouseSettings;
  heldActions: Set<ActionName> = new Set();
  state: GameState;
  onUpdate: (state: GameState) => void;
  onEvent: (type: string, data?: any) => void;
  audioCtx: AudioContext | null = null;
  ambientAudio: SpatialSoundManager = new SpatialSoundManager();
  muted: boolean = false;
  human!: THREE.Group;
  officer!: THREE.Group;
  npcVendor!: THREE.Group;
  sidewalkGraph!: SidewalkGraph;
  pedestrianManager!: PedestrianManager;
  obstacles: Obstacle[] = [];
  traffic: TrafficItem[] = [];
  world: DistrictWorld | null = null;
  graphTraffic: GraphTraffic | null = null;
  hotspotDwell = 0;
  hotspotCooldown = 0;
  summonPoint: { x: number; z: number } | null = null;
  damage = new DamageSystem();
  stamina = new StaminaSystem();
  stats = new StatsTracker();
  lastRunStats: RunStats | null = null;
  dayEnded: boolean = false;
  remote = new RemoteActor();
  crowdCharacters = new CrowdCharacterLOD();
  remoteActive = false;
  remoteSpeed = 0;
  weather!: WeatherSystem;
  lighting: LightingRig | null = null;
  saleIndicator!: SaleIndicator;
  vendorPhase: number = 0;
  officerPhase: number = 0;
  npcPhase: number = 0;
  animId: number = 0;
  acc: number = 0;
  lastHudPublishTime: number = 0;
  isMenuOrModalOpen: boolean = false;
  isDestroyed: boolean = false;

  // Render Quality, Adaptive Resolution & Frame Rate Control
  qualityLevel: QualityLevel = defaultQuality();
  qualityPreset: QualityPreset = QUALITY_PRESETS[defaultQuality()];
  adaptive = new AdaptiveResolution();
  currentPixelRatio: number = 0;
  fpsLimit: 60 | 120 | 0 = 0;
  showFps: boolean = false;
  limiterTime: number = 0;
  lastRenderTime: number = 0;
  lastRafTime: number = 0;
  rafIntervals: number[] = [];
  measuredDisplayFps: number = 60;
  fpsWindowStart: number = 0;
  fpsFrameCount: number = 0;
  currentFps: number = 60;

  get customers(): PedestrianNPC[] {
    return this.pedestrianManager ? this.pedestrianManager.pedestrians : [];
  }

  // Collision & Physics Feedback
  recoilVx: number = 0;
  recoilVz: number = 0;
  driftVx: number = 0;
  driftVz: number = 0;
  cameraShake: number = 0;
  trafficHitCooldown: number = 0;
  wallBumpCooldown: number = 0;
  particles: Array<{ mesh: THREE.Mesh; vx: number; vy: number; vz: number; life: number; maxLife: number }> = [];
  particleGeo = new THREE.SphereGeometry(0.12, 4, 4);

  // Mouse Drag Camera & Follow
  cameraYaw: number = 0;
  cameraPitch: number = 0.38;
  cameraDistance: number = 10.5;
  isMouseDragging: boolean = false;
  lastMouseX: number = 0;
  lastMouseY: number = 0;
  mouseMovedRecently: number = 0;
  currentSpeed: number = 0;

  // Stored listener removal hooks
  private cleanupListeners: Array<() => void> = [];

  constructor(
    container: HTMLDivElement,
    onUpdate: (s: GameState) => void,
    onEvent: (t: string, d?: any) => void,
    bindings?: KeyBindings,
    mouseSettings?: MouseSettings
  ) {
    this.container = container;
    this.onUpdate = onUpdate;
    this.onEvent = onEvent;
    const initialSettings = loadSettings();
    this.bindings = bindings || initialSettings.bindings;
    this.mouseSettings = mouseSettings || {
      mouseSensitivity: initialSettings.mouseSensitivity,
      invertY: initialSettings.invertY
    };
    this.clock = new THREE.Clock();

    this.scene = new THREE.Scene();
    this.saleIndicator = new SaleIndicator(this.scene);

    this.camera = new THREE.PerspectiveCamera(66, container.clientWidth / container.clientHeight, 0.1, 470);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.domElement.tabIndex = 0;
    this.renderer.domElement.style.outline = 'none';
    container.replaceChildren(this.renderer.domElement);

    this.initLights();
    this.weather = new WeatherSystem(this.scene, this.lighting);
    this.initWorld();

    this.state = this.getInitialState('vendor');

    this.initListeners();
    this.startAudio();
  }

  getInitialState(mode: GameState['mode'], dayNumber = 1): GameState {
    const isVendor = mode === 'vendor' || mode === 'online_vendor';
    const isSoloVendor = mode === 'vendor';
    const normalizedDay = normalizeDayNumber(dayNumber);
    const dayTarget = getDayProfitTarget(normalizedDay);
    return {
      mode,
      stage: 'playing',
      cash: DAY_OPENING_CASH,
      level: 1,
      cap: DAY_OPENING_CAP,
      stock: DAY_OPENING_STOCK,
      sales: 0,
      total: 0,
      heat: 0,
      alert: false,
      escape: 0,
      cooldown: 0,
      sale: null,
      rank: 1,
      arrests: 0,
      integrity: 100,
      stall: null,
      policeCash: 0,
      time: 0,
      dayNumber: normalizedDay,
      dayElapsedSeconds: 0,
      dayClockText: formatDayClock(0),
      dayTarget,
      dayProfit: isSoloVendor ? -DAY_FIXED_COST : 0,
      dayEarned: 0,
      dayPendingCosts: isSoloVendor ? DAY_FIXED_COST : 0,
      dayCostsSettled: false,
      heading: 0,
      speed: 0,
      score: 0,
      damage: 0,
      repairCost: 0,
      nearGarage: false,
      garageDistance: 20,
      repairing: null,
      nearAarot: false,
      aarotDistance: 20,
      restocking: null,
      ambientZone: 'Main Road · Traffic',
      ambientZoneBn: 'মূল সড়ক · যানজট',
      trafficNoise: 0.25,
      crowdNoise: 0.15,
      fps: this.currentFps,
      renderHeight: Math.round((this.container?.clientHeight || 720) * (this.currentPixelRatio || 1)),
      displayHz: Math.round(this.measuredDisplayFps),
      showFps: this.showFps,
      playerX: 0,
      playerZ: 0,
      officerX: 0,
      officerZ: 0,
      stamina: 100,
      staminaLevel: isVendor ? 1 : 3,
      staminaUpgradeCost: isVendor ? 150 : null,
      exhausted: false,
      weather: 'sunny',
      weatherLabel: 'Sunny · রোদেলা',
      weatherTraction: 100,
      weatherVisibility: 100
    };
  }

  startAudio() {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        this.audioCtx = new AudioCtx();
        this.ambientAudio.attachContext(this.audioCtx);
      }
    } catch (e) {
      console.warn('AudioContext not started', e);
    }
  }

  resumeAudio() {
    if (!this.audioCtx) {
      this.startAudio();
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume().catch(() => {});
    }
    this.ambientAudio.attachContext(this.audioCtx);
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    this.ambientAudio.setMuted(muted);
  }

  setAmbientVolume(v: number) {
    this.resumeAudio();
    this.ambientAudio.setVolume(v);
  }

  playBeep(freq = 440, duration = 0.1, type: OscillatorType = 'sine') {
    const vol = this.ambientAudio.getVolume();
    if (this.muted || !this.audioCtx || vol <= 0.001) return;
    try {
      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume();
      }
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, this.audioCtx.currentTime);
      gain.gain.setValueAtTime(Math.max(0.001, 0.12 * vol), this.audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.audioCtx.currentTime + duration);
      osc.connect(gain);
      gain.connect(this.audioCtx.destination);
      osc.start();
      osc.stop(this.audioCtx.currentTime + duration);
    } catch (e) {}
  }

  playThud(intensity = 0.5) {
    const vol = this.ambientAudio.getVolume();
    if (this.muted || !this.audioCtx || vol <= 0.001) return;
    try {
      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume();
      }
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(110 * intensity, this.audioCtx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(35, this.audioCtx.currentTime + 0.18);
      gain.gain.setValueAtTime(Math.max(0.001, 0.2 * intensity * vol), this.audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.audioCtx.currentTime + 0.18);
      osc.connect(gain);
      gain.connect(this.audioCtx.destination);
      osc.start();
      osc.stop(this.audioCtx.currentTime + 0.18);
    } catch (e) {}
  }

  playRickshawBell() {
    const vol = this.ambientAudio.getVolume();
    if (this.muted || !this.audioCtx || vol <= 0.001) return;
    try {
      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume();
      }
      // Authentic Dhaka Rickshaw double bell "Tring-tring!"
      const now = this.audioCtx.currentTime;
      [0, 0.09].forEach((delay) => {
        const osc = this.audioCtx!.createOscillator();
        const gain = this.audioCtx!.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(1280, now + delay);
        osc.frequency.exponentialRampToValueAtTime(1420, now + delay + 0.04);
        gain.gain.setValueAtTime(Math.max(0.001, 0.18 * vol), now + delay);
        gain.gain.exponentialRampToValueAtTime(0.001, now + delay + 0.12);
        osc.connect(gain);
        gain.connect(this.audioCtx!.destination);
        osc.start(now + delay);
        osc.stop(now + delay + 0.12);
      });
    } catch (e) {}
  }

  spawnCollisionParticles(x: number, y: number, z: number, color = '#f2a63b', count = 8) {
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 });
    for (let i = 0; i < count; i++) {
      const mesh = new THREE.Mesh(this.particleGeo, mat);
      mesh.position.set(x + (Math.random() - 0.5) * 0.4, y + (Math.random() - 0.5) * 0.4, z + (Math.random() - 0.5) * 0.4);
      const angle = Math.random() * Math.PI * 2;
      const speed = 1.2 + Math.random() * 2.8;
      this.scene.add(mesh);
      this.particles.push({
        mesh,
        vx: Math.cos(angle) * speed,
        vy: 1.0 + Math.random() * 2.0,
        vz: Math.sin(angle) * speed,
        life: 0,
        maxLife: 0.35 + Math.random() * 0.25
      });
    }
  }

  initLights() {
    this.lighting = setupRealisticLighting(this.renderer, this.scene);
    const saved = loadDisplaySettings();
    this.lighting.setBrightness(saved.brightness);
    this.setDisplayOptions({
      quality: saved.quality,
      fpsLimit: saved.fpsLimit,
      showFps: saved.showFps
    });
  }

  setBrightness(v: number) {
    this.lighting?.setBrightness(v);
  }

  applyQuality(level: QualityLevel) {
    this.world?.chunks.setViewDistance(VIEW_DISTANCE[level]);
    const preset = QUALITY_PRESETS[level] || QUALITY_PRESETS[defaultQuality()];
    const shadowsChanged = this.renderer.shadowMap.enabled !== preset.shadows;
    this.qualityLevel = level;
    this.qualityPreset = preset;

    this.renderer.shadowMap.enabled = preset.shadows;
    this.renderer.shadowMap.needsUpdate = true;

    if (shadowsChanged) {
      this.scene.traverse((o) => {
        const m = (o as THREE.Mesh).material;
        if (!m) return;
        (Array.isArray(m) ? m : [m]).forEach((mat) => {
          mat.needsUpdate = true;
        });
      });
    }

    if (this.lighting?.sun) {
      this.lighting.sun.castShadow = preset.shadows;
      if (this.lighting.sun.shadow.mapSize.width !== preset.shadowMapSize) {
        this.lighting.sun.shadow.mapSize.set(preset.shadowMapSize, preset.shadowMapSize);
        if (this.lighting.sun.shadow.map) {
          this.lighting.sun.shadow.map.dispose();
          this.lighting.sun.shadow.map = null;
        }
      }
    }

    const treesGroup = this.scene.getObjectByName('pavement-trees');
    if (treesGroup) {
      treesGroup.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (mesh.isMesh && mesh.material) {
          const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          if (mats.some((m: any) => m && m.alphaTest > 0)) {
            mesh.castShadow = preset.leafShadows;
          }
        }
      });
    }

    this.updatePixelRatio(true);
  }

  updatePixelRatio(force = false) {
    if (!this.container) return;
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);
    const dpr = window.devicePixelRatio || 1;
    const capRatio = this.qualityPreset.maxRenderHeight / height;
    const maxScale = Math.max(dpr, 2.25);
    const pixelRatio = Math.max(0.5, Math.min(maxScale, capRatio) * this.adaptive.scale);

    if (force || Math.abs(pixelRatio - this.currentPixelRatio) >= 0.01) {
      this.currentPixelRatio = pixelRatio;
      this.renderer.setPixelRatio(pixelRatio);
    }
    this.renderer.setSize(width, height);

    if (this.state) {
      this.state.renderHeight = Math.round(height * (this.currentPixelRatio || pixelRatio));
    }
  }

  setDisplayOptions(opts: Partial<Pick<DisplaySettings, 'quality' | 'fpsLimit' | 'showFps'>>) {
    if (opts.quality !== undefined) {
      this.adaptive.scale = 1;
      this.applyQuality(opts.quality);
    }
    if (opts.fpsLimit !== undefined) {
      this.fpsLimit = opts.fpsLimit;
      this.limiterTime = 0;
      this.fpsFrameCount = 0;
      this.fpsWindowStart = performance.now();
    }
    if (opts.showFps !== undefined) {
      this.showFps = opts.showFps;
    }
    if (this.state) {
      this.state.showFps = this.showFps;
      this.state.displayHz = Math.round(this.measuredDisplayFps);
      this.state.renderHeight = Math.round(
        Math.max(1, this.container.clientHeight) * (this.currentPixelRatio || 1)
      );
      this.publishState(true);
    }
  }

  initWorld() {
    this.obstacles = [];

    const matte = (color: string, roughness = 0.92) => new THREE.MeshStandardMaterial({ color, roughness });
    const mat = createPbrMaterials();

    const block = (p: THREE.Object3D, w: number, h: number, d: number, m: THREE.Material, x = 0, y = h / 2, z = 0, cast = true) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
      mesh.position.set(x, y, z);
      mesh.castShadow = cast;
      mesh.receiveShadow = true;
      if ((m as any).userData?.surface) applyWorldUV(mesh);
      p.add(mesh);
      return mesh;
    };

    const cylinder = (p: THREE.Object3D, rt: number, rb: number, h: number, m: THREE.Material, x = 0, y = h / 2, z = 0, s = 10) => {
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, s), m);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      if ((m as any).userData?.surface) applyWorldUV(mesh);
      p.add(mesh);
      return mesh;
    };

    const sphere = (p: THREE.Object3D, r: number, m: THREE.Material, x: number, y: number, z: number) => {
      const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 0), m);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      p.add(mesh);
      return mesh;
    };

    const rand = (a: number, b: number) => a + Math.random() * (b - a);
    const pick = (arr: any[]) => arr[(Math.random() * arr.length) | 0];

    const labelTexture = (text: string, fg = '#f9df85', bg = '#16433b', width = 384, height = 96) => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const cx = canvas.getContext('2d')!;
      cx.fillStyle = bg;
      cx.fillRect(0, 0, width, height);
      cx.strokeStyle = '#e0b45c';
      cx.lineWidth = 7;
      cx.strokeRect(4, 4, width - 8, height - 8);
      cx.fillStyle = fg;
      cx.textAlign = 'center';
      cx.textBaseline = 'middle';
      cx.font = "bold 42px 'Hind Siliguri', sans-serif";
      cx.fillText(text, width / 2, height / 2 + 5, width - 22);
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      return new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide, transparent: false });
    };

    const sign = (p: THREE.Object3D, text: string, x: number, y: number, z: number, w = 5) => {
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, w / 4), labelTexture(text));
      mesh.position.set(x, y, z);
      p.add(mesh);
      return mesh;
    };

    if (USE_REAL_MAP) {
      // Real district (roads, footpaths, buildings, trees, poles, stalls, garages, aarots, collision)
      this.world = buildDistrictWorld(this.scene, getDistrict(REAL_MAP_ID));
      this.obstacles = this.world.obstacles;
      this.graphTraffic = new GraphTraffic(this.scene, this.world.roads, 36);
      this.traffic = this.graphTraffic.vehicles;
      this.ambientAudio.setDistrict(
        this.world.district.sites.hotspots.map((h, i) => ({
          id: `hot_${i}`, name: h.name, bnName: h.name,
          type: h.kind === 'junction' ? 'traffic' : h.kind === 'marketplace' || h.kind === 'mall' || h.kind === 'department_store' ? 'streetMarket' : 'crowd',
          x: h.x, z: h.z, innerRadius: 10, outerRadius: h.kind === 'junction' ? 45 : 70, maxWeight: 1
        })),
        (x, z) => this.world?.roads.nearest(x, z)?.dist ?? 30
      );
    } else {
    // Ground
    block(this.scene, 265, 0.7, 265, mat.soil, 0, -0.45, 0, false);
    const street = [-80, -40, 0, 40, 80];
    for (const n of street) {
      block(this.scene, 246, 0.12, 13, mat.road, 0, 0.005, n, false);
      block(this.scene, 13, 0.12, 246, mat.road, n, 0.007, 0, false);
      for (let k = -116; k < 117; k += 8) {
        block(this.scene, 2.6, 0.018, 0.19, mat.stripe, k, 0.08, n, false);
        block(this.scene, 0.19, 0.018, 2.6, mat.stripe, n, 0.08, k, false);
      }
      for (const s of [-1, 1]) {
        block(this.scene, 246, 0.12, 2.8, mat.pavement, 0, 0.015, n + s * 8.1, false);
        block(this.scene, 2.8, 0.12, 246, mat.pavement, n + s * 8.1, 0.015, 0, false);
      }
    }

    // Sidewalk junction stripes
    for (const x of street) {
      for (const z of street) {
        for (let j = -3; j <= 3; j++) {
          block(this.scene, 0.72, 0.015, 2.35, mat.stripe, x + j * 1.45, 0.095, z + 9, false);
          block(this.scene, 2.35, 0.015, 0.72, mat.stripe, x + 9, 0.095, z + j * 1.45, false);
        }
      }
    }

    const shops = ['চায়ের দোকান', 'ফলের আড়ৎ', 'নিউ মার্কেট', 'সিটি স্টোর', 'ঢাকা খাবার', 'মা ফার্মেসি', 'সবজি বাজার', 'ফুচকা হাউস', 'মায়ের দোয়া', 'মিষ্টি ঘর'];

    const buildBuilding = (x: number, z: number) => {
      const h = rand(10, 31), width = rand(15, 17), depth = rand(15, 17);
      const color = pick(['#e0d4bc', '#d9cdb4', '#e8dfce', '#d4c7af', '#dfd7c5']);
      const b = buildDhakaBuilding(this.scene, { x, z, width, depth, height: h, color, shopNames: shops });
      this.obstacles.push(b.obstacle);
    };

    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) {
        const x = -60 + i * 40;
        const z = -60 + j * 40;
        if (
          GARAGE_SITES.some((g) => g.x === x && g.z === z) ||
          AAROT_SITES.some((a) => a.x === x && a.z === z)
        ) {
          continue;
        }
        buildBuilding(x, z);
      }
    }
    for (const site of GARAGE_SITES) {
      const g = buildGarage(this.scene, site);
      this.obstacles.push(...g.obstacles);
    }
    for (const site of AAROT_SITES) {
      const a = buildAarot(this.scene, site);
      this.obstacles.push(...a.obstacles);
    }
    for (const x of [-100, 100]) {
      for (const z of [-100, -60, -20, 20, 60, 100]) {
        if (Math.random() < 0.63) buildBuilding(x, z);
      }
    }

    const makePole = (x: number, z: number) => {
      cylinder(this.scene, 0.11, 0.14, 8, mat.metal, x, 4, z, 8);
      block(this.scene, 1.2, 0.13, 0.13, mat.dark, x + 0.45, 7.9, z, false);
      // Register pole obstacle
      this.obstacles.push({
        type: 'circle',
        x,
        z,
        radius: 0.35,
        tag: 'pole'
      });
    };
    for (const n of [0, 40]) {
      for (let z = -110; z <= 110; z += 27) {
        if (nearJunction(z, 11)) continue;
        makePole(n - 7.1, z);
      }
    }

    // Elevated metro roadway & concrete pillars
    for (let x = -115; x < 115; x += 15) {
      if (nearJunction(x, 10.75)) continue;
      cylinder(this.scene, 0.95, 1.2, 8.1, mat.concrete, x, 4, -79.5, 8);
      this.obstacles.push({
        type: 'circle',
        x,
        z: -79.5,
        radius: 1.25,
        tag: 'metro_pillar'
      });
    }
    block(this.scene, 244, 1.1, 11.2, mat.concrete, 0, 8.4, -79.5, false);
    block(this.scene, 244, 0.16, 10, mat.road, 0, 9.1, -79.5, false);

    const makeStall = (x: number, z: number, axis: 'x' | 'z' = 'x') => {
      const g = new THREE.Group();
      g.position.set(x, 0, z);
      if (axis === 'z') g.rotation.y = Math.PI / 2;
      block(g, 3.9, 1, 1.8, mat.wood, 0, 0.8, 0);
      for (const xx of [-1.5, 1.5]) {
        for (const zz of [-0.6, 0.6]) {
          cylinder(g, 0.055, 0.055, 2.5, mat.metal, xx, 2.35, zz);
        }
      }
      block(g, 4.4, 0.3, 2.1, matte('#e7b344'), 0, 3.75, 0);
      for (let i = 0; i < 9; i++) {
        sphere(g, 0.25, matte(pick(['#dd4931', '#86ae4a', '#e6bc3c'])), rand(-1.6, 1.6), 1.5, rand(-0.5, 0.5));
      }
      this.scene.add(g);

      // Register stall obstacle
      this.obstacles.push({
        type: 'box',
        x,
        z,
        hw: axis === 'x' ? 1.95 : 0.9,
        hd: axis === 'x' ? 0.9 : 1.95,
        tag: 'stall'
      });
      return g;
    };
    for (const [x, z, axis] of STALL_POSITIONS) {
      makeStall(x, z, axis);
    }

    buildPavementTrees(this.scene, this.obstacles, {
      streets: street,
      avoid: [
        ...STALL_POSITIONS.map(([x, z]) => ({ x, z, r: 3.5 })),
        ...GARAGE_SITES.map((s) => ({ ...entranceForSite(s), r: 5 })),
        ...AAROT_SITES.map((s) => ({ ...entranceForAarot(s), r: 5 }))
      ]
    });
      this.traffic = spawnTraffic(this.scene, street, 18);
    }
    this.applyQuality(this.qualityLevel);

    const makeCart = (isVendor = true) => {
      const g = new THREE.Group();
      const rig = createHumanRig(isVendor ? { outfit: 'lungi', shirt: '#ebe5d6', bottom: '#2f6b8a', gamchha: true } : { outfit: 'police' });
      if (isVendor) setPushPose(rig);
      g.add(rig.group);
      g.userData.rig = rig;
      if (isVendor) {
        const frame = new THREE.Group();
        frame.position.z = -1.35;
        g.add(frame);
        block(frame, 1.75, 0.2, 1.75, mat.wood, 0, 0.85, 0);
        block(frame, 1.72, 0.08, 1.72, mat.metal, 0, 0.72, 0);
        const axle = cylinder(frame, 0.045, 0.045, 1.9, mat.metal, 0, 0.43, 0, 8);
        axle.rotation.z = Math.PI / 2;
        block(frame, 1.9, 0.33, 0.12, mat.red, 0, 1.35, -0.75);
        block(frame, 1.9, 0.33, 0.12, mat.yellow, 0, 1.35, 0.75);
        for (const xx of [-0.92, 0.92]) {
          const wheel = cylinder(frame, 0.39, 0.39, 0.15, mat.dark, xx, 0.43, 0, 12);
          wheel.rotation.z = Math.PI / 2;
        }
        for (let i = 0; i < 17; i++) {
          sphere(frame, 0.24, matte(pick(['#d85e37', '#d4a538', '#82a755', '#7e9f46'])), rand(-0.7, 0.7), 1.12, rand(-0.64, 0.64));
        }
        const signBoard = block(frame, 1.65, 0.53, 0.12, matte('#216a58'), 0, 1.85, -0.79);
        signBoard.castShadow = false;
        const frontSign = sign(frame, 'ঠেলা ঢাকা', 0, 1.85, -0.86, 1.55);
        frontSign.rotation.y = Math.PI;
        for (const xx of [-0.55, 0.55]) {
          block(frame, 0.09, 0.14, 1.45, mat.metal, xx, 1.05, 0.87);
        }
      }
      return g;
    };

    this.human = makeCart(true);
    this.scene.add(this.human);
    this.officer = makeCart(false);
    this.scene.add(this.officer);
    this.npcVendor = makeCart(true);
    this.scene.add(this.npcVendor);

    // Initialize Dhaka sidewalk waypoint network and pool of 14 A* pedestrian NPCs
    this.sidewalkGraph = this.world ? this.world.footpaths : new SidewalkGraph();
    this.pedestrianManager = new PedestrianManager(
      this.scene,
      this.sidewalkGraph,
      this.world ? PEDESTRIANS_BY_QUALITY[this.qualityLevel] ?? 30 : 14
    );
    if (this.world) this.pedestrianManager.bounds = { ...this.world.bounds };
    if (this.world) this.pedestrianManager.setHotspots(this.world.district.sites.hotspots);

    if ((import.meta as any).env?.DEV) {
      if (this.world) auditDistrict(this.world);
      else auditObstacles(this.obstacles);
    }
  }

  /**
   * Hotspot crowd: a vendor who stands still inside a hotspot (market, busy junction…) for a few
   * seconds draws nearby pedestrians, who walk over and wait to buy. Moving away sends them back.
   */
  updateHotspotCrowd(dt: number, p: THREE.Object3D) {
    const isVendor = this.state.mode === 'vendor' || this.state.mode === 'online_vendor';
    if (!this.world || !isVendor || !this.pedestrianManager) { this.state.hotspotName = null; this.state.hotspotDwell = 0; return; }
    this.hotspotCooldown = Math.max(0, this.hotspotCooldown - dt);
    let spot: { name: string } | null = null;
    for (const h of this.world.district.sites.hotspots) {
      if (Math.hypot(h.x - p.position.x, h.z - p.position.z) <= HOTSPOT_RADIUS) { spot = h; break; }
    }
    this.state.hotspotName = spot ? (spot.name === 'Junction' ? 'ব্যস্ত মোড় · Busy junction' : spot.name) : null;
    const still = Math.abs(this.currentSpeed) < 0.4;
    const busy = !!(this.state.sale || this.state.repairing || this.state.restocking || this.state.alert);
    if (spot && still && !busy && this.state.stock > 0 && this.hotspotCooldown <= 0) {
      this.hotspotDwell += dt;
      if (this.hotspotDwell >= HOTSPOT_DWELL_SECONDS) {
        const n = this.pedestrianManager.summonCustomers(p.position.x, p.position.z, 3, 55);
        if (n > 0) {
          this.summonPoint = { x: p.position.x, z: p.position.z };
          this.onEvent('notify', `ভিড় জমছে! ${n} জন ক্রেতা আসছে · Customers coming`);
          this.playBeep(660, 0.12);
        }
        this.hotspotDwell = 0;
        this.hotspotCooldown = HOTSPOT_COOLDOWN_SECONDS;
      }
    } else if (!still) {
      this.hotspotDwell = 0;
    }
    this.state.hotspotDwell = Math.min(1, this.hotspotDwell / HOTSPOT_DWELL_SECONDS);
    // Vendor walked off: waiting customers lose interest
    if (this.summonPoint && Math.hypot(p.position.x - this.summonPoint.x, p.position.z - this.summonPoint.z) > 12) {
      this.pedestrianManager.releaseSummoned();
      this.summonPoint = null;
    }
  }

  /** Obstacles near a point: spatial grid on the real map, full list on the grid map. */
  nearObstacles(x: number, z: number): Obstacle[] {
    return this.world ? this.world.grid.near(x, z, 4) : this.obstacles;
  }

  mapBound(fallback: number): number | { x: number; z: number } {
    return this.world ? this.world.bounds : fallback;
  }

  addObstacle(o: Obstacle) {
    this.obstacles.push(o);              // on the real map this is the world's obstacle list
    this.world?.grid.add(o);
  }

  respawnNpcVendor() {
    if (this.world) {
      const np = this.footpathPoint(this.officer.position.x, this.officer.position.z, 35, 55);
      this.npcVendor.position.set(np.x, 0, np.z);
    } else {
      this.npcVendor.position.set(-36, 0, 36);
    }
  }

  nearestGarageInfo(x: number, z: number) {
    return this.world ? nearestService(this.world.garages, x, z) : nearestGarage(x, z);
  }

  nearestAarotInfo(x: number, z: number) {
    return this.world ? nearestService(this.world.aarots, x, z) : nearestAarot(x, z);
  }

  /** A footpath point between minD and maxD metres from (x, z) — safe place to put an officer or NPC. */
  footpathPoint(x: number, z: number, minD: number, maxD: number): { x: number; z: number } {
    const nodes = this.sidewalkGraph?.nodes ?? [];
    let best: { x: number; z: number } | null = null, bestScore = Infinity;
    const mid = (minD + maxD) / 2;
    for (const n of nodes) {
      const d = Math.hypot(n.x - x, n.z - z);
      const score = d >= minD && d <= maxD ? Math.abs(d - mid) : 1000 + Math.abs(d - mid);
      if (score < bestScore) { bestScore = score; best = { x: n.x, z: n.z }; }
    }
    return best ?? { x, z };
  }

  clearInputs() {
    this.heldActions.clear();
    this.isMouseDragging = false;
  }

  setBindings(bindings: KeyBindings, mouseSettings?: Partial<MouseSettings>) {
    this.bindings = bindings;
    if (mouseSettings) {
      this.mouseSettings = { ...this.mouseSettings, ...mouseSettings };
    }
  }

  setMenuOpen(isOpen: boolean) {
    this.isMenuOrModalOpen = isOpen;
    if (isOpen) {
      this.clearInputs();
    }
  }

  pauseGame() {
    if (this.state) {
      this.state.stage = 'paused';
    }
    this.clearInputs();
    this.acc = 0;
    this.publishState(true);
  }

  resumeGame() {
    if (this.state) {
      this.state.stage = 'playing';
    }
    this.clearInputs();
    this.clock.getDelta(); // flush stale delta
    this.acc = 0;
    this.renderer.domElement.focus();
    this.publishState(true);
  }

  initListeners() {
    const dom = this.renderer.domElement;

    // Suppress context menu on canvas so right-click drag works cleanly
    dom.addEventListener('contextmenu', (e) => e.preventDefault());

    const onKeyDown = (e: KeyboardEvent) => {
      // Do not process gameplay keys while typing in form inputs
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }

      // Block gameplay input if menu/modal is open or game is not in active playing state
      if (this.isMenuOrModalOpen || !this.state || this.state.stage !== 'playing') {
        return;
      }

      this.resumeAudio();

      const action = actionForCode(e.code, this.bindings);
      if (action) {
        // Prevent scrolling on arrows, space, etc.
        e.preventDefault();

        // One-shot actions trigger once on initial physical keydown
        if (['sell', 'restock', 'upgrade', 'upgradeStamina', 'changeView', 'placeStall', 'repair', 'pause'].includes(action)) {
          if (!e.repeat) {
            this.handleAction(action);
          }
        } else {
          // Held actions: forward, backward, turnLeft, turnRight, sprint
          this.heldActions.add(action);
        }
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      const action = actionForCode(e.code, this.bindings);
      if (action) {
        this.heldActions.delete(action);
      }
    };

    const onBlur = () => this.clearInputs();

    const onVisibilityChange = () => {
      if (document.hidden) {
        this.clearInputs();
        this.acc = 0;
      }
    };

    const onResize = () => {
      if (!this.container) return;
      this.rafIntervals = [];
      this.camera.aspect = this.container.clientWidth / this.container.clientHeight;
      this.camera.updateProjectionMatrix();
      this.updatePixelRatio();
    };

    // Prevent browser gesture hijacking on the 3D canvas
    dom.style.touchAction = 'none';

    let activeDragPointerId: number | null = null;
    let lastPinchDist: number | null = null;

    // Mouse & single-finger touch camera drag (multi-touch safe while holding HUD buttons)
    const onPointerDown = (e: PointerEvent) => {
      this.resumeAudio();
      if (e.pointerType === 'mouse' && e.button !== 0 && e.button !== 2) return;
      if (activeDragPointerId === null) {
        activeDragPointerId = e.pointerId;
        this.isMouseDragging = true;
        this.lastMouseX = e.clientX;
        this.lastMouseY = e.clientY;
        dom.focus();
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      if (this.isMouseDragging && e.pointerId === activeDragPointerId && lastPinchDist === null) {
        const dx = e.clientX - this.lastMouseX;
        const dy = e.clientY - this.lastMouseY;
        const baseSens = e.pointerType === 'touch' ? 0.0045 : 0.0055;
        const sens = (this.mouseSettings.mouseSensitivity || 1.0) * baseSens;
        const invertY = this.mouseSettings.invertY ? -1 : 1;
        this.cameraYaw -= dx * sens;
        this.cameraPitch = THREE.MathUtils.clamp(
          this.cameraPitch - dy * sens * invertY,
          0.08,
          1.25
        );
        this.mouseMovedRecently = 1.2;
        this.lastMouseX = e.clientX;
        this.lastMouseY = e.clientY;
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      if (e.pointerId === activeDragPointerId) {
        activeDragPointerId = null;
        this.isMouseDragging = false;
      }
    };

    const onWheel = (e: WheelEvent) => {
      if (this.state && this.state.stage === 'playing' && !this.isMenuOrModalOpen) {
        e.preventDefault();
        this.cameraDistance = THREE.MathUtils.clamp(this.cameraDistance + e.deltaY * 0.008, 4.5, 26.0);
      }
    };

    // Two-finger pinch-to-zoom on the 3D canvas
    const onTouchStart = (e: TouchEvent) => {
      this.resumeAudio();
      if (e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        lastPinchDist = Math.hypot(dx, dy);
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (
        e.touches.length === 2 &&
        lastPinchDist !== null &&
        this.state &&
        this.state.stage === 'playing' &&
        !this.isMenuOrModalOpen
      ) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const dist = Math.hypot(dx, dy);
        const delta = lastPinchDist - dist;
        this.cameraDistance = THREE.MathUtils.clamp(
          this.cameraDistance + delta * 0.035,
          4.5,
          26.0
        );
        lastPinchDist = dist;
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) {
        lastPinchDist = null;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('resize', onResize);

    dom.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
    dom.addEventListener('wheel', onWheel, { passive: false });
    dom.addEventListener('touchstart', onTouchStart, { passive: true });
    dom.addEventListener('touchmove', onTouchMove, { passive: true });
    dom.addEventListener('touchend', onTouchEnd);
    dom.addEventListener('touchcancel', onTouchEnd);

    // Save cleanup hooks
    this.cleanupListeners = [
      () => window.removeEventListener('keydown', onKeyDown),
      () => window.removeEventListener('keyup', onKeyUp),
      () => window.removeEventListener('blur', onBlur),
      () => document.removeEventListener('visibilitychange', onVisibilityChange),
      () => window.removeEventListener('resize', onResize),
      () => dom.removeEventListener('pointerdown', onPointerDown),
      () => window.removeEventListener('pointermove', onPointerMove),
      () => window.removeEventListener('pointerup', onPointerUp),
      () => window.removeEventListener('pointercancel', onPointerUp),
      () => dom.removeEventListener('wheel', onWheel),
      () => dom.removeEventListener('touchstart', onTouchStart),
      () => dom.removeEventListener('touchmove', onTouchMove),
      () => dom.removeEventListener('touchend', onTouchEnd),
      () => dom.removeEventListener('touchcancel', onTouchEnd)
    ];
  }

  syncDayAccountingState() {
    if (!this.state) return;
    const isSoloVendor = this.state.mode === 'vendor';
    this.state.dayNumber = this.stats.dayNumber;
    this.state.dayTarget = this.stats.dayTarget;
    this.state.dayEarned = this.stats.earned;
    this.state.dayCostsSettled = this.stats.dayCostsSettled;
    this.state.dayPendingCosts =
      isSoloVendor && !this.stats.dayCostsSettled ? DAY_FIXED_COST : 0;
    this.state.dayProfit = isSoloVendor
      ? this.stats.liveHudProfit()
      : this.stats.currentProfit();
  }

  private cancelActiveTimers() {
    if (this.state?.sale) {
      if (this.state.sale.customer) {
        this.state.sale.customer.isEngagedInSale = false;
        this.state.sale.customer.summonUntil = 0;
      }
      this.state.sale = null;
    }
    if (this.state) {
      this.state.repairing = null;
      this.state.restocking = null;
    }
    if (this.saleIndicator && this.human) {
      this.saleIndicator.update(this.human.position, null, 0);
    }
  }

  restartDay() {
    const mode = this.state?.mode ?? 'vendor';
    const dayNumber = this.state?.dayNumber ?? 1;
    this.setMode(mode, dayNumber);
  }

  setMode(mode: GameState['mode'], dayNumber = 1) {
    this.cancelActiveTimers();
    if (this.state?.stall) {
      this.scene.remove(this.state.stall);
      this.obstacles = this.obstacles.filter((o) => o.tag !== 'big_stall');
    }
    const normalizedDay = normalizeDayNumber(dayNumber);
    this.dayEnded = false;
    this.state = this.getInitialState(mode, normalizedDay);
    const isVendor = mode === 'vendor' || mode === 'online_vendor';
    this.human.visible = isVendor || mode === 'online_police';
    this.officer.visible = true;
    this.npcVendor.visible = mode === 'police';
    this.remote.reset();
    this.remoteActive = false;
    this.remoteSpeed = 0;
    this.hotspotDwell = 0;
    this.hotspotCooldown = 0;
    this.summonPoint = null;
    this.pedestrianManager?.releaseSummoned();
    if (this.pedestrianManager) {
      for (const ped of this.pedestrianManager.pedestrians) {
        ped.isEngagedInSale = false;
        ped.summonUntil = 0;
      }
    }
    if (this.world) setServiceMode(this.world, isVendor ? 'vendor' : 'police');
    if (this.world) {
      const sp = this.world.spawn;
      this.human.position.set(sp.x, 0, sp.z);
      const op = this.footpathPoint(sp.x, sp.z, 28, 40);
      this.officer.position.set(op.x, 0, op.z);
      const np = this.footpathPoint(sp.x, sp.z, 20, 30);
      this.npcVendor.position.set(np.x, 0, np.z);
    } else {
      this.human.position.set(0, 0, 7);
      this.officer.position.set(0, 0, -23);
      this.npcVendor.position.set(0, 0, -19);
    }
    const activePlayer = isVendor ? this.human : this.officer;
    this.state.playerX = activePlayer.position.x;
    this.state.playerZ = activePlayer.position.z;
    this.state.officerX = this.officer.position.x;
    this.state.officerZ = this.officer.position.z;
    this.state.heading = 0;
    this.human.rotation.y = 0;
    this.officer.rotation.y = 0;
    this.npcVendor.rotation.y = 0;
    this.recoilVx = 0;
    this.recoilVz = 0;
    this.driftVx = 0;
    this.driftVz = 0;
    this.cameraShake = 0;
    this.trafficHitCooldown = 0;
    this.wallBumpCooldown = 0;
    this.cameraYaw = 0;
    this.cameraPitch = 0.38;
    this.cameraDistance = 10.5;
    this.currentSpeed = 0;
    this.mouseMovedRecently = 0;
    this.damage.reset();
    this.stamina.reset(isVendor ? 1 : 3);
    this.stats.reset(mode, normalizedDay);
    this.lastRunStats = null;
    this.syncDayAccountingState();
    this.weather?.reset();
    this.clearInputs();
    this.clock.getDelta();
    this.acc = 0;
    this.playBeep(520, 0.2);
    setTimeout(() => this.renderer.domElement.focus(), 15);
    this.publishState(true);
  }

  vector2(a: { x: number; z: number }, b: { x: number; z: number }) {
    return Math.hypot(a.x - b.x, a.z - b.z);
  }

  distanceToCustomer() {
    if (!this.pedestrianManager) return { nearest: null, d: 99 };
    const { pedestrian, distance } = this.pedestrianManager.getNearestPedestrian(
      this.human.position.x,
      this.human.position.z
    );
    return { nearest: pedestrian, d: distance };
  }

  beginSale() {
    if (!this.state || this.state.stage !== 'playing' || (this.state.mode === 'vendor' && this.dayEnded)) {
      return;
    }
    const isVendor = this.state.mode === 'vendor' || this.state.mode === 'online_vendor';
    if (
      !isVendor ||
      this.state.sale ||
      this.state.repairing ||
      this.state.restocking ||
      this.state.stock <= 0 ||
      this.state.cooldown > 0
    ) {
      return;
    }
    if (this.damage.broken) {
      this.onEvent('notify', 'Thela broken — press Repair');
      return;
    }
    const { nearest, d } = this.distanceToCustomer();
    if (d > 4.8 || !nearest) {
      this.onEvent('notify', 'Get closer to a pedestrian on the sidewalk to sell (ফুটপাতের ক্রেতার কাছে যান)');
      return;
    }
    nearest.isEngagedInSale = true;
    const dx = this.human.position.x - nearest.mesh.position.x;
    const dz = this.human.position.z - nearest.mesh.position.z;
    // Orientation fix: customer faces the vendor directly and keeps heading synced
    nearest.heading = Math.atan2(dx, -dz);
    nearest.mesh.rotation.y = -nearest.heading;

    const productNames = ['আম', 'কলা', 'পেয়ারা', 'সবজি', 'চা', 'ফুচকা', 'পেয়াজ'];
    const seconds = 5 + Math.random() * 5;
    const product = productNames[(Math.random() * productNames.length) | 0];
    const price = Math.max(20, Math.round((23 + seconds * 9 + (Math.random() * 31 - 14)) * (1 + (this.state.level - 1) * 0.28)));
    this.state.sale = { seconds, start: this.state.time, price, product, customer: nearest };
    this.playBeep(600, 0.15);
    this.onEvent('notify', `${nearest.archetype.bnName} কিনছেন · ${product} · ৳${price}`);
    this.publishState(true);
  }

  completeSale() {
    if (!this.state || this.state.stage !== 'playing' || (this.state.mode === 'vendor' && this.dayEnded)) {
      return;
    }
    const s = this.state.sale;
    if (!s) return;
    if (s.customer) {
      s.customer.isEngagedInSale = false;
      s.customer.summonUntil = 0;
    }
    this.state.cash += s.price;
    this.state.total += s.price;
    this.state.stock--;
    this.state.sales++;
    this.stats.recordSale(s.product, s.price);
    this.syncDayAccountingState();
    this.state.heat = Math.min(100, this.state.heat + 18 + this.state.level * 3.7);
    this.state.sale = null;
    this.playBeep(880, 0.2, 'triangle');
    this.onEvent('notify', `Sold ${s.product} · +৳${s.price}! Police attention rising.`);
    this.publishState(true);
  }

  /** Upgrades are done by the mechanic: only inside a garage's ring. */
  private atGarageForUpgrade(): boolean {
    if (this.state.nearGarage) return true;
    this.onEvent('notify', `আপগ্রেড শুধু গ্যারেজে — ${Math.round(this.state.garageDistance ?? 0)}m দূরে`);
    return false;
  }

  upgradeCart() {
    if (!this.state || this.state.stage !== 'playing' || (this.state.mode === 'vendor' && this.dayEnded)) {
      return;
    }
    const isVendor = this.state.mode === 'vendor' || this.state.mode === 'online_vendor';
    if (!isVendor) return;
    if (!this.atGarageForUpgrade()) return;
    if (this.state.level >= 12) {
      this.onEvent('notify', 'Maximum cart level reached.');
      return;
    }
    const cost = 130 + this.state.level * 85;
    if (this.state.cash < cost) {
      this.onEvent('notify', `Need ৳${cost} to upgrade, you have ৳${this.state.cash}.`);
      return;
    }
    this.state.cash -= cost;
    this.state.level++;
    this.state.cap += 3;
    this.state.stock += 3;
    this.stats.spentCartUpgrades += cost;
    this.stats.cartLevel = this.state.level;
    this.syncDayAccountingState();
    this.playBeep(750, 0.25);
    this.onEvent('notify', `Cart level ${this.state.level}! Capacity ${this.state.cap}.`);
    this.publishState(true);
  }

  upgradeStamina() {
    if (!this.state || this.state.stage !== 'playing' || (this.state.mode === 'vendor' && this.dayEnded)) {
      return;
    }
    const isVendor = this.state.mode === 'vendor' || this.state.mode === 'online_vendor';
    if (!isVendor) return;
    if (!this.atGarageForUpgrade()) return;
    if (this.stamina.level >= 5) {
      this.onEvent('notify', 'স্ট্যামিনা সর্বোচ্চ লেভেলে');
      return;
    }
    const cost = this.stamina.nextUpgradeCost ?? 0;
    if (this.state.cash < cost) {
      this.onEvent('notify', `টাকা কম — ৳${cost} লাগবে`);
      return;
    }
    const paid = this.stamina.upgrade(this.state.cash);
    if (paid > 0) {
      this.state.cash -= paid;
      this.stats.spentStaminaUpgrades += paid;
      this.stats.staminaLevel = this.stamina.level;
      this.syncDayAccountingState();
      this.state.stamina = Math.round(this.stamina.stamina);
      this.state.staminaLevel = this.stamina.level;
      this.state.staminaUpgradeCost = this.stamina.nextUpgradeCost;
      this.state.exhausted = this.stamina.exhausted;
      this.playBeep(780, 0.22);
      this.onEvent('notify', `স্ট্যামিনা লেভেল ${this.stamina.level}! দৌড়: ${this.stamina.sprintSeconds}s`);
      this.publishState(true);
    }
  }

  restockCart() {
    if (!this.state || this.state.stage !== 'playing' || (this.state.mode === 'vendor' && this.dayEnded)) {
      return;
    }
    const isVendor = this.state.mode === 'vendor' || this.state.mode === 'online_vendor';
    if (!isVendor || this.state.sale || this.state.repairing || this.state.restocking) return;
    const { entrance, distance } = this.nearestAarotInfo(this.human.position.x, this.human.position.z);
    if (distance > 4.5) {
      this.onEvent('notify', `আড়তে যান — ${Math.round(distance)}m দূরে`);
      return;
    }
    const needed = this.state.cap - this.state.stock;
    const cost = needed * 7;
    if (needed === 0) {
      this.onEvent('notify', 'মাল ভর্তি আছে');
      return;
    }
    if (cost > this.state.cash) {
      this.onEvent('notify', `টাকা কম — রিস্টকে ৳${cost} লাগবে`);
      return;
    }
    this.state.restocking = {
      seconds: 2.5,
      start: this.state.time,
      cost,
      needed,
      entrance
    };
    this.currentSpeed = 0;
    this.playBeep(440, 0.12);
    this.publishState(true);
  }

  placeStall() {
    if (!this.state || this.state.stage !== 'playing' || (this.state.mode === 'vendor' && this.dayEnded)) {
      return;
    }
    const isVendor = this.state.mode === 'vendor' || this.state.mode === 'online_vendor';
    if (!isVendor) return;
    if (this.state.level < 10) {
      this.onEvent('notify', 'Unlock large food stall at cart level 10.');
      return;
    }
    if (this.state.stall) {
      this.onEvent('notify', 'Your large stall is already placed.');
      return;
    }
    
    // Create large stall 3D mesh in front of the cart
    const stallX = this.human.position.x + Math.sin(this.state.heading) * 3.2;
    const stallZ = this.human.position.z - Math.cos(this.state.heading) * 3.2;
    
    const matte = (color: string, roughness = 0.92) => new THREE.MeshStandardMaterial({ color, roughness });
    const g = new THREE.Group();
    g.position.set(stallX, 0, stallZ);
    g.rotation.y = -this.state.heading;
    const box = new THREE.Mesh(new THREE.BoxGeometry(4.5, 1.2, 3.0), matte('#a87843'));
    box.position.set(0, 0.9, 0);
    box.castShadow = true;
    g.add(box);

    const roof = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.4, 3.6), matte('#c54f3c'));
    roof.position.set(0, 4.0, 0);
    roof.castShadow = true;
    g.add(roof);

    this.scene.add(g);
    this.state.stall = g;
    this.state.heat = 100;

    // Register large stall into collision system
    this.addObstacle({
      type: 'box',
      x: stallX,
      z: stallZ,
      hw: 2.6,
      hd: 1.8,
      tag: 'big_stall'
    });

    this.playBeep(300, 0.3, 'sawtooth');
    this.onEvent('notify', 'Large food stall opened! High enforcement risk.');
    this.publishState(true);
  }

  getNetState() {
    const isVendor = this.state.mode === 'vendor' || this.state.mode === 'online_vendor';
    const actor = isVendor ? this.human : this.officer;
    return {
      x: actor.position.x,
      z: actor.position.z,
      heading: this.state.heading,
      speed: this.currentSpeed,
      cash: isVendor ? this.state.cash : this.state.policeCash,
      stock: this.state.stock,
      heat: this.state.heat,
      alert: this.state.alert
    };
  }

  applyRemoteUpdate(msg: any) {
    if (!msg || typeof msg !== 'object') return;
    const x = msg.pos?.x;
    const z = msg.pos?.z;
    const heading =
      typeof msg.heading === 'number' && Number.isFinite(msg.heading) ? msg.heading : 0;
    const speed =
      typeof msg.speed === 'number' && Number.isFinite(msg.speed) ? msg.speed : 0;
    if (
      typeof x === 'number' &&
      Number.isFinite(x) &&
      typeof z === 'number' &&
      Number.isFinite(z)
    ) {
      this.remote.push({
        x,
        z,
        heading,
        speed,
        t: performance.now()
      });
      this.remoteActive = true;
    }

    if (this.state.mode === 'online_police') {
      if (typeof msg.cash === 'number' && Number.isFinite(msg.cash)) {
        this.state.cash = msg.cash;
      }
      if (typeof msg.stock === 'number' && Number.isFinite(msg.stock)) {
        this.state.stock = msg.stock;
      }
      if (typeof msg.heat === 'number' && Number.isFinite(msg.heat)) {
        this.state.heat = msg.heat;
      }
      if (typeof msg.alert === 'boolean') {
        this.state.alert = msg.alert;
      }
    }
  }

  triggerCaught() {
    if (
      this.state.mode !== 'online_vendor' ||
      this.state.stage !== 'playing' ||
      this.isMenuOrModalOpen
    ) {
      return;
    }
    if (this.state.sale) {
      if (this.state.sale.customer) {
        this.state.sale.customer.isEngagedInSale = false;
        this.state.sale.customer.summonUntil = 0;
      }
      this.state.sale = null;
    }
    this.stats.timesCaught++;
    this.isMenuOrModalOpen = true;
    this.clearInputs();
    this.onEvent('bribe_prompt');
    this.publishState(true);
  }

  receiveOnlineBribe(amount: number) {
    if (this.state.mode !== 'online_police') return;
    const paid =
      typeof amount === 'number' && Number.isFinite(amount) && amount > 0
        ? Math.round(amount)
        : 90 + this.state.level * 45;
    this.state.policeCash += paid;
    this.state.integrity = Math.max(0, this.state.integrity - 20);
    this.state.heat = 0;
    this.state.alert = false;
    this.playBeep(660, 0.18, 'triangle');
    this.onEvent('notify', `ঘুষ পেলেন · +৳${paid}`);
    this.publishState(true);
  }

  receiveOnlineVictory() {
    if (this.state.mode !== 'online_police' || this.state.stage !== 'playing') return;
    this.state.arrests++;
    this.state.integrity = Math.min(100, this.state.integrity + 2);
    this.state.rank = Math.min(4, 1 + Math.floor(this.state.arrests / 2));
    this.stats.arrests = this.state.arrests;
    this.onEvent('notify', 'বিক্রেতা জেলে গেছে · জিতেছেন! · Vendor jailed — Victory!');
    this.endRun('victory');
  }

  arrestVendor() {
    if (this.state.mode === 'online_police') {
      const d = this.vector2(this.officer.position, this.human.position);
      if (!this.remoteActive || d > 2.6) {
        this.onEvent('notify', 'Move close to the vendor before arresting.');
        return;
      }
      this.onEvent('arrest_attempt');
      return;
    }
    if (this.state.mode !== 'police') return;
    const d = this.vector2(this.officer.position, this.npcVendor.position);
    if (d > 3.4) {
      this.onEvent('notify', 'Move close to the vendor before arresting.');
      return;
    }
    this.onEvent('police_decision');
  }

  /**
   * Complete the solo-vendor working day at 22:00 (720 active seconds).
   * Cancels pending timers, settles ৳50 rent + ৳40 food once, freezes stats, and ends the day.
   */
  private completeWorkingDay() {
    if (this.dayEnded || !this.state || this.state.mode !== 'vendor' || this.state.stage !== 'playing') {
      return;
    }
    this.dayEnded = true;
    this.state.dayElapsedSeconds = DAY_DURATION_SECONDS;
    this.state.dayClockText = formatDayClock(DAY_DURATION_SECONDS);
    this.cancelActiveTimers();

    if (this.stats.settleDayCosts(DAY_RENT_COST, DAY_FOOD_COST)) {
      this.state.cash -= DAY_FIXED_COST;
    }
    this.syncDayAccountingState();

    const outcome = evaluateDayOutcome(this.stats.currentProfit(), this.state.dayNumber);
    this.endRun(outcome.result);
  }

  endRun(result: Exclude<RunResult, null>) {
    this.cancelActiveTimers();
    this.state.damage = this.damage.damage;
    this.state.stage = 'over';
    this.clearInputs();
    this.syncDayAccountingState();
    const snapshot = this.stats.snapshot({
      cartLevel: this.state.level,
      staminaLevel: this.state.staminaLevel,
      dayNumber: this.state.dayNumber,
      dayTarget: this.state.dayTarget,
      mode: this.state.mode,
      result,
      arrests: this.state.arrests
    });
    this.lastRunStats = snapshot;
    this.publishState(true);
    this.onEvent('game_over', snapshot);
  }

  payBribe(): boolean {
    if (!this.state || (this.state.mode === 'vendor' && this.dayEnded)) {
      return false;
    }
    const cost = 90 + this.state.level * 45;
    if (this.state.cash < cost) {
      this.endRun('bribe_unaffordable');
      return false;
    }
    this.state.cash -= cost;
    this.state.heat = 0;
    this.state.alert = false;
    this.state.escape = 0;
    this.state.cooldown = 10;
    if (this.state.sale) {
      if (this.state.sale.customer) {
        this.state.sale.customer.isEngagedInSale = false;
        this.state.sale.customer.summonUntil = 0;
      }
      this.state.sale = null;
    }
    if (this.state.mode !== 'online_vendor') {
      if (this.world) {
        const op = this.footpathPoint(this.human.position.x, this.human.position.z, 30, 45);
        this.officer.position.set(op.x, 0, op.z);
      } else {
        this.officer.position.set(
          this.human.position.x + 26,
          0,
          this.human.position.z - 22
        );
      }
      this.state.officerX = this.officer.position.x;
      this.state.officerZ = this.officer.position.z;
    }
    this.stats.spentBribes += cost;
    this.stats.bribesPaid++;
    this.syncDayAccountingState();
    this.resumeGame();
    this.onEvent('notify', 'ঘুষ দিয়ে ছাড়া পেলেন · ৳' + cost);
    return true;
  }

  goToJail() {
    this.endRun('jailed');
  }

  recordArrest() {
    this.state.arrests++;
    this.state.integrity = Math.min(100, this.state.integrity + 2);
    this.respawnNpcVendor();
    this.state.rank = Math.min(4, 1 + Math.floor(this.state.arrests / 2));
    this.stats.arrests = this.state.arrests;
    this.resumeGame();
    this.onEvent('notify', 'Lawful arrest recorded. Promotion progress updated.');
  }

  takeIllicit() {
    this.state.policeCash += 150;
    this.state.integrity = Math.max(0, this.state.integrity - 20);
    this.respawnNpcVendor();
    this.resumeGame();
    this.onEvent('notify', 'Illicit payment received. Integrity decreased.');
  }

  cycleCameraView() {
    if (this.cameraDistance < 9.0) {
      this.cameraDistance = 13.5;
      this.cameraPitch = 0.46;
      this.onEvent('notify', 'Camera: Far Chase (দূরে)');
    } else if (this.cameraDistance < 18.0) {
      this.cameraDistance = 22.0;
      this.cameraPitch = 1.15;
      this.onEvent('notify', 'Camera: High Top-Down (উপর থেকে)');
    } else {
      this.cameraDistance = 6.8;
      this.cameraPitch = 0.32;
      this.onEvent('notify', 'Camera: Close Chase (কাছে)');
    }
    this.mouseMovedRecently = 0;
  }

  setHeldAction(action: ActionName, held: boolean) {
    if (!this.state || this.state.stage !== 'playing' || this.isMenuOrModalOpen) {
      this.heldActions.delete(action);
      return;
    }
    this.resumeAudio();
    if (held) {
      this.heldActions.add(action);
    } else {
      this.heldActions.delete(action);
    }
  }

  handleAction(action: string) {
    if (!this.state || this.state.stage !== 'playing' || this.isMenuOrModalOpen) return;
    if (this.state.mode === 'vendor' && this.dayEnded) return;
    const isVendor = this.state.mode === 'vendor' || this.state.mode === 'online_vendor';
    const isPolice = this.state.mode === 'police' || this.state.mode === 'online_police';

    if (action === 'sell' || action === 'arrest' || action === 'interact') {
      if (isVendor) this.beginSale();
      else if (isPolice) this.arrestVendor();
    } else if (action === 'upgrade') {
      this.upgradeCart();
    } else if (action === 'upgradeStamina' || action === 'upgrade_stamina') {
      this.upgradeStamina();
    } else if (action === 'restock') {
      this.restockCart();
    } else if (action === 'placeStall' || action === 'place_stall') {
      this.placeStall();
    } else if (action === 'changeView' || action === 'change_view') {
      this.cycleCameraView();
    } else if (action === 'repair') {
      if (this.state.repairing || this.state.sale || this.state.restocking) return;
      const p = isVendor ? this.human : this.officer;
      const { entrance, distance } = this.nearestGarageInfo(p.position.x, p.position.z);
      if (distance > 4.5) {
        this.onEvent('notify', isVendor ? `গ্যারেজে যান — ${Math.round(distance)}m দূরে` : `হাসপাতালে যান — ${Math.round(distance)}m দূরে`);
        return;
      }
      if (this.damage.damage <= 0) {
        this.onEvent('notify', isVendor ? 'No damage — vehicle in good shape' : 'সুস্থ আছেন — চিকিৎসার দরকার নেই');
        return;
      }
      const cost = this.damage.repairCost(this.state.level);
      const currentCash = isVendor ? this.state.cash : this.state.policeCash;
      if (currentCash < cost) {
        this.onEvent('notify', isVendor ? `টাকা কম — মেরামতে ৳${cost} লাগবে` : `টাকা কম — চিকিৎসায় ৳${cost} লাগবে`);
        return;
      }
      this.state.repairing = {
        seconds: 3,
        start: this.state.time,
        cost,
        entrance
      };
      this.currentSpeed = 0;
      this.playBeep(420, 0.12);
      this.publishState(true);
    } else if (action === 'cycleWeather' || action === 'weather') {
      if (this.weather) {
        const nextProfile = this.weather.cycleNext();
        this.onEvent('notify', nextProfile.bnNotice);
        this.publishState(true);
      }
    } else if (action === 'pause') {
      this.onEvent('pause');
    }
  }

  publishState(force = false) {
    const now = performance.now();
    if (force || now - this.lastHudPublishTime >= 95) {
      this.lastHudPublishTime = now;
      this.onUpdate({ ...this.state });
    }
  }

  private updateChaseAlert(dist: number, policeSightRange: number) {
    if (
      !this.state.alert &&
      this.state.heat > 27 &&
      this.state.cooldown === 0 &&
      dist < policeSightRange
    ) {
      this.state.alert = true;
      this.stats.chasesStarted++;
    }
  }

  private updateChaseEscape(dt: number, dist: number, policeEscapeDist: number) {
    if (dist > policeEscapeDist) {
      this.state.escape += dt;
      if (this.state.escape > 5) {
        this.state.alert = false;
        this.state.heat = Math.max(0, this.state.heat - 30);
        this.state.cooldown = 11;
        this.state.escape = 0;
        this.stats.chasesEscaped++;
        this.onEvent('notify', 'Escaped police! Stay out of sight.');
        this.publishState(true);
      }
    } else {
      this.state.escape = 0;
    }
  }

  simulate(dt: number) {
    if (!this.state || this.state.stage !== 'playing' || this.isMenuOrModalOpen) return;
    if (this.state.mode === 'vendor' && this.dayEnded) return;
    if (!(dt > 0) || !Number.isFinite(dt)) return;
    this.state.time += dt;
    if (this.state.mode === 'vendor') {
      const nextElapsed = this.state.dayElapsedSeconds + dt;
      this.state.dayElapsedSeconds = clampDayElapsedSeconds(nextElapsed);
      this.state.dayClockText = formatDayClock(this.state.dayElapsedSeconds);
      if (isDayComplete(nextElapsed)) {
        this.stats.timePlayedSeconds += dt;
        this.completeWorkingDay();
        return;
      }
    }
    this.damage.tick(dt);

    // Dampen physics recoil & timers
    if (Math.abs(this.recoilVx) > 0.01 || Math.abs(this.recoilVz) > 0.01) {
      this.recoilVx = THREE.MathUtils.damp(this.recoilVx, 0, 8, dt);
      this.recoilVz = THREE.MathUtils.damp(this.recoilVz, 0, 8, dt);
    }
    if (this.trafficHitCooldown > 0) {
      this.trafficHitCooldown -= dt;
    }
    if (this.wallBumpCooldown > 0) {
      this.wallBumpCooldown -= dt;
    }
    if (this.cameraShake > 0) {
      this.cameraShake = Math.max(0, this.cameraShake - dt * 2.8);
    }

    // Vehicle (tank-style) movement relative to vehicle heading
    const isVendor = this.state.mode === 'vendor' || this.state.mode === 'online_vendor';
    const p = isVendor ? this.human : this.officer;

    // Update dynamic weather (sunny <-> rainy <-> foggy) & notify on transition
    if (this.weather) {
      const changedProfile = this.weather.update(dt, p.position.x, p.position.z);
      if (changedProfile) {
        this.onEvent('notify', changedProfile.bnNotice);
        this.publishState(true);
      }
    }

    const accelGrip = this.weather ? this.weather.accelGrip : 1;
    const turnGrip = this.weather ? this.weather.turnGrip : 1;
    const weatherSpeedMult = this.weather ? this.weather.speedMultiplier : 1;
    const traction = this.weather ? this.weather.traction : 1;

    // Steering: turnLeft / turnRight rotate heading (affected by surface turnGrip and stamina fatigue)
    const isLocked = Boolean(this.state.repairing || this.state.restocking);
    const staminaTurnScale = 0.75 + 0.25 * this.stamina.speedFactor;
    const turnRate = (isVendor ? 2.2 : 3.2) * turnGrip * staminaTurnScale;
    let turnInput = isLocked
      ? 0
      : (this.heldActions.has('turnRight') ? 1 : 0) - (this.heldActions.has('turnLeft') ? 1 : 0);

    // Natural steering when reversing a cart
    const isMovingBackward = !isLocked && this.heldActions.has('backward') && !this.heldActions.has('forward');
    if (isMovingBackward) {
      turnInput = -turnInput;
    }

    if (turnInput !== 0) {
      // Wet/slippery road lateral drift when turning at speed
      if (traction < 0.92 && Math.abs(this.currentSpeed) > 1.8) {
        const slip = (1 - traction) * Math.abs(this.currentSpeed) * 0.42;
        const sideX = Math.cos(this.state.heading) * turnInput;
        const sideZ = Math.sin(this.state.heading) * turnInput;
        this.driftVx = THREE.MathUtils.damp(this.driftVx, sideX * slip, 4, dt);
        this.driftVz = THREE.MathUtils.damp(this.driftVz, sideZ * slip, 4, dt);
      }
      this.state.heading += turnInput * turnRate * dt;
      while (this.state.heading > Math.PI) this.state.heading -= Math.PI * 2;
      while (this.state.heading < -Math.PI) this.state.heading += Math.PI * 2;
    }

    // Dampen lateral drift based on road traction
    const driftDamp = 3.2 + traction * 5.5;
    this.driftVx = THREE.MathUtils.damp(this.driftVx, 0, driftDamp, dt);
    this.driftVz = THREE.MathUtils.damp(this.driftVz, 0, driftDamp, dt);

    // Speed along heading: forward (with 1.65x sprint multiplier) or backward (55% speed)
    const wasExhausted = this.stamina.exhausted;
    const wantsSprint = !isLocked && this.heldActions.has('sprint');
    const canSprint = this.stamina.update(
      dt,
      wantsSprint,
      !isLocked && this.heldActions.has('forward'),
      !isLocked && Math.abs(this.currentSpeed) > 0.3
    );
    if (!wasExhausted && this.stamina.exhausted) {
      this.playBeep(210, 0.18, 'sawtooth');
      this.onEvent('notify', 'হাঁপিয়ে গেছেন! একটু জিরিয়ে নিন');
      this.publishState(true);
    }
    const baseSpeed = isVendor ? 4.85 : 5.85;

    let targetSpeed = 0;
    if (!isLocked) {
      if (this.heldActions.has('forward')) {
        targetSpeed = baseSpeed * (canSprint ? 1.65 : 1.0) * this.stamina.speedFactor;
      } else if (this.heldActions.has('backward')) {
        targetSpeed = -baseSpeed * 0.55 * this.stamina.speedFactor;
      }
      targetSpeed *= this.damage.speedFactor * weatherSpeedMult;
    }

    // Road traction controls how quickly the vehicle accelerates and brakes
    this.currentSpeed = isLocked
      ? 0
      : THREE.MathUtils.damp(this.currentSpeed, targetSpeed, 8 * accelGrip, dt);

    // Forward motion vector along character's current heading + wet-road lateral drift
    const moveHeadingX = Math.sin(this.state.heading);
    const moveHeadingZ = -Math.cos(this.state.heading);

    const vx = (moveHeadingX * this.currentSpeed + this.recoilVx + this.driftVx) * dt;
    const vz = (moveHeadingZ * this.currentSpeed + this.recoilVz + this.driftVz) * dt;

    const prevX = p.position.x;
    const prevZ = p.position.z;

    // Advanced collision resolution with wall-sliding and dual-collider thela rig
    const moveRes = resolveMovement(
      p.position.x,
      p.position.z,
      vx,
      vz,
      this.state.heading,
      isVendor,
      this.nearObstacles(p.position.x, p.position.z),
      this.mapBound(110)
    );

    p.position.x = moveRes.newX;
    p.position.z = moveRes.newZ;
    // CRITICAL ORIENTATION FIX: Set rotation.y = -heading so the model faces (sin h, 0, -cos h)
    p.rotation.y = -this.state.heading;
    this.state.speed = this.currentSpeed;

    this.stats.distanceMetres += Math.hypot(p.position.x - prevX, p.position.z - prevZ);
    if (canSprint) {
      this.stats.sprintSeconds += dt;
    }
    this.stats.timePlayedSeconds += dt;

    // Wall / static obstacle collision response & sound
    if (moveRes.collided && Math.abs(this.currentSpeed) > 2.2 && this.wallBumpCooldown <= 0) {
      this.wallBumpCooldown = 0.25;
      this.cameraShake = 0.18;
      this.playThud(0.6);
      const impactPointX = p.position.x + moveHeadingX * (isVendor ? 1.6 : 0.6);
      const impactPointZ = p.position.z + moveHeadingZ * (isVendor ? 1.6 : 0.6);
      this.spawnCollisionParticles(impactPointX, 0.5, impactPointZ, '#d4c29a', 6);
    }

    // Dynamic Traffic collision detection & damage
    const trafficHit = checkVehicleImpact(
      p.position.x,
      p.position.z,
      moveHeadingX,
      moveHeadingZ,
      this.currentSpeed,
      isVendor,
      this.traffic
    );
    if (trafficHit.hit && this.trafficHitCooldown <= 0) {
      this.trafficHitCooldown = 0.65;
      this.cameraShake = 0.5;
      this.recoilVx = trafficHit.impulseX;
      this.recoilVz = trafficHit.impulseZ;
      this.playRickshawBell();
      this.playThud(0.85);
      this.spawnCollisionParticles(trafficHit.impactX, 0.9, trafficHit.impactZ, '#f24e38', 12);

      if (this.state.sale) {
        if (this.state.sale.customer) {
          this.state.sale.customer.isEngagedInSale = false;
          this.state.sale.customer.summonUntil = 0;
        }
        this.state.sale = null;
      }

      const added = this.damage.applyImpact(trafficHit);
      this.state.damage = this.damage.damage;
      if (added > 0) {
        this.stats.collisions++;
        this.stats.damageTaken += added;
        if (isVendor && this.damage.broken) {
          this.onEvent('notify', 'ঠেলা সম্পূর্ণ ভেঙে গেছে! · Cart completely destroyed!');
          this.endRun('destroyed');
          return;
        }
        const kind = trafficHit.vehicle?.kind || 'vehicle';
        const cost = this.damage.repairCost(this.state.level);
        this.onEvent('notify', `Hit by ${kind}! Damage +${added}% · Repair ৳${cost}`);
      } else {
        if (isVendor && this.damage.broken) {
          this.onEvent('notify', 'ঠেলা সম্পূর্ণ ভেঙে গেছে! · Cart completely destroyed!');
          this.endRun('destroyed');
          return;
        }
        this.onEvent('notify', 'Watch out! Traffic collision!');
      }
      this.publishState(true);
    }

    if (this.mouseMovedRecently > 0) {
      this.mouseMovedRecently = Math.max(0, this.mouseMovedRecently - dt);
    }

    // Remote opponent pose interpolation (Online 1v1 modes)
    let sampledRemoteSpeed = 0;
    if (
      (this.state.mode === 'online_vendor' || this.state.mode === 'online_police') &&
      this.remoteActive
    ) {
      const remotePose = this.remote.sample(performance.now());
      if (remotePose) {
        const remoteActor = this.state.mode === 'online_vendor' ? this.officer : this.human;
        remoteActor.position.x = remotePose.x;
        remoteActor.position.z = remotePose.z;
        remoteActor.rotation.y = -remotePose.heading;
        sampledRemoteSpeed = Math.abs(remotePose.speed);
      }
    }
    this.remoteSpeed = sampledRemoteSpeed;

    // AI Police pursuit & navigation with collision resolution (Solo Vendor Mode)
    const visibilityFactor = this.weather ? this.weather.visibilityFactor : 1;
    const policeSightRange = 55 * visibilityFactor;
    const policeEscapeDist = 30 * visibilityFactor;

    if (this.state.mode === 'vendor') {
      const distBefore = this.vector2(this.human.position, this.officer.position);
      this.updateChaseAlert(distBefore, policeSightRange);
      _toHuman.subVectors(this.human.position, this.officer.position);
      const dist = _toHuman.length();
      if (this.state.alert) {
        _officerDir.copy(_toHuman);
        _officerDir.y = 0;
        _officerDir.normalize();

        const officerSpeed = Math.min(dist, 1) * 3.55 * weatherSpeedMult;
        const officerVx = _officerDir.x * officerSpeed * dt;
        const officerVz = _officerDir.z * officerSpeed * dt;
        const officerHeading = Math.atan2(_officerDir.x, -_officerDir.z);

        const aiMove = resolveMovement(
          this.officer.position.x,
          this.officer.position.z,
          officerVx,
          officerVz,
          officerHeading,
          false,
          this.nearObstacles(this.officer.position.x, this.officer.position.z),
          this.mapBound(105)
        );
        this.officer.position.x = aiMove.newX;
        this.officer.position.z = aiMove.newZ;
        // Orientation fix: Officer faces pursuit heading
        this.officer.rotation.y = -officerHeading;

        if (dist < 2.1) {
          if (!this.isMenuOrModalOpen) {
            this.stats.timesCaught++;
            this.isMenuOrModalOpen = true;
            this.clearInputs();
            this.onEvent('bribe_prompt');
          }
          return;
        }
        this.updateChaseEscape(dt, dist, policeEscapeDist);
      } else {
        const angle = this.state.time * 0.3;
        const aiVx = Math.sin(angle) * dt * 1.1;
        const aiVz = Math.cos(angle * 0.7) * dt * 0.9;
        const wanderHeading = Math.atan2(aiVx, -aiVz);
        const aiMove = resolveMovement(
          this.officer.position.x,
          this.officer.position.z,
          aiVx,
          aiVz,
          wanderHeading,
          false,
          this.nearObstacles(this.officer.position.x, this.officer.position.z),
          this.mapBound(100)
        );
        this.officer.position.x = aiMove.newX;
        this.officer.position.z = aiMove.newZ;
        // Orientation fix: Wander officer facing
        this.officer.rotation.y = -wanderHeading;
      }
    } else if (this.state.mode === 'online_vendor' && this.remoteActive) {
      const dist = this.vector2(this.human.position, this.officer.position);
      this.updateChaseAlert(dist, policeSightRange);
      if (this.state.alert) {
        this.updateChaseEscape(dt, dist, policeEscapeDist);
      }
    } else if (this.state.mode === 'police') {
      // Police mode: AI Vendor movement with collision resolution
      const t = this.state.time;
      const d = this.vector2(this.officer.position, this.npcVendor.position);
      let targetDx = 0;
      let targetDz = 0;
      let aiSpeed = 2.2;

      if (d < 13) {
        let dx = this.npcVendor.position.x - this.officer.position.x;
        let dz = this.npcVendor.position.z - this.officer.position.z;
        const n = Math.hypot(dx, dz) || 1;
        targetDx = dx / n;
        targetDz = dz / n;
        aiSpeed = 3.8;
      } else {
        targetDx = Math.sin(t * 0.58);
        targetDz = Math.cos(t * 0.34);
      }

      const vendorVx = targetDx * aiSpeed * dt;
      const vendorVz = targetDz * aiSpeed * dt;
      const vendorHeading = Math.atan2(targetDx, -targetDz);

      const aiVendorMove = resolveMovement(
        this.npcVendor.position.x,
        this.npcVendor.position.z,
        vendorVx,
        vendorVz,
        vendorHeading,
        true,
        this.nearObstacles(this.npcVendor.position.x, this.npcVendor.position.z),
        this.mapBound(104)
      );
      this.npcVendor.position.x = aiVendorMove.newX;
      this.npcVendor.position.z = aiVendorMove.newZ;
      // Orientation fix: NPC vendor faces travel heading
      this.npcVendor.rotation.y = -vendorHeading;
    }

    // Update walk cycles & limb poses for realistic human figures
    const isVendorPlayer = this.state.mode === 'vendor' || this.state.mode === 'online_vendor';
    const vendorSpeed = isVendorPlayer
      ? Math.abs(this.currentSpeed)
      : this.state.mode === 'online_police' && this.remoteActive
      ? this.remoteSpeed
      : 0;
    this.vendorPhase += vendorSpeed * dt * 2.2;
    if (this.human.userData.rig) {
      const vendorIntensity =
        Math.min(1, vendorSpeed / 5) *
        (isVendorPlayer ? (this.stamina.exhausted ? 0.55 : this.stamina.speedFactor) : 1);
      animateHuman(this.human.userData.rig, this.vendorPhase, vendorIntensity, true, dt);
      if (isVendorPlayer && (this.stamina.exhausted || this.stamina.stamina < 35)) {
        this.human.userData.rig.body.rotation.x -= this.stamina.exhausted ? 0.12 : 0.06;
      }
    }

    let officerSpeed = 0;
    if (!isVendorPlayer) {
      officerSpeed = Math.abs(this.currentSpeed);
    } else if (this.state.mode === 'online_vendor' && this.remoteActive) {
      officerSpeed = this.remoteSpeed;
    } else if (this.state.mode === 'vendor') {
      if (this.state.alert) {
        _toHuman.subVectors(this.human.position, this.officer.position);
        officerSpeed = Math.min(_toHuman.length(), 1) * 3.55;
      } else {
        const angle = this.state.time * 0.3;
        officerSpeed = Math.hypot(Math.sin(angle) * 1.1, Math.cos(angle * 0.7) * 0.9);
      }
    }
    this.officerPhase += officerSpeed * dt * 2.2;
    if (this.officer.userData.rig) {
      const officerIntensity =
        Math.min(1, officerSpeed / 5) *
        (!isVendorPlayer ? (this.stamina.exhausted ? 0.55 : this.stamina.speedFactor) : 1);
      animateHuman(this.officer.userData.rig, this.officerPhase, officerIntensity, false, dt);
      if (!isVendorPlayer && (this.stamina.exhausted || this.stamina.stamina < 35)) {
        this.officer.userData.rig.body.rotation.x -= this.stamina.exhausted ? 0.12 : 0.06;
      }
    }

    let npcSpeed = 0;
    if (this.state.mode === 'police') {
      const d = this.vector2(this.officer.position, this.npcVendor.position);
      npcSpeed = d < 13 ? 3.8 : 2.2;
    }
    this.npcPhase += npcSpeed * dt * 2.2;
    if (this.npcVendor.userData.rig) {
      animateHuman(this.npcVendor.userData.rig, this.npcPhase, Math.min(1, npcSpeed / 5), true, dt);
    }

    // Update A* Sidewalk Pedestrian crowd
    if (this.pedestrianManager) {
      this.pedestrianManager.update(dt);
      this.updateHotspotCrowd(dt, p);
      // Hide pedestrians far from the camera (they keep walking; they just aren't drawn)
      const cam = this.camera.position;
      for (const ped of this.pedestrianManager.pedestrians) {
        ped.mesh.visible = Math.hypot(ped.mesh.position.x - cam.x, ped.mesh.position.z - cam.z) < PEDESTRIAN_VIEW_DISTANCE;
      }

      this.crowdCharacters.update(this.customers, this.camera.position, this.qualityLevel, dt);

      for (const ped of this.pedestrianManager.pedestrians) {
        const distToPlayer = this.vector2(p.position, ped.mesh.position);
        if (distToPlayer < 1.25 && distToPlayer > 0.01) {
          const pushX = (ped.mesh.position.x - p.position.x) / distToPlayer;
          const pushZ = (ped.mesh.position.z - p.position.z) / distToPlayer;
          ped.mesh.position.x += pushX * dt * 1.5;
          ped.mesh.position.z += pushZ * dt * 1.5;
        }
      }
    }

    if (this.state.cooldown > 0) {
      this.state.cooldown = Math.max(0, this.state.cooldown - dt);
    }

    // Sale timer check
    if (this.state.sale) {
      const s = this.state.sale;
      const elapsed = this.state.time - s.start;
      if (this.vector2(this.human.position, s.customer.mesh.position) > 6 || this.state.alert) {
        if (s.customer) {
          s.customer.isEngagedInSale = false;
          s.customer.summonUntil = 0;
        }
        this.state.sale = null;
        this.stats.salesInterrupted++;
        this.playBeep(220, 0.2, 'sawtooth');
        this.onEvent('notify', 'Sale interrupted — no payment.');
        this.publishState(true);
      } else if (elapsed >= s.seconds) {
        this.completeSale();
      }
    }

    if (this.state.mode === 'vendor' || this.state.mode === 'online_vendor') {
      if (!this.state.alert && this.state.heat > 0) {
        this.state.heat = Math.max(0, this.state.heat - dt * 0.9);
      }
      if (this.state.stall && Math.random() < dt * 0.08) {
        this.state.cash += 45;
        this.state.total += 45;
        this.stats.recordSale('বড় দোকান · Stall', 45);
        this.syncDayAccountingState();
        this.publishState(true);
      }
    }

    // Traffic motion
    if (this.graphTraffic) this.graphTraffic.update(dt, p.position.x, p.position.z);
    else updateTraffic(this.traffic, dt, p.position.x, p.position.z);

    // Particle updates
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const pt = this.particles[i];
      pt.life += dt;
      pt.mesh.position.x += pt.vx * dt;
      pt.mesh.position.y += pt.vy * dt;
      pt.mesh.position.z += pt.vz * dt;
      pt.vy -= 9.8 * dt; // gravity

      const progress = pt.life / pt.maxLife;
      const scale = Math.max(0.01, 1 - progress);
      pt.mesh.scale.set(scale, scale, scale);

      if (pt.life >= pt.maxLife) {
        this.scene.remove(pt.mesh);
        pt.mesh.geometry.dispose();
        this.particles.splice(i, 1);
      }
    }

    // Update spatial ambient audio tracks (traffic, crowd, streetMarket) on every tick
    this.ambientAudio.update(dt, {
      playerX: p.position.x,
      playerZ: p.position.z,
      cameraYaw: this.cameraYaw,
      isPlaying: this.state.stage === 'playing' && !this.isMenuOrModalOpen,
      isPaused: this.state.stage !== 'playing' || this.isMenuOrModalOpen,
      isAlert: this.state.alert,
      isSelling: !!this.state.sale,
      muted: this.muted,
      traffic: this.traffic,
      pedestrians: this.customers,
      playerStall: this.state.stall
        ? { x: this.state.stall.position.x, z: this.state.stall.position.z }
        : null
    });

    // Timed garage repair check
    if (this.state.repairing) {
      const r = this.state.repairing;
      const elapsed = this.state.time - r.start;
      const distToEntrance = Math.hypot(p.position.x - r.entrance.x, p.position.z - r.entrance.z);
      if (distToEntrance > 4.5) {
        this.state.repairing = null;
        this.playBeep(220, 0.2, 'sawtooth');
        this.publishState(true);
      } else if (elapsed >= r.seconds) {
        const currentCash = isVendor ? this.state.cash : this.state.policeCash;
        const costPaid = this.damage.repair(currentCash, this.state.level);
        if (costPaid > 0) {
          if (isVendor) {
            this.state.cash -= costPaid;
          } else {
            this.state.policeCash -= costPaid;
          }
          this.stats.spentRepair += costPaid;
          this.syncDayAccountingState();
          this.state.damage = 0;
          this.state.repairCost = 0;
          this.playBeep(480, 0.2);
          this.onEvent('notify', (this.state.mode === 'vendor' || this.state.mode === 'online_vendor') ? `মেরামত সম্পন্ন · ৳${costPaid}` : `চিকিৎসা সম্পন্ন · ৳${costPaid}`);
        }
        this.state.repairing = null;
        this.publishState(true);
      }
    }

    // Timed aarot restock check
    if (this.state.restocking) {
      const rs = this.state.restocking;
      const elapsed = this.state.time - rs.start;
      const distToEntrance = Math.hypot(p.position.x - rs.entrance.x, p.position.z - rs.entrance.z);
      if (distToEntrance > 4.5) {
        this.state.restocking = null;
        this.playBeep(220, 0.2, 'sawtooth');
        this.publishState(true);
      } else if (elapsed >= rs.seconds) {
        if (this.state.cash >= rs.cost) {
          this.state.cash -= rs.cost;
          this.stats.spentRestock += rs.cost;
          this.syncDayAccountingState();
          this.state.stock = this.state.cap;
          this.playBeep(450, 0.15);
          this.onEvent('notify', `রিস্টক সম্পন্ন · ${rs.needed}টি পণ্য · ৳${rs.cost}`);
        }
        this.state.restocking = null;
        this.publishState(true);
      }
    }

    // Sync damage, garage & aarot proximity, and ambient soundscape state
    const gInfo = this.nearestGarageInfo(p.position.x, p.position.z);
    this.state.nearGarage = gInfo.distance <= 4.5;
    this.state.garageDistance = Math.round(gInfo.distance);
    const aInfo = this.nearestAarotInfo(p.position.x, p.position.z);
    this.state.nearAarot = aInfo.distance <= 4.5;
    this.state.aarotDistance = Math.round(aInfo.distance);
    this.state.damage = this.damage.damage;
    this.state.repairCost = this.damage.repairCost(this.state.level);
    const snap = this.ambientAudio.getSnapshot();
    this.state.ambientZone = snap.zoneLabel;
    this.state.ambientZoneBn = snap.zoneBnLabel;
    this.state.trafficNoise = snap.trafficLevel;
    this.state.crowdNoise = snap.crowdLevel;
    this.state.marketNoise = snap.marketLevel;
    this.state.playerX = p.position.x;
    this.state.playerZ = p.position.z;
    this.state.officerX = this.officer.position.x;
    this.state.officerZ = this.officer.position.z;
    this.state.displayHz = Math.round(this.measuredDisplayFps);
    this.state.stamina = Math.round(this.stamina.stamina);
    this.state.staminaLevel = this.stamina.level;
    this.state.staminaUpgradeCost = isVendor ? this.stamina.nextUpgradeCost : null;
    this.state.exhausted = this.stamina.exhausted;
    if (this.weather) {
      this.state.weather = this.weather.current;
      this.state.weatherLabel = this.weather.profile.label;
      this.state.weatherTraction = Math.round(this.weather.traction * 100);
      this.state.weatherVisibility = Math.round(this.weather.visibilityFactor * 100);
    }
    this.syncDayAccountingState();

    // Throttled publish to React HUD
    this.publishState(false);
  }

  renderLoop() {
    if (this.isDestroyed) return;
    this.animId = requestAnimationFrame(() => this.renderLoop());

    const now = performance.now();

    // Estimate native display refresh rate from median rAF interval over first 60 frames
    if (this.lastRafTime > 0 && this.rafIntervals.length < 60) {
      const rafDelta = now - this.lastRafTime;
      if (rafDelta > 2 && rafDelta < 50) {
        this.rafIntervals.push(rafDelta);
        if (this.rafIntervals.length >= 10) {
          const sorted = [...this.rafIntervals].sort((a, b) => a - b);
          const medianMs = sorted[Math.floor(sorted.length / 2)];
          this.measuredDisplayFps = Math.max(30, Math.min(240, Math.round(1000 / medianMs)));
        }
      }
    }
    this.lastRafTime = now;

    const displayFps = this.measuredDisplayFps;
    // A limit at or above the screen's refresh rate means "no limit".
    const effectiveLimit = this.fpsLimit > 0 && this.fpsLimit < displayFps * 0.95 ? this.fpsLimit : 0;
    if (effectiveLimit > 0) {
      const interval = 1000 / effectiveLimit;
      // Tolerate half a display frame of timing error, otherwise whole frames get skipped.
      if (this.limiterTime > 0 && now - this.limiterTime < interval - 500 / displayFps) return;
      // Keep the limiter on a fixed schedule so the average rate is exact (no drift).
      this.limiterTime = (this.limiterTime === 0 || now - this.limiterTime > interval * 1.5) ? now : this.limiterTime + interval;
    } else {
      this.limiterTime = 0;
    }
    const frameMs = this.lastRenderTime > 0 ? now - this.lastRenderTime : 1000 / 60;
    this.lastRenderTime = now;
    const targetFps = effectiveLimit || displayFps;
    if (this.adaptive.update(frameMs, targetFps)) {
      this.updatePixelRatio();
    }

    // Measure FPS over 500 ms windows
    this.fpsFrameCount++;
    if (this.fpsWindowStart === 0) {
      this.fpsWindowStart = now;
    } else {
      const windowElapsed = now - this.fpsWindowStart;
      if (windowElapsed >= 500) {
        this.currentFps = Math.round((this.fpsFrameCount * 1000) / windowElapsed);
        this.fpsFrameCount = 0;
        this.fpsWindowStart = now;
        if (this.state) {
          this.state.fps = this.currentFps;
          this.state.displayHz = Math.round(this.measuredDisplayFps);
          this.state.renderHeight = Math.round(
            Math.max(1, this.container.clientHeight) * (this.currentPixelRatio || 1)
          );
          this.state.showFps = this.showFps;
          if (!this.state.stage || this.state.stage !== 'playing' || this.isMenuOrModalOpen) {
            this.publishState(false);
          }
        }
      }
    }

    const rawDt = this.clock.getDelta();
    const dt = Math.min(rawDt, 0.1); // Guard against giant delta jumps when returning from tab switch

    if (this.state && this.state.stage === 'playing' && !this.isMenuOrModalOpen) {
      const MAX_STEP = 1 / 60;
      let rem = dt;
      let steps = 0;
      while (rem > 0.0001 && steps < 4) {
        const stepDt = Math.min(rem, MAX_STEP);
        this.simulate(stepDt);
        rem -= stepDt;
        steps++;
      }
      this.acc = 0;
    } else {
      // Paused or in menu: freeze physics accumulator
      this.acc = 0;
    }

    if (this.state && (this.state.stage === 'playing' || this.state.stage === 'paused')) {
      const isVendor = this.state.mode === 'vendor' || this.state.mode === 'online_vendor';
      const p = isVendor ? this.human : this.officer;

      // Third-person auto-follow: after 1.2s without mouse drag, camera smoothly eases behind vehicle heading
      if (this.state.stage === 'playing' && this.mouseMovedRecently <= 0 && !this.isMouseDragging) {
        let diff = this.state.heading - this.cameraYaw;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        this.cameraYaw += diff * Math.min(1.0, 2.8 * dt);
        while (this.cameraYaw > Math.PI) this.cameraYaw -= Math.PI * 2;
        while (this.cameraYaw < -Math.PI) this.cameraYaw += Math.PI * 2;
      }

      // Spherical coordinate offset based on camera yaw, pitch, and distance
      const horizontalDist = this.cameraDistance * Math.cos(this.cameraPitch);
      const verticalDist = this.cameraDistance * Math.sin(this.cameraPitch);

      const targetCamX = p.position.x - Math.sin(this.cameraYaw) * horizontalDist;
      const targetCamY = p.position.y + verticalDist + 1.2;
      const targetCamZ = p.position.z + Math.cos(this.cameraYaw) * horizontalDist;

      // Smooth camera position damping
      this.camera.position.x = THREE.MathUtils.damp(this.camera.position.x, targetCamX, 12, dt);
      this.camera.position.y = THREE.MathUtils.damp(this.camera.position.y, targetCamY, 12, dt);
      this.camera.position.z = THREE.MathUtils.damp(this.camera.position.z, targetCamZ, 12, dt);

      _lookTarget.set(p.position.x, p.position.y + 1.7, p.position.z);

      // Apply camera shake if present
      if (this.cameraShake > 0.001) {
        const shakeX = (Math.random() - 0.5) * this.cameraShake * 1.5;
        const shakeY = (Math.random() - 0.5) * this.cameraShake * 1.5;
        this.camera.position.x += shakeX;
        this.camera.position.y += shakeY;
        _lookTarget.x += shakeX * 0.4;
      }

      this.camera.lookAt(_lookTarget);
      this.lighting?.update(p.position, this.camera.position);
    } else {
      const t = performance.now() * 0.00012;
      this.camera.position.set(Math.sin(t) * 42, 22, Math.cos(t) * 45);
      this.camera.lookAt(0, 1, 0);
      this.lighting?.update(new THREE.Vector3(0, 0, 0), this.camera.position);
    }

    // Update floating sale / garage repair / aarot restock progress indicator
    const s = this.state?.sale;
    const r = this.state?.repairing;
    const rs = this.state?.restocking;
    const isVendor = this.state && (this.state.mode === 'vendor' || this.state.mode === 'online_vendor');
    const indicatorTarget = isVendor ? this.human.position : this.officer.position;
    this.saleIndicator.update(
      indicatorTarget,
      r && this.state
        ? {
            progress: (this.state.time - r.start) / r.seconds,
            secondsLeft: r.seconds - (this.state.time - r.start),
            label: (this.state.mode === 'vendor' || this.state.mode === 'online_vendor') ? 'মেরামত' : 'চিকিৎসা',
            price: r.cost
          }
        : rs && this.state
        ? {
            progress: (this.state.time - rs.start) / rs.seconds,
            secondsLeft: rs.seconds - (this.state.time - rs.start),
            label: 'রিস্টক',
            price: rs.cost
          }
        : s && isVendor && this.state
        ? {
            progress: (this.state.time - s.start) / s.seconds,
            secondsLeft: s.seconds - (this.state.time - s.start),
            label: s.product,
            price: s.price
          }
        : null,
      dt
    );

    // Keep ambient soundscape attenuated while paused or in menus
    if (!this.state || this.state.stage !== 'playing' || this.isMenuOrModalOpen) {
      const activeActor =
        this.state && (this.state.mode === 'police' || this.state.mode === 'online_police')
          ? this.officer
          : this.human;
      this.ambientAudio.update(dt, {
        playerX: activeActor ? activeActor.position.x : 0,
        playerZ: activeActor ? activeActor.position.z : 0,
        cameraYaw: this.cameraYaw,
        isPlaying: false,
        isPaused: true,
        isAlert: !!this.state?.alert,
        isSelling: !!this.state?.sale,
        muted: this.muted,
        traffic: this.traffic,
        pedestrians: this.customers,
        playerStall: this.state?.stall
          ? { x: this.state.stall.position.x, z: this.state.stall.position.z }
          : null
      });
    }

    this.world?.chunks.update(this.camera.position);
    this.renderer.render(this.scene, this.camera);
  }

  start() {
    this.renderLoop();
  }

  stop() {
    this.isDestroyed = true;
    this.crowdCharacters.dispose();
    for (const actor of [this.human, this.officer, this.npcVendor]) actor?.userData.rig?.visual?.dispose();
    cancelAnimationFrame(this.animId);
    this.ambientAudio?.dispose();
    this.saleIndicator?.dispose();
    this.weather?.dispose();
    this.lighting?.dispose();
    for (const cleanup of this.cleanupListeners) {
      cleanup();
    }
    this.cleanupListeners = [];
  }
}

