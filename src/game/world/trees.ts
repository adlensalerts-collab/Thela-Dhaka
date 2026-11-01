import * as THREE from 'three';
import type { Obstacle } from '../collision';

/**
 * Sprint 2 — trees live ONLY on the pavements, never on the carriageway.
 * Sprint 4 — branching trunks + instanced leaf cards; 1 in 4 is a flowering krishnachura.
 *
 * Road layout (from initWorld): each street line n has a 13-wide road (n ± 6.5)
 * and a 2.8-wide pavement centred at n ± 8.1 (spans 6.7 … 9.5).
 * Trees sit on the outer half of the pavement (n ± 8.75) so people can still walk.
 */
export interface TreeOptions {
  streets: number[];          // street centre lines, e.g. [-80, -40, 0, 40, 80]
  extent?: number;            // half-size of the playable map (default 115)
  spacing?: number;           // distance between tree slots along a pavement (default 14)
  density?: number;           // 0..1 chance a slot gets a tree (default 0.6)
  junctionClearance?: number; // keep this far from any crossing street centre (default 12)
  avoid?: Array<{ x: number; z: number; r: number }>; // stalls, buildings, spawn points…
  seed?: number;
}

const PAVEMENT_OFFSET = 8.75;
const ROAD_HALF_WIDTH = 6.5;

function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** True if (x,z) is on any road surface (used as a final safety check). */
export function isOnRoad(x: number, z: number, streets: number[]): boolean {
  return streets.some((n) => Math.abs(x - n) < ROAD_HALF_WIDTH + 0.3 || Math.abs(z - n) < ROAD_HALF_WIDTH + 0.3);
}

// ---------- Sprint 4: realistic trees ----------
// Every trunk/branch is one InstancedMesh and every leaf card another, across ALL trees,
// so ~120 trees with ~70 leaf cards each still render in a handful of draw calls.

