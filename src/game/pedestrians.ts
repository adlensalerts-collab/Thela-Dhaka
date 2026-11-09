import * as THREE from 'three';
import { checkRigCollision, type CircleObstacle } from './collision';
import { SidewalkGraph } from './pathfinding';
import { BloodDecals } from './render/bloodDecals';
import { createHumanRig, outfitForArchetype } from './world/humans';
import { CrowdImpostors } from './crowd/crowdImpostors';
import { activeFraction, hotspotTripChance, hotspotWeight, weightedIndex } from './crowd/crowdSchedule';

/** Sprint 10 — what a pedestrian is doing besides walking. */
export type PedestrianActivity = 'none' | 'chat' | 'phone_call' | 'stall' | 'look' | 'wait_cross';

/** Optional probes the engine supplies so pedestrians can respect roads and traffic. */
export interface CrowdRoadProbes {
  /** True if (x, z) is on a carriageway (use RoadGraph.isOnCarriageway). */
  isOnCarriageway: (x: number, z: number) => boolean;
  /** True if a moving vehicle is within `radius` metres of (x, z). */
  vehicleNear: (x: number, z: number, radius: number) => boolean;
}

/** A stall / shop front people stop at: stand at (x, z) facing (fx, fz). */
export interface BrowsePoint { x: number; z: number; fx?: number; fz?: number }

export interface PedestrianArchetype {
  name: string;
  bnName: string;
  shirtColor: string;
  pantsColor: string;
  hasCap?: boolean;
  hasBag?: boolean;
  hasGamchha?: boolean;
  speed: number;
}

/** Sprint 15g: a street fight between two pedestrians. */
export interface FightRec {
  a: PedestrianNPC;
  b: PedestrianNPC;
  phase: 'approach' | 'faceoff' | 'brawl' | 'aftermath';
  t: number;
  blows: number;
  maxBlows: number;
  /** 1 right after a blow, fading to 0 (drives the punch / recoil poses). */
  swing: number;
  /** Who throws the next blow: 0 = a, 1 = b. */
  attacker: 0 | 1;
  blowIn: number;
  cx: number;
  cz: number;
  winner: PedestrianNPC | null;
}

export interface PedestrianNPC {
  id: number;
  mesh: THREE.Group;
  archetype: PedestrianArchetype;
  leftLeg: THREE.Object3D;
  rightLeg: THREE.Object3D;
  leftArm: THREE.Object3D;
  rightArm: THREE.Object3D;
  body: THREE.Object3D;
  currentNodeId: number;
  targetNodeId: number;
  path: Array<{ x: number; z: number }>;
  pathIndex: number;
  speed: number;
  heading: number;
  state: 'walking' | 'idle' | 'browsing' | 'injured' | 'hostile' | 'brawl';
  idleTimer: number;
  walkCycle: number;
  isEngagedInSale: boolean;
  /** Each person buys from the vendor at most once per day (cleared at the day reset, or when everyone has bought). */
  hasBought: boolean;
  /** Perf: whether this rig currently casts a shadow (only the nearest few do). */
  castsShadow?: boolean;
  /** Sprint 15g: the street fight this person is in, if any. */
  fight: FightRec | null;
  isInjured: boolean;
  injuredTimer: number;
  stumbleTimer: number;
  limpTimer: number;
  knockbackDist: number;
  hostileTimer: number;
  hitCooldown: number;
  attackCooldown: number;
  knockbackVx: number;
  /** Hotspot customer: walking to / waiting at the vendor until this game time (0 = not summoned). */
  summonUntil?: number;
  summonX?: number;
  summonZ?: number;
  knockbackVz: number;
  rage: number;
  damageTaken: number;
  /** Rage meter (AI Studio's dormant Sprint 15 code). Created only when first needed. */
  rageSprite?: THREE.Sprite;
  rageCanvas?: HTMLCanvasElement;
  rageCtx?: CanvasRenderingContext2D;
  rageTexture?: THREE.CanvasTexture;
  lastRageKey: string;
  // ---- Sprint 10 ----
  /** False = parked off-street by the time-of-day density (hidden, not simulated). */
  active: boolean;
  /** Near tier draws the rig; far tier is drawn by CrowdImpostors; hidden is not drawn. */
  lod: 'near' | 'far' | 'hidden';
  activity: PedestrianActivity;
  activityTimer: number;
  /** Activity to start when the current walk ends (joining a chat group, browsing a stall, watching). */
  pendingActivity: PedestrianActivity;
  pendingTimer: number;
  lookX: number;
  lookZ: number;
  groupId: number;
  /** About a third of people use a phone now and then. */
  phoneUser: boolean;
  /** Texting while walking on this trip. */
  texting: boolean;
  /** Path index whose segment was checked for a road crossing (-1 = not yet). */
  crossCheckedIndex: number;
  crossingRoad: boolean;
  crossWait: number;
  hurryTimer: number;
  colors: { shirt: THREE.Color; bottom: THREE.Color; skin: THREE.Color };
}

const SHIRT_VARIETY = ['#e6e1d3', '#7d93ad', '#3f6f8f', '#9a3b3b', '#c9a227', '#5d7f4f', '#6b4f7a', '#d98c5f', '#f2f0ea', '#2f4858', '#b5651d', '#8e9aa6'];
const BOTTOM_VARIETY = ['#1d2736', '#2b2a33', '#3a3f47', '#4b3b2a', '#22303c', '#5b5b5b'];

const ARCHETYPES: PedestrianArchetype[] = [
  { name: 'Office Commuter', bnName: 'চাকুরিজীবী', shirtColor: '#8ca8c4', pantsColor: '#1d2736', speed: 1.6 },
  { name: 'Dhaka Uncle', bnName: 'চাচা', shirtColor: '#e8dec3', pantsColor: '#f0ece1', hasCap: true, speed: 1.3 },
  { name: 'College Student', bnName: 'কলেজ শিক্ষার্থী', shirtColor: '#4f7d5c', pantsColor: '#2b2a33', hasBag: true, speed: 1.8 },
  { name: 'Local Worker', bnName: 'শ্রমিক', shirtColor: '#c27d44', pantsColor: '#22555c', hasGamchha: true, speed: 1.5 },
  { name: 'Market Shopper', bnName: 'ক্রেতা', shirtColor: '#bf4343', pantsColor: '#26292b', speed: 1.4 },
  { name: 'Youth in Kurta', bnName: 'তরুণ', shirtColor: '#d6a036', pantsColor: '#2f343b', speed: 1.7 },
  { name: 'Passerby with Scarf', bnName: 'পথচারী', shirtColor: '#568b87', pantsColor: '#d4cfb8', hasGamchha: true, speed: 1.45 },
  { name: 'Senior Citizen', bnName: 'মুরুব্বি', shirtColor: '#ffffff', pantsColor: '#e3dfd3', hasCap: true, speed: 1.2 },
  { name: 'Tea Stall Regular', bnName: 'চা প্রেমিক', shirtColor: '#966046', pantsColor: '#1f2b38', speed: 1.55 }
];

const pedCollider: CircleObstacle = { type: 'circle', x: 0, z: 0, radius: 0.36 };

/** Adults only: if any archetype is a child or school-age model, it only gets a bump and runs away. */
function isChildOrSchoolArchetype(a: PedestrianArchetype): boolean {
  return /child|kid|school|minor/i.test(a.name) || /শিশু|স্কুল/.test(a.bnName);
}

function colorsOf(group: THREE.Group) {
  const o = (group.userData.humanOptions ?? {}) as { shirt?: string; bottom?: string; skin?: string };
  return {
    shirt: new THREE.Color(o.shirt ?? '#d8cdb2'),
    bottom: new THREE.Color(o.bottom ?? '#2e3440'),
    skin: new THREE.Color(o.skin ?? '#8d5a3b')
  };
}

export class PedestrianManager {
  scene: THREE.Scene;
  graph: SidewalkGraph;
  pedestrians: PedestrianNPC[] = [];
  poolSize: number;
  /** Map half-extents (real districts are larger than the old ±108 grid). */
  bounds = { x: 108, z: 108 };
  private clock = 0;
  /** Graph nodes near hotspots: many trips head to one, so markets and busy junctions are crowded. */
  private hotspotNodes: number[] = [];
  /** Sprint 10: per-hotspot node lists so the time of day can favour markets, junctions or schools. */
  private hotspotGroups: Array<{ kind: string; nodes: number[] }> = [];
  /** Minutes after midnight; null until the engine drives the clock (then density stays at 100%). */
  private minutes: number | null = null;
  private probes: CrowdRoadProbes | null = null;
  private browse: Array<BrowsePoint & { node: number }> = [];
  private lastCam: { x: number; z: number } | null = null;
  /** Sprint 15g: street fights. `officers` is set by the engine each frame; an officer within 14 m breaks a fight up. */
  officers: ReadonlyArray<{ x: number; z: number }> = [];
  fights: FightRec[] = [];
  fightsStarted = 0;
  maxFights = 1;
  private fightEvery = 60;
  private fightTimer = 30;
  private groupTimer = 0;
  private densityTimer = 0;
  private detailTimer = 0;
  private nextGroupId = 1;
  private nearSet = new Set<PedestrianNPC>();
  private nearBuffer: PedestrianNPC[] = [];
  private impostors: CrowdImpostors;
  bloodDecals: BloodDecals;
  private disposed = false;
  /** Max simultaneous chat groups. */
  get groupLimit() { return Math.max(2, Math.floor(this.poolSize / 20)); }

  setHotspots(points: Array<{ x: number; z: number; kind?: string }>) {
    const nodes = this.graph.nodes;
    const set = new Set<number>();
    this.hotspotGroups = [];
    for (const h of points) {
      const group: number[] = [];
      for (const n of nodes) if (Math.hypot(n.x - h.x, n.z - h.z) < 35) { set.add(n.id); group.push(n.id); }
      const nearest = this.graph.findNearestNode(h.x, h.z);
      set.add(nearest);
      if (!group.includes(nearest)) group.push(nearest);
      this.hotspotGroups.push({ kind: h.kind ?? 'junction', nodes: group });
    }
    this.hotspotNodes = [...set];
    // S13: a time-window change must invalidate destinations even if the camera stays still.
    this.focusHotspots = [];
    this.focusCenter = null;
  }

  /** Sprint 10 crowd streaming: keep trips within this radius of the camera (the map is 900 m wide). */
  private static readonly FOCUS = 130;
  private focusNodes: number[] = [];
  /** Focus nodes within sight (< 85 m): most trips end here, so the player sees a busy street. */
  private innerNodes: number[] = [];
  private focusHotspots: Array<{ kind: string; nodes: number[] }> = [];
  private focusCenter: { x: number; z: number } | null = null;

  private refreshFocus() {
    const cam = this.lastCam;
    if (!cam) return;
    if (this.focusCenter && Math.hypot(cam.x - this.focusCenter.x, cam.z - this.focusCenter.z) < 25) return;
    this.focusCenter = { ...cam };
    const R = PedestrianManager.FOCUS;
    this.focusNodes = this.graph.nodes.filter((n) => Math.hypot(n.x - cam.x, n.z - cam.z) < R).map((n) => n.id);
    this.innerNodes = this.focusNodes.filter((id) => { const n = this.graph.nodes[id]; return Math.hypot(n.x - cam.x, n.z - cam.z) < 85; });
    this.focusHotspots = this.hotspotGroups
      .map((g) => ({ kind: g.kind, nodes: g.nodes.filter((id) => { const n = this.graph.nodes[id]; return Math.hypot(n.x - cam.x, n.z - cam.z) < R * 1.3; }) }))
      .filter((g) => g.nodes.length > 0);
  }

