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
        if (Math.abs(x) > hw - 2 || Math.abs(z) > hd - 2 || roads.isOnCarriageway(x, z, 0.3)) { prev = -1; continue; }
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
