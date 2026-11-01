export interface StaminaLevelInfo {
  sprintSeconds: number;
  recoveryMultiplier: number;
  cost: number | null;
}

export const STAMINA_LEVELS: Record<number, StaminaLevelInfo> = {
  1: { sprintSeconds: 6, recoveryMultiplier: 1.0, cost: null },
  2: { sprintSeconds: 8.5, recoveryMultiplier: 1.2, cost: 150 },
  3: { sprintSeconds: 11, recoveryMultiplier: 1.4, cost: 260 },
  4: { sprintSeconds: 13.5, recoveryMultiplier: 1.6, cost: 400 },
  5: { sprintSeconds: 16, recoveryMultiplier: 1.8, cost: 600 }
};

export class StaminaSystem {
  stamina = 100;
  level = 1;
  exhausted = false;

  get sprintSeconds(): number {
    return STAMINA_LEVELS[this.level]?.sprintSeconds ?? 6;
  }

  get recoveryMultiplier(): number {
    return STAMINA_LEVELS[this.level]?.recoveryMultiplier ?? 1.0;
  }

  get speedFactor(): number {
    return this.exhausted ? 0.75 : 1;
  }

  get nextUpgradeCost(): number | null {
    const next = STAMINA_LEVELS[this.level + 1];
    return next ? next.cost : null;
  }

  update(dt: number, wantsSprint: boolean, isMovingForward: boolean, isMoving: boolean): boolean {
    const canSprint = wantsSprint && isMovingForward && !this.exhausted && this.stamina > 0;
    if (canSprint) {
      this.stamina -= (100 / this.sprintSeconds) * dt;
      if (this.stamina <= 0) {
        this.stamina = 0;
        this.exhausted = true;
      }
    } else {
      const rate = (isMoving ? 12 : 20) * this.recoveryMultiplier;
      this.stamina = Math.min(100, this.stamina + rate * dt);
      if (this.exhausted && this.stamina >= 35) {
        this.exhausted = false;
      }
    }
    return canSprint;
  }

  upgrade(cash: number): number {
    const cost = this.nextUpgradeCost;
    if (cost === null || cash < cost) {
      return -1;
    }
    this.level += 1;
    this.stamina = 100;
    this.exhausted = false;
    return cost;
  }

  reset(initialLevel = 1): void {
    this.stamina = 100;
    this.level = initialLevel;
    this.exhausted = false;
  }
}
