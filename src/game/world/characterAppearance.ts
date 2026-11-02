import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export interface CharacterAppearance {
  outfit: 'shirt' | 'kurta' | 'lungi' | 'police';
  shirt?: string; bottom?: string; skin?: string; hair?: string;
  cap?: boolean; bag?: boolean; gamchha?: boolean; beard?: boolean;
}

/** Original clothed mesh, bound to the CC0 mannequin skeleton in its rest pose.
 * One vertex-coloured skinned mesh carries clothes, face, hair and accessories.
 * The source mannequin geometry is removed; only its rig and locomotion remain.
 */
export function buildCharacterAppearance(content: THREE.Object3D, options: CharacterAppearance) {
  content.updateMatrixWorld(true);
  const sources: THREE.SkinnedMesh[] = [];
  content.traverse((object) => { if ((object as THREE.SkinnedMesh).isSkinnedMesh) sources.push(object as THREE.SkinnedMesh); });
  if (!sources.length) throw new Error('Character asset has no skeleton');
  const source = sources[0], skeleton = source.skeleton;
  const indices = new Map(skeleton.bones.map((bone, index) => [bone.name, index]));
  const bone = (name: string) => {
    const index = indices.get(name);
    if (index === undefined) throw new Error(`Character rig is missing ${name}`);
    return skeleton.bones[index];
  };
  const position = (name: string) => bone(name).getWorldPosition(new THREE.Vector3());
  const geometries: THREE.BufferGeometry[] = [];
  const inverseMesh = source.matrixWorld.clone().invert();
  const skin = new THREE.Color(options.skin ?? '#9c6644');
  const hair = new THREE.Color(options.hair ?? '#171411');
  const police = options.outfit === 'police';
  const shirt = new THREE.Color(options.shirt ?? (police ? '#2c4a6e' : '#e3dcc8'));
  const bottom = new THREE.Color(options.bottom ?? (police ? '#1f2f45' : '#2d5e78'));
  const dark = new THREE.Color('#242824'), gold = new THREE.Color('#d2b564');
  const hips = position('DEF-hips'), head = position('DEF-head').add(new THREE.Vector3(0, 0.093, 0));
  const torsoNames = ['DEF-hips', 'DEF-spine001', 'DEF-spine002', 'DEF-spine003', 'DEF-neck'];
  const torsoPoints = torsoNames.map(position);
  type Weights = (point: THREE.Vector3) => Array<[string, number]>;
  const rigid = (name: string): Weights => () => [[name, 1]];
  const torso: Weights = (point) => {
    for (let i = 1; i < torsoPoints.length; i++) {
      if (point.y <= torsoPoints[i].y) {
        const amount = THREE.MathUtils.clamp((point.y - torsoPoints[i - 1].y) / (torsoPoints[i].y - torsoPoints[i - 1].y), 0, 1);
        return [[torsoNames[i - 1], 1 - amount], [torsoNames[i], amount]];
      }
    }
    return [['DEF-neck', 1]];
  };
  const skirt: Weights = (point) => {
    const leg = 1 - THREE.MathUtils.smoothstep(point.y, 0.38, 0.84);
    const left = THREE.MathUtils.clamp((point.x + 0.12) / 0.24, 0, 1);
    return [['DEF-hips', 1 - leg * 0.6], ['DEF-thighL', leg * 0.6 * left], ['DEF-thighR', leg * 0.6 * (1 - left)]];
  };
  const add = (geometry: THREE.BufferGeometry, color: THREE.Color, weights: Weights, checked = false) => {
    const g = geometry.index ? geometry.toNonIndexed() : geometry;
    if (g !== geometry) geometry.dispose();
    const p = g.getAttribute('position');
    const colors = new Float32Array(p.count * 3), joints = new Uint16Array(p.count * 4), values = new Float32Array(p.count * 4);
    const point = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      point.fromBufferAttribute(p, i);
      const shade = checked && ((Math.floor((point.x + 1) * 55) % 5 === 0) || (Math.floor(point.y * 65) % 5 === 0)) ? 0.52 : 1;
      colors.set([color.r * shade, color.g * shade, color.b * shade], i * 3);
      weights(point).forEach(([name, weight], slot) => {
        if (slot > 3) throw new Error('Too many skin weights');
        bone(name); joints[i * 4 + slot] = indices.get(name)!; values[i * 4 + slot] = weight;
      });
    }
    g.applyMatrix4(inverseMesh);
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(joints, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(values, 4));
    // Keep the same attributes for every part; UVs are unnecessary for vertex colours.
    g.deleteAttribute('uv'); geometries.push(g);
  };
  const ellipsoid = (centre: THREE.Vector3, size: THREE.Vector3, color: THREE.Color, name: string, segments = 12) =>
    add(new THREE.SphereGeometry(1, segments, 8).scale(size.x, size.y, size.z).translate(centre.x, centre.y, centre.z), color, rigid(name));
  const box = (centre: THREE.Vector3, size: THREE.Vector3, color: THREE.Color, weights: Weights, checked = false) =>
    add(new THREE.BoxGeometry(size.x, size.y, size.z, checked ? 8 : 1, checked ? 24 : 1, 1).translate(centre.x, centre.y, centre.z), color, weights, checked);
  const limb = (from: string, to: string, radius: number, endRadius: number, color: THREE.Color, start = 0, end = 1) => {
    const a = position(from), b = position(to), axis = b.clone().sub(a), length = axis.length();
    const centre = a.clone().addScaledVector(axis, (start + end) / 2);
    const rotation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis.clone().normalize());
    const geometry = new THREE.CylinderGeometry(endRadius, radius, length * (end - start) + 0.015, 10, 5)
      .applyQuaternion(rotation).translate(centre.x, centre.y, centre.z);
    const weights: Weights = (point) => {
      const t = THREE.MathUtils.clamp(point.clone().sub(a).dot(axis) / (length * length), 0, 1);
      const amount = THREE.MathUtils.smoothstep(t, 0.76, 1);
      return [[from, 1 - amount], [to, amount]];
    };
    add(geometry, color, weights);
  };

  // Native rig faces +Z. The loader rotates the finished character to the game's -Z.
  const kurta = options.outfit === 'kurta', lungi = options.outfit === 'lungi';
  const bodyPoints = [[0.19, kurta ? 0.57 : 0.90], [0.18, 1.02], [0.195, 1.24], [0.235, 1.40], [0.19, 1.45], [0.07, 1.49]];
  add(new THREE.LatheGeometry(bodyPoints.map(([r, y]) => new THREE.Vector2(r, y)), 20).scale(1, 1, 0.65), shirt, (p) => kurta && p.y < 0.92 ? skirt(p) : torso(p));
  limb('DEF-neck', 'DEF-head', 0.056, 0.052, skin);
  const gripOffsets: THREE.Vector3[] = [];
  for (const side of ['L', 'R']) {
    const upper = `DEF-upper_arm${side}`, forearm = `DEF-forearm${side}`, hand = `DEF-hand${side}`;
    ellipsoid(position(upper), new THREE.Vector3(0.10, 0.095, 0.09), shirt, upper);
    limb(upper, forearm, 0.073, 0.053, skin);
    limb(upper, forearm, 0.088, 0.067, shirt, 0, police || kurta ? 1 : 0.58);
    limb(forearm, hand, 0.057, 0.036, police || kurta ? shirt : skin);
    ellipsoid(position(forearm), new THREE.Vector3(0.054, 0.054, 0.054), police || kurta ? shirt : skin, forearm, 10);
    const handCentre = position(hand).add(position(hand).sub(position(forearm)).normalize().multiplyScalar(0.045));
    ellipsoid(handCentre, new THREE.Vector3(0.055, 0.027, 0.04), skin, hand);
    gripOffsets.push(bone(hand).worldToLocal(handCentre.clone()));
    const thigh = `DEF-thigh${side}`, shin = `DEF-shin${side}`, foot = `DEF-foot${side}`;
    limb(thigh, shin, lungi ? 0.074 : 0.095, lungi ? 0.055 : 0.072, lungi ? skin : bottom);
    limb(shin, foot, lungi ? 0.055 : 0.072, lungi ? 0.038 : 0.052, lungi ? skin : bottom);
    ellipsoid(position(shin), new THREE.Vector3(lungi ? 0.056 : 0.073, 0.06, lungi ? 0.055 : 0.07), lungi ? skin : bottom, shin, 10);
    const sole = position(foot).add(new THREE.Vector3(0, -0.062, 0.064));
    ellipsoid(sole, new THREE.Vector3(0.06, police ? 0.048 : 0.026, 0.13), dark, foot);
    if (lungi) box(sole.clone().add(new THREE.Vector3(0, 0.029, 0.01)), new THREE.Vector3(0.105, 0.014, 0.04), dark, rigid(foot));
  }
  if (lungi) {
    const geometry = new THREE.CylinderGeometry(0.19, 0.245, 0.60, 24, 24, true).scale(1, 1, 0.78).translate(0, 0.65, hips.z);
    add(geometry, bottom, skirt, true);
  }
  // Rounded head with black hair and small facial features, all on the head bone.
  ellipsoid(head, new THREE.Vector3(0.108, 0.14, 0.099), skin, 'DEF-head', 16);
  for (const side of [-1, 1]) {
    ellipsoid(head.clone().add(new THREE.Vector3(side * 0.108, 0, 0)), new THREE.Vector3(0.023, 0.037, 0.022), skin, 'DEF-head', 8);
    ellipsoid(head.clone().add(new THREE.Vector3(side * 0.041, 0.025, 0.088)), new THREE.Vector3(0.021, 0.012, 0.014), new THREE.Color('#f0e4d5'), 'DEF-head', 8);
    ellipsoid(head.clone().add(new THREE.Vector3(side * 0.041, 0.024, 0.100)), new THREE.Vector3(0.009, 0.009, 0.007), dark, 'DEF-head', 8);
    box(head.clone().add(new THREE.Vector3(side * 0.042, 0.049, 0.092)), new THREE.Vector3(0.037, 0.007, 0.009), hair, rigid('DEF-head'));
  }
  ellipsoid(head.clone().add(new THREE.Vector3(0, -0.002, 0.103)), new THREE.Vector3(0.022, 0.034, 0.032), skin, 'DEF-head', 10);
  box(head.clone().add(new THREE.Vector3(0, -0.046, 0.093)), new THREE.Vector3(0.041, 0.009, 0.01), new THREE.Color('#6b3c30'), rigid('DEF-head'));
  add(new THREE.SphereGeometry(1, 16, 7, 0, Math.PI * 2, 0, Math.PI / 2).scale(0.113, 0.147, 0.104).translate(head.x, head.y + 0.003, head.z), hair, rigid('DEF-head'));
  if (options.beard) ellipsoid(head.clone().add(new THREE.Vector3(0, -0.077, 0.056)), new THREE.Vector3(0.077, 0.042, 0.045), hair, 'DEF-head');
  if (police || options.cap) {
    const capColor = police ? new THREE.Color('#253e59') : new THREE.Color('#efe9da');
    add(new THREE.CylinderGeometry(0.098, 0.115, 0.085, 16).translate(head.x, head.y + 0.145, head.z), capColor, rigid('DEF-head'));
    if (police) {
      box(head.clone().add(new THREE.Vector3(0, 0.12, 0.105)), new THREE.Vector3(0.17, 0.014, 0.10), capColor, rigid('DEF-head'));
      box(head.clone().add(new THREE.Vector3(0, 0.15, 0.113)), new THREE.Vector3(0.027, 0.032, 0.008), gold, rigid('DEF-head'));
    }
  }
  box(new THREE.Vector3(0, 1.25, 0.133), new THREE.Vector3(0.018, 0.34, 0.014), police ? new THREE.Color('#24394f') : new THREE.Color('#cec8b6'), torso);
  if (police) {
    add(new THREE.TorusGeometry(0.19, 0.022, 6, 20).rotateX(Math.PI / 2).scale(1, 1, 0.67).translate(0, 0.98, hips.z), dark, rigid('DEF-hips'));
    box(new THREE.Vector3(-0.082, 1.33, 0.14), new THREE.Vector3(0.06, 0.02, 0.012), gold, torso);
    for (const side of [-1, 1]) box(new THREE.Vector3(side * 0.17, 1.449, -0.014), new THREE.Vector3(0.06, 0.012, 0.07), gold, torso);
  }
  if (options.gamchha) {
    box(new THREE.Vector3(0.105, 1.25, 0.145), new THREE.Vector3(0.09, 0.46, 0.024), new THREE.Color('#bd4338'), torso, true);
    box(new THREE.Vector3(0.105, 1.28, -0.15), new THREE.Vector3(0.09, 0.40, 0.024), new THREE.Color('#bd4338'), torso, true);
  }
  if (options.bag) {
    box(new THREE.Vector3(0, 1.20, -0.20), new THREE.Vector3(0.27, 0.34, 0.13), new THREE.Color('#374342'), torso);
    for (const side of [-1, 1]) box(new THREE.Vector3(side * 0.105, 1.27, 0.15), new THREE.Vector3(0.025, 0.36, 0.02), dark, torso);
  }
  const geometry = mergeGeometries(geometries, false);
  geometries.forEach((g) => g.dispose());
  if (!geometry) throw new Error('Could not merge character appearance');
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, side: THREE.DoubleSide });
  const mesh = new THREE.SkinnedMesh(geometry, material);
  mesh.name = `dhaka-${options.outfit}`;
  mesh.position.copy(source.position); mesh.quaternion.copy(source.quaternion); mesh.scale.copy(source.scale);
  mesh.bind(skeleton, source.bindMatrix.clone()); mesh.frustumCulled = false;
  mesh.castShadow = true; mesh.receiveShadow = true;
  const parent = source.parent!;
  sources.forEach((old) => old.removeFromParent()); parent.add(mesh);
  return { mesh, geometry, material, skeleton, gripOffsets };
}
