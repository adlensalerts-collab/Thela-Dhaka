import * as THREE from 'three';

/**
 * Sprint 4 — circular sale timer floating above the vendor's head.
 *
 * A camera-facing sprite: a ring that fills clockwise as the sale progresses,
 * seconds left in the middle, and the product / price underneath. Always drawn on top
 * of the scene so buildings or the cart never hide it. The canvas is only redrawn
 * when the visible value changes (~10x per second), so it costs almost nothing.
 *
 * Usage (simulation.ts):
 *   this.saleIndicator = new SaleIndicator(this.scene);
 *   // every frame:
 *   this.saleIndicator.update(this.human.position, sale ? {...} : null, dt);
 */
export interface SaleProgress {
  progress: number;      // 0..1
  secondsLeft: number;
  label?: string;        // e.g. product name
  price?: number;        // taka
}

const SIZE = 256;
const HEIGHT_ABOVE = 3.0;  // world units above the vendor's feet: just over a 2.1 m figure

export class SaleIndicator {
  readonly sprite: THREE.Sprite;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private texture: THREE.CanvasTexture;
  private lastKey = '';
  private visibleAmount = 0; // fades in/out

  constructor(scene: THREE.Scene) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = SIZE;
    this.canvas.height = SIZE;
    this.ctx = this.canvas.getContext('2d')!;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.SpriteMaterial({ map: this.texture, depthTest: false, depthWrite: false, transparent: true, fog: false });
    this.sprite = new THREE.Sprite(mat);
    this.sprite.scale.set(1.7, 1.7, 1);
    this.sprite.renderOrder = 999;
    this.sprite.visible = false;
    scene.add(this.sprite);
  }

  update(anchor: THREE.Vector3, sale: SaleProgress | null, dt: number) {
    const target = sale ? 1 : 0;
    this.visibleAmount = THREE.MathUtils.damp(this.visibleAmount, target, 12, dt);
    const mat = this.sprite.material as THREE.SpriteMaterial;
    mat.opacity = this.visibleAmount;
    this.sprite.visible = this.visibleAmount > 0.02;
    if (!this.sprite.visible) { this.lastKey = ''; return; }

    // Small bob so it reads as "alive"
    const bob = Math.sin(performance.now() * 0.004) * 0.06;
    this.sprite.position.set(anchor.x, anchor.y + HEIGHT_ABOVE + bob, anchor.z);
    const pop = 0.85 + 0.15 * this.visibleAmount;
    this.sprite.scale.set(1.7 * pop, 1.7 * pop, 1);

    if (sale) this.draw(sale);
  }

  private draw(s: SaleProgress) {
    const p = THREE.MathUtils.clamp(s.progress, 0, 1);
    const key = `${Math.round(p * 120)}|${Math.ceil(s.secondsLeft)}|${s.label ?? ''}|${s.price ?? ''}`;
    if (key === this.lastKey) return;
    this.lastKey = key;

    const g = this.ctx, c = SIZE / 2, R = 78;
    g.clearRect(0, 0, SIZE, SIZE);

    // Backing disc
    g.beginPath(); g.arc(c, c - 14, R + 16, 0, Math.PI * 2);
    g.fillStyle = 'rgba(10, 22, 20, 0.72)'; g.fill();

    // Track
    g.lineWidth = 16; g.lineCap = 'round';
    g.beginPath(); g.arc(c, c - 14, R, 0, Math.PI * 2);
    g.strokeStyle = 'rgba(255,255,255,0.15)'; g.stroke();

    // Progress: amber -> teal as it completes
    const col = p < 0.5 ? '#f2c45d' : p < 0.85 ? '#7fd1a8' : '#2fd39a';
    g.beginPath(); g.arc(c, c - 14, R, -Math.PI / 2, -Math.PI / 2 + p * Math.PI * 2);
    g.strokeStyle = col; g.stroke();

    // Seconds left
    g.fillStyle = '#ffffff';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = 'bold 64px Poppins, "Hind Siliguri", sans-serif';
    g.fillText(`${Math.max(0, Math.ceil(s.secondsLeft))}`, c, c - 22);
    g.font = '600 20px Poppins, "Hind Siliguri", sans-serif';
    g.fillStyle = 'rgba(255,255,255,0.75)';
    g.fillText('sec', c, c + 18);

    // Product / price pill under the ring
    const text = [s.label, s.price != null ? `৳${s.price}` : ''].filter(Boolean).join(' · ');
    if (text) {
      g.font = 'bold 22px Poppins, "Hind Siliguri", sans-serif';
      const w = Math.min(SIZE - 8, g.measureText(text).width + 28);
      g.fillStyle = 'rgba(10, 22, 20, 0.82)';
      g.beginPath();
      g.roundRect(c - w / 2, SIZE - 46, w, 36, 18);
      g.fill();
      g.fillStyle = '#f2c45d';
      g.fillText(text, c, SIZE - 28);
    }
    this.texture.needsUpdate = true;
  }

  dispose() {
    this.sprite.removeFromParent();
    this.texture.dispose();
    (this.sprite.material as THREE.Material).dispose();
  }
}
