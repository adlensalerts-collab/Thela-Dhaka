import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Sprint 4 — realistic human figure, shared by the player vendor, police and pedestrians.
 *
 * Built in metres (~1.68 m person): lathe-shaped torso, capsule limbs with elbow joints,
 * a proportioned head (eyes, brows, nose, ears, lips, hair) and Dhaka outfits:
 *   'lungi'  — checked lungi + fotua (street vendor, worker)
 *   'kurta'  — long panjabi over pyjama
 *   'shirt'  — shirt + trousers
 *   'police' — uniform shirt, trousers, belt, peaked cap, badges
 * Faces local -Z like every other model in the game.
 * Pivots match PedestrianNPC (leftLeg, rightLeg, leftArm, rightArm, body), so
 * pedestrians.ts keeps animating rotation.x exactly as it does today.
 */
export type Outfit = 'lungi' | 'kurta' | 'shirt' | 'police';

export interface HumanOptions {
  outfit?: Outfit;
  shirt?: string;
  bottom?: string;
  skin?: string;
  hair?: string;
  cap?: boolean;      // white tupi (police always get a peaked cap)
  bag?: boolean;
  gamchha?: boolean;  // checked towel over the shoulder
  beard?: boolean;
  /** Crowd mode: merge each body part into one vertex-coloured mesh (~6 draw calls instead of ~35). */
  compact?: boolean;
  scale?: number;     // world scale; 1.18 ≈ 2 m figure, in proportion to the 3.2 m building floors and the thela
  seed?: number;
}

export interface HumanRig {
  group: THREE.Group;
  /** Upper body, pivoting at the hips. Neutral height is body.userData.baseY — add bob to that. */
  body: THREE.Group;
  head: THREE.Group;
  leftArm: THREE.Group; rightArm: THREE.Group;
  leftForearm: THREE.Group; rightForearm: THREE.Group;
  leftLeg: THREE.Group; rightLeg: THREE.Group;
}

const HIP_Y = 0.92;
const SKINS = ['#8d5a3b', '#9c6644', '#7a4b31', '#a8704a', '#6e432c'];
const HAIR = ['#141110', '#1d1714', '#2a211b'];

function rng(seed: number) {
  let s = (Math.abs(Math.floor(seed)) % 2147483646) + 1;
  return () => {
    s = (s * 16807) % 2147483647;
    return Math.max(0, Math.min(0.999999, (s - 1) / 2147483646));
  };
}

const matCache = new Map<string, THREE.Material>();
function cloth(color: string, rough = 0.92): THREE.Material {
  const k = `c${color}${rough}`;
  if (!matCache.has(k)) matCache.set(k, new THREE.MeshStandardMaterial({ color, roughness: rough }));
  return matCache.get(k)!;
}
function skinMat(color: string): THREE.Material {
  const k = `s${color}`;
  if (!matCache.has(k)) {
    matCache.set(k, new THREE.MeshPhysicalMaterial({
      color, roughness: 0.55, sheen: 0.4, sheenRoughness: 0.6, sheenColor: new THREE.Color('#ffd9c0')
    }));
  }
  return matCache.get(k)!;
}

