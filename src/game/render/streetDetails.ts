import * as THREE from 'three';
import type { District, XZ } from '../map/district';
import type { RoadGraph } from '../map/roadGraph';

export interface DrainGrate { x: number; z: number; yaw: number }

function inRing(x: number, z: number, ring: XZ[]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}

/** Flush drain covers on actual footpath surfaces, clear of service rings and spawn.
 * Positions follow the road graph but every corner is checked against the clipped OSM
 * footpath polygons too, so a graph offset cannot put a cover inside a building.
 */
export function collectDrainGrates(district: District, roads: RoadGraph): DrainGrate[] {
  const surfaces = district.surfaces.footpath.map((poly) => ({
    poly,
    minX: Math.min(...poly.outer.map((p) => p[0])), maxX: Math.max(...poly.outer.map((p) => p[0])),
    minZ: Math.min(...poly.outer.map((p) => p[1])), maxZ: Math.max(...poly.outer.map((p) => p[1]))
  }));
  const onPaving = (x: number, z: number) => !roads.isOnCarriageway(x, z) && surfaces.some((s) =>
    x >= s.minX && x <= s.maxX && z >= s.minZ && z <= s.maxZ &&
    inRing(x, z, s.poly.outer) && !s.poly.holes.some((h) => inRing(x, z, h)));
  const services = [...district.sites.garages, ...district.sites.aarots, ...district.sites.stalls];
  const result: DrainGrate[] = [];
  for (const road of district.roads) {
    if (road.footpath < 1.4) continue;
    for (let i = 1; i < road.points.length; i++) {
      const [x0, z0] = road.points[i - 1], [x1, z1] = road.points[i];
      const length = Math.hypot(x1 - x0, z1 - z0);
      if (length < 20) continue;
      const tx = (x1 - x0) / length, tz = (z1 - z0) / length;
      const nx = tz, nz = -tx;
      for (let along = 12; along < length - 6; along += 42) {
        for (const side of [-1, 1]) {
          const offset = road.width / 2 + 0.7;
          const x = x0 + tx * along + nx * offset * side;
          const z = z0 + tz * along + nz * offset * side;
          if (district.sites.spawn && Math.hypot(x - district.sites.spawn[0], z - district.sites.spawn[1]) < 8) continue;
          if (services.some((s) => Math.hypot(x - s.entrance[0], z - s.entrance[1]) < 8)) continue;
          if (result.some((g) => Math.hypot(g.x - x, g.z - z) < 16)) continue;
          const samples = [-0.325, 0, 0.325].flatMap((across) => [-0.475, 0, 0.475].map((forward) =>
            [x + nx * across + tx * forward, z + nz * across + tz * forward]));
          if (!samples.every(([px, pz]) => onPaving(px, pz))) continue;
          result.push({ x, z, yaw: Math.atan2(tx, tz) });
          if (result.length >= 120) return result;
        }
      }
    }
  }
  return result;
}

/** Worn edges and sparse flakes; stripes retain a solid readable centre.
 * Uses the existing instanced marking batch, with no texture or extra draw pass.
 */
export function createStreetPaint() {
  const material = new THREE.MeshStandardMaterial({ color: '#ece4c2', roughness: 0.85, alphaTest: 0.5 });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = `varying vec2 vStreetUv; varying vec3 vStreetPosition;\n${shader.vertexShader}`;
    shader.vertexShader = shader.vertexShader.replace('#include <worldpos_vertex>', /* glsl */ `
      #include <worldpos_vertex>
      vStreetUv = uv;
      vec4 streetPosition = vec4(transformed, 1.0);
      #ifdef USE_INSTANCING
        streetPosition = instanceMatrix * streetPosition;
      #endif
      vStreetPosition = (modelMatrix * streetPosition).xyz;
    `);
    shader.fragmentShader = `varying vec2 vStreetUv; varying vec3 vStreetPosition;\n${shader.fragmentShader}`;
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', /* glsl */ `
      #include <color_fragment>
      float streetGrain = fract(sin(dot(floor(vStreetPosition.xz * 18.0), vec2(127.1, 311.7))) * 43758.5453);
      float streetEdge = min(min(vStreetUv.x, 1.0 - vStreetUv.x), min(vStreetUv.y, 1.0 - vStreetUv.y));
      // Keep dark drain plates intact; only the light road paint flakes away.
      float streetLight = step(0.5, max(diffuseColor.r, max(diffuseColor.g, diffuseColor.b)));
      float streetChip = step(streetEdge, 0.025 + streetGrain * 0.025);
      float streetFlake = step(0.985, streetGrain);
      diffuseColor.a *= 1.0 - streetLight * max(streetChip, streetFlake);
      diffuseColor.rgb *= 0.90 + streetGrain * 0.10;
    `);
  };
  material.customProgramCacheKey = () => 'street-paint-8c-v1';
  return material;
}
