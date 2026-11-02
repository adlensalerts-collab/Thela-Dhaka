import * as THREE from 'three';

export type WeatheredSurface = 'asphalt' | 'pavement' | 'plaster';

// World-space masks keep wear continuous across road polygons and building chunks.
// They tint the existing albedo: photo textures, PBR normals and lighting remain intact.
const MASKS = /* glsl */ `
varying vec3 vWearPosition;
float wearHash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
float wearSegment(vec2 p, vec2 a, vec2 b) {
  vec2 ab = b - a;
  return length(p - a - ab * clamp(dot(p - a, ab) / dot(ab, ab), 0.0, 1.0));
}
float wearCrack(vec2 p, vec2 cell, float seed) {
  vec2 middle = vec2(0.35 + seed * 0.3, 0.35 + wearHash(cell + 7.0) * 0.3);
  float d = min(wearSegment(p, vec2(0.16, 0.24 + seed * 0.15), middle),
                wearSegment(p, middle, vec2(0.84, 0.66 - seed * 0.12)));
  d = min(d, wearSegment(p, middle, middle + vec2(-0.12, 0.18)));
  float aa = max(fwidth(d), 0.001);
  return (1.0 - smoothstep(0.0015, 0.0015 + aa, d)) * min(1.0, 0.003 / aa);
}
`;

const ROAD = /* glsl */ `
  vec2 roadCell = floor(vWearPosition.xz / 9.0);
  vec2 roadUV = fract(vWearPosition.xz / 9.0);
  float seed = wearHash(roadCell);
  // Sparse repair patches with a thin tar seam, not reflective puddles.
  vec2 patchCentre = vec2(0.35 + seed * 0.3, 0.35 + wearHash(roadCell + 3.0) * 0.3);
  vec2 patchSize = vec2(0.10 + seed * 0.08, 0.07 + seed * 0.06);
  float patchDistance = max(abs(roadUV.x - patchCentre.x) - patchSize.x,
                            abs(roadUV.y - patchCentre.y) - patchSize.y);
  float patchAA = max(fwidth(patchDistance), 0.001);
  float repairMask = (1.0 - smoothstep(-patchAA, patchAA, patchDistance)) * step(0.63, seed);
  float seam = (1.0 - smoothstep(0.003, 0.003 + patchAA, abs(patchDistance))) * step(0.63, seed);
  float crack = wearCrack(roadUV, roadCell, seed) * (1.0 - step(0.42, seed));
  diffuseColor.rgb *= 1.0 - repairMask * 0.13 - seam * 0.16 - crack * 0.38;
`;

const PAVEMENT = /* glsl */ `
  vec2 pavingCell = floor(vWearPosition.xz / 3.5);
  vec2 pavingUV = fract(vWearPosition.xz / 3.5);
  float seed = wearHash(pavingCell + 19.0);
  float stain = (1.0 - smoothstep(0.10, 0.33, length((pavingUV - vec2(0.5)) * vec2(1.0, 1.7)))) * step(0.72, seed);
  float crack = wearCrack(pavingUV, pavingCell, seed) * (1.0 - step(0.18, seed));
  diffuseColor.rgb *= 1.0 - stain * 0.13 - crack * 0.24;
`;

const PLASTER = /* glsl */ `
  // Select the wall's horizontal axis; vertical stains never run across roofs.
  vec3 wearNormal = normalize(cross(dFdx(vWearPosition), dFdy(vWearPosition)));
  float wall = 1.0 - smoothstep(0.3, 0.7, abs(wearNormal.y));
  float across = abs(wearNormal.x) > abs(wearNormal.z) ? vWearPosition.z : vWearPosition.x;
  float stripe = floor(across * 1.4);
  float seed = wearHash(vec2(stripe, floor(vWearPosition.y / 3.2)));
  float streak = (1.0 - smoothstep(0.10, 0.38, abs(fract(across * 1.4) - 0.5))) * step(0.68, seed);
  float rain = smoothstep(0.0, 0.65, fract(vWearPosition.y / 3.2));
  diffuseColor.rgb *= 1.0 - wall * streak * rain * 0.14;
`;

/** Subtle matte wear without extra textures, geometry, draw calls or collisions. */
export function applySurfaceWear(material: THREE.MeshStandardMaterial, surface: WeatheredSurface) {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = `varying vec3 vWearPosition;\n${shader.vertexShader}`;
    shader.vertexShader = shader.vertexShader.replace('#include <worldpos_vertex>', /* glsl */ `
      #include <worldpos_vertex>
      vec4 wearPosition = vec4(transformed, 1.0);
      #ifdef USE_BATCHING
        wearPosition = batchingMatrix * wearPosition;
      #endif
      #ifdef USE_INSTANCING
        wearPosition = instanceMatrix * wearPosition;
      #endif
      vWearPosition = (modelMatrix * wearPosition).xyz;
    `);
    shader.fragmentShader = `${MASKS}\n${shader.fragmentShader}`;
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>',
      `#include <color_fragment>\n${surface === 'asphalt' ? ROAD : surface === 'pavement' ? PAVEMENT : PLASTER}`);
    // Preserve the matte road fix even if a future photo roughness map is smoother.
    if (surface === 'asphalt') {
      shader.fragmentShader = shader.fragmentShader.replace('#include <roughnessmap_fragment>',
        '#include <roughnessmap_fragment>\nroughnessFactor = max(roughnessFactor, 0.88);');
    }
  };
  material.customProgramCacheKey = () => `surface-wear-8b-v1-${surface}`;
  material.userData.surfaceWear = surface;
}