/** Checked fabric (lungi / gamchha) painted on a canvas. */
function checkMaterial(base: string, line: string, key: string): THREE.Material {
  if (matCache.has(key)) return matCache.get(key)!;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = base; g.fillRect(0, 0, 128, 128);
  g.fillStyle = line;
  g.globalAlpha = 0.55;
  for (let i = 0; i < 128; i += 32) { g.fillRect(i, 0, 7, 128); g.fillRect(0, i, 128, 7); }
  g.globalAlpha = 0.25;
  for (let i = 16; i < 128; i += 32) { g.fillRect(i, 0, 3, 128); g.fillRect(0, i, 128, 3); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(3, 2);
  const m = new THREE.MeshStandardMaterial({ map: t, roughness: 0.95, side: THREE.DoubleSide });
  matCache.set(key, m);
  return m;
}

const capsule = (r: number, len: number) => new THREE.CapsuleGeometry(r, len, 6, 12);
const sphere = (r: number, w = 16, h = 12) => new THREE.SphereGeometry(r, w, h);

function add(parent: THREE.Object3D, g: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(g, m);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

/** Hips -> waist -> chest -> shoulders, flattened front-to-back like a real torso. */
function torsoGeometry(bottomY: number, flare: number) {
  const pts: Array<[number, number]> = [
    [0.155 + flare, bottomY], [0.16, 0.98], [0.15, 1.08], [0.165, 1.2],
    [0.185, 1.32], [0.19, 1.39], [0.165, 1.45], [0.09, 1.5], [0.001, 1.505]
  ];
  const g = new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), 20);
  g.scale(1, 1, 0.68);
  return g;
}

function buildHead(parent: THREE.Group, skinC: string, hairC: string, police: boolean, cap: boolean, beard: boolean) {
  const head = new THREE.Group();
  head.position.y = 1.535;
  parent.add(head);
  const skin = skinMat(skinC);
  add(head, new THREE.CylinderGeometry(0.048, 0.055, 0.1, 10), skin, 0, 0, 0);          // neck
  add(head, sphere(0.105, 20, 16), skin, 0, 0.13, 0).scale.set(0.92, 1.12, 1.0);         // skull
  add(head, sphere(0.08, 16, 10), skin, 0, 0.075, -0.025).scale.set(1, 0.8, 1);          // jaw
  add(head, new THREE.ConeGeometry(0.018, 0.045, 8), skin, 0, 0.12, -0.105).rotation.x = -Math.PI / 2; // nose
  for (const s of [-1, 1]) {
    add(head, sphere(0.022, 8, 6), skin, s * 0.098, 0.13, 0.005).scale.set(0.5, 1, 0.8);  // ear
    add(head, sphere(0.013, 8, 6), cloth('#f4efe6', 0.3), s * 0.036, 0.145, -0.088);       // eye
    add(head, sphere(0.008, 8, 6), cloth('#1a120c', 0.2), s * 0.036, 0.145, -0.099);       // iris
    add(head, new THREE.BoxGeometry(0.035, 0.007, 0.01), cloth(hairC), s * 0.037, 0.168, -0.094); // brow
  }
  add(head, new THREE.BoxGeometry(0.04, 0.006, 0.006), cloth('#5a2f26', 0.6), 0, 0.075, -0.09); // lips
  add(head, new THREE.SphereGeometry(0.112, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.42), cloth(hairC, 0.8), 0, 0.14, 0.008)
    .scale.set(0.95, 1.12, 1.05);
  if (beard) {
    add(head, new THREE.SphereGeometry(0.085, 16, 10, 0, Math.PI * 2, Math.PI * 0.5, Math.PI * 0.4), cloth(hairC, 0.95), 0, 0.09, -0.025);
  }
  if (police) {
    const navy = cloth('#1f2f4a', 0.7);
    add(head, new THREE.CylinderGeometry(0.12, 0.112, 0.07, 18), navy, 0, 0.235, 0);
    add(head, new THREE.CylinderGeometry(0.14, 0.12, 0.03, 18), navy, 0, 0.28, -0.01);
    add(head, new THREE.CylinderGeometry(0.1, 0.1, 0.012, 16, 1, false, Math.PI * 0.5, Math.PI), cloth('#0d0d0f', 0.3), 0, 0.205, -0.05)
      .rotation.x = 0.15;                                                                     // visor
    add(head, new THREE.BoxGeometry(0.04, 0.035, 0.01), cloth('#d8b64a', 0.3), 0, 0.245, -0.123); // cap badge
  } else if (cap) {
    add(head, new THREE.SphereGeometry(0.113, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.32), cloth('#f4f4ee', 0.8), 0, 0.15, 0.005);
  }
  return head;
}

