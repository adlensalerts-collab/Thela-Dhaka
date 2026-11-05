import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { addGroundEffects, grimy, lampMaterial, rickshawHoodMaterial } from '../render/vehicleLook';

/**
 * Sprint 2 — visible Dhaka traffic.
 * Every model is built facing local -Z (same "forward" convention as the player after Sprint 1).
 * Bangladesh drives on the LEFT, so lanes are offset to the left of travel direction.
 *
 * TrafficItem keeps {mesh, vertical, v} so the existing checkTrafficImpact() still works;
 * hw/hd/kind/mass are extra fields used for per-vehicle hitboxes and damage.
 */
export type VehicleKind = 'rickshaw' | 'cng' | 'car' | 'bus';

export interface TrafficItem {
  mesh: THREE.Group;
  vertical: boolean;   // true = drives along Z, false = along X
  v: number;           // signed speed along its axis (units/s)
  kind: VehicleKind;
  cruise: number;      // unsigned cruising speed
  hw: number;          // world half-extent along X (depends on axis)
  hd: number;          // world half-extent along Z
  mass: number;        // 1 = rickshaw … 6 = bus; scales damage dealt to the player
  wheels: THREE.Mesh[];
}

export interface Spec { len: number; wid: number; speed: [number, number]; mass: number; weight: number }
export const SPECS: Record<VehicleKind, Spec> = {
  rickshaw: { len: 2.8, wid: 1.3, speed: [2.2, 3.2], mass: 1, weight: 0.45 },
  cng:      { len: 2.7, wid: 1.4, speed: [4.0, 5.5], mass: 1.6, weight: 0.25 },
  car:      { len: 4.2, wid: 1.8, speed: [5.0, 7.0], mass: 3, weight: 0.2 },
  bus:      { len: 9.5, wid: 2.5, speed: [3.5, 4.5], mass: 6, weight: 0.1 }
};

const LANE_OFFSET = 3.1;
const BRAKE_DISTANCE = 7;
const EXTENT = 112;

// Perf: vehicles share materials (one shader build per look, not per vehicle). Shared materials are safe with
// releaseDistrictObjects(), which never disposes a resource still used in the scene.
const matCache = new Map<string, THREE.Material>();
const cached = <T extends THREE.Material>(key: string, make: () => T): T => {
  let m = matCache.get(key) as T | undefined;
  if (!m) { m = make(); matCache.set(key, m); }
  return m;
};
const std = (color: string, roughness = 0.6, metalness = 0) =>
  cached(`std|${color}|${roughness}|${metalness}`, () => new THREE.MeshStandardMaterial({ color, roughness, metalness }));
/** Sprint 8G: painted bodywork that collects road dust towards the wheels. */
const paint = (color: string, roughness = 0.45, metalness = 0.2, height = 1.0) =>
  cached(`paint|${color}|${roughness}|${metalness}|${height}`, () => grimy(new THREE.MeshStandardMaterial({ color, roughness, metalness }), height));

const M = {
  tyre: std('#1d1f22', 0.9),
  rim: std('#9aa0a6', 0.35, 0.8),
  chrome: std('#c9cdd2', 0.25, 0.9),
  glass: new THREE.MeshPhysicalMaterial({ color: '#203540', roughness: 0.08, metalness: 0.1, transmission: 0, clearcoat: 1 }),
  seat: std('#7a2230', 0.7),
  canvas: std('#2b2b2b', 0.85),
  frame: std('#3a3f45', 0.5, 0.6),
  // Sprint 8G: lamps glow when the street lamps come on (dim lenses by day).
  head: lampMaterial('head') as unknown as THREE.MeshStandardMaterial,
  tail: lampMaterial('tail') as unknown as THREE.MeshStandardMaterial
};

function box(p: THREE.Object3D, w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  p.add(mesh);
  return mesh;
}

function wheel(p: THREE.Object3D, r: number, w: number, x: number, z: number, list: THREE.Mesh[]) {
  // Axle along X baked into the geometry, so rotation.x spins the wheel cleanly.
  const t = new THREE.Mesh(new THREE.CylinderGeometry(r, r, w, 16).rotateZ(Math.PI / 2), M.tyre);
  t.position.set(x, r, z);
  t.castShadow = true;
  t.userData.radius = r;
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.55, r * 0.55, w + 0.02, 10).rotateZ(Math.PI / 2), M.rim);
  t.add(hub);
  p.add(t);
  list.push(t);
}

