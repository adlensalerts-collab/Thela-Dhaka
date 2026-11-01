import type { District, XZ } from './district';

/**
 * M2 — road graph for a real district.
 * Roads are split at junctions into edges. Answers "is this point on a carriageway?",
 * gives left-hand lane positions for traffic (Bangladesh drives on the left), and routes with A*.
 */
export interface RoadEdge {
  id: number;
  a: number; b: number;            // graph node ids (start / end)
  points: XZ[];
  cum: number[];                   // cumulative length at each point
  length: number;
  width: number;                   // carriageway width
  footpath: number;
  oneway: boolean;                 // travel only a -> b
  traffic: boolean;
  name: string;
  roadClass: string;
}
export interface RoadNode { id: number; x: number; z: number; edges: Array<{ edge: number; dir: 1 | -1 }> }
export interface Pose { x: number; z: number; tx: number; tz: number }   // position + unit travel direction
export interface NearestHit { edge: RoadEdge; s: number; x: number; z: number; dist: number }

const CELL = 20;

export class RoadGraph {
  nodes: RoadNode[] = [];
  edges: RoadEdge[] = [];
  readonly halfWidth: number;
  readonly halfDepth: number;
  private grid = new Map<string, Array<{ e: number; i: number }>>();

  constructor(d: District) {
    this.halfWidth = d.bounds.halfWidth;
    this.halfDepth = d.bounds.halfDepth;
    const junctionIds = new Set(d.junctions.map((j) => j.id));
    const nodeIndex = new Map<string, number>();
    const nodeFor = (osmId: string, p: XZ) => {
      let id = nodeIndex.get(osmId);
      if (id === undefined) {
        id = this.nodes.length;
        this.nodes.push({ id, x: p[0], z: p[1], edges: [] });
        nodeIndex.set(osmId, id);
      }
      return id;
    };
    for (const r of d.roads) {
      let start = 0;
      for (let i = 1; i < r.points.length; i++) {
        const isEnd = i === r.points.length - 1;
        if (!isEnd && !junctionIds.has(r.nodes[i])) continue;
        const pts = r.points.slice(start, i + 1) as XZ[];
        const a = nodeFor(r.nodes[start], r.points[start]);
        const b = nodeFor(r.nodes[i], r.points[i]);
        this.addEdge(a, b, pts, r.width, r.footpath, r.oneway, r.traffic, r.name, r.class);
        start = i;
      }
    }
  }

