import type { Obstacle } from '../collision';

/**
 * M3/M5 — spatial grid for static obstacles. On a real map there are thousands of obstacles;
 * resolveMovement() only needs the handful near the player:
 *   resolveMovement(x, z, vx, vz, heading, isVendor, grid.near(x, z, 4), { x: halfWidth, z: halfDepth })
 */
export class ObstacleGrid {
  private cells = new Map<string, Obstacle[]>();
  private stamp = new WeakMap<Obstacle, number>();
  private query = 0;
  readonly all: Obstacle[] = [];

  constructor(private cell = 12) {}

  private extent(o: Obstacle): [number, number, number, number] {
    if (o.type === 'circle') return [o.x - o.radius, o.x + o.radius, o.z - o.radius, o.z + o.radius];
    return [o.x - o.hw, o.x + o.hw, o.z - o.hd, o.z + o.hd];   // box and poly both carry hw/hd
  }

  add(o: Obstacle) {
    this.all.push(o);
    const [x0, x1, z0, z1] = this.extent(o);
    for (let cx = Math.floor(x0 / this.cell); cx <= Math.floor(x1 / this.cell); cx++) {
      for (let cz = Math.floor(z0 / this.cell); cz <= Math.floor(z1 / this.cell); cz++) {
        const k = `${cx},${cz}`;
        let list = this.cells.get(k);
        if (!list) this.cells.set(k, (list = []));
        list.push(o);
      }
    }
  }

  addAll(list: Obstacle[]) { for (const o of list) this.add(o); }

  /** Obstacles whose cells touch the square (x ± r, z ± r). Each obstacle returned once. */
  near(x: number, z: number, r: number): Obstacle[] {
    const out: Obstacle[] = [];
    const q = ++this.query;
    for (let cx = Math.floor((x - r) / this.cell); cx <= Math.floor((x + r) / this.cell); cx++) {
      for (let cz = Math.floor((z - r) / this.cell); cz <= Math.floor((z + r) / this.cell); cz++) {
        const list = this.cells.get(`${cx},${cz}`);
        if (!list) continue;
        for (const o of list) {
          if (this.stamp.get(o) === q) continue;
          this.stamp.set(o, q);
          out.push(o);
        }
      }
    }
    return out;
  }
}
