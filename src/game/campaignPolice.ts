import * as THREE from 'three';
import { resolveMovement, type Obstacle } from './collision';
import type { SidewalkGraph } from './pathfinding';
import type { DifficultyProfile } from './difficulty';
import { animateHuman, createHumanRig, type HumanRig } from './world/humans';
import { inPoliceView, policeLineOfSight, policeTactics, POLICE_CHASE_SPEED,
  POLICE_VISION_HALF_ANGLE, type PolicePoint } from './policePerception';

export type PoliceMode = 'post' | 'patrol' | 'chase' | 'search' | 'backup' | 'intercept';

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
  /** Sprint 15c: hurt by the vendor's thela. 'stagger' is a stumble, 'down' a knock-down, 'rising' getting back up. */
  hurt: 'none' | 'stagger' | 'down' | 'rising';
  hurtT: number;
  hitCd: number;
  kx: number;
  kz: number;
}

const calm = () => ({ hurt: 'none' as const, hurtT: 0, hitCd: 0, kx: 0, kz: 0 });
/** Seconds the officer lies down after a hard hit, and the time it takes to get up. */
const DOWN_SECONDS = 3.0, RISE_SECONDS = 1.1, STAGGER_SECONDS = 0.7, AGGRO_SECONDS = 90;

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
  private senseIn = 0;
  private clock = 0;
  private alertSeconds = 0;
  private wasAlert = false;
  private lastSeen: (PolicePoint & { at: number; vx: number; vz: number }) | null = null;
  private components: number[] = [];
  private junctionStops: number[] = [];
  /** Sprint 15c: while this clock value is in the future every officer is aggressive (the vendor hit one of them). */
  private aggroUntil = 0;
  private aggroStart = -999;
  /** Called when an officer is injured (the engine draws blood from it). */
  onInjury: ((x: number, z: number, heavy: boolean) => void) | null = null;

  constructor(primary: THREE.Group, readonly difficulty: DifficultyProfile,
    private world: PatrolWorld, scene: THREE.Scene) {
    this.patrols = [{ object: primary, rig: null, route: [], step: 0, phase: 0, nextRoute: 0, blockedUntil: 0,
      home: { x: 0, z: 0 }, visible: false, informed: false, mode: 'post', ...calm() }];
    for (let i = 1; i < difficulty.policeCount; i++) {
      const rig = createHumanRig({ outfit: 'police', compact: true, scale: 1.18, seed: 700 + i });
      rig.group.name = `campaign-police-${i}`;
      scene.add(rig.group);
      this.patrols.push({ object: rig.group, rig, route: [], step: 0, phase: 0, nextRoute: 0, blockedUntil: 0,
        home: { x: 0, z: 0 }, visible: false, informed: false, mode: 'post', ...calm() });
    }
    // A* falls back to a straight line between disconnected nodes. Avoid that fallback.
    for (const node of world.graph.nodes) {
      if (this.components[node.id] !== undefined) continue;
      const pending = [node.id]; this.components[node.id] = node.id;
      for (let i = 0; i < pending.length; i++) for (const id of world.graph.nodes[pending[i]].neighbors) {
        if (this.components[id] === undefined) { this.components[id] = node.id; pending.push(id); }
      }
    }
    for (const patrol of this.patrols) patrol.object.rotation.order = 'YXZ';   // heading first, then fall pitch
    this.junctionStops = [...new Set((world.junctions ?? []).map(p => world.graph.findNearestNode(p.x, p.z)))]
      .filter(id => this.validStop(world.graph.nodes[id].x, world.graph.nodes[id].z));
  }

  get count() { return this.patrols.length; }

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
      patrol.object.rotation.y = -Math.atan2(playerX - best.x, best.z - playerZ);
      patrol.route = []; patrol.step = 0; patrol.nextRoute = 0; patrol.blockedUntil = 0;
      patrol.home = { x: best.x, z: best.z }; patrol.visible = false;
      patrol.informed = false;
      patrol.mode = this.difficulty.patrolRoutes ? 'patrol' : 'post';
    }
    for (const p of this.patrols) { Object.assign(p, calm()); p.object.rotation.x = 0; p.object.position.y = 0; }
    this.aggroUntil = 0; this.aggroStart = -999;
    this.lastSeen = null; this.playerVisible = false; this.senseIn = 0;
    this.alertSeconds = 0; this.wasAlert = false; this.clock = 0; this.primarySpeed = 0;
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
    const junctions = candidates.filter(n => this.junctionStops.includes(n.id));
    if (junctions.length) candidates = junctions;
    const destination = candidates[(this.routeSequence++ * 31) % candidates.length];
    patrol.route = this.world.graph.findAStarPath(this.world.graph.findNearestNode(x, z), destination.id);
    patrol.step = 0; patrol.nextRoute = 2;
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
    const goal = this.world.graph.nodes[goalId], previous = patrol.route[patrol.route.length - 1];
    if (goal && previous && previous.x === goal.x && previous.z === goal.z && patrol.step < patrol.route.length) {
      patrol.nextRoute = 0.9; return;
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
    patrol.nextRoute = 0.9;
  }

  get lastKnownPosition(): PolicePoint | null { return this.lastSeen ? { x: this.lastSeen.x, z: this.lastSeen.z } : null; }

  private clearSight(from: PolicePoint, to: PolicePoint) {
    return policeLineOfSight(from, to, this.world.sightObstacles?.(from, to) ??
      this.world.obstacles((from.x + to.x) / 2, (from.z + to.z) / 2));
  }

  /** Sprint 15c: true for ~90 s after the vendor hit an officer. */
  get aggressive() { return this.clock < this.aggroUntil; }

  /** Upright officers only. When aggressive they arrest from further away and without line of sight, heat or alert. */
  canArrest(player: PolicePoint) {
    const aggro = this.aggressive;
    return this.patrols.some(p => {
      if (p.hurt !== 'none') return false;
      const d = Math.hypot(p.object.position.x - player.x, p.object.position.z - player.z);
      return aggro ? d < 2.6 : d < 2.1 && this.clearSight(p.object.position, player);
    });
  }

  /**
   * Sprint 15c: the vendor (moving at `vx`,`vz` m/s, thela about 1.2 m ahead of him) runs into an officer.
   * A light hit makes the officer stumble; a hard hit (3.5 m/s or more) knocks them down. Either way every officer
   * turns aggressive and is told where the vendor is. Returns what happened, or null.
   */
  vendorContact(player: PolicePoint, vx: number, vz: number): { index: number; heavy: boolean; x: number; z: number } | null {
    const speed = Math.hypot(vx, vz);
    if (!(speed >= 0.8)) return null;
    const fx = vx / speed, fz = vz / speed;
    const cart = { x: player.x + fx * 1.2, z: player.z + fz * 1.2 };
    for (let i = 0; i < this.patrols.length; i++) {
      const p = this.patrols[i], pos = p.object.position;
      if (p.hurt !== 'none' || p.hitCd > 0) continue;
      const touching = Math.hypot(pos.x - player.x, pos.z - player.z) < 1.25 || Math.hypot(pos.x - cart.x, pos.z - cart.z) < 1.25;
      if (!touching) continue;
      const tx = pos.x - player.x, tz = pos.z - player.z, len = Math.hypot(tx, tz) || 1;
      if ((fx * tx + fz * tz) / len < 0.2) continue;       // moving away from the officer: not a hit
      const heavy = speed >= 3.5;
      p.hurt = heavy ? 'down' : 'stagger';
      p.hurtT = heavy ? DOWN_SECONDS : STAGGER_SECONDS;
      p.hitCd = 2.5;
      p.kx = tx / len * (heavy ? 3.2 : 2.0); p.kz = tz / len * (heavy ? 3.2 : 2.0);
      p.route = []; p.nextRoute = 0;
      this.provoke(player);
      this.onInjury?.(pos.x, pos.z, heavy);
      return { index: i, heavy, x: pos.x, z: pos.z };
    }
    return null;
  }

  /** Every officer knows where the vendor is (radio: "officer down") and stays aggressive for AGGRO_SECONDS. */
  private provoke(player: PolicePoint) {
    this.aggroStart = this.clock;
    this.aggroUntil = this.clock + AGGRO_SECONDS;
    this.lastSeen = { x: player.x, z: player.z, at: this.clock, vx: 0, vz: 0 };
    for (const p of this.patrols) { p.informed = true; p.route = []; p.nextRoute = 0; }
  }

  /** Hurt animation and recovery. Down officers lie on their back, then get up and join the chase. */
  private stepHurt(patrol: Patrol, dt: number) {
    const o = patrol.object;
    patrol.hurtT -= dt;
    const speed = Math.hypot(patrol.kx, patrol.kz);
    if (speed > 0.05) {
      const heading = Math.atan2(patrol.kx, -patrol.kz);
      const moved = resolveMovement(o.position.x, o.position.z, patrol.kx * dt, patrol.kz * dt, heading, false,
        this.world.obstacles(o.position.x, o.position.z), this.world.bounds);
      o.position.x = moved.newX; o.position.z = moved.newZ;
      const decay = Math.exp(-5 * dt); patrol.kx *= decay; patrol.kz *= decay;
    }
    if (patrol.hurt === 'stagger') {
      o.rotation.x = Math.sin(patrol.hurtT * 18) * 0.2;
      if (patrol.hurtT <= 0) this.recover(patrol);
    } else if (patrol.hurt === 'down') {
      const fall = Math.min(1, (DOWN_SECONDS - patrol.hurtT) / 0.3);
      o.rotation.x = fall * Math.PI / 2;                   // falls backwards onto their back
      o.position.y = fall * 0.12;
      if (patrol.hurtT <= 0) { patrol.hurt = 'rising'; patrol.hurtT = RISE_SECONDS; }
    } else {
      const k = Math.max(0, patrol.hurtT / RISE_SECONDS);
      o.rotation.x = k * k * Math.PI / 2;
      o.position.y = k * 0.12;
      if (patrol.hurtT <= 0) this.recover(patrol);
    }
  }

  private recover(patrol: Patrol) {
    patrol.hurt = 'none'; patrol.hurtT = 0; patrol.hitCd = 2.5;
    patrol.object.rotation.x = 0; patrol.object.position.y = 0;
    patrol.route = []; patrol.nextRoute = 0;
  }

  private sense(player: PolicePoint, range: number, remember: boolean) {
    this.playerVisible = false;
    for (const p of this.patrols) {
      p.visible = inPoliceView(p.object.position, -p.object.rotation.y, player, range) && this.clearSight(p.object.position, player);
      if (p.visible && remember) p.informed = true;
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
    if (this.wasAlert && !alert) {
      this.lastSeen = null; this.senseIn = 0;
      for (const p of this.patrols) { p.route = []; p.nextRoute = 0; p.informed = false; }
    }
    this.wasAlert = alert; this.alertSeconds = alert ? this.alertSeconds + dt : 0;
    this.senseIn -= dt;
    if (this.senseIn <= 0) {
      this.sense(player, this.difficulty.policeVision * visibility * (this.aggressive ? 1.5 : 1), alert || heated || this.aggressive);
      this.senseIn = 0.1;
    }
    const tactics = policeTactics(this.difficulty.dayNumber);
    const aggro = this.aggressive;
    // "Officer down" radio call: for the first 6 s every officer is told exactly where the vendor is.
    if (aggro && this.clock - this.aggroStart < 6) this.lastSeen = { x: player.x, z: player.z, at: this.clock, vx: 0, vz: 0 };
    const pursuing = (alert || aggro || heated && this.playerVisible) && this.lastSeen !== null;
    for (let i = 0; i < this.patrols.length; i++) {
      const patrol = this.patrols[i], object = patrol.object;
      if (i === 0) this.primarySpeed = 0;
      patrol.nextRoute = Math.max(0, patrol.nextRoute - dt);
      patrol.blockedUntil = Math.max(0, patrol.blockedUntil - dt);
      patrol.hitCd = Math.max(0, patrol.hitCd - dt);
      if (patrol.hurt !== 'none') {
        this.stepHurt(patrol, dt);
        if (i === 0) this.primarySpeed = 0;
        if (i > 0) object.visible = Math.hypot(object.position.x - camera.x, object.position.z - camera.z) < 90;
        continue;
      }
      const memory = this.lastSeen;
      let mode: PoliceMode = this.difficulty.patrolRoutes ? 'patrol' : 'post';
      if (pursuing && memory) {
        const distance = Math.hypot(object.position.x - memory.x, object.position.z - memory.z);
        if (patrol.visible) mode = 'chase';
        else if (this.playerVisible && tactics.backup && this.alertSeconds >= 1.5 + i * 0.6 &&
          distance < (tactics.intercept ? 120 : 80)) {
          mode = tactics.intercept && i === this.patrols.length - 1 ? 'intercept' : 'backup';
          patrol.informed = true;
        } else if (alert && patrol.informed && distance < (tactics.backup ? 120 : 65)) mode = 'search';
      }
      if (mode !== patrol.mode) { patrol.route = []; patrol.step = 0; patrol.nextRoute = 0; patrol.mode = mode; }
      let dx = 0, dz = 0, speed = 0;

      if (mode === 'chase' || mode === 'backup' || mode === 'intercept' || mode === 'search') {
        speed = (mode === 'search' ? 2.8 : POLICE_CHASE_SPEED) * weatherSpeed * (aggro ? 1.15 : 1);
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
        while (patrol.step < patrol.route.length && Math.hypot(patrol.route[patrol.step].x - object.position.x,
          patrol.route[patrol.step].z - object.position.z) < 0.7) patrol.step++;
        if (patrol.step >= patrol.route.length && patrol.nextRoute <= 0) this.planRoute(patrol);
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
          for (const angleOffset of [1.1, -1.1, 1.57, -1.57]) {
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
          if (alert) {
            patrol.blockedUntil = 1.4;
            patrol.nextRoute = 0.4;
          }
        }

        if (i === 0) this.primarySpeed = travelled / dt;
        object.position.x = moved.newX; object.position.z = moved.newZ; object.rotation.y = -heading;
        patrol.phase += travelled * 2.2;
        if (patrol.rig) animateHuman(patrol.rig, patrol.phase, Math.min(1, travelled / dt / 5), false, dt);
        if (!alert && travelled < step * 0.1) { patrol.route = []; patrol.nextRoute = Math.min(patrol.nextRoute, 0.5); }
      } else {
        if (mode === 'post' || mode === 'search') object.rotation.y += dt * 0.65;
        if (patrol.rig) animateHuman(patrol.rig, patrol.phase, 0, false, dt);
      }
      if (i > 0) object.visible = Math.hypot(object.position.x - camera.x, object.position.z - camera.z) < 90;
    }
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
