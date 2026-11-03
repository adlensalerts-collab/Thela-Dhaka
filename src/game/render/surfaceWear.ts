import type * as THREE from 'three';
import type { Node } from 'three/webgpu';
import {
  uniform, Fn, float, vec2, vec3, mix, fract, sin, dot, floor, length, clamp, min, max, abs, fwidth, smoothstep, step, normalize, cross,
  dFdx, dFdy, positionWorld, materialColor, materialRoughness, select,
} from 'three/tsl';

export type WeatheredSurface = 'asphalt' | 'pavement' | 'plaster' | 'brick';

/* Sprint 8D: the Sprint 8B matte wear (cracks, repair patches, paving stains, plaster rain streaks), rewritten in
 * TSL so it runs on WebGPURenderer. Same world-space masks and strengths as the old GLSL; no textures or geometry. */

type N = Node<'float'>;
type V2 = Node<'vec2'>;

const hash = (p: V2): N => fract(sin(dot(p, vec2(127.1, 311.7))).mul(43758.5453));

const segment = (p: V2, a: V2, b: V2): N => {
  const ab = b.sub(a);
  return length(p.sub(a).sub(ab.mul(clamp(dot(p.sub(a), ab).div(dot(ab, ab)), 0.0, 1.0))));
};

const crack = (p: V2, cell: V2, seed: N): N => {
  const middle = vec2(seed.mul(0.3).add(0.35), hash(cell.add(7.0)).mul(0.3).add(0.35));
  const d1 = segment(p, vec2(0.16, seed.mul(0.15).add(0.24)), middle);
  const d2 = segment(p, middle, vec2(0.84, float(0.66).sub(seed.mul(0.12))));
  const d3 = segment(p, middle, middle.add(vec2(-0.12, 0.18)));
  const d = min(min(d1, d2), d3);
  const aa = max(fwidth(d), 0.001);
  return float(1.0).sub(smoothstep(0.0015, aa.add(0.0015), d)).mul(min(1.0, float(0.003).div(aa)));
};

// Smooth value noise for large monsoon stains.
const vnoise = (p: V2): N => {
  const i = floor(p), f = fract(p);
  const u = f.mul(f).mul(float(3.0).sub(f.mul(2.0)));
  const a = hash(i), b = hash(i.add(vec2(1, 0))), c2 = hash(i.add(vec2(0, 1))), d = hash(i.add(vec2(1, 1)));
  return mix(mix(a, b, u.x), mix(c2, d, u.x), u.y);
};

/** Sprint 8F: 0 = dry … 1 = soaked. WeatherSystem raises it in rain and lets it dry out slowly afterwards. */
export const roadWetness = uniform(0.0);

/** Puddles collect in low, worn spots: big soft blobs from value noise, more of them as wetness rises. */
const puddleMask = Fn(() => {
  const p = positionWorld.xz;
  const blobs = vnoise(p.mul(0.16)).mul(0.65).add(vnoise(p.mul(0.55)).mul(0.35));
  const cut = mix(0.95, 0.55, roadWetness);
  return smoothstep(cut, cut.add(0.06), blobs).mul(smoothstep(0.08, 0.3, roadWetness));
});

const roadWear = Fn(() => {
  const xz = positionWorld.xz.div(9.0);
  const cell = floor(xz), uv = fract(xz);
  const seed = hash(cell);
  const centre = vec2(seed.mul(0.3).add(0.35), hash(cell.add(3.0)).mul(0.3).add(0.35));
  const size = vec2(seed.mul(0.08).add(0.10), seed.mul(0.06).add(0.07));
  const pd = max(abs(uv.x.sub(centre.x)).sub(size.x), abs(uv.y.sub(centre.y)).sub(size.y));
  const aa = max(fwidth(pd), 0.001);
  const on = step(0.63, seed);
  const repair = float(1.0).sub(smoothstep(aa.negate(), aa, pd)).mul(on);
  const seam = float(1.0).sub(smoothstep(0.003, aa.add(0.003), abs(pd))).mul(on);
  const c = crack(uv, cell, seed).mul(float(1.0).sub(step(0.42, seed)));
  return float(1.0).sub(repair.mul(0.13)).sub(seam.mul(0.16)).sub(c.mul(0.38));
});