function buildArm(body: THREE.Group, side: number, top: THREE.Material, skin: THREE.Material, longSleeve: boolean) {
  const shoulder = new THREE.Group();
  shoulder.position.set(side * 0.205, 1.42, 0);
  body.add(shoulder);
  add(shoulder, sphere(0.06, 12, 8), top);                                                  // deltoid
  add(shoulder, capsule(0.048, 0.2), top, 0, -0.15, 0);                                     // upper arm
  const elbow = new THREE.Group();
  elbow.position.y = -0.29;
  shoulder.add(elbow);
  add(elbow, capsule(0.04, 0.19), longSleeve ? top : skin, 0, -0.12, 0);                    // forearm
  add(elbow, sphere(0.045, 12, 8), skin, 0, -0.29, -0.005).scale.set(0.7, 1.15, 0.95);      // hand
  shoulder.rotation.z = side * 0.06;
  return { shoulder, elbow };
}

function buildLeg(group: THREE.Group, side: number, thighMat: THREE.Material, shinMat: THREE.Material, footMat: THREE.Material) {
  const hip = new THREE.Group();
  hip.position.set(side * 0.095, 0.92, 0);
  group.add(hip);
  add(hip, capsule(0.072, 0.32), thighMat, 0, -0.2, 0);
  add(hip, capsule(0.056, 0.34), shinMat, 0, -0.6, 0.01);
  add(hip, new THREE.BoxGeometry(0.09, 0.05, 0.24), footMat, 0, -0.895, -0.045);
  return hip;
}

