import { round } from "../math.ts";
import type { Fill } from "../types.ts";
import type { PredictionPosition } from "./types.ts";

export class PredictionPositionBook {
  private position: PredictionPosition;

  constructor(marketId: string) {
    this.position = {
      marketId,
      shares: 0,
      averageEntryPrice: 0,
      premiumAtRisk: 0,
      realizedPnl: 0
    };
  }

  get(): PredictionPosition {
    return { ...this.position };
  }

  applyFill(fill: Fill): PredictionPosition {
    if (fill.symbol !== this.position.marketId) {
      throw new Error(`unexpected market ${fill.symbol}`);
    }

    if (fill.side === "BUY") {
      const nextShares = round(this.position.shares + fill.qty, 6);
      const totalPremium =
        this.position.shares * this.position.averageEntryPrice + fill.qty * fill.price;
      this.position = {
        ...this.position,
        shares: nextShares,
        averageEntryPrice: round(totalPremium / nextShares),
        premiumAtRisk: round(totalPremium),
        realizedPnl: round(this.position.realizedPnl - fill.fee)
      };
      return this.get();
    }

    if (fill.qty > this.position.shares) {
      throw new Error("cannot sell more YES shares than held");
    }

    const nextShares = round(this.position.shares - fill.qty, 6);
    const realizedPnl =
      this.position.realizedPnl +
      fill.qty * (fill.price - this.position.averageEntryPrice) -
      fill.fee;
    this.position = {
      ...this.position,
      shares: nextShares,
      averageEntryPrice: nextShares === 0 ? 0 : this.position.averageEntryPrice,
      premiumAtRisk: round(nextShares * this.position.averageEntryPrice),
      realizedPnl: round(realizedPnl)
    };
    return this.get();
  }
}
