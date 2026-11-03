import * as THREE from 'three/webgpu';
import type { Node } from 'three/webgpu';
import {
  Fn, float, vec2, vec3, uniform, uv, fract, sin, dot, floor, min, max, abs, mix, step, smoothstep, clamp, select,
  normalize, cross, positionWorld, cameraPosition, normalWorld
} from 'three/tsl';

/**
 * Sprint 8E — window glass with a room behind it ("interior mapping"), in the spirit of Slop New York's apartment
 * interiors (https://github.com/mrdoob/slop-newyork, MIT License, Copyright (c) 2026 Mr.doob), rewritten for the
 * game's instanced 1.5 × 1.45 m window quads. Each window traces one ray into a 1-room box: back wall, side walls,
 * floor and ceiling in Dhaka flat colours, an occasional ceiling-fan shadow, and curtains just inside the glass.
 * A share of rooms are lit; that share and the glow follow the clock (`interiorGlow`, set by the lighting rig).
 * One material, one draw call per chunk; no textures.
 */

/** 0 = midday (rooms read dark behind reflective glass) … 1 = night (many rooms lit). */
export const interiorGlow = uniform(0.2);
/** 0 = lamps off … 1 = full. Switches on through dusk (set by the lighting rig). */
export const streetLamps = uniform(0.0);

/** Sodium street-lamp head: glows only when the lamps are on. */
export function createLampHeadMaterial() {
  const m = new THREE.MeshStandardNodeMaterial({ color: '#3a3a36', roughness: 0.4 });
  m.emissiveNode = vec3(1.0, 0.72, 0.38).mul(streetLamps.mul(6.0));
  return m;
}

/** Soft additive pool of lamp light on the ground under each lamp (no real light: one draw per chunk). */
export function createLampPoolMaterial() {
  const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const r = uv().sub(0.5).length().mul(2.0);
  const f = float(1.0).sub(smoothstep(0.0, 1.0, r));
  m.colorNode = vec3(1.0, 0.70, 0.36).mul(f.mul(f).mul(streetLamps).mul(0.55));
  m.fog = true;
  return m;
}

const WIN_W = 1.5, WIN_H = 1.45;   // must match the window quads in districtWorld.ts

