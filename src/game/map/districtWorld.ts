import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Obstacle, PolyObstacle } from '../collision';
import { pbrMaterial, applyWorldUV } from '../render/pbr';
import { buildTreesAt } from '../world/trees';
import { buildGarage } from '../world/garages';
import { buildAarot } from '../world/aarots';
import type { District, ServiceSite, XZ } from './district';
import { RoadGraph } from './roadGraph';
import { ObstacleGrid } from './obstacleGrid';
import { ChunkManager } from './chunks';
import { buildFootpathGraph } from './footpathGraph';
import type { SidewalkGraph } from '../pathfinding';

/**
 * M2–M5 — builds a real Dhaka district from its map file:
 * merged roads + raised footpaths with kerbs, markings, buildings from real footprints (chunked,
 * instanced details), trees, poles, stalls, garages and aarots facing their road, and all collision.
 * Replaces the old grid world (initWorld's street/building/tree/pole/stall code).
 */
export interface ServicePoint { site: ServiceSite; entrance: { x: number; z: number } }
export interface DistrictWorld {
  district: District;
  roads: RoadGraph;
  footpaths: SidewalkGraph;
  grid: ObstacleGrid;
  obstacles: Obstacle[];
  chunks: ChunkManager;
  garages: ServicePoint[];
  aarots: ServicePoint[];
  stalls: ServiceSite[];
  spawn: { x: number; z: number };
  bounds: { x: number; z: number };
  stats: Record<string, number>;
}

const FLOOR = 3.2;
const SHOP_NAMES = ['চায়ের দোকান', 'ফলের আড়ৎ', 'মা ফার্মেসি', 'সবজি বাজার', 'ফুচকা হাউস', 'মায়ের দোয়া', 'মিষ্টি ঘর',
  'বস্ত্র বিতান', 'জুতার দোকান', 'মোবাইল সেন্টার', 'বই ঘর', 'ঢাকা খাবার', 'স্টেশনারি', 'টেইলার্স'];

function rng(seed: number) {
  let s = (Math.abs(Math.floor(seed)) % 2147483646) + 1;
  return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
}
function hashId(id: string) { let h = 7; for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0; return Math.abs(h) + 1; }

/** Shape for ShapeGeometry/ExtrudeGeometry: world (x, z) -> shape (x, -z); rotateX(-90°) maps it back flat. */
function toShape(outer: XZ[], holes: XZ[][] = []) {
  const shape = new THREE.Shape(outer.map(([x, z]) => new THREE.Vector2(x, -z)));
  for (const h of holes) shape.holes.push(new THREE.Path(h.map(([x, z]) => new THREE.Vector2(x, -z))));
  return shape;
}

function pointInRing(x: number, z: number, ring: XZ[]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, zi] = ring[i], [xj, zj] = ring[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

function signTexture(text: string, bg: string) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, 0, 128); grad.addColorStop(0, bg); grad.addColorStop(1, '#0d1a18');
  g.fillStyle = grad; g.fillRect(0, 0, 512, 128);
  g.strokeStyle = 'rgba(255,255,255,0.6)'; g.lineWidth = 6; g.strokeRect(6, 6, 500, 116);
  g.fillStyle = '#fff6dc'; g.font = 'bold 64px "Hind Siliguri", "Noto Sans Bengali", sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 256, 68, 480);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return new THREE.MeshStandardMaterial({ map: t, emissive: '#ffffff', emissiveMap: t, emissiveIntensity: 0.35, roughness: 0.5 });
}

/** Collects InstancedMesh transforms per chunk, then builds them in one go. */
class Batch {
  private lists = new Map<THREE.Group, THREE.Matrix4[]>();
  private colors = new Map<THREE.Group, THREE.Color[]>();
  constructor(private geo: THREE.BufferGeometry, private mat: THREE.Material, private shadow = true) {}
  add(chunk: THREE.Group, m: THREE.Matrix4, c?: THREE.Color) {
    if (!this.lists.has(chunk)) { this.lists.set(chunk, []); this.colors.set(chunk, []); }
    this.lists.get(chunk)!.push(m);
    if (c) this.colors.get(chunk)!.push(c);
  }
  build() {
    let n = 0;
    for (const [chunk, list] of this.lists) {
      const im = new THREE.InstancedMesh(this.geo, this.mat, list.length);
      list.forEach((m, i) => im.setMatrixAt(i, m));
      const cols = this.colors.get(chunk)!;
      if (cols.length === list.length) cols.forEach((c, i) => im.setColorAt(i, c));
      im.castShadow = this.shadow; im.receiveShadow = true;
      im.computeBoundingSphere();
      chunk.add(im); n += list.length;
    }
    return n;
  }
}

