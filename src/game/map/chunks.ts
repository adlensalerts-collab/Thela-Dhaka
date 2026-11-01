import * as THREE from 'three';

/**
 * M5 — chunked visibility for a big map. Objects are grouped into square chunks; chunks beyond
 * the view distance are hidden (the haze/fog already hides that range). View distance follows the
 * Sprint 7 quality preset.
 */
export const VIEW_DISTANCE = { low: 170, medium: 230, high: 320, ultra: 420 } as const;

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
  update(camera: THREE.Vector3) {
    const r = this.viewDistance + this.size * 0.71;
    for (const g of this.chunks.values()) {
      const c = g.userData.centre as THREE.Vector2;
      g.visible = (c.x - camera.x) ** 2 + (c.y - camera.z) ** 2 < r * r;
    }
  }

  get count() { return this.chunks.size; }
}
