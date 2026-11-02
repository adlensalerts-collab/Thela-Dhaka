import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const CELL_WIDTH = 512;
const CELL_HEIGHT = 128;
const COLUMNS = 4;
const ROWS = 16;
const CAPACITY = COLUMNS * ROWS;
const GUTTER = 4;

interface Sign {
  chunk: THREE.Group;
  matrix: THREE.Matrix4;
  slot: number;
}

/** Sprint 8A: shared sign textures and one merged sign mesh per chunk/atlas page.
 * Keeps the original box shape, placement, Bengali lettering and emissive lighting.
 * Collect first, then allocate only the atlas pages actually needed by this district.
 */
export class SignboardBatch {
  private signs: Sign[] = [];
  private labels: Array<{ text: string; background: string }> = [];
  private slots = new Map<string, number>();

  add(chunk: THREE.Group, matrix: THREE.Matrix4, text: string, background: string) {
    const key = JSON.stringify([text, background]);
    let slot = this.slots.get(key);
    if (slot === undefined) {
      slot = this.labels.length;
      this.slots.set(key, slot);
      this.labels.push({ text, background });
    }
    this.signs.push({ chunk, matrix: matrix.clone(), slot });
  }

  build() {
    let batches = 0, texturePixels = 0;
    const pages = Math.ceil(this.labels.length / CAPACITY);
    const box = new THREE.BoxGeometry(1, 1, 1);
    for (let page = 0; page < pages; page++) {
      const start = page * CAPACITY;
      const labels = this.labels.slice(start, start + CAPACITY);
      const canvas = document.createElement('canvas');
      canvas.width = COLUMNS * CELL_WIDTH;
      canvas.height = THREE.MathUtils.ceilPowerOfTwo(Math.ceil(labels.length / COLUMNS) * CELL_HEIGHT);
      const ctx = canvas.getContext('2d')!;
      // Draw each board at its original resolution, then pad its atlas cell. Padding
      // prevents neighbouring signs bleeding into the lettering under filtering.
      const tile = document.createElement('canvas');
      tile.width = CELL_WIDTH; tile.height = CELL_HEIGHT;
      const ink = tile.getContext('2d')!;
      labels.forEach(({ text, background }, index) => {
        const x = (index % COLUMNS) * CELL_WIDTH;
        const y = Math.floor(index / COLUMNS) * CELL_HEIGHT;
        const gradient = ink.createLinearGradient(0, 0, 0, CELL_HEIGHT);
        gradient.addColorStop(0, background); gradient.addColorStop(1, '#0d1a18');
        ink.fillStyle = gradient; ink.fillRect(0, 0, CELL_WIDTH, CELL_HEIGHT);
        ink.strokeStyle = 'rgba(255,255,255,0.6)'; ink.lineWidth = 6;
        ink.strokeRect(6, 6, 500, 116);
        ink.fillStyle = '#fff6dc';
        ink.font = 'bold 64px "Hind Siliguri", "Noto Sans Bengali", sans-serif';
        ink.textAlign = 'center'; ink.textBaseline = 'middle';
        ink.fillText(text, 256, 68, 480);
        ctx.drawImage(tile, x + GUTTER, y + GUTTER, CELL_WIDTH - 2 * GUTTER, CELL_HEIGHT - 2 * GUTTER);
        // Extend border texels into every gutter, including the four corners.
        const left = x + GUTTER, top = y + GUTTER;
        const width = CELL_WIDTH - 2 * GUTTER, height = CELL_HEIGHT - 2 * GUTTER;
        ctx.drawImage(canvas, left, top, 1, height, x, top, GUTTER, height);
        ctx.drawImage(canvas, left + width - 1, top, 1, height, left + width, top, GUTTER, height);
        ctx.drawImage(canvas, x, top, CELL_WIDTH, 1, x, y, CELL_WIDTH, GUTTER);
        ctx.drawImage(canvas, x, top + height - 1, CELL_WIDTH, 1, x, top + height, CELL_WIDTH, GUTTER);
      });
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = 4;
      const material = new THREE.MeshStandardMaterial({
        map: texture, emissive: '#ffffff', emissiveMap: texture,
        emissiveIntensity: 0.35, roughness: 0.5
      });
      texturePixels += canvas.width * canvas.height;
      const chunks = new Map<THREE.Group, THREE.BufferGeometry[]>();
      for (const sign of this.signs) {
        if (Math.floor(sign.slot / CAPACITY) !== page) continue;
        const index = sign.slot - start;
        const x = (index % COLUMNS) * CELL_WIDTH;
        const y = Math.floor(index / COLUMNS) * CELL_HEIGHT;
        const geometry = box.clone().applyMatrix4(sign.matrix);
        const uv = geometry.getAttribute('uv');
        for (let i = 0; i < uv.count; i++) {
          // CanvasTexture flips Y on upload: top-left canvas cell -> top-left UV tile.
          uv.setXY(i,
            (x + GUTTER + 0.5 + uv.getX(i) * (CELL_WIDTH - 2 * GUTTER - 1)) / canvas.width,
            1 - (y + GUTTER + 0.5 + (1 - uv.getY(i)) * (CELL_HEIGHT - 2 * GUTTER - 1)) / canvas.height);
        }
        if (!chunks.has(sign.chunk)) chunks.set(sign.chunk, []);
        chunks.get(sign.chunk)!.push(geometry);
      }
      for (const [chunk, geometries] of chunks) {
        const geometry = mergeGeometries(geometries, false);
        geometries.forEach((g) => g.dispose());
        if (!geometry) throw new Error('Signboard geometry could not be merged');
        geometry.computeBoundingSphere();
        const mesh = new THREE.Mesh(geometry, material);
        mesh.name = 'district-shop-signs';
        mesh.userData.signCount = geometries.length;
        mesh.receiveShadow = false; mesh.castShadow = false;
        chunk.add(mesh); batches++;
      }
    }
    box.dispose();
    const signs = this.signs.length;
    this.signs = []; this.labels = []; this.slots.clear();
    return { signs, batches, atlasPages: pages, texturePixels };
  }
}
