import * as THREE from 'three';
import { resolveMovement, type Obstacle } from './collision';
import type { SidewalkGraph } from './pathfinding';
import type { DifficultyProfile } from './difficulty';
import {
  chooseApproacher,
  createApproach,
  stepApproach,
  type ApproachCandidate,
  type ApproachEvent,
  type ApproachOutput,
  type ApproachState,
} from './policeApproach';
import { animateHuman, createHumanRig, type HumanRig } from './world/humans';
import {
  inPoliceView,
  knowsVendor,
  officerReactionDelay,
  officerVisionRange,
  policeLineOfSight,
  policeTactics,
  POLICE_CHASE_SPEED,
  POLICE_VISION_HALF_ANGLE,
  type OfficerMemorySummary,
  type PolicePoint,
} from './policePerception';

export type PoliceMode = 'post' | 'patrol' | 'chase' | 'search' | 'backup' | 'intercept';

const SLIDE_OFFSETS = [1.1, -1.1, 1.57, -1.57] as const;

export type PoliceHurtState = 'none' | 'stagger' | 'down' | 'rising';

interface Patrol {
  object: THREE.Group;
  rig: HumanRig | null;
  route: Array<{ x: number; z: number }>;
  step: number;
  phase: number;
  nextRoute: number;
  blockedUntil: number;
  home: PolicePoint;
  visible: boolean;
  informed: boolean;
  mode: PoliceMode;
  sightings: number;
  lastSeenAt: number;
  lastSeenX: number;
  lastSeenZ: number;
  lastSightingAt: number;
  unseenSeconds: number;
  nextMemoryPatrolAt: number;
  onMemoryPatrol: boolean;
  /** Sprint 15d: walk up to the vendor, warn him, then escalate or stand down. */
  approach: ApproachState;
  hurt: PoliceHurtState;
  hurtFor: number;
  hitCd: number;
  knockVx: number;
  knockVz: number;
}

export interface PatrolWorld {
  graph: SidewalkGraph;
  obstacles: (x: number, z: number) => Obstacle[];
  bounds: number | { x: number; z: number };
  isRoad: (x: number, z: number) => boolean;
  sightObstacles?: (from: PolicePoint, to: PolicePoint) => readonly Obstacle[];
  junctions?: readonly PolicePoint[];
}

/** Bounded solo officers; routing uses sightings, never hidden vendor coordinates. */
export class CampaignPolice {
  private patrols: Patrol[];
  private routeSequence = 0;
  primarySpeed = 0;
  playerVisible = false;
  onInjury?: (x: number, z: number, heavy: boolean) => void;
  /** Sprint 15d: an officer's approach changed (spotted, warning, stand_down, lost). Escalation is read with takeEscalation(). */
  onApproach?: (event: ApproachEvent, officer: number, x: number, z: number) => void;
  private escalation = false;
  private approachId = -1;
  private approachOut: ApproachOutput = { phase: 'idle', targetX: 0, targetZ: 0, hasTarget: false, speed: 0, event: 'none' };
  private approachCandidates: ApproachCandidate[] = [];
  private lastPlayerX = Number.NaN;
  private lastPlayerZ = Number.NaN;
  private vendorSpeed = 0;
  /** True once after an officer's warning ran out while the vendor was still doing something suspicious: the engine starts a chase. */
  takeEscalation() { const e = this.escalation; this.escalation = false; return e; }
  private senseIn = 0;
  private clock = 0;
  private alertSeconds = 0;
  private wasAlert = false;
  private aggressiveFor = 0;
  private radioFor = 0;
  private lastSeen: (PolicePoint & { at: number; vx: number; vz: number }) | null = null;
  private components: number[] = [];
  private junctionStops: number[] = [];

