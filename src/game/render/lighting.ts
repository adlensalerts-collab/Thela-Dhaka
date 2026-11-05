import * as THREE from 'three/webgpu';
import {
  Fn, float, vec3, vec4, uniform, mix, fog, pmremTexture, positionWorld, cameraPosition, length, normalize, max, exp,
  abs, select,
} from 'three/tsl';
import { SkyMesh } from 'three/examples/jsm/objects/SkyMesh.js';
import { SunLight } from 'three/examples/jsm/lights/SunLight.js';
import { SunLightNode } from 'three/examples/jsm/lights/SunLightNode.js';
import { LOOKS, type GradeLook } from './postfx';
import { interiorGlow, streetLamps } from './windows';
import { QUALITY_PRESETS } from './quality';
import { loadDisplaySettings } from './display';

/**
 * Sprint 8D — lighting rebuilt on WebGPURenderer, in the style of Slop New York
 * (https://github.com/mrdoob/slop-newyork, MIT License, Copyright (c) 2026 Mr.doob):
 *  - SkyMesh: physical Preetham sky with volumetric clouds (replaces Sky + the old cloud disc).
 *  - SunLight: two shadow cascades fitted to the camera every frame (sharp near, cheap far).
 *  - The same sky baked through PMREM into scene.environment (image-based light + reflections).
 *  - Aerial perspective fog: distant buildings fade into the sky colour of their own direction,
 *    so the haze glows toward the sun. Density and weather tint still come from scene.fog (WeatherSystem).
 *  - Time-of-day keyframes for Dhaka's 06:00–22:00 working day: dawn, golden, midday, golden, twilight, night.
 */

interface Preset {
  sunElevation: number;   // degrees above horizon (light direction; at night this is the moon)
  sunAzimuth: number;     // degrees
  sunColor: THREE.Color;
  sunIntensity: number;
  hemiSky: THREE.Color;
  hemiGround: THREE.Color;
  hemiIntensity: number;
  envIntensity: number;
  turbidity: number;
  rayleigh: number;
  mieCoefficient: number;
  mieDirectionalG: number;
  skyExposure: number;
  nightFactor: number;
  look: GradeLook;
}

const c = (hex: number) => new THREE.Color(hex);

// Hour → preset. Dhaka is hazier than New York (higher turbidity, warmer bounce from brick and dust).
const KEYS: Array<[number, Preset]> = [
  [5.5, { sunElevation: 7, sunAzimuth: 95, sunColor: c(0xff9a6a), sunIntensity: 2.2, hemiSky: c(0x52689a), hemiGround: c(0x6a5048),
    hemiIntensity: 1.1, envIntensity: 0.4, turbidity: 10, rayleigh: 3.2, mieCoefficient: 0.010, mieDirectionalG: 0.9,
    skyExposure: 0.17, nightFactor: 0.2, look: LOOKS.twilight }],
  [7.5, { sunElevation: 18, sunAzimuth: 105, sunColor: c(0xffc890), sunIntensity: 5.2, hemiSky: c(0x9ab6dc), hemiGround: c(0xc08a62),
    hemiIntensity: 1.35, envIntensity: 0.5, turbidity: 9, rayleigh: 2.8, mieCoefficient: 0.009, mieDirectionalG: 0.88,
    skyExposure: 0.145, nightFactor: 0, look: LOOKS.golden }],
  [12, { sunElevation: 62, sunAzimuth: 175, sunColor: c(0xfff3e2), sunIntensity: 6.4, hemiSky: c(0xa8c8ec), hemiGround: c(0xb69476),
    hemiIntensity: 1.5, envIntensity: 0.55, turbidity: 8, rayleigh: 2.4, mieCoefficient: 0.007, mieDirectionalG: 0.86,
    skyExposure: 0.14, nightFactor: 0, look: LOOKS.midday }],
  [15.5, { sunElevation: 34, sunAzimuth: 235, sunColor: c(0xffe2bc), sunIntensity: 5.9, hemiSky: c(0xa2c0e4), hemiGround: c(0xbe8e68),
    hemiIntensity: 1.45, envIntensity: 0.54, turbidity: 8.5, rayleigh: 2.6, mieCoefficient: 0.008, mieDirectionalG: 0.87,
    skyExposure: 0.145, nightFactor: 0, look: LOOKS.midday }],
  [17.3, { sunElevation: 9, sunAzimuth: 252, sunColor: c(0xffb072), sunIntensity: 4.6, hemiSky: c(0x8eaad6), hemiGround: c(0xc4845a),
    hemiIntensity: 1.25, envIntensity: 0.48, turbidity: 9.5, rayleigh: 3.0, mieCoefficient: 0.010, mieDirectionalG: 0.9,
    skyExposure: 0.148, nightFactor: 0, look: LOOKS.golden }],
  [18.6, { sunElevation: 7, sunAzimuth: 258, sunColor: c(0xff8a5c), sunIntensity: 2.6, hemiSky: c(0x5c78b0), hemiGround: c(0x7e5a48),
    hemiIntensity: 1.15, envIntensity: 0.42, turbidity: 10, rayleigh: 3.4, mieCoefficient: 0.010, mieDirectionalG: 0.9,
    skyExposure: 0.17, nightFactor: 0.25, look: LOOKS.twilight }],
  [20, { sunElevation: 48, sunAzimuth: 140, sunColor: c(0x9ab6e6), sunIntensity: 1.6, hemiSky: c(0x34466e), hemiGround: c(0x6a4a34),
    hemiIntensity: 1.25, envIntensity: 0.32, turbidity: 4, rayleigh: 1.5, mieCoefficient: 0.004, mieDirectionalG: 0.8,
    skyExposure: 0.022, nightFactor: 0.86, look: LOOKS.night }],
];