function lights(g: THREE.Group, wid: number, y: number, front: number, back: number) {
  for (const s of [-1, 1]) {
    box(g, 0.22, 0.14, 0.05, M.head, s * (wid / 2 - 0.2), y, front - 0.02);
    box(g, 0.22, 0.12, 0.05, M.tail, s * (wid / 2 - 0.2), y, back + 0.02);
  }
}

function buildRickshaw(color: string, wheels: THREE.Mesh[]) {
  const g = new THREE.Group();
  const body = paint(color, 0.45, 0.2, 1.0);
  // Front cycle part (driver) at -Z, passenger seat + hood at +Z
  wheel(g, 0.36, 0.08, 0, -1.15, wheels);
  box(g, 0.08, 0.08, 1.3, M.frame, 0, 0.55, -0.55);
  box(g, 0.32, 0.08, 0.22, M.seat, 0, 1.0, -0.65);           // driver saddle
  box(g, 0.7, 0.05, 0.05, M.chrome, 0, 1.15, -1.1);          // handlebar
  box(g, 1.25, 0.12, 0.9, body, 0, 0.62, 0.55);              // passenger box
  box(g, 1.15, 0.22, 0.6, M.seat, 0, 0.85, 0.6);             // seat
  box(g, 1.15, 0.6, 0.1, body, 0, 1.15, 0.95);               // backrest
  // Half-cylinder canopy, axis across the vehicle (X), arc on top.
  const hoodGeo = new THREE.CylinderGeometry(0.62, 0.62, 1.2, 14, 1, true, 0, Math.PI).rotateZ(Math.PI / 2);
  // Sprint 8G: hand-painted hood bands (palette follows the body colour).
  const hood = new THREE.Mesh(hoodGeo, cached(`hood|${color}`, () => rickshawHoodMaterial(parseInt(color.slice(1), 16) % 997)));
  hood.rotation.y = Math.PI / 2;
  hood.position.set(0, 1.25, 0.75);
  hood.castShadow = true;
  g.add(hood);
  for (const s of [-1, 1]) wheel(g, 0.36, 0.08, s * 0.62, 0.6, wheels);
  // Rider
  const skin = std('#8a5a3c', 0.8);
  box(g, 0.34, 0.5, 0.24, std('#d9d2bd', 0.9), 0, 1.35, -0.62);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 10), skin);
  head.position.set(0, 1.75, -0.62);
  g.add(head);
  return g;
}

function buildCng(wheels: THREE.Mesh[]) {
  const g = new THREE.Group();
  const green = paint('#1f7a3d', 0.35, 0.35, 1.2);
  box(g, 1.3, 0.55, 2.4, green, 0, 0.6, 0.05);
  box(g, 1.3, 0.9, 1.6, green, 0, 1.3, 0.45);                // cabin cage (Dhaka CNGs are fully caged)
  box(g, 1.32, 0.06, 2.45, std('#123d20', 0.4, 0.3), 0, 1.78, 0.05); // roof
  box(g, 1.15, 0.55, 0.06, M.glass, 0, 1.25, -1.13);         // windscreen
  for (const s of [-1, 1]) box(g, 0.04, 0.7, 1.5, M.frame, s * 0.66, 1.3, 0.45); // grille sides
  wheel(g, 0.28, 0.14, 0, -0.95, wheels);
  for (const s of [-1, 1]) wheel(g, 0.28, 0.14, s * 0.6, 0.85, wheels);
  lights(g, 1.3, 0.75, -1.15, 1.25);
  return g;
}

