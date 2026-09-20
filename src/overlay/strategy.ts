import type { OverlaySignal, ResearchSnapshot } from "./types.ts";

export type OverlayStrategyConfig = {
  spotRiseTriggerPct: number;
  exitYesPrice: number;
};

export class MemePredictionOverlayStrategy {
  private initialSpotPrice: number | null = null;
  private hasEntered = false;
  private readonly config: OverlayStrategyConfig;

  constructor(config: OverlayStrategyConfig) {
    if (config.spotRiseTriggerPct <= 0) {
      throw new Error("spotRiseTriggerPct must be positive");
    }
    if (config.exitYesPrice <= 0 || config.exitYesPrice > 1) {
      throw new Error("exitYesPrice must be in (0, 1]");
    }
    this.config = config;
  }

  onSnapshot(snapshot: ResearchSnapshot, projectedShares: number): OverlaySignal {
    validateYesPrice(snapshot.prediction.yesPrice);
    this.initialSpotPrice ??= snapshot.meme.spotPrice;

    const base = {
      marketId: snapshot.prediction.marketId,
      yesPrice: snapshot.prediction.yesPrice,
      ts: snapshot.ts
    };

    if (snapshot.prediction.yesPrice >= this.config.exitYesPrice) {
      return projectedShares > 0
        ? { ...base, action: "SELL_YES", reason: "YES price reached exit threshold" }
        : { ...base, action: "HOLD", reason: "exit threshold reached without YES shares" };
    }

    if (projectedShares > 0) {
      return { ...base, action: "HOLD", reason: "YES exposure already exists" };
    }

    if (this.hasEntered) {
      return { ...base, action: "HOLD", reason: "overlay trade cycle already completed" };
    }

    const risePct = snapshot.meme.spotPrice / this.initialSpotPrice - 1;
    if (risePct < this.config.spotRiseTriggerPct) {
      return { ...base, action: "HOLD", reason: "meme rise threshold not reached" };
    }

    if (snapshot.prediction.targetFdv <= snapshot.meme.fdv) {
      return { ...base, action: "HOLD", reason: "prediction target FDV is not higher" };
    }

    this.hasEntered = true;
    return {
      ...base,
      action: "BUY_YES",
      reason: "meme rose and higher FDV target is available"
    };
  }
}

function validateYesPrice(price: number): void {
  if (price <= 0 || price > 1) {
    throw new Error("yesPrice must be in (0, 1]");
  }
}