export interface LightingRig {
  sun: SunLight;
  sky: SkyMesh;
  update(target: THREE.Vector3, camera: THREE.Vector3): void;
  /** Game clock hour (fractional, 0–24). Re-bakes the environment only when the light visibly changes. */
  setHour(hour: number): void;
  /** Call once after `await renderer.init()`: bakes the environment map and installs the aerial fog. */
  rendererReady(): void;
  /** Legacy: fixed sun position (keeps the current preset's colours). */
  setTimeOfDay(elevationDeg: number, azimuthDeg?: number): void;
  /** Quality: volumetric clouds and sky-coloured aerial fog are the two per-pixel costs that can be switched off. */
  setFeatures(features: { clouds: boolean; aerialFog: boolean }): void;
  /** WeatherSystem: overcast/rain dimming and cloud amount (its cover value: lower = more clouds). */
  setWeather(sunMultiplier: number, cloudCover: number): void;
  /** Colour-grade blend for the current hour (GamePipeline.setLook). */
  look(): { a: GradeLook; b: GradeLook; t: number };
  /** 1 = default. Clamped to 0.3–2.0. */
  setBrightness(multiplier: number): void;
  getBrightness(): number;
  dispose(): void;
}

const ENV_SCALE = 1.0;

export function setupRealisticLighting(renderer: THREE.WebGPURenderer, scene: THREE.Scene): LightingRig {
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;

  renderer.library.addLight(SunLightNode, SunLight);

  let brightness = 1;
  let sunMultiplier = 1;
  let hour = 15;
  let bakedHour = -99;
  let current: Preset = KEYS[3][1];
  let lookBlend = { a: current.look, b: current.look, t: 0 };

  // Sky dome. SkyMesh draws at the far plane, so its size only has to contain the camera.
  const sky = new SkyMesh();
  sky.scale.setScalar(400);
  sky.cloudScale.value = 0.0006;      // the game camera sits ~10 m up; NYC's 0.00018 was for a 13 km city
  sky.cloudSpeed.value = 0.00004;
  sky.cloudElevation.value = 0.5;
  const skyExposure = uniform(0.145);
  const nightFactor = uniform(0.0);
  const nightSky = uniform(new THREE.Color(0x0b1528));
  const rawSky = sky.material.colorNode as unknown as ReturnType<typeof vec4>;
  sky.material.colorNode = Fn(() => vec4(mix(rawSky.rgb.mul(skyExposure), nightSky, nightFactor), float(1.0)))();
  scene.add(sky);
  scene.background = null;

  const sun = new SunLight(0xfff1dc, 6);
  sun.castShadow = true;
  // Sized once (the light node builds its render target at first use): 1024 on Low/Medium starts, 2048 on High/Ultra.
  const shadowSize = Math.max(1024, QUALITY_PRESETS[loadDisplaySettings().quality]?.shadowMapSize ?? 2048);
  sun.shadow.mapSize.set(shadowSize, shadowSize);
  sun.shadow.camera.near = 0.5;
  sun.shadow.camera.far = 180;      // street-level view distance; near cascade ends ~45 m
  sun.shadow.normalBias = 0.05;
  scene.add(sun);

  const hemi = new THREE.HemisphereLight(0x9abbe6, 0xc88a62, 1.3);
  hemi.position.set(0, 300, 0);
  scene.add(hemi);

  // Environment bake (sky only, no sun disc), reusing one render target.
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  let envRT: THREE.RenderTarget | null = null;

  // Aerial fog: density and weather colour come from scene.fog, which WeatherSystem keeps updating.
  if (!scene.fog) scene.fog = new THREE.FogExp2('#cdd3cc', 0.0055);
  const fogDensity = uniform(0.0055);
  const fogTint = uniform(new THREE.Color('#cdd3cc'));
  const fogTintMix = uniform(0.0);
  const fogLevel = uniform(1.0);

  let backendReady = false;
  let cloudsOn = true;
  let aerialOn = true;
  let cloudTarget = 0.4;
  const horizon = uniform(new THREE.Color(0xc8d0d4));
  // Cheap fog for Low/Medium: flat haze colour that follows the hour and weather (no environment lookup).
  const flatFog = () => {
    const dist = length(positionWorld.sub(cameraPosition));
    const tau = fogDensity.mul(dist);
    const tint = mix(horizon.mul(fogLevel), fogTint.mul(fogLevel), fogTintMix);
    return fog(tint, float(1.0).sub(exp(tau.mul(tau).negate())));
  };
  let aerialNode: ReturnType<typeof fog> | null = null;
  let flatNode: ReturnType<typeof fog> | null = null;
  const installFog = () => {
    if (!backendReady) return;
    if (aerialOn) { aerialNode ??= aerialFog(); scene.fogNode = aerialNode; }
    else { flatNode ??= flatFog(); scene.fogNode = flatNode; }
  };

  const bake = () => {
    if (!backendReady) return;   // PMREM needs an initialised backend; rendererReady() bakes once it is.
    sky.showSunDisc.value = 0;
    envScene.add(sky);
    envRT = pmrem.fromScene(envScene as unknown as THREE.Scene, 0, 0.1, 100, { renderTarget: envRT } as never) as THREE.RenderTarget;
    scene.environment = envRT.texture;
    sky.showSunDisc.value = 1;
    scene.add(sky);
    if (!scene.fogNode) installFog();
  };

  const aerialFog = () => {
    const toFrag = positionWorld.sub(cameraPosition);
    const dist = length(toFrag);
    const dir = toFrag.div(max(dist, 0.001));
    const horizonDir = normalize(vec3(dir.x, max(dir.y, 0.015), dir.z));
    const skyColor = pmremTexture(envRT!.texture, horizonDir, float(0.0)).rgb;
    // Haze thins with height (H = 220 m) so rooftops stay clearer than the street canyon.
    const H = float(220.0);
    const ya = max(positionWorld.y, 0.0), yb = max(cameraPosition.y, 0.0);
    const dy = yb.sub(ya);
    const ea = exp(ya.div(H).negate()), eb = exp(yb.div(H).negate());
    const meanDensity = select(abs(dy).greaterThan(1.0), ea.sub(eb).mul(H).div(dy), ea);
    const tau = fogDensity.mul(dist).mul(meanDensity);
    const tint = mix(skyColor.mul(fogLevel), fogTint.mul(fogLevel), fogTintMix);
    return fog(tint, float(1.0).sub(exp(tau.mul(tau).negate())));
  };

  const sunDir = new THREE.Vector3();
  const applySun = () => {
    sun.intensity = current.sunIntensity * sunMultiplier;
    hemi.intensity = current.hemiIntensity * (0.75 + 0.25 * sunMultiplier);
    scene.environmentIntensity = current.envIntensity * ENV_SCALE;
    renderer.toneMappingExposure = brightness;
  };

  const placeSun = (elevationDeg: number, azimuthDeg: number) => {
    const phi = THREE.MathUtils.degToRad(90 - elevationDeg);
    const theta = THREE.MathUtils.degToRad(azimuthDeg);
    sunDir.setFromSphericalCoords(1, phi, theta);
    sun.position.copy(sunDir);
    sun.updateMatrixWorld();
    sky.sunPosition.value.copy(sunDir);
  };

  const blendPreset = (h: number): Preset => {
    if (h <= KEYS[0][0]) return KEYS[0][1];
    if (h >= KEYS[KEYS.length - 1][0]) return KEYS[KEYS.length - 1][1];
    let i = 0;
    while (i < KEYS.length - 2 && h > KEYS[i + 1][0]) i++;
    const [h0, a] = KEYS[i], [h1, b] = KEYS[i + 1];
    const t = THREE.MathUtils.smoothstep(h, h0, h1);
    const n = (x: number, y: number) => x + (y - x) * t;
    // After dusk the light source becomes the moon: jump its direction instead of sweeping below the ground.
    const moonJump = b.nightFactor > 0.5 && a.nightFactor < 0.5;
    lookBlend = { a: a.look, b: b.look, t };
    return {
      sunElevation: moonJump ? (t < 0.5 ? a.sunElevation * (1 - t * 2) : b.sunElevation * (t * 2 - 1)) : n(a.sunElevation, b.sunElevation),
      sunAzimuth: moonJump ? (t < 0.5 ? a.sunAzimuth : b.sunAzimuth) : n(a.sunAzimuth, b.sunAzimuth),
      sunColor: a.sunColor.clone().lerp(b.sunColor, t),
      sunIntensity: moonJump ? Math.abs(1 - t * 2) * (t < 0.5 ? a.sunIntensity : b.sunIntensity) : n(a.sunIntensity, b.sunIntensity),
      hemiSky: a.hemiSky.clone().lerp(b.hemiSky, t),
      hemiGround: a.hemiGround.clone().lerp(b.hemiGround, t),
      hemiIntensity: n(a.hemiIntensity, b.hemiIntensity),
      envIntensity: n(a.envIntensity, b.envIntensity),
      turbidity: n(a.turbidity, b.turbidity),
      rayleigh: n(a.rayleigh, b.rayleigh),
      mieCoefficient: n(a.mieCoefficient, b.mieCoefficient),
      mieDirectionalG: n(a.mieDirectionalG, b.mieDirectionalG),
      skyExposure: n(a.skyExposure, b.skyExposure),
      nightFactor: n(a.nightFactor, b.nightFactor),
      look: t < 0.5 ? a.look : b.look,
    };
  };

  const applyPreset = (p: Preset) => {
    current = p;
    placeSun(Math.max(0.5, p.sunElevation), p.sunAzimuth);
    sun.color.copy(p.sunColor);
    hemi.color.copy(p.hemiSky);
    hemi.groundColor.copy(p.hemiGround);
    sky.turbidity.value = p.turbidity;
    sky.rayleigh.value = p.rayleigh;
    sky.mieCoefficient.value = p.mieCoefficient;
    sky.mieDirectionalG.value = p.mieDirectionalG;
    skyExposure.value = p.skyExposure;
    nightFactor.value = p.nightFactor;
    // Weather fog colour is a daylight colour; dim it with the sky so storms at night stay dark.
    fogLevel.value = 1 - p.nightFactor * 0.85;
    interiorGlow.value = THREE.MathUtils.clamp(p.nightFactor / 0.8, 0, 1);
    horizon.value.copy(p.hemiSky).lerp(new THREE.Color(0xd8d0c4), 0.45).multiplyScalar(1 - 0.8 * p.nightFactor);
    streetLamps.value = THREE.MathUtils.smoothstep(p.nightFactor, 0.12, 0.5);
    applySun();
  };

  let appliedHour = -99;
  const setHour = (h: number) => {
    hour = h;
    // ~45 real seconds per game hour. Sun, sky and colours update every 5 game minutes (uniforms only);
    // the environment map (6 sky renders + blur) is re-baked only every 30 game minutes (~22 s) — perf.
    if (Math.abs(h - appliedHour) < 1 / 12) return;
    appliedHour = h;
    applyPreset(blendPreset(h));
    if (Math.abs(h - bakedHour) >= 0.5) { bakedHour = h; bake(); }
  };

  setHour(hour);

  const update = (target: THREE.Vector3, camera: THREE.Vector3) => {
    sky.position.copy(camera);
    const f = scene.fog as THREE.FogExp2 | null;
    if (f && (f as THREE.FogExp2).isFogExp2) {
      fogDensity.value = f.density;
      fogTint.value.copy(f.color);
      // Clear weather (0.0055) uses the sky's own horizon colour; mist and rain blend in their grey.
      fogTintMix.value = THREE.MathUtils.clamp((f.density - 0.0065) / 0.009, 0, 0.85);
    }
    void target;
  };

  return {
    sun, sky, update, setHour,
    rendererReady: () => { backendReady = true; bakedHour = -99; appliedHour = -99; setHour(hour); },
    setTimeOfDay: (elevationDeg, azimuthDeg = 215) => { placeSun(elevationDeg, azimuthDeg); bake(); },
    setFeatures: (f) => {
      cloudsOn = f.clouds;
      sky.cloudCoverage.value = cloudsOn ? cloudTarget : 0;
      if (aerialOn !== f.aerialFog) { aerialOn = f.aerialFog; installFog(); }
    },
    setWeather: (multiplier, cloudCover) => {
      sunMultiplier = multiplier;
      cloudTarget = THREE.MathUtils.clamp(1.17 - 1.7 * cloudCover, 0, 1);
      sky.cloudCoverage.value = cloudsOn ? cloudTarget : 0;
      sky.cloudDensity.value = 0.35 + 0.3 * (1 - multiplier);
      applySun();
    },
    look: () => lookBlend,
    setBrightness: (m) => { brightness = THREE.MathUtils.clamp(m, 0.3, 2.0); applySun(); },
    getBrightness: () => brightness,
    dispose: () => {
      envRT?.dispose(); pmrem.dispose(); sun.dispose(); scene.remove(sky, sun, hemi);
      sky.geometry.dispose(); sky.material.dispose(); scene.fogNode = null;
    },
  };
}
