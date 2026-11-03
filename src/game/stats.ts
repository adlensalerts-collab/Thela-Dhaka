import {
  DAY_FOOD_COST,
  DAY_RENT_COST,
  clampDayElapsedSeconds,
  computeDayProfit,
  computeLiveHudProfit,
  computeTotalExpenses,
  formatDayClock,
  getDayProfitTarget,
  normalizeDayNumber
} from './day';
import type { CampaignResult } from './campaign';

export type RunResult =
  | 'jailed'
  | 'bribe_unaffordable'
  | 'destroyed'
  | 'mob_beaten'
  | 'victory'
  | 'day_passed'
  | 'day_failed'
  | 'bankrupt'
  | null;
export type RunMode = 'vendor' | 'police' | 'online_vendor' | 'online_police';

export interface BestSaleRecord {
  product: string;
  price: number;
}

export interface RunStats {
  // Money
  earned: number;
  spentRestock: number;
  spentRepair: number;
  spentBribes: number;
  spentCartUpgrades: number;
  spentStaminaUpgrades: number;
  spentRent: number;
  spentFood: number;
  profit: number;

  // Selling
  itemsSold: number;
  salesByProduct: Record<string, number>;
  bestSale: BestSaleRecord | null;
  salesInterrupted: number;

  // Trouble
  chasesStarted: number;
  chasesEscaped: number;
  timesCaught: number;
  bribesPaid: number;
  collisions: number;
  damageTaken: number;
  pedestriansHit: number;

  // Movement
  distanceMetres: number;
  sprintSeconds: number;

  // Run
  timePlayedSeconds: number;
  cartLevel: number;
  staminaLevel: number;
  dayNumber: number;
  dayTarget: number;
  dayElapsedSeconds: number;
  dayClockText: string;
  dayPassed: boolean;
  dayCostsSettled: boolean;
  mode: RunMode;
  result: RunResult;
  campaignResult?: CampaignResult | null;

  // Police mode
  arrests: number;

  // Grouped views for structured access
  money: {
    earned: number;
    spentRestock: number;
    spentRepair: number;
    spentBribes: number;
    spentCartUpgrades: number;
    spentStaminaUpgrades: number;
    spentRent: number;
    spentFood: number;
    totalSpent: number;
    profit: number;
  };
  selling: {
    itemsSold: number;
    salesByProduct: Record<string, number>;
    bestSale: BestSaleRecord | null;
    salesInterrupted: number;
  };
  trouble: {
    chasesStarted: number;
    chasesEscaped: number;
    timesCaught: number;
    bribesPaid: number;
    collisions: number;
    damageTaken: number;
    pedestriansHit: number;
  };
  movement: {
    distanceMetres: number;
    sprintSeconds: number;
  };
  run: {
    timePlayedSeconds: number;
    cartLevel: number;
    staminaLevel: number;
    dayNumber: number;
    dayTarget: number;
    dayElapsedSeconds: number;
    dayClockText: string;
    dayPassed: boolean;
    dayCostsSettled: boolean;
    mode: RunMode;
    result: RunResult;
  };
}

export class StatsTracker {
  earned = 0;
  spentRestock = 0;
  spentRepair = 0;
  spentBribes = 0;
  spentCartUpgrades = 0;
  spentStaminaUpgrades = 0;
  spentRent = 0;
  spentFood = 0;
  dayCostsSettled = false;

  itemsSold = 0;
  salesByProduct: Record<string, number> = {};
  bestSale: BestSaleRecord | null = null;
  salesInterrupted = 0;

  chasesStarted = 0;
  chasesEscaped = 0;
  timesCaught = 0;
  bribesPaid = 0;
  collisions = 0;
  damageTaken = 0;
  pedestriansHit = 0;

  distanceMetres = 0;
  sprintSeconds = 0;

  timePlayedSeconds = 0;
  cartLevel = 1;
  staminaLevel = 1;
  dayNumber = 1;
  dayTarget = getDayProfitTarget(1);
  dayElapsedSeconds = 0;
  dayClockText = formatDayClock(0);
  mode: RunMode = 'vendor';
  result: RunResult = null;
  campaignResult: CampaignResult | null = null;

  arrests = 0;

  reset(mode: RunMode = 'vendor', dayNumber = 1) {
    this.earned = 0;
    this.spentRestock = 0;
    this.spentRepair = 0;
    this.spentBribes = 0;
    this.spentCartUpgrades = 0;
    this.spentStaminaUpgrades = 0;
    this.spentRent = 0;
    this.spentFood = 0;
    this.dayCostsSettled = false;

    this.itemsSold = 0;
    this.salesByProduct = {};
    this.bestSale = null;
    this.salesInterrupted = 0;

    this.chasesStarted = 0;
    this.chasesEscaped = 0;
    this.timesCaught = 0;
    this.bribesPaid = 0;
    this.collisions = 0;
    this.damageTaken = 0;
    this.pedestriansHit = 0;

    this.distanceMetres = 0;
    this.sprintSeconds = 0;

    this.timePlayedSeconds = 0;
    this.cartLevel = 1;
    this.staminaLevel = mode === 'vendor' || mode === 'online_vendor' ? 1 : 3;
    this.dayNumber = normalizeDayNumber(dayNumber);
    this.dayTarget = getDayProfitTarget(this.dayNumber);
    this.dayElapsedSeconds = 0;
    this.dayClockText = formatDayClock(0);
    this.mode = mode;
    this.result = null;
    this.campaignResult = null;

    this.arrests = 0;
  }

  recordSale(product: string, price: number) {
    this.earned += price;
    this.itemsSold += 1;
    this.salesByProduct[product] = (this.salesByProduct?.[product] ?? 0) + 1;
    if (!this.bestSale || price > this.bestSale.price) {
      this.bestSale = { product, price };
    }
  }

