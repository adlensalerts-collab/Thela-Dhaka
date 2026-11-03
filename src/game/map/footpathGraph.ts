import { SidewalkGraph, type SidewalkNode } from '../pathfinding';
import type { District } from './district';
import type { RoadGraph } from './roadGraph';

/**
 * M4 — pedestrian network on a real district's footpaths.
 * Returns a real SidewalkGraph instance (same A* / random-destination methods), filled with nodes
 * along both footpaths of every road, linked along each footpath and across roads at junctions
 * (where the zebra crossings are). pedestrians.ts uses it unchanged:
 *   new PedestrianManager(scene, buildFootpathGraph(district, roads), count)
 */
export function buildFootpathGraph(d: District, roads: RoadGraph, spacing = 12): SidewalkGraph {
  const g = Object.create(SidewalkGraph.prototype) as SidewalkGraph;
  const nodes: SidewalkNode[] = [];
  const nodeMap = new Map<number, SidewalkNode>();
  (g as any).nodes = nodes;
  (g as any).nodeMap = nodeMap;
  const add = (x: number, z: number) => {
    const n: SidewalkNode = { id: nodes.length, x, z, neighbors: [] };
    nodes.push(n); nodeMap.set(n.id, n);
    return n.id;
  };
  const link = (a: number, b: number) => {
    if (a === b) return;
    const na = nodes[a], nb = nodes[b];
    if (!na.neighbors.includes(b)) na.neighbors.push(b);
    if (!nb.neighbors.includes(a)) nb.neighbors.push(a);
  };
  const hw = d.bounds.halfWidth, hd = d.bounds.halfDepth;
  const ends: Array<{ id: number; x: number; z: number; edge: number }> = [];

  for (const e of roads.edges) {
    const off = e.width / 2 + e.footpath / 2;
    for (const side of [-1, 1]) {
      let prev = -1;
      const steps = Math.max(1, Math.round(e.length / spacing));
      for (let k = 0; k <= steps; k++) {
        const p = roads.pointAt(e, (e.length * k) / steps);
        const x = p.x + p.tz * off * side, z = p.z - p.tx * off * side;
        // skip points that land on another road's carriageway (inside junctions) or off the map
        if (Math.abs(x) > hw - 2 || Math.abs(z) > hd - 2 || roads.isOnCarriageway(x, z, 0.3)) {
          // Sprint 10 fix: the point before a gap is a run end too (it was only recorded after gaps,
          // so most junctions never linked and the graph fell apart into small pieces).
          if (prev >= 0) ends.push({ id: prev, x: nodes[prev].x, z: nodes[prev].z, edge: e.id });
          prev = -1;
          continue;
        }
        const id = add(x, z);
        if (prev >= 0) link(prev, id);
        if (prev < 0 || k === steps) ends.push({ id, x, z, edge: e.id });
        prev = id;
      }
    }
  }
  // Crossings: connect footpath ends of DIFFERENT roads (or opposite sides) that meet at a junction.
  for (let i = 0; i < ends.length; i++) {
    for (let j = i + 1; j < ends.length; j++) {
      const a = ends[i], b = ends[j];
      const dist = Math.hypot(a.x - b.x, a.z - b.z);
      const w = Math.max(roads.edges[a.edge].width, roads.edges[b.edge].width);
      if (dist < w + 6) link(a.id, b.id);
    }
  }
  // Sprint 10 fix: where the footpaths of two roads meet at a corner, join them (nodes within 4 m).
  const CELL = 8;
  const cells = new Map<string, number[]>();
  for (const n of nodes) {
    const k = `${Math.floor(n.x / CELL)},${Math.floor(n.z / CELL)}`;
    let c = cells.get(k); if (!c) { c = []; cells.set(k, c); } c.push(n.id);
  }
  for (const n of nodes) {
    const cx = Math.floor(n.x / CELL), cz = Math.floor(n.z / CELL);
    for (let ix = cx - 1; ix <= cx + 1; ix++) for (let iz = cz - 1; iz <= cz + 1; iz++) {
      for (const m of cells.get(`${ix},${iz}`) ?? []) {
        if (m <= n.id) continue;
        const o = nodes[m];
        if (Math.hypot(o.x - n.x, o.z - n.z) < 4 && !roads.isOnCarriageway((n.x + o.x) / 2, (n.z + o.z) / 2)) link(n.id, m);
      }
    }
  }
  // Sprint 10 fix: no node or link may enter a building footprint (corner joins and junction
  // crossings can clip a building at the corner).
  const inside = buildingTest(d);
  const blocked = new Set<number>();
  for (const n of nodes) if (inside(n.x, n.z)) blocked.add(n.id);
  for (const n of nodes) {
    n.neighbors = n.neighbors.filter((m) => {
      if (blocked.has(n.id) || blocked.has(m)) return false;
      const o = nodes[m];
      const steps = Math.max(8, Math.ceil(Math.hypot(o.x - n.x, o.z - n.z) / 0.3));   // ~0.3 m samples
      for (let k = 1; k < steps; k++) {
        const t = k / steps;
        if (inside(n.x + (o.x - n.x) * t, n.z + (o.z - n.z) * t)) return false;
      }
      return true;
    });
  }
  // Sprint 10 fix: join stray footpath pieces to the main network with a short road crossing
  // (≤ 30 m, never through a building), so whole streets aren't dropped below.
  joinComponents(nodes, link, inside, blocked);
  // Keep only the largest connected group so every pedestrian can reach every destination.
  const seen = new Int32Array(nodes.length).fill(-1);
  let best = -1, bestSize = 0, comp = 0;
  for (const n of nodes) {
    if (seen[n.id] >= 0) continue;
    let size = 0; const stack = [n.id]; seen[n.id] = comp;
    while (stack.length) { const c = stack.pop()!; size++; for (const m of nodes[c].neighbors) if (seen[m] < 0) { seen[m] = comp; stack.push(m); } }
    if (size > bestSize) { bestSize = size; best = comp; }
    comp++;
  }
  if (comp > 1) {
    const keep = nodes.filter((n) => seen[n.id] === best);
    const remap = new Map(keep.map((n, i) => [n.id, i]));
    nodes.length = 0; nodeMap.clear();
    for (const n of keep) {
      const m: SidewalkNode = { id: remap.get(n.id)!, x: n.x, z: n.z, neighbors: n.neighbors.filter((x) => remap.has(x)).map((x) => remap.get(x)!) };
      nodes.push(m); nodeMap.set(m.id, m);
    }
  }
  return g;
}

