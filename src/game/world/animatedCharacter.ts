import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';

export const CHARACTER_MOTIONS = ['idle', 'walk', 'jog', 'sprint', 'push'] as const;
export type CharacterMotion = typeof CHARACTER_MOTIONS[number];
export const CHARACTER_MODEL_URL = `${import.meta.env.BASE_URL}assets/characters/locomotion-prototype.glb`;
const models = new Map<string, Promise<GLTF>>();

export interface AnimatedCharacter {
  group: THREE.Group;
  mixer: THREE.AnimationMixer;
  setMotion(motion: CharacterMotion, playbackRate?: number): void;
  update(dt: number): void;
  dispose(): void;
}

/** Sprint 9A prototype, isolated from createHumanRig until outfits and cart pose are approved.
 * One cached asset request; each clone owns its bones, mixer, materials and GPU bone textures.
 * Geometry belongs to the cached template and is intentionally shared between actors.
 */
export async function loadAnimatedCharacter(options: { url?: string; height?: number; color?: string } = {}): Promise<AnimatedCharacter> {
  const url = options.url ?? CHARACTER_MODEL_URL;
  const height = options.height ?? 1.98;
  if (!Number.isFinite(height) || height <= 0) throw new Error('Character height must be positive');
  let model = models.get(url);
  if (!model) {
    model = new GLTFLoader().loadAsync(url).catch((error) => {
      models.delete(url); // A failed request must not poison subsequent retries.
      throw error;
    });
    models.set(url, model);
  }
  const template = await model;
  const clips = new Map(template.animations.map((clip) => [clip.name, clip]));
  for (const motion of CHARACTER_MOTIONS) {
    if (!clips.has(motion)) throw new Error(`Character model is missing the ${motion} clip`);
  }
  const content = clone(template.scene);
  const materials = new Set<THREE.Material>();
  content.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    const own = (material: THREE.Material) => {
      const copy = material.clone();
      if (options.color && copy.name === 'M_Main' && copy instanceof THREE.MeshStandardMaterial) copy.color.set(options.color);
      materials.add(copy);
      return copy;
    };
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(own) : own(mesh.material);
    mesh.castShadow = true; mesh.receiveShadow = true;
  });
  content.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(content);
  const size = bounds.getSize(new THREE.Vector3());
  if (!Number.isFinite(size.y) || size.y <= 0) {
    materials.forEach((material) => material.dispose());
    throw new Error('Character model has invalid bounds');
  }
  const centre = bounds.getCenter(new THREE.Vector3());
  content.position.sub(new THREE.Vector3(centre.x, bounds.min.y, centre.z));
  const group = new THREE.Group();
  group.name = 'animated-character-prototype';
  const scaleRoot = new THREE.Group();
  scaleRoot.scale.setScalar(height / size.y);
  scaleRoot.add(content); group.add(scaleRoot);
  const mixer = new THREE.AnimationMixer(content);
  const actions = new Map<CharacterMotion, THREE.AnimationAction>();
  for (const motion of CHARACTER_MOTIONS) {
    const action = mixer.clipAction(clips.get(motion)!);
    action.setLoop(THREE.LoopRepeat, Infinity);
    actions.set(motion, action);
  }
  let current: CharacterMotion = 'idle';
  let disposed = false;
  actions.get(current)!.play();
  return {
    group, mixer,
    setMotion(motion, playbackRate = 1) {
      if (disposed) return;
      const next = actions.get(motion);
      if (!next) throw new Error(`Unknown character motion: ${motion}`);
      if (!Number.isFinite(playbackRate) || playbackRate <= 0) throw new Error('Playback rate must be positive');
      next.setEffectiveTimeScale(THREE.MathUtils.clamp(playbackRate, 0.1, 3));
      if (motion === current) return;
      const previous = actions.get(current)!;
      next.reset().setEffectiveWeight(1).play();
      previous.crossFadeTo(next, 0.18, false);
      current = motion;
    },
    update(dt) {
      if (disposed || !Number.isFinite(dt) || dt <= 0) return;
      mixer.update(Math.min(dt, 0.1));
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      mixer.stopAllAction(); mixer.uncacheRoot(content);
      const skeletons = new Set<THREE.Skeleton>();
      content.traverse((object) => {
        const mesh = object as THREE.SkinnedMesh;
        if (mesh.isSkinnedMesh) skeletons.add(mesh.skeleton);
      });
      skeletons.forEach((skeleton) => skeleton.dispose());
      materials.forEach((material) => material.dispose());
      group.removeFromParent(); group.clear();
    }
  };
}
