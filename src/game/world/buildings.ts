import * as THREE from 'three';
import type { BoxObstacle } from '../collision';
import { pbrMaterial, applyWorldUV } from '../render/pbr';

/**
 * Sprint 4 — realistic Dhaka buildings.
 *
 * Plastered or exposed-brick facades on all four sides, floor slab bands, framed windows
 * with the iron security grills every Dhaka window has, balconies with railings, AC units,
 * a rooftop parapet with black water tanks and a stair room (chilekotha), and a ground-floor
 * shop on each street side with a rolling shutter and a backlit Bangla signboard.
 * Repeated parts are InstancedMeshes, so ~30 buildings stay cheap to render.
 *
 * Replaces the body of buildBuilding() in simulation.ts. Same footprint and obstacle as before.
 */
export interface BuildingOptions {
  x: number;
  z: number;
  width?: number;
  depth?: number;
  height?: number;
  color?: string;            // facade paint tint
  shopNames?: string[];      // Bangla names for the signboards
  seed?: number;
}

const FLOOR_H = 3.2;

function rng(seed: number) {
  let s = (Math.abs(Math.floor(seed)) % 2147483646) + 1;
  return () => {
    s = (s * 16807) % 2147483647;
    return Math.max(0, Math.min(0.999999, (s - 1) / 2147483646));
  };
}

// ---------- shared resources ----------
let R: ReturnType<typeof makeShared> | null = null;
function makeShared() {
  const grillTex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d')!;
    g.strokeStyle = '#ffffff'; g.lineWidth = 3;
    for (let i = 4; i < 64; i += 12) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 64); g.stroke(); }
    g.lineWidth = 4; g.beginPath(); g.moveTo(0, 32); g.lineTo(64, 32); g.stroke();
    g.strokeRect(2, 2, 60, 60);
    // decorative arc typical of Dhaka grills
    g.lineWidth = 2; g.beginPath(); g.arc(32, 32, 14, 0, Math.PI * 2); g.stroke();
    const t = new THREE.CanvasTexture(c);
    return t;
  })();
  return {
    box: new THREE.BoxGeometry(1, 1, 1),
    plane: new THREE.PlaneGeometry(1, 1),
    cyl: new THREE.CylinderGeometry(1, 1, 1, 16),
    glassDark: new THREE.MeshPhysicalMaterial({ color: '#2b3a3f', roughness: 0.06, metalness: 0.2, clearcoat: 1, envMapIntensity: 1.3 }),
    glassLit: new THREE.MeshStandardMaterial({ color: '#f6d9a0', emissive: '#ffcf86', emissiveIntensity: 0.55, roughness: 0.3 }),
    frame: new THREE.MeshStandardMaterial({ color: '#d9d4c7', roughness: 0.7 }),
    grill: new THREE.MeshStandardMaterial({ color: '#2a2d30', roughness: 0.5, metalness: 0.6, alphaMap: grillTex, alphaTest: 0.5, transparent: false, side: THREE.DoubleSide }),
    slab: pbrMaterial('concrete', { tint: '#e2ddd2' }),
    acBody: new THREE.MeshStandardMaterial({ color: '#e9e8e3', roughness: 0.5 }),
    tank: new THREE.MeshStandardMaterial({ color: '#16181a', roughness: 0.45 }),
    shutter: pbrMaterial('metal', { tint: '#c9ccce', metalness: 0.6 }),
    groundTile: pbrMaterial('concrete', { tint: '#b9b2a6' })
  };
}
function shared() { return (R ??= makeShared()); }

class Instancer {
  // Keyed by geometry AND material: the same material can appear on different shapes.
  private mats = new Map<string, { geo: THREE.BufferGeometry; mat: THREE.Material; list: THREE.Matrix4[]; shadow: boolean }>();
  private m4 = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  add(geo: THREE.BufferGeometry, mat: THREE.Material, pos: THREE.Vector3, scale: THREE.Vector3, rotY = 0, shadow = true) {
    const key = geo.uuid + mat.uuid;
    if (!this.mats.has(key)) this.mats.set(key, { geo, mat, list: [], shadow });
    this.q.setFromEuler(this.e.set(0, rotY, 0));
    this.mats.get(key)!.list.push(this.m4.clone().compose(pos, this.q, scale));
  }
  build(parent: THREE.Object3D) {
    for (const { geo, mat, list, shadow } of this.mats.values()) {
      const im = new THREE.InstancedMesh(geo, mat, list.length);
      list.forEach((m, i) => im.setMatrixAt(i, m));
      im.castShadow = shadow;
      im.receiveShadow = true;
      parent.add(im);
    }
  }
}