function leafCardTexture(kind: 'leaf' | 'flower') {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  const rnd = mulberry32(kind === 'leaf' ? 21 : 42);
  const greens = ['#2f5a2a', '#3d6e33', '#4f8240', '#5f9149', '#365f2e'];
  const flowers = ['#e8432a', '#f2652b', '#d93322', '#f58a35'];
  for (let i = 0; i < 70; i++) {
    const x = 30 + rnd() * 196, y = 30 + rnd() * 196;
    const len = 18 + rnd() * 16;
    g.save();
    g.translate(x, y);
    g.rotate(rnd() * Math.PI * 2);
    g.fillStyle = (kind === 'leaf' ? greens : flowers)[Math.floor(rnd() * 5) % (kind === 'leaf' ? 5 : 4)];
    g.beginPath();
    if (kind === 'leaf') g.ellipse(0, 0, len, len * 0.38, 0, 0, Math.PI * 2);
    else g.arc(0, 0, len * 0.42, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.18)'; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(-len, 0); g.lineTo(len, 0); g.stroke();
    g.restore();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

let shared: {
  pit: THREE.BoxGeometry; soil: THREE.MeshStandardMaterial;
  wood: THREE.CylinderGeometry; bark: THREE.MeshStandardMaterial;
  card: THREE.PlaneGeometry; leaf: THREE.MeshStandardMaterial; flower: THREE.MeshStandardMaterial;
} | null = null;

function getShared() {
  if (shared) return shared;
  const wood = new THREE.CylinderGeometry(0.65, 1, 1, 8);
  wood.translate(0, 0.5, 0); // base at origin, grows along +Y
  const card = (kind: 'leaf' | 'flower') => new THREE.MeshStandardMaterial({
    map: leafCardTexture(kind), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.75
  });
  shared = {
    pit: new THREE.BoxGeometry(1.3, 0.06, 1.3),
    soil: new THREE.MeshStandardMaterial({ color: '#4a3b2c', roughness: 1 }),
    wood,
    bark: new THREE.MeshStandardMaterial({ color: '#5a4636', roughness: 0.95 }),
    card: new THREE.PlaneGeometry(1.25, 1.25),
    leaf: card('leaf'),
    flower: card('flower')
  };
  return shared;
}

interface TreeParts { wood: THREE.Matrix4[]; leaves: THREE.Matrix4[]; leafTint: THREE.Color[]; flowers: THREE.Matrix4[] }

const UP = new THREE.Vector3(0, 1, 0);
function limb(out: THREE.Matrix4[], base: THREE.Vector3, dir: THREE.Vector3, len: number, radius: number) {
  const q = new THREE.Quaternion().setFromUnitVectors(UP, dir.clone().normalize());
  out.push(new THREE.Matrix4().compose(base, q, new THREE.Vector3(radius, len, radius)));
}

function addTree(parts: TreeParts, x: number, z: number, rnd: () => number) {
  const h = 3.0 + rnd() * 1.5;
  const flame = rnd() < 0.25; // krishnachura
  const lean = new THREE.Vector3((rnd() - 0.5) * 0.15, 1, (rnd() - 0.5) * 0.15);
  const base = new THREE.Vector3(x, 0, z);
  limb(parts.wood, base, lean, h, 0.24);
  const top = base.clone().add(lean.clone().normalize().multiplyScalar(h));

  // 3-5 branches spreading up and out from the top of the trunk
  const branchTips: THREE.Vector3[] = [];
  const nb = 3 + Math.floor(rnd() * 3);
  for (let i = 0; i < nb; i++) {
    const a = (i / nb) * Math.PI * 2 + rnd() * 0.6;
    const dir = new THREE.Vector3(Math.cos(a), 0.8 + rnd() * 0.6, Math.sin(a));
    const len = 1.6 + rnd() * 1.0;
    const start = top.clone().add(new THREE.Vector3(0, -0.4 * rnd(), 0));
    limb(parts.wood, start, dir, len, 0.11);
    branchTips.push(start.add(dir.normalize().multiplyScalar(len)));
  }

  // Leaf cards clustered around each branch tip + a central crown
  const centre = top.clone().add(new THREE.Vector3(0, 1.3, 0));
  const clusters = [...branchTips, centre];
  const tint = new THREE.Color();
  const q = new THREE.Quaternion(), e = new THREE.Euler();
  for (const c of clusters) {
    const n = 14 + Math.floor(rnd() * 6);
    for (let i = 0; i < n; i++) {
      // random point in an ellipsoid, biased to the surface for a fuller silhouette
      const u = rnd() * Math.PI * 2, v = Math.acos(2 * rnd() - 1), rr = 0.55 + 0.45 * Math.cbrt(rnd());
      const p = new THREE.Vector3(
        c.x + Math.sin(v) * Math.cos(u) * 1.5 * rr,
        c.y + Math.cos(v) * 1.0 * rr,
        c.z + Math.sin(v) * Math.sin(u) * 1.5 * rr
      );
      q.setFromEuler(e.set(rnd() * Math.PI, rnd() * Math.PI, rnd() * Math.PI));
      const sc = 0.8 + rnd() * 0.5;
      const m = new THREE.Matrix4().compose(p, q, new THREE.Vector3(sc, sc, sc));
      if (flame && rnd() < 0.4) parts.flowers.push(m);
      else {
        parts.leaves.push(m);
        // slight per-card colour variation; tops a little lighter (sunlit)
        const l = 0.85 + rnd() * 0.25 + (p.y - c.y) * 0.08;
        parts.leafTint.push(tint.setRGB(l, l, l * 0.95).clone());
      }
    }
  }
}

function instanced(geo: THREE.BufferGeometry, mat: THREE.Material, list: THREE.Matrix4[], colors?: THREE.Color[]) {
  const im = new THREE.InstancedMesh(geo, mat, Math.max(1, list.length));
  im.count = list.length;
  list.forEach((m, i) => im.setMatrixAt(i, m));
  if (colors) colors.forEach((c, i) => im.setColorAt(i, c));
  im.castShadow = true;
  im.receiveShadow = true;
  return im;
}

/**
 * Builds pavement trees, adds them to the scene and pushes a circle obstacle per tree.
 * Returns the group so callers can remove/rebuild it.
 */
export function buildPavementTrees(scene: THREE.Scene, obstacles: Obstacle[], opts: TreeOptions): THREE.Group {
  const {
    streets, extent = 115, spacing = 14, density = 0.6,
    junctionClearance = 12, avoid = [], seed = 1337
  } = opts;
  const rnd = mulberry32(seed);
  const root = new THREE.Group();
  root.name = 'pavement-trees';
  const parts: TreeParts = { wood: [], leaves: [], leafTint: [], flowers: [] };
  const pits: THREE.Matrix4[] = [];

  const tryPlace = (x: number, z: number) => {
    if (rnd() > density) return;
    if (isOnRoad(x, z, streets)) return;
    if (avoid.some((a) => Math.hypot(a.x - x, a.z - z) < a.r)) return;
    addTree(parts, x, z, rnd);
    pits.push(new THREE.Matrix4().makeTranslation(x, 0.1, z));
    obstacles.push({ type: 'circle', x, z, radius: 0.45, tag: 'tree' });
  };

  for (const n of streets) {
    for (let a = -extent; a <= extent; a += spacing) {
      // Skip slots that would fall on or next to a crossing street.
      if (streets.some((m) => Math.abs(a - m) < junctionClearance)) continue;
      for (const side of [-1, 1]) {
        tryPlace(a, n + side * PAVEMENT_OFFSET); // pavement of horizontal street
        tryPlace(n + side * PAVEMENT_OFFSET, a); // pavement of vertical street
      }
    }
  }

  const sh = getShared();
  root.add(
    instanced(sh.wood, sh.bark, parts.wood),
    instanced(sh.card, sh.leaf, parts.leaves, parts.leafTint),
    instanced(sh.card, sh.flower, parts.flowers),
    instanced(sh.pit, sh.soil, pits)
  );
  scene.add(root);
  return root;
}

/**
 * M4 — real-map trees: build trees at exact points (from the district file) with the same
 * instanced, branching, flowering trees as the grid map. Adds a circle obstacle per tree.
 */
export function buildTreesAt(scene: THREE.Scene, obstacles: Obstacle[], points: Array<[number, number]>, seed = 2024): THREE.Group {
  const rnd = mulberry32(seed);
  const root = new THREE.Group();
  root.name = 'pavement-trees';
  const parts: TreeParts = { wood: [], leaves: [], leafTint: [], flowers: [] };
  const pits: THREE.Matrix4[] = [];
  for (const [x, z] of points) {
    addTree(parts, x, z, rnd);
    pits.push(new THREE.Matrix4().makeTranslation(x, 0.16, z));
    obstacles.push({ type: 'circle', x, z, radius: 0.45, tag: 'tree' });
  }
  const sh = getShared();
  root.add(
    instanced(sh.wood, sh.bark, parts.wood),
    instanced(sh.card, sh.leaf, parts.leaves, parts.leafTint),
    instanced(sh.card, sh.flower, parts.flowers),
    instanced(sh.pit, sh.soil, pits)
  );
  scene.add(root);
  return root;
}
