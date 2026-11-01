import { Obstacle } from '../collision';

export const STREETS = [-80, -40, 0, 40, 80];
export const ROAD_HALF = 6.5;
export const PAVEMENT_OUTER = 9.5;

export function overlapsRoad(x0: number, x1: number, z0: number, z1: number): boolean {
  return STREETS.some(
    (n) => (x0 < n + ROAD_HALF && x1 > n - ROAD_HALF) || (z0 < n + ROAD_HALF && z1 > n - ROAD_HALF)
  );
}

export function nearJunction(v: number, clearance: number): boolean {
  return STREETS.some((n) => Math.abs(v - n) < clearance);
}

export function auditObstacles(obstacles: Obstacle[]): void {
  for (const obs of obstacles) {
    let x0: number, x1: number, z0: number, z1: number;
    if (obs.type === 'circle') {
      const r = obs.radius ?? 0;
      x0 = obs.x - r;
      x1 = obs.x + r;
      z0 = obs.z - r;
      z1 = obs.z + r;
    } else {
      const hw = obs.hw ?? 0;
      const hd = obs.hd ?? 0;
      x0 = obs.x - hw;
      x1 = obs.x + hw;
      z0 = obs.z - hd;
      z1 = obs.z + hd;
    }

    if (obs.tag === 'metro_pillar' && !nearJunction(obs.x, 10.75)) {
      continue;
    }

    if (overlapsRoad(x0, x1, z0, z1)) {
      console.warn(`[layout] ${obs.tag ?? obs.type} at (${obs.x}, ${obs.z}) is on a road`);
    }
  }
}
