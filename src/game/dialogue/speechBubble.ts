import * as THREE from 'three';

export type BubbleTone = 'normal' | 'angry' | 'shout';
export type BubbleTextureFactory = (text: string, tone: BubbleTone) => THREE.Texture;

export const BUBBLE_HEIGHT_OFFSET = 2.3;
export const BUBBLE_FADE_SECONDS = 0.4;
export const BUBBLE_MAX_DISTANCE = 28;
export const BUBBLE_DEFAULT_CAPACITY = 8;
export const BUBBLE_LOW_CAPACITY = 4;
export const BUBBLE_CACHE_LIMIT = 48;
export const BUBBLE_RENDER_ORDER = 950;
export const BUBBLE_FONT_STACK = "'Noto Sans Bengali','Hind Siliguri','Kalpurush',sans-serif";

const _ownerPos = new THREE.Vector3();
const _camPos = new THREE.Vector3();

function drawRoundedBubble(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  tailW: number,
  tailH: number
) {
  const midX = x + w * 0.5;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(midX + tailW * 0.5, y + h);
  ctx.lineTo(midX, y + h + tailH);
  ctx.lineTo(midX - tailW * 0.5, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

export function defaultBubbleTexture(text: string, tone: BubbleTone = 'normal'): THREE.Texture {
  if (typeof document === 'undefined') {
    const tex = new THREE.Texture();
    tex.needsUpdate = true;
    return tex;
  }
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 160;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const fill = tone === 'angry' ? '#ffe4e6' : tone === 'shout' ? '#fff7ed' : '#ffffff';
    const stroke = tone === 'angry' ? '#be123c' : tone === 'shout' ? '#c2410c' : '#1e293b';
    const textColor = tone === 'angry' ? '#881337' : '#0f172a';
    const fontSize = tone === 'shout' ? 34 : 28;
    const fontWeight = tone === 'shout' ? '700' : '600';

    drawRoundedBubble(ctx, 16, 12, 480, 112, 22, 26, 22);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.lineWidth = tone === 'shout' ? 5 : 3.5;
    ctx.strokeStyle = stroke;
    ctx.stroke();

    ctx.font = `${fontWeight} ${fontSize}px ${BUBBLE_FONT_STACK}`;
    ctx.fillStyle = textColor;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 256, 68, 448);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

interface BubbleSlot {
  sprite: THREE.Sprite;
  material: THREE.SpriteMaterial;
  owner: THREE.Object3D | null;
  remaining: number;
  seq: number;
  active: boolean;
}

function isObjectVisible(obj: THREE.Object3D): boolean {
  let cur: THREE.Object3D | null = obj;
  while (cur) {
    if (!cur.visible) return false;
    cur = cur.parent;
  }
  return true;
}

export class SpeechBubbles {
  private readonly scene: THREE.Scene;
  private readonly baseCapacity: number;
  private readonly makeTexture: BubbleTextureFactory;
  private readonly slots: BubbleSlot[] = [];
  private readonly textureCache = new Map<string, THREE.Texture>();
  private lowQuality = false;
  private seq = 0;
  private disposed = false;

  constructor(
    scene: THREE.Scene,
    capacity = BUBBLE_DEFAULT_CAPACITY,
    makeTexture: BubbleTextureFactory = defaultBubbleTexture
  ) {
    this.scene = scene;
    this.baseCapacity = Math.max(1, Math.floor(capacity));
    this.makeTexture = makeTexture;
    const poolSize = Math.max(this.baseCapacity, BUBBLE_LOW_CAPACITY);
    for (let i = 0; i < poolSize; i++) {
      const material = new THREE.SpriteMaterial({
        transparent: true,
        opacity: 1,
        depthTest: false,
        depthWrite: false,
      });
      const sprite = new THREE.Sprite(material);
      sprite.renderOrder = BUBBLE_RENDER_ORDER;
      sprite.visible = false;
      sprite.name = `speech-bubble-${i}`;
      this.slots.push({ sprite, material, owner: null, remaining: 0, seq: 0, active: false });
    }
  }

  get capacity(): number {
    return this.lowQuality ? Math.min(BUBBLE_LOW_CAPACITY, this.baseCapacity) : this.baseCapacity;
  }

  private getTexture(text: string, tone: BubbleTone): THREE.Texture {
    const key = `${tone}:${text}`;
    const existing = this.textureCache.get(key);
    if (existing) {
      this.textureCache.delete(key);
      this.textureCache.set(key, existing);
      return existing;
    }
    const created = this.makeTexture(text, tone);
    this.textureCache.set(key, created);
    if (this.textureCache.size > BUBBLE_CACHE_LIMIT) {
      const oldestKey = this.textureCache.keys().next().value;
      if (oldestKey !== undefined) {
        const evicted = this.textureCache.get(oldestKey);
        this.textureCache.delete(oldestKey);
        if (evicted && !this.slots.some((s) => s.active && s.material.map === evicted)) {
          evicted.dispose();
        }
      }
    }
    return created;
  }

  private deactivateSlot(slot: BubbleSlot): void {
    slot.active = false;
    slot.owner = null;
    slot.remaining = 0;
    slot.sprite.visible = false;
    if (slot.sprite.parent) slot.sprite.parent.remove(slot.sprite);
  }

  say(owner: THREE.Object3D, text: string, seconds = 2.8, tone: BubbleTone = 'normal'): void {
    if (this.disposed || !owner || !text || !(seconds > 0) || !Number.isFinite(seconds)) return;
    const limit = this.capacity;
    let chosen: BubbleSlot | null = null;
    let activeCount = 0;
    let oldestActive: BubbleSlot | null = null;

    for (let i = 0; i < this.slots.length; i++) {
      const slot = this.slots[i];
      if (slot.active) {
        if (slot.owner === owner) {
          chosen = slot;
          break;
        }
        activeCount++;
        if (!oldestActive || slot.seq < oldestActive.seq) oldestActive = slot;
      }
    }

    if (!chosen) {
      if (activeCount < limit) {
        for (let i = 0; i < this.slots.length; i++) {
          if (!this.slots[i].active) {
            chosen = this.slots[i];
            break;
          }
        }
      } else {
        chosen = oldestActive;
      }
    }
    if (!chosen) return;

    const texture = this.getTexture(text, tone);
    chosen.owner = owner;
    chosen.remaining = seconds;
    chosen.seq = ++this.seq;
    chosen.active = true;
    chosen.material.map = texture;
    chosen.material.opacity = 1;
    chosen.material.needsUpdate = true;
    chosen.sprite.scale.set(tone === 'shout' ? 2.2 : 1.9, tone === 'shout' ? 0.72 : 0.62, 1);

    owner.getWorldPosition(_ownerPos);
    chosen.sprite.position.set(_ownerPos.x, _ownerPos.y + BUBBLE_HEIGHT_OFFSET, _ownerPos.z);
    chosen.sprite.visible = isObjectVisible(owner);
    if (!chosen.sprite.parent) this.scene.add(chosen.sprite);
  }

  update(dt: number, camera: THREE.Object3D | THREE.Vector3): void {
    if (this.disposed || !Number.isFinite(dt) || dt < 0) return;
    if ('getWorldPosition' in camera && typeof camera.getWorldPosition === 'function') {
      camera.getWorldPosition(_camPos);
    } else {
      _camPos.copy(camera as THREE.Vector3);
    }

    for (let i = 0; i < this.slots.length; i++) {
      const slot = this.slots[i];
      if (!slot.active) continue;
      if (dt > 0) slot.remaining -= dt;
      if (!slot.owner || slot.remaining <= 1e-6) {
        this.deactivateSlot(slot);
        continue;
      }
      slot.owner.getWorldPosition(_ownerPos);
      slot.sprite.position.set(_ownerPos.x, _ownerPos.y + BUBBLE_HEIGHT_OFFSET, _ownerPos.z);
      if (!isObjectVisible(slot.owner) || _ownerPos.distanceTo(_camPos) > BUBBLE_MAX_DISTANCE) {
        slot.sprite.visible = false;
      } else {
        slot.sprite.visible = true;
        slot.material.opacity =
          slot.remaining < BUBBLE_FADE_SECONDS ? Math.max(0, slot.remaining / BUBBLE_FADE_SECONDS) : 1;
      }
    }
  }

  setLowQuality(on: boolean): void {
    this.lowQuality = on;
    const limit = this.capacity;
    while (true) {
      let activeCount = 0;
      let oldest: BubbleSlot | null = null;
      for (let i = 0; i < this.slots.length; i++) {
        const s = this.slots[i];
        if (s.active) {
          activeCount++;
          if (!oldest || s.seq < oldest.seq) oldest = s;
        }
      }
      if (activeCount <= limit || !oldest) break;
      this.deactivateSlot(oldest);
    }
  }

  clear(): void {
    for (let i = 0; i < this.slots.length; i++) this.deactivateSlot(this.slots[i]);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.clear();
    for (const tex of this.textureCache.values()) tex.dispose();
    this.textureCache.clear();
    for (let i = 0; i < this.slots.length; i++) this.slots[i].material.dispose();
  }
}
