import * as THREE from 'three';

/**
 * M5 — chunked visibility for a big map. Objects are grouped into square chunks; chunks beyond
 * the view distance are hidden (the haze/fog already hides that range). View distance follows the
 * Sprint 7 quality preset.
 */
// Tighter than before (170/230/320/420): the haze already hides most of that range, and every chunk is draw calls.
export const VIEW_DISTANCE = { low: 130, medium: 180, high: 270, ultra: 360 } as const;

export class ChunkManager {
  readonly root = new THREE.Group();
  private chunks = new Map<string, THREE.Group>();
  private viewDistance: number = VIEW_DISTANCE.high;

  constructor(scene: THREE.Scene, private size = 80) {
    this.root.name = 'district-chunks';
    scene.add(this.root);
  }

  key(x: number, z: number) { return `${Math.floor(x / this.size)},${Math.floor(z / this.size)}`; }

  /** Chunk group for a world position (created on demand). */
  chunkAt(x: number, z: number): THREE.Group {
    const k = this.key(x, z);
    let g = this.chunks.get(k);
    if (!g) {
      g = new THREE.Group();
      const [cx, cz] = k.split(',').map(Number);
      g.userData.centre = new THREE.Vector2((cx + 0.5) * this.size, (cz + 0.5) * this.size);
      g.name = `chunk ${k}`;
      this.root.add(g);
      this.chunks.set(k, g);
    }
    return g;
  }

  setViewDistance(d: number) { this.viewDistance = d; }

  /** Call every frame (cheap: one distance check per chunk). */
  update(camera: THREE.Vector3, forwardX = 0, forwardZ = 0) {
    const half = this.size * 0.71;
    const r = this.viewDistance + half;
    const hasForward = forwardX !== 0 || forwardZ !== 0;
    // Chunks well behind the camera are skipped too (their shadows only matter close by, so keep 90 m of margin).
    const behind = half + 90;
    for (const g of this.chunks.values()) {
      const c = g.userData.centre as THREE.Vector2;
      const dx = c.x - camera.x, dz = c.y - camera.z;
      let show = dx * dx + dz * dz < r * r;
      if (show && hasForward && dx * forwardX + dz * forwardZ < -behind) show = false;
      g.visible = show;
    }
  }

  get count() { return this.chunks.size; }
}