  private addEdge(a: number, b: number, points: XZ[], width: number, footpath: number, oneway: boolean, traffic: boolean, name: string, roadClass: string) {
    const cum = [0];
    for (let i = 1; i < points.length; i++) {
      cum.push(cum[i - 1] + Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]));
    }
    const length = cum[cum.length - 1];
    if (length < 0.5) return;
    const id = this.edges.length;
    this.edges.push({ id, a, b, points, cum, length, width, footpath, oneway, traffic, name, roadClass });
    this.nodes[a].edges.push({ edge: id, dir: 1 });
    if (!oneway || a === b) this.nodes[b].edges.push({ edge: id, dir: -1 });
    else this.nodes[b].edges.push({ edge: id, dir: -1 });   // kept for geometry queries; routing checks oneway
    // index each segment in every grid cell its (widened) bbox touches
    const pad = width / 2 + footpath + 1;
    for (let i = 0; i < points.length - 1; i++) {
      const [x0, z0] = points[i], [x1, z1] = points[i + 1];
      const cx0 = Math.floor((Math.min(x0, x1) - pad) / CELL), cx1 = Math.floor((Math.max(x0, x1) + pad) / CELL);
      const cz0 = Math.floor((Math.min(z0, z1) - pad) / CELL), cz1 = Math.floor((Math.max(z0, z1) + pad) / CELL);
      for (let cx = cx0; cx <= cx1; cx++) for (let cz = cz0; cz <= cz1; cz++) {
        const k = `${cx},${cz}`;
        if (!this.grid.has(k)) this.grid.set(k, []);
        this.grid.get(k)!.push({ e: id, i });
      }
    }
  }

  /** Nearest point on any road centreline within the local grid cell. */
  nearest(x: number, z: number, onlyTraffic = false): NearestHit | null {
    const cell = this.grid.get(`${Math.floor(x / CELL)},${Math.floor(z / CELL)}`);
    if (!cell) return null;
    let best: NearestHit | null = null;
    for (const { e, i } of cell) {
      const edge = this.edges[e];
      if (onlyTraffic && !edge.traffic) continue;
      const [x0, z0] = edge.points[i], [x1, z1] = edge.points[i + 1];
      const ex = x1 - x0, ez = z1 - z0, l2 = ex * ex + ez * ez || 1e-9;
      const t = Math.max(0, Math.min(1, ((x - x0) * ex + (z - z0) * ez) / l2));
      const px = x0 + ex * t, pz = z0 + ez * t;
      const dist = Math.hypot(x - px, z - pz);
      if (!best || dist < best.dist) best = { edge, s: edge.cum[i] + Math.sqrt(l2) * t, x: px, z: pz, dist };
    }
    return best;
  }

  /** True if (x, z) is on a carriageway (each road checked against its own width). */
  isOnCarriageway(x: number, z: number, margin = 0): boolean {
    const cell = this.grid.get(`${Math.floor(x / CELL)},${Math.floor(z / CELL)}`);
    if (!cell) return false;
    for (const { e, i } of cell) {
      const edge = this.edges[e];
      const [x0, z0] = edge.points[i], [x1, z1] = edge.points[i + 1];
      const ex = x1 - x0, ez = z1 - z0, l2 = ex * ex + ez * ez || 1e-9;
      const t = Math.max(0, Math.min(1, ((x - x0) * ex + (z - z0) * ez) / l2));
      if (Math.hypot(x - (x0 + ex * t), z - (z0 + ez * t)) < edge.width / 2 + margin) return true;
    }
    return false;
  }

  /** True if (x, z) is on a footpath (outside every carriageway, inside some road's footpath band). */
  isOnFootpath(x: number, z: number): boolean {
    if (this.isOnCarriageway(x, z)) return false;
    const n = this.nearest(x, z);
    return !!n && n.dist <= n.edge.width / 2 + n.edge.footpath;
  }

  /** Point at distance s along an edge's centreline, with the a->b unit tangent. */
  pointAt(edge: RoadEdge, s: number): Pose {
    s = Math.max(0, Math.min(edge.length, s));
    let i = 1;
    while (i < edge.cum.length - 1 && edge.cum[i] < s) i++;
    const [x0, z0] = edge.points[i - 1], [x1, z1] = edge.points[i];
    const seg = edge.cum[i] - edge.cum[i - 1] || 1e-9;
    const t = (s - edge.cum[i - 1]) / seg;
    return { x: x0 + (x1 - x0) * t, z: z0 + (z1 - z0) * t, tx: (x1 - x0) / seg, tz: (z1 - z0) / seg };
  }

  /**
   * Lane pose for a vehicle that has travelled `travelled` metres along `edge` in direction `dir`.
   * Left-hand traffic: the lane centre is offset to the LEFT of the travel direction.
   */
  lanePose(edge: RoadEdge, dir: 1 | -1, travelled: number): Pose {
    const p = this.pointAt(edge, dir === 1 ? travelled : edge.length - travelled);
    const tx = p.tx * dir, tz = p.tz * dir;
    const off = edge.oneway ? edge.width * 0.18 : edge.width / 4;   // left of travel = (tz, -tx)
    return { x: p.x + tz * off, z: p.z - tx * off, tx, tz };
  }

  /** Edges a vehicle may take when arriving at node `nodeId` from `fromEdge` (no U-turn unless dead end). */
  exits(nodeId: number, fromEdge: number): Array<{ edge: number; dir: 1 | -1 }> {
    const all = this.nodes[nodeId].edges.filter(({ edge, dir }) => {
      const e = this.edges[edge];
      return e.traffic && !(e.oneway && dir === -1);
    });
    const forward = all.filter((x) => x.edge !== fromEdge);
    return forward.length ? forward : all;
  }

  /** A* shortest path between graph nodes over traffic roads; returns the edge sequence. */
  route(from: number, to: number): Array<{ edge: number; dir: 1 | -1 }> {
    const g = new Map<number, number>([[from, 0]]);
    const prev = new Map<number, { node: number; edge: number; dir: 1 | -1 }>();
    const h = (n: number) => Math.hypot(this.nodes[n].x - this.nodes[to].x, this.nodes[n].z - this.nodes[to].z);
    const open = new Set<number>([from]);
    while (open.size) {
      let cur = -1, bestF = Infinity;
      for (const n of open) { const f = (g.get(n) ?? Infinity) + h(n); if (f < bestF) { bestF = f; cur = n; } }
      if (cur === to) break;
      open.delete(cur);
      for (const { edge, dir } of this.nodes[cur].edges) {
        const e = this.edges[edge];
        if (!e.traffic || (e.oneway && dir === -1)) continue;
        const next = dir === 1 ? e.b : e.a;
        const cost = (g.get(cur) ?? 0) + e.length;
        if (cost < (g.get(next) ?? Infinity)) { g.set(next, cost); prev.set(next, { node: cur, edge, dir }); open.add(next); }
      }
    }
    if (!prev.has(to) && from !== to) return [];
    const path: Array<{ edge: number; dir: 1 | -1 }> = [];
    for (let n = to; n !== from;) { const p = prev.get(n)!; path.unshift({ edge: p.edge, dir: p.dir }); n = p.node; }
    return path;
  }

  /** Nearest graph node to a point (for routing police / NPCs). */
  nearestNode(x: number, z: number, onlyTraffic = true): number {
    let best = 0, bd = Infinity;
    for (const n of this.nodes) {
      if (onlyTraffic && !n.edges.some(({ edge }) => this.edges[edge].traffic)) continue;
      const d = (n.x - x) ** 2 + (n.z - z) ** 2;
      if (d < bd) { bd = d; best = n.id; }
    }
    return best;
  }
}
