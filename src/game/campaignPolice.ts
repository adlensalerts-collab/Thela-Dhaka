import * as THREE from 'three';
import { resolveMovement, type Obstacle } from './collision';
import type { SidewalkGraph } from './pathfinding';
import type { DifficultyProfile } from './difficulty';
import { animateHuman, createHumanRig, type HumanRig } from './world/humans';

interface Patrol {
  object: THREE.Group;
  rig: HumanRig | null;
  route: Array<{ x: number; z: number }>;
  step: number;
  phase: number;
  nextRoute: number;
  blockedUntil: number;
}

export interface PatrolWorld {
  graph: SidewalkGraph;
  obstacles: (x: number, z: number) => Obstacle[];
  bounds: number | { x: number; z: number };
  isRoad: (x: number, z: number) => boolean;
}

/** Bounded solo patrol population. Direct pursuit preserves existing speed/rules;
 * tactical search, line of sight and backup remain Sprint 14. */
export class CampaignPolice {
  private patrols: Patrol[];
  private routeSequence = 0;
  primarySpeed = 0;

  constructor(primary: THREE.Group, readonly difficulty: DifficultyProfile,
    private world: PatrolWorld, scene: THREE.Scene) {
    this.patrols = [{ object: primary, rig: null, route: [], step: 0, phase: 0, nextRoute: 0, blockedUntil: 0 }];
    for (let i = 1; i < difficulty.policeCount; i++) {
      const rig = createHumanRig({ outfit: 'police', compact: true, scale: 1.18, seed: 700 + i });
      rig.group.name = `campaign-police-${i}`;
      scene.add(rig.group);
      this.patrols.push({ object: rig.group, rig, route: [], step: 0, phase: 0, nextRoute: 0, blockedUntil: 0 });
    }
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
      patrol.object.rotation.y = 0;
      patrol.route = []; patrol.step = 0; patrol.nextRoute = 0; patrol.blockedUntil = 0;
    }
  }

  nearestDistance(x: number, z: number) {
    let distance = Infinity;
    for (const patrol of this.patrols) distance = Math.min(distance,
      Math.hypot(patrol.object.position.x - x, patrol.object.position.z - z));
    return distance;
  }

  private planRoute(patrol: Patrol, playerX?: number, playerZ?: number) {
    const { x, z } = patrol.object.position;
    let candidates = this.world.graph.nodes.filter((n) => {
      const distance = Math.hypot(n.x - x, n.z - z);
      const nearPlayer = playerX !== undefined && playerZ !== undefined
        ? Math.hypot(n.x - playerX, n.z - playerZ) <= Math.max(45, this.difficulty.policeVision + 20)
        : true;
      return distance >= 15 && distance < 65 && nearPlayer && !this.world.isRoad(n.x, n.z);
    });
    if (!candidates.length) {
      candidates = this.world.graph.nodes.filter((n) => {
        const distance = Math.hypot(n.x - x, n.z - z);
        return distance >= 20 && distance < 70 && !this.world.isRoad(n.x, n.z);
      });
    }
    if (!candidates.length) { patrol.nextRoute = 2; return; }
    const destination = candidates[(this.routeSequence++ * 31) % candidates.length];
    patrol.route = this.world.graph.findAStarPath(this.world.graph.findNearestNode(x, z), destination.id);
    patrol.step = 0; patrol.nextRoute = 2;
  }

  private planPostNearPlayer(patrol: Patrol, playerX: number, playerZ: number, index: number) {
    const { x, z } = patrol.object.position;
    const minD = this.difficulty.policeVision + 6;
    const maxD = this.difficulty.policeVision + 18;
    const angle = (index / Math.max(1, this.patrols.length)) * Math.PI * 2;
    const targetX = playerX + Math.sin(angle) * ((minD + maxD) * 0.5);
    const targetZ = playerZ + Math.cos(angle) * ((minD + maxD) * 0.5);
    let bestId = -1;
    let bestScore = Infinity;
    for (const n of this.world.graph.nodes) {
      if (this.world.isRoad(n.x, n.z)) continue;
      const dp = Math.hypot(n.x - playerX, n.z - playerZ);
      if (dp < minD || dp > maxD) continue;
      const score = Math.hypot(n.x - targetX, n.z - targetZ);
      if (score < bestScore) {
        bestScore = score;
        bestId = n.id;
      }
    }
    if (bestId >= 0) {
      patrol.route = this.world.graph.findAStarPath(this.world.graph.findNearestNode(x, z), bestId);
      patrol.step = 0;
      patrol.nextRoute = 2.5;
    } else {
      patrol.nextRoute = 1.5;
    }
  }

  private planChaseRoute(patrol: Patrol, playerX: number, playerZ: number) {
    const { x, z } = patrol.object.position;
    const startId = this.world.graph.findNearestNode(x, z);
    const goalId = this.world.graph.findNearestNode(playerX, playerZ);
    patrol.route = this.world.graph.findAStarPath(startId, goalId);
    patrol.step = 0;
    patrol.nextRoute = 0.9;
  }

  update(
    dt: number,
    player: THREE.Vector3,
    alert: boolean,
    weatherSpeed: number,
    camera: THREE.Vector3,
    heat = 0,
    cooldown = 0
  ) {
    const heated = heat >= 18 && cooldown <= 0;
    for (let i = 0; i < this.patrols.length; i++) {
      const patrol = this.patrols[i], object = patrol.object;
      if (i === 0) this.primarySpeed = 0;
      patrol.nextRoute = Math.max(0, patrol.nextRoute - dt);
      patrol.blockedUntil = Math.max(0, patrol.blockedUntil - dt);
      const distToPlayer = Math.hypot(player.x - object.position.x, player.z - object.position.z);
      let dx = 0, dz = 0, speed = 0;

      if (alert) {
        speed = 3.55 * weatherSpeed;
        const useDirect = distToPlayer <= 14 && patrol.blockedUntil <= 0;
        if (useDirect) {
          dx = player.x - object.position.x;
          dz = player.z - object.position.z;
          patrol.route = [];
        } else {
          while (
            patrol.step < patrol.route.length &&
            Math.hypot(patrol.route[patrol.step].x - object.position.x, patrol.route[patrol.step].z - object.position.z) < 1.1
          ) {
            patrol.step++;
          }
          if (patrol.step >= patrol.route.length || patrol.nextRoute <= 0) {
            this.planChaseRoute(patrol, player.x, player.z);
          }
          const target = patrol.route[patrol.step];
          if (target && distToPlayer > 3.2) {
            dx = target.x - object.position.x;
            dz = target.z - object.position.z;
          } else {
            dx = player.x - object.position.x;
            dz = player.z - object.position.z;
          }
        }
      } else if (heated) {
        // Vendor has Wanted heat: officers converge along footpaths toward the vendor to inspect/spot.
        speed = (this.difficulty.patrolRoutes ? 2.5 : 2.15) * weatherSpeed;
        while (
          patrol.step < patrol.route.length &&
          Math.hypot(patrol.route[patrol.step].x - object.position.x, patrol.route[patrol.step].z - object.position.z) < 1.0
        ) {
          patrol.step++;
        }
        if (patrol.step >= patrol.route.length || patrol.nextRoute <= 0) {
          this.planChaseRoute(patrol, player.x, player.z);
        }
        const target = patrol.route[patrol.step];
        if (target && distToPlayer > 6) {
          dx = target.x - object.position.x;
          dz = target.z - object.position.z;
        } else {
          dx = player.x - object.position.x;
          dz = player.z - object.position.z;
        }
      } else if (this.difficulty.patrolRoutes) {
        while (patrol.step < patrol.route.length && Math.hypot(patrol.route[patrol.step].x - object.position.x,
          patrol.route[patrol.step].z - object.position.z) < 0.7) patrol.step++;
        if (patrol.step >= patrol.route.length && patrol.nextRoute <= 0) this.planRoute(patrol, player.x, player.z);
        const target = patrol.route[patrol.step];
        if (target) { dx = target.x - object.position.x; dz = target.z - object.position.z; speed = 1.35 * weatherSpeed; }
      } else if (distToPlayer > this.difficulty.policeVision + 18 || patrol.step < patrol.route.length) {
        // Levels 1–2: keep footpath post within neighborhood of the vendor, then wait until vendor heats up.
        while (
          patrol.step < patrol.route.length &&
          Math.hypot(patrol.route[patrol.step].x - object.position.x, patrol.route[patrol.step].z - object.position.z) < 0.8
        ) {
          patrol.step++;
        }
        if (patrol.step >= patrol.route.length && patrol.nextRoute <= 0 && distToPlayer > this.difficulty.policeVision + 18) {
          this.planPostNearPlayer(patrol, player.x, player.z, i);
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
            patrol.nextRoute = 0;
          }
        }

        if (i === 0) this.primarySpeed = travelled / dt;
        object.position.x = moved.newX; object.position.z = moved.newZ; object.rotation.y = -heading;
        patrol.phase += travelled * 2.2;
        if (patrol.rig) animateHuman(patrol.rig, patrol.phase, Math.min(1, travelled / dt / 5), false, dt);
        if (!alert && travelled < step * 0.1) { patrol.route = []; patrol.nextRoute = Math.min(patrol.nextRoute, 0.5); }
      } else if (patrol.rig) animateHuman(patrol.rig, patrol.phase, 0, false, dt);
      if (i > 0) object.visible = Math.hypot(object.position.x - camera.x, object.position.z - camera.z) < 90;
    }
  }

  positions() { return this.patrols.map(({ object }) => ({ x: object.position.x, z: object.position.z })); }

  /** Caller retires GPU resources with its existing shared-resource-aware disposer. */
  detachExtras(): THREE.Object3D[] {
    const extras = this.patrols.slice(1).map((p) => p.object);
    for (const extra of extras) extra.removeFromParent();
    this.patrols = [];
    return extras;
  }
}