function buildCar(color: string, wheels: THREE.Mesh[]) {
  const g = new THREE.Group();
  const body = cached(`car|${color}`, () => grimy(new THREE.MeshPhysicalMaterial({ color, roughness: 0.3, metalness: 0.6, clearcoat: 1, clearcoatRoughness: 0.08 }), 0.9));
  box(g, 1.8, 0.6, 4.2, body, 0, 0.62, 0);
  box(g, 1.6, 0.55, 2.2, body, 0, 1.18, 0.2);
  box(g, 1.5, 0.45, 0.05, M.glass, 0, 1.2, -0.92);
  box(g, 1.5, 0.42, 0.05, M.glass, 0, 1.2, 1.32);
  for (const s of [-1, 1]) box(g, 0.05, 0.4, 1.9, M.glass, s * 0.81, 1.2, 0.2);
  box(g, 1.82, 0.16, 0.12, M.chrome, 0, 0.42, -2.1);
  box(g, 1.82, 0.16, 0.12, M.chrome, 0, 0.42, 2.1);
  for (const sx of [-1, 1]) for (const sz of [-1.35, 1.35]) wheel(g, 0.33, 0.22, sx * 0.85, sz, wheels);
  lights(g, 1.8, 0.72, -2.1, 2.1);
  return g;
}

function buildBus(wheels: THREE.Mesh[]) {
  const g = new THREE.Group();
  const red = paint('#b3261e', 0.4, 0.3, 1.6);
  const cream = std('#efe6cf', 0.6);
  box(g, 2.5, 1.2, 9.5, red, 0, 1.0, 0);
  box(g, 2.5, 1.1, 9.5, cream, 0, 2.15, 0);
  box(g, 2.45, 0.1, 9.4, std('#8f8a7c', 0.7), 0, 2.75, 0);
  for (const s of [-1, 1]) box(g, 0.05, 0.75, 8.6, M.glass, s * 1.26, 2.15, 0.2);
  box(g, 2.3, 0.9, 0.05, M.glass, 0, 2.05, -4.76);
  for (const sx of [-1, 1]) for (const sz of [-3.2, 3.0]) wheel(g, 0.5, 0.3, sx * 1.1, sz, wheels);
  lights(g, 2.5, 0.75, -4.76, 4.76);
  return g;
}

export function buildVehicle(kind: VehicleKind, wheels: THREE.Mesh[], rnd: () => number): THREE.Group {
  const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];
  let g: THREE.Group;
  switch (kind) {
    case 'rickshaw': g = buildRickshaw(pick(['#d24449', '#e0b738', '#469c8b', '#d7723c', '#3d6fb6']), wheels); break;
    case 'cng': g = buildCng(wheels); break;
    case 'car': g = buildCar(pick(['#e8e8e8', '#1c1c1e', '#8c95a0', '#7a1e1e', '#24456b']), wheels); break;
    case 'bus': g = buildBus(wheels); break;
  }
  mergeStaticParts(g, wheels);
  // Sprint 8G: contact shadow for every vehicle; night headlight pool for motor vehicles.
  addGroundEffects(g, SPECS[kind].len, SPECS[kind].wid, kind !== 'rickshaw');
  return g;
}

/** Perf: bake every non-spinning part into one mesh per material (a rickshaw goes from ~12 draw calls to ~6).
 * Wheels stay separate because they rotate. */
function mergeStaticParts(g: THREE.Group, wheels: THREE.Mesh[]) {
  const spinning = new Set<THREE.Object3D>(wheels);
  const byMat = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const parts: THREE.Mesh[] = [];
  g.updateMatrixWorld(true);
  for (const child of g.children) {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh || spinning.has(mesh) || Array.isArray(mesh.material) || mesh.children.length) continue;
    const geo = mesh.geometry.clone().applyMatrix4(mesh.matrix);
    if (geo.index === null) continue;
    const list = byMat.get(mesh.material) ?? [];
    list.push(geo);
    byMat.set(mesh.material, list);
    parts.push(mesh);
  }
  for (const [material, geos] of byMat) {
    if (geos.length < 2) { geos.forEach((x) => x.dispose()); continue; }
    const merged = mergeGeometries(geos, false);
    geos.forEach((x) => x.dispose());
    if (!merged) continue;
    for (const m of parts) if (m.material === material) { m.removeFromParent(); m.geometry.dispose(); }
    const mesh = new THREE.Mesh(merged, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    g.add(mesh);
  }
}

