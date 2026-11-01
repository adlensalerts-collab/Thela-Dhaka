export type RunResult = 'jailed' | 'bribe_unaffordable' | 'destroyed' | 'victory' | null;
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

  // Movement
  distanceMetres: number;
  sprintSeconds: number;

  // Run
  timePlayedSeconds: number;
  cartLevel: number;
  staminaLevel: number;
  mode: RunMode;
  result: RunResult;

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
  };
  movement: {
    distanceMetres: number;
    sprintSeconds: number;
  };
  run: {
    timePlayedSeconds: number;
    cartLevel: number;
    staminaLevel: number;
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

  distanceMetres = 0;
  sprintSeconds = 0;

  timePlayedSeconds = 0;
  cartLevel = 1;
  staminaLevel = 1;
  mode: RunMode = 'vendor';
  result: RunResult = null;

  arrests = 0;

  reset(mode: RunMode = 'vendor') {
    this.earned = 0;
    this.spentRestock = 0;
    this.spentRepair = 0;
    this.spentBribes = 0;
    this.spentCartUpgrades = 0;
    this.spentStaminaUpgrades = 0;

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

    this.distanceMetres = 0;
    this.sprintSeconds = 0;

    this.timePlayedSeconds = 0;
    this.cartLevel = 1;
    this.staminaLevel = mode === 'vendor' || mode === 'online_vendor' ? 1 : 3;
    this.mode = mode;
    this.result = null;

    this.arrests = 0;
  }

  recordSale(product: string, price: number) {
    this.earned += price;
    this.itemsSold += 1;
    this.salesByProduct[product] = (this.salesByProduct[product] ?? 0) + 1;
    if (!this.bestSale || price > this.bestSale.price) {
      this.bestSale = { product, price };
    }
  }

  snapshot(
    overrides?: Partial<Pick<RunStats, 'cartLevel' | 'staminaLevel' | 'mode' | 'result' | 'arrests'>>
  ): RunStats {
    if (overrides?.cartLevel !== undefined) this.cartLevel = overrides.cartLevel;
    if (overrides?.staminaLevel !== undefined) this.staminaLevel = overrides.staminaLevel;
    if (overrides?.mode !== undefined) this.mode = overrides.mode;
    if (overrides?.result !== undefined) this.result = overrides.result;
    if (overrides?.arrests !== undefined) this.arrests = overrides.arrests;

    const totalSpent =
      this.spentRestock +
      this.spentRepair +
      this.spentBribes +
      this.spentCartUpgrades +
      this.spentStaminaUpgrades;
    const profit = this.earned - totalSpent;
    const salesByProductCopy = { ...this.salesByProduct };
    const bestSaleCopy = this.bestSale ? { ...this.bestSale } : null;

    return {
      earned: this.earned,
      spentRestock: this.spentRestock,
      spentRepair: this.spentRepair,
      spentBribes: this.spentBribes,
      spentCartUpgrades: this.spentCartUpgrades,
      spentStaminaUpgrades: this.spentStaminaUpgrades,
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

      distanceMetres: this.distanceMetres,
      sprintSeconds: this.sprintSeconds,

      timePlayedSeconds: this.timePlayedSeconds,
      cartLevel: this.cartLevel,
      staminaLevel: this.staminaLevel,
      mode: this.mode,
      result: this.result,

      arrests: this.arrests,

      money: {
        earned: this.earned,
        spentRestock: this.spentRestock,
        spentRepair: this.spentRepair,
        spentBribes: this.spentBribes,
        spentCartUpgrades: this.spentCartUpgrades,
        spentStaminaUpgrades: this.spentStaminaUpgrades,
        profit
      },
      selling: {
        itemsSold: this.itemsSold,
        salesByProduct: salesByProductCopy,
        bestSale: bestSaleCopy,
        salesInterrupted: this.salesInterrupted
      },
      trouble: {
        chasesStarted: this.chasesStarted,
        chasesEscaped: this.chasesEscaped,
        timesCaught: this.timesCaught,
        bribesPaid: this.bribesPaid,
        collisions: this.collisions,
        damageTaken: this.damageTaken
      },
      movement: {
        distanceMetres: this.distanceMetres,
        sprintSeconds: this.sprintSeconds
      },
      run: {
        timePlayedSeconds: this.timePlayedSeconds,
        cartLevel: this.cartLevel,
        staminaLevel: this.staminaLevel,
        mode: this.mode,
        result: this.result
      }
    };
  }
}
