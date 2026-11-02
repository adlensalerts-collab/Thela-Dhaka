import * as THREE from 'three';

/**
 * Sprint 3 — PBR materials.
 *
 * Every surface gets a full PBR set (albedo + normal + roughness), generated procedurally
 * at startup so the game works with zero downloads. If real CC0 textures exist at
 *   public/assets/textures/<surface>/color.jpg, normal.jpg, roughness.jpg
 * (e.g. from ambientCG or Poly Haven — rename their files to these three names)
 * they automatically replace the procedural maps once loaded.
 */
export type Surface = 'asphalt' | 'pavement' | 'concrete' | 'soil' | 'brick' | 'plaster' | 'wood' | 'metal' | 'bark';

const SIZE = 256; // 256² tiles fine with anisotropy; generation stays well under a second

// ---------- noise ----------
function hash(x: number, y: number, seed: number) {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function valueNoise(x: number, y: number, seed: number, period: number) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const w = (i: number) => ((i % period) + period) % period; // tileable
  const s = (t: number) => t * t * (3 - 2 * t);
  const a = hash(w(xi), w(yi), seed), b = hash(w(xi + 1), w(yi), seed);
  const c = hash(w(xi), w(yi + 1), seed), d = hash(w(xi + 1), w(yi + 1), seed);
  const sx = s(xf), sy = s(yf);
  const top = a + (b - a) * sx, bot = c + (d - c) * sx;
  return top + (bot - top) * sy;
}
function fbm(u: number, v: number, seed: number, base = 8, octaves = 5) {
  let sum = 0, amp = 0.5, f = base;
  for (let o = 0; o < Math.min(octaves, 4); o++) { // 4 octaves is plenty at 256²
    sum += amp * valueNoise(u * f, v * f, seed + o * 17, f);
    amp *= 0.5; f *= 2;
  }
  return sum;
}

// ---------- per-surface height + colour ----------
type Sample = { h: number; r: number; g: number; b: number; rough: number };
type Shader = (u: number, v: number) => Sample;

const mix = (a: number[], b: number[], t: number) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const rgb = (c: number[], h: number, rough: number): Sample => ({ h, r: c[0], g: c[1], b: c[2], rough });

const SHADERS: Record<Surface, Shader> = {
  asphalt: (u, v) => {
    const n = fbm(u, v, 1, 16, 5);
    const grit = hash(Math.floor(u * 900), Math.floor(v * 900), 3);
    const stone = grit > 0.93 ? 0.25 : 0;
    const patch = fbm(u, v, 9, 2, 3) > 0.62 ? -0.06 : 0; // repaired patches
    const c = mix([58, 61, 63], [92, 94, 92], n * 0.8 + stone + patch);
    return rgb(c, n * 0.6 + stone, 0.82 - stone * 0.3);
  },
  pavement: (u, v) => {
    // 4×4 square slabs with mortar joints
    const tu = (u * 4) % 1, tv = (v * 4) % 1;
    const joint = Math.min(tu, 1 - tu, tv, 1 - tv) < 0.03;
    const slab = hash(Math.floor(u * 4), Math.floor(v * 4), 5);
    const n = fbm(u, v, 2, 12, 4);
    const c = joint ? [70, 64, 58] : mix([164, 146, 128], [190, 174, 156], slab * 0.6 + n * 0.4);
    return rgb(c, joint ? 0 : 0.6 + n * 0.3 + slab * 0.1, joint ? 0.95 : 0.78);
  },
  concrete: (u, v) => {
    const n = fbm(u, v, 3, 6, 6);
    const stain = fbm(u, v, 11, 2, 3);
    const c = mix([150, 149, 140], [118, 116, 108], stain * 0.7 + n * 0.3);
    return rgb(c, n, 0.88);
  },
  soil: (u, v) => {
    const n = fbm(u, v, 4, 10, 5);
    const pebble = hash(Math.floor(u * 400), Math.floor(v * 400), 8) > 0.96 ? 0.3 : 0;
    const c = mix([120, 104, 80], [160, 146, 112], n + pebble * 0.5);
    return rgb(c, n + pebble, 0.97);
  },
  brick: (u, v) => {
    const rows = 16, cols = 8;
    const row = Math.floor(v * rows);
    const bu = (u * cols + (row % 2) * 0.5) % 1, bv = (v * rows) % 1;
    const mortar = bu < 0.06 || bv < 0.12;
    const id = hash(Math.floor(u * cols + (row % 2) * 0.5), row, 6);
    const n = fbm(u, v, 5, 24, 3);
    const c = mortar ? [176, 168, 152] : mix([142, 62, 42], [176, 94, 64], id * 0.7 + n * 0.3);
    return rgb(c, mortar ? 0.1 : 0.7 + n * 0.2, mortar ? 0.95 : 0.8);
  },
  plaster: (u, v) => {
    const n = fbm(u, v, 7, 8, 6);
    const grime = Math.pow(1 - v, 3) * 0.5 + fbm(u, v, 13, 3, 3) * 0.3; // dirtier near the bottom
    const c = mix([214, 204, 182], [150, 138, 118], grime);
    return rgb(c, n * 0.5, 0.9);
  },
  wood: (u, v) => {
    const grain = Math.sin((u * 40 + fbm(u, v, 10, 4, 4) * 6) * Math.PI) * 0.5 + 0.5;
    const plank = (v * 6) % 1 < 0.03;
    const c = plank ? [60, 40, 24] : mix([150, 104, 60], [118, 78, 42], grain);
    return rgb(c, plank ? 0 : 0.5 + grain * 0.2, 0.7);
  },
  metal: (u, v) => {
    const rust = fbm(u, v, 12, 6, 5);
    const r = THREE.MathUtils.smoothstep(rust, 0.48, 0.62);
    const brushed = hash(Math.floor(u * 4), Math.floor(v * 600), 4) * 0.08;
    const c = mix([112, 120, 124], [124, 70, 40], r);
    return rgb(c.map((x) => x + brushed * 100), 0.5 + r * 0.4, 0.4 + r * 0.5);
  },
  bark: (u, v) => {
    const n = fbm(u * 0.5, v * 3, 14, 8, 5);
    const c = mix([66, 50, 38], [104, 84, 62], n);
    return rgb(c, n, 0.95);
  }
};