export function pickKind(rnd: () => number): VehicleKind {
  let r = rnd();
  for (const k of Object.keys(SPECS) as VehicleKind[]) {
    r -= SPECS[k].weight;
    if (r <= 0) return k;
  }
  return 'rickshaw';
}

/** Model faces local -Z; this yaw makes it face direction (dx, dz). */
const yawFor = (dx: number, dz: number) => Math.atan2(-dx, -dz);

function placeInLane(item: TrafficItem, road: number, along: number) {
  const dir = Math.sign(item.v) || 1;
  // left of travel: for direction (dx,dz) the left vector is (dz, -dx)
  if (item.vertical) {
    item.mesh.position.set(road + dir * LANE_OFFSET, 0, along);   // dir (0,dir) → left = (dir, 0)
    item.mesh.rotation.y = yawFor(0, dir);
  } else {
    item.mesh.position.set(along, 0, road - dir * LANE_OFFSET);   // dir (dir,0) → left = (0, -dir)
    item.mesh.rotation.y = yawFor(dir, 0);
  }
}

export function spawnTraffic(scene: THREE.Scene, streets: number[], count = 18, seed = 99): TrafficItem[] {
  let s = seed;
  const rnd = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
  const items: TrafficItem[] = [];
  for (let i = 0; i < count; i++) {
    const kind = pickKind(rnd);
    const spec = SPECS[kind];
    const vertical = rnd() < 0.5;
    const cruise = spec.speed[0] + rnd() * (spec.speed[1] - spec.speed[0]);
    const wheels: THREE.Mesh[] = [];
    const mesh = buildVehicle(kind, wheels, rnd);
    mesh.name = `traffic-${kind}-${i}`;
    const hl = spec.len / 2, hwid = spec.wid / 2;
    const item: TrafficItem = {
      mesh, vertical, kind, cruise, mass: spec.mass, wheels,
      v: cruise * (rnd() < 0.5 ? 1 : -1),
      hw: vertical ? hwid : hl,
      hd: vertical ? hl : hwid
    };
    placeInLane(item, streets[Math.floor(rnd() * streets.length)], -EXTENT + rnd() * EXTENT * 2);
    scene.add(mesh);
    items.push(item);
  }
  return items;
}

/**
 * Moves traffic. Vehicles brake for the player and for the vehicle ahead in their lane,
 * so collisions happen when the player steps into traffic, not randomly.
 */
export function updateTraffic(items: TrafficItem[], dt: number, playerX: number, playerZ: number) {
  for (const it of items) {
    const p = it.mesh.position;
    const dir = Math.sign(it.v) || 1;
    const fx = it.vertical ? 0 : dir, fz = it.vertical ? dir : 0;
    const halfLen = it.vertical ? it.hd : it.hw;
    const laneHalf = (it.vertical ? it.hw : it.hd) + 0.6;

    let gap = Infinity;
    const check = (ox: number, oz: number, extra: number) => {
      const dx = ox - p.x, dz = oz - p.z;
      const ahead = dx * fx + dz * fz;
      const lateral = Math.abs(dx * fz - dz * fx);
      if (ahead > 0 && lateral < laneHalf + extra) gap = Math.min(gap, ahead - halfLen - extra);
    };
    check(playerX, playerZ, 0.6);
    for (const o of items) if (o !== it && o.vertical === it.vertical) check(o.mesh.position.x, o.mesh.position.z, o.vertical ? o.hd : o.hw);

    const target = gap < 1.2 ? 0 : gap < BRAKE_DISTANCE ? it.cruise * (gap / BRAKE_DISTANCE) : it.cruise;
    const speed = THREE.MathUtils.damp(Math.abs(it.v), target, gap < BRAKE_DISTANCE ? 6 : 1.5, dt);
    it.v = speed * dir;

    if (it.vertical) {
      p.z += it.v * dt;
      if (Math.abs(p.z) > EXTENT) p.z = -Math.sign(p.z) * EXTENT;
    } else {
      p.x += it.v * dt;
      if (Math.abs(p.x) > EXTENT) p.x = -Math.sign(p.x) * EXTENT;
    }
    for (const w of it.wheels) {
      w.rotation.x -= (speed * dt) / (w.userData.radius || 0.35);
    }
  }
}