  constructor(primary: THREE.Group, readonly difficulty: DifficultyProfile,
    private world: PatrolWorld, scene: THREE.Scene) {
    this.patrols = [{
      object: primary, rig: null, route: [], step: 0, phase: 0, nextRoute: 0, blockedUntil: 0,
      home: { x: 0, z: 0 }, visible: false, informed: false, mode: 'post',
      sightings: 0, lastSeenAt: 0, lastSeenX: 0, lastSeenZ: 0,
      lastSightingAt: -Infinity, unseenSeconds: 0, nextMemoryPatrolAt: 0, onMemoryPatrol: false, approach: createApproach(),
      hurt: 'none', hurtFor: 0, hitCd: 0, knockVx: 0, knockVz: 0,
    }];
    for (let i = 1; i < difficulty.policeCount; i++) {
      const rig = createHumanRig({ outfit: 'police', compact: true, scale: 1.18, seed: 700 + i });
      rig.group.name = `campaign-police-${i}`;
      rig.group.position.set(50, 0, 50);
      scene.add(rig.group);
      this.patrols.push({
        object: rig.group, rig, route: [], step: 0, phase: 0, nextRoute: 0, blockedUntil: 0,
        home: { x: 50, z: 50 }, visible: false, informed: false, mode: 'post',
        sightings: 0, lastSeenAt: 0, lastSeenX: 0, lastSeenZ: 0,
        lastSightingAt: -Infinity, unseenSeconds: 0, nextMemoryPatrolAt: 0, onMemoryPatrol: false, approach: createApproach(),
        hurt: 'none', hurtFor: 0, hitCd: 0, knockVx: 0, knockVz: 0,
      });
    }
    // A* falls back to a straight line between disconnected nodes. Avoid that fallback.
    for (const node of world.graph.nodes) {
      if (this.components[node.id] !== undefined) continue;
      const pending = [node.id]; this.components[node.id] = node.id;
      for (let i = 0; i < pending.length; i++) for (const id of world.graph.nodes[pending[i]].neighbors) {
        if (this.components[id] === undefined) { this.components[id] = node.id; pending.push(id); }
      }
    }
    this.junctionStops = [...new Set((world.junctions ?? []).map(p => world.graph.findNearestNode(p.x, p.z)))]
      .filter(id => this.validStop(world.graph.nodes[id].x, world.graph.nodes[id].z));
  }

  get count() { return this.patrols.length; }

  get aggressive() { return this.aggressiveFor > 0; }

  get memorySummary(): readonly OfficerMemorySummary[] {
    return Object.freeze(
      this.patrols.map((p, id) =>
        Object.freeze({
          id,
          sightings: p.sightings,
          lastSeenAt: p.lastSeenAt,
          x: p.lastSeenX,
          z: p.lastSeenZ,
        })
      )
    );
  }

  private validStop(x: number, z: number) {
    if (this.world.isRoad(x, z)) return false;
    const resolved = resolveMovement(x, z, 0, 0, 0, false, this.world.obstacles(x, z), this.world.bounds);
    return Math.hypot(resolved.newX - x, resolved.newZ - z) < 0.1;
  }

  /** Separate, walkable footpath spawns; also clears pursuit routes after a bribe. */
  resetPositions(playerX: number, playerZ: number) {
    const selected: Array<{ x: number; z: number }> = [];
    for (let i = 0; i < this.patrols.length; i++) {
      const angle = i / this.patrols.length * Math.PI * 2;
      const radius = this.difficulty.policeVision + 12;
      const tx = playerX + Math.sin(angle) * radius, tz = playerZ + Math.cos(angle) * radius;
      let best: { x: number; z: number } | null = null, score = Infinity;
      for (const node of this.world.graph.nodes) {
        if (Math.hypot(node.x - playerX, node.z - playerZ) < this.difficulty.policeVision + 5 ||
            selected.some((p) => Math.hypot(p.x - node.x, p.z - node.z) < 10)) continue;
        const distance = Math.hypot(node.x - tx, node.z - tz);
        if (distance < score && this.validStop(node.x, node.z)) { best = node; score = distance; }
      }
      if (!best) throw new Error('No safe footpath spawn for campaign police.');
      selected.push(best);
      const patrol = this.patrols[i];
      patrol.object.position.set(best.x, 0, best.z);
      patrol.object.rotation.x = 0;
      patrol.object.rotation.y = -Math.atan2(playerX - best.x, best.z - playerZ);
      patrol.route = []; patrol.step = 0; patrol.nextRoute = 0; patrol.blockedUntil = 0;
      patrol.home = { x: best.x, z: best.z }; patrol.visible = false;
      patrol.informed = false;
      patrol.mode = this.difficulty.patrolRoutes ? 'patrol' : 'post';
      patrol.sightings = 0;
      patrol.lastSeenAt = 0;
      patrol.lastSeenX = 0;
      patrol.lastSeenZ = 0;
      patrol.lastSightingAt = -Infinity;
      patrol.unseenSeconds = 0;
      patrol.nextMemoryPatrolAt = 0;
      patrol.onMemoryPatrol = false;
      patrol.approach = createApproach();
      patrol.hurt = 'none';
      patrol.hurtFor = 0;
      patrol.hitCd = 0;
      patrol.knockVx = 0;
      patrol.knockVz = 0;
    }
    this.lastSeen = null; this.playerVisible = false; this.senseIn = 0;
    this.alertSeconds = 0; this.wasAlert = false; this.clock = 0; this.primarySpeed = 0;
    this.aggressiveFor = 0; this.radioFor = 0;
    this.approachId = -1; this.escalation = false; this.lastPlayerX = Number.NaN; this.vendorSpeed = 0;
  }