// ---------- texture generation ----------
interface PbrSet { map: THREE.CanvasTexture; normalMap: THREE.CanvasTexture; roughnessMap: THREE.CanvasTexture }
const cache = new Map<Surface, PbrSet>();

function canvas() {
  const c = document.createElement('canvas');
  c.width = c.height = SIZE;
  return c;
}

function toTexture(c: HTMLCanvasElement, srgb: boolean) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function generatePbrSet(surface: Surface): PbrSet {
  const hit = cache.get(surface);
  if (hit) return hit;
  const shade = SHADERS[surface];
  const height = new Float32Array(SIZE * SIZE);
  const cc = canvas(), rc = canvas(), nc = canvas();
  const cImg = cc.getContext('2d')!.createImageData(SIZE, SIZE);
  const rImg = rc.getContext('2d')!.createImageData(SIZE, SIZE);
  const nImg = nc.getContext('2d')!.createImageData(SIZE, SIZE);

  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const s = shade(x / SIZE, y / SIZE);
      const i = y * SIZE + x, k = i * 4;
      height[i] = s.h;
      cImg.data[k] = s.r; cImg.data[k + 1] = s.g; cImg.data[k + 2] = s.b; cImg.data[k + 3] = 255;
      const r = Math.round(THREE.MathUtils.clamp(s.rough, 0, 1) * 255);
      // three.js reads roughness from the GREEN channel
      rImg.data[k] = r; rImg.data[k + 1] = r; rImg.data[k + 2] = r; rImg.data[k + 3] = 255;
    }
  }
  // Sobel → tangent-space normal map (wraps at edges so it tiles)
  const H = (x: number, y: number) => height[((y + SIZE) % SIZE) * SIZE + ((x + SIZE) % SIZE)];
  const strength = 2.2;
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const dx = (H(x + 1, y - 1) + 2 * H(x + 1, y) + H(x + 1, y + 1)) - (H(x - 1, y - 1) + 2 * H(x - 1, y) + H(x - 1, y + 1));
      const dy = (H(x - 1, y + 1) + 2 * H(x, y + 1) + H(x + 1, y + 1)) - (H(x - 1, y - 1) + 2 * H(x, y - 1) + H(x + 1, y - 1));
      const nx = -dx * strength, ny = -dy * strength, inv = 1 / Math.sqrt(nx * nx + ny * ny + 1);
      const k = (y * SIZE + x) * 4;
      nImg.data[k] = (nx * inv * 0.5 + 0.5) * 255;
      nImg.data[k + 1] = (ny * inv * 0.5 + 0.5) * 255;
      nImg.data[k + 2] = (inv * 0.5 + 0.5) * 255;
      nImg.data[k + 3] = 255;
    }
  }
  cc.getContext('2d')!.putImageData(cImg, 0, 0);
  rc.getContext('2d')!.putImageData(rImg, 0, 0);
  nc.getContext('2d')!.putImageData(nImg, 0, 0);

  const set = { map: toTexture(cc, true), normalMap: toTexture(nc, false), roughnessMap: toTexture(rc, false) };
  cache.set(surface, set);
  return set;
}

/** Swap in real CC0 textures from public/assets/textures/<surface>/ if they exist. */
/** Surfaces that have real photo textures in public/assets/textures (others would only 404). */
const REAL_TEXTURE_SURFACES: ReadonlySet<Surface> = new Set<Surface>(['pavement', 'brick', 'metal']);

