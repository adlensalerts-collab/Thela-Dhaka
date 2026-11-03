/**
 * Solo-vendor working-day clock and daily profit accounting rules (Sprint G1).
 *
 * - Working day runs from 06:00 to 22:00 (16 game hours) over 720 seconds of active play
 *   (1 game hour = 45 real seconds).
 * - Profit target on Day 1 is ৳600; later days follow Math.round(600 * 1.35 ** (dayNumber - 1)).
 * - Fixed daily costs settled once at 22:00: ৳50 cart rent + ৳40 food = ৳90.
 * - Opening wallet cash (৳250) is never counted as income.
 */

export const DAY_START_MINUTES = 6 * 60; // 06:00 (360 minutes)
export const DAY_END_MINUTES = 22 * 60; // 22:00 (1320 minutes)
export const DAY_TOTAL_MINUTES = DAY_END_MINUTES - DAY_START_MINUTES; // 960 minutes (16 game hours)
export const DAY_DURATION_SECONDS = 720; // 16 game hours * 45 real seconds/hour

export const DAY_RENT_COST = 50; // ৳50 daily cart rent
export const DAY_FOOD_COST = 40; // ৳40 daily vendor food
export const DAY_FIXED_COST = DAY_RENT_COST + DAY_FOOD_COST; // ৳90 total fixed daily cost

export const DAY_OPENING_CASH = 250;
export const DAY_OPENING_STOCK = 10;
export const DAY_OPENING_CAP = 10;

export interface DayAccountingInput {
  earned: number;
  spentRestock: number;
  spentRepair: number;
  spentBribes: number;
  spentCartUpgrades: number;
  spentStaminaUpgrades: number;
  spentRent: number;
  spentFood: number;
}

export function normalizeDayNumber(dayNumber?: number): number {
  if (typeof dayNumber !== 'number' || !Number.isFinite(dayNumber) || dayNumber < 1) {
    return 1;
  }
  return Math.floor(dayNumber);
}

export function getDayProfitTarget(dayNumber: number): number {
  const d = normalizeDayNumber(dayNumber);
  return Math.round(600 * Math.pow(1.35, d - 1));
}

export function clampDayElapsedSeconds(elapsedSeconds: number): number {
  if (typeof elapsedSeconds !== 'number' || !Number.isFinite(elapsedSeconds) || elapsedSeconds <= 0) {
    return 0;
  }
  return Math.min(DAY_DURATION_SECONDS, elapsedSeconds);
}

export function getDayClockMinutes(elapsedSeconds: number): number {
  const clamped = clampDayElapsedSeconds(elapsedSeconds);
  if (clamped >= DAY_DURATION_SECONDS) {
    return DAY_END_MINUTES;
  }
  return DAY_START_MINUTES + Math.floor((clamped / DAY_DURATION_SECONDS) * DAY_TOTAL_MINUTES);
}

export function formatDayClock(elapsedSeconds: number): string {
  const totalMinutes = getDayClockMinutes(elapsedSeconds);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

export function isDayComplete(elapsedSeconds: number): boolean {
  return typeof elapsedSeconds === 'number' && Number.isFinite(elapsedSeconds) && elapsedSeconds >= DAY_DURATION_SECONDS;
}

export function computeOperationalExpenses(acc: Omit<DayAccountingInput, 'earned' | 'spentRent' | 'spentFood'>): number {
  return (
    acc.spentRestock +
    acc.spentRepair +
    acc.spentBribes +
    acc.spentCartUpgrades +
    acc.spentStaminaUpgrades
  );
}

export function computeTotalExpenses(acc: Omit<DayAccountingInput, 'earned'>): number {
  return computeOperationalExpenses(acc) + acc.spentRent + acc.spentFood;
}

export function computeDayProfit(acc: DayAccountingInput): number {
  return acc.earned - computeTotalExpenses(acc);
}

/**
 * Live HUD net profit for solo vendor includes the pending ৳90 rent + food before 22:00
 * settlement so that closing costs never turn a displayed HUD pass into a surprise failure.
 */
export function computeLiveHudProfit(acc: DayAccountingInput, dayCostsSettled: boolean): number {
  const settledProfit = computeDayProfit(acc);
  return dayCostsSettled ? settledProfit : settledProfit - DAY_FIXED_COST;
}

export function evaluateDayOutcome(
  profit: number,
  dayNumber: number
): { target: number; passed: boolean; result: 'day_passed' | 'day_failed' } {
  const target = getDayProfitTarget(dayNumber);
  const passed = profit >= target;
  return {
    target,
    passed,
    result: passed ? 'day_passed' : 'day_failed'
  };
}