export function createHumanRig(opts: HumanOptions = {}): HumanRig {
  const r = rng(opts.seed ?? Math.floor(Math.random() * 1e9) + 1);
  const pick = <T,>(a: T[]) => a[Math.abs(Math.floor(r() * a.length)) % a.length];
  const outfit: Outfit = opts.outfit ?? 'shirt';
  const police = outfit === 'police';
  const skinC = opts.skin ?? pick(SKINS);
  const hairC = opts.hair ?? pick(HAIR);
  const shirtC = opts.shirt ?? (police ? '#2c4a6e' : '#d8cdb2');
  const bottomC = opts.bottom ?? (police ? '#1f2f45' : '#2e3440');

  const skin = skinMat(skinC);
  const top = cloth(shirtC, 0.9);
  const lower = outfit === 'lungi' ? checkMaterial(bottomC, '#e9e2cf', `lungi${bottomC}`) : cloth(bottomC, 0.9);
  const footwear = cloth(police ? '#0e0e10' : '#3b2a1f', police ? 0.35 : 0.8);

  const group = new THREE.Group();
  const body = new THREE.Group();
  group.add(body);

  const kurta = outfit === 'kurta';
  add(body, torsoGeometry(kurta ? 0.5 : 0.86, kurta ? 0.07 : 0), top);
  add(body, new THREE.CylinderGeometry(0.15, 0.15, 0.12, 18).scale(1, 1, 0.7), lower, 0, 0.9, 0); // pelvis

  if (police) {
    const belt = add(body, new THREE.TorusGeometry(0.16, 0.018, 6, 24), cloth('#151515', 0.4), 0, 0.97, 0);
    belt.rotation.x = Math.PI / 2;
    belt.scale.set(1, 0.7, 1);
    add(body, new THREE.BoxGeometry(0.06, 0.04, 0.02), cloth('#c9a94a', 0.3), 0, 0.97, -0.112);   // buckle
    for (const s of [-1, 1]) add(body, new THREE.BoxGeometry(0.1, 0.012, 0.07), cloth('#1a2a40', 0.6), s * 0.16, 1.455, 0);
    add(body, new THREE.BoxGeometry(0.05, 0.015, 0.01), cloth('#d8b64a', 0.3), -0.08, 1.33, -0.128); // name plate
  }
  if (outfit === 'shirt' || police) {
    add(body, new THREE.BoxGeometry(0.025, 0.42, 0.005), cloth(police ? '#24405f' : '#f1ece0', 0.8), 0, 1.22, -0.12); // placket
  }
  if (opts.gamchha) {
    const gm = checkMaterial('#b8302b', '#f2e9d8', 'gamchha');
    add(body, new THREE.BoxGeometry(0.11, 0.46, 0.02), gm, 0.1, 1.27, -0.12).rotation.z = 0.12;
    add(body, new THREE.BoxGeometry(0.11, 0.4, 0.02), gm, 0.12, 1.3, 0.12).rotation.z = -0.1;
  }
  if (opts.bag) {
    add(body, new THREE.BoxGeometry(0.28, 0.36, 0.13), cloth('#2f3a45', 0.7), 0, 1.22, 0.17);
    for (const s of [-1, 1]) add(body, new THREE.BoxGeometry(0.03, 0.35, 0.02), cloth('#1d242b', 0.7), s * 0.1, 1.28, -0.11);
  }

  const head = buildHead(body, skinC, hairC, police, !!opts.cap, !!opts.beard);
  const longSleeve = kurta || police;
  const L = buildArm(body, -1, top, skin, longSleeve);
  const R = buildArm(body, 1, top, skin, longSleeve);
  const lungi = outfit === 'lungi';
  const leftLeg = buildLeg(group, -1, lungi ? skin : lower, lungi ? skin : lower, footwear);
  const rightLeg = buildLeg(group, 1, lungi ? skin : lower, lungi ? skin : lower, footwear);

  if (lungi) {
    // Tube skirt waist -> mid-shin, on the body so the legs swing underneath it.
    const pts: Array<[number, number]> = [[0.2, 0.3], [0.205, 0.55], [0.19, 0.8], [0.165, 0.97]];
    const skirt = new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), 22);
    skirt.scale(1, 1, 0.82);
    add(body, skirt, lower);
    add(body, sphere(0.035, 8, 6), lower, 0, 0.95, -0.14).scale.set(1.4, 0.8, 0.7);              // waist knot
  }

  // Pivot the upper body at the hips so leaning/bobbing never detaches it from the legs.
  for (const child of body.children) child.position.y -= HIP_Y;
  body.position.y = HIP_Y;
  body.userData.baseY = HIP_Y;

  group.scale.setScalar(opts.scale ?? 1.18);
  const rig: HumanRig = { group, body, head, leftArm: L.shoulder, rightArm: R.shoulder, leftForearm: L.elbow, rightForearm: R.elbow, leftLeg, rightLeg };
  if (opts.compact) compactRig(rig);
  return rig;
}

/**
 * Merge every mesh under each animated pivot into ONE mesh (vertex colours carry the material
 * colours). Pivots kept: body (incl. head), each arm (incl. forearm/hand), each leg.
 * Textured parts (checked lungi/gamchha) keep one extra textured mesh per pivot.
 */
const crowdMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 });
function compactRig(rig: HumanRig) {
  const pivots: THREE.Object3D[] = [rig.body, rig.leftArm, rig.rightArm, rig.leftLeg, rig.rightLeg];
  rig.group.updateMatrixWorld(true);
  for (const pivot of pivots) {
    const inv = new THREE.Matrix4().copy(pivot.matrixWorld).invert();
    const plain: THREE.BufferGeometry[] = [];
    const textured = new Map<THREE.Material, THREE.BufferGeometry[]>();
    const victims: THREE.Mesh[] = [];
    pivot.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      // skip meshes that belong to a deeper animated pivot (arms/legs are not inside body)
      let p: THREE.Object3D | null = m.parent;
      while (p && p !== pivot) { if (pivots.includes(p)) return; p = p.parent; }
      const g = (m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone());
      g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld));
      for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
      if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      const mat = m.material as THREE.MeshStandardMaterial;
      if (mat.map) {
        if (!textured.has(mat)) textured.set(mat, []);
        textured.get(mat)!.push(g);
      } else {
        const c = mat.color ?? new THREE.Color('#888');
        const cols = new Float32Array(g.attributes.position.count * 3);
        for (let i = 0; i < cols.length; i += 3) { cols[i] = c.r; cols[i + 1] = c.g; cols[i + 2] = c.b; }
        g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
        plain.push(g);
      }
      victims.push(m);
    });
    for (const m of victims) m.removeFromParent();
    if (plain.length) {
      const merged = mergeGeometries(plain, false);
      if (merged) { const mesh = new THREE.Mesh(merged, crowdMat); mesh.castShadow = true; pivot.add(mesh); }
    }
    for (const [mat, list] of textured) {
      const merged = mergeGeometries(list, false);
      if (merged) { const mesh = new THREE.Mesh(merged, mat); mesh.castShadow = true; pivot.add(mesh); }
    }
  }
  // empty helper groups (head, elbows) stay so code that references them keeps working
}