  nearestDistance(x: number, z: number) {
    let distance = Infinity;
    for (const patrol of this.patrols) distance = Math.min(distance,
      Math.hypot(patrol.object.position.x - x, patrol.object.position.z - z));
    return distance;
  }

  private planRoute(patrol: Patrol) {
    const { x, z } = patrol.object.position;
    const start = this.world.graph.findNearestNode(x, z);
    let candidates = this.world.graph.nodes.filter((n) => {
      const distance = Math.hypot(n.x - x, n.z - z);
      return distance >= 15 && distance < 65 &&
        this.components[n.id] === this.components[start] && this.validStop(n.x, n.z);
    });
    if (!candidates.length) {
      candidates = this.world.graph.nodes.filter((n) => {
        const distance = Math.hypot(n.x - x, n.z - z);
        return distance >= 20 && distance < 70 && this.components[n.id] === this.components[start] && this.validStop(n.x, n.z);
      });
    }
    if (!candidates.length) { patrol.nextRoute = 2; return; }
    if (patrol.lastSeenAt > 0) {
      const outsideMemory = candidates.filter(
        (n) => Math.hypot(n.x - patrol.lastSeenX, n.z - patrol.lastSeenZ) > 20
      );
      if (outsideMemory.length) candidates = outsideMemory;
    }
    const junctions = candidates.filter(n => this.junctionStops.includes(n.id));
    if (junctions.length) candidates = junctions;
    const destination = candidates[(this.routeSequence++ * 31) % candidates.length];
    patrol.route = this.world.graph.findAStarPath(this.world.graph.findNearestNode(x, z), destination.id);
    patrol.step = 0; patrol.nextRoute = 2;
  }

  private planMemoryRoute(patrol: Patrol): boolean {
    const { x, z } = patrol.object.position;
    const start = this.world.graph.findNearestNode(x, z);
    const candidates = this.world.graph.nodes.filter((n) =>
      this.components[n.id] === this.components[start] &&
      Math.hypot(n.x - patrol.lastSeenX, n.z - patrol.lastSeenZ) <= 20 &&
      this.validStop(n.x, n.z)
    );
    if (!candidates.length) return false;
    const away = candidates.filter((n) => Math.hypot(n.x - x, n.z - z) >= 1.5);
    const pool = away.length ? away : candidates;
    const destination = pool[(this.routeSequence++ * 31) % pool.length];
    const rawPath = this.world.graph.findAStarPath(start, destination.id);
    const safePath = rawPath.filter((pt) => !this.world.isRoad(pt.x, pt.z));
    patrol.route = safePath.length ? safePath : [{ x: destination.x, z: destination.z }];
    patrol.step = 0;
    patrol.nextRoute = 2;
    patrol.onMemoryPatrol = true;
    patrol.nextMemoryPatrolAt = this.clock + 40;
    return true;
  }

  private planChaseRoute(patrol: Patrol, playerX: number, playerZ: number) {
    const { x, z } = patrol.object.position;
    const startId = this.world.graph.findNearestNode(x, z);
    let goalId = -1, distance = Infinity;
    for (const node of this.world.graph.nodes) {
      const d = Math.hypot(node.x - playerX, node.z - playerZ);
      if (this.components[node.id] === this.components[startId] && d < distance && this.validStop(node.x, node.z)) {
        goalId = node.id; distance = d;
      }
    }
    const reRouteDelay = officerReactionDelay(0.9, patrol.sightings);
    const goal = this.world.graph.nodes[goalId], previous = patrol.route[patrol.route.length - 1];
    if (goal && previous && previous.x === goal.x && previous.z === goal.z && patrol.step < patrol.route.length) {
      patrol.nextRoute = reRouteDelay; return;
    }
    patrol.route = goalId < 0 ? [] : this.world.graph.findAStarPath(startId, goalId);
    patrol.step = 0;
    if (patrol.route.length > 1) {
      const a = patrol.route[0], b = patrol.route[1], dx = b.x - a.x, dz = b.z - a.z;
      const length = dx * dx + dz * dz;
      const t = length ? ((x - a.x) * dx + (z - a.z) * dz) / length : 0;
      if (t >= 0 && t <= 1 && Math.hypot(x - a.x - t * dx, z - a.z - t * dz) < 1.5 &&
        this.clearSight(patrol.object.position, b)) patrol.step = 1;
    }
    patrol.nextRoute = reRouteDelay;
  }

  get lastKnownPosition(): PolicePoint | null { return this.lastSeen ? { x: this.lastSeen.x, z: this.lastSeen.z } : null; }

  private clearSight(from: PolicePoint, to: PolicePoint) {
    return policeLineOfSight(from, to, this.world.sightObstacles?.(from, to) ??
      this.world.obstacles((from.x + to.x) / 2, (from.z + to.z) / 2));
  }

