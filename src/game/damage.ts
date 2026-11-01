import { checkCircleVsObstacle, type BoxObstacle } from './collision';
import type { TrafficItem } from './world/traffic';

/**
 * Sprint 2 — collision damage + repair cost for the player's thela / police bike.
 *
 * Damage 0..100. Each traffic hit adds damage based on the vehicle's mass and the
 * closing speed. Damage slows the player down; at 100 the thela is "broken"
 * (cannot move faster than a crawl, cannot sell) until repaired.
 * Repair cost = damage × REPAIR_RATE × (1 + 0.15 × (level − 1)), in taka.
 */
export const REPAIR_RATE = 2.4;           // ৳ per damage point at level 1
const MIN_DAMAGE = 4;
const MAX_HIT = 35;
const HIT_COOLDOWN = 0.65;                // seconds; same feel as the old trafficHitCooldown

export interface ImpactResult {
  hit: boolean;
  vehicle?: TrafficItem;
  impactX: number;
  impactZ: number;
  impulseX: number;
  impulseZ: number;
  closingSpeed: number;
}

/**
 * Like checkTrafficImpact(), but uses each vehicle's own hitbox (hw/hd) and returns
 * the closing speed so damage can scale with how hard the hit was.
 * fwdX/fwdZ = player's unit forward vector (the same vector used for movement).
 */
export function checkVehicleImpact(
  px: number, pz: number,
  fwdX: number, fwdZ: number,
  playerSpeed: number,
  isVendor: boolean,
  traffic: TrafficItem[]
): ImpactResult {
  const bodyR = isVendor ? 0.5 : 0.6;
  // Cart is IN FRONT of the pusher (Sprint 1 orientation fix).
  const cartX = px + fwdX * 1.35, cartZ = pz + fwdZ * 1.35;

  for (const t of traffic) {
    const box: BoxObstacle = { type: 'box', x: t.mesh.position.x, z: t.mesh.position.z, hw: t.hw, hd: t.hd, tag: t.kind };
    const a = checkCircleVsObstacle(px, pz, bodyR, box);
    const b = isVendor ? checkCircleVsObstacle(cartX, cartZ, 0.95, box) : a;
    if (!a.collided && !b.collided) continue;

    const vx = t.vertical ? 0 : t.v, vz = t.vertical ? t.v : 0;
    const pvx = fwdX * playerSpeed, pvz = fwdZ * playerSpeed;
    let nx = px - box.x, nz = pz - box.z;
    const d = Math.hypot(nx, nz) || 1;
    nx /= d; nz /= d;
    // Closing speed along the contact normal (≥ 0).
    const closing = Math.max(0, (vx - pvx) * nx + (vz - pvz) * nz) + Math.hypot(vx, vz) * 0.35;

    return {
      hit: true, vehicle: t,
      impactX: (px + box.x) / 2, impactZ: (pz + box.z) / 2,
      impulseX: nx * (2.5 + t.mass * 0.6) + vx * 1.1,
      impulseZ: nz * (2.5 + t.mass * 0.6) + vz * 1.1,
      closingSpeed: closing
    };
  }
  return { hit: false, impactX: 0, impactZ: 0, impulseX: 0, impulseZ: 0, closingSpeed: 0 };
}

export class DamageSystem {
  damage = 0;
  private cooldown = 0;

  get broken() { return this.damage >= 100; }

  /** Speed multiplier for the player: 1.0 healthy → 0.6 at 99 → 0.25 when broken. */
  get speedFactor() { return this.broken ? 0.25 : 1 - this.damage * 0.004; }

  tick(dt: number) { if (this.cooldown > 0) this.cooldown -= dt; }

  /** Returns damage added (0 if still in cooldown). */
  applyImpact(impact: ImpactResult): number {
    if (!impact.hit || !impact.vehicle || this.cooldown > 0) return 0;
    this.cooldown = HIT_COOLDOWN;
    const raw = MIN_DAMAGE + impact.vehicle.mass * impact.closingSpeed * 1.6;
    const added = Math.round(Math.min(MAX_HIT, raw));
    this.damage = Math.min(100, this.damage + added);
    return added;
  }

  repairCost(level: number) {
    return Math.ceil(this.damage * REPAIR_RATE * (1 + 0.15 * (level - 1)));
  }

  /** Pays from cash if possible. Returns the amount paid, or -1 if not enough cash / nothing to repair. */
  repair(cash: number, level: number): number {
    if (this.damage <= 0) return -1;
    const cost = this.repairCost(level);
    if (cash < cost) return -1;
    this.damage = 0;
    return cost;
  }

  reset() { this.damage = 0; this.cooldown = 0; }
}