/** Forward lean from the hips (radians). NOTE: in three.js a NEGATIVE x-rotation tips the torso forward (-Z). */
export const PUSH_LEAN = 0.37; // ~21°, solved numerically so hands land on the handles (±5 cm)

/**
 * Leaning forward from the hips with both hands on the thela handles in front (-Z).
 * Tuned so the hands land on the cart handles (makeCart: frame z = -1.35, handle bars at
 * local y = 1.05, z = +0.87 → world ≈ (±0.55, 1.05, -0.48)) at the default scale 1.18.
 */
export function setPushPose(rig: HumanRig) {
  rig.body.rotation.x = -PUSH_LEAN;
  rig.leftArm.rotation.x = rig.rightArm.rotation.x = PUSH_ARM;
  rig.leftForearm.rotation.x = rig.rightForearm.rotation.x = PUSH_FOREARM;
  rig.leftArm.rotation.z = -PUSH_SPREAD;
  rig.rightArm.rotation.z = PUSH_SPREAD;
}
const PUSH_ARM = 0.78;
const PUSH_FOREARM = 0;
const PUSH_SPREAD = 0.38;

/**
 * Walk cycle. Advance phase by distance travelled (e.g. phase += speed * dt * 2.2).
 * intensity: 0 idle .. 1 full stride. pushing keeps both hands on the cart handles.
 */
export function animateHuman(rig: HumanRig, phase: number, intensity: number, pushing = false) {
  const swing = Math.sin(phase) * 0.55 * intensity;
  rig.leftLeg.rotation.x = swing;
  rig.rightLeg.rotation.x = -swing;
  rig.body.position.y = (rig.body.userData.baseY ?? HIP_Y) + Math.abs(Math.cos(phase)) * 0.025 * intensity;
  if (pushing) {
    setPushPose(rig);
  } else {
    rig.body.rotation.x = -0.04 * intensity;  // slight forward lean when walking
    rig.leftArm.rotation.z = -0.06;
    rig.rightArm.rotation.z = 0.06;
    rig.leftArm.rotation.x = -swing * 0.8;
    rig.rightArm.rotation.x = swing * 0.8;
    rig.leftForearm.rotation.x = 0.15 + Math.max(0, -swing) * 0.5;
    rig.rightForearm.rotation.x = 0.15 + Math.max(0, swing) * 0.5;
  }
}

/** Pedestrian archetype -> outfit. */
export function outfitForArchetype(a: {
  name: string; shirtColor: string; pantsColor: string; hasCap?: boolean; hasBag?: boolean; hasGamchha?: boolean;
}): HumanOptions {
  const kurta = /kurta|uncle|senior/i.test(a.name);
  const lungi = /worker/i.test(a.name);
  return {
    outfit: kurta ? 'kurta' : lungi ? 'lungi' : 'shirt',
    shirt: a.shirtColor,
    bottom: a.pantsColor,
    cap: a.hasCap, bag: a.hasBag, gamchha: a.hasGamchha,
    beard: /uncle|senior/i.test(a.name),
    compact: true,
    scale: 1.08 + Math.random() * 0.16
  };
}
