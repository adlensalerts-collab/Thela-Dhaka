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
  private senseIn = 0;
  private clock = 0;
  private alertSeconds = 0;
  private wasAlert = false;
  private lastSeen: (PolicePoint & { at: number; vx: number; vz: number }) | null = null;
  private components: number[] = [];
  private junctionStops: number[] = [];

  constructor(primary: THREE.Group, readonly difficulty: DifficultyProfile,
    private world: PatrolWorld, scene: THREE.Scene) {
    this.patrols = [{ object: primary, rig: null, route: [], step: 0, phase: 0, nextRoute: 0, blockedUntil: 0,
      home: { x: 0, z: 0 }, visible: false, informed: false, mode: 'post' }];
    for (let i = 1; i < difficulty.policeCount; i++) {
      const rig = createHumanRig({ outfit: 'police', compact: true, scale: 1.18, seed: 700 + i });
      rig.group.name = `campaign-police-${i}`;
      scene.add(rig.group);
      this.patrols.push({ object: rig.group, rig, route: [], step: 0, phase: 0, nextRoute: 0, blockedUntil: 0,
        home: { x: 0, z: 0 }, visible: false, informed: false, mode: 'post' });
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

  canArrest(player: PolicePoint) {
    return this.patrols.some(p => Math.hypot(p.object.position.x - player.x, p.object.position.z - player.z) < 2.1 &&
      this.clearSight(p.object.position, player));
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
      this.sense(player, this.difficulty.policeVision * visibility, alert || heated);
      this.senseIn = 0.1;
    }
    const tactics = policeTactics(this.difficulty.dayNumber);
    const pursuing = (alert || heated && this.playerVisible) && this.lastSeen !== null;
    for (let i = 0; i < this.patrols.length; i++) {
      const patrol = this.patrols[i], object = patrol.object;
      if (i === 0) this.primarySpeed = 0;
      patrol.nextRoute = Math.max(0, patrol.nextRoute - dt);
      patrol.blockedUntil = Math.max(0, patrol.blockedUntil - dt);
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
        speed = (mode === 'search' ? 2.8 : POLICE_CHASE_SPEED) * weatherSpeed;
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
