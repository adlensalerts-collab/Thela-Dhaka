/** G2: solo-vendor campaign decisions. G1 owns clock, wallet and expense settlement. */
export type CampaignFailure = 'jailed' | 'bribe_unaffordable' | 'bankrupt' | 'destroyed';
export type CampaignOutcome = 'day_passed' | 'day_failed' | 'victory' | CampaignFailure;
export type CampaignDistrict = 'newmarket' | 'gulistan';

export interface VendorCondition {
  cash: number;
  stock: number;
  /** Count actual sellable stock outside the cart, not merely a placed stall mesh. */
  otherSellableStock: number;
  /** Use the engine's actual refill quote (currently a full-cart purchase). */
  restockCost: number;
  damage: number;
  repairCost: number;
  pendingSale: boolean;
  pendingRestock: boolean;
  pendingRepair: boolean;
}

export interface CampaignTotals {
  readonly daysSurvived: number;
  readonly daysPassed: number;
  readonly levelReached: number;
  readonly totalProfit: number;
  readonly bestDayProfit: number | null;
}

export interface CampaignResult {
  readonly outcome: CampaignOutcome;
  readonly dayNumber: number;
  readonly endless: boolean;
  readonly district: CampaignDistrict;
  readonly profit: number;
  readonly target: number;
  readonly totals: Readonly<CampaignTotals>;
}

export interface CampaignState {
  readonly dayNumber: number;
  readonly endless: boolean;
  readonly district: CampaignDistrict;
  readonly target: number;
  readonly result: CampaignResult | null;
  readonly totals: Readonly<CampaignTotals>;
}

export function campaignTarget(dayNumber: number): number {
  if (!Number.isSafeInteger(dayNumber) || dayNumber < 1) {
    throw new RangeError('Day number must be a positive safe integer.');
  }
  const target = Math.round(600 * 1.35 ** (dayNumber - 1));
  if (!Number.isSafeInteger(target)) throw new RangeError('Day target exceeds supported currency range.');
  return target;
}

export function campaignDistrict(dayNumber: number): CampaignDistrict {
  campaignTarget(dayNumber);
  return dayNumber < 6 ? 'newmarket' : 'gulistan';
}

function finite(value: number, name: string, nonnegative = true) {
  if (!Number.isFinite(value) || (nonnegative && value < 0)) {
    throw new RangeError(`${name} must be finite${nonnegative ? ' and nonnegative' : ''}.`);
  }
}

/** Damage alone is recoverable; wreck defeat is checked only at closing time. */
export function vendorFailure(condition: VendorCondition, closing = false): CampaignFailure | null {
  finite(condition.cash, 'cash', false); // G1 may settle costs into a negative wallet.
  for (const key of ['stock', 'otherSellableStock', 'restockCost', 'damage', 'repairCost'] as const) {
    finite(condition[key], key);
  }
  if (closing && condition.damage >= 100 && condition.cash < condition.repairCost) {
    return 'destroyed';
  }
  if (
    condition.cash < 20 && condition.stock === 0 && condition.otherSellableStock === 0 &&
    condition.cash < condition.restockCost && !condition.pendingSale &&
    !condition.pendingRestock && !condition.pendingRepair
  ) return 'bankrupt';
  return null;
}

/**
 * One instance per solo campaign. Do not recreate on next/retry day.
 * Each completed attempt contributes profit once. Failed days can be retried
 * without increasing dayNumber; totals retain the history of those attempts.
 * daysSurvived counts nonfatal closings, including failed targets.
 */
export class Campaign {
  private dayNumber = 1;
  private endless = false;
  private result: CampaignResult | null = null;
  private totals: CampaignTotals = Object.freeze({
    daysSurvived: 0, daysPassed: 0, levelReached: 1, totalProfit: 0, bestDayProfit: null,
  });

  snapshot(): CampaignState {
    return Object.freeze({
      dayNumber: this.dayNumber, endless: this.endless,
      district: campaignDistrict(this.dayNumber), target: campaignTarget(this.dayNumber),
      result: this.result, totals: this.totals,
    });
  }

  /** Call after committed transactions, before any further movement/transactions. */
  checkFailure(condition: VendorCondition, currentProfit: number): CampaignResult | null {
    if (this.result) return this.result;
    const failure = vendorFailure(condition);
    return failure ? this.finish(failure, currentProfit) : null;
  }

  /** Call after G1 settles rent/food once and freezes the day's transactions. */
  closeDay(condition: VendorCondition, settledProfit: number): CampaignResult {
    if (this.result) return this.result;
    const failure = vendorFailure(condition, true);
    if (failure) return this.finish(failure, settledProfit);
    if (settledProfit < campaignTarget(this.dayNumber)) return this.finish('day_failed', settledProfit);
    return this.finish(!this.endless && this.dayNumber === 10 ? 'victory' : 'day_passed', settledProfit);
  }

  /** Preserve the existing distinction between choosing jail and an unaffordable bribe. */
  arrested(reason: 'jailed' | 'bribe_unaffordable', currentProfit: number): CampaignResult {
    return this.result ?? this.finish(reason, currentProfit);
  }

  nextDay(): CampaignState {
    this.requireOutcome('day_passed');
    return this.advance();
  }

  retryDay(): CampaignState {
    this.requireOutcome('day_failed');
    this.result = null;
    return this.snapshot();
  }

  startEndless(): CampaignState {
    this.requireOutcome('victory');
    campaignTarget(this.dayNumber + 1);
    this.endless = true;
    return this.advance();
  }

  private advance(): CampaignState {
    campaignTarget(this.dayNumber + 1); // Validate before changing state.
    this.dayNumber++;
    this.totals = Object.freeze({ ...this.totals, levelReached: this.dayNumber });
    this.result = null;
    return this.snapshot();
  }

  private requireOutcome(outcome: CampaignOutcome) {
    if (this.result?.outcome !== outcome) throw new Error(`Cannot continue: expected ${outcome}.`);
  }

  private finish(outcome: CampaignOutcome, profit: number): CampaignResult {
    finite(profit, 'profit', false);
    const survived = outcome === 'day_passed' || outcome === 'day_failed' || outcome === 'victory';
    const passed = outcome === 'day_passed' || outcome === 'victory';
    const totalProfit = this.totals.totalProfit + profit;
    finite(totalProfit, 'totalProfit', false);
    this.totals = Object.freeze({
      daysSurvived: this.totals.daysSurvived + Number(survived),
      daysPassed: this.totals.daysPassed + Number(passed),
      levelReached: this.dayNumber,
      totalProfit,
      bestDayProfit: this.totals.bestDayProfit === null ? profit : Math.max(this.totals.bestDayProfit, profit),
    });
    this.result = Object.freeze({
      outcome, dayNumber: this.dayNumber, endless: this.endless,
      district: campaignDistrict(this.dayNumber), profit,
      target: campaignTarget(this.dayNumber), totals: this.totals,
    });
    return this.result;
  }
}
