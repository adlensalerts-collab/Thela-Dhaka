import * as THREE from 'three/webgpu';
import type { Node } from 'three/webgpu';
import {
  float, vec2, vec3, fract, sin, dot, floor, mix, step, smoothstep, uv, positionLocal, positionWorld, materialColor,
  materialRoughness, length,
} from 'three/tsl';
import { streetLamps } from './windows';

/**
 * Sprint 8G — vehicles and props, in the spirit of Slop New York's car paint, vehicle lights and contact shadows
 * (https://github.com/mrdoob/slop-newyork, MIT License, Copyright (c) 2026 Mr.doob), adapted to Dhaka traffic:
 *  - road grime: every painted body darkens and dulls towards the wheels (dust, monsoon splash);
 *  - rickshaw art: hoods in bright painted bands with a scalloped trim, as on Dhaka's hand-painted rickshaws;
 *  - lights that switch on with the street lamps (headlamps, tail lamps) and a headlight pool on the road at night;
 *  - a soft contact shadow under every vehicle (one shared material), so they sit on the road even without the
 *    shadow map (Low quality) and in the far cascade.
 */

type N = Node<'float'>;
const hash = (p: Node<'vec2'>): N => fract(sin(dot(p, vec2(127.1, 311.7))).mul(43758.5453));

/** Paint that gathers dust towards the ground. `height` = body height in metres where the grime fades out. */
export function grimy(material: THREE.MeshStandardMaterial, height = 1.0) {
  const low = float(1.0).sub(smoothstep(0.15, height, positionLocal.y));
  const speck = hash(floor(positionWorld.xz.mul(40.0)).add(floor(positionWorld.y.mul(40.0))));
  const dust = vec3(0.56, 0.50, 0.42);
  const k = low.mul(0.55).add(speck.mul(0.08).mul(low));
  const nodes = material as unknown as { colorNode: unknown; roughnessNode: unknown };
  nodes.colorNode = mix(materialColor, materialColor.mul(dust.mul(1.2)), k);
  nodes.roughnessNode = mix(materialRoughness, 0.92, k);
  return material;
}

/** Rickshaw hood: painted bands across the canopy and a scalloped fringe at its edge. */
export function rickshawHoodMaterial(seed: number) {
  const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.75, side: THREE.DoubleSide });
  const palettes: Array<[number, number, number]> = [
    [0xd0283a, 0xf2c230, 0x1f7f6e], [0x2a4fa8, 0xe8e2d0, 0xd2462b], [0x1d1d22, 0xe0a426, 0xc23a7a],
    [0x3b8f3a, 0xf0d14a, 0xb32b2b], [0x6b2fa0, 0xf2f2e6, 0xe06a1c],
  ];
  const [a, b, c] = palettes[Math.abs(Math.floor(seed)) % palettes.length].map((h) => new THREE.Color(h));
  const st = uv();
  const band = fract(st.y.mul(5.0));
  const col = mix(mix(vec3(a.r, a.g, a.b), vec3(b.r, b.g, b.b), step(0.55, band)), vec3(c.r, c.g, c.b), step(0.85, band));
  // Scallops along the open edge (u near 0 / 1 across the canopy).
  const edge = float(1.0).sub(step(0.08, st.x)).add(step(0.92, st.x));
  const scallop = step(0.5, fract(st.y.mul(22.0))).mul(edge);
  m.colorNode = mix(col, vec3(b.r, b.g, b.b), scallop);
  return m;
}

/** Head/tail lamp: a dim lens by day, glowing once the street lamps are on. */
export function lampMaterial(kind: 'head' | 'tail') {
  const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.2, color: kind === 'head' ? '#d8d2c0' : '#6a0d0d' });
  const glow = kind === 'head' ? vec3(1.0, 0.93, 0.78).mul(8.0) : vec3(1.0, 0.12, 0.06).mul(4.0);
  m.emissiveNode = glow.mul(mix(0.04, 1.0, streetLamps));
  return m;
}

const contactShadowMat = (() => {
  const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, color: '#000000' });
  const st = uv().sub(0.5).mul(2.0);
  const r = length(st.mul(vec2(1.0, 1.0)));
  m.opacityNode = float(1.0).sub(smoothstep(0.35, 1.0, r)).mul(0.55);
  return m;
})();

const headPoolMat = (() => {
  const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const st = uv();
  const across = float(1.0).sub(smoothstep(0.0, 0.5, st.x.sub(0.5).abs()));
  const along = smoothstep(0.0, 0.25, st.y).mul(float(1.0).sub(smoothstep(0.35, 1.0, st.y)));
  m.colorNode = vec3(1.0, 0.92, 0.75).mul(across.mul(along).mul(streetLamps).mul(0.45));
  return m;
})();

/** Add the contact shadow (and, for motor vehicles, a night headlight pool) under a vehicle built facing -Z. */
export function addGroundEffects(g: THREE.Group, len: number, width: number, motor: boolean) {
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(width * 1.25, len * 1.12).rotateX(-Math.PI / 2), contactShadowMat);
  shadow.position.y = 0.025;
  shadow.renderOrder = 1;
  g.add(shadow);
  if (motor) {
    // uv.y = 0 at the bumper, 1 at the far end of the beam (14 m ahead).
    const pool = new THREE.Mesh(new THREE.PlaneGeometry(width * 2.2, 14).rotateX(-Math.PI / 2), headPoolMat);
    pool.position.set(0, 0.03, -len / 2 - 7);
    pool.renderOrder = 2;
    g.add(pool);
  }
}
