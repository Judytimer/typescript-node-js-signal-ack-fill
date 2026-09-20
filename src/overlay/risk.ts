import { round } from "../math.ts";
import type { OverlayRiskDecision, OverlaySignal } from "./types.ts";

export type OverlayRiskConfig = {
  maxRiskBudget: number;
};

export class OverlayRiskManager {
  private readonly config: OverlayRiskConfig;

  constructor(config: OverlayRiskConfig) {
    if (config.maxRiskBudget <= 0) {
      throw new Error("maxRiskBudget must be positive");
    }
    this.config = config;
  }

  evaluate(signal: OverlaySignal, projectedShares: number): OverlayRiskDecision {
    if (signal.action === "HOLD") {
      return { approved: false, reason: signal.reason };
    }

    if (signal.action === "BUY_YES") {
      if (projectedShares > 0) {
        return { approved: false, reason: "projected YES exposure already exists" };
      }

      const qty = Math.floor((this.config.maxRiskBudget / signal.yesPrice) * 1_000_000) / 1_000_000;
      if (qty <= 0) {
        return { approved: false, reason: "risk budget cannot buy one share unit" };
      }

      return {
        approved: true,
        order: {
          symbol: signal.marketId,
          side: "BUY",
          qty,
          price: signal.yesPrice,
          reason: signal.reason,
          ts: signal.ts
        }
      };
    }

    if (projectedShares <= 0) {
      return { approved: false, reason: "no projected YES shares to exit" };
    }

    return {
      approved: true,
      order: {
        symbol: signal.marketId,
        side: "SELL",
        qty: round(projectedShares, 6),
        price: signal.yesPrice,
        reason: signal.reason,
        ts: signal.ts
      }
    };
  }
}
