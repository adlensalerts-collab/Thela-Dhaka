import * as THREE from 'three';
import { loadAnimatedCharacter, type AnimatedCharacter, type CharacterMotion } from './animatedCharacter';
import type { HumanRig, HumanOptions } from './humans';

let warned = false;

/** Keep a procedural rig usable until its independent clothed skeletal visual is ready. */
export class CharacterVisual {
  actor?: AnimatedCharacter;
  readonly ready: Promise<void>;
  disposed = false;
  failed = false;
  active = true;
  pushing = false;
  gripError = 0;
  private readonly fallback: THREE.Object3D[];
  private readonly targets = [new THREE.Vector3(), new THREE.Vector3()];
  private readonly poles = [new THREE.Vector3(), new THREE.Vector3()];

  constructor(private rig: HumanRig, options: HumanOptions) {
    this.fallback = [rig.body, rig.leftLeg, rig.rightLeg];
    this.pushing = !options.compact && options.outfit === 'lungi';
    this.ready = loadAnimatedCharacter({ height: 1.68, appearance: {
      outfit: options.outfit ?? 'shirt', shirt: options.shirt, bottom: options.bottom,
      skin: options.skin, hair: options.hair, cap: options.cap, bag: options.bag,
      gamchha: options.gamchha, beard: options.beard
    } }).then((actor) => {
      if (this.disposed) { actor.dispose(); return; }
      this.actor = actor;
      this.rig.group.add(actor.group);
      if (this.pushing) {
        actor.setMotion('push', 0); actor.mixer.update(0.2);
        this.alignHands();
      }
      this.setActive(this.active);
    }).catch((error) => {
      if (this.disposed) return;
      this.failed = true; this.showFallback(true);
      if (!warned) { warned = true; console.warn('[characters] Using procedural fallback:', error); }
    });
  }

  private showFallback(visible: boolean) { this.fallback.forEach((object) => { object.visible = visible; }); }

  setActive(active: boolean) {
    this.active = active;
    if (this.actor) this.actor.group.visible = active;
    this.showFallback(!active || !this.actor || this.failed);
  }

  setPushing(pushing: boolean) { this.pushing = pushing; }

  private alignHands() {
    if (!this.actor) return;
    const parent = this.rig.group.parent;
    if (!parent) return;
    parent.updateWorldMatrix(true, false);
    this.targets[0].set(-0.55, 1.05, -0.48).applyMatrix4(parent.matrixWorld);
    this.targets[1].set(0.55, 1.05, -0.48).applyMatrix4(parent.matrixWorld);
    this.poles[0].set(-0.9, 0.85, 0.05).applyMatrix4(parent.matrixWorld);
    this.poles[1].set(0.9, 0.85, 0.05).applyMatrix4(parent.matrixWorld);
    this.gripError = this.actor.fitHands(this.targets, this.poles);
  }

  update(dt: number, intensity: number, pushing = this.pushing) {
    this.pushing = pushing;
    if (this.disposed || !this.actor || !this.active || this.rig.group.parent?.visible === false) return;
    const speed = THREE.MathUtils.clamp(intensity, 0, 1) * 5;
    let motion: CharacterMotion = speed < 0.12 ? 'idle' : speed < 1.9 ? 'walk' : speed < 3.8 ? 'jog' : 'sprint';
    let rate = speed / (motion === 'walk' ? 1.4 : motion === 'jog' ? 3 : 5);
    if (pushing) { motion = 'push'; rate = speed < 0.12 ? 0 : speed / 2.2; }
    else if (motion === 'idle') rate = 1;
    this.actor.setMotion(motion, rate);
    this.actor.update(dt);
    if (pushing) this.alignHands();
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true; this.actor?.dispose(); this.actor = undefined; this.showFallback(true);
  }
}

interface CrowdPerson {
  mesh: THREE.Group;
  speed: number;
  state: string;
  isEngagedInSale: boolean;
}

/** Near-crowd skeletal budget. Distant NPCs retain the existing compact rig and behaviour. */
export class CrowdCharacterLOD {
  private selected = new Map<CrowdPerson, CharacterVisual>();
  private positions = new Map<CrowdPerson, THREE.Vector2>();
  private elapsed = 1;
  private lastQuality = '';
  private destroyed = false;
  readonly budgets = { low: 0, medium: 2, high: 4, ultra: 6 } as const;

  get detailedCount() { return this.selected.size; }

  update(people: CrowdPerson[], camera: THREE.Vector3, quality: keyof CrowdCharacterLOD['budgets'], dt: number) {
    if (this.destroyed) return;
    this.elapsed += dt;
    if (this.elapsed >= 0.25 || quality !== this.lastQuality) {
      this.elapsed = 0; this.lastQuality = quality;
      const radius = quality === 'medium' ? 12 : quality === 'high' ? 18 : 22;
      const candidates = people.filter((p) => p.mesh.visible && ['walking', 'idle', 'browsing'].includes(p.state))
        .map((person) => ({ person, distance: Math.hypot(person.mesh.position.x - camera.x, person.mesh.position.z - camera.z) }))
        .filter(({ person, distance }) => distance < radius + (this.selected.has(person) ? 3 : 0))
        .sort((a, b) => (a.distance - (this.selected.has(a.person) ? 3 : 0)) - (b.distance - (this.selected.has(b.person) ? 3 : 0)))
        .slice(0, this.budgets[quality]);
      const wanted = new Set(candidates.map((entry) => entry.person));
      for (const [person, visual] of this.selected) {
        if (!wanted.has(person)) { visual.dispose(); this.selected.delete(person); this.positions.delete(person); }
      }
      for (const { person } of candidates) {
        if (this.selected.has(person)) continue;
        const rig = person.mesh.userData.humanRig as HumanRig | undefined;
        const options = person.mesh.userData.humanOptions as HumanOptions | undefined;
        if (rig && options) this.selected.set(person, new CharacterVisual(rig, options));
      }
    }
    for (const [person, visual] of this.selected) {
      if (!person.mesh.visible) continue;
      const previous = this.positions.get(person);
      const displacement = previous ? Math.hypot(person.mesh.position.x - previous.x, person.mesh.position.z - previous.y) : 0;
      const speed = previous && dt > 0 ? (displacement < 2 ? displacement / dt : 0) : person.speed;
      this.positions.set(person, new THREE.Vector2(person.mesh.position.x, person.mesh.position.z));
      visual.update(dt, person.state === 'walking' && !person.isEngagedInSale ? Math.min(1, speed / 5) : 0, false);
    }
  }

  dispose() {
    this.destroyed = true;
    for (const visual of this.selected.values()) visual.dispose();
    this.selected.clear(); this.positions.clear();
  }
}
