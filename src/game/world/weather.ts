import * as THREE from 'three';
import type { LightingRig } from '../render/lighting';

export type WeatherType = 'sunny' | 'rainy' | 'foggy';

export interface WeatherProfile {
  type: WeatherType;
  label: string;
  bnNotice: string;
  fogDensity: number;
  fogColor: string;
  sunMultiplier: number;
  cloudCover: number;
  traction: number;       // 0..1 grip level displayed in HUD & used for drift/braking
  accelGrip: number;      // multiplier on speed damping lambda (lower = more slide/longer braking)
  turnGrip: number;       // multiplier on steering turn rate
  speedMultiplier: number;
  visibilityFactor: number; // multiplier on sight distance (1.0 = clear, 0.58 = dense fog)
  rainIntensity: number;
}

export const WEATHER_PROFILES: Record<WeatherType, WeatherProfile> = {
  sunny: {
    type: 'sunny',
    label: 'Sunny · রোদেলা',
    bnNotice: 'রোদ উঠেছে — রাস্তা শুকনো ও পরিষ্কার (Clear visibility & full traction)',
    fogDensity: 0.0055,
    fogColor: '#cdd3cc',
    sunMultiplier: 1.0,
    cloudCover: 0.47,
    traction: 1.0,
    accelGrip: 1.0,
    turnGrip: 1.0,
    speedMultiplier: 1.0,
    visibilityFactor: 1.0,
    rainIntensity: 0
  },
  rainy: {
    type: 'rainy',
    label: 'Rainy · বৃষ্টি',
    bnNotice: 'ঝুম বৃষ্টি শুরু হয়েছে — রাস্তা পিচ্ছিল, সাবধানে চালান! (Wet roads: low traction)',
    fogDensity: 0.0145,
    fogColor: '#7c8a94',
    sunMultiplier: 0.42,
    cloudCover: 0.24,
    traction: 0.55,
    accelGrip: 0.42,
    turnGrip: 0.78,
    speedMultiplier: 0.9,
    visibilityFactor: 0.76,
    rainIntensity: 1.0
  },
  foggy: {
    type: 'foggy',
    label: 'Foggy · কুয়াশা',
    bnNotice: 'ঘন কুয়াশা নামছে — দৃষ্টিসীমা অনেক কমে গেছে! (Low visibility & damp roads)',
    fogDensity: 0.0285,
    fogColor: '#b6c0c2',
    sunMultiplier: 0.52,
    cloudCover: 0.3,
    traction: 0.82,
    accelGrip: 0.76,
    turnGrip: 0.9,
    speedMultiplier: 0.95,
    visibilityFactor: 0.58,
    rainIntensity: 0
  }
};

const WEATHER_ORDER: WeatherType[] = ['sunny', 'rainy', 'foggy'];
const _targetFogColor = new THREE.Color();
const _currentFogColor = new THREE.Color('#cdd3cc');

export class WeatherSystem {
  private scene: THREE.Scene;
  private lighting: LightingRig | null;

  current: WeatherType = 'sunny';
  private timer: number = 45; // seconds until next weather shift

  // Smoothly interpolated live parameters
  fogDensity: number = WEATHER_PROFILES.sunny.fogDensity;
  sunMultiplier: number = WEATHER_PROFILES.sunny.sunMultiplier;
  cloudCover: number = WEATHER_PROFILES.sunny.cloudCover;
  traction: number = WEATHER_PROFILES.sunny.traction;
  accelGrip: number = WEATHER_PROFILES.sunny.accelGrip;
  turnGrip: number = WEATHER_PROFILES.sunny.turnGrip;
  speedMultiplier: number = WEATHER_PROFILES.sunny.speedMultiplier;
  visibilityFactor: number = WEATHER_PROFILES.sunny.visibilityFactor;
  rainIntensity: number = 0;

  // Rain particle system (zero per-frame GC allocation)
  private rainLines: THREE.LineSegments;
  private rainMat: THREE.LineBasicMaterial;
  private rainPositions: Float32Array;
  private rainSpeeds: Float32Array;
  private readonly dropCount = 520;

  constructor(scene: THREE.Scene, lighting: LightingRig | null) {
    this.scene = scene;
    this.lighting = lighting;

    // Pre-allocate 3D falling rain streaks
    this.rainPositions = new Float32Array(this.dropCount * 6);
    this.rainSpeeds = new Float32Array(this.dropCount);

    for (let i = 0; i < this.dropCount; i++) {
      const rx = (Math.random() - 0.5) * 56;
      const ry = Math.random() * 24;
      const rz = (Math.random() - 0.5) * 56;
      const idx = i * 6;
      this.rainPositions[idx] = rx;
      this.rainPositions[idx + 1] = ry;
      this.rainPositions[idx + 2] = rz;
      this.rainPositions[idx + 3] = rx - 0.18;
      this.rainPositions[idx + 4] = ry - 1.15;
      this.rainPositions[idx + 5] = rz + 0.1;
      this.rainSpeeds[i] = 17 + Math.random() * 7;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.rainPositions, 3));

    this.rainMat = new THREE.LineBasicMaterial({
      color: 0xc8def0,
      transparent: true,
      opacity: 0,
      depthWrite: false
    });

