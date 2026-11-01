import * as THREE from 'three';
import { buildVehicle, pickKind, SPECS, type TrafficItem } from '../world/traffic';
import type { RoadGraph } from './roadGraph';

/**
 * M4 — traffic on real roads. Vehicles drive the road graph in LEFT-hand lanes, pick a road at
 * each junction (no U-turns unless it's a dead end), brake for the vehicle ahead and the player,
 * and ease off when a junction is busy.
 *
 * Every vehicle is also a valid TrafficItem (mesh, vertical, v, hw, hd, mass, kind, cruise,
 * wheels), so damage.ts checkVehicleImpact() keeps working unchanged. hw/hd are the axis-aligned
 * bounds of the turned vehicle and `vertical`/`v` describe its dominant travel axis.
 */
export interface GraphVehicle extends TrafficItem {
  edge: number;
  dir: 1 | -1;
  travelled: number;
  speed: number;
  length: number;
  widthM: number;
  vx: number;
  vz: number;
}

const BRAKE_DIST = 8;

export class GraphTraffic {
  readonly vehicles: GraphVehicle[] = [];
  private rnd: () => number;

  constructor(private scene: THREE.Scene, private graph: RoadGraph, count: number, seed = 99) {
    let s = seed;
    this.rnd = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
    const edges = graph.edges.filter((e) => e.traffic && e.length > 15);
    if (!edges.length) return;
    const total = edges.reduce((a, e) => a + e.length, 0);
    for (let i = 0; i < count; i++) {
      // pick an edge weighted by length so long roads get more vehicles
      let r = this.rnd() * total, e = edges[0];
      for (const c of edges) { r -= c.length; if (r <= 0) { e = c; break; } }
      const kind = pickKind(this.rnd);
      const spec = SPECS[kind];
      const wheels: THREE.Mesh[] = [];
      const mesh = buildVehicle(kind, wheels, this.rnd);
      mesh.name = `traffic-${kind}-${i}`;
      const cruise = spec.speed[0] + this.rnd() * (spec.speed[1] - spec.speed[0]);
      const dir: 1 | -1 = e.oneway || this.rnd() < 0.5 ? 1 : -1;
      const v: GraphVehicle = {
        mesh, wheels, kind, cruise, mass: spec.mass, vertical: false, v: 0, hw: 1, hd: 1,
        edge: e.id, dir, travelled: this.rnd() * e.length, speed: cruise,
        length: spec.len, widthM: spec.wid, vx: 0, vz: 0
      };
      this.place(v);
      scene.add(mesh);
      this.vehicles.push(v);
    }
  }

  private place(v: GraphVehicle) {
    const e = this.graph.edges[v.edge];
    const p = this.graph.lanePose(e, v.dir, v.travelled);
    v.mesh.position.set(p.x, 0, p.z);
    v.mesh.rotation.y = Math.atan2(-p.tx, -p.tz);          // models face local -Z
    const ax = Math.abs(p.tx), az = Math.abs(p.tz);
    v.hw = (ax * v.length + az * v.widthM) / 2;
    v.hd = (az * v.length + ax * v.widthM) / 2;
    v.vertical = az >= ax;
    v.vx = p.tx * v.speed; v.vz = p.tz * v.speed;
    v.v = v.vertical ? v.vz : v.vx;
    v.mesh.userData.fwd = [p.tx, p.tz];
  }

  update(dt: number, playerX: number, playerZ: number) {
    const vs = this.vehicles;
    for (const v of vs) {
      const [fx, fz] = (v.mesh.userData.fwd as [number, number]) ?? [0, -1];
      const px = v.mesh.position.x, pz = v.mesh.position.z;
      let gap = Infinity;
      const ahead = (ox: number, oz: number, extra: number, laneHalf: number) => {
        const dx = ox - px, dz = oz - pz;
        const along = dx * fx + dz * fz;
        const side = Math.abs(dx * fz - dz * fx);
        if (along > 0 && along < 30 && side < laneHalf) gap = Math.min(gap, along - v.length / 2 - extra);
      };
      ahead(playerX, playerZ, 0.7, v.widthM / 2 + 0.9);
      for (const o of vs) if (o !== v) ahead(o.mesh.position.x, o.mesh.position.z, o.length / 2, (v.widthM + o.widthM) / 2 + 0.3);

      // Ease off near the end of the edge when another vehicle is in the junction.
      const e = this.graph.edges[v.edge];
      const toEnd = e.length - v.travelled;
      if (toEnd < 12) {
        const node = this.graph.nodes[v.dir === 1 ? e.b : e.a];
        for (const o of vs) {
          if (o === v) continue;
          const d = Math.hypot(o.mesh.position.x - node.x, o.mesh.position.z - node.z);
          if (d < e.width * 0.6 && Math.hypot(o.mesh.position.x - px, o.mesh.position.z - pz) < 14) { gap = Math.min(gap, toEnd); break; }
        }
      }

      const target = gap < 1.2 ? 0 : gap < BRAKE_DIST ? v.cruise * (gap / BRAKE_DIST) : v.cruise;
      v.speed = THREE.MathUtils.damp(v.speed, target, gap < BRAKE_DIST ? 6 : 1.5, dt);
      v.travelled += v.speed * dt;

      // Arrived at the end of the edge: choose the next road.
      while (v.travelled > this.graph.edges[v.edge].length) {
        const cur = this.graph.edges[v.edge];
        v.travelled -= cur.length;
        const node = v.dir === 1 ? cur.b : cur.a;
        const exits = this.graph.exits(node, v.edge);
        if (!exits.length) { v.dir = v.dir === 1 ? -1 : 1; continue; }     // isolated: turn back
        const next = exits[Math.floor(this.rnd() * exits.length)];
        v.edge = next.edge; v.dir = next.dir;
      }
      this.place(v);
      for (const w of v.wheels) w.rotation.x -= (v.speed * dt) / (w.userData.radius || 0.35);
    }
  }

  dispose() {
    for (const v of this.vehicles) v.mesh.removeFromParent();
    this.vehicles.length = 0;
  }
}