  private pickDestination(fromId: number): number {
    if (this.lastCam && this.focusNodes.length > 20) {
      // Streaming: trips stay around the player, so 120 people make a busy street, not an empty map.
      const m = this.minutes ?? 12 * 60;
      if (this.focusHotspots.length && Math.random() < hotspotTripChance(m)) {
        const i = weightedIndex(this.focusHotspots.map((g) => hotspotWeight(g.kind, m)), Math.random());
        const g = this.focusHotspots[i >= 0 ? i : 0];
        return g.nodes[Math.floor(Math.random() * g.nodes.length)];
      }
      const from = this.graph.nodes[fromId] ?? this.graph.nodes[0];
      const pool = this.innerNodes.length > 8 && Math.random() < 0.65 ? this.innerNodes : this.focusNodes;
      for (let tries = 0; tries < 10; tries++) {
        const id = pool[Math.floor(Math.random() * pool.length)];
        const n = this.graph.nodes[id];
        if (Math.hypot(n.x - from.x, n.z - from.z) >= 35) return id;
      }
    }
    if (this.minutes === null) {
      if (this.hotspotNodes.length && Math.random() < 0.5) {
        return this.hotspotNodes[Math.floor(Math.random() * this.hotspotNodes.length)];
      }
      return this.graph.getRandomDestination(fromId, 35);
    }
    if (this.hotspotGroups.length && Math.random() < hotspotTripChance(this.minutes)) {
      const m = this.minutes;
      const i = weightedIndex(this.hotspotGroups.map((g) => hotspotWeight(g.kind, m)), Math.random());
      const g = this.hotspotGroups[i >= 0 ? i : 0];
      if (g.nodes.length) return g.nodes[Math.floor(Math.random() * g.nodes.length)];
    }
    return this.graph.getRandomDestination(fromId, 35);
  }

  constructor(scene: THREE.Scene, graph: SidewalkGraph, count = 14) {
    this.scene = scene;
    this.graph = graph;
    this.poolSize = Math.max(6, Math.min(120, count));
    // Far-tier crowd: added now (with 0 instances) so world teardown finds it with the district.
    this.impostors = new CrowdImpostors(this.poolSize);
    this.scene.add(this.impostors.group);
    this.bloodDecals = new BloodDecals(this.scene);
    this.initPool();
  }

