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
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setPixelRatio(1); // Preview follows the game's 1080p cap, including high-DPI screens.
  stage.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#17252e');
  const camera = new THREE.PerspectiveCamera(38, 1, 0.05, 60);
  camera.position.set(-5.2, 3.1, -7.5);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 1, 0);
  controls.enableDamping = true; controls.minDistance = 2.4; controls.maxDistance = 12;
  scene.add(new THREE.HemisphereLight('#f1f3e8', '#445352', 2));
  const sun = new THREE.DirectionalLight('#ffe4b6', 2.6); sun.position.set(3, 7, 4); sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6, near: 0.1, far: 20 });
  sun.shadow.normalBias = 0.02; scene.add(sun);
  const floorGeometry = new THREE.CircleGeometry(6, 64);
  const floorMaterial = new THREE.MeshStandardMaterial({ color: '#334344', roughness: 1 });
  const floor = new THREE.Mesh(floorGeometry, floorMaterial);
  floor.rotation.x = -Math.PI / 2; floor.position.y = -0.01; floor.receiveShadow = true; scene.add(floor);
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
    actors.push(await loadAnimatedCharacter({ appearance: { outfit: 'lungi', shirt: '#e5ddc7', bottom: '#2d6882', skin: '#9c6644', gamchha: true } }));
    if (disposed) { actors.forEach((actor) => actor.dispose()); return; }
    actors.push(await loadAnimatedCharacter({ appearance: { outfit: 'police', skin: '#8d5a3b' } }));
    if (disposed) { actors.forEach((actor) => actor.dispose()); return; }
    actors.push(await loadAnimatedCharacter({ appearance: { outfit: 'kurta', shirt: '#d3d8ca', bottom: '#e7e2d4', skin: '#a8704a', cap: true, beard: true } }));
    if (disposed) { actors.forEach((actor) => actor.dispose()); return; }
    actors[0].group.position.x = -2; actors[1].group.position.x = 0; actors[2].group.position.x = 2;
    const cart = new THREE.Group(); cart.position.x = -2; scene.add(cart);
    const wood = new THREE.MeshStandardMaterial({ color: '#87643e', roughness: 1 });
    const iron = new THREE.MeshStandardMaterial({ color: '#404a43', roughness: 0.8 });
    const cartParts: THREE.Mesh[] = [];
    const block = (x: number, y: number, z: number, width: number, height: number, depth: number, material: THREE.Material) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material); mesh.position.set(x, y, z); cart.add(mesh); cartParts.push(mesh);
    };
    block(0, 0.85, -1.35, 1.75, 0.2, 1.75, wood);
    for (const x of [-0.55, 0.55]) block(x, 1.05, -0.48, 0.09, 0.14, 1.45, iron);
    cart.visible = false;
    window.addEventListener('pagehide', () => { cartParts.forEach((mesh) => mesh.geometry.dispose()); wood.dispose(); iron.dispose(); }, { once: true });
    const grip = document.querySelector<HTMLInputElement>('#grip')!;
    const targets = [new THREE.Vector3(-2.55, 1.05, -0.48), new THREE.Vector3(-1.45, 1.05, -0.48)];
    const poles = [new THREE.Vector3(-2.9, 0.85, 0.05), new THREE.Vector3(-1.1, 0.85, 0.05)];
    actors.forEach((actor) => scene.add(actor.group));
    const select = (motion: CharacterMotion) => {
      selected = motion;
      actors.forEach((actor, index) => actor.setMotion(index === 0 && grip.checked ? 'push' : motion, playbackRate));
      buttons.forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.motion === motion)));
      status.textContent = `${motion[0].toUpperCase() + motion.slice(1)} · vendor, police and civilian · local skeletal rig`;
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
    grip.addEventListener('change', () => { cart.visible = grip.checked; actors[0].setMotion(grip.checked ? 'push' : selected, playbackRate); });
    const animate = (now: number) => {
      if (disposed) return;
      frame = requestAnimationFrame(animate);
      if (last && now - last < 1000 / 60 - 0.5) return;
      const dt = last ? Math.min((now - last) / 1000, 0.1) : 0;
      last = now;
      if (document.hidden) return;
      if (grip.checked) actors[0].setMotion('push', playbackRate);
      actors.forEach((actor) => actor.update(dt));
      if (grip.checked) {
        const error = actors[0].fitHands(targets, poles);
        status.textContent = `Cart grip check · maximum hand error ${(error * 100).toFixed(1)} cm`;
      }
      controls.update(); renderer.render(scene, camera);
    };
    frame = requestAnimationFrame(animate);
  } catch (error) {
    actors.forEach((actor) => actor.dispose()); actors = [];
    status.textContent = `Character preview could not load: ${error instanceof Error ? error.message : String(error)}`;
    renderer.render(scene, camera);
  }
}

start().catch((error) => { status.textContent = `Preview unavailable: ${String(error)}`; });