const pavementWear = Fn(() => {
  const xz = positionWorld.xz.div(3.5);
  const cell = floor(xz), uv = fract(xz);
  const seed = hash(cell.add(19.0));
  const stain = float(1.0).sub(smoothstep(0.10, 0.33, length(uv.sub(0.5).mul(vec2(1.0, 1.7))))).mul(step(0.72, seed));
  const c = crack(uv, cell, seed).mul(float(1.0).sub(step(0.18, seed)));
  return float(1.0).sub(stain.mul(0.13)).sub(c.mul(0.24));
});

/** Sprint 8E: Dhaka facade weathering shared by plaster and brick upper floors — floor-slab bands with a soft
 * shadow under each slab edge, and blotchy monsoon damp that collects under the slabs. Returns an RGB multiplier. */
const facadeWeather = Fn(() => {
  const p = positionWorld;
  const n = normalize(cross(dFdx(p), dFdy(p)));
  const wall = float(1.0).sub(smoothstep(0.3, 0.7, abs(n.y)));
  const across = select(abs(n.x).greaterThan(abs(n.z)), p.z, p.x);
  const inFloor = fract(p.y.div(3.2));                       // 0 at each slab, FLOOR = 3.2 m
  const aa = max(fwidth(inFloor), 0.002);
  const slab = smoothstep(float(0.97).sub(aa), 0.97, inFloor);          // slab face, top 0.1 m of each storey
  const underSlab = float(1.0).sub(smoothstep(0.0, 0.10, inFloor));     // shadowed strip just below the slab above
  const damp = smoothstep(0.45, 0.85, vnoise(vec2(across.mul(0.35), p.y.mul(0.22))))
    .mul(mix(0.55, 1.0, float(1.0).sub(smoothstep(0.0, 0.5, inFloor))));
  const k = wall.mul(step(3.0, p.y));                        // upper floors only (the shop level has its own trim)
  const tint = mix(vec3(1.0), vec3(0.80, 0.82, 0.76), damp.mul(0.75));
  const light = float(1.0).add(slab.mul(0.10)).sub(underSlab.mul(0.16));
  return mix(vec3(1.0), tint.mul(light), k);
});

const plasterWear = Fn(() => {
  const p = positionWorld;
  const n = normalize(cross(dFdx(p), dFdy(p)));
  const wall = float(1.0).sub(smoothstep(0.3, 0.7, abs(n.y)));
  const across = select(abs(n.x).greaterThan(abs(n.z)), p.z, p.x);
  const stripe = floor(across.mul(1.4));
  const seed = hash(vec2(stripe, floor(p.y.div(3.2))));
  const streak = float(1.0).sub(smoothstep(0.10, 0.38, abs(fract(across.mul(1.4)).sub(0.5)))).mul(step(0.68, seed));
  const rain = smoothstep(0.0, 0.65, fract(p.y.div(3.2)));
  return float(1.0).sub(wall.mul(streak).mul(rain).mul(0.14));
});

/** Subtle matte wear without extra textures, geometry, draw calls or collisions.
 * WebGPURenderer copies these node properties when it converts the classic material to its node version. */
export function applySurfaceWear(material: THREE.MeshStandardMaterial, surface: WeatheredSurface) {
  const nodes = material as unknown as { colorNode: unknown; roughnessNode?: unknown };
  const wear = surface === 'asphalt' ? roadWear() : surface === 'pavement' ? pavementWear()
    : surface === 'plaster' ? facadeWeather().mul(plasterWear()) : facadeWeather();
  nodes.colorNode = materialColor.mul(wear);
  if (surface === 'asphalt' || surface === 'pavement') {
    // Dry: the matte road fix (never smoother than 0.88 / the paving's own value).
    // Wet: darker, glossier; puddles are near-mirror and pick up sky and lamp reflections from the environment.
    const puddle = surface === 'asphalt' ? puddleMask() : puddleMask().mul(0.5);
    const wet = roadWetness.mul(surface === 'asphalt' ? 1.0 : 0.8);
    const dryRough = surface === 'asphalt' ? max(materialRoughness, 0.88) : materialRoughness;
    nodes.roughnessNode = mix(mix(dryRough, 0.5, wet), 0.14, puddle);
    nodes.colorNode = materialColor.mul(wear).mul(mix(mix(1.0, 0.62, wet), 0.38, puddle));
  }
  material.userData.surfaceWear = surface;
}
