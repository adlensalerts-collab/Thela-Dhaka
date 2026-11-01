import * as THREE from 'three';
import type { Obstacle } from '../collision';

/**
 * Sprint 2 — trees live ONLY on the pavements, never on the carriageway.
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

// Shared geometry/materials so 150+ trees stay cheap.
let shared: {
  trunk: THREE.CylinderGeometry; crown: THREE.IcosahedronGeometry; pit: THREE.BoxGeometry;
  bark: THREE.MeshStandardMaterial; leaves: THREE.MeshStandardMaterial[]; soil: THREE.MeshStandardMaterial;
} | null = null;

function getShared() {
  if (shared) return shared;
  const crown = new THREE.IcosahedronGeometry(1, 2);
  // Jitter the crown vertices so foliage reads as organic, not a perfect ball.
  const pos = crown.attributes.position as THREE.BufferAttribute;
  const rnd = mulberry32(7);
  for (let i = 0; i < pos.count; i++) {
    const k = 0.82 + rnd() * 0.32;
    pos.setXYZ(i, pos.getX(i) * k, pos.getY(i) * k * 0.9, pos.getZ(i) * k);
  }
  crown.computeVertexNormals();
  shared = {
    trunk: new THREE.CylinderGeometry(0.16, 0.26, 1, 9),
    crown,
    pit: new THREE.BoxGeometry(1.3, 0.06, 1.3),
    bark: new THREE.MeshStandardMaterial({ color: '#5a4332', roughness: 0.95 }),
    leaves: ['#3f6f3a', '#4d7f3f', '#355f36', '#5a8a45'].map(
      (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85 })
    ),
    soil: new THREE.MeshStandardMaterial({ color: '#4a3b2c', roughness: 1 })
  };
  return shared;
}

function makeTree(rnd: () => number): THREE.Group {
  const s = getShared();
  const g = new THREE.Group();
  const h = 3.2 + rnd() * 1.6;

  const trunk = new THREE.Mesh(s.trunk, s.bark);
  trunk.scale.set(1, h, 1);
  trunk.position.y = h / 2;
  trunk.castShadow = true;
  g.add(trunk);

  const leaf = s.leaves[Math.floor(rnd() * s.leaves.length)];
  const blobs = 3 + Math.floor(rnd() * 2);
  for (let i = 0; i < blobs; i++) {
    const c = new THREE.Mesh(s.crown, leaf);
    const r = 1.2 + rnd() * 0.8;
    c.scale.setScalar(r);
    c.position.set((rnd() - 0.5) * 1.4, h + 0.4 + rnd() * 1.1, (rnd() - 0.5) * 1.4);
    c.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3);
    c.castShadow = true;
    c.receiveShadow = true;
    g.add(c);
  }

  const pit = new THREE.Mesh(s.pit, s.soil);
  pit.position.y = 0.1;
  pit.receiveShadow = true;
  g.add(pit);

  g.rotation.y = rnd() * Math.PI * 2;
  return g;
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

  const tryPlace = (x: number, z: number) => {
    if (rnd() > density) return;
    if (isOnRoad(x, z, streets)) return;
    if (avoid.some((a) => Math.hypot(a.x - x, a.z - z) < a.r)) return;
    const t = makeTree(rnd);
    t.position.set(x, 0, z);
    root.add(t);
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

  scene.add(root);
  return root;
}
