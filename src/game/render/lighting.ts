import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';

/**
 * Sprint 3 — smart scene lighting.
 *  - Physical sky (Preetham model) for the background.
 *  - The same sky baked through PMREM into scene.environment → image-based lighting,
 *    so every PBR material gets correct ambient light and reflections.
 *  - One shadow-casting sun whose shadow camera follows the player, so shadows are crisp
 *    (a tight 70×70 box instead of one 250×250 box stretched over the whole map).
 *  - Hazy Dhaka afternoon fog matched to the horizon colour.
 *
 * Replaces initLights(). Call update(playerPosition, cameraPosition) once per frame.
 */
export interface LightingRig {
  sun: THREE.DirectionalLight;
  sky: Sky;
  update(target: THREE.Vector3, camera: THREE.Vector3): void;
  setTimeOfDay(elevationDeg: number, azimuthDeg?: number): void;
  dispose(): void;
}

export function setupRealisticLighting(renderer: THREE.WebGLRenderer, scene: THREE.Scene): LightingRig {
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.85;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  // Sky dome — kept inside the camera far plane (470).
  const sky = new Sky();
  sky.scale.setScalar(400);
  const u = sky.material.uniforms;
  u['turbidity'].value = 8;          // Dhaka haze
  u['rayleigh'].value = 1.6;
  u['mieCoefficient'].value = 0.006;
  u['mieDirectionalG'].value = 0.82;
  scene.add(sky);
  scene.background = null;

  const sun = new THREE.DirectionalLight(0xfff1dc, 3.0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const S = 35;
  Object.assign(sun.shadow.camera, { left: -S, right: S, top: S, bottom: -S, near: 1, far: 260 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.04;
  scene.add(sun, sun.target);

  // Gentle bounce light from warm ground; the environment map does most of the ambient work.
  const fill = new THREE.HemisphereLight(0xdfe9ff, 0x8a7458, 0.35);
  scene.add(fill);

  scene.fog = new THREE.FogExp2('#cdd3cc', 0.0055);

  const pmrem = new THREE.PMREMGenerator(renderer);
  let envRT: THREE.WebGLRenderTarget | null = null;
  const sunDir = new THREE.Vector3();

  const bakeEnvironment = () => {
    const envScene = new THREE.Scene();
    const envSky = new Sky();
    envSky.scale.setScalar(10);
    for (const k of Object.keys(u)) envSky.material.uniforms[k].value = u[k].value;
    envScene.add(envSky);
    envRT?.dispose();
    envRT = pmrem.fromScene(envScene, 0, 0.1, 100);
    scene.environment = envRT.texture;
    scene.environmentIntensity = 0.9;
  };

  const setTimeOfDay = (elevationDeg: number, azimuthDeg = 215) => {
    const phi = THREE.MathUtils.degToRad(90 - elevationDeg);
    const theta = THREE.MathUtils.degToRad(azimuthDeg);
    sunDir.setFromSphericalCoords(1, phi, theta);
    u['sunPosition'].value.copy(sunDir);
    // Warmer, dimmer sun near the horizon
    const t = THREE.MathUtils.clamp(elevationDeg / 60, 0, 1);
    sun.color.setRGB(1, 0.78 + 0.2 * t, 0.6 + 0.35 * t);
    sun.intensity = 1.2 + 2.0 * t;
    bakeEnvironment();
  };

  setTimeOfDay(38); // mid-afternoon

  const update = (target: THREE.Vector3, camera: THREE.Vector3) => {
    sky.position.copy(camera);
    // Snap the shadow camera to texel-sized steps to stop shadow shimmering while moving.
    const texel = (2 * S) / sun.shadow.mapSize.x;
    const tx = Math.round(target.x / texel) * texel;
    const tz = Math.round(target.z / texel) * texel;
    sun.target.position.set(tx, 0, tz);
    sun.position.set(tx + sunDir.x * 120, sunDir.y * 120, tz + sunDir.z * 120);
  };

  return {
    sun, sky, update, setTimeOfDay,
    dispose: () => { envRT?.dispose(); pmrem.dispose(); }
  };
}
