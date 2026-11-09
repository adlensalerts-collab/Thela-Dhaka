import { campaignDistrict, campaignTarget } from './campaign';

export interface DifficultyProfile {
  readonly dayNumber: number;
  readonly policeCount: number;
  readonly policeVision: number;
  readonly trafficCount: number;
  readonly traffic: 'Light' | 'Medium' | 'Heavy' | 'Very heavy';
  /** Hook for Sprint 15; G3 does not activate the dormant crowd-rage implementation. */
  readonly rageMultiplier: number;
  readonly rageSensitivity: 'Low' | 'Medium' | 'High';
  readonly customerPatience: number;
  readonly patrolRoutes: boolean;
}

// Game-design §4. Traffic counts and rage multipliers make qualitative tiers explicit.
const ANCHORS = [
  { day: 1, police: 2, vision: 25, traffic: 24, rage: 1, patience: 20 },
  { day: 3, police: 3, vision: 30, traffic: 36, rage: 1, patience: 18 },
  { day: 5, police: 4, vision: 35, traffic: 36, rage: 1.25, patience: 16 },
  { day: 6, police: 5, vision: 35, traffic: 48, rage: 1.25, patience: 15 },
  { day: 8, police: 6, vision: 40, traffic: 48, rage: 1.5, patience: 13 },
  { day: 10, police: 7, vision: 45, traffic: 60, rage: 1.5, patience: 12 },
] as const;

export function difficultyForDay(dayNumber: number): DifficultyProfile {
  campaignTarget(dayNumber); // Same input contract as Campaign; reject corrupt days.
  const day = Math.min(10, dayNumber); // Endless increases targets, with bounded simulation cost.
  const upper = ANCHORS.find((a) => a.day >= day)!;
  const lower = [...ANCHORS].reverse().find((a) => a.day <= day)!;
  const fraction = upper.day === lower.day ? 0 : (day - lower.day) / (upper.day - lower.day);
  const lerp = (a: number, b: number) => a + (b - a) * fraction;
  const trafficCount = Math.round(lerp(lower.traffic, upper.traffic));
  const rageMultiplier = lerp(lower.rage, upper.rage);
  return Object.freeze({
    dayNumber,
    policeCount: Math.min(7, Math.round(lerp(lower.police, upper.police))),
    policeVision: lerp(lower.vision, upper.vision),
    trafficCount,
    traffic: trafficCount < 30 ? 'Light' : trafficCount < 42 ? 'Medium' : trafficCount < 54 ? 'Heavy' : 'Very heavy',
    rageMultiplier,
    rageSensitivity: rageMultiplier < 1.125 ? 'Low' : rageMultiplier < 1.375 ? 'Medium' : 'High',
    customerPatience: lerp(lower.patience, upper.patience),
    patrolRoutes: day >= 3,
  });
}

export function dayBriefing(dayNumber: number) {
  return Object.freeze({
    dayNumber, district: campaignDistrict(dayNumber), target: campaignTarget(dayNumber),
    difficulty: difficultyForDay(dayNumber),
  });
}
