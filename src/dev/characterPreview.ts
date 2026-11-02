import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CHARACTER_MOTIONS, loadAnimatedCharacter, type CharacterMotion, type AnimatedCharacter } from '../game/world/animatedCharacter';

const stage = document.querySelector<HTMLDivElement>('#stage')!;
const status = document.querySelector<HTMLParagraphElement>('#status')!;
const buttons = [...document.querySelectorAll<HTMLButtonElement>('[data-motion]')];
const speedInput = document.querySelector<HTMLInputElement>('#speed')!;
const speedLabel = document.querySelector<HTMLOutputElement>('#speed-value')!;
let actors: AnimatedCharacter[] = [];
let selected: CharacterMotion = 'idle';
let playbackRate = 1;
let frame = 0;
let last = 0;
let disposed = false;

async function start() {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setPixelRatio(1); // Preview follows the game's 1080p cap, including high-DPI screens.
  stage.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#17252e');
  const camera = new THREE.PerspectiveCamera(38, 1, 0.05, 60);
  camera.position.set(4.1, 2.8, 6.5);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 1, 0);
  controls.enableDamping = true; controls.minDistance = 2.4; controls.maxDistance = 12;
  scene.add(new THREE.HemisphereLight('#f1f3e8', '#445352', 2));
  const sun = new THREE.DirectionalLight('#ffe4b6', 2.6); sun.position.set(3, 7, 4); scene.add(sun);
  const floorGeometry = new THREE.CircleGeometry(4, 64);
  const floorMaterial = new THREE.MeshStandardMaterial({ color: '#334344', roughness: 1 });
  const floor = new THREE.Mesh(floorGeometry, floorMaterial);
  floor.rotation.x = -Math.PI / 2; floor.position.y = -0.01; scene.add(floor);
  const resize = new ResizeObserver(() => {
    const width = Math.max(1, stage.clientWidth), height = Math.max(1, stage.clientHeight);
    const factor = Math.min(1, 1920 / width, 1080 / height);
    renderer.setSize(Math.round(width * factor), Math.round(height * factor), false);
    camera.aspect = width / height; camera.updateProjectionMatrix();
  });
  resize.observe(stage);
  const shutdown = () => {
    disposed = true; cancelAnimationFrame(frame); resize.disconnect(); controls.dispose();
    actors.forEach((actor) => actor.dispose()); actors = [];
    floorGeometry.dispose(); floorMaterial.dispose(); renderer.dispose();
  };
  window.addEventListener('pagehide', shutdown, { once: true });
  try {
    // Sequential creation reuses the cached model and avoids half-owned actors on failure.
    actors.push(await loadAnimatedCharacter({ color: '#4e809b' }));
    if (disposed) { actors.forEach((actor) => actor.dispose()); return; }
    actors.push(await loadAnimatedCharacter({ color: '#b98a55' }));
    if (disposed) { actors.forEach((actor) => actor.dispose()); return; }
    actors[0].group.position.x = -1.05; actors[1].group.position.x = 1.05;
    actors.forEach((actor) => scene.add(actor.group));
    const select = (motion: CharacterMotion) => {
      selected = motion;
      actors.forEach((actor) => actor.setMotion(motion, playbackRate));
      buttons.forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.motion === motion)));
      status.textContent = `${motion[0].toUpperCase() + motion.slice(1)} · two independent skeletons · local GLB`;
    };
    for (const button of buttons) {
      button.disabled = false;
      button.addEventListener('click', () => {
        const motion = button.dataset.motion as CharacterMotion;
        if (CHARACTER_MOTIONS.includes(motion)) select(motion);
      });
    }
    speedInput.addEventListener('input', () => {
      playbackRate = Number(speedInput.value); speedLabel.value = `${playbackRate}×`; select(selected);
    });
    select('idle');
    const animate = (now: number) => {
      if (disposed) return;
      frame = requestAnimationFrame(animate);
      if (last && now - last < 1000 / 60 - 0.5) return;
      const dt = last ? Math.min((now - last) / 1000, 0.1) : 0;
      last = now;
      if (document.hidden) return;
      actors.forEach((actor) => actor.update(dt)); controls.update(); renderer.render(scene, camera);
    };
    frame = requestAnimationFrame(animate);
  } catch (error) {
    actors.forEach((actor) => actor.dispose()); actors = [];
    status.textContent = `Character preview could not load: ${error instanceof Error ? error.message : String(error)}`;
    renderer.render(scene, camera);
  }
}

start().catch((error) => { status.textContent = `Preview unavailable: ${String(error)}`; });