const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e3 = new THREE.Euler(), one = new THREE.Vector3(1, 1, 1);
const compose = (x: number, y: number, z: number, yaw: number, sx = 1, sy = 1, sz = 1) =>
  m4.clone().compose(new THREE.Vector3(x, y, z), q.clone().setFromEuler(e3.set(0, yaw, 0)), new THREE.Vector3(sx, sy, sz));

export function buildDistrictWorld(scene: THREE.Scene, d: District): DistrictWorld {
  const roads = new RoadGraph(d);
  const chunks = new ChunkManager(scene, 120);
  const grid = new ObstacleGrid(12);
  const obstacles: Obstacle[] = [];
  const addObs = (o: Obstacle) => { obstacles.push(o); grid.add(o); };
  const stats: Record<string, number> = {};
  const hw = d.bounds.halfWidth, hd = d.bounds.halfDepth;

  // ---- Ground
  const soil = pbrMaterial('soil');
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(2 * hw + 120, 2 * hd + 120).rotateX(-Math.PI / 2), soil);
  ground.position.y = -0.02; ground.receiveShadow = true; applyWorldUV(ground);
  scene.add(ground);

  // ---- Roads (merged polygons → clean junctions) and raised footpaths with kerbs
  const asphalt = pbrMaterial('asphalt');
  const paving = pbrMaterial('pavement');
  for (const poly of d.surfaces.carriageway) {
    const mesh = new THREE.Mesh(new THREE.ShapeGeometry(toShape(poly.outer, poly.holes)).rotateX(-Math.PI / 2), asphalt);
    mesh.receiveShadow = true; applyWorldUV(mesh); scene.add(mesh);
  }
  for (const poly of d.surfaces.footpath) {
    const geo = new THREE.ExtrudeGeometry(toShape(poly.outer, poly.holes), { depth: 0.15, bevelEnabled: false }).rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(geo, paving);
    mesh.receiveShadow = true; applyWorldUV(mesh); scene.add(mesh);
  }
  stats.roadPolygons = d.surfaces.carriageway.length; stats.footpathPolygons = d.surfaces.footpath.length;

  // ---- Markings
  const paint = new THREE.MeshStandardMaterial({ color: '#ece4c2', roughness: 0.6 });
  const flat = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const dashes = new Batch(flat, paint, false);
  for (const [x0, z0, x1, z1] of d.markings.dashes) {
    const len = Math.hypot(x1 - x0, z1 - z0);
    dashes.add(chunks.chunkAt((x0 + x1) / 2, (z0 + z1) / 2), compose((x0 + x1) / 2, 0.025, (z0 + z1) / 2, Math.atan2(x1 - x0, z1 - z0), 0.15, 1, len));
  }
  for (const zb of d.markings.zebras) {
    const tx = Math.sin(zb.angle), tz = Math.cos(zb.angle);    // road direction
    const nx = tz, nz = -tx;                                   // across the road
    const count = Math.floor(zb.width / 1.0);
    for (let k = 0; k < count; k++) {
      const off = (k + 0.5) - count / 2;
      const x = zb.x + nx * off, z = zb.z + nz * off;
      dashes.add(chunks.chunkAt(x, z), compose(x, 0.026, z, zb.angle, 0.5, 1, zb.depth));
    }
  }
  stats.markings = dashes.build();

  // ---- Buildings from real footprints
  const plaster = pbrMaterial('plaster'); plaster.vertexColors = true;
  const brick = pbrMaterial('brick');
  const shopLevel = pbrMaterial('concrete', { tint: '#b9b2a6' });
  const roofMat = pbrMaterial('concrete', { tint: '#cfcac0' });
  const glassDark = new THREE.MeshPhysicalMaterial({ color: '#2b3a3f', roughness: 0.06, metalness: 0.2, clearcoat: 1 });
  const glassLit = new THREE.MeshStandardMaterial({ color: '#f6d9a0', emissive: '#ffcf86', emissiveIntensity: 0.55, roughness: 0.3 });
  const grillTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d')!;
    g.strokeStyle = '#fff'; g.lineWidth = 3;
    for (let i = 4; i < 64; i += 12) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 64); g.stroke(); }
    g.lineWidth = 4; g.beginPath(); g.moveTo(0, 32); g.lineTo(64, 32); g.stroke(); g.strokeRect(2, 2, 60, 60);
    g.lineWidth = 2; g.beginPath(); g.arc(32, 32, 14, 0, Math.PI * 2); g.stroke();
    return new THREE.CanvasTexture(c);
  })();
  const grill = new THREE.MeshStandardMaterial({ color: '#2a2d30', roughness: 0.5, metalness: 0.6, alphaMap: grillTex, alphaTest: 0.5, side: THREE.DoubleSide });
  const shutterMat = pbrMaterial('metal', { tint: '#c9ccce', metalness: 0.6 });
  const tankMat = new THREE.MeshStandardMaterial({ color: '#16181a', roughness: 0.45 });
  const plane = new THREE.PlaneGeometry(1, 1);
  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  const tankGeo = new THREE.CylinderGeometry(0.75, 0.75, 1.3, 14);
  const winDark = new Batch(plane, glassDark, false), winLit = new Batch(plane, glassLit, false);
  const grills = new Batch(plane, grill, false), shutters = new Batch(unitBox, shutterMat), tanks = new Batch(tankGeo, tankMat);
  const palette = ['#e0d4bc', '#d9cdb4', '#e8dfce', '#d4c7af', '#dfd7c5', '#c9d6cf', '#e6d2c2'];

  // per-chunk merged wall/roof geometry buffers
  type Buf = { pos: number[]; nor: number[]; uv: number[]; col: number[] };
  const bufs = new Map<string, Buf>();
  const buf = (chunk: THREE.Group, kind: string) => {
    const k = chunk.name + '|' + kind;
    if (!bufs.has(k)) bufs.set(k, { pos: [], nor: [], uv: [], col: [] });
    return bufs.get(k)!;
  };
  const quad = (b: Buf, p0: XZ, p1: XZ, y0: number, y1: number, n: [number, number], u0: number, len: number, c: THREE.Color, flip: boolean) => {
    const v = [[p0[0], y0, p0[1]], [p1[0], y0, p1[1]], [p1[0], y1, p1[1]], [p0[0], y1, p0[1]]];
    const uvs = [[u0, y0], [u0 + len, y0], [u0 + len, y1], [u0, y1]].map(([u, w]) => [u / 4, w / 4]);
    const tri = flip ? [0, 2, 1, 0, 3, 2] : [0, 1, 2, 0, 2, 3];
    for (const i of tri) { b.pos.push(...v[i]); b.nor.push(n[0], 0, n[1]); b.uv.push(...uvs[i]); b.col.push(c.r, c.g, c.b); }
  };
  const roofs = new Map<THREE.Group, THREE.BufferGeometry[]>();
  let signs = 0;
  for (const bd of d.buildings) {
    const ring = bd.footprint;
    if (ring.length < 3) continue;
    const r = rng(hashId(bd.id));
    const floors = bd.height ? Math.max(1, Math.round(bd.height / FLOOR)) : bd.levels ? bd.levels : 3 + Math.floor(r() * 6);
    const h = floors * FLOOR;
    let cx = 0, cz = 0; for (const [x, z] of ring) { cx += x; cz += z; } cx /= ring.length; cz /= ring.length;
    const chunk = chunks.chunkAt(cx, cz);
    const isBrick = r() < 0.3;
    const tint = new THREE.Color(isBrick ? '#ffffff' : palette[Math.floor(r() * palette.length)]);
    const white = new THREE.Color('#ffffff');
    // Winding from the signed area: for area > 0 the natural normal (-ez, ex) points INTO the
    // building, so flip it (robust for concave and very thin footprints).
    let area2 = 0;
    for (let i = 0; i < ring.length; i++) { const [x0, z0] = ring[i], [x1, z1] = ring[(i + 1) % ring.length]; area2 += x0 * z1 - x1 * z0; }
    const flip = area2 > 0;
    let u = 0;
    let bestEdge = -1, bestLen = 0;
    for (let i = 0; i < ring.length; i++) {
      const p0 = ring[i], p1 = ring[(i + 1) % ring.length];
      const ex = p1[0] - p0[0], ez = p1[1] - p0[1], len = Math.hypot(ex, ez);
      if (len < 0.2) continue;
      let n: [number, number] = [-ez / len, ex / len];
      if (flip) n = [-n[0], -n[1]];
      quad(buf(chunk, 'shop'), p0, p1, 0, Math.min(FLOOR, h), n, u, len, white, flip);
      if (h > FLOOR + 0.01) quad(buf(chunk, isBrick ? 'brick' : 'plaster'), p0, p1, FLOOR, h, n, u, len, tint, flip);   // no zero-height walls
      u += len;
      const yaw = Math.atan2(n[0], n[1]);
      // windows on every floor above the shop level
      const cols = Math.floor((len - 1) / 3.4);
      for (let c = 0; c < cols; c++) {
        const t = (0.5 + ((c + 0.5) * (len - 1)) / cols) / len;      // evenly spaced, 0.5 m margin at each end
        const wx = p0[0] + ex * t, wz = p0[1] + ez * t;
        for (let f = 1; f < floors; f++) {
          const y = f * FLOOR + 1.55;
          (r() < 0.16 ? winLit : winDark).add(chunk, compose(wx + n[0] * 0.03, y, wz + n[1] * 0.03, yaw, 1.5, 1.45, 1));
          grills.add(chunk, compose(wx + n[0] * 0.14, y, wz + n[1] * 0.14, yaw, 1.5, 1.45, 1));
        }
      }
      // shop fronts only on walls that face a road
      const faceRoad = [2, 5, 9].some((dist) => {
        const mx = (p0[0] + p1[0]) / 2 + n[0] * dist, mz = (p0[1] + p1[1]) / 2 + n[1] * dist;
        return roads.isOnFootpath(mx, mz) || roads.isOnCarriageway(mx, mz);
      });
      if (len >= 4 && faceRoad) {
        const shopN = Math.max(1, Math.floor(len / 5));
        for (let s = 0; s < shopN; s++) {
          const t = (s + 0.5) / shopN, sh = r() < 0.5 ? 0.5 : r() < 0.8 ? 1.4 : 2.5;
          shutters.add(chunk, compose(p0[0] + ex * t + n[0] * 0.08, 2.75 - sh / 2, p0[1] + ez * t + n[1] * 0.08, yaw, len / shopN - 0.4, sh, 0.06));
        }
        if (len > bestLen) { bestLen = len; bestEdge = i; }
      }
    }
    // one lit Bangla signboard per road-facing building
    if (bestEdge >= 0 && signs < 140) {
      const p0 = ring[bestEdge], p1 = ring[(bestEdge + 1) % ring.length];
      const ex = p1[0] - p0[0], ez = p1[1] - p0[1], len = Math.hypot(ex, ez);
      let n: [number, number] = [-ez / len, ex / len]; if (flip) n = [-n[0], -n[1]];
      const w = Math.min(len * 0.8, 9);
      const sign = new THREE.Mesh(unitBox, signTexture(bd.name || SHOP_NAMES[Math.floor(r() * SHOP_NAMES.length)], ['#1f6b5a', '#8c2f2a', '#2a4f86', '#7a5a14'][Math.floor(r() * 4)]));
      sign.scale.set(w, w / 4.5, 0.18);
      sign.position.set((p0[0] + p1[0]) / 2 + n[0] * 0.25, FLOOR + 0.5, (p0[1] + p1[1]) / 2 + n[1] * 0.25);
      sign.rotation.y = Math.atan2(n[0], n[1]);
      chunk.add(sign); signs++;
    }
    // flat roof + water tanks
    const roof = new THREE.ShapeGeometry(toShape(ring)).rotateX(-Math.PI / 2).translate(0, h, 0);
    if (!roofs.has(chunk)) roofs.set(chunk, []);
    roofs.get(chunk)!.push(roof);
    const tanksN = bd.area > 120 ? 1 + Math.floor(r() * 2) : 0;
    for (let k = 0; k < tanksN; k++) {
      const tx = cx + (r() - 0.5) * 3, tz = cz + (r() - 0.5) * 3;
      if (pointInRing(tx, tz, ring)) tanks.add(chunk, compose(tx, h + 0.65, tz, 0));
    }
    // collision: the real footprint
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const [x, z] of ring) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    const poly: PolyObstacle = { type: 'poly', id: bd.id, x: (x0 + x1) / 2, z: (z0 + z1) / 2, hw: (x1 - x0) / 2, hd: (z1 - z0) / 2, points: ring.map((p) => [p[0], p[1]] as [number, number]), tag: 'building' };
    addObs(poly);
  }
  // flush merged walls
  const matFor: Record<string, THREE.Material> = { shop: shopLevel, plaster, brick };
  for (const [k, b] of bufs) {
    if (!b.pos.length) continue;
    const [chunkName, kind] = k.split('|');
    const chunk = chunks.root.getObjectByName(chunkName) as THREE.Group;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(b.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
    if (kind === 'plaster') g.setAttribute('color', new THREE.Float32BufferAttribute(b.col, 3));
    const mesh = new THREE.Mesh(g, matFor[kind]);
    mesh.castShadow = true; mesh.receiveShadow = true;
    chunk.add(mesh);
  }
  // one merged roof mesh per chunk (was one mesh per building → hundreds of draw calls)
  for (const [chunk, list] of roofs) {
    const merged = mergeGeometries(list.map((g) => (g.index ? g.toNonIndexed() : g)), false);
    if (!merged) continue;
    const m = new THREE.Mesh(merged, roofMat); m.receiveShadow = true; m.castShadow = true; chunk.add(m);
    list.forEach((g) => g.dispose());
  }
  stats.buildings = d.buildings.length; stats.signs = signs;
  stats.windows = winDark.build() + winLit.build(); grills.build(); stats.shutters = shutters.build(); stats.tanks = tanks.build();

  // ---- Trees, poles
  buildTreesAt(scene, obstacles, d.sites.trees);
  for (const o of obstacles) if (o.tag === 'tree') grid.add(o);
  const poleMat = pbrMaterial('metal'), dark = new THREE.MeshStandardMaterial({ color: '#292e36', roughness: 0.6, metalness: 0.2 });
  const poleGeo = new THREE.CylinderGeometry(0.11, 0.14, 8, 8).translate(0, 4, 0);
  const barGeo = new THREE.BoxGeometry(0.13, 0.13, 1.2).translate(0, 7.9, -0.45);   // points over the road (-Z local)
  const poles = new Batch(poleGeo, poleMat), bars = new Batch(barGeo, dark, false);
  for (const [x, z, rot] of d.sites.poles) {
    poles.add(chunks.chunkAt(x, z), compose(x, 0, z, rot));
    bars.add(chunks.chunkAt(x, z), compose(x, 0, z, rot));
    addObs({ type: 'circle', x, z, radius: 0.35, tag: 'pole' });
  }
  stats.trees = d.sites.trees.length; stats.poles = poles.build(); bars.build();

  // ---- Service lots: rotate each model so its open front faces its road; ring on the footpath entrance
  const place = (built: { group: THREE.Group; obstacles: Obstacle[] }, site: ServiceSite) => {
    const yaw = Math.atan2(-site.front[0], -site.front[1]);      // local -Z → front
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const dx = site.entrance[0] - site.x, dz = site.entrance[1] - site.z;
    const lx = dx * c - dz * s, lz = dx * s + dz * c;            // entrance in model space
    // models put their ring/apron at local z = -9.5 ... -8; move everything beyond the front wall
    for (const child of built.group.children) {
      if (child.position.z < -7) { child.position.x += lx; child.position.z += lz + 9.5; }
    }
    built.group.removeFromParent();
    const holder = new THREE.Group();
    holder.position.set(site.x, 0, site.z); holder.rotation.y = yaw;
    holder.add(built.group);
    chunks.chunkAt(site.x, site.z).add(holder);
    for (const o of built.obstacles) {
      if (o.type !== 'box') continue;
      const corners: Array<[number, number]> = [[-o.hw, -o.hd], [o.hw, -o.hd], [o.hw, o.hd], [-o.hw, o.hd]].map(([a, b]) => {
        const px = o.x + a, pz = o.z + b;                         // model space
        return [site.x + px * c + pz * s, site.z - px * s + pz * c];
      });
      const xs = corners.map((p) => p[0]), zs = corners.map((p) => p[1]);
      addObs({ type: 'poly', x: (Math.min(...xs) + Math.max(...xs)) / 2, z: (Math.min(...zs) + Math.max(...zs)) / 2,
        hw: (Math.max(...xs) - Math.min(...xs)) / 2, hd: (Math.max(...zs) - Math.min(...zs)) / 2, points: corners, tag: o.tag ?? 'wall' });
    }
    return { site, entrance: { x: site.entrance[0], z: site.entrance[1] } };
  };
  const garages = d.sites.garages.map((site) => place(buildGarage(new THREE.Scene(), { x: 0, z: 0 }), site));
  const aarots = d.sites.aarots.map((site) => place(buildAarot(new THREE.Scene(), { x: 0, z: 0 }), site));

  // ---- Footpath stalls (table, poles, canopy, produce), long side along the road
  const wood = pbrMaterial('wood'), canopy = new THREE.MeshStandardMaterial({ color: '#e7b344', roughness: 0.8 });
  const produce = ['#dd4931', '#86ae4a', '#e6bc3c'].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.8 }));
  const ball = new THREE.SphereGeometry(0.25, 10, 8);
  for (const st of d.sites.stalls) {
    const g = new THREE.Group();
    g.position.set(st.x, 0, st.z); g.rotation.y = Math.atan2(-st.front[0], -st.front[1]);
    const table = new THREE.Mesh(unitBox, wood); table.scale.set(3.9, 1, 1.8); table.position.y = 0.8; table.castShadow = true; g.add(table);
    for (const xx of [-1.5, 1.5]) for (const zz of [-0.6, 0.6]) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 2.5, 6), poleMat); p.position.set(xx, 2.35, zz); g.add(p);
    }
    const top = new THREE.Mesh(unitBox, canopy); top.scale.set(4.4, 0.3, 2.1); top.position.y = 3.75; top.castShadow = true; g.add(top);
    const r = rng(hashId(`${st.x},${st.z}`));
    for (let i = 0; i < 9; i++) { const b = new THREE.Mesh(ball, produce[i % 3]); b.position.set((r() - 0.5) * 3.2, 1.5, (r() - 0.5) * 1.2); g.add(b); }
    chunks.chunkAt(st.x, st.z).add(g);
    const yaw = g.rotation.y, c = Math.cos(yaw), s = Math.sin(yaw);
    const pts: Array<[number, number]> = [[-1.95, -0.9], [1.95, -0.9], [1.95, 0.9], [-1.95, 0.9]].map(([a, b]) => [st.x + a * c + b * s, st.z - a * s + b * c]);
    const xs = pts.map((p) => p[0]), zs = pts.map((p) => p[1]);
    addObs({ type: 'poly', x: st.x, z: st.z, hw: (Math.max(...xs) - Math.min(...xs)) / 2, hd: (Math.max(...zs) - Math.min(...zs)) / 2, points: pts, tag: 'stall' });
  }

  const footpaths = buildFootpathGraph(d, roads);
  stats.footpathNodes = footpaths.nodes.length; stats.chunks = chunks.count; stats.obstacles = obstacles.length;
  const sp = d.sites.spawn ?? [0, 0];
  return {
    district: d, roads, footpaths, grid, obstacles, chunks, garages, aarots, stalls: d.sites.stalls,
    spawn: { x: sp[0], z: sp[1] }, bounds: { x: hw - 2, z: hd - 2 }, stats
  };
}

/** Nearest garage/aarot entrance (replaces nearestGarage/nearestAarot on real maps). */
export function nearestService(list: ServicePoint[], x: number, z: number) {
  let best = list[0], bd = Infinity;
  for (const s of list) { const dd = Math.hypot(s.entrance.x - x, s.entrance.z - z); if (dd < bd) { bd = dd; best = s; } }
  return { entrance: best?.entrance ?? { x: 0, z: 0 }, distance: bd };
}
