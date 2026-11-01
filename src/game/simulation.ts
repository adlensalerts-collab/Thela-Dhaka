import * as THREE from 'three';
import { Obstacle, resolveMovement, checkTrafficImpact } from './collision';
import { SidewalkGraph } from './pathfinding';
import { PedestrianManager, PedestrianNPC } from './pedestrians';

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
  heading: number;
  speed: number;
  score: number;
}

export class GameEngine {
  container: HTMLDivElement;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  clock: THREE.Clock;
  keys: Set<string> = new Set();
  state: GameState;
  onUpdate: (state: GameState) => void;
  onEvent: (type: string, data?: any) => void;
  audioCtx: AudioContext | null = null;
  muted: boolean = false;
  human!: THREE.Group;
  officer!: THREE.Group;
  npcVendor!: THREE.Group;
  sidewalkGraph!: SidewalkGraph;
  pedestrianManager!: PedestrianManager;
  obstacles: Obstacle[] = [];
  traffic: Array<{ mesh: THREE.Group; vertical: boolean; v: number }> = [];
  animId: number = 0;
  acc: number = 0;

  get customers(): PedestrianNPC[] {
    return this.pedestrianManager ? this.pedestrianManager.pedestrians : [];
  }

  // Collision & Physics Feedback
  recoilVx: number = 0;
  recoilVz: number = 0;
  cameraShake: number = 0;
  trafficHitCooldown: number = 0;
  wallBumpCooldown: number = 0;
  particles: Array<{ mesh: THREE.Mesh; vx: number; vy: number; vz: number; life: number; maxLife: number }> = [];
  particleGeo = new THREE.SphereGeometry(0.12, 4, 4);

  // GTA-Style Free Third-Person Camera & Character Controls
  cameraYaw: number = 0;
  cameraPitch: number = 0.38;
  cameraDistance: number = 10.5;
  isMouseDragging: boolean = false;
  lastMouseX: number = 0;
  lastMouseY: number = 0;
  mouseMovedRecently: number = 0;
  currentSpeed: number = 0;

