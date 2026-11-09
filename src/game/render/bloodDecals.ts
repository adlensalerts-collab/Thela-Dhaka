import * as THREE from 'three';

/**
 * Sprint 15b — Instanced ground blood decals for pedestrian knock-downs.
 * One shared InstancedMesh of flat quads just above the ground (y = 0.03),
 * one procedurally drawn irregular splat texture, dark red MeshBasicMaterial
 * (transparent, depthWrite false, polygonOffset). Hard cap 24 instances
 * (8 on Low quality); reuses the oldest slot when full. Each decal shrinks
 * away over 90 s. Zero per-frame allocations.
 */

const MAX_DECALS = 24;
const LOW_QUALITY_CAP = 8;
const DECAL_Y = 0.03;
const FADE_SECONDS = 90;

let sharedTexture: THREE.CanvasTexture | null = null;

function getSplatTexture(): THREE.CanvasTexture | null {
  if (sharedTexture) return sharedTexture;
  if (typeof document === 'undefined') return null;
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.clearRect(0, 0, size, size);
  const cx = size * 0.5;
  const cy = size * 0.5;
  const baseR = size * 0.36;

  // Draw an irregular multi-lobed organic splat silhouette in white (tinted by material color)
  const lobes = 18;
  ctx.save();
  ctx.beginPath();
  for (let i = 0; i <= lobes; i++) {
    const a = (i / lobes) * Math.PI * 2;
    const wobble =
      1 +
      0.22 * Math.sin(a * 3 + 0.7) +
      0.14 * Math.cos(a * 5 - 1.2) +
      0.09 * Math.sin(a * 7 + 2.1);
    const r = baseR * wobble;
    const px = cx + Math.cos(a) * r;
    const py = cy + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();

  const grad = ctx.createRadialGradient(cx, cy, baseR * 0.1, cx, cy, baseR * 1.25);
  grad.addColorStop(0, 'rgba(255, 255, 255, 0.98)');
  grad.addColorStop(0.65, 'rgba(220, 220, 220, 0.92)');
  grad.addColorStop(0.9, 'rgba(170, 170, 170, 0.65)');
  grad.addColorStop(1, 'rgba(120, 120, 120, 0)');
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.restore();

  sharedTexture = new THREE.CanvasTexture(canvas);
  sharedTexture.colorSpace = THREE.SRGBColorSpace;
  return sharedTexture;
}

const dummyMatrix = new THREE.Matrix4();
const dummyPos = new THREE.Vector3();
const dummyQuat = new THREE.Quaternion();
const dummyScale = new THREE.Vector3();
const yAxis = new THREE.Vector3(0, 1, 0);

export class BloodDecals {
  readonly mesh: THREE.InstancedMesh;
  private cap = MAX_DECALS;
  private seq = 1;
  private active = new Uint8Array(MAX_DECALS);
  private x = new Float32Array(MAX_DECALS);
  private z = new Float32Array(MAX_DECALS);
  private yaw = new Float32Array(MAX_DECALS);
  private scaleX = new Float32Array(MAX_DECALS);
  private scaleZ = new Float32Array(MAX_DECALS);
  private growSeconds = new Float32Array(MAX_DECALS);
  private age = new Float32Array(MAX_DECALS);
  private born = new Float64Array(MAX_DECALS);
  private dirty = false;

  constructor(scene: THREE.Scene) {
    const geo = new THREE.PlaneGeometry(1, 1);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({
      map: getSplatTexture(),
      color: '#5e0707',
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    this.mesh = new THREE.InstancedMesh(geo, mat, MAX_DECALS);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
    this.mesh.renderOrder = 1;
    this.mesh.count = 0;
    this.mesh.name = 'blood-decals';
    scene.add(this.mesh);
  }

  setLowQuality(isLow: boolean) {
    const nextCap = isLow ? LOW_QUALITY_CAP : MAX_DECALS;
    if (nextCap === this.cap) return;
    this.cap = nextCap;
    let activeCount = 0;
    for (let i = 0; i < MAX_DECALS; i++) if (this.active[i]) activeCount++;
    while (activeCount > this.cap) {
      let oldestIdx = -1;
      let oldestBorn = Infinity;
      for (let i = 0; i < MAX_DECALS; i++) {
        if (this.active[i] && this.born[i] < oldestBorn) {
          oldestBorn = this.born[i];
          oldestIdx = i;
        }
      }
      if (oldestIdx < 0) break;
      this.active[oldestIdx] = 0;
      activeCount--;
      this.dirty = true;
    }
  }

  private allocSlot(): number {
    let activeCount = 0;
    let freeIdx = -1;
    let oldestIdx = 0;
    let oldestBorn = Infinity;
    for (let i = 0; i < MAX_DECALS; i++) {
      if (this.active[i]) {
        activeCount++;
        if (this.born[i] < oldestBorn) {
          oldestBorn = this.born[i];
          oldestIdx = i;
        }
      } else if (freeIdx < 0) {
        freeIdx = i;
      }
    }
    if (activeCount >= this.cap || freeIdx < 0) {
      return oldestIdx;
    }
    return freeIdx;
  }

  private addDecal(x: number, z: number, sx: number, sz: number, growSec: number) {
    const idx = this.allocSlot();
    this.active[idx] = 1;
    this.x[idx] = x;
    this.z[idx] = z;
    this.yaw[idx] = Math.random() * Math.PI * 2;
    this.scaleX[idx] = sx;
    this.scaleZ[idx] = sz;
    this.growSeconds[idx] = growSec;
    this.age[idx] = 0;
    this.born[idx] = this.seq++;
    this.dirty = true;
  }

  /**
   * Spawns a main blood pool under the knocked-down pedestrian's head that grows over 3 s,
   * plus 3–5 small droplet decals around it.
   */
  spawnKnockdownBlood(headX: number, headZ: number) {
    const poolRx = 0.58 + Math.random() * 0.18;
    const poolRz = 0.50 + Math.random() * 0.18;
    this.addDecal(headX, headZ, poolRx, poolRz, 3.0);

    const droplets = 3 + ((Math.random() * 3) | 0); // 3 to 5 droplets
    for (let i = 0; i < droplets; i++) {
      const ang = (i / droplets) * Math.PI * 2 + (Math.random() - 0.5) * 0.9;
      const dist = 0.30 + Math.random() * 0.42;
      const dx = headX + Math.sin(ang) * dist;
      const dz = headZ + Math.cos(ang) * dist;
      const dsx = 0.10 + Math.random() * 0.08;
      const dsz = 0.08 + Math.random() * 0.07;
      this.addDecal(dx, dz, dsx, dsz, 0.18);
    }
  }

  update(dt: number) {
    if (!(dt > 0) || !Number.isFinite(dt)) return;
    let writeCount = 0;
    let hadAny = this.mesh.count > 0 || this.dirty;
    for (let i = 0; i < MAX_DECALS; i++) {
      if (!this.active[i]) continue;
      hadAny = true;
      const nextAge = this.age[i] + dt;
      this.age[i] = nextAge;
      if (nextAge >= FADE_SECONDS) {
        this.active[i] = 0;
        continue;
      }
      const growDur = this.growSeconds[i];
      const growT = growDur > 0 ? Math.min(1, nextAge / growDur) : 1;
      const grow = 0.18 + 0.82 * (1 - (1 - growT) * (1 - growT));
      const fadeSpan = Math.max(1, FADE_SECONDS - growDur);
      const shrink = nextAge <= growDur ? 1 : Math.max(0, 1 - (nextAge - growDur) / fadeSpan);
      const factor = grow * shrink;
      if (factor <= 0.005) continue;

      dummyPos.set(this.x[i], DECAL_Y, this.z[i]);
      dummyQuat.setFromAxisAngle(yAxis, this.yaw[i]);
      dummyScale.set(this.scaleX[i] * factor, 1, this.scaleZ[i] * factor);
      dummyMatrix.compose(dummyPos, dummyQuat, dummyScale);
      this.mesh.setMatrixAt(writeCount++, dummyMatrix);
    }
    this.mesh.count = writeCount;
    if (hadAny) {
      this.mesh.instanceMatrix.needsUpdate = true;
      this.dirty = false;
    }
  }

  clear() {
    this.active.fill(0);
    this.mesh.count = 0;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.dirty = false;
  }

  dispose() {
    this.clear();
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}
