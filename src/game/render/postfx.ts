import * as THREE from 'three/webgpu';
import {
  Fn, uniform, float, vec2, vec3, vec4, dot, mix, min, max, pow, smoothstep, length, screenUV, screenSize, pass,
} from 'three/tsl';
import { bloom } from 'three/examples/jsm/tsl/display/BloomNode.js';

/**
 * Sprint 8D — scene-linear colour grade, lens bloom and vignette in one TSL RenderPipeline.
 *
 * The grade (exposure → white balance → split-tone → contrast around mid-grey → saturation/vibrance →
 * vignette) and the peak-limited bloom are adapted from Slop New York by Mr.doob
 * (https://github.com/mrdoob/slop-newyork, MIT License, Copyright (c) 2026 Mr.doob).
 * ACES tone mapping and the sRGB conversion run once, after this graph, inside RenderPipeline.
 */

export interface GradeLook {
  exposure: number;
  contrast: number;
  saturation: number;
  balance: [number, number, number];
  bloom: number;
  threshold: number;
}

/** Dhaka looks: warmer and hazier than New York; night keeps a sodium-lamp warmth. */
export const LOOKS: Record<'golden' | 'midday' | 'twilight' | 'night', GradeLook> = {
  golden:   { exposure: 1.04, contrast: 1.12, saturation: 1.10, balance: [1.05, 1.00, 0.95], bloom: 0.24, threshold: 1.20 },
  midday:   { exposure: 1.00, contrast: 1.10, saturation: 1.06, balance: [1.02, 1.00, 0.98], bloom: 0.18, threshold: 1.35 },
  twilight: { exposure: 1.06, contrast: 1.10, saturation: 1.08, balance: [1.03, 0.995, 1.01], bloom: 0.28, threshold: 1.05 },
  night:    { exposure: 1.30, contrast: 1.08, saturation: 1.06, balance: [1.00, 0.99, 1.02], bloom: 0.32, threshold: 0.95 },
};

export class GamePipeline {
  readonly pipeline: THREE.RenderPipeline;
  private exposure = uniform(1.0);
  private contrast = uniform(1.0);
  private saturation = uniform(1.0);
  private balance = uniform(new THREE.Vector3(1, 1, 1));
  private withBloom: ReturnType<typeof vec4>;
  private withoutBloom: ReturnType<typeof vec4>;
  private bloomOn = true;
  private bloomPass: ReturnType<typeof bloom>;

  constructor(renderer: THREE.WebGPURenderer, scene: THREE.Scene, camera: THREE.Camera) {
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    const scenePass = pass(scene, camera);
    const sceneColor = scenePass.getTextureNode('output');

    const exposed = max(sceneColor.rgb, vec3(0)).mul(this.exposure).mul(this.balance);
    // Limit only bloom's peak radiance (RGB together) so lamp and sign colours survive.
    const peak = max(max(exposed.r, exposed.g), exposed.b);
    const bloomInput = vec4(exposed.mul(float(8.0).div(max(peak, 8.0))), 1.0);
    this.bloomPass = bloom(bloomInput, 0.24, 0.40, 1.20);
    this.bloomPass.smoothWidth.value = 0.30;
    this.bloomPass.setResolutionScale(0.5);

    const grade = (useBloom: boolean) => Fn(() => {
      const color = (useBloom ? exposed.add(this.bloomPass.rgb) : exposed).toVar();
      const luma = dot(color, vec3(0.2126, 0.7152, 0.0722)).toVar();
      // Cool shadows / warm highlights, multiplied so blacks are not lifted.
      const shadows = mix(vec3(0.965, 1.005, 1.045), vec3(1), smoothstep(0.02, 0.60, luma));
      const highlights = mix(vec3(1), vec3(1.035, 1.005, 0.965), smoothstep(0.60, 3.0, luma));
      color.mulAssign(shadows.mul(highlights));
      // Contrast pivots on middle grey and scales RGB together (no hue shifts).
      color.mulAssign(pow(max(luma, 0.0001).div(0.18), this.contrast.sub(1.0)));
      const gray = dot(color, vec3(0.2126, 0.7152, 0.0722));
      const top = max(max(color.r, color.g), color.b);
      const chroma = top.sub(min(min(color.r, color.g), color.b));
      const vibrance = float(0.10).mul(float(1).sub(chroma.div(max(top, 0.0001))));
      color.assign(max(mix(vec3(gray), color, this.saturation.add(vibrance)), vec3(0)));
      // Subtle lens falloff, normalised so portrait phones and landscape monitors match.
      const aspect = screenSize.x.div(screenSize.y);
      const radius = length(screenUV.sub(0.5).mul(vec2(aspect, 1))).div(length(vec2(aspect, 1).mul(0.5)));
      const vignette = float(1).sub(smoothstep(0.35, 1.0, radius).mul(0.12));
      return vec4(color.mul(vignette), 1.0);
    })();
    this.withBloom = grade(true);
    this.withoutBloom = grade(false);

    this.pipeline = new THREE.RenderPipeline(renderer, this.withBloom);
    this.setLook(LOOKS.midday);
  }

  /** Blend between two looks (t = 0 → a, 1 → b). */
  setLook(a: GradeLook, b: GradeLook = a, t = 0) {
    const l = (x: number, y: number) => x + (y - x) * t;
    this.exposure.value = l(a.exposure, b.exposure);
    this.contrast.value = l(a.contrast, b.contrast);
    this.saturation.value = l(a.saturation, b.saturation);
    this.balance.value.set(l(a.balance[0], b.balance[0]), l(a.balance[1], b.balance[1]), l(a.balance[2], b.balance[2]));
    this.bloomPass.strength.value = l(a.bloom, b.bloom);
    this.bloomPass.threshold.value = l(a.threshold, b.threshold);
  }

  /** Low quality drops the bloom passes entirely (the grade stays). */
  setBloomEnabled(on: boolean) {
    if (on === this.bloomOn) return;
    this.bloomOn = on;
    this.pipeline.outputNode = on ? this.withBloom : this.withoutBloom;
    this.pipeline.needsUpdate = true;
  }

  render() { this.pipeline.render(); }

  dispose() { this.pipeline.dispose(); }
}