/** Point-in-building test over the district footprints, bucketed on a 20 m grid. */
function buildingTest(d: District): (x: number, z: number) => boolean {
  const CELL = 20;
  const grid = new Map<string, Array<[number, number][]>>();
  const list = d.buildings ?? [];
  for (const b of list) {
    const f = b.footprint;
    if (!f || f.length < 3) continue;
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const [x, z] of f) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    for (let ix = Math.floor(x0 / CELL); ix <= Math.floor(x1 / CELL); ix++) {
      for (let iz = Math.floor(z0 / CELL); iz <= Math.floor(z1 / CELL); iz++) {
        const k = `${ix},${iz}`;
        let c = grid.get(k); if (!c) { c = []; grid.set(k, c); } c.push(f);
      }
    }
  }
  return (x, z) => {
    const c = grid.get(`${Math.floor(x / CELL)},${Math.floor(z / CELL)}`);
    if (!c) return false;
    for (const poly of c) {
      let hit = false;
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const [xi, zi] = poly[i], [xj, zj] = poly[j];
        if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) hit = !hit;
      }
      if (hit) return true;
    }
    return false;
  };
}

function components(nodes: SidewalkNode[]): Int32Array {
  const comp = new Int32Array(nodes.length).fill(-1);
  let c = 0;
  for (const n of nodes) {
    if (comp[n.id] >= 0) continue;
    const stack = [n.id]; comp[n.id] = c;
    while (stack.length) { const k = stack.pop()!; for (const m of nodes[k].neighbors) if (comp[m] < 0) { comp[m] = c; stack.push(m); } }
    c++;
  }
  return comp;
}

function joinComponents(nodes: SidewalkNode[], link: (a: number, b: number) => void, inside: (x: number, z: number) => boolean, blocked: Set<number>) {
  const MAX = 30;
  for (let pass = 0; pass < 6; pass++) {
    const comp = components(nodes);
    const sizes = new Map<number, number>();
    for (let i = 0; i < comp.length; i++) sizes.set(comp[i], (sizes.get(comp[i]) ?? 0) + 1);
    if (sizes.size <= 1) return;
    // bucket nodes for neighbour search
    const CELL = MAX;
    const grid = new Map<string, number[]>();
    for (const n of nodes) {
      if (blocked.has(n.id)) continue;
      const k = `${Math.floor(n.x / CELL)},${Math.floor(n.z / CELL)}`;
      let g = grid.get(k); if (!g) { g = []; grid.set(k, g); } g.push(n.id);
    }
    const clear = (a: SidewalkNode, b: SidewalkNode) => {
      const steps = Math.max(8, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.3));
      for (let k = 1; k < steps; k++) { const t = k / steps; if (inside(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t)) return false; }
      return true;
    };
    let joined = 0;
    // for every pair of different pieces, link their closest clear node pair (once per pair per pass)
    const best = new Map<string, { a: number; b: number; d: number }>();
    for (const n of nodes) {
      if (blocked.has(n.id)) continue;
      const cx = Math.floor(n.x / CELL), cz = Math.floor(n.z / CELL);
      for (let ix = cx - 1; ix <= cx + 1; ix++) for (let iz = cz - 1; iz <= cz + 1; iz++) {
        for (const m of grid.get(`${ix},${iz}`) ?? []) {
          if (comp[m] === comp[n.id] || m < n.id) continue;
          const o = nodes[m];
          const dist = Math.hypot(o.x - n.x, o.z - n.z);
          if (dist > MAX) continue;
          const key = comp[n.id] < comp[m] ? `${comp[n.id]}-${comp[m]}` : `${comp[m]}-${comp[n.id]}`;
          const cur = best.get(key);
          if (cur && cur.d <= dist) continue;
          if (!clear(n, o)) continue;
          best.set(key, { a: n.id, b: m, d: dist });
        }
      }
    }
    for (const { a, b } of best.values()) { link(a, b); joined++; }
    if (!joined) return;
  }
}