  vendorContact(vendor: PolicePoint, vx: number, vz: number): { index: number; heavy: boolean } | null {
    const speed = Math.hypot(vx, vz);
    if (!(speed >= 1.2) || !Number.isFinite(speed)) return null;
    for (let i = 0; i < this.patrols.length; i++) {
      const p = this.patrols[i];
      if (p.hurt !== 'none' || p.hitCd > 0) continue;
      const dx = p.object.position.x - vendor.x;
      const dz = p.object.position.z - vendor.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 1.65) continue;
      const closing = dist > 1e-5 ? (vx * dx + vz * dz) / dist : speed;
      if (closing < 1.2) continue;
      const heavy = closing >= 3.5;
      p.hurt = heavy ? 'down' : 'stagger';
      p.hurtFor = heavy ? 3.0 : 0.85;
      p.hitCd = heavy ? 4.2 : 1.2;
      const ux = dist > 1e-5 ? dx / dist : 0;
      const uz = dist > 1e-5 ? dz / dist : -1;
      p.knockVx = ux * (heavy ? 2.4 : 1.4);
      p.knockVz = uz * (heavy ? 2.4 : 1.4);
      p.object.rotation.x = heavy ? Math.PI / 2 : 0.35;
      p.object.position.y = heavy ? 0.18 : 0;
      this.aggressiveFor = 90;
      this.radioFor = 6;
      this.lastSeen = { x: vendor.x, z: vendor.z, at: this.clock, vx, vz };
      for (let j = 0; j < this.patrols.length; j++) {
        this.patrols[j].informed = true;
      }
      this.onInjury?.(p.object.position.x, p.object.position.z, heavy);
      return { index: i, heavy };
    }
    return null;
  }

  canArrest(player: PolicePoint) {
    if (this.aggressive) {
      return this.patrols.some(
        (p) =>
          p.hurt === 'none' &&
          Math.hypot(p.object.position.x - player.x, p.object.position.z - player.z) <= 2.6
      );
    }
    return this.patrols.some(
      (p) =>
        p.hurt === 'none' &&
        Math.hypot(p.object.position.x - player.x, p.object.position.z - player.z) < 2.1 &&
        this.clearSight(p.object.position, player)
    );
  }

  private sense(player: PolicePoint, range: number, remember: boolean) {
    this.playerVisible = false;
    const aggBonus = this.aggressive ? 1.5 : 1;
    for (let i = 0; i < this.patrols.length; i++) {
      const p = this.patrols[i];
      if (p.hurt !== 'none') {
        p.visible = false;
        continue;
      }
      const wasVisible = p.visible;
      const effectiveRange = officerVisionRange(range, p.sightings) * aggBonus;
      p.visible = inPoliceView(p.object.position, -p.object.rotation.y, player, effectiveRange) &&
        this.clearSight(p.object.position, player);
      if (p.visible) {
        if (!wasVisible && this.clock - p.lastSightingAt >= 10) {
          p.sightings += 1;
          p.lastSightingAt = this.clock;
        }
        p.lastSeenAt = this.clock;
        p.lastSeenX = player.x;
        p.lastSeenZ = player.z;
        p.unseenSeconds = 0;
        if (remember) p.informed = true;
      }
      this.playerVisible ||= p.visible;
    }
    if (this.playerVisible && remember) {
      const previous = this.lastSeen, elapsed = previous ? this.clock - previous.at : 0;
      let vx = elapsed > 0 ? (player.x - previous!.x) / elapsed : 0;
      let vz = elapsed > 0 ? (player.z - previous!.z) / elapsed : 0;
      const speed = Math.hypot(vx, vz); if (speed > 8) { vx *= 8 / speed; vz *= 8 / speed; }
      this.lastSeen = { x: player.x, z: player.z, at: this.clock, vx, vz };
    }
  }

  private decayMemory(dt: number) {
    for (let i = 0; i < this.patrols.length; i++) {
      const p = this.patrols[i];
      if (p.visible) {
        p.unseenSeconds = 0;
        continue;
      }
      if (p.sightings <= 0) {
        p.unseenSeconds = 0;
        continue;
      }
      p.unseenSeconds += dt;
      while (p.unseenSeconds >= 90 && p.sightings > 0) {
        p.sightings = Math.max(0, p.sightings - 1);
        p.unseenSeconds -= 90;
      }
      if (p.sightings === 0) p.unseenSeconds = 0;
    }
  }

  private shareRadioMemory() {
    for (let i = 0; i < this.patrols.length; i++) {
      const a = this.patrols[i];
      for (let j = i + 1; j < this.patrols.length; j++) {
        const b = this.patrols[j];
        if (Math.hypot(a.object.position.x - b.object.position.x, a.object.position.z - b.object.position.z) > 15) continue;
        if (a.sightings > b.sightings) {
          b.sightings = a.sightings;
          b.unseenSeconds = Math.min(b.unseenSeconds, a.unseenSeconds);
        } else if (b.sightings > a.sightings) {
          a.sightings = b.sightings;
          a.unseenSeconds = Math.min(a.unseenSeconds, b.unseenSeconds);
        }
        if (a.lastSeenAt > b.lastSeenAt) {
          b.lastSeenAt = a.lastSeenAt;
          b.lastSeenX = a.lastSeenX;
          b.lastSeenZ = a.lastSeenZ;
        } else if (b.lastSeenAt > a.lastSeenAt) {
          a.lastSeenAt = b.lastSeenAt;
          a.lastSeenX = b.lastSeenX;
          a.lastSeenZ = b.lastSeenZ;
        }
      }
    }
  }

  private interceptPoint(patrol: Patrol): PolicePoint {
    const seen = this.lastSeen!, speed = Math.hypot(seen.vx, seen.vz);
    if (speed < 0.5) return seen;
    const lead = Math.min(22, Math.max(8, speed * 3));
    const target = { x: seen.x + seen.vx / speed * lead, z: seen.z + seen.vz / speed * lead };
    const start = this.world.graph.findNearestNode(patrol.object.position.x, patrol.object.position.z);
    let best: PolicePoint = seen, score = Infinity;
    for (const id of this.junctionStops) {
      const n = this.world.graph.nodes[id], dx = n.x - seen.x, dz = n.z - seen.z;
      if (this.components[id] !== this.components[start] || dx * seen.vx + dz * seen.vz <= 0 || Math.hypot(dx, dz) > 35) continue;
      const d = Math.hypot(n.x - target.x, n.z - target.z); if (d < score) { best = n; score = d; }
    }
    return best;
  }

  private planSearch(patrol: Patrol) {
    const seen = this.lastSeen!;
    const end = patrol.route[patrol.route.length - 1];
    const reached = end && Math.hypot(patrol.object.position.x - end.x, patrol.object.position.z - end.z) < 1.2;
    if (!reached && Math.hypot(patrol.object.position.x - seen.x, patrol.object.position.z - seen.z) > 3) {
      this.planChaseRoute(patrol, seen.x, seen.z); return;
    }
    if (!policeTactics(this.difficulty.dayNumber).search) { patrol.nextRoute = 1; return; }
    const start = this.world.graph.findNearestNode(patrol.object.position.x, patrol.object.position.z);
    const candidates = this.world.graph.nodes.filter(n => this.components[n.id] === this.components[start] &&
      Math.hypot(n.x - seen.x, n.z - seen.z) > 4 && Math.hypot(n.x - seen.x, n.z - seen.z) < 18 && this.validStop(n.x, n.z));
    if (candidates.length) {
      const target = candidates[(this.routeSequence++ * 31) % candidates.length];
      this.planChaseRoute(patrol, target.x, target.z);
    } else patrol.nextRoute = 1;
  }

  private stepHurt(patrol: Patrol, dt: number): boolean {
    if (patrol.hurt === 'none') return false;
    const object = patrol.object;
    if ((patrol.hurt === 'stagger' && patrol.hurtFor > 0.35) || (patrol.hurt === 'down' && patrol.hurtFor > 2.4)) {
      const nearObs = this.world.obstacles(object.position.x, object.position.z);
      const moved = resolveMovement(
        object.position.x,
        object.position.z,
        patrol.knockVx * dt,
        patrol.knockVz * dt,
        -object.rotation.y,
        false,
        nearObs,
        this.world.bounds
      );
      if (!this.world.isRoad(moved.newX, moved.newZ)) {
        object.position.x = moved.newX;
        object.position.z = moved.newZ;
      }
    }
    patrol.hurtFor -= dt;
    if (patrol.hurt === 'stagger') {
      if (patrol.hurtFor <= 0) {
        patrol.hurt = 'none';
        patrol.hurtFor = 0;
        object.rotation.x = 0;
        object.position.y = 0;
      } else {
        object.rotation.x = 0.35 * Math.max(0, Math.min(1, patrol.hurtFor / 0.85));
      }
    } else if (patrol.hurt === 'down') {
      if (patrol.hurtFor <= 0) {
        patrol.hurt = 'rising';
        patrol.hurtFor = 1.1 + patrol.hurtFor;
        if (patrol.hurtFor <= 0) {
          patrol.hurt = 'none';
          patrol.hurtFor = 0;
          object.rotation.x = 0;
          object.position.y = 0;
        } else {
          const t = Math.max(0, Math.min(1, patrol.hurtFor / 1.1));
          object.rotation.x = (Math.PI / 2) * t;
          object.position.y = 0.18 * t;
        }
      } else {
        object.rotation.x = Math.PI / 2;
        object.position.y = 0.18;
      }
    } else if (patrol.hurt === 'rising') {
      if (patrol.hurtFor <= 0) {
        patrol.hurt = 'none';
        patrol.hurtFor = 0;
        object.rotation.x = 0;
        object.position.y = 0;
      } else {
        const t = Math.max(0, Math.min(1, patrol.hurtFor / 1.1));
        object.rotation.x = (Math.PI / 2) * t;
        object.position.y = 0.18 * t;
      }
    }
    if (patrol.rig) animateHuman(patrol.rig, patrol.phase, 0, false, dt);
    return true;
  }

  update(
    dt: number,
    player: THREE.Vector3,
    alert: boolean,
    weatherSpeed: number,
    camera: THREE.Vector3,
    heat = 0,
    cooldown = 0,
    visibility = 1
  ) {
    if (!(dt > 0) || !Number.isFinite(dt)) return;
    const heated = heat >= 18 && cooldown <= 0;
    this.clock += dt;
    this.aggressiveFor = Math.max(0, this.aggressiveFor - dt);
    if (this.radioFor > 0) {
      this.radioFor = Math.max(0, this.radioFor - dt);
      this.lastSeen = { x: player.x, z: player.z, at: this.clock, vx: 0, vz: 0 };
    }
    if (this.wasAlert && !alert && !this.aggressive) {
      this.lastSeen = null; this.senseIn = 0;
      for (let i = 0; i < this.patrols.length; i++) {
        const p = this.patrols[i];
        p.route = []; p.nextRoute = 0; p.informed = false; p.onMemoryPatrol = false; p.nextMemoryPatrolAt = 0;
      }
    }
    this.wasAlert = alert; this.alertSeconds = (alert || this.aggressive) ? this.alertSeconds + dt : 0;
    this.senseIn -= dt;
    if (this.senseIn <= 0) {
      this.sense(player, this.difficulty.policeVision * visibility, alert || heated || this.aggressive);
      this.senseIn = 0.1;
    }
    this.decayMemory(dt);
    this.shareRadioMemory();

    const tactics = policeTactics(this.difficulty.dayNumber);
    const pursuing = (alert || this.aggressive || heated && this.playerVisible) && this.lastSeen !== null;
    // Sprint 15d: the nearest officer who can see the vendor may walk up to him (never during a chase).
    if (Number.isFinite(this.lastPlayerX)) {
      const v = Math.hypot(player.x - this.lastPlayerX, player.z - this.lastPlayerZ) / dt;
      this.vendorSpeed += (v - this.vendorSpeed) * Math.min(1, dt * 3);
    }
    this.lastPlayerX = player.x; this.lastPlayerZ = player.z;
    const cands = this.approachCandidates;
    while (cands.length < this.patrols.length) cands.push({ id: 0, x: 0, z: 0, visible: false, busy: false, cooldown: false });
    cands.length = this.patrols.length;
    for (let i = 0; i < this.patrols.length; i++) {
      const p = this.patrols[i], c = cands[i];
      c.id = i; c.x = p.object.position.x; c.z = p.object.position.z;
      c.visible = p.visible; c.busy = pursuing || p.hurt !== 'none'; c.cooldown = p.approach.phase === 'cooldown';
    }
    this.approachId = pursuing ? -1 : chooseApproacher(cands, player.x, player.z, this.approachId);
    for (let i = 0; i < this.patrols.length; i++) {
      const patrol = this.patrols[i], object = patrol.object;
      if (i === 0) this.primarySpeed = 0;
      patrol.hitCd = Math.max(0, patrol.hitCd - dt);
      if (this.stepHurt(patrol, dt)) {
        patrol.approach.phase = 'idle'; patrol.approach.timer = 0; patrol.approach.lostFor = 0;
        if (i > 0) object.visible = Math.hypot(object.position.x - camera.x, object.position.z - camera.z) < 90;
        continue;
      }
      patrol.nextRoute = Math.max(0, patrol.nextRoute - dt);
      patrol.blockedUntil = Math.max(0, patrol.blockedUntil - dt);
      const memory = this.lastSeen;
      const hasRecentMemory = !pursuing && knowsVendor(patrol.sightings) &&
        patrol.lastSeenAt > 0 && (this.clock - patrol.lastSeenAt) < 120;
      if (!hasRecentMemory) patrol.onMemoryPatrol = false;

      let mode: PoliceMode = (this.difficulty.patrolRoutes || (hasRecentMemory && (patrol.onMemoryPatrol || this.clock >= patrol.nextMemoryPatrolAt)))
        ? 'patrol'
        : 'post';
      if (pursuing && memory) {
        const distance = Math.hypot(object.position.x - memory.x, object.position.z - memory.z);
        const backupDelay = officerReactionDelay(1.5 + Math.min(i, 3) * 0.6, patrol.sightings);
        if (patrol.visible || this.radioFor > 0) mode = 'chase';
        else if (this.playerVisible && tactics.backup && this.alertSeconds >= backupDelay &&
          distance < (tactics.intercept ? 120 : 80)) {
          mode = tactics.intercept && i === this.patrols.length - 1 ? 'intercept' : 'backup';
          patrol.informed = true;
        } else if ((alert || this.aggressive) && patrol.informed && distance < (tactics.backup ? 120 : 65)) mode = 'search';
      }
      if (mode !== patrol.mode) {
        patrol.route = []; patrol.step = 0; patrol.nextRoute = 0; patrol.mode = mode;
        if (mode !== 'patrol') patrol.onMemoryPatrol = false;
      }
      let dx = 0, dz = 0, speed = 0;
      const aggSpeed = this.aggressive ? 1.15 : 1;

      if (mode === 'chase' || mode === 'backup' || mode === 'intercept' || mode === 'search') {
        speed = (mode === 'search' ? 2.8 : POLICE_CHASE_SPEED) * weatherSpeed * aggSpeed;
        const distToSighting = Math.hypot(memory!.x - object.position.x, memory!.z - object.position.z);
        const useDirect = mode === 'chase' && patrol.visible && distToSighting <= 14 &&
          patrol.blockedUntil <= 0 && this.clearSight(object.position, memory!);
        if (useDirect) {
          dx = memory!.x - object.position.x;
          dz = memory!.z - object.position.z;
          patrol.route = [];
        } else {
          while (
            patrol.step < patrol.route.length &&
            Math.hypot(patrol.route[patrol.step].x - object.position.x, patrol.route[patrol.step].z - object.position.z) < 1.1
          ) {
            patrol.step++;
          }
          if (patrol.step >= patrol.route.length || (mode !== 'search' && patrol.nextRoute <= 0)) {
            if (patrol.nextRoute <= 0) {
              if (mode === 'search') this.planSearch(patrol);
              else {
                const target = mode === 'intercept' ? this.interceptPoint(patrol) : memory!;
                this.planChaseRoute(patrol, target.x, target.z);
              }
            }
          }
          const target = patrol.route[patrol.step];
          if (target) {
            dx = target.x - object.position.x;
            dz = target.z - object.position.z;
          }
        }
      } else if (mode === 'patrol') {
        if (hasRecentMemory && !patrol.onMemoryPatrol && this.clock >= patrol.nextMemoryPatrolAt) {
          this.planMemoryRoute(patrol);
        }
        while (patrol.step < patrol.route.length && Math.hypot(patrol.route[patrol.step].x - object.position.x,
          patrol.route[patrol.step].z - object.position.z) < 0.7) patrol.step++;
        if (patrol.onMemoryPatrol && patrol.route.length > 0 && patrol.step >= patrol.route.length) {
          patrol.onMemoryPatrol = false;
          patrol.route = [];
          patrol.step = 0;
          patrol.nextRoute = 0;
          patrol.nextMemoryPatrolAt = Math.max(patrol.nextMemoryPatrolAt, this.clock + 10);
          if (!this.difficulty.patrolRoutes) {
            patrol.mode = 'post';
          }
        }
        if (patrol.mode === 'patrol' && patrol.step >= patrol.route.length && patrol.nextRoute <= 0) {
          if (hasRecentMemory && (patrol.onMemoryPatrol || this.clock >= patrol.nextMemoryPatrolAt)) {
            if (!this.planMemoryRoute(patrol)) this.planRoute(patrol);
          } else {
            this.planRoute(patrol);
          }
        }
        const target = patrol.route[patrol.step];
        if (target) { dx = target.x - object.position.x; dz = target.z - object.position.z; speed = 1.35 * weatherSpeed; }
      } else if (patrol.home && Math.hypot(object.position.x - patrol.home.x, object.position.z - patrol.home.z) > 8) {
        // After a chase, early-day officers return to their post rather than tracking a hidden vendor.
        while (
          patrol.step < patrol.route.length &&
          Math.hypot(patrol.route[patrol.step].x - object.position.x, patrol.route[patrol.step].z - object.position.z) < 0.8
        ) {
          patrol.step++;
        }
        if (patrol.step >= patrol.route.length && patrol.nextRoute <= 0) {
          this.planChaseRoute(patrol, patrol.home.x, patrol.home.z);
        }
        const target = patrol.route[patrol.step];
        if (target) {
          dx = target.x - object.position.x;
          dz = target.z - object.position.z;
          speed = 1.45 * weatherSpeed;
        }
      }

      // Sprint 15d: spotted -> walk up -> warn -> escalate or stand down. Overrides patrol/post movement.
      let approachActive = false;
      if (!pursuing) {
        const ap = patrol.approach;
        if (i === this.approachId || ap.phase !== 'idle') {
          stepApproach(ap, {
            dt, clock: this.clock, officerX: object.position.x, officerZ: object.position.z,
            vendorX: player.x, vendorZ: player.z, visible: patrol.visible, alert: alert || this.aggressive,
            busy: patrol.hurt !== 'none', vendorSelling: heat >= 6 && cooldown <= 0, vendorSpeed: this.vendorSpeed,
          }, this.approachOut);
          const out = this.approachOut;
          if (out.event !== 'none') this.handleApproachEvent(out.event, i, patrol, player);
          approachActive = out.phase === 'noticing' || out.phase === 'approach' || out.phase === 'warn';
          if (out.phase === 'approach' && out.hasTarget) {
            dx = out.targetX - object.position.x; dz = out.targetZ - object.position.z;
            speed = out.speed * weatherSpeed; patrol.route = []; patrol.step = 0;
          } else if (approachActive) {
            dx = 0; dz = 0; speed = 0;
            object.rotation.y = -Math.atan2(player.x - object.position.x, -(player.z - object.position.z));
          }
        }
      } else if (patrol.approach.phase !== 'idle') {
        patrol.approach.phase = 'idle'; patrol.approach.timer = 0; patrol.approach.lostFor = 0;
      }

      const distance = Math.hypot(dx, dz);
      if (distance > 0.01 && speed > 0) {
        let heading = Math.atan2(dx, -dz);
        const step = Math.min(distance, speed * dt);
        const nearObs = this.world.obstacles(object.position.x, object.position.z);
        let moved = resolveMovement(
          object.position.x,
          object.position.z,
          (dx / distance) * step,
          (dz / distance) * step,
          heading,
          false,
          nearObs,
          this.world.bounds
        );
        let travelled = Math.hypot(moved.newX - object.position.x, moved.newZ - object.position.z);

        // If blocked by a corner or stall, try sliding around the obstacle
        if (travelled < step * 0.35) {
          for (let k = 0; k < SLIDE_OFFSETS.length; k++) {
            const angleOffset = SLIDE_OFFSETS[k];
            const altHeading = heading + angleOffset;
            const altVx = Math.sin(altHeading) * step;
            const altVz = -Math.cos(altHeading) * step;
            const altMoved = resolveMovement(
              object.position.x,
              object.position.z,
              altVx,
              altVz,
              altHeading,
              false,
              nearObs,
              this.world.bounds
            );
            const altTravelled = Math.hypot(altMoved.newX - object.position.x, altMoved.newZ - object.position.z);
            if (altTravelled > travelled) {
              moved = altMoved;
              travelled = altTravelled;
              heading = altHeading;
              if (travelled >= step * 0.5) break;
            }
          }
          if (alert || this.aggressive) {
            patrol.blockedUntil = 1.4;
            patrol.nextRoute = 0.4;
          }
        }

        if (i === 0) this.primarySpeed = travelled / dt;
        object.position.x = moved.newX; object.position.z = moved.newZ; object.rotation.y = -heading;
        patrol.phase += travelled * 2.2;
        if (patrol.rig) animateHuman(patrol.rig, patrol.phase, Math.min(1, travelled / dt / 5), false, dt);
        if (!alert && !this.aggressive && travelled < step * 0.1) { patrol.route = []; patrol.nextRoute = Math.min(patrol.nextRoute, 0.5); }
      } else {
        if ((mode === 'post' || mode === 'search') && !approachActive) object.rotation.y += dt * 0.65;
        if (patrol.rig) animateHuman(patrol.rig, patrol.phase, 0, false, dt);
      }
      if (i > 0) object.visible = Math.hypot(object.position.x - camera.x, object.position.z - camera.z) < 90;
    }
  }

  private handleApproachEvent(event: ApproachEvent, index: number, patrol: Patrol, player: PolicePoint) {
    if (event === 'escalate') {
      this.escalation = true;
      this.lastSeen = { x: player.x, z: player.z, at: this.clock, vx: 0, vz: 0 };
      patrol.informed = true;
    }
    this.onApproach?.(event, index, patrol.object.position.x, patrol.object.position.z);
  }

  positions() { return this.patrols.map(({ object, mode }) => ({ x: object.position.x, z: object.position.z,
    heading: -object.rotation.y, mode, visionHalfAngle: POLICE_VISION_HALF_ANGLE })); }

  /** Caller retires GPU resources with its existing shared-resource-aware disposer. */
  detachExtras(): THREE.Object3D[] {
    const extras = this.patrols.slice(1).map((p) => p.object);
    for (const extra of extras) extra.removeFromParent();
    this.patrols = [];
    this.lastSeen = null; this.playerVisible = false;
    return extras;
  }
}