function signMaterial(text: string, bg: string) {
  const safeBg = bg || '#1f6b5a';
  const c = document.createElement('canvas');
  c.width = 512; c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, 0, 128);
  grad.addColorStop(0, safeBg); grad.addColorStop(1, '#0d1a18');
  g.fillStyle = grad; g.fillRect(0, 0, 512, 128);
  g.strokeStyle = 'rgba(255,255,255,0.6)'; g.lineWidth = 6; g.strokeRect(6, 6, 500, 116);
  g.fillStyle = '#fff6dc';
  g.font = 'bold 64px "Hind Siliguri", "Noto Sans Bengali", sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 256, 68, 480);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  // Backlit look: emissive uses the same texture.
  return new THREE.MeshStandardMaterial({ map: t, emissive: '#ffffff', emissiveMap: t, emissiveIntensity: 0.35, roughness: 0.5 });
}

export function buildDhakaBuilding(scene: THREE.Scene, opts: BuildingOptions): { group: THREE.Group; obstacle: BoxObstacle } {
  const rawSeed = opts.seed ?? Math.abs(Math.floor(opts.x * 7919 + opts.z * 104729 + 99991)) + 1;
  const r = rng(rawSeed);
  const S = shared();
  const width = opts.width ?? 17 + r() * 6;
  const depth = opts.depth ?? 17 + r() * 6;
  const floors = Math.max(3, Math.floor((opts.height ?? 10 + r() * 21) / FLOOR_H));
  const h = floors * FLOOR_H;
  const brick = r() < 0.3;

  const group = new THREE.Group();
  group.position.set(opts.x, 0, opts.z);
  group.name = 'dhaka-building';

  // Facade
  const facadeMat = brick ? pbrMaterial('brick') : pbrMaterial('plaster', { tint: opts.color ?? '#e0d4bc' });
  const facade = new THREE.Mesh(new THREE.BoxGeometry(width, h, depth), facadeMat);
  facade.position.y = h / 2;
  facade.castShadow = facade.receiveShadow = true;
  applyWorldUV(facade);
  group.add(facade);

  // Ground-floor plinth (shop level)
  const plinth = new THREE.Mesh(new THREE.BoxGeometry(width + 0.1, FLOOR_H, depth + 0.1), S.groundTile);
  plinth.position.y = FLOOR_H / 2;
  plinth.receiveShadow = true;
  applyWorldUV(plinth);
  group.add(plinth);

  const inst = new Instancer();
  const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

  // Four sides: [normal angle, half-length along side, distance to face]
  const sides: Array<{ rot: number; half: number; off: number }> = [
    { rot: 0, half: width / 2, off: depth / 2 },            // +Z face
    { rot: Math.PI, half: width / 2, off: depth / 2 },      // -Z face
    { rot: Math.PI / 2, half: depth / 2, off: width / 2 },  // +X face
    { rot: -Math.PI / 2, half: depth / 2, off: width / 2 }  // -X face
  ];

  // Convert side-local (u along face, y, n outward) to building-local position.
  const place = (rot: number, u: number, y: number, n: number) => {
    const sx = Math.sin(rot), cz = Math.cos(rot);
    // outward normal = (sin rot, 0, cos rot); along-face axis = (cos rot, 0, -sin rot)
    return v(u * cz + n * sx, y, -u * sx + n * cz);
  };

  for (const side of sides) {
    const cols = Math.max(2, Math.floor((side.half * 2 - 2) / 3.4));
    const step = (side.half * 2 - 2) / cols;
    const balconyCol = new Set<number>();
    for (let c = 0; c < cols; c++) if (r() < 0.3) balconyCol.add(c);

    for (let f = 1; f < floors; f++) {
      const y0 = f * FLOOR_H;
      // floor slab band
      inst.add(S.box, S.slab, place(side.rot, 0, y0, side.off + 0.08), v(side.half * 2 + 0.3, 0.22, 0.25), side.rot);
      for (let c = 0; c < cols; c++) {
        const u = -side.half + 1 + step * (c + 0.5);
        const wy = y0 + 1.55;
        const balcony = balconyCol.has(c) && f % 2 === 0;
        const lit = r() < 0.18;
        inst.add(S.plane, lit ? S.glassLit : S.glassDark, place(side.rot, u, wy, side.off + 0.03), v(1.5, 1.45, 1), side.rot, false);
        // frame
        inst.add(S.box, S.frame, place(side.rot, u, wy + 0.78, side.off + 0.06), v(1.7, 0.1, 0.12), side.rot);
        inst.add(S.box, S.frame, place(side.rot, u, wy - 0.78, side.off + 0.09), v(1.8, 0.1, 0.22), side.rot); // sill
        for (const s of [-1, 1]) inst.add(S.box, S.frame, place(side.rot, u + s * 0.8, wy, side.off + 0.06), v(0.1, 1.55, 0.12), side.rot);
        if (balcony) {
          inst.add(S.box, S.slab, place(side.rot, u, y0 + 0.1, side.off + 0.65), v(2.6, 0.18, 1.3), side.rot);
          inst.add(S.plane, S.grill, place(side.rot, u, y0 + 0.75, side.off + 1.3), v(2.6, 1.1, 1), side.rot, false);
          for (const s of [-1, 1]) inst.add(S.plane, S.grill, place(side.rot, u + s * 1.3, y0 + 0.75, side.off + 0.65), v(1.3, 1.1, 1), side.rot + Math.PI / 2, false);
        } else {
          inst.add(S.plane, S.grill, place(side.rot, u, wy, side.off + 0.16), v(1.5, 1.45, 1), side.rot, false);
          if (r() < 0.22) inst.add(S.box, S.acBody, place(side.rot, u + 0.45, wy - 1.05, side.off + 0.28), v(0.85, 0.55, 0.42), side.rot);
        }
      }
    }

    // Ground floor shops: shutters + signboard
    const shopCount = Math.max(1, Math.floor(side.half * 2 / 6));
    const shopW = (side.half * 2 - 1) / shopCount;
    for (let sIdx = 0; sIdx < shopCount; sIdx++) {
      const u = -side.half + 0.5 + shopW * (sIdx + 0.5);
      const open = r();
      const shutterH = open < 0.5 ? 0.5 : open < 0.8 ? 1.4 : 2.5;   // most shops are open
      inst.add(S.box, S.shutter, place(side.rot, u, 2.75 - shutterH / 2, side.off + 0.12), v(shopW - 0.4, shutterH, 0.06), side.rot);
      inst.add(S.cyl, S.shutter, place(side.rot, u, 2.85, side.off + 0.22), v(0.18, shopW - 0.3, 0.18), side.rot); // shutter drum (scaled below)
      if (shutterH < 2) {
        inst.add(S.plane, S.glassLit, place(side.rot, u, (2.75 - shutterH) / 2, side.off + 0.07), v(shopW - 0.5, 2.6 - shutterH, 1), side.rot, false);
      }
    }
    const names = opts.shopNames ?? [];
    if (names.length) {
      const nameIdx = Math.abs(Math.floor(r() * names.length)) % names.length;
      const name = names[nameIdx] || 'দোকান';
      const bgPalette = ['#1f6b5a', '#8c2f2a', '#2a4f86', '#7a5a14'];
      const bgIdx = Math.abs(Math.floor(r() * bgPalette.length)) % bgPalette.length;
      const bg = bgPalette[bgIdx] || '#1f6b5a';
      const sign = new THREE.Mesh(S.box, signMaterial(name, bg));
      const signW = Math.min(side.half * 2 * 0.8, 10);
      sign.scale.set(signW, signW / 4.5, 0.18);
      sign.position.copy(place(side.rot, 0, FLOOR_H + 0.5, side.off + 0.25));
      sign.rotation.y = side.rot;
      sign.castShadow = true;
      group.add(sign);
    }
  }

  // Roof: parapet, stair room, water tanks, clothes line poles
  const parapetMat = facadeMat;
  for (const side of sides) {
    inst.add(S.box, S.slab, place(side.rot, 0, h + 0.5, side.off - 0.12), v(side.half * 2, 1.0, 0.24), side.rot);
  }
  const room = new THREE.Mesh(S.box, parapetMat);
  room.scale.set(4, 2.8, 4);
  room.position.set((r() - 0.5) * (width - 6), h + 1.4, (r() - 0.5) * (depth - 6));
  room.castShadow = room.receiveShadow = true;
  group.add(room);
  const tanks = 1 + Math.floor(r() * 3);
  for (let t = 0; t < tanks; t++) {
    const tx = (r() - 0.5) * (width - 4), tz = (r() - 0.5) * (depth - 4);
    inst.add(S.cyl, S.tank, v(tx, h + 1.5, tz), v(0.75, 1.3, 0.75));
    inst.add(S.box, S.slab, v(tx, h + 0.4, tz), v(1.9, 0.8, 1.9));                       // tank stand
  }

  inst.build(group);

  // The shutter drums were added as upright cylinders; lay them horizontally along each face.
  group.children.forEach((ch) => {
    const im = ch as THREE.InstancedMesh;
    if (!im.isInstancedMesh || im.geometry !== S.cyl || im.material !== S.shutter) return;
    const m = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
    const tilt = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2);
    for (let i = 0; i < im.count; i++) {
      im.getMatrixAt(i, m); m.decompose(p, q, s);
      im.setMatrixAt(i, m.compose(p, q.multiply(tilt), s));
    }
    im.instanceMatrix.needsUpdate = true;
  });

  scene.add(group);
  return {
    group,
    obstacle: { type: 'box', x: opts.x, z: opts.z, hw: width / 2 + 0.65, hd: depth / 2 + 0.65, tag: 'building' }
  };
}