type N = Node<'float'>;
type V2 = Node<'vec2'>;
type V3 = Node<'vec3'>;
const hash = (p: V2): N => fract(sin(dot(p, vec2(127.1, 311.7))).mul(43758.5453));
const pick = (t: N, a: number, b: number, c: number, d: number): V3 => {
  const col = (h: number) => vec3(((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255);
  return mix(mix(mix(col(a), col(b), step(0.25, t)), col(c), step(0.5, t)), col(d), step(0.75, t));
};

export function createWindowMaterial() {
  const material = new THREE.MeshStandardNodeMaterial({ roughness: 0.06, metalness: 0.0 });

  const st = uv();
  const N = normalize(normalWorld);
  const T = normalize(cross(vec3(0, 1, 0), N));          // horizontal along the facade
  const ray = normalize(positionWorld.sub(cameraPosition));
  // Window centre → a stable per-window seed (windows are ≥ 3.4 m apart).
  const centre = positionWorld.sub(T.mul(st.x.sub(0.5).mul(WIN_W))).sub(vec3(0, st.y.sub(0.5).mul(WIN_H), 0));
  const seed = hash(floor(centre.xz.mul(0.7)).add(vec2(floor(centre.y.div(3.0)).mul(13.1), 0)));
  const seed2 = hash(vec2(seed.mul(91.7), 3.1));

  const room = Fn(() => {
    // Ray in room space: x across the window, y up, z into the room. Room depth = 1.6 × width.
    const dx = dot(ray, T).div(WIN_W);
    const dy = ray.y.div(WIN_H);
    const dz = max(dot(ray, N.negate()), 0.02).div(WIN_W * 1.6);
    // Rooms are a bit wider and taller than the window opening.
    const px = st.x.mul(0.6).add(0.2), py = st.y.mul(0.62).add(0.22);
    const tx = select(dx.greaterThan(0.0), float(1.0).sub(px).div(max(dx, 1e-4)), px.div(max(dx.negate(), 1e-4)));
    const ty = select(dy.greaterThan(0.0), float(1.0).sub(py).div(max(dy, 1e-4)), py.div(max(dy.negate(), 1e-4)));
    const tz = float(1.0).div(dz);
    const t = min(min(tx, ty), tz);
    const hx = px.add(dx.mul(t)), hy = py.add(dy.mul(t)), hz = dz.mul(t);
    const onBack = step(tz, min(tx, ty));
    const onY = step(ty, tx).mul(float(1.0).sub(onBack));
    const onFloor = onY.mul(step(dy, 0.0));
    const onCeil = onY.mul(float(1.0).sub(step(dy, 0.0)));

    const wall = pick(seed, 0xd8cfb8, 0xb9cbbf, 0xd9b9a2, 0xc8c9cf);       // plaster cream, mint, peach, grey-blue
    const floorCol = pick(seed2, 0x8a7660, 0x9c958a, 0x6e5b4a, 0xa89a86);   // mosaic, tile, wood, terrazzo
    const ceil = vec3(0.86, 0.85, 0.80);
    const back = wall.mul(0.9);
    const shell = mix(mix(mix(wall, floorCol, onFloor), ceil, onCeil), back, onBack).toVar();
    // Furniture silhouette (almirah / shelf) against the back wall in some rooms.
    const almirah = onBack.mul(step(0.55, seed2)).mul(step(hx, 0.42)).mul(step(0.18, hx)).mul(step(hy, 0.78));
    shell.assign(mix(shell, vec3(0.25, 0.19, 0.14), almirah));
    // Corner occlusion and depth falloff.
    const ax = smoothstep(0.0, 0.18, hx).mul(smoothstep(0.0, 0.18, float(1.0).sub(hx)));
    const ay = smoothstep(0.0, 0.18, hy).mul(smoothstep(0.0, 0.18, float(1.0).sub(hy)));
    const ao = mix(0.62, 1.0, mix(ax.mul(ay), min(ax, ay), onBack));
    const shaded = shell.mul(ao).mul(mix(1.0, 0.5, clamp(hz, 0.0, 1.0)));

    // Curtains just inside the glass (slight parallax).
    const cx = clamp(st.x.add(dx.div(max(dz, 0.05)).mul(0.04)), 0.0, 1.0);
    const lw = seed.mul(seed).mul(0.5), rw = seed2.mul(seed2).mul(0.45);
    const drape = max(step(cx, lw), step(float(1.0).sub(rw), cx)).mul(step(0.12, lw.add(rw)));
    const fabric = pick(fract(seed.mul(7.3)), 0xc9b48a, 0x7d3b34, 0x3f6a6a, 0xb0794a)
      .mul(sin(cx.mul(60.0)).mul(0.12).add(0.9));
    const col = mix(shaded, fabric, drape);
    return col;
  });

  const roomColor = room();
  // Lit share: ~12 % at midday (a tube light in a dark room), ~55 % at night.
  const litProb = mix(0.12, 0.55, interiorGlow);
  const lit = step(seed2, litProb);
  const tubeLight = mix(vec3(1.0, 0.86, 0.62), vec3(0.86, 0.95, 1.0), step(0.5, fract(seed.mul(3.7))));   // bulb or tube
  // Daylight: rooms read dim behind glass. Night: lit rooms glow; unlit rooms nearly black.
  material.colorNode = roomColor.mul(mix(0.32, 0.06, interiorGlow));
  material.emissiveNode = roomColor.mul(tubeLight).mul(lit).mul(mix(0.18, 1.6, interiorGlow));
  // Slightly dirty glass: rougher towards the frame.
  const edge = min(min(st.x, float(1.0).sub(st.x)), min(st.y, float(1.0).sub(st.y)));
  material.roughnessNode = mix(0.22, 0.05, smoothstep(0.0, 0.12, edge));
  return material;
}

export { WIN_W, WIN_H };
