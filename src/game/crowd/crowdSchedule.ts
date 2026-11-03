/**
 * Sprint 10 — crowd density and hotspot pull by time of day (game-design §2).
 * Pure functions: no three.js, no randomness. Times are minutes after midnight (06:00 = 360).
 */

export type HotspotKind =
  | 'junction' | 'marketplace' | 'mall' | 'department_store'
  | 'college' | 'university' | 'school' | 'stadium' | string;

/** [startMinute, activeFraction] key points; linear between them. 06:00 → 22:00 working day. */
const DENSITY: Array<[number, number]> = [
  [6 * 60, 0.45],
  [8 * 60, 0.85],   // office rush
  [10 * 60, 0.8],
  [11 * 60, 1.0],   // bazaar hour
  [13 * 60, 1.0],   // school/college release
  [14 * 60, 0.8],
  [16 * 60, 0.75],
  [17 * 60, 1.0],   // evening market
  [20 * 60, 0.95],
  [22 * 60, 0.55]   // night
];

function clampMinutes(minutes: number): number {
  if (typeof minutes !== 'number' || !Number.isFinite(minutes)) return 12 * 60;
  return Math.min(22 * 60, Math.max(6 * 60, minutes));
}

/** Share of the pedestrian pool that should be out on the street (0.45 … 1). */
export function activeFraction(minutes: number): number {
  const m = clampMinutes(minutes);
  for (let i = 1; i < DENSITY.length; i++) {
    const [m1, f1] = DENSITY[i];
    if (m <= m1) {
      const [m0, f0] = DENSITY[i - 1];
      const t = m1 === m0 ? 1 : (m - m0) / (m1 - m0);
      return Math.round((f0 + (f1 - f0) * t) * 1000) / 1000;
    }
  }
  return DENSITY[DENSITY.length - 1][1];
}

/** Named period, for debugging / HUD. */
export function crowdPeriod(minutes: number): 'early' | 'office_rush' | 'bazaar' | 'school_release' | 'afternoon' | 'evening_market' | 'night' {
  const m = clampMinutes(minutes);
  if (m < 8 * 60) return 'early';
  if (m < 10 * 60) return 'office_rush';
  if (m >= 11 * 60 && m < 13 * 60) return 'bazaar';
  if (m >= 13 * 60 && m < 14 * 60) return 'school_release';
  if (m >= 17 * 60 && m < 20 * 60) return 'evening_market';
  if (m >= 20 * 60) return 'night';
  return 'afternoon';
}

const MARKETS = new Set(['marketplace', 'mall', 'department_store']);
const SCHOOLS = new Set(['college', 'university', 'school']);

/** Relative pull of one hotspot kind at this time (1 = normal). */
export function hotspotWeight(kind: HotspotKind, minutes: number): number {
  const period = crowdPeriod(minutes);
  const market = MARKETS.has(kind), school = SCHOOLS.has(kind), junction = kind === 'junction';
  switch (period) {
    case 'early': return junction ? 1.4 : market ? 0.5 : 0.8;
    case 'office_rush': return junction ? 2.6 : market ? 0.6 : school ? 1.3 : 1;
    case 'bazaar': return market ? 2.6 : junction ? 1 : 0.8;
    case 'school_release': return school ? 3 : market ? 1.4 : 1;
    case 'evening_market': return market ? 2.8 : junction ? 1.4 : kind === 'stadium' ? 1.2 : 0.9;
    case 'night': return market ? 1.4 : junction ? 0.8 : 0.5;
    default: return market ? 1.2 : 1;
  }
}

/** Chance that a new trip heads to a hotspot rather than a random footpath node. */
export function hotspotTripChance(minutes: number): number {
  const period = crowdPeriod(minutes);
  return period === 'bazaar' || period === 'evening_market' ? 0.6
    : period === 'office_rush' || period === 'school_release' ? 0.55
    : period === 'night' || period === 'early' ? 0.35 : 0.45;
}

/** Pick an index from weights with a supplied random number in [0, 1). Returns -1 if all weights are 0. */
export function weightedIndex(weights: number[], r: number): number {
  let total = 0;
  for (const w of weights) total += Math.max(0, w);
  if (total <= 0) return -1;
  let acc = r * total;
  for (let i = 0; i < weights.length; i++) {
    acc -= Math.max(0, weights[i]);
    if (acc < 0) return i;
  }
  return weights.length - 1;
}