function tryRealTextures(surface: Surface, mat: THREE.MeshStandardMaterial) {
  if (!REAL_TEXTURE_SURFACES.has(surface)) return;
  const loader = new THREE.TextureLoader();
  const base = `${import.meta.env.BASE_URL}assets/textures/${surface}/`;
  const slots: Array<[keyof PbrSet, string, boolean]> = [
    ['map', 'color.jpg', true], ['normalMap', 'normal.jpg', false], ['roughnessMap', 'roughness.jpg', false]
  ];
  for (const [slot, file, srgb] of slots) {
    loader.load(base + file, (t) => {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.anisotropy = 8;
      if (srgb) t.colorSpace = THREE.SRGBColorSpace;
      (mat as any)[slot] = t;
      mat.needsUpdate = true;
    }, undefined, () => { /* not present → keep procedural */ });
  }
}

/** A PBR material for a surface. tint multiplies the albedo (keep it light, e.g. '#ffffff'). */
export function pbrMaterial(surface: Surface, opts: { tint?: string; metalness?: number; normalScale?: number } = {}) {
  const set = generatePbrSet(surface);
  const mat = new THREE.MeshStandardMaterial({
    color: opts.tint ?? '#ffffff',
    map: set.map,
    normalMap: set.normalMap,
    roughnessMap: set.roughnessMap,
    roughness: 1,
    metalness: opts.metalness ?? (surface === 'metal' ? 0.75 : 0),
    normalScale: new THREE.Vector2(opts.normalScale ?? 1, opts.normalScale ?? 1)
  });
  mat.userData.surface = surface;
  tryRealTextures(surface, mat);
  return mat;
}

/** World-space metres per texture tile for each surface. */
export const TILE_SIZE: Record<Surface, number> = {
  asphalt: 6, pavement: 4, concrete: 5, soil: 8, brick: 3, plaster: 4, wood: 1.5, metal: 2, bark: 1
};

/**
 * Rewrites a mesh's UVs from its geometry positions (box projection), so textures keep the
 * same real-world scale on a 246-unit road and a 1-unit crate. Call once after creating a mesh
 * whose material came from pbrMaterial(). Works for BoxGeometry/PlaneGeometry/CylinderGeometry.
 */
export function applyWorldUV(mesh: THREE.Mesh, tileSize?: number) {
  const mat = mesh.material as THREE.Material;
  const surface = (mat as any)?.userData?.surface as Surface | undefined;
  const size = tileSize ?? (surface ? TILE_SIZE[surface] : 4);
  const g = mesh.geometry as THREE.BufferGeometry;
  const pos = g.attributes.position, nor = g.attributes.normal, uv = g.attributes.uv;
  if (!pos || !nor || !uv) return;
  const s = mesh.scale;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) * s.x, y = pos.getY(i) * s.y, z = pos.getZ(i) * s.z;
    const ax = Math.abs(nor.getX(i)), ay = Math.abs(nor.getY(i)), az = Math.abs(nor.getZ(i));
    if (ay >= ax && ay >= az) uv.setXY(i, x / size, z / size);
    else if (ax >= az) uv.setXY(i, z / size, y / size);
    else uv.setXY(i, x / size, y / size);
  }
  uv.needsUpdate = true;
}

/**
 * Drop-in replacement for the `mat` object in initWorld(): same keys, PBR where it matters.
 * Untextured keys (stripe, yellow, red, green, leaf, dark, light, sky) stay plain but get
 * realistic roughness/metalness.
 */
export function createPbrMaterials() {
  const plain = (color: string, roughness = 0.85, metalness = 0) => new THREE.MeshStandardMaterial({ color, roughness, metalness });
  return {
    soil: pbrMaterial('soil'),
    road: pbrMaterial('asphalt'),
    median: pbrMaterial('concrete', { tint: '#e9dcb4' }),
    pavement: pbrMaterial('pavement'),
    stripe: plain('#ece4c2', 0.6),
    yellow: plain('#f2c45d', 0.55),
    curb: pbrMaterial('concrete', { tint: '#5c5f60' }),
    red: plain('#c54f3c', 0.7),
    green: plain('#27835c', 0.7),
    leaf: plain('#4f7a3d', 0.85),
    brown: pbrMaterial('bark'),
    wood: pbrMaterial('wood'),
    dark: plain('#292e36', 0.6, 0.2),
    light: plain('#e8dfc1', 0.8),
    glass: new THREE.MeshPhysicalMaterial({ color: '#9fbfb6', roughness: 0.05, metalness: 0.1, clearcoat: 1, envMapIntensity: 1.4 }),
    concrete: pbrMaterial('concrete'),
    metal: pbrMaterial('metal'),
    sky: plain('#93c1be', 0.9),
    brick: pbrMaterial('brick'),
    plaster: pbrMaterial('plaster')
  };
}