    this.rainLines = new THREE.LineSegments(geo, this.rainMat);
    this.rainLines.frustumCulled = false;
    this.rainLines.visible = false;
    this.scene.add(this.rainLines);
  }

  get profile(): WeatherProfile {
    return WEATHER_PROFILES[this.current];
  }

  reset(): void {
    this.setWeather('sunny', true);
    this.timer = 42 + Math.random() * 18;
  }

  setWeather(next: WeatherType, immediate = false): WeatherProfile {
    this.current = next;
    this.timer = 45 + Math.random() * 22;
    const p = WEATHER_PROFILES[next];

    if (immediate) {
      this.fogDensity = p.fogDensity;
      this.sunMultiplier = p.sunMultiplier;
      this.cloudCover = p.cloudCover;
      this.traction = p.traction;
      this.accelGrip = p.accelGrip;
      this.turnGrip = p.turnGrip;
      this.speedMultiplier = p.speedMultiplier;
      this.visibilityFactor = p.visibilityFactor;
      this.rainIntensity = p.rainIntensity;
      _currentFogColor.set(p.fogColor);
      this.applyEnvironment();
    }

    return p;
  }

  cycleNext(): WeatherProfile {
    const idx = WEATHER_ORDER.indexOf(this.current);
    const next = WEATHER_ORDER[(idx + 1) % WEATHER_ORDER.length];
    return this.setWeather(next, false);
  }

  /**
   * Advances the weather timer, interpolates fog/sky/traction parameters,
   * and animates falling rain around (playerX, playerZ).
   * Returns the new WeatherProfile if a periodic transition occurred on this tick.
   */
  update(dt: number, playerX: number, playerZ: number): WeatherProfile | null {
    let transitioned: WeatherProfile | null = null;

    this.timer -= dt;
    if (this.timer <= 0) {
      // Pick a different weather condition weighted naturally for Dhaka
      const candidates = WEATHER_ORDER.filter((w) => w !== this.current);
      const next = candidates[Math.floor(Math.random() * candidates.length)];
      transitioned = this.setWeather(next, false);
    }

    const target = WEATHER_PROFILES[this.current];
    const rate = 1.4;

    this.fogDensity = THREE.MathUtils.damp(this.fogDensity, target.fogDensity, rate, dt);
    this.sunMultiplier = THREE.MathUtils.damp(this.sunMultiplier, target.sunMultiplier, rate, dt);
    this.cloudCover = THREE.MathUtils.damp(this.cloudCover, target.cloudCover, rate, dt);
    this.traction = THREE.MathUtils.damp(this.traction, target.traction, rate * 1.5, dt);
    this.accelGrip = THREE.MathUtils.damp(this.accelGrip, target.accelGrip, rate * 1.5, dt);
    this.turnGrip = THREE.MathUtils.damp(this.turnGrip, target.turnGrip, rate * 1.5, dt);
    this.speedMultiplier = THREE.MathUtils.damp(this.speedMultiplier, target.speedMultiplier, rate * 1.5, dt);
    this.visibilityFactor = THREE.MathUtils.damp(this.visibilityFactor, target.visibilityFactor, rate, dt);
    this.rainIntensity = THREE.MathUtils.damp(this.rainIntensity, target.rainIntensity, rate * 1.8, dt);

    _targetFogColor.set(target.fogColor);
    _currentFogColor.lerp(_targetFogColor, 1 - Math.exp(-rate * dt));

    this.applyEnvironment();
    this.updateRain(dt, playerX, playerZ);

    return transitioned;
  }

  private applyEnvironment(): void {
    const fog = this.scene.fog as THREE.FogExp2 | null;
    if (fog && fog.isFogExp2) {
      fog.density = this.fogDensity;
      fog.color.copy(_currentFogColor);
    }

    if (this.lighting) {
      // Base mid-afternoon sun intensity at 38° is ~2.47, scaled by user brightness setting
      const b = typeof this.lighting.getBrightness === 'function' ? this.lighting.getBrightness() : 1;
      this.lighting.sun.intensity = 2.47 * this.sunMultiplier * b;
      const cloudMat = this.lighting.clouds.material as THREE.ShaderMaterial;
      if (cloudMat?.uniforms?.uCover) {
        cloudMat.uniforms.uCover.value = this.cloudCover;
      }
    }
  }

  private updateRain(dt: number, playerX: number, playerZ: number): void {
    if (this.rainIntensity <= 0.02) {
      this.rainLines.visible = false;
      return;
    }

    this.rainLines.visible = true;
    this.rainMat.opacity = Math.min(0.62, this.rainIntensity * 0.58);
    this.rainLines.position.set(playerX, 0, playerZ);

    const pos = this.rainPositions;
    for (let i = 0; i < this.dropCount; i++) {
      const idx = i * 6;
      const fall = this.rainSpeeds[i] * dt;
      let y = pos[idx + 1] - fall;
      let x = pos[idx] - 2.6 * dt; // slight monsoon wind slant

      if (y < 0.1) {
        y = 21 + Math.random() * 4;
        x = (Math.random() - 0.5) * 56;
        pos[idx + 2] = (Math.random() - 0.5) * 56;
      }

      pos[idx] = x;
      pos[idx + 1] = y;
      pos[idx + 3] = x - 0.18;
      pos[idx + 4] = y - 1.15;
      pos[idx + 5] = pos[idx + 2] + 0.1;
    }

    const attr = this.rainLines.geometry.getAttribute('position') as THREE.BufferAttribute;
    attr.needsUpdate = true;
  }

  dispose(): void {
    this.scene.remove(this.rainLines);
    this.rainLines.geometry.dispose();
    this.rainMat.dispose();
  }
}