  constructor(container: HTMLDivElement, onUpdate: (s: GameState) => void, onEvent: (t: string, d?: any) => void) {
    this.container = container;
    this.onUpdate = onUpdate;
    this.onEvent = onEvent;
    this.clock = new THREE.Clock();

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#b7d2ce');
    this.scene.fog = new THREE.FogExp2('#c9c9af', 0.0075);

    this.camera = new THREE.PerspectiveCamera(66, container.clientWidth / container.clientHeight, 0.1, 470);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.7));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.55;
    
    container.replaceChildren(this.renderer.domElement);

    this.initLights();
    this.initWorld();

    this.state = this.getInitialState('vendor');

    this.initListeners();
    this.startAudio();
  }

  getInitialState(mode: GameState['mode']): GameState {
    return {
      mode,
      stage: 'playing',
      cash: 250,
      level: 1,
      cap: 10,
      stock: 10,
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
      heading: 0,
      speed: 0,
      score: 0
    };
  }

  startAudio() {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        this.audioCtx = new AudioCtx();
      }
    } catch (e) {
      console.warn('AudioContext not started', e);
    }
  }

  playBeep(freq = 440, duration = 0.1, type: OscillatorType = 'sine') {
    if (this.muted || !this.audioCtx) return;
    try {
      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume();
      }
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, this.audioCtx.currentTime);
      gain.gain.setValueAtTime(0.12, this.audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.audioCtx.currentTime + duration);
      osc.connect(gain);
      gain.connect(this.audioCtx.destination);
      osc.start();
      osc.stop(this.audioCtx.currentTime + duration);
    } catch (e) {}
  }

  playThud(intensity = 0.5) {
    if (this.muted || !this.audioCtx) return;
    try {
      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume();
      }
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(110 * intensity, this.audioCtx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(35, this.audioCtx.currentTime + 0.18);
      gain.gain.setValueAtTime(0.2 * intensity, this.audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.audioCtx.currentTime + 0.18);
      osc.connect(gain);
      gain.connect(this.audioCtx.destination);
      osc.start();
      osc.stop(this.audioCtx.currentTime + 0.18);
    } catch (e) {}
  }

  playRickshawBell() {
    if (this.muted || !this.audioCtx) return;
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
        gain.gain.setValueAtTime(0.18, now + delay);
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
    this.scene.add(new THREE.HemisphereLight(0xe6f2ff, 0x9c8065, 2.15));
    const sun = new THREE.DirectionalLight(0xffecd0, 2.55);
    sun.position.set(-55, 115, 70);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -125;
    sun.shadow.camera.right = 125;
    sun.shadow.camera.top = 125;
    sun.shadow.camera.bottom = -125;
    sun.shadow.bias = -0.00035;
    this.scene.add(sun);
  }

  initWorld() {
    this.obstacles = [];

    const matte = (color: string, roughness = 0.92) => new THREE.MeshStandardMaterial({ color, roughness });
    const mat = {
      soil: matte('#a49e7a'),
      road: matte('#5b6260'),
      median: matte('#cbb880'),
      pavement: matte('#ae9580'),
      stripe: matte('#e7ddae'),
      yellow: matte('#f2c45d'),
      curb: matte('#252829'),
      red: matte('#c54f3c'),
      green: matte('#27835c'),
      leaf: matte('#51773e'),
      brown: matte('#604a37'),
      wood: matte('#a87843'),
      dark: matte('#292e36'),
      light: matte('#e8dfc1'),
      glass: new THREE.MeshStandardMaterial({ color: '#b6d3c7', roughness: 0.24, metalness: 0.05 }),
      concrete: matte('#a6a598'),
      metal: matte('#6a7678'),
      sky: matte('#93c1be')
    };

    const block = (p: THREE.Object3D, w: number, h: number, d: number, m: THREE.Material, x = 0, y = h / 2, z = 0, cast = true) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
      mesh.position.set(x, y, z);
      mesh.castShadow = cast;
      mesh.receiveShadow = true;
      p.add(mesh);
      return mesh;
    };

    const cylinder = (p: THREE.Object3D, rt: number, rb: number, h: number, m: THREE.Material, x = 0, y = h / 2, z = 0, s = 10) => {
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, s), m);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
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

    const palette = ['#dc9a6f', '#b47e68', '#a8a38b', '#e0b883', '#729da0', '#8ba48b', '#c3a5a0'];
    const shops = ['চায়ের দোকান', 'ফলের আড়ৎ', 'নিউ মার্কেট', 'সিটি স্টোর', 'ঢাকা খাবার', 'মা ফার্মেসি', 'সবজি বাজার', 'ফুচকা হাউস', 'মায়ের দোয়া', 'মিষ্টি ঘর'];

    const buildBuilding = (x: number, z: number) => {
      const h = rand(10, 31), color = pick(palette), width = rand(17, 23), depth = rand(17, 23);
      const facade = matte(color);
      block(this.scene, width, h, depth, facade, x, h / 2, z);
      block(this.scene, width + 1, 0.5, depth + 1, mat.concrete, x, h + 0.25, z);
      const faces = Math.max(2, Math.floor(h / 3.4));
      for (let f = 0; f < faces; f++) {
        for (let j = -2; j <= 2; j++) {
          if (f === 0) continue;
          const win = block(this.scene, 1.8, 1.7, 0.05, mat.glass, x + j * (width / 6), f * 3 + 2, z + depth / 2 + 0.03, false);
          win.castShadow = false;
          block(this.scene, 1.8, 0.12, 0.2, mat.concrete, x + j * width / 6, f * 3 + 1.2, z + depth / 2 + 0.18, false);
        }
      }
      block(this.scene, width * 0.74, 2.4, 0.9, matte(pick(['#368778', '#d78342', '#b3a647', '#c85b48'])), x, 1.6, z + depth / 2 + 0.55);
      sign(this.scene, pick(shops), x, 3.7, z + depth / 2 + 0.65, Math.min(9, width * 0.75));

      // Register building into collision obstacles
      this.obstacles.push({
        type: 'box',
        x,
        z,
        hw: width / 2 + 0.65,
        hd: depth / 2 + 0.65,
        tag: 'building'
      });
    };

    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) {
        const x = -60 + i * 40;
        const z = -60 + j * 40;
        if (x === 20 && z === 20) continue;
        buildBuilding(x, z);
      }
    }
    for (const x of [-100, 100]) {
      for (const z of [-100, -60, -20, 20, 60, 100]) {
        if (Math.random() < 0.63) buildBuilding(x, z);
      }
    }

    const makeTree = (x: number, z: number) => {
      cylinder(this.scene, 0.18, 0.22, 3.9, mat.brown, x, 1.95, z, 7);
      sphere(this.scene, 2.3, matte(pick(['#457a42', '#638c4a', '#356d46'])), x, 5, z);
      // Register tree obstacle
      this.obstacles.push({
        type: 'circle',
        x,
        z,
        radius: 0.45,
        tag: 'tree'
      });
    };
    for (const v of [-80, -40, 0, 40, 80]) {
      for (let a = -115; a < 116; a += 17) {
        if (Math.abs(a - v) < 10) continue;
        if (Math.random() < 0.57) makeTree(a, v + 10.5);
        if (Math.random() < 0.47) makeTree(v + 10.5, a);
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
    for (let z = -110; z < 110; z += 27) {
      makePole(-10, z);
      makePole(50, z);
    }

    // Elevated metro roadway & concrete pillars
    for (let x = -115; x < 115; x += 15) {
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

    const makeStall = (x: number, z: number) => {
      const g = new THREE.Group();
      g.position.set(x, 0, z);
      block(g, 3.9, 1, 2.5, mat.wood, 0, 0.8, 0);
      for (const xx of [-1.5, 1.5]) {
        for (const zz of [-0.8, 0.8]) {
          cylinder(g, 0.055, 0.055, 2.5, mat.metal, xx, 2.35, zz);
        }
      }
      block(g, 4.4, 0.3, 2.9, matte('#e7b344'), 0, 3.75, 0);
      for (let i = 0; i < 9; i++) {
        sphere(g, 0.25, matte(pick(['#dd4931', '#86ae4a', '#e6bc3c'])), rand(-1.6, 1.6), 1.5, rand(-0.7, 0.7));
      }
      this.scene.add(g);

      // Register stall obstacle
      this.obstacles.push({
        type: 'box',
        x,
        z,
        hw: 2.2,
        hd: 1.5,
        tag: 'stall'
      });
      return g;
    };
    for (const [x, z] of [[-9, -27], [11, 25], [-49, -8], [71, 51], [-35, 70], [35, -42]]) {
      makeStall(x, z);
    }

    const makeRickshaw = (x: number, z: number, color: string) => {
      const g = new THREE.Group();
      g.position.set(x, 0, z);
      block(g, 1.7, 0.4, 2.6, matte(color), 0, 0.86, 0);
      block(g, 1.5, 1.4, 1.2, matte('#efd87d'), 0, 1.73, 0.4);
      block(g, 1.6, 0.11, 2.7, matte('#c73c59'), 0, 2.5, 0.2);
      for (const xx of [-0.85, 0.85]) {
        for (const zz of [-0.8, 0.9]) {
          const wheel = cylinder(g, 0.39, 0.39, 0.13, mat.dark, xx, 0.42, zz, 12);
          wheel.rotation.z = Math.PI / 2;
        }
      }
      return g;
    };

    for (let i = 0; i < 14; i++) {
      const vertical = Math.random() < 0.5;
      const lane = pick(street) + (Math.random() < 0.5 ? 2.8 : -2.8);
      const r = makeRickshaw(vertical ? lane : rand(-112, 112), vertical ? rand(-112, 112) : lane, pick(['#d24449', '#e0b738', '#469c8b', '#d7723c']));
      if (vertical) r.rotation.y = Math.random() < 0.5 ? 0 : Math.PI;
      else r.rotation.y = Math.random() < 0.5 ? Math.PI / 2 : -Math.PI / 2;
      this.scene.add(r);
      this.traffic.push({ mesh: r, vertical, v: rand(0.7, 2.0) * (r.rotation.y === 0 || r.rotation.y === Math.PI / 2 ? -1 : 1) });
    }

    const makeHuman = (police = false) => {
      const g = new THREE.Group();
      const shirt = matte(police ? '#284970' : pick(['#df8565', '#69a89b', '#d8bb70', '#a0a0aa']));
      const pants = matte(police ? '#20314a' : '#414348');
      cylinder(g, 0.37, 0.46, 1.2, shirt, 0, 1.36, 0, 8);
      cylinder(g, 0.31, 0.35, 0.8, pants, -0.17, 0.39, 0, 8);
      cylinder(g, 0.31, 0.35, 0.8, pants, 0.17, 0.39, 0, 8);
      sphere(g, 0.34, matte('#b87954'), 0, 2.2, 0);
      block(g, 0.38, 0.18, 0.32, matte('#24292c'), 0, 2.52, 0.01);
      for (const xx of [-0.45, 0.45]) {
        const arm = cylinder(g, 0.14, 0.13, 0.9, shirt, xx, 1.44, -0.05, 8);
        arm.rotation.z = xx > 0 ? -0.3 : 0.3;
      }
      if (police) block(g, 0.65, 0.23, 0.65, matte('#203b65'), 0, 2.61, 0);
      return g;
    };

    const makeCart = (isVendor = true) => {
      const g = new THREE.Group();
      const avatar = makeHuman(!isVendor);
      g.add(avatar);
      if (isVendor) {
        const frame = new THREE.Group();
        frame.position.z = 1.35;
        g.add(frame);
        block(frame, 1.75, 0.2, 1.75, mat.wood, 0, 0.85, 0);
        block(frame, 1.9, 0.33, 0.12, mat.red, 0, 1.35, -0.75);
        block(frame, 1.9, 0.33, 0.12, mat.yellow, 0, 1.35, 0.75);
        for (const xx of [-0.92, 0.92]) {
          const wheel = cylinder(frame, 0.39, 0.39, 0.15, mat.dark, xx, 0.43, 0, 12);
          wheel.rotation.z = Math.PI / 2;
        }
        for (let i = 0; i < 17; i++) {
          sphere(frame, 0.24, matte(pick(['#d85e37', '#d4a538', '#82a755', '#7e9f46'])), rand(-0.7, 0.7), 1.12, rand(-0.64, 0.64));
        }
        const signBoard = block(frame, 1.65, 0.53, 0.12, matte('#216a58'), 0, 1.85, 0.79);
        signBoard.castShadow = false;
        sign(frame, 'ঠেলা ঢাকা', 0, 1.85, 0.86, 1.55);
        for (const xx of [-0.55, 0.55]) {
          block(frame, 0.09, 0.14, 1.45, mat.metal, xx, 1.05, -0.87);
        }
      }
      return g;
    };

    this.human = makeCart(true);
    this.scene.add(this.human);
    this.officer = makeHuman(true);
    this.scene.add(this.officer);
    this.npcVendor = makeCart(true);
    this.scene.add(this.npcVendor);

    // Initialize Dhaka sidewalk waypoint network and pool of 14 A* pedestrian NPCs
    this.sidewalkGraph = new SidewalkGraph();
    this.pedestrianManager = new PedestrianManager(this.scene, this.sidewalkGraph, 14);
  }

  initListeners() {
    window.addEventListener('keydown', (e) => {
      const key = e.key.toLowerCase();
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(key)) e.preventDefault();
      if (e.repeat) return;
      const normalized = key === 'arrowup' ? 'w' : key === 'arrowleft' ? 'a' : key === 'arrowright' ? 'd' : key === 'arrowdown' ? 's' : key;
      this.keys.add(normalized);
      this.handleAction(normalized);
    });

    window.addEventListener('keyup', (e) => {
      let k = e.key.toLowerCase();
      if (k === 'arrowup') k = 'w';
      if (k === 'arrowleft') k = 'a';
      if (k === 'arrowdown') k = 's';
      if (k === 'arrowright') k = 'd';
      this.keys.delete(k);
    });

    window.addEventListener('blur', () => this.keys.clear());

    window.addEventListener('resize', () => {
      if (!this.container) return;
      this.camera.aspect = this.container.clientWidth / this.container.clientHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    });

    // GTA-style Mouse orbit controls
    const dom = this.renderer.domElement;

    dom.addEventListener('pointerdown', (e) => {
      this.isMouseDragging = true;
      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;
    });

    window.addEventListener('pointermove', (e) => {
      if (this.isMouseDragging) {
        const dx = e.clientX - this.lastMouseX;
        const dy = e.clientY - this.lastMouseY;
        this.cameraYaw -= dx * 0.0055;
        this.cameraPitch = THREE.MathUtils.clamp(this.cameraPitch - dy * 0.004, 0.08, 1.15);
        this.mouseMovedRecently = 1.2;
        this.lastMouseX = e.clientX;
        this.lastMouseY = e.clientY;
      }
    });

    window.addEventListener('pointerup', () => {
      this.isMouseDragging = false;
    });

    dom.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.cameraDistance = THREE.MathUtils.clamp(this.cameraDistance + e.deltaY * 0.008, 4.5, 18.0);
    }, { passive: false });

    // Mobile touch controls
    dom.addEventListener('touchstart', (e) => {
      if (e.touches.length === 1) {
        this.isMouseDragging = true;
        this.lastMouseX = e.touches[0].clientX;
        this.lastMouseY = e.touches[0].clientY;
      }
    }, { passive: true });

    dom.addEventListener('touchmove', (e) => {
      if (e.touches.length === 1 && this.isMouseDragging) {
        const dx = e.touches[0].clientX - this.lastMouseX;
        const dy = e.touches[0].clientY - this.lastMouseY;
        this.cameraYaw -= dx * 0.006;
        this.cameraPitch = THREE.MathUtils.clamp(this.cameraPitch - dy * 0.005, 0.08, 1.15);
        this.mouseMovedRecently = 1.2;
        this.lastMouseX = e.touches[0].clientX;
        this.lastMouseY = e.touches[0].clientY;
      }
    }, { passive: true });

    dom.addEventListener('touchend', () => {
      this.isMouseDragging = false;
    });
  }

  setMode(mode: GameState['mode']) {
    this.state = this.getInitialState(mode);
    this.human.visible = mode === 'vendor' || mode === 'online_vendor';
    this.officer.visible = true;
    this.npcVendor.visible = mode === 'police' || mode === 'online_police';
    this.human.position.set(0, 0, 7);
    this.officer.position.set(0, 0, -23);
    this.npcVendor.position.set(0, 0, -19);
    this.recoilVx = 0;
    this.recoilVz = 0;
    this.cameraShake = 0;
    this.trafficHitCooldown = 0;
    this.wallBumpCooldown = 0;
    this.cameraYaw = 0;
    this.cameraPitch = 0.38;
    this.cameraDistance = 10.5;
    this.currentSpeed = 0;
    this.mouseMovedRecently = 0;
    this.playBeep(520, 0.2);
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
    if (this.state.mode !== 'vendor' || this.state.sale || this.state.stock <= 0 || this.state.cooldown > 0) return;
    const { nearest, d } = this.distanceToCustomer();
    if (d > 4.8 || !nearest) {
      this.onEvent('notify', 'Get closer to a pedestrian on the sidewalk to sell (ফুটপাতের ক্রেতার কাছে যান)');
      return;
    }
    nearest.isEngagedInSale = true;
    const dx = this.human.position.x - nearest.mesh.position.x;
    const dz = this.human.position.z - nearest.mesh.position.z;
    nearest.mesh.rotation.y = Math.atan2(dx, -dz);

    const productNames = ['আম', 'কলা', 'পেয়ারা', 'সবজি', 'চা', 'ফুচকা', 'পেয়াজ'];
    const seconds = 5 + Math.random() * 5;
    const product = productNames[(Math.random() * productNames.length) | 0];
    const price = Math.max(20, Math.round((23 + seconds * 9 + (Math.random() * 31 - 14)) * (1 + (this.state.level - 1) * 0.28)));
    this.state.sale = { seconds, start: this.state.time, price, product, customer: nearest };
    this.playBeep(600, 0.15);
    this.onEvent('notify', `${nearest.archetype.bnName} (${nearest.archetype.name}) · ${product} · selling for ${seconds.toFixed(1)}s · ৳${price}`);
  }

  completeSale() {
    const s = this.state.sale;
    if (!s) return;
    if (s.customer) {
      s.customer.isEngagedInSale = false;
    }
    this.state.cash += s.price;
    this.state.total += s.price;
    this.state.stock--;
    this.state.sales++;
    this.state.heat = Math.min(100, this.state.heat + 18 + this.state.level * 3.7);
    this.state.sale = null;
    this.playBeep(880, 0.2, 'triangle');
    this.onEvent('notify', `Sold ${s.product} · +৳${s.price}! Police attention rising.`);
  }

  upgradeCart() {
    if (this.state.mode !== 'vendor') return;
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
    this.playBeep(750, 0.25);
    this.onEvent('notify', `Cart level ${this.state.level}! Capacity ${this.state.cap}.`);
  }

  restockCart() {
    if (this.state.mode !== 'vendor') return;
    const needed = this.state.cap - this.state.stock;
    const cost = needed * 7;
    if (needed === 0) {
      this.onEvent('notify', 'Inventory is full.');
      return;
    }
    if (cost > this.state.cash) {
      this.onEvent('notify', `Restock costs ৳${cost}. Earn more.`);
      return;
    }
    this.state.cash -= cost;
    this.state.stock = this.state.cap;
    this.playBeep(450, 0.15);
    this.onEvent('notify', `Restocked ${needed} items for ৳${cost}.`);
  }

  placeStall() {
    if (this.state.mode !== 'vendor') return;
    if (this.state.level < 10) {
      this.onEvent('notify', 'Unlock large food stall at cart level 10.');
      return;
    }
    if (this.state.stall) {
      this.onEvent('notify', 'Your large stall is already placed.');
      return;
    }
    
    // Create large stall 3D mesh
    const stallX = this.human.position.x + Math.sin(this.state.heading) * 3.2;
    const stallZ = this.human.position.z - Math.cos(this.state.heading) * 3.2;
    
    const matte = (color: string, roughness = 0.92) => new THREE.MeshStandardMaterial({ color, roughness });
    const g = new THREE.Group();
    g.position.set(stallX, 0, stallZ);
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
    this.obstacles.push({
      type: 'box',
      x: stallX,
      z: stallZ,
      hw: 2.6,
      hd: 1.8,
      tag: 'big_stall'
    });

    this.playBeep(300, 0.3, 'sawtooth');
    this.onEvent('notify', 'Large food stall opened! High enforcement risk.');
  }

  arrestVendor() {
    if (this.state.mode !== 'police') return;
    const d = this.vector2(this.officer.position, this.npcVendor.position);
    if (d > 3.2) {
      this.onEvent('notify', 'Move close to the vendor before arresting.');
      return;
    }
    this.onEvent('police_decision');
  }

  handleAction(k: string) {
    if (!this.state || this.state.stage !== 'playing') return;
    if (k === 'e') {
      if (this.state.mode === 'vendor') this.beginSale();
      else if (this.state.mode === 'police') this.arrestVendor();
    } else if (k === 'u') {
      this.upgradeCart();
    } else if (k === 'r') {
      this.restockCart();
    } else if (k === 'b') {
      this.placeStall();
    } else if (k === 'c') {
      if (this.cameraDistance < 7.5) {
        this.cameraDistance = 10.5;
        this.cameraPitch = 0.38;
      } else if (this.cameraDistance < 12.5) {
        this.cameraDistance = 15.5;
        this.cameraPitch = 0.52;
      } else {
        this.cameraDistance = 6.0;
        this.cameraPitch = 0.26;
      }
      this.onEvent('notify', 'Camera view changed (ক্যামেরা দূরত্ব পরিবর্তন)');
    }
  }

  simulate(dt: number) {
    if (!this.state || this.state.stage !== 'playing') return;
    this.state.time += dt;

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

    // GTA-style Camera-Relative Movement
    const p = this.state.mode === 'vendor' ? this.human : this.officer;
    const isVendor = this.state.mode === 'vendor' || this.state.mode === 'online_vendor';

    const forwardInput = (this.keys.has('w') ? 1 : 0) - (this.keys.has('s') ? 1 : 0);
    const strafeInput = (this.keys.has('d') ? 1 : 0) - (this.keys.has('a') ? 1 : 0);

    // Camera forward and right vectors projected onto the horizontal XZ ground plane
    const camForwardX = Math.sin(this.cameraYaw);
    const camForwardZ = -Math.cos(this.cameraYaw);
    const camRightX = Math.cos(this.cameraYaw);
    const camRightZ = Math.sin(this.cameraYaw);

    const worldMoveX = camForwardX * forwardInput + camRightX * strafeInput;
    const worldMoveZ = camForwardZ * forwardInput + camRightZ * strafeInput;
    const inputMagnitude = Math.hypot(worldMoveX, worldMoveZ);

    const sprint = this.keys.has(' ') || this.keys.has('shift');
    const baseSpeed = isVendor ? 4.85 : 5.85;
    const targetMoveSpeed = inputMagnitude > 0.05 ? baseSpeed * (sprint ? 1.65 : 1.0) : 0;

    this.currentSpeed = THREE.MathUtils.damp(this.currentSpeed, targetMoveSpeed, 10, dt);

    if (inputMagnitude > 0.05) {
      const dirX = worldMoveX / inputMagnitude;
      const dirZ = worldMoveZ / inputMagnitude;
      const targetHeading = Math.atan2(dirX, -dirZ);

      // Smooth angular turning towards movement direction
      let angleDiff = targetHeading - this.state.heading;
      while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
      while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

      const turnRate = isVendor ? 10.5 : 18.0;
      this.state.heading += angleDiff * Math.min(1, dt * turnRate);

      // Smooth GTA auto-aligning camera when moving forward and not dragging mouse
      if (this.mouseMovedRecently <= 0 && forwardInput > 0) {
        let camAngleDiff = this.state.heading - this.cameraYaw;
        while (camAngleDiff > Math.PI) camAngleDiff -= Math.PI * 2;
        while (camAngleDiff < -Math.PI) camAngleDiff += Math.PI * 2;
        this.cameraYaw += camAngleDiff * dt * 1.6;
      }
    }

    if (this.mouseMovedRecently > 0) {
      this.mouseMovedRecently -= dt;
    }

    // Forward motion vector along character's current heading
    const moveHeadingX = Math.sin(this.state.heading);
    const moveHeadingZ = -Math.cos(this.state.heading);

    const vx = (moveHeadingX * this.currentSpeed + this.recoilVx) * dt;
    const vz = (moveHeadingZ * this.currentSpeed + this.recoilVz) * dt;

    // Advanced collision resolution with wall-sliding and dual-collider thela rig
    const moveRes = resolveMovement(
      p.position.x,
      p.position.z,
      vx,
      vz,
      this.state.heading,
      isVendor,
      this.obstacles,
      110
    );

    p.position.x = moveRes.newX;
    p.position.z = moveRes.newZ;
    p.rotation.y = this.state.heading;
    this.state.speed = this.currentSpeed;

    // Wall / static obstacle collision response & sound
    if (moveRes.collided && Math.abs(this.currentSpeed) > 2.2 && this.wallBumpCooldown <= 0) {
      this.wallBumpCooldown = 0.25;
      this.cameraShake = 0.18;
      this.playThud(0.6);
      const impactPointX = p.position.x + moveHeadingX * (isVendor ? 1.6 : 0.6);
      const impactPointZ = p.position.z + moveHeadingZ * (isVendor ? 1.6 : 0.6);
      this.spawnCollisionParticles(impactPointX, 0.5, impactPointZ, '#d4c29a', 6);
    }

    // Dynamic Traffic (Rickshaw) collision detection
    const trafficHit = checkTrafficImpact(p.position.x, p.position.z, this.state.heading, isVendor, this.traffic);
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
        }
        this.state.sale = null;
        this.onEvent('notify', 'রিকশায় ধাক্কা! বেচাকেনা বাতিল (Rickshaw collision cancelled sale!)');
      } else {
        this.onEvent('notify', 'সাবধান! রিকশার সাথে সংঘর্ষ (Watch out! Rickshaw bump!)');
      }
    }

    // AI Police pursuit & navigation with collision resolution
    if (this.state.mode === 'vendor') {
      if (this.state.heat > 27 && this.state.cooldown === 0 && this.vector2(this.human.position, this.officer.position) < 55) {
        this.state.alert = true;
      }
      const toHuman = new THREE.Vector3().subVectors(this.human.position, this.officer.position);
      const dist = toHuman.length();
      if (this.state.alert) {
        const dir = toHuman.clone();
        dir.y = 0;
        dir.normalize();

        const officerSpeed = Math.min(dist, 1) * 3.55;
        const officerVx = dir.x * officerSpeed * dt;
        const officerVz = dir.z * officerSpeed * dt;
        const officerHeading = Math.atan2(dir.x, -dir.z);

        const aiMove = resolveMovement(
          this.officer.position.x,
          this.officer.position.z,
          officerVx,
          officerVz,
          officerHeading,
          false,
          this.obstacles,
          105
        );
        this.officer.position.x = aiMove.newX;
        this.officer.position.z = aiMove.newZ;
        this.officer.rotation.y = officerHeading;

        if (dist < 2.1) {
          this.onEvent('bribe_prompt');
          return;
        }
        if (dist > 30) {
          this.state.escape += dt;
          if (this.state.escape > 5) {
            this.state.alert = false;
            this.state.heat = Math.max(0, this.state.heat - 30);
            this.state.cooldown = 11;
            this.state.escape = 0;
            this.onEvent('notify', 'Escaped police! Stay out of sight.');
          }
        } else {
          this.state.escape = 0;
        }
      } else {
        const angle = this.state.time * 0.3;
        const aiVx = Math.sin(angle) * dt * 1.1;
        const aiVz = Math.cos(angle * 0.7) * dt * 0.9;
        const aiMove = resolveMovement(
          this.officer.position.x,
          this.officer.position.z,
          aiVx,
          aiVz,
          Math.atan2(aiVx, -aiVz),
          false,
          this.obstacles,
          100
        );
        this.officer.position.x = aiMove.newX;
        this.officer.position.z = aiMove.newZ;
      }
    } else {
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
        this.obstacles,
        104
      );
      this.npcVendor.position.x = aiVendorMove.newX;
      this.npcVendor.position.z = aiVendorMove.newZ;
      this.npcVendor.rotation.y = vendorHeading;
    }

    // Update A* Sidewalk Pedestrian crowd
    if (this.pedestrianManager) {
      this.pedestrianManager.update(dt);

      // Soft push against player/cart so pedestrians don't walk directly through cart or avatar
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
        }
        this.state.sale = null;
        this.playBeep(220, 0.2, 'sawtooth');
        this.onEvent('notify', 'Sale interrupted — no payment.');
      } else if (elapsed >= s.seconds) {
        this.completeSale();
      }
    }

    if (this.state.mode === 'vendor') {
      if (!this.state.alert && this.state.heat > 0) {
        this.state.heat = Math.max(0, this.state.heat - dt * 0.9);
      }
      if (this.state.stall && Math.random() < dt * 0.08) {
        this.state.cash += 45;
        this.state.total += 45;
      }
    }

    // Traffic motion
    for (const item of this.traffic) {
      const pos = item.mesh.position;
      const delta = item.v * dt;
      if (item.vertical) {
        pos.z += delta;
        if (Math.abs(pos.z) > 112) pos.z = -Math.sign(pos.z) * 112;
      } else {
        pos.x += delta;
        if (Math.abs(pos.x) > 112) pos.x = -Math.sign(pos.x) * 112;
      }
    }

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

    this.onUpdate({ ...this.state });
  }

  renderLoop() {
    this.animId = requestAnimationFrame(() => this.renderLoop());
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this.acc += dt;
    if (this.acc > 0.045) {
      this.simulate(Math.min(this.acc, 0.05));
      this.acc = 0;
    }

    if (this.state && this.state.stage === 'playing') {
      const p = this.state.mode === 'vendor' || this.state.mode === 'online_vendor' ? this.human : this.officer;

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

      const lookTarget = new THREE.Vector3(p.position.x, p.position.y + 1.7, p.position.z);

      // Apply camera shake if present
      if (this.cameraShake > 0.001) {
        const shakeX = (Math.random() - 0.5) * this.cameraShake * 1.5;
        const shakeY = (Math.random() - 0.5) * this.cameraShake * 1.5;
        this.camera.position.x += shakeX;
        this.camera.position.y += shakeY;
        lookTarget.x += shakeX * 0.4;
      }

      this.camera.lookAt(lookTarget);
    } else {
      const t = performance.now() * 0.00012;
      this.camera.position.set(Math.sin(t) * 42, 22, Math.cos(t) * 45);
      this.camera.lookAt(0, 1, 0);
    }

    this.renderer.render(this.scene, this.camera);
  }

  start() {
    this.renderLoop();
  }

  stop() {
    cancelAnimationFrame(this.animId);
  }
}