  private createRageMeterSprite(): {
    sprite: THREE.Sprite;
    canvas: HTMLCanvasElement;
    ctx: CanvasRenderingContext2D;
    texture: THREE.CanvasTexture;
  } {
    const canvas = document.createElement('canvas');
    canvas.width = 240;
    canvas.height = 96;
    const ctx = canvas.getContext('2d')!;
    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    const mat = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
      depthWrite: false
    });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(1.65, 0.66, 1);
    sprite.position.set(0, 2.42, 0);
    sprite.renderOrder = 995;
    sprite.visible = false;
    return { sprite, canvas, ctx, texture };
  }

  private updateRageSprite(p: PedestrianNPC) {
    const isChasing = p.state === 'hostile';
    const displayRage = isChasing ? 100 : Math.min(100, Math.round(p.rage));

    if (displayRage <= 1 && !isChasing && p.state !== 'injured' && p.damageTaken <= 0) {
      if (p.rageSprite) p.rageSprite.visible = false;
      return;
    }

    if (!p.rageSprite || !p.rageCtx || !p.rageCanvas || !p.rageTexture) {
      const meter = this.createRageMeterSprite();
      p.mesh.add(meter.sprite);
      p.rageSprite = meter.sprite; p.rageCanvas = meter.canvas; p.rageCtx = meter.ctx; p.rageTexture = meter.texture;
      p.lastRageKey = '';
    }
    p.rageSprite.visible = true;
    const bob = isChasing || displayRage >= 70 ? Math.abs(Math.sin(p.walkCycle * 0.8)) * 0.1 : 0;
    p.rageSprite.position.y = 2.42 + bob;

    const pulse = isChasing || displayRage >= 70 ? Math.floor(p.walkCycle * 2.5) % 2 : 0;
    const key = `${p.state}:${displayRage}:${pulse}`;
    if (key === p.lastRageKey) return;
    p.lastRageKey = key;

    const ctx = p.rageCtx;
    const w = p.rageCanvas.width;
    const h = p.rageCanvas.height;
    ctx.clearRect(0, 0, w, h);

    // Determine color tier based on rage buildup
    let accentColor = '#facc15'; // Yellow-Amber (annoyed)
    let statusText = 'রাগ · RAGE';
    if (isChasing) {
      accentColor = pulse ? '#ef4444' : '#fb7185';
      statusText = '! তাড়া করছে · CHASING';
    } else if (displayRage >= 70) {
      accentColor = pulse ? '#f97316' : '#ef4444';
      statusText = '! তেড়ে আসছে · READY TO CHASE';
    } else if (displayRage >= 40) {
      accentColor = '#f97316';
      statusText = 'ক্ষুব্ধ · AGITATED';
    }

    // Outer rounded HUD card
    const padX = 10;
    const padY = 8;
    const cardW = w - padX * 2;
    const cardH = h - padY * 2 - 10;
    ctx.fillStyle = 'rgba(9, 13, 22, 0.9)';
    ctx.strokeStyle = accentColor;
    ctx.lineWidth = isChasing || displayRage >= 70 ? 3.5 : 2.5;
    ctx.beginPath();
    ctx.roundRect(padX, padY, cardW, cardH, 12);
    ctx.fill();
    ctx.stroke();

    // Pointer triangle at bottom center pointing to NPC head
    ctx.fillStyle = accentColor;
    ctx.beginPath();
    ctx.moveTo(w / 2 - 8, padY + cardH);
    ctx.lineTo(w / 2 + 8, padY + cardH);
    ctx.lineTo(w / 2, padY + cardH + 9);
    ctx.closePath();
    ctx.fill();

    // Header label + Rage percentage
    ctx.font = 'bold 14px system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillStyle = accentColor;
    ctx.fillText(statusText, padX + 12, padY + 18);

    ctx.textAlign = 'right';
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 15px monospace';
    ctx.fillText(`${displayRage}%`, padX + cardW - 12, padY + 18);

    // Main Rage progress bar track
    const barX = padX + 12;
    const barY = padY + 33;
    const barW = cardW - 24;
    const barH = 16;

    ctx.fillStyle = 'rgba(30, 41, 59, 0.95)';
    ctx.beginPath();
    ctx.roundRect(barX, barY, barW, barH, 6);
    ctx.fill();

    // Rage progress fill with gradient
    const fillW = Math.max(0, Math.min(barW, (displayRage / 100) * barW));
    if (fillW > 0) {
      const grad = ctx.createLinearGradient(barX, 0, barX + barW, 0);
      grad.addColorStop(0, '#facc15');
      grad.addColorStop(0.55, '#f97316');
      grad.addColorStop(1, '#ef4444');
      ctx.fillStyle = isChasing && pulse ? '#f43f5e' : grad;
      ctx.beginPath();
      ctx.roundRect(barX, barY, fillW, barH, 6);
      ctx.fill();
    }

    // Chasing threshold tick mark at 75% (warning zone)
    const warnX = barX + barW * 0.75;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.65)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(warnX, barY + 1);
    ctx.lineTo(warnX, barY + barH - 1);
    ctx.stroke();

    // No health/injury strip or damage numbers on the HUD card: graphic injuries, blood decals and limping are shown on the character and street instead (Sprint 15b).

    p.rageTexture.needsUpdate = true;
  }

  private createHumanMesh(archetype: PedestrianArchetype): {
    group: THREE.Group;
    leftLeg: THREE.Object3D;
    rightLeg: THREE.Object3D;
    leftArm: THREE.Object3D;
    rightArm: THREE.Object3D;
    body: THREE.Object3D;
  } {
    const outfit = outfitForArchetype(archetype);
    // Sprint 10: more variety than nine archetype colours (archetype keeps its outfit style).
    if (Math.random() < 0.6) outfit.shirt = SHIRT_VARIETY[Math.floor(Math.random() * SHIRT_VARIETY.length)];
    if (Math.random() < 0.3 && outfit.outfit !== 'lungi') outfit.bottom = BOTTOM_VARIETY[Math.floor(Math.random() * BOTTOM_VARIETY.length)];
    const rig = createHumanRig(outfit);
    return {
      group: rig.group,
      leftLeg: rig.leftLeg,
      rightLeg: rig.rightLeg,
      leftArm: rig.leftArm,
      rightArm: rig.rightArm,
      body: rig.body
    };
  }

  private initPool() {
    for (let i = 0; i < this.poolSize; i++) {
      const archetype = ARCHETYPES[i % ARCHETYPES.length];
      const rig = this.createHumanMesh(archetype);

      // Start at a random node on the sidewalk graph
      const startNodeId = (Math.random() * this.graph.nodes.length) | 0;
      const startNode = this.graph.nodes[startNodeId];
      rig.group.position.set(startNode.x, 0, startNode.z);
      this.scene.add(rig.group);

      const targetNodeId = this.graph.getRandomDestination(startNodeId, 30);
      const path = this.graph.findAStarPath(startNodeId, targetNodeId);
      const firstStep = path.length > 1 ? path[1] : path[0] ?? startNode;
      const initDx = firstStep.x - startNode.x;
      const initDz = firstStep.z - startNode.z;
      const initialHeading =
        Math.hypot(initDx, initDz) > 0.01
          ? Math.atan2(initDx, -initDz)
          : Math.random() * Math.PI * 2;
      rig.group.rotation.order = 'YXZ';
      rig.group.rotation.y = -initialHeading;

      this.pedestrians.push({
        id: i,
        mesh: rig.group,
        archetype,
        leftLeg: rig.leftLeg,
        rightLeg: rig.rightLeg,
        leftArm: rig.leftArm,
        rightArm: rig.rightArm,
        body: rig.body,
        currentNodeId: startNodeId,
        targetNodeId,
        path: path.length > 1 ? path.slice(1) : path,
        pathIndex: 0,
        speed: archetype.speed * (0.9 + Math.random() * 0.25),
        heading: initialHeading,
        state: 'walking',
        idleTimer: 0,
        walkCycle: Math.random() * 10,
        isEngagedInSale: false,
        hasBought: false,
        fight: null,
        isInjured: false,
        injuredTimer: 0,
        stumbleTimer: 0,
        limpTimer: 0,
        knockbackDist: 0,
        hostileTimer: 0,
        hitCooldown: 0,
        attackCooldown: 0,
        knockbackVx: 0,
        knockbackVz: 0,
        rage: 0,
        damageTaken: 0,
        lastRageKey: '',
        active: true,
        lod: 'near',
        activity: 'none',
        activityTimer: 0,
        pendingActivity: 'none',
        pendingTimer: 0,
        lookX: 0,
        lookZ: 0,
        groupId: 0,
        phoneUser: Math.random() < 0.35,
        texting: false,
        crossCheckedIndex: -1,
        crossingRoad: false,
        crossWait: 0,
        hurryTimer: 0,
        colors: colorsOf(rig.group)
      });
    }
  }

  reset() {
    this.bloodDecals.clear();
    for (const p of this.pedestrians) {
      const startNodeId = (Math.random() * this.graph.nodes.length) | 0;
      const startNode = this.graph.nodes[startNodeId];
      p.mesh.position.set(startNode.x, 0, startNode.z);
      p.mesh.rotation.x = 0;
      p.mesh.rotation.z = 0;
      const targetNodeId = this.graph.getRandomDestination(startNodeId, 30);
      const path = this.graph.findAStarPath(startNodeId, targetNodeId);
      p.currentNodeId = startNodeId;
      p.targetNodeId = targetNodeId;
      p.path = path.length > 1 ? path.slice(1) : path;
      p.pathIndex = 0;
      p.state = 'walking';
      p.idleTimer = 0;
      p.isEngagedInSale = false;
      p.hasBought = false;
      p.fight = null;
      p.isInjured = false;
      p.injuredTimer = 0;
      p.stumbleTimer = 0;
      p.limpTimer = 0;
      p.knockbackDist = 0;
      p.hostileTimer = 0;
      p.hitCooldown = 0;
      p.attackCooldown = 0;
      p.knockbackVx = 0;
      p.knockbackVz = 0;
      p.rage = 0;
      p.damageTaken = 0;
      p.lastRageKey = '';
      p.body.rotation.set(0, 0, 0);
      p.leftArm.rotation.set(0, 0, -0.06);
      p.rightArm.rotation.set(0, 0, 0.06);
      p.leftLeg.rotation.set(0, 0, 0);
      p.rightLeg.rotation.set(0, 0, 0);
      if (p.rageSprite) {
        p.rageSprite.visible = false;
        p.rageSprite.position.set(0, 2.42, 0);
      }
      this.clearActivity(p);
      p.texting = false;
      p.hurryTimer = 0;
      p.summonUntil = 0;
      p.active = true;
      p.mesh.visible = true;
    }
    this.nearSet.clear();
    this.fights.length = 0;
    this.densityTimer = 0;
  }

  update(
    dt: number,
    vendorPos?: { x: number; z: number },
    stepHostileFn?: (mesh: THREE.Group, dirX: number, dirZ: number, speed: number) => number
  ) {
    this.clock += dt;
    this.bloodDecals.update(dt);
    if (this.minutes !== null || this.lastCam) this.updateDensity(dt);
    this.updateGroups(dt);
    this.updateFights(dt);
    for (let i = 0; i < this.pedestrians.length; i++) {
      const p = this.pedestrians[i];
      if (!p.active) continue;
      if (p.hurryTimer > 0) p.hurryTimer = Math.max(0, p.hurryTimer - dt);
      if (p.limpTimer > 0) {
        p.limpTimer = Math.max(0, p.limpTimer - dt);
        if (p.limpTimer <= 0 && p.state !== 'injured') p.isInjured = false;
      }

      if (p.hitCooldown > 0) p.hitCooldown = Math.max(0, p.hitCooldown - dt);
      if (p.attackCooldown > 0) p.attackCooldown = Math.max(0, p.attackCooldown - dt);

      // Apply physical knockback velocity (clamped off carriageways and capped at 1.5 m)
      if (Math.abs(p.knockbackVx) > 0.02 || Math.abs(p.knockbackVz) > 0.02) {
        let stepX = p.knockbackVx * dt;
        let stepZ = p.knockbackVz * dt;
        const stepLen = Math.hypot(stepX, stepZ);
        const remaining = Math.max(0, 1.5 - p.knockbackDist);
        if (stepLen > remaining && stepLen > 0.0001) {
          const scale = remaining / stepLen;
          stepX *= scale;
          stepZ *= scale;
        }
        const nx = THREE.MathUtils.clamp(p.mesh.position.x + stepX, -this.bounds.x, this.bounds.x);
        const nz = THREE.MathUtils.clamp(p.mesh.position.z + stepZ, -this.bounds.z, this.bounds.z);
        if (remaining > 0.001 && !this.probes?.isOnCarriageway(nx, nz)) {
          p.mesh.position.x = nx;
          p.mesh.position.z = nz;
          p.knockbackDist += Math.hypot(stepX, stepZ);
        } else {
          p.knockbackVx = 0;
          p.knockbackVz = 0;
        }
        p.knockbackVx = THREE.MathUtils.damp(p.knockbackVx, 0, 7, dt);
        p.knockbackVz = THREE.MathUtils.damp(p.knockbackVz, 0, 7, dt);
      }

      // Injured state (knock-down): falls hard, lies 3 s, then gets up slowly holding head or arm, then limps away
      if (p.state === 'injured') {
        p.walkCycle += dt * 6;
        p.injuredTimer -= dt;
        const holdHead = (p.id & 1) === 0;
        if (p.injuredTimer > 1.2) {
          // Lying on the ground for 3 s (injuredTimer starts at 4.2 s -> 3.0 s lying + 1.2 s getting up)
          const fallElapsed = Math.max(0, 4.2 - p.injuredTimer);
          const fallT = Math.min(1, fallElapsed / 0.22);
          p.mesh.rotation.x = THREE.MathUtils.lerp(0, 1.42, fallT);
          p.mesh.position.y = THREE.MathUtils.lerp(0, 0.14, fallT);
          p.body.rotation.x = 0.08;
          p.body.rotation.z = Math.sin(p.walkCycle * 0.5) * 0.05;
          p.leftArm.rotation.x = -0.35;
          p.leftArm.rotation.z = -0.25;
          p.rightArm.rotation.x = holdHead ? -2.1 : -0.95;
          p.rightArm.rotation.z = holdHead ? -0.4 : -0.3;
          p.leftLeg.rotation.x = -0.12;
          p.rightLeg.rotation.x = 0.18;
        } else if (p.injuredTimer > 0) {
          // Getting up slowly over 1.2 s holding their head or arm
          const riseT = 1 - p.injuredTimer / 1.2;
          p.mesh.rotation.x = THREE.MathUtils.lerp(1.42, 0, riseT);
          p.mesh.position.y = THREE.MathUtils.lerp(0.14, 0, riseT);
          p.body.rotation.x = THREE.MathUtils.lerp(0.35, 0.14, riseT);
          p.body.rotation.z = Math.sin(p.walkCycle) * 0.12;
          if (holdHead) {
            p.rightArm.rotation.x = -2.15;
            p.rightArm.rotation.z = -0.42;
            p.leftArm.rotation.x = 0.25 * (1 - riseT);
            p.leftArm.rotation.z = -0.1;
          } else {
            p.rightArm.rotation.x = -1.1;
            p.rightArm.rotation.z = -0.5;
            p.leftArm.rotation.x = -0.75;
            p.leftArm.rotation.z = 0.35;
          }
          p.leftLeg.rotation.x = (1 - riseT) * -0.35;
          p.rightLeg.rotation.x = (1 - riseT) * 0.35;
        } else {
          p.mesh.rotation.x = 0;
          p.mesh.position.y = 0;
          p.body.rotation.x = 0;
          p.body.rotation.z = 0;
          p.isInjured = true;
          p.limpTimer = 60;
          p.state = 'walking';
          if (p.path.length === 0 || p.pathIndex >= p.path.length) {
            this.startTrip(p);
          }
        }
        this.updateRageSprite(p);
        continue;
      }

      // Stumble state: staggers back about 0.8 m over 0.5 s with arms out
      if (p.stumbleTimer > 0) {
        p.stumbleTimer = Math.max(0, p.stumbleTimer - dt);
        p.walkCycle += dt * 11;
        p.body.rotation.x = -0.26 * (p.stumbleTimer / 0.5);
        p.body.rotation.z = Math.sin(p.walkCycle) * 0.18;
        p.leftArm.rotation.x = -0.9;
        p.leftArm.rotation.z = -0.55;
        p.rightArm.rotation.x = -0.9;
        p.rightArm.rotation.z = 0.55;
        p.leftLeg.rotation.x = Math.sin(p.walkCycle) * 0.45;
        p.rightLeg.rotation.x = -Math.sin(p.walkCycle) * 0.45;
        if (p.stumbleTimer <= 0) {
          p.body.rotation.x = 0;
          p.body.rotation.z = 0;
          p.leftArm.rotation.z = -0.06;
          p.rightArm.rotation.z = 0.06;
        }
        this.updateRageSprite(p);
        continue;
      }

      // Sprint 15g: street fight (poses; positions and blows are driven by updateFights)
      if (p.state === 'brawl') {
        this.animateBrawl(p, dt);
        this.updateRageSprite(p);
        continue;
      }

      // Hostile state (GTA-style): chase after the vendor to beat him up
      if (p.state === 'hostile' && vendorPos) {
        p.rage = 100;
        p.hostileTimer -= dt;
        if (p.hostileTimer <= 0) {
          p.state = 'walking';
          p.rage = 30;
          p.body.rotation.x = 0;
          p.body.rotation.z = 0;
          this.updateRageSprite(p);
          continue;
        }

        const dx = vendorPos.x - p.mesh.position.x;
        const dz = vendorPos.z - p.mesh.position.z;
        const dist = Math.hypot(dx, dz) || 0.001;
        const dirX = dx / dist;
        const dirZ = dz / dist;

        const targetHeading = Math.atan2(dirX, -dirZ);
        let angleDiff = targetHeading - p.heading;
        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
        while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
        p.heading += angleDiff * Math.min(1, dt * 12);
        while (p.heading > Math.PI) p.heading -= Math.PI * 2;
        while (p.heading < -Math.PI) p.heading += Math.PI * 2;
        p.mesh.rotation.y = -p.heading;

        // Injured pedestrians chase with a limping fury; uninjured mob members sprint faster
        const chaseSpeed = p.isInjured ? 3.85 : 4.25;

        if (dist > 1.25) {
          if (stepHostileFn) {
            stepHostileFn(p.mesh, dirX, dirZ, chaseSpeed);
          } else {
            p.mesh.position.x += dirX * chaseSpeed * dt;
            p.mesh.position.z += dirZ * chaseSpeed * dt;
          }
        }

        p.walkCycle += dt * (dist < 1.85 ? 15 : chaseSpeed * 5.8);

        if (dist < 1.85) {
          // Melee beating / punching animation when close to vendor
          const punch = Math.sin(p.walkCycle);
          p.body.rotation.x = -0.18;
          p.body.rotation.z = punch * 0.12;
          p.leftArm.rotation.x = -1.35 + punch * 0.7;
          p.rightArm.rotation.x = -1.35 - punch * 0.7;
          p.leftLeg.rotation.x = -0.2;
          p.rightLeg.rotation.x = 0.2;
        } else {
          // Aggressive sprint animation (with injured limp if struck)
          const swing = Math.sin(p.walkCycle) * 0.65;
          p.leftLeg.rotation.x = -swing;
          p.rightLeg.rotation.x = swing;
          p.leftArm.rotation.x = -0.5 + swing * 0.9;
          p.rightArm.rotation.x = -0.5 - swing * 0.9;
          p.body.rotation.x = -0.14;
          p.body.rotation.z = p.isInjured ? Math.sin(p.walkCycle) * 0.16 : 0;
          p.body.position.y = p.body.userData.baseY + Math.abs(Math.sin(p.walkCycle * 2)) * 0.05;
        }
        this.updateRageSprite(p);
        continue;
      }

      // Non-hostile pedestrians with building rage: check if rage boiled over to 100%
      if (p.rage >= 100) {
        p.isEngagedInSale = false;
        p.state = 'hostile';
        p.hostileTimer = Math.max(p.hostileTimer, 22);
        this.updateRageSprite(p);
        continue;
      }

      if (p.rage > 0) {
        p.rage = Math.max(0, p.rage - dt * 2.8);
      }
      this.updateRageSprite(p);

      // When rage is >= 65% ("READY TO CHASE") and vendor is close, NPC glares and shakes fist in warning
      if (p.rage >= 65 && vendorPos && !p.isEngagedInSale) {
        const vdx = vendorPos.x - p.mesh.position.x;
        const vdz = vendorPos.z - p.mesh.position.z;
        const vdist = Math.hypot(vdx, vdz);
        if (vdist < 9.5) {
          p.walkCycle += dt * 9;
          const targetH = Math.atan2(vdx, -vdz);
          let diff = targetH - p.heading;
          while (diff > Math.PI) diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;
          p.heading += diff * Math.min(1, dt * 10);
          p.mesh.rotation.y = -p.heading;
          p.leftLeg.rotation.x = 0;
          p.rightLeg.rotation.x = 0;
          p.leftArm.rotation.x = -0.35;
          p.rightArm.rotation.x = -2.1 + Math.sin(p.walkCycle) * 0.45;
          continue;
        }
      }

      p.body.rotation.z = p.isInjured ? Math.sin(p.walkCycle) * 0.08 : 0;

      // Buying from the vendor: stand and haggle (hand gestures, head shakes).
      if (p.isEngagedInSale) {
        if (p.activity !== 'none') this.clearActivity(p);
        p.walkCycle += dt * 3;
        p.leftLeg.rotation.x = 0;
        p.rightLeg.rotation.x = 0;
        const talking = Math.sin(p.walkCycle * 0.5) > -0.2;
        p.rightArm.rotation.x = talking ? -0.75 + Math.sin(p.walkCycle * 2.4) * 0.3 : 0;
        p.rightArm.rotation.z = talking ? -0.15 : 0.06;
        p.leftArm.rotation.x = Math.sin(p.walkCycle * 0.5) < -0.6 ? -0.5 : 0;
        p.leftArm.rotation.z = -0.06;
        p.body.rotation.y = Math.sin(p.walkCycle * 1.7) * 0.09;
        continue;
      }

      // Hotspot customer waiting at the thela: face it, idle, give up when the time runs out.
      if (p.state === 'browsing') {
        if (!p.summonUntil || this.clock > p.summonUntil) {
          p.summonUntil = 0;
          p.state = 'idle';
          p.idleTimer = 0.5 + Math.random();
          continue;
        }
        const fx = (p.summonX ?? p.mesh.position.x) - p.mesh.position.x;
        const fz = (p.summonZ ?? p.mesh.position.z) - p.mesh.position.z;
        if (Math.hypot(fx, fz) > 0.01) { p.heading = Math.atan2(fx, -fz); p.mesh.rotation.y = -p.heading; }
        p.walkCycle += dt * 1.5;
        p.body.position.y = p.body.userData.baseY + Math.sin(p.walkCycle) * 0.015;
        p.leftLeg.rotation.x = 0; p.rightLeg.rotation.x = 0;
        p.leftArm.rotation.x = 0; p.rightArm.rotation.x = 0;
        continue;
      }

      // Sprint 10 activities: chatting in a group, phone call, browsing a stall, looking at a horn/accident.
      if (p.activity !== 'none') {
        this.updateActivity(p, dt);
        continue;
      }

      if (p.state === 'idle') {
        p.body.rotation.y = 0;
        p.leftArm.rotation.z = -0.06;
        p.rightArm.rotation.z = 0.06;
        p.idleTimer -= dt;
        // Subtle breathing animation during idle
        p.walkCycle += dt * 1.5;
        p.body.position.y = p.body.userData.baseY + Math.sin(p.walkCycle) * 0.015;
        p.leftLeg.rotation.x = 0;
        p.rightLeg.rotation.x = 0;
        p.leftArm.rotation.x = 0;
        p.rightArm.rotation.x = 0;

        if (p.idleTimer <= 0) this.startTrip(p);
        continue;
      }

      // Walking state: follow path waypoints
      if (p.path.length === 0 || p.pathIndex >= p.path.length) {
        this.arrive(p, 2.0 + Math.random() * 4.0); // Rest at shop/sidewalk corner
        continue;
      }

      const targetWaypoint = p.path[p.pathIndex];
      const dx = targetWaypoint.x - p.mesh.position.x;
      const dz = targetWaypoint.z - p.mesh.position.z;
      const dist = Math.hypot(dx, dz);

      if (dist < 0.45) {
        // Waypoint reached, advance to next
        p.pathIndex++;
        if (p.pathIndex >= p.path.length) {
          p.currentNodeId = p.targetNodeId;
          if (p.summonUntil && this.clock < p.summonUntil) {
            p.state = 'browsing';            // arrived at the thela: wait to be served
            continue;
          }
          this.arrive(p, 1.8 + Math.random() * 3.5);
          continue;
        }
      } else {
        // Move towards target waypoint
        const dirX = dx / dist;
        const dirZ = dz / dist;

        // Sprint 10: road crossings — stop at the kerb, look both ways, cross when no vehicle is close.
        if (this.probes && p.crossCheckedIndex !== p.pathIndex) {
          p.crossCheckedIndex = p.pathIndex;
          p.crossWait = 0;
          const mx = (p.mesh.position.x + targetWaypoint.x) / 2, mz = (p.mesh.position.z + targetWaypoint.z) / 2;
          p.crossingRoad = dist > 2.5 && this.probes.isOnCarriageway(mx, mz)
            && !this.probes.isOnCarriageway(p.mesh.position.x, p.mesh.position.z);
        }
        const hurryingToVendor = !!p.summonUntil && this.clock < p.summonUntil;
        if (p.crossingRoad && this.probes && p.crossWait < 6 && !hurryingToVendor) {
          const mx = (p.mesh.position.x + targetWaypoint.x) / 2, mz = (p.mesh.position.z + targetWaypoint.z) / 2;
          if (this.probes.vehicleNear(mx, mz, 11)) {
            p.crossWait += dt;
            p.walkCycle += dt * 1.5;
            p.body.rotation.y = Math.sin(this.clock * 1.6 + p.id) * 0.55;   // look left and right
            p.leftLeg.rotation.x = 0; p.rightLeg.rotation.x = 0;
            p.leftArm.rotation.x = 0; p.rightArm.rotation.x = 0;
            p.body.position.y = p.body.userData.baseY;
            continue;
          }
          p.crossWait = 99;                    // gap found: commit to crossing
        }
        p.body.rotation.y = 0;

        // Smoothly rotate towards heading (human model faces local -Z, so rotation.y = -heading)
        const targetHeading = Math.atan2(dirX, -dirZ);
        let angleDiff = targetHeading - p.heading;
        // Normalize angle diff to [-PI, PI]
        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
        while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
        p.heading += angleDiff * Math.min(1, dt * 8.5);
        while (p.heading > Math.PI) p.heading -= Math.PI * 2;
        while (p.heading < -Math.PI) p.heading += Math.PI * 2;
        p.mesh.rotation.y = -p.heading;

        // Scale forward step by alignment so NPCs pivot before walking after a 180° turn
        const alignment = Math.max(0, Math.cos(angleDiff));
        const hurrying = !!p.summonUntil && this.clock < p.summonUntil;     // customer heading to the thela
        const crossingNow = p.crossingRoad && p.crossWait >= 6;
        const walkSpeed = p.isInjured ? p.speed * 0.6
          : hurrying ? Math.max(2.6, p.speed * 1.9)
          : p.hurryTimer > 0 || crossingNow ? p.speed * 1.4
          : p.texting ? p.speed * 0.8 : p.speed;
        const moveDist = Math.min(dist, walkSpeed * alignment * dt);

        p.mesh.position.x += dirX * moveDist;
        p.mesh.position.z += dirZ * moveDist;

        // Animate natural limb swings during walking (with visible limp / holding head or arm if injured)
        p.walkCycle += walkSpeed * Math.max(0.35, alignment) * dt * 5.2;
        const swing = Math.sin(p.walkCycle) * (p.isInjured ? 0.32 : 0.45);
        p.leftLeg.rotation.x = -swing;
        p.rightLeg.rotation.x = p.isInjured ? swing * 0.45 : swing;
        p.leftArm.rotation.x = swing * 0.85;
        if (p.isInjured) {
          const holdHead = (p.id & 1) === 0;
          p.rightArm.rotation.x = holdHead ? -2.0 : -1.05;
          p.rightArm.rotation.z = -0.4;
          p.body.rotation.x = 0.14;
          p.body.rotation.z = Math.sin(p.walkCycle) * 0.14;
        } else if (p.texting && !crossingNow) {
          p.rightArm.rotation.x = -0.95;       // phone held in front, eyes down
          p.rightArm.rotation.z = -0.22;
          p.body.rotation.x = 0.06;
        } else {
          p.rightArm.rotation.x = -swing * 0.85;
          p.rightArm.rotation.z = 0.06;
          p.body.rotation.x = 0;
        }
        p.leftArm.rotation.z = -0.06;
        p.body.position.y = p.body.userData.baseY + Math.abs(Math.sin(p.walkCycle * 2)) * 0.04; // Torso step bob
      }
    }
    this.separateNearPedestrians(dt);
  }

  private clampOffRoad(fromX: number, fromZ: number, dx: number, dz: number, maxDist: number): { x: number; z: number } {
    const len = Math.hypot(dx, dz);
    if (len < 0.0001) return { x: fromX, z: fromZ };
    const capped = Math.min(len, maxDist);
    const ux = dx / len;
    const uz = dz / len;
    let bestX = fromX;
    let bestZ = fromZ;
    const steps = 4;
    for (let s = 1; s <= steps; s++) {
      const d = (capped * s) / steps;
      const cx = THREE.MathUtils.clamp(fromX + ux * d, -this.bounds.x, this.bounds.x);
      const cz = THREE.MathUtils.clamp(fromZ + uz * d, -this.bounds.z, this.bounds.z);
      if (this.probes?.isOnCarriageway(cx, cz)) break;
      bestX = cx;
      bestZ = cz;
    }
    return { x: bestX, z: bestZ };
  }

  /**
   * Sprint 15b — Contact check between the player (vendor + thela cart, or police officer)
   * and pedestrians, reusing checkRigCollision from collision.ts.
   * Returns true if the pedestrian hit was engaged in a sale (so the engine can interrupt it).
   */
  resolvePlayerContact(
    px: number,
    pz: number,
    heading: number,
    playerSpeed: number,
    isVendor: boolean,
    isLowQuality = false
  ): boolean {
    this.bloodDecals.setLowQuality(isLowQuality);
    let saleCustomerHit = false;
    const moveDirX = Math.sin(heading);
    const moveDirZ = -Math.cos(heading);
    const playerVx = moveDirX * playerSpeed;
    const playerVz = moveDirZ * playerSpeed;

    for (let i = 0; i < this.pedestrians.length; i++) {
      const p = this.pedestrians[i];
      if (!p.active || p.state === 'injured') continue;

      const pedX = p.mesh.position.x;
      const pedZ = p.mesh.position.z;
      // Quick bounding reject before exact rig check
      if (Math.abs(pedX - px) > 3.2 || Math.abs(pedZ - pz) > 3.2) continue;

      pedCollider.x = pedX;
      pedCollider.z = pedZ;
      const res = checkRigCollision(px, pz, heading, isVendor, pedCollider);
      if (!res.collided) continue;

      // Outward direction from the colliding rig circle toward the pedestrian
      let outX = -res.normalX;
      let outZ = -res.normalZ;
      const outLen = Math.hypot(outX, outZ);
      if (outLen > 0.0001) {
        outX /= outLen;
        outZ /= outLen;
      } else {
        outX = moveDirX;
        outZ = moveDirZ;
      }

      // Always separate overlap up to 1.5 m without pushing onto a carriageway
      const pushDist = Math.min(1.5, Math.max(0.08, res.penetration + 0.06));
      const pushed = this.clampOffRoad(pedX, pedZ, outX * pushDist, outZ * pushDist, 1.5);
      p.mesh.position.x = pushed.x;
      p.mesh.position.z = pushed.z;

      if (p.hitCooldown > 0) continue;

      // Interrupt any active sale with this customer immediately
      if (p.isEngagedInSale) {
        p.isEngagedInSale = false;
        p.summonUntil = 0;
        saleCustomerHit = true;
      }
      p.summonUntil = 0;
      if (p.activity !== 'none' || p.groupId !== 0) {
        this.clearActivity(p);
      }

      const approachDot = playerVx * outX + playerVz * outZ;
      const closingSpeed = approachDot < -0.15 ? 0 : Math.max(0, Math.abs(playerSpeed), approachDot);
      const isProtected = isChildOrSchoolArchetype(p.archetype);

      if (isProtected || closingSpeed < 1.5) {
        // Bump (< 1.5 m/s, or child/school-age archetype): step aside and turn to look; rage +8
        p.hitCooldown = 0.75;
        p.rage = Math.min(100, p.rage + 8);
        // Step aside perpendicular to vendor's heading (away from centerline)
        const sideSign = (pedX - px) * -moveDirZ + (pedZ - pz) * moveDirX >= 0 ? 1 : -1;
        const sideX = -moveDirZ * sideSign * 0.45 + outX * 0.25;
        const sideZ = moveDirX * sideSign * 0.45 + outZ * 0.25;
        const stepped = this.clampOffRoad(p.mesh.position.x, p.mesh.position.z, sideX, sideZ, 0.65);
        p.mesh.position.x = stepped.x;
        p.mesh.position.z = stepped.z;
        p.knockbackDist = 0;
        p.knockbackVx = 0;
        p.knockbackVz = 0;

        if (isProtected) {
          p.state = 'walking';
          p.hurryTimer = 6;
        } else {
          this.startActivity(p, 'look', 1.4, px, pz);
        }
      } else if (closingSpeed <= 3.5) {
        // Stumble (1.5–3.5 m/s): staggers back about 0.8 m over 0.5 s with arms out; rage +20
        p.hitCooldown = 0.95;
        p.rage = Math.min(100, p.rage + 20);
        p.stumbleTimer = 0.5;
        p.knockbackDist = 0;
        // Damped velocity with initial ~2.8 m/s integrates to ~0.8 m over 0.5 s (capped at 1.5 m)
        p.knockbackVx = outX * 2.8;
        p.knockbackVz = outZ * 2.8;
        p.heading = Math.atan2(-outX, outZ);
        p.mesh.rotation.y = -p.heading;
      } else {
        // Knock-down (> 3.5 m/s): falls hard, lies 3 s, gets up holding head/arm; rage +40; limps at 60% for 60 s
        p.hitCooldown = 4.4;
        p.rage = Math.min(100, p.rage + 40);
        p.damageTaken = Math.min(100, p.damageTaken + 40);
        p.isInjured = true;
        p.state = 'injured';
        p.injuredTimer = 4.2; // 3.0 s lying + 1.2 s getting up slowly
        p.stumbleTimer = 0;
        p.knockbackDist = 0;
        p.knockbackVx = outX * 3.4;
        p.knockbackVz = outZ * 3.4;
        // Face toward the impact so pitching +X tips their back and head along (outX, outZ)
        p.heading = Math.atan2(-outX, outZ);
        p.mesh.rotation.y = -p.heading;

        const restSpot = this.clampOffRoad(p.mesh.position.x, p.mesh.position.z, outX * 0.45, outZ * 0.45, 1.5);
        const headSpot = this.clampOffRoad(restSpot.x, restSpot.z, outX * 1.15, outZ * 1.15, 1.5);
        this.bloodDecals.spawnKnockdownBlood(headSpot.x, headSpot.z);
        this.notifyEvent('accident', restSpot.x, restSpot.z);
      }
      this.updateRageSprite(p);
    }

    return saleCustomerHit;
  }

  /**
   * Soft separation to 0.7 m between near-tier pedestrians only (p.lod === 'near'),
   * using an in-place sorted sweep along X (O(n), zero per-frame allocations).
   */
  private separateNearPedestrians(dt: number) {
    if (!(dt > 0)) return;
    let count = 0;
    for (let i = 0; i < this.pedestrians.length; i++) {
      const p = this.pedestrians[i];
      if (p.active && p.lod === 'near' && p.state !== 'injured') {
        this.nearBuffer[count++] = p;
      }
    }
    this.nearBuffer.length = count;
    if (count < 2) return;

    // In-place insertion sort by X coordinate
    for (let i = 1; i < count; i++) {
      const cur = this.nearBuffer[i];
      const curX = cur.mesh.position.x;
      let j = i - 1;
      while (j >= 0 && this.nearBuffer[j].mesh.position.x > curX) {
        this.nearBuffer[j + 1] = this.nearBuffer[j];
        j--;
      }
      this.nearBuffer[j + 1] = cur;
    }

    const minSep = 0.7;
    const minSepSq = minSep * minSep;
    const maxStep = Math.min(0.18, dt * 2.6);
    for (let i = 0; i < count; i++) {
      const a = this.nearBuffer[i];
      const ax = a.mesh.position.x;
      const az = a.mesh.position.z;
      for (let j = i + 1; j < count; j++) {
        const b = this.nearBuffer[j];
        const dx = b.mesh.position.x - ax;
        if (dx >= minSep) break;
        const dz = b.mesh.position.z - az;
        const d2 = dx * dx + dz * dz;
        if (d2 >= minSepSq) continue;
        const d = Math.sqrt(d2);
        const nx = d > 0.0001 ? dx / d : 1;
        const nz = d > 0.0001 ? dz / d : 0;
        const push = Math.min((minSep - d) * 0.5, maxStep);

        const aNextX = THREE.MathUtils.clamp(a.mesh.position.x - nx * push, -this.bounds.x, this.bounds.x);
        const aNextZ = THREE.MathUtils.clamp(a.mesh.position.z - nz * push, -this.bounds.z, this.bounds.z);
        if (!this.probes?.isOnCarriageway(aNextX, aNextZ)) {
          a.mesh.position.x = aNextX;
          a.mesh.position.z = aNextZ;
        }

        const bNextX = THREE.MathUtils.clamp(b.mesh.position.x + nx * push, -this.bounds.x, this.bounds.x);
        const bNextZ = THREE.MathUtils.clamp(b.mesh.position.z + nz * push, -this.bounds.z, this.bounds.z);
        if (!this.probes?.isOnCarriageway(bNextX, bNextZ)) {
          b.mesh.position.x = bNextX;
          b.mesh.position.z = bNextZ;
        }
      }
    }
  }

  /**
   * Hotspot crowd: send up to `max` nearby, free pedestrians (within `radius` m) to stand around the
   * vendor at (x, z) and wait up to `waitSeconds` to buy. Returns how many are coming.
   */
  summonCustomers(x: number, z: number, max: number, radius: number, waitSeconds = 25): number {
    const goal = this.graph.findNearestNode(x, z);
    const routeLength = (fromX: number, fromZ: number, route: Array<{ x: number; z: number }>) => {
      let walk = route.length ? Math.hypot(route[0].x - fromX, route[0].z - fromZ) : 0;
      for (let k = 1; k < route.length; k++) walk += Math.hypot(route[k].x - route[k - 1].x, route[k].z - route[k - 1].z);
      return walk;
    };
    // Sprint 10: only people with a fairly direct walk come over (the real footpath network can
    // turn 55 m as the crow flies into a 400 m detour around a block).
    const direct = (fromX: number, fromZ: number, startNode: number) => {
      const route = this.graph.findAStarPath(startNode, goal);
      const straight = Math.hypot(fromX - x, fromZ - z);
      const walk = routeLength(fromX, fromZ, route);
      return walk <= Math.max(straight * 1.8, straight + 35) ? { route, walk } : null;
    };
    const chosen: Array<{ p: PedestrianNPC; route: Array<{ x: number; z: number }> }> = [];
    const nearby = this.pedestrians
      .filter((p) => p.active && p.groupId === 0 && !p.hasBought && !p.isEngagedInSale && !p.summonUntil && (p.state === 'walking' || p.state === 'idle'))
      .map((p) => ({ p, d: Math.hypot(p.mesh.position.x - x, p.mesh.position.z - z) }))
      .filter((e) => e.d <= radius && e.d > 1.5)
      .sort((a, b) => a.d - b.d);
    for (const { p } of nearby) {
      if (chosen.length >= max) break;
      const ok = direct(p.mesh.position.x, p.mesh.position.z, this.graph.findNearestNode(p.mesh.position.x, p.mesh.position.z));
      if (ok) chosen.push({ p, route: ok.route });
    }
    // Not enough people nearby: bring in pedestrians who are out of view (> 90 m), placing them on
    // a footpath 45-60 m away so they visibly walk in (never seen teleporting).
    if (chosen.length < max) {
      // Parked (off-street) people count as far away: bringing them in also refills the street.
      const far = this.pedestrians
        .filter((p) => p.groupId === 0 && !p.hasBought && !p.isEngagedInSale && !p.summonUntil && p.state !== 'hostile' && p.state !== 'injured' && p.state !== 'brawl'
          && (!p.active || Math.hypot(p.mesh.position.x - x, p.mesh.position.z - z) > 90));
      const ring = this.graph.nodes.filter((n) => { const d = Math.hypot(n.x - x, n.z - z); return d >= 45 && d <= 60; });
      // shuffle the ring, then keep only spots with a direct walk to the thela
      for (let i = ring.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [ring[i], ring[j]] = [ring[j], ring[i]]; }
      const spots: Array<{ n: (typeof ring)[number]; route: Array<{ x: number; z: number }> }> = [];
      for (const n of ring) {
        if (spots.length >= max - chosen.length) break;
        const ok = direct(n.x, n.z, n.id);
        if (ok) spots.push({ n, route: ok.route });
      }
      for (const p of far) {
        const spot = spots.shift();
        if (!spot || chosen.length >= max) break;
        p.mesh.position.set(spot.n.x, p.mesh.position.y, spot.n.z);
        p.currentNodeId = spot.n.id;
        p.active = true;
        chosen.push({ p, route: spot.route });
      }
    }
    chosen.forEach(({ p, route }, idx) => {
      const ang = (idx / Math.max(1, chosen.length)) * Math.PI * 1.4 - Math.PI * 0.7 + Math.PI;   // fan out around the cart
      const tx = x + Math.sin(ang) * 2.4, tz = z + Math.cos(ang) * 2.4;
      p.path = [...route, { x: tx, z: tz }];
      p.pathIndex = 0;
      p.targetNodeId = goal;
      p.state = 'walking';
      this.clearActivity(p);
      p.texting = false;
      p.crossCheckedIndex = -1;
      // waiting time starts on arrival: allow for the walk (they hurry, ~2.6 m/s)
      const walk = routeLength(p.mesh.position.x, p.mesh.position.z, p.path);
      p.summonUntil = this.clock + walk / 2.6 + waitSeconds;
      p.summonX = x; p.summonZ = z;
    });
    return chosen.length;
  }

  /** Vendor left the spot: waiting customers go back to wandering. */
  releaseSummoned() {
    for (const p of this.pedestrians) {
      if (!p.summonUntil || p.isEngagedInSale) continue;
      p.summonUntil = 0;
      if (p.state === 'browsing') { p.state = 'idle'; p.idleTimer = 0.5 + Math.random(); }
    }
  }

  /** A completed sale: this person will not buy again today. If everyone has bought, a fresh wave of customers starts. */
  markBought(p: PedestrianNPC) {
    p.hasBought = true;
    if (!this.pedestrians.some((q) => !q.hasBought)) for (const q of this.pedestrians) q.hasBought = false;
  }

  get summonedCount() { return this.pedestrians.filter((p) => p.summonUntil && p.summonUntil > this.clock).length; }

  getNearestPedestrian(x: number, z: number): { pedestrian: PedestrianNPC | null; distance: number } {
    let nearest: PedestrianNPC | null = null;
    let minDist = Infinity;
    for (const p of this.pedestrians) {
      if (!p.active || p.hasBought || p.state === 'injured' || p.state === 'hostile' || p.state === 'brawl') continue;
      const d = Math.hypot(p.mesh.position.x - x, p.mesh.position.z - z);
      if (d < minDist) {
        minDist = d;
        nearest = p;
      }
    }
    return { pedestrian: nearest, distance: minDist };
  }

  // ======================================================================================
  // Sprint 10 — crowd behaviour, density by time of day, and distance-based detail
  // ======================================================================================

  /** Drive density and hotspot pull from the working-day clock (minutes after midnight). */
  setTimeOfDay(minutes: number) {
    this.minutes = Number.isFinite(minutes) ? minutes : null;
  }

  /** Let pedestrians wait at kerbs for traffic. Pass null to disable. */
  setRoadProbes(probes: CrowdRoadProbes | null) {
    this.probes = probes;
    for (const p of this.pedestrians) { p.crossCheckedIndex = -1; p.crossingRoad = false; }
  }

  /** Stalls / shop fronts that people stop and browse at. */
  setBrowsePoints(points: BrowsePoint[]) {
    this.browse = points.map((b) => ({ ...b, node: this.graph.findNearestNode(b.x, b.z) }));
  }

  /**
   * Street event at (x, z). 'horn': people nearby glance at it; anyone on the carriageway hurries.
   * 'accident': nearby people stop and look; a few walk over and watch for a while (non-graphic).
   */
  notifyEvent(kind: 'horn' | 'accident', x: number, z: number) {
    const near = (p: PedestrianNPC, r: number) => Math.hypot(p.mesh.position.x - x, p.mesh.position.z - z) <= r;
    if (kind === 'horn') {
      for (const p of this.pedestrians) {
        if (!this.isFree(p, true) || !near(p, 14)) continue;
        if (this.probes?.isOnCarriageway(p.mesh.position.x, p.mesh.position.z)) { p.hurryTimer = 2.5; continue; }
        this.startActivity(p, 'look', 0.8 + Math.random() * 0.8, x, z);
      }
      return;
    }
    // People chatting close by break off and turn to watch as well.
    for (const p of this.pedestrians) {
      if (p.active && p.activity === 'chat' && !p.isEngagedInSale && near(p, 15)) {
        this.clearActivity(p);
        this.startActivity(p, 'look', 3 + Math.random() * 2, x, z);
      }
    }
    const watchers = this.pedestrians
      .filter((p) => this.isFree(p, true) && near(p, 30))
      .map((p) => ({ p, d: Math.hypot(p.mesh.position.x - x, p.mesh.position.z - z) }))
      .sort((a, b) => a.d - b.d);
    const onlookers = 3 + Math.floor(Math.random() * 4);
    let sent = 0;
    for (const { p, d } of watchers) {
      if (d <= 12) { this.startActivity(p, 'look', 2 + Math.random() * 1.5, x, z); continue; }
      if (sent >= onlookers) continue;
      // walk to a ring 5–7 m from the spot, then stand and watch
      const ang = Math.atan2(p.mesh.position.x - x, p.mesh.position.z - z) + (Math.random() - 0.5) * 0.8;
      const r = 5 + Math.random() * 2;
      const tx = x + Math.sin(ang) * r, tz = z + Math.cos(ang) * r;
      if (this.probes?.isOnCarriageway(tx, tz)) continue;
      this.walkTo(p, tx, tz, 'look', 8 + Math.random() * 4, x, z);
      sent++;
    }
  }

  /**
   * Distance-based detail. Call once per frame after update(). The nearest `nearBudget` people (and
   * anyone buying, summoned or angry) are drawn with their own rig; the rest within `viewDistance`
   * are drawn by 3 instanced meshes; beyond that nobody is drawn. Replaces the engine's own
   * "hide beyond 90 m" loop.
   */
  updateDetail(camX: number, camZ: number, nearBudget = 16, viewDistance = 90, nearRadius = 40) {
    if (this.disposed) return;
    this.lastCam = { x: camX, z: camZ };
    this.refreshFocus();
    const forced = (p: PedestrianNPC) =>
      p.isEngagedInSale || (!!p.summonUntil && p.summonUntil > this.clock) ||
      p.state === 'hostile' || p.state === 'injured' || p.state === 'brawl' || !!p.rageSprite?.visible;

    this.detailTimer -= 1;
    if (this.detailTimer <= 0) {
      this.detailTimer = 12;                       // re-pick the near set every ~12 frames
      const ranked: Array<{ p: PedestrianNPC; score: number; must: boolean }> = [];
      for (const p of this.pedestrians) {
        if (!p.active) continue;
        const d = Math.hypot(p.mesh.position.x - camX, p.mesh.position.z - camZ);
        const must = forced(p);
        if (!must && d >= Math.min(nearRadius, viewDistance)) continue;
        ranked.push({ p, score: d - (this.nearSet.has(p) ? 3 : 0), must });
      }
      ranked.sort((a, b) => (a.must === b.must ? a.score - b.score : a.must ? -1 : 1));
      this.nearSet.clear();
      const cap = nearBudget + 6;                  // forced people may exceed the budget a little
      for (const r of ranked) {
        if (this.nearSet.size >= (r.must ? cap : nearBudget)) continue;
        this.nearSet.add(r.p);
      }
    }

    if (this.detailTimer === 12) this.updateRigShadows();

    this.impostors.begin();
    for (const p of this.pedestrians) {
      if (!p.active) { p.mesh.visible = false; p.lod = 'hidden'; continue; }
      const d = Math.hypot(p.mesh.position.x - camX, p.mesh.position.z - camZ);
      if (d >= viewDistance && !forced(p)) { p.mesh.visible = false; p.lod = 'hidden'; continue; }
      if (this.nearSet.has(p)) { p.mesh.visible = true; p.lod = 'near'; continue; }
      p.mesh.visible = false;
      p.lod = 'far';
      const scale = p.mesh.scale.x;
      const moving = p.state === 'walking' && !p.isEngagedInSale && !(p.crossingRoad && p.crossWait > 0 && p.crossWait < 6);
      this.impostors.add({
        x: p.mesh.position.x,
        z: p.mesh.position.z,
        heading: p.heading,
        scale,
        swing: moving ? Math.sin(p.walkCycle) * 0.45 : 0,
        bob: (p.body.position.y - (p.body.userData.baseY ?? 0)) * scale,
        shirt: p.colors.shirt,
        bottom: p.colors.bottom,
        skin: p.colors.skin
      });
    }
    this.impostors.end();
  }

  /** Perf: every shadow caster is drawn once per shadow cascade, so only the nearest few rigs cast shadows. */
  private updateRigShadows(maxCasters = 6) {
    let rank = 0;
    const casters = new Set<PedestrianNPC>();
    for (const p of this.nearSet) { if (rank++ < maxCasters) casters.add(p); }
    for (const p of this.pedestrians) {
      const want = casters.has(p);
      if (p.castsShadow === want) continue;
      p.castsShadow = want;
      p.mesh.traverse((o) => { if ((o as THREE.Mesh).isMesh) o.castShadow = want; });
    }
  }

  /** Counts for the dev overlay / tests. */
  get crowdStats() {
    let active = 0, near = 0, far = 0, chatting = 0, phones = 0, browsing = 0, watching = 0, waiting = 0;
    for (const p of this.pedestrians) {
      if (!p.active) continue;
      active++;
      if (p.lod === 'near') near++; else if (p.lod === 'far') far++;
      if (p.activity === 'chat') chatting++;
      if (p.activity === 'phone_call' || p.texting) phones++;
      if (p.activity === 'stall') browsing++;
      if (p.activity === 'look') watching++;
      if (p.crossingRoad && p.crossWait > 0 && p.crossWait < 6) waiting++;
    }
    return { pool: this.poolSize, active, near, far, impostors: this.impostors.drawn, chatting, phones, browsing, watching, waitingToCross: waiting, groups: this.groupEnds.size };
  }

  // ---------------------------------------------------------------- Sprint 15g: street fights
  /** Fights get more frequent as the street gets angrier (rage multiplier 1 = about every 60 s, 1.5 = about every 40 s). */
  setFightRate(rageMultiplier: number) {
    this.fightEvery = 60 / Math.max(0.5, Number.isFinite(rageMultiplier) ? rageMultiplier : 1);
  }

  /** Where a fight is going on right now (for officers to walk to), or null. */
  activeFightPoint(): { x: number; z: number } | null {
    const f = this.fights[0];
    return f ? { x: f.cx, z: f.cz } : null;
  }

  /** Two free adults square up: walk to each other, argue, trade blows; the loser is knocked down and bleeds. */
  startFight(a: PedestrianNPC, b: PedestrianNPC): boolean {
    if (a === b || a.fight || b.fight || !this.isFree(a, true) || !this.isFree(b, true)) return false;
    if (isChildOrSchoolArchetype(a.archetype) || isChildOrSchoolArchetype(b.archetype)) return false;
    for (const p of [a, b]) {
      this.clearActivity(p);
      p.path = []; p.pathIndex = 0; p.texting = false;
      p.state = 'brawl';
      p.rage = Math.max(p.rage, 55);
    }
    const rec: FightRec = {
      a, b, phase: 'approach', t: 0, blows: 0, maxBlows: 3 + Math.floor(Math.random() * 3), swing: 0,
      attacker: 0, blowIn: 0.4, winner: null,
      cx: (a.mesh.position.x + b.mesh.position.x) / 2, cz: (a.mesh.position.z + b.mesh.position.z) / 2,
    };
    a.fight = rec; b.fight = rec;
    this.fights.push(rec);
    this.fightsStarted++;
    let watchers = 0;                                  // people nearby stop and watch
    for (const p of this.pedestrians) {
      if (watchers >= 6) break;
      if (p === a || p === b || !this.isFree(p, true)) continue;
      if (Math.hypot(p.mesh.position.x - rec.cx, p.mesh.position.z - rec.cz) > 14) continue;
      this.startActivity(p, 'look', 10 + Math.random() * 4, rec.cx, rec.cz);
      watchers++;
    }
    return true;
  }

  /** The nearest pair of free near-tier adults (6–38 m from the camera, within 12 m of each other) starts a fight. */
  private tryStartFight() {
    const cam = this.lastCam;
    if (!cam) return;
    let pa: PedestrianNPC | null = null, pb: PedestrianNPC | null = null, best = 12;
    const ped = this.pedestrians;
    for (let i = 0; i < ped.length; i++) {
      const a = ped[i];
      if (a.lod !== 'near' || !this.isFree(a)) continue;
      const da = Math.hypot(a.mesh.position.x - cam.x, a.mesh.position.z - cam.z);
      if (da < 6 || da > 38) continue;
      for (let j = i + 1; j < ped.length; j++) {
        const b = ped[j];
        if (b.lod !== 'near' || !this.isFree(b)) continue;
        const d = Math.hypot(a.mesh.position.x - b.mesh.position.x, a.mesh.position.z - b.mesh.position.z);
        if (d >= 1.5 && d < best) { best = d; pa = a; pb = b; }
      }
    }
    if (pa && pb) this.startFight(pa, pb);
  }

  private updateFights(dt: number) {
    this.fightTimer -= dt;
    if (this.fightTimer <= 0) {
      this.fightTimer = this.fightEvery * (0.7 + Math.random() * 0.6);
      if (this.fights.length < this.maxFights) this.tryStartFight();
    }
    for (let i = this.fights.length - 1; i >= 0; i--) {
      const rec = this.fights[i], a = rec.a, b = rec.b;
      const alive = rec.phase === 'aftermath'
        ? !!rec.winner && rec.winner.active && rec.winner.state === 'brawl'
        : a.active && b.active && a.state === 'brawl' && b.state === 'brawl';   // knocked down by the vendor etc. ends it
      if (!alive) { this.endFight(rec, i, 'interrupted'); continue; }
      rec.t += dt;
      const ax = a.mesh.position.x, az = a.mesh.position.z, bx = b.mesh.position.x, bz = b.mesh.position.z;
      rec.cx = (ax + bx) / 2; rec.cz = (az + bz) / 2;
      if (rec.phase !== 'aftermath') {
        let police = false;
        for (let k = 0; k < this.officers.length && !police; k++) {
          police = Math.hypot(this.officers[k].x - rec.cx, this.officers[k].z - rec.cz) < 14;
        }
        if (police) { this.endFight(rec, i, 'dispersed'); continue; }   // an officer is close: everyone scatters
      }
      const dist = Math.hypot(bx - ax, bz - az);
      if (rec.phase === 'approach') {
        if (dist > 1.05) {
          const ux = (bx - ax) / dist, uz = (bz - az) / dist, step = Math.min(1.8 * dt, (dist - 1.0) / 2);
          const sa = this.clampOffRoad(ax, az, ux * step, uz * step, step + 0.01);
          const sb = this.clampOffRoad(bx, bz, -ux * step, -uz * step, step + 0.01);
          a.mesh.position.x = sa.x; a.mesh.position.z = sa.z; b.mesh.position.x = sb.x; b.mesh.position.z = sb.z;
        }
        if (dist <= 1.1 || rec.t > 4) { rec.phase = 'faceoff'; rec.t = 0; }
      } else if (rec.phase === 'faceoff') {
        if (rec.t >= 1.6) { rec.phase = 'brawl'; rec.t = 0; rec.blowIn = 0.3; }
      } else if (rec.phase === 'brawl') {
        rec.swing = Math.max(0, rec.swing - dt / 0.3);
        rec.blowIn -= dt;
        if (rec.blowIn <= 0) this.fightBlow(rec);
      } else if (rec.t >= 1.4) {
        this.endFight(rec, i, 'finished');       // the winner has caught their breath and walks off
      }
    }
  }

  private fightBlow(rec: FightRec) {
    rec.attacker = rec.attacker === 0 ? 1 : 0;
    const att = rec.attacker === 0 ? rec.a : rec.b, vic = att === rec.a ? rec.b : rec.a;
    rec.swing = 1; rec.blows++; rec.blowIn = 0.55 + Math.random() * 0.45;
    const dx = vic.mesh.position.x - att.mesh.position.x, dz = vic.mesh.position.z - att.mesh.position.z, d = Math.hypot(dx, dz) || 1;
    vic.knockbackDist = 0; vic.knockbackVx = dx / d * 1.1; vic.knockbackVz = dz / d * 1.1;
    vic.damageTaken = Math.min(100, vic.damageTaken + 12);
    vic.rage = Math.min(100, vic.rage + 6);
    if (rec.blows >= rec.maxBlows) {
      rec.winner = att; rec.phase = 'aftermath'; rec.t = 0;
      vic.fight = null;
      this.fightKnockDown(vic, att);
    }
  }

  /** Same fall as a hard thela hit: lies 3 s, gets up holding the head, limps for a minute, blood pools on the ground. */
  private fightKnockDown(p: PedestrianNPC, from: PedestrianNPC) {
    const dx = p.mesh.position.x - from.mesh.position.x, dz = p.mesh.position.z - from.mesh.position.z, d = Math.hypot(dx, dz) || 1;
    const outX = dx / d, outZ = dz / d;
    p.hitCooldown = 4.4;
    p.rage = Math.min(100, p.rage + 30);
    p.damageTaken = Math.min(100, p.damageTaken + 40);
    p.isInjured = true; p.state = 'injured'; p.injuredTimer = 4.2; p.stumbleTimer = 0;
    p.knockbackDist = 0; p.knockbackVx = outX * 3.0; p.knockbackVz = outZ * 3.0;
    p.heading = Math.atan2(-outX, outZ); p.mesh.rotation.y = -p.heading;
    const rest = this.clampOffRoad(p.mesh.position.x, p.mesh.position.z, outX * 0.45, outZ * 0.45, 1.5);
    const head = this.clampOffRoad(rest.x, rest.z, outX * 1.15, outZ * 1.15, 1.5);
    this.bloodDecals.spawnKnockdownBlood(head.x, head.z);
  }

  private endFight(rec: FightRec, index: number, reason: 'finished' | 'dispersed' | 'interrupted') {
    const release = (p: PedestrianNPC) => {
      p.fight = null;
      if (p.state !== 'brawl') return;               // knocked down: the injured routine takes over
      p.state = 'walking';
      p.hurryTimer = reason === 'dispersed' ? 6 : 3;
      this.resetPose(p);
      this.startTrip(p);
    };
    release(rec.a); release(rec.b);
    this.fights.splice(index, 1);
  }

  private resetPose(p: PedestrianNPC) {
    p.mesh.rotation.x = 0; p.mesh.position.y = 0;
    p.body.rotation.x = 0; p.body.rotation.z = 0;
    p.leftArm.rotation.set(0, 0, -0.06); p.rightArm.rotation.set(0, 0, 0.06);
    p.leftLeg.rotation.set(0, 0, 0); p.rightLeg.rotation.set(0, 0, 0);
  }

  /** Fighters face each other: fists up while closing in, a pointing argument, then punches and recoil. */
  private animateBrawl(p: PedestrianNPC, dt: number) {
    const rec = p.fight;
    if (!rec) { p.state = 'walking'; this.resetPose(p); return; }
    const isA = rec.a === p, partner = isA ? rec.b : rec.a;
    const dx = partner.mesh.position.x - p.mesh.position.x, dz = partner.mesh.position.z - p.mesh.position.z;
    if (Math.abs(dx) + Math.abs(dz) > 0.01) {
      let diff = Math.atan2(dx, -dz) - p.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      p.heading += diff * Math.min(1, dt * 10);
      p.mesh.rotation.y = -p.heading;
    }
    p.walkCycle += dt * (rec.phase === 'approach' ? 9 : 4);
    const wob = Math.sin(p.walkCycle);
    const myTurn = rec.attacker === (isA ? 0 : 1);
    const hit = rec.phase === 'brawl' && myTurn ? rec.swing : 0;
    const taken = rec.phase === 'brawl' && !myTurn ? rec.swing : 0;
    p.mesh.position.y = 0;
    if (rec.phase === 'approach') {
      p.leftLeg.rotation.x = wob * 0.5; p.rightLeg.rotation.x = -wob * 0.5;
      p.leftArm.rotation.set(-0.9, 0, -0.2); p.rightArm.rotation.set(-0.9, 0, 0.2);
      p.body.rotation.x = 0.08;
    } else if (rec.phase === 'faceoff') {
      p.leftLeg.rotation.x = -0.15; p.rightLeg.rotation.x = 0.15;
      p.rightArm.rotation.set(-1.45 + wob * 0.2, 0, 0.1); p.leftArm.rotation.set(-0.55, 0, -0.15);
      p.body.rotation.x = 0.1; p.body.rotation.z = wob * 0.07;
    } else if (rec.phase === 'brawl') {
      p.leftLeg.rotation.x = -0.28; p.rightLeg.rotation.x = 0.28;
      p.rightArm.rotation.set(-1.0 - 1.0 * hit, 0, 0.15); p.leftArm.rotation.set(-0.95 + 0.4 * taken, 0, -0.15);
      p.body.rotation.x = 0.12 + 0.3 * hit - 0.28 * taken; p.body.rotation.z = wob * 0.06;
    } else {
      p.leftLeg.rotation.x = 0; p.rightLeg.rotation.x = 0;
      p.leftArm.rotation.set(0.1, 0, -0.1); p.rightArm.rotation.set(0.1, 0, 0.1);
      p.body.rotation.x = 0.16 + Math.sin(p.walkCycle * 1.5) * 0.05; p.body.rotation.z = 0;
    }
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.impostors.dispose();
    this.bloodDecals.dispose();
    for (const p of this.pedestrians) {
      p.rageTexture?.dispose();
      (p.rageSprite?.material as THREE.SpriteMaterial | undefined)?.dispose();
      p.mesh.removeFromParent();
    }
  }

  // ---- internals ------------------------------------------------------------------------

  private groupEnds = new Map<number, number>();

  /** Available for a new activity: on the street, not buying, not summoned, not angry, not in a group. */
  private isFree(p: PedestrianNPC, allowLooking = false) {
    return p.active && !p.isEngagedInSale && !(p.summonUntil && p.summonUntil > this.clock)
      && (p.state === 'walking' || p.state === 'idle') && p.groupId === 0 && p.pendingActivity === 'none'
      && (p.activity === 'none' || (allowLooking && p.activity === 'look')) && p.rage < 40;
  }

  private clearActivity(p: PedestrianNPC) {
    p.activity = 'none';
    p.activityTimer = 0;
    p.pendingActivity = 'none';
    p.pendingTimer = 0;
    p.groupId = 0;
    p.crossWait = 0;
    p.body.rotation.x = 0;
    p.body.rotation.y = 0;
    p.leftArm.rotation.z = -0.06;
    p.rightArm.rotation.z = 0.06;
  }

  private startActivity(p: PedestrianNPC, activity: PedestrianActivity, seconds: number, lookX?: number, lookZ?: number) {
    p.activity = activity;
    p.activityTimer = seconds;
    p.state = 'idle';
    p.idleTimer = 0;
    p.texting = false;
    if (lookX !== undefined && lookZ !== undefined) { p.lookX = lookX; p.lookZ = lookZ; }
    else { p.lookX = p.mesh.position.x + Math.sin(p.heading); p.lookZ = p.mesh.position.z - Math.cos(p.heading); }
  }

  /** Walk along the footpaths to (x, z), then start `activity`. */
  private walkTo(p: PedestrianNPC, x: number, z: number, activity: PedestrianActivity, seconds: number, lookX: number, lookZ: number) {
    const start = this.graph.findNearestNode(p.mesh.position.x, p.mesh.position.z);
    const goal = this.graph.findNearestNode(x, z);
    const route = this.graph.findAStarPath(start, goal);
    p.path = [...route, { x, z }];
    p.pathIndex = 0;
    p.targetNodeId = goal;
    p.state = 'walking';
    p.activity = 'none';
    p.pendingActivity = activity;
    p.pendingTimer = seconds;
    p.lookX = lookX; p.lookZ = lookZ;
    p.crossCheckedIndex = -1;
    p.texting = false;
  }

  /** New trip from an idle stop: hotspot / random footpath node, sometimes a stall to browse. */
  private startTrip(p: PedestrianNPC) {
    p.crossCheckedIndex = -1;
    p.texting = p.phoneUser && Math.random() < 0.35;
    if (this.browse.length && Math.random() < 0.18) {
      const b = this.browse[Math.floor(Math.random() * this.browse.length)];
      if (Math.hypot(b.x - p.mesh.position.x, b.z - p.mesh.position.z) < 220) {
        const jitter = (Math.random() - 0.5) * 1.6;
        const fx = b.fx ?? 0, fz = b.fz ?? 1;
        // stand at the stall front (sideways jitter along the front), facing the stall
        const sx = b.x + fz * jitter, sz = b.z - fx * jitter;
        this.walkTo(p, sx, sz, 'stall', 6 + Math.random() * 8, sx - fx, sz - fz);
        p.texting = false;
        return;
      }
    }
    const newTargetId = this.pickDestination(p.currentNodeId);
    p.targetNodeId = newTargetId;
    const fullPath = this.graph.findAStarPath(p.currentNodeId, newTargetId);
    p.path = fullPath.length > 1 ? fullPath.slice(1) : fullPath;
    p.pathIndex = 0;
    p.state = 'walking';
  }

  /** End of a walk: start the planned activity, sometimes take a phone call, else rest. */
  private arrive(p: PedestrianNPC, rest: number) {
    p.texting = false;
    p.crossingRoad = false;
    p.body.rotation.x = 0;
    p.rightArm.rotation.z = 0.06;
    p.currentNodeId = this.graph.findNearestNode(p.mesh.position.x, p.mesh.position.z);
    if (p.pendingActivity !== 'none') {
      const activity = p.pendingActivity;
      let seconds = p.pendingTimer;
      if (activity === 'chat') {
        const end = this.groupEnds.get(p.groupId);
        seconds = end !== undefined ? end - this.clock : 0;
      }
      p.pendingActivity = 'none';
      p.pendingTimer = 0;
      if (seconds > 0.5) {
        const gid = p.groupId;
        this.startActivity(p, activity, seconds, p.lookX, p.lookZ);
        p.groupId = gid;
        return;
      }
      p.groupId = 0;
    }
    p.state = 'idle';
    p.idleTimer = rest;
    if (p.phoneUser && Math.random() < 0.22) this.startActivity(p, 'phone_call', 5 + Math.random() * 9);
  }

  private faceLook(p: PedestrianNPC, dt: number, rate = 8) {
    const fx = p.lookX - p.mesh.position.x, fz = p.lookZ - p.mesh.position.z;
    if (Math.hypot(fx, fz) < 0.05) return;
    const target = Math.atan2(fx, -fz);
    let diff = target - p.heading;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    p.heading += diff * Math.min(1, dt * rate);
    p.mesh.rotation.y = -p.heading;
  }

  private updateActivity(p: PedestrianNPC, dt: number) {
    p.activityTimer -= dt;
    p.walkCycle += dt * 1.5;
    p.leftLeg.rotation.x = 0;
    p.rightLeg.rotation.x = 0;
    p.body.position.y = p.body.userData.baseY + Math.sin(p.walkCycle) * 0.012;
    this.faceLook(p, dt);
    const t = this.clock + p.id * 1.37;
    switch (p.activity) {
      case 'chat': {
        // take turns talking: gesture while "speaking", nod while listening
        const speaking = Math.sin(t * 0.7) > 0.25;
        p.rightArm.rotation.x = speaking ? -0.55 + Math.sin(t * 4.2) * 0.3 : 0;
        p.rightArm.rotation.z = speaking ? -0.12 : 0.06;
        p.leftArm.rotation.x = speaking && Math.sin(t * 1.3) > 0.6 ? -0.4 : 0;
        p.body.rotation.x = speaking ? 0 : Math.max(0, Math.sin(t * 2.6)) * 0.06;
        p.body.rotation.y = Math.sin(t * 0.45) * 0.1;
        break;
      }
      case 'phone_call':
        p.rightArm.rotation.x = -2.05;         // phone at the ear
        p.rightArm.rotation.z = -0.5;
        p.leftArm.rotation.x = Math.sin(t * 0.9) > 0.7 ? -0.35 : 0;
        p.body.rotation.y = Math.sin(t * 0.5) * 0.25;   // turns about while talking
        break;
      case 'stall':
        p.body.rotation.x = 0.12;              // leaning in to look at the goods
        p.rightArm.rotation.x = Math.sin(t * 0.8) > 0.75 ? -1.1 : 0;    // points at something now and then
        p.rightArm.rotation.z = 0.06;
        p.leftArm.rotation.x = 0;
        p.body.rotation.y = Math.sin(t * 0.6) * 0.15;
        break;
      case 'look': {
        const long = p.activityTimer > 3;
        p.rightArm.rotation.x = long && Math.sin(t * 0.9) > 0.55 ? -1.4 : 0;  // pointing
        p.rightArm.rotation.z = 0.06;
        p.leftArm.rotation.x = 0;
        p.body.rotation.x = 0;
        p.body.rotation.y = 0;
        break;
      }
      default:
        break;
    }
    if (p.activityTimer <= 0) {
      this.clearActivity(p);
      p.leftArm.rotation.x = 0;
      p.rightArm.rotation.x = 0;
      p.state = 'idle';
      p.idleTimer = 0.4 + Math.random() * 0.8;
    }
  }

  /** Small chat groups form on the footpath: 1–2 passers-by join someone who stopped. */
  private updateGroups(dt: number) {
    for (const [gid, end] of this.groupEnds) if (end <= this.clock) this.groupEnds.delete(gid);
    this.groupTimer -= dt;
    if (this.groupTimer > 0) return;
    this.groupTimer = 1.5;
    if (this.groupEnds.size >= this.groupLimit) return;
    const leaders = this.pedestrians.filter((p) => p.state === 'idle' && this.isFree(p)
      && !this.probes?.isOnCarriageway(p.mesh.position.x, p.mesh.position.z));
    if (!leaders.length) return;
    const leader = leaders[Math.floor(Math.random() * leaders.length)];
    const joiners = this.pedestrians
      .filter((p) => p !== leader && this.isFree(p) && Math.hypot(p.mesh.position.x - leader.mesh.position.x, p.mesh.position.z - leader.mesh.position.z) < 18)
      .slice(0, 1 + (Math.random() < 0.45 ? 1 : 0));
    if (!joiners.length) return;
    const gid = this.nextGroupId++;
    const seconds = 10 + Math.random() * 12;
    const walkAllowance = 8;
    this.groupEnds.set(gid, this.clock + seconds + walkAllowance);
    // the group stands around a point just in front of the leader
    const cx = leader.mesh.position.x + Math.sin(leader.heading) * 0.55;
    const cz = leader.mesh.position.z - Math.cos(leader.heading) * 0.55;
    this.startActivity(leader, 'chat', seconds + walkAllowance, cx, cz);
    leader.groupId = gid;
    joiners.forEach((p, i) => {
      const ang = leader.heading + (i === 0 ? Math.PI * 0.8 : -Math.PI * 0.8);
      const tx = cx + Math.sin(ang) * 0.6, tz = cz - Math.cos(ang) * 0.6;
      this.walkTo(p, tx, tz, 'chat', seconds, cx, cz);
      p.groupId = gid;
    });
  }

  /** A footpath node just outside the view ring (95–130 m from the camera), or null. */
  private offscreenNode() {
    const cam = this.lastCam;
    if (!cam || !this.focusNodes.length) return null;
    for (let tries = 0; tries < 16; tries++) {
      const n = this.graph.nodes[this.focusNodes[Math.floor(Math.random() * this.focusNodes.length)]];
      const d = Math.hypot(n.x - cam.x, n.z - cam.z);
      if (d > 95 && d < PedestrianManager.FOCUS) return n;
    }
    return null;
  }

  /** People who wandered far from the player (> 160 m) reappear out of sight around them. */
  private relocateStragglers() {
    const cam = this.lastCam;
    if (!cam) return;
    let moved = 0;
    for (const p of this.pedestrians) {
      if (moved >= 6) break;
      if (!this.isFree(p)) continue;
      if (Math.hypot(p.mesh.position.x - cam.x, p.mesh.position.z - cam.z) < 160) continue;
      const node = this.offscreenNode();
      if (!node) return;
      p.mesh.position.set(node.x, p.mesh.position.y, node.z);
      p.currentNodeId = node.id;
      p.state = 'idle';
      p.idleTimer = 0;
      this.startTrip(p);
      moved++;
    }
  }

  /** Time-of-day density: park people far from the camera when it's quiet, bring them back when busy. */
  private updateDensity(dt: number) {
    this.densityTimer -= dt;
    if (this.densityTimer > 0) return;
    this.densityTimer = 0.5;
    this.relocateStragglers();
    if (this.minutes === null) return;
    const target = Math.max(4, Math.round(this.poolSize * activeFraction(this.minutes)));
    let active = 0;
    for (const p of this.pedestrians) if (p.active) active++;
    const cam = this.lastCam;
    const outOfSight = (x: number, z: number) => !cam || Math.hypot(x - cam.x, z - cam.z) > 95;
    if (active > target) {
      let n = Math.min(3, active - target);
      for (const p of this.pedestrians) {
        if (n <= 0) break;
        if (!this.isFree(p) || !outOfSight(p.mesh.position.x, p.mesh.position.z)) continue;
        p.active = false;
        p.mesh.visible = false;
        p.lod = 'hidden';
        this.nearSet.delete(p);
        n--;
      }
    } else if (active < target) {
      let n = Math.min(3, target - active);
      const nodes = this.graph.nodes;
      for (const p of this.pedestrians) {
        if (n <= 0 || !nodes.length) break;
        if (p.active) continue;
        const node = this.offscreenNode() ?? (() => {
          for (let tries = 0; tries < 12; tries++) {
            const c = nodes[Math.floor(Math.random() * nodes.length)];
            if (outOfSight(c.x, c.z)) return c;
          }
          return null;
        })();
        if (!node) break;
        p.mesh.position.set(node.x, p.mesh.position.y, node.z);
        p.currentNodeId = node.id;
        this.clearActivity(p);
        p.summonUntil = 0;
        p.active = true;
        p.idleTimer = 0;
        this.startTrip(p);
        n--;
      }
    }
  }

}