  /**
   * Settle daily fixed costs (rent + food) at most once per working day.
   * Returns true if settled on this call, false if already settled.
   */
  settleDayCosts(rent = DAY_RENT_COST, food = DAY_FOOD_COST): boolean {
    if (this.dayCostsSettled) {
      return false;
    }
    this.dayCostsSettled = true;
    this.spentRent += rent;
    this.spentFood += food;
    return true;
  }

  currentTotalSpent(): number {
    return computeTotalExpenses(this);
  }

  currentProfit(): number {
    return computeDayProfit(this);
  }

  liveHudProfit(): number {
    return computeLiveHudProfit(this, this.dayCostsSettled);
  }

  snapshot(
    overrides?: Partial<
      Pick<
        RunStats,
        | 'cartLevel'
        | 'staminaLevel'
        | 'dayNumber'
        | 'dayTarget'
        | 'dayElapsedSeconds'
        | 'dayClockText'
        | 'mode'
        | 'result'
        | 'campaignResult'
        | 'arrests'
      >
    >
  ): RunStats {
    if (overrides?.cartLevel !== undefined) this.cartLevel = overrides.cartLevel;
    if (overrides?.staminaLevel !== undefined) this.staminaLevel = overrides.staminaLevel;
    if (overrides?.dayNumber !== undefined) {
      this.dayNumber = normalizeDayNumber(overrides.dayNumber);
      this.dayTarget = getDayProfitTarget(this.dayNumber);
    }
    if (overrides?.dayTarget !== undefined) this.dayTarget = overrides.dayTarget;
    if (overrides?.dayElapsedSeconds !== undefined) {
      this.dayElapsedSeconds = clampDayElapsedSeconds(overrides.dayElapsedSeconds);
      this.dayClockText = formatDayClock(this.dayElapsedSeconds);
    }
    if (overrides?.dayClockText !== undefined) {
      this.dayClockText = overrides.dayClockText;
    }
    if (overrides?.mode !== undefined) this.mode = overrides.mode;
    if (overrides?.result !== undefined) this.result = overrides.result;
    if (overrides?.campaignResult !== undefined) {
      this.campaignResult = overrides.campaignResult ?? null;
    }
    if (overrides?.arrests !== undefined) this.arrests = overrides.arrests;

    const totalSpent = this.currentTotalSpent();
    const profit = this.currentProfit();
    const dayPassed = this.result === 'day_passed' || this.result === 'victory';
    const salesByProductCopy = { ...this.salesByProduct };
    const bestSaleCopy = this.bestSale ? { ...this.bestSale } : null;

    return {
      earned: this.earned,
      spentRestock: this.spentRestock,
      spentRepair: this.spentRepair,
      spentBribes: this.spentBribes,
      spentCartUpgrades: this.spentCartUpgrades,
      spentStaminaUpgrades: this.spentStaminaUpgrades,
      spentRent: this.spentRent,
      spentFood: this.spentFood,
      profit,

      itemsSold: this.itemsSold,
      salesByProduct: salesByProductCopy,
      bestSale: bestSaleCopy,
      salesInterrupted: this.salesInterrupted,

      chasesStarted: this.chasesStarted,
      chasesEscaped: this.chasesEscaped,
      timesCaught: this.timesCaught,
      bribesPaid: this.bribesPaid,
      collisions: this.collisions,
      damageTaken: this.damageTaken,
      pedestriansHit: this.pedestriansHit,

      distanceMetres: this.distanceMetres,
      sprintSeconds: this.sprintSeconds,

      timePlayedSeconds: this.timePlayedSeconds,
      cartLevel: this.cartLevel,
      staminaLevel: this.staminaLevel,
      dayNumber: this.dayNumber,
      dayTarget: this.dayTarget,
      dayElapsedSeconds: this.dayElapsedSeconds,
      dayClockText: this.dayClockText,
      dayPassed,
      dayCostsSettled: this.dayCostsSettled,
      mode: this.mode,
      result: this.result,
      campaignResult: this.campaignResult,

      arrests: this.arrests,

      money: {
        earned: this.earned,
        spentRestock: this.spentRestock,
        spentRepair: this.spentRepair,
        spentBribes: this.spentBribes,
        spentCartUpgrades: this.spentCartUpgrades,
        spentStaminaUpgrades: this.spentStaminaUpgrades,
        spentRent: this.spentRent,
        spentFood: this.spentFood,
        totalSpent,
        profit
      },
      selling: {
        itemsSold: this.itemsSold,
        salesByProduct: { ...salesByProductCopy },
        bestSale: bestSaleCopy ? { ...bestSaleCopy } : null,
        salesInterrupted: this.salesInterrupted
      },
      trouble: {
        chasesStarted: this.chasesStarted,
        chasesEscaped: this.chasesEscaped,
        timesCaught: this.timesCaught,
        bribesPaid: this.bribesPaid,
        collisions: this.collisions,
        damageTaken: this.damageTaken,
        pedestriansHit: this.pedestriansHit
      },
      movement: {
        distanceMetres: this.distanceMetres,
        sprintSeconds: this.sprintSeconds
      },
      run: {
        timePlayedSeconds: this.timePlayedSeconds,
        cartLevel: this.cartLevel,
        staminaLevel: this.staminaLevel,
        dayNumber: this.dayNumber,
        dayTarget: this.dayTarget,
        dayElapsedSeconds: this.dayElapsedSeconds,
        dayClockText: this.dayClockText,
        dayPassed,
        dayCostsSettled: this.dayCostsSettled,
        mode: this.mode,
        result: this.result
      }
    };
  }
}

