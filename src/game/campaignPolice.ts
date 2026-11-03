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
    this.patrols = [{ object: primary, rig: null, route: [], step: 0, phase: 0, nextRoute: 0 }];
    for (let i = 1; i < difficulty.policeCount; i++) {
      const rig = createHumanRig({ outfit: 'police', compact: true, scale: 1.18, seed: 700 + i });
      rig.group.name = `campaign-police-${i}`;
      scene.add(rig.group);
      this.patrols.push({ object: rig.group, rig, route: [], step: 0, phase: 0, nextRoute: 0 });
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
      const radius = this.difficulty.policeVision + 25;
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
      patrol.route = []; patrol.step = 0; patrol.nextRoute = 0;
    }
  }

  nearestDistance(x: number, z: number) {
    let distance = Infinity;
    for (const patrol of this.patrols) distance = Math.min(distance,
      Math.hypot(patrol.object.position.x - x, patrol.object.position.z - z));
    return distance;
  }

  private planRoute(patrol: Patrol) {
    const { x, z } = patrol.object.position;
    const candidates = this.world.graph.nodes.filter((n) => {
      const distance = Math.hypot(n.x - x, n.z - z);
      return distance >= 20 && distance < 70 && !this.world.isRoad(n.x, n.z);
    });
    if (!candidates.length) { patrol.nextRoute = 2; return; }
    const destination = candidates[(this.routeSequence++ * 31) % candidates.length];
    patrol.route = this.world.graph.findAStarPath(this.world.graph.findNearestNode(x, z), destination.id);
    patrol.step = 0; patrol.nextRoute = 2;
  }

  update(dt: number, player: THREE.Vector3, alert: boolean, weatherSpeed: number, camera: THREE.Vector3) {
    for (let i = 0; i < this.patrols.length; i++) {
      const patrol = this.patrols[i], object = patrol.object;
      if (i === 0) this.primarySpeed = 0;
      let dx = 0, dz = 0, speed = 0;
      if (alert) {
        dx = player.x - object.position.x; dz = player.z - object.position.z; speed = 3.55 * weatherSpeed;
        patrol.route = [];
      } else if (this.difficulty.patrolRoutes) {
        patrol.nextRoute = Math.max(0, patrol.nextRoute - dt);
        while (patrol.step < patrol.route.length && Math.hypot(patrol.route[patrol.step].x - object.position.x,
          patrol.route[patrol.step].z - object.position.z) < 0.7) patrol.step++;
        if (patrol.step >= patrol.route.length && patrol.nextRoute <= 0) this.planRoute(patrol);
        const target = patrol.route[patrol.step];
        if (target) { dx = target.x - object.position.x; dz = target.z - object.position.z; speed = 1.1 * weatherSpeed; }
      } // Levels 1–2: officers wait on safe footpaths until they detect a heated vendor.
      const distance = Math.hypot(dx, dz);
      if (distance > 0.01) {
        const heading = Math.atan2(dx, -dz), step = Math.min(distance, speed * dt);
        const moved = resolveMovement(object.position.x, object.position.z, dx / distance * step, dz / distance * step,
          heading, false, this.world.obstacles(object.position.x, object.position.z), this.world.bounds);
        const travelled = Math.hypot(moved.newX - object.position.x, moved.newZ - object.position.z);
        if (i === 0) this.primarySpeed = travelled / dt;
        object.position.x = moved.newX; object.position.z = moved.newZ; object.rotation.y = -heading;
        patrol.phase += travelled * 2.2;
        if (patrol.rig) animateHuman(patrol.rig, patrol.phase, Math.min(1, travelled / dt / 5), false, dt);
        if (!alert && travelled < step * 0.1) { patrol.route = []; patrol.nextRoute = Math.min(patrol.nextRoute, 0.5); }
      } else if (patrol.rig) animateHuman(patrol.rig, patrol.phase, 0, false, dt);
      if (i > 0) object.visible = Math.hypot(object.position.x - camera.x, object.position.z - camera.z) < 90;
    }
  }

  positions() { return this.patrols.map(({ object }) => ({ x: object.position.x, z: object.position.z, heading: -object.rotation.y })); }

  /** Caller retires GPU resources with its existing shared-resource-aware disposer. */
  detachExtras(): THREE.Object3D[] {
    const extras = this.patrols.slice(1).map((p) => p.object);
    for (const extra of extras) extra.removeFromParent();
    this.patrols = [];
    return extras;
  }
}
