import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Sprint 10 — far-tier crowd. Every pedestrian beyond the near-detail budget is drawn as part of
 * 3 instanced meshes (legs, clothed upper body with arms, head) instead of its own 5–7 draw calls.
 * Shape and proportions follow humans.ts (hips 0.92, head at 1.535 + 0.13, rig faces local -Z).
 */
export interface ImpostorPose {
  x: number;
  z: number;
  /** Same convention as PedestrianNPC.heading (mesh.rotation.y = -heading). */
  heading: number;
  scale: number;
  /** Leg swing in radians (0 = standing). */
  swing: number;
  /** Extra vertical bob in metres (already scaled). */
  bob: number;
  shirt: THREE.Color;
  bottom: THREE.Color;
  skin: THREE.Color;
}

const HIP_Y = 0.92;

function legGeometry(): THREE.BufferGeometry {
  const thigh = new THREE.CylinderGeometry(0.075, 0.062, 0.46, 7).translate(0, -0.23, 0);
  const shin = new THREE.CylinderGeometry(0.06, 0.052, 0.42, 7).translate(0, -0.65, 0.01);
  const foot = new THREE.BoxGeometry(0.09, 0.05, 0.22).translate(0, -0.895, -0.045);
  const g = mergeGeometries([thigh, shin, foot])!;
  thigh.dispose(); shin.dispose(); foot.dispose();
  return g;
}

function upperGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  parts.push(new THREE.CylinderGeometry(0.19, 0.16, 0.6, 9).scale(1, 1, 0.68).translate(0, 1.2, 0));   // torso
  parts.push(new THREE.CylinderGeometry(0.155, 0.15, 0.12, 9).scale(1, 1, 0.7).translate(0, 0.9, 0)); // pelvis
  for (const s of [-1, 1]) {
    parts.push(new THREE.CylinderGeometry(0.052, 0.045, 0.58, 6).translate(s * 0.235, 1.18, 0));      // arm
  }
  const g = mergeGeometries(parts)!;
  parts.forEach((p) => p.dispose());
  return g;
}

function headGeometry(): THREE.BufferGeometry {
  const neck = new THREE.CylinderGeometry(0.048, 0.055, 0.1, 6).translate(0, 1.535, 0);
  const skull = new THREE.SphereGeometry(0.105, 9, 7).scale(0.92, 1.12, 1).translate(0, 1.665, 0);
  const g = mergeGeometries([neck, skull])!;
  neck.dispose(); skull.dispose();
  return g;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _qLeg = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);

export class CrowdImpostors {
  readonly group = new THREE.Group();
  private legs: THREE.InstancedMesh;
  private upper: THREE.InstancedMesh;
  private heads: THREE.InstancedMesh;
  private materials: THREE.Material[];
  private count = 0;
  private disposed = false;

  constructor(readonly capacity: number) {
    const mat = () => new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.92 });
    this.materials = [mat(), mat(), mat()];
    this.legs = new THREE.InstancedMesh(legGeometry(), this.materials[0], capacity * 2);
    this.upper = new THREE.InstancedMesh(upperGeometry(), this.materials[1], capacity);
    this.heads = new THREE.InstancedMesh(headGeometry(), this.materials[2], capacity);
    for (const mesh of [this.legs, this.upper, this.heads]) {
      mesh.count = 0;
      mesh.visible = false;
      mesh.frustumCulled = false;        // instances span the whole district; bounds would be stale
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      // allocate instanceColor up front
      mesh.setColorAt(0, new THREE.Color('#ffffff'));
      mesh.instanceColor!.setUsage(THREE.DynamicDrawUsage);
      this.group.add(mesh);
    }
    this.group.name = 'crowd-impostors';
  }

  /** Begin a frame: subsequent `add` calls fill slots from 0. */
  begin() { this.count = 0; }

  add(pose: ImpostorPose) {
    if (this.disposed || this.count >= this.capacity) return;
    const i = this.count++;
    const yaw = -pose.heading;
    _q.setFromAxisAngle(_up, yaw);
    _s.setScalar(pose.scale);

    // upper body + head share one transform
    _p.set(pose.x, pose.bob, pose.z);
    _m.compose(_p, _q, _s);
    this.upper.setMatrixAt(i, _m);
    this.heads.setMatrixAt(i, _m);
    this.upper.setColorAt(i, pose.shirt);
    this.heads.setColorAt(i, pose.skin);

    // legs pivot at the hips, swing about local X
    const cos = Math.cos(yaw), sin = Math.sin(yaw);
    for (let side = 0; side < 2; side++) {
      const sx = (side === 0 ? -0.095 : 0.095) * pose.scale;
      _p.set(pose.x + cos * sx, HIP_Y * pose.scale, pose.z - sin * sx);
      _e.set(side === 0 ? -pose.swing : pose.swing, yaw, 0, 'YXZ');
      _qLeg.setFromEuler(_e);
      _m.compose(_p, _qLeg, _s);
      this.legs.setMatrixAt(i * 2 + side, _m);
      this.legs.setColorAt(i * 2 + side, pose.bottom);
    }
  }

  /** Finish a frame: upload only the slots used. */
  end() {
    if (this.disposed) return;
    this.upper.count = this.count;
    this.heads.count = this.count;
    this.legs.count = this.count * 2;
    for (const mesh of [this.legs, this.upper, this.heads]) {
      mesh.visible = this.count > 0;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }

  get drawn() { return this.count; }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.group.removeFromParent();
    for (const mesh of [this.legs, this.upper, this.heads]) {
      mesh.geometry.dispose();
      mesh.dispose();
    }
    this.materials.forEach((m) => m.dispose());
  }
}
