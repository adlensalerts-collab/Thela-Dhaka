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
 *  - Sprint 4: a drifting procedural cloud layer (fades into the haze at the horizon),
 *    and setBrightness() for the Settings brightness slider.
 *
 * Replaces initLights(). Call update(playerPosition, cameraPosition) once per frame.
 */
export interface LightingRig {
  sun: THREE.DirectionalLight;
  sky: Sky;
  update(target: THREE.Vector3, camera: THREE.Vector3): void;
  setTimeOfDay(elevationDeg: number, azimuthDeg?: number): void;
  /** 1 = default. Range 0.5–1.6 is sensible; clamped to 0.3–2.0. */
  setBrightness(multiplier: number): void;
  getBrightness(): number;
  clouds: THREE.Mesh;
  dispose(): void;
}

export function setupRealisticLighting(renderer: THREE.WebGLRenderer, scene: THREE.Scene): LightingRig {
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  const BASE_EXPOSURE = 0.85;
  renderer.toneMappingExposure = BASE_EXPOSURE;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  let brightnessMultiplier = 1.0;
  let baseSunIntensity = 2.47;

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

  // Cloud layer: a large disc high above the camera with fbm noise computed in the shader
  // (no textures to generate). Alpha fades out toward the rim so it melts into the haze
  // and never shows a hard edge against the camera far plane.
  const cloudMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide,
    uniforms: {
      uTime: { value: 0 },
      uCover: { value: 0.47 },               // lower = more clouds
      uSunDir: { value: new THREE.Vector3() },
      uOffset: { value: new THREE.Vector2() }
    },
    vertexShader: `
      varying vec2 vUv; varying vec3 vWorld;
      void main() {
        vUv = uv;
        vec4 w = modelMatrix * vec4(position, 1.0);
        vWorld = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: `
      uniform float uTime; uniform float uCover; uniform vec3 uSunDir; uniform vec2 uOffset;
      varying vec2 vUv; varying vec3 vWorld;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
      }
      float fbm(vec2 p) { float s = 0.0, a = 0.5; for (int k = 0; k < 5; k++) { s += a * noise(p); p *= 2.03; a *= 0.5; } return s; }
      void main() {
        vec2 p = (vWorld.xz + uOffset) * 0.006 + vec2(uTime * 0.004, uTime * 0.0015);
        float d = fbm(p);
        float c = smoothstep(uCover, uCover + 0.25, d);
        float shade = mix(0.72, 1.0, smoothstep(uCover, uCover + 0.5, fbm(p + 0.05)));   // darker bellies
        float rim = 1.0 - smoothstep(0.32, 0.5, length(vUv - 0.5));                       // fade to horizon
        vec3 col = mix(vec3(0.78, 0.8, 0.82), vec3(1.0, 0.98, 0.95), shade) * (0.8 + 0.25 * max(uSunDir.y, 0.0));
        gl_FragColor = vec4(col, c * rim * 0.9);
      }`
  });
  const clouds = new THREE.Mesh(new THREE.CircleGeometry(430, 48).rotateX(Math.PI / 2), cloudMat);
  clouds.renderOrder = -1;
  clouds.frustumCulled = false;
  scene.add(clouds);
  const startTime = performance.now();

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
    scene.environmentIntensity = 0.9 * brightnessMultiplier;
  };

  const setTimeOfDay = (elevationDeg: number, azimuthDeg = 215) => {
    const phi = THREE.MathUtils.degToRad(90 - elevationDeg);
    const theta = THREE.MathUtils.degToRad(azimuthDeg);
    sunDir.setFromSphericalCoords(1, phi, theta);
    u['sunPosition'].value.copy(sunDir);
    cloudMat.uniforms.uSunDir.value.copy(sunDir);
    // Warmer, dimmer sun near the horizon
    const t = THREE.MathUtils.clamp(elevationDeg / 60, 0, 1);
    sun.color.setRGB(1, 0.78 + 0.2 * t, 0.6 + 0.35 * t);
    baseSunIntensity = 1.2 + 2.0 * t;
    sun.intensity = baseSunIntensity * brightnessMultiplier;
    bakeEnvironment();
  };

  setTimeOfDay(38); // mid-afternoon

  const update = (target: THREE.Vector3, camera: THREE.Vector3) => {
    sky.position.copy(camera);
    // Clouds stay above the camera but scroll with world position so they don't "follow" you.
    clouds.position.set(camera.x, 160, camera.z);
    cloudMat.uniforms.uTime.value = (performance.now() - startTime) / 1000;
    // Snap the shadow camera to texel-sized steps to stop shadow shimmering while moving.
    const texel = (2 * S) / sun.shadow.mapSize.x;
    const tx = Math.round(target.x / texel) * texel;
    const tz = Math.round(target.z / texel) * texel;
    sun.target.position.set(tx, 0, tz);
    sun.position.set(tx + sunDir.x * 120, sunDir.y * 120, tz + sunDir.z * 120);
  };

  const setBrightness = (multiplier: number) => {
    const b = THREE.MathUtils.clamp(multiplier, 0.3, 2.0);
    brightnessMultiplier = b;
    renderer.toneMappingExposure = BASE_EXPOSURE * b;
    fill.intensity = 0.35 * b;
    scene.environmentIntensity = 0.9 * b;
    sun.intensity = baseSunIntensity * b;
    if (renderer.domElement) {
      renderer.domElement.style.filter = Math.abs(b - 1) < 0.01 ? '' : `brightness(${b})`;
    }
  };

  const getBrightness = () => brightnessMultiplier;

  return {
    sun, sky, clouds, update, setTimeOfDay, setBrightness, getBrightness,
    dispose: () => { envRT?.dispose(); pmrem.dispose(); cloudMat.dispose(); clouds.geometry.dispose(); }
  };
}
